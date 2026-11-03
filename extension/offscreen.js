// The offscreen document (brief v2.0, 4): holds both streams, keeps the meeting audible on the chosen
// device, turns each channel into 16 kHz PCM, cuts it at pauses, persists every segment before anything is
// sent, and drains the queue while it is alive. Audio never leaves this document except as a stored WAV.
//
// v0.3.2, after the v0.3.1 review: mute and pause gate the worklet itself (finding 02); Stop flushes the
// worklet's tail (16), hands unsent work to the service worker after a bounded wait instead of blocking the next
// meeting (04); a storage failure pauses capture and is recorded as a lost span, never swallowed (07); a
// deleted meeting stops capture and receives no more writes (01); a fixed key restarts the live drain (05).
import * as db from './lib/db.js';
import { Segmenter } from './lib/vad.js';
import { encodeWav, resample, SAMPLE_RATE } from './lib/wav.js';
import { drain } from './lib/queue.js';
import { BUILD } from './build.js';

let S = null;   // the running session
const FINAL_DRAIN_MS = 20000;   // after Stop, send for at most this long, then hand the rest to the service worker

const toSw = (msg) => chrome.runtime.sendMessage({ target: 'sw', ...msg }).catch(() => {});

async function micStream(deviceId) {
  return navigator.mediaDevices.getUserMedia({ audio: {
    ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
    echoCancellation: true, noiseSuppression: true, autoGainControl: true,
  } });
}

async function tabStream(streamId) {
  if (BUILD.test && streamId === 'test:fake') return navigator.mediaDevices.getUserMedia({ audio: true });   // Chromium's fake device stands in for a tab
  return navigator.mediaDevices.getUserMedia({ audio: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId } }, video: false });
}

const gateOf = (name) => !!(S && (S.paused || (name === 'mic' && S.micMuted)));
function applyGates() { for (const [name, ch] of Object.entries(S.channels)) ch.node.port.postMessage({ gate: gateOf(name) }); }

async function storageFailed(ch, seg, e) {
  // finding 07: the speech could not be kept. Stop capturing (both channels), record the span, say so.
  const span = { channel: ch.name, startMs: seg.startMs, endMs: seg.endMs, error: String(e && e.message || e).slice(0, 200) };
  if (!S) return;
  S.lost.push(span);
  if (!S.paused) { S.paused = true; applyGates(); }
  await db.updateMeeting(S.meetingId, (m) => ({ lostSpans: [...(m.lostSpans || []), span], status: 'paused' })).catch(() => {});
  toSw({ type: 'storage-error', error: `Speech from ${Math.round(span.startMs / 1000)} s to ${Math.round(span.endMs / 1000)} s could not be saved (${span.error}). Capture is paused: free some disk space, then Resume.` });
}

function channel(name, stream, startSample) {
  const ch = { name, stream, seq: 0, level: 0, writes: Promise.resolve(), flushed: null };
  ch.seg = new Segmenter((s) => {
    const seq = ch.seq++;
    const seg = {
      id: db.uid(`seg-${name}`), meetingId: S.meetingId, channel: name, seq,
      startSample: s.startSample, endSample: s.endSample, samples: s.int16.length,
      startMs: Math.round(s.startSample * 1000 / SAMPLE_RATE), endMs: Math.round(s.endSample * 1000 / SAMPLE_RATE),
      cut: s.cut, speechMs: s.speechMs, status: 'pending', attempts: 0, createdAt: Date.now() + seq / 1000,
      hasAudio: true, model: null, costUsd: null, lastError: null,
    };
    // persisted before any send; writes are chained so a segment is never queued before the one before it
    ch.writes = ch.writes.then(async () => {
      if (BUILD.test && S?.failStorage) throw new Error('QuotaExceededError (simulated by the test build)');
      const kept = await db.addSegment(seg, encodeWav(s.int16));
      if (!kept) toSw({ type: 'meeting-deleted', meetingId: seg.meetingId });   // finding 01: the meeting is gone
    }).catch((e) => storageFailed(ch, seg, e));
  });
  ch.seg.clock = startSample;
  ch.source = S.capture.createMediaStreamSource(stream);
  ch.node = new AudioWorkletNode(S.capture, 'meetscribe-tap');
  const toLocal = (n) => (S.capture.sampleRate === SAMPLE_RATE ? n : Math.round(n * SAMPLE_RATE / S.capture.sampleRate));
  ch.node.port.onmessage = ({ data }) => {
    if (data.flushed) { ch.flushed?.(); return; }
    if (data.skip) { ch.level = 0; ch.seg.skip(toLocal(data.skip)); return; }   // not captured: the clock moves, no audio is kept
    if (!data.pcm) return;
    const f32 = S.capture.sampleRate === SAMPLE_RATE ? data.pcm : resample(data.pcm, S.capture.sampleRate);
    let sum = 0; for (let i = 0; i < f32.length; i++) sum += f32[i] * f32[i];
    ch.level = Math.sqrt(sum / f32.length);
    ch.seg.push(f32);
  };
  ch.source.connect(ch.node);
  // a worklet only runs when connected to the graph; a zero gain keeps it running and silent
  const mute = S.capture.createGain(); mute.gain.value = 0; ch.node.connect(mute).connect(S.capture.destination);
  ch.node.port.postMessage({ gate: gateOf(name) });
  return ch;
}

