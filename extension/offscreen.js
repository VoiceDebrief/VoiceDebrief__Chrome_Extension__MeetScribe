// The offscreen document (brief v2.0, 4): holds both streams, keeps the meeting audible on the chosen
// device, turns each channel into 16 kHz PCM, cuts it at pauses, persists every segment before anything is
// sent, and drains the queue while it is alive. Audio never leaves this document except as a stored WAV.
import * as db from './lib/db.js';
import { Segmenter } from './lib/vad.js';
import { encodeWav, resample, SAMPLE_RATE } from './lib/wav.js';
import { drain } from './lib/queue.js';
import { BUILD } from './build.js';

let S = null;   // the running session

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

function channel(name, stream, startSample) {
  const ch = { name, stream, seq: 0, level: 0, writes: Promise.resolve() };
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
    ch.writes = ch.writes.then(() => db.addSegment(seg, encodeWav(s.int16))).catch((e) => { S && (S.errors = [...S.errors, 'store: ' + e.message]); });
  });
  ch.seg.clock = startSample;
  ch.source = S.capture.createMediaStreamSource(stream);
  ch.node = new AudioWorkletNode(S.capture, 'meetscribe-tap');
  ch.node.port.onmessage = ({ data }) => {
    const f32 = S.capture.sampleRate === SAMPLE_RATE ? data : resample(data, S.capture.sampleRate);
    let sum = 0; for (let i = 0; i < f32.length; i++) sum += f32[i] * f32[i];
    ch.level = Math.sqrt(sum / f32.length);
    if (S.paused || (name === 'mic' && S.micMuted)) ch.seg.skip(f32.length);   // not captured: the clock moves, no audio is kept
    else ch.seg.push(f32);
  };
  ch.source.connect(ch.node);
  // a worklet only runs when connected to the graph; a zero gain keeps it running and silent
  const mute = S.capture.createGain(); mute.gain.value = 0; ch.node.connect(mute).connect(S.capture.destination);
  return ch;
}

async function start(msg) {
  if (S) return { ok: false, error: 'already capturing' };
  try { return await begin(msg); }
  catch (e) {
    // leave nothing half-open: a failed start holds no stream and no context
    if (S) { clearInterval(S.levels); S.abort.abort(); for (const ch of Object.values(S.channels)) ch.stream.getTracks().forEach(t => t.stop());
             S.capture?.close().catch(() => {}); S.playback?.close().catch(() => {}); S.tab?.getTracks().forEach(t => t.stop()); S = null; }
    return { ok: false, error: e.name === 'NotAllowedError' ? 'Chrome did not allow capturing this tab (' + e.message + ')' : String(e.message || e) };
  }
}

async function begin({ streamId, meetingId, mic, micDeviceId, outputDeviceId }) {
  const tab = await tabStream(streamId);
  S = { meetingId, tab, paused: false, micMuted: false, errors: [], channels: {}, abort: new AbortController() };

  // 1. keep the meeting audible: capture silences the tab, so play it back, on the user's device if chosen
  S.playback = new AudioContext();
  if (outputDeviceId && S.playback.setSinkId) { try { await S.playback.setSinkId(outputDeviceId); } catch (e) { S.errors.push('output device: ' + e.message); } }
  S.playback.createMediaStreamSource(tab).connect(S.playback.destination);

  // 2. a 16 kHz context for the PCM taps (Chrome resamples the stream into it)
  try { S.capture = new AudioContext({ sampleRate: SAMPLE_RATE }); } catch { S.capture = new AudioContext(); }
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
  S.draining = drain('offscreen', { meetingId, signal: S.abort.signal });
  S.levels = setInterval(() => chrome.runtime.sendMessage({ target: 'ui', type: 'levels', tab: S.channels.tab?.level ?? null, mic: S.channels.mic?.level ?? null, paused: S.paused, micMuted: S.micMuted, errors: S.errors }).catch(() => {}), 250);
  return { ok: true, micError, captureRate: S.capture.sampleRate };
}

async function stop() {
  if (!S) return { ok: false };
  const s = S;
  clearInterval(s.levels);
  for (const ch of Object.values(s.channels)) {
    ch.seg.flush('stop');
    ch.source.disconnect(); ch.node.disconnect(); ch.stream.getTracks().forEach(t => t.stop());
  }
  await Promise.all(Object.values(s.channels).map(ch => ch.writes));
  await s.capture.close().catch(() => {});
  await s.playback.close().catch(() => {});
  await db.updateMeeting(s.meetingId, { status: 'draining', endedAt: new Date().toISOString(),
    vad: Object.fromEntries(Object.entries(s.channels).map(([k, ch]) => [k, { ...ch.seg.stats, samples: ch.seg.clock }])) });
  s.abort.abort();
  await s.draining;
  // drain what is left, then hand over (failed segments stay for a manual retry)
  await drain('offscreen-final', { meetingId: s.meetingId, untilEmpty: true });
  await db.updateMeeting(s.meetingId, { status: 'complete' });
  S = null;
  toSw({ type: 'finished', meetingId: s.meetingId });
  return { ok: true };
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg.target !== 'offscreen') return;
  const run = {
    start: () => start(msg),
    stop: () => { stop(); return Promise.resolve({ ok: true }); },   // answers at once; finishing is reported with 'finished'
    pause: async () => { if (!S) return { ok: false }; S.paused = !!msg.paused; await db.updateMeeting(S.meetingId, { status: S.paused ? 'paused' : 'capturing' }); return { ok: true }; },
    mic: async () => { if (!S || !S.channels.mic) return { ok: false, error: 'no microphone in this meeting' }; S.micMuted = !!msg.muted; return { ok: true }; },
  }[msg.type];
  if (!run) return;
  run().then(reply, (e) => { reply({ ok: false, error: String(e && e.message || e) }); });
  return true;
});