function startDrain() {
  S.drainDone = false; S.held = false;
  const s = S;
  S.draining = drain('offscreen', { meetingId: s.meetingId, signal: s.abort.signal, emit: (e) => { if (e.type === 'key') s.held = true; } })
    .finally(() => { s.drainDone = true; });
}

async function start(msg) {
  if (S) return { ok: false, error: 'already capturing' };
  try { return await begin(msg); }
  catch (e) {
    await teardown();
    return { ok: false, error: e.name === 'NotAllowedError' ? 'Chrome did not allow capturing this tab (' + e.message + ')' : String(e.message || e) };
  }
}

async function begin({ streamId, meetingId, mic, micDeviceId, outputDeviceId }) {
  const tab = await tabStream(streamId);
  S = { meetingId, tab, paused: false, micMuted: false, errors: [], lost: [], channels: {}, abort: new AbortController() };

  // 1. keep the meeting audible: capture silences the tab, so play it back, on the user's device if chosen
  S.playback = new AudioContext();
  if (outputDeviceId && S.playback.setSinkId) { try { await S.playback.setSinkId(outputDeviceId); } catch (e) { S.errors.push('output device: ' + e.message); } }
  S.playback.createMediaStreamSource(tab).connect(S.playback.destination);

  // 2. a 16 kHz context for the PCM taps (Chrome resamples the stream into it)
  try { S.capture = new AudioContext({ sampleRate: SAMPLE_RATE }); } catch { S.capture = new AudioContext(); }
  // a suspended context would mean silence for the user and no audio captured: resume both, and say so if one will not run
  await Promise.all([S.playback.resume(), S.capture.resume()].map(p => p.catch(() => {})));
  if (S.playback.state !== 'running' || S.capture.state !== 'running') throw new Error(`audio would not start (playback ${S.playback.state}, capture ${S.capture.state})`);
  await S.capture.audioWorklet.addModule('worklet.js');
  S.channels.tab = channel('tab', tab, 0);
  tab.getAudioTracks()[0]?.addEventListener('ended', () => toSw({ type: 'tab-ended' }));

  // 3. the microphone, only if enabled for this meeting; refused is a warning, not a failure
  let micError = null;
  if (mic) {
    try {
      const m = await micStream(micDeviceId);
      S.channels.mic = channel('mic', m, Math.round(S.capture.currentTime * SAMPLE_RATE));
      m.getAudioTracks()[0]?.addEventListener('ended', () => toSw({ type: 'mic-error', error: 'the microphone was disconnected' }));
    } catch (e) {
      micError = e.name === 'NotAllowedError' ? 'microphone not allowed: grant it on the options page' : 'microphone: ' + e.message;
      await db.updateMeeting(meetingId, { channels: ['tab'], micError });
    }
  }

  // 4. send while capturing
  startDrain();
  S.levels = setInterval(() => chrome.runtime.sendMessage({ target: 'ui', type: 'levels', tab: S.channels.tab?.level ?? null, mic: S.channels.mic?.level ?? null, paused: S.paused, micMuted: S.micMuted, errors: S.errors }).catch(() => {}), 250);
  return { ok: true, micError, captureRate: S.capture.sampleRate };
}

/** Stop every stream and context; keep no audio in memory. Used by a failed start and by abort. */
async function teardown() {
  if (!S) return;
  const s = S; S = null;
  clearInterval(s.levels);
  s.abort.abort();
  for (const ch of Object.values(s.channels)) { try { ch.source.disconnect(); ch.node.disconnect(); } catch {} ch.stream.getTracks().forEach(t => t.stop()); }
  s.tab?.getTracks().forEach(t => t.stop());
  await s.capture?.close().catch(() => {});
  await s.playback?.close().catch(() => {});
}

/** The worklet posts what it holds and acknowledges, or we give up waiting after 500 ms. */
const flushWorklet = (ch) => new Promise((resolve) => { const t = setTimeout(resolve, 500); ch.flushed = () => { clearTimeout(t); resolve(); }; ch.node.port.postMessage({ flush: true }); });

async function stop() {
  if (!S) return { ok: false };
  const s = S;
  clearInterval(s.levels);
  await Promise.all(Object.values(s.channels).map(flushWorklet));   // finding 16: the tail is kept
  for (const ch of Object.values(s.channels)) {
    ch.seg.flush('stop');
    ch.source.disconnect(); ch.node.disconnect(); ch.stream.getTracks().forEach(t => t.stop());
  }
  s.tab.getTracks().forEach(t => t.stop());
  await Promise.all(Object.values(s.channels).map(ch => ch.writes));
  await s.capture.close().catch(() => {});
  await s.playback.close().catch(() => {});
  await db.updateMeeting(s.meetingId, { status: 'draining', endedAt: new Date().toISOString(),
    vad: Object.fromEntries(Object.entries(s.channels).map(([k, ch]) => [k, { ...ch.seg.stats, samples: ch.seg.clock }])) }).catch(() => {});
  s.abort.abort();
  await s.draining;
  // finding 04: send what is left for a bounded time, then hand over. Recording is free again either way.
  await drain('offscreen-final', { meetingId: s.meetingId, untilEmpty: true, deadline: Date.now() + FINAL_DRAIN_MS });
  await db.reconcileStatus(s.meetingId).catch(() => {});
  S = null;
  toSw({ type: 'finished', meetingId: s.meetingId });
  return { ok: true };
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg.target !== 'offscreen') return;
  const run = {
    start: () => start(msg),
    stop: () => { stop(); return Promise.resolve({ ok: true }); },   // answers at once; finishing is reported with 'finished'
    abort: async () => { await teardown(); return { ok: true }; },      // finding 01: deletion stops capture, nothing is drained
    pause: async () => { if (!S) return { ok: false }; S.paused = !!msg.paused; applyGates(); await db.updateMeeting(S.meetingId, { status: S.paused ? 'paused' : 'capturing' }); return { ok: true }; },
    mic: async () => { if (!S || !S.channels.mic) return { ok: false, error: 'no microphone in this meeting' }; S.micMuted = !!msg.muted; applyGates(); return { ok: true }; },
    // finding 05: a held drain is still winding down (its other worker may be asleep), so wait for it, then restart
    'resume-drain': async () => {
      const s = S; if (!s) return { ok: true, restarted: false };
      if (s.held || s.drainDone) { await s.draining; if (S === s && !s.abort.signal.aborted) { startDrain(); return { ok: true, restarted: true }; } }
      return { ok: true, restarted: false };
    },
    'test-fail-storage': async () => { if (BUILD.test && S) S.failStorage = !!msg.fail; return { ok: BUILD.test }; },
  }[msg.type];
  if (!run) return;
  run().then(reply, (e) => { reply({ ok: false, error: String(e && e.message || e) }); });
  return true;
});
