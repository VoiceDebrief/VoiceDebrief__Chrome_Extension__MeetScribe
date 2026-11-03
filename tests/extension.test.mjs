// The extension in Chromium. The TEST build (package.mjs --test) is loaded unpacked; Chromium's fake audio
// device plays a WAV with a known shape (speech, pauses) and stands in for both the tab and the microphone
// (the test build accepts streamId 'test:fake', because tab capture needs a click automation cannot make);
// OpenRouter is the local replay server, which records what would have been billed.
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from './helpers/pw.mjs';
import { startReplay } from './helpers/replay.mjs';
import { synth, wavFile } from './helpers/audio.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXT = path.join(ROOT, 'tests', '.build', 'extension-test');
let context, sw, replay, profile, extId, fakeWav;
const pageErrors = [];

const ev = (fn, arg) => sw.evaluate(fn, arg);
const waitFor = async (fn, arg, { timeout = 20000, every = 250, what = 'condition' } = {}) => {
  const end = Date.now() + timeout;
  for (;;) { const v = await ev(fn, arg); if (v) return v; if (Date.now() > end) throw new Error('timed out waiting for ' + what); await new Promise(r => setTimeout(r, every)); }
};
const settings = (patch) => ev((p) => chrome.storage.local.set(p), patch);
// a valid one-second WAV segment written straight into the queue, as the offscreen document would
const queueSegment = (meetingId, i, opts = {}) => ev(async ({ meetingId, i, opts }) => {
  const f = new Float32Array(16000); for (let k = 0; k < f.length; k++) f[k] = 0.2 * Math.sin(2 * Math.PI * (200 + i * 37) * k / 16000);
  const pcm = ms.floatToInt16(f);
  const wav = opts.garbage ? new Uint8Array(200).fill(7, 4).map((v, k) => k < 4 ? [0x1f, 0x43, 0xb6, 0x75][k] : v) : ms.encodeWav(pcm);
  const seg = { id: `${meetingId}-s${i}`, meetingId, channel: 'tab', seq: i, startSample: i * 16000, endSample: (i + 1) * 16000, samples: pcm.length,
    startMs: i * 1000, endMs: (i + 1) * 1000, cut: 'pause', status: 'pending', attempts: 0, createdAt: Date.now() + i, hasAudio: true, model: null, costUsd: null, lastError: null };
  await ms.db.addSegment(seg, wav);
  return seg.id;
}, { meetingId, i, opts });
const seg = (id) => ev((id) => ms.db.getSegment(id), id);
const meeting = (id, over = {}) => ev(async ({ id, over }) => ms.db.putMeeting({ id, title: id, startedAt: new Date().toISOString(), endedAt: null, status: 'complete', channels: ['tab'], model: 'openai/whisper-large-v3', ...over }), { id, over });

before(async () => {
  assert.ok(fs.existsSync(path.join(EXT, 'manifest.json')), 'run node admin/build/package.mjs --test first (tests/run.mjs does)');
  profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ms-profile-'));
  // 1 s quiet, then 3 s speech, 3 s quiet, 2.5 s speech, 4 s quiet: two utterances per 13.5 s loop
  fakeWav = path.join(profile, '..', `ms-fake-${process.pid}.wav`);
  fs.writeFileSync(fakeWav, wavFile(synth([['quiet', 1000], ['speech', 3000], ['quiet', 3000], ['speech', 2500], ['quiet', 4000]])));
  replay = await startReplay();
  context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream',
           `--use-file-for-fake-audio-capture=${fakeWav}`],
  });
  [sw] = context.serviceWorkers();
  if (!sw) sw = await context.waitForEvent('serviceworker');
  extId = new URL(sw.url()).host;
  await settings({ apiKey: 'test-key-not-a-real-key', apiBase: replay.base, model: 'openai/whisper-large-v3', zdr: true });
});
after(async () => {
  await context?.close();
  await replay?.close();
  fs.rmSync(profile, { recursive: true, force: true });
  if (fakeWav) fs.rmSync(fakeWav, { force: true });
});

describe('MeetScribe in Chromium', () => {
  test('the worker is up, the test build is marked, and the manifest asks for exactly the planned permissions', async () => {
    const m = await ev(() => chrome.runtime.getManifest());
    assert.match(m.name, /TEST BUILD/);
    assert.deepEqual([...m.permissions].sort(), ['activeTab', 'alarms', 'offscreen', 'sidePanel', 'storage', 'tabCapture', 'unlimitedStorage']);
    assert.deepEqual(m.host_permissions, ['https://openrouter.ai/*']);
  });

  test('every extension page loads without an error', async () => {
    for (const p of ['sidepanel.html', 'options.html', 'meetings.html']) {
      const page = await context.newPage();
      const errs = []; page.on('pageerror', e => errs.push(String(e))); page.on('console', m => m.type() === 'error' && errs.push(m.text()));
      await page.goto(`chrome-extension://${extId}/${p}`);
      await page.waitForTimeout(700);
      assert.deepEqual(errs, [], p + ': ' + errs.join(' | '));
      if (p === 'options.html') assert.match(await page.textContent('#provenance'), /TEST BUILD/);
      await page.close();
    }
  });

  test('A3, A8: capture with the microphone off: the meeting channel is cut at pauses, persisted, sent and transcribed', async () => {
    replay.state.requests.length = 0;
    const r = await ev(() => ms.start({ streamId: 'test:fake', tabId: -1, title: 'Capture test', mic: false }));
    assert.equal(r.ok, true, JSON.stringify(r));
    const id = r.meetingId;
    assert.equal((await ev(() => ms.getSession())).state, 'capturing');
    await waitFor((id) => ms.db.segmentsFor(id).then(s => s.filter(x => x.status === 'done').length >= 2), id, { timeout: 30000, what: 'two transcribed segments' });
    await ev(() => ms.stop());
    await waitFor(() => ms.getSession().then(s => s.state === 'idle'), null, { timeout: 30000, what: 'session idle after stop' });
    const m = await ev((id) => ms.db.getMeeting(id), id);
    assert.equal(m.status, 'complete'); assert.deepEqual(m.channels, ['tab']); assert.ok(m.endedAt);
    const segs = await ev((id) => ms.db.segmentsFor(id), id);
    assert.ok(segs.length >= 2);
    assert.ok(segs.every(s => s.channel === 'tab'), 'A8: no microphone segment when the microphone is off');
    assert.ok(segs.every(s => s.status === 'done'), JSON.stringify(segs.map(s => [s.status, s.lastError])));
    for (const s of segs) {
      const dur = s.endMs - s.startMs;
      assert.ok(dur >= 2000 && dur <= 30000, `segment of ${dur} ms: utterances, not fixed slices or silence`);
    }
    assert.equal(replay.state.requests.length, segs.length, 'one request per segment');
    assert.ok(replay.state.requests.every(q => q.validWav && q.format === 'verbose_json' && q.zdr === true && q.model === 'openai/whisper-large-v3'));
    const lines = await ev((id) => ms.db.linesFor(id), id);
    assert.equal(lines.length, segs.length * 2, 'two fixture segments per request');
    assert.ok(lines.every(l => l.timing === 'model' && l.channel === 'tab'));
    const offscreen = await ev(() => chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] }).then(c => c.length));
    assert.equal(offscreen, 0, 'the offscreen document is closed after stop');
  });

  test('A8: with the microphone on, both channels are captured on one clock and labelled by channel', async () => {
    replay.state.requests.length = 0;
    const r = await ev(() => ms.start({ streamId: 'test:fake', tabId: -1, title: 'Two channels', mic: true }));
    assert.equal(r.ok, true, JSON.stringify(r));
    await waitFor((id) => ms.db.segmentsFor(id).then(s => s.some(x => x.channel === 'mic' && x.status === 'done') && s.some(x => x.channel === 'tab' && x.status === 'done')), r.meetingId, { timeout: 30000, what: 'a transcribed segment on each channel' });
    // mute: no new microphone segments while muted
    await ev(() => chrome.runtime.sendMessage({ target: 'offscreen', type: 'mic', muted: true }));
    const micBefore = await ev((id) => ms.db.segmentsFor(id).then(s => s.filter(x => x.channel === 'mic').length), r.meetingId);
    await new Promise(r => setTimeout(r, 15000));
    await ev(() => ms.stop());
    await waitFor(() => ms.getSession().then(s => s.state === 'idle'), null, { timeout: 30000, what: 'idle' });
    const segs = await ev((id) => ms.db.segmentsFor(id), r.meetingId);
    const mic = segs.filter(s => s.channel === 'mic'), tab = segs.filter(s => s.channel === 'tab');
    assert.ok(mic.length <= micBefore + 1, `muted: ${mic.length} mic segments after, ${micBefore} before (one may close at the mute)`);
    assert.ok(tab.length > micBefore, 'the meeting channel kept going while the microphone was muted');
    const m = await ev((id) => ms.db.getMeeting(id), r.meetingId);
    assert.deepEqual(m.channels, ['tab', 'mic']);
  });

  test('R1, 4.5: a segment that is not a valid WAV is never sent', async () => {
    await meeting('m-invalid');
    replay.state.requests.length = 0;
    const id = await queueSegment('m-invalid', 0, { garbage: true });
    await ev(() => ms.drain('t', { meetingId: 'm-invalid', untilEmpty: true }));
    const s = await seg(id);
    assert.equal(s.status, 'invalid'); assert.match(s.lastError, /not sent: not RIFF/);
    assert.equal(replay.state.requests.length, 0);
  });

  test('5.4: a 500 is retried with backoff and then succeeds', async () => {
    await meeting('m-retry');
    replay.state.script.push('error-500');
    const id = await queueSegment('m-retry', 0);
    assert.equal(await ev(() => ms.processOne('t', { meetingId: 'm-retry' })), 'retry');
    let s = await seg(id);
    assert.equal(s.status, 'pending'); assert.equal(s.attempts, 1); assert.ok(s.nextAttemptAt > Date.now() + 1500, 'backs off at least 2 s');
    await ev((id) => ms.db.getSegment(id).then(s => ms.db.putSegment({ ...s, nextAttemptAt: 0 })), id);   // skip the wait
    assert.equal(await ev(() => ms.processOne('t', { meetingId: 'm-retry' })), 'done');
    s = await seg(id); assert.equal(s.status, 'done'); assert.equal(s.costUsd, 0.000178);
  });

  test('5.1: a model that rejects verbose_json is remembered and the segment is resent as json', async () => {
    await meeting('m-json');
    replay.state.requests.length = 0;
    replay.state.script.push('error-400-verbose', 'transcription-json');
    const id = await queueSegment('m-json', 0);
    await ev(() => ms.drain('t', { meetingId: 'm-json', untilEmpty: true }));
    assert.deepEqual(replay.state.requests.map(r => r.format), ['verbose_json', 'json']);
    const s = await seg(id); assert.equal(s.status, 'done'); assert.equal(s.costUsd, null, 'no cost reported: null, never 0');
    const [l] = await ev(() => ms.db.linesFor('m-json'));
    assert.equal(l.timing, 'segment-start');
    assert.equal((await ev(() => chrome.storage.local.get('noVerbose'))).noVerbose['openai/whisper-large-v3'], true);
    await settings({ noVerbose: {} });
  });

  test('A7: a rejected key holds the queue and says so; the segment is sent once the key is fixed', async () => {
    await meeting('m-key');
    replay.state.script.push('error-401');
    const id = await queueSegment('m-key', 0);
    assert.equal(await ev(() => ms.processOne('t', { meetingId: 'm-key' })), 'held');
    let s = await seg(id); assert.equal(s.status, 'failed'); assert.equal(s.held, true); assert.match(s.lastError, /rejected the key/);
    await ev(() => ms.db.resumeHeld());
    await ev(() => ms.drain('t', { meetingId: 'm-key', untilEmpty: true }));
    s = await seg(id); assert.equal(s.status, 'done');
  });

  test('A7: a network failure is checked against the key before it is called offline, and the segment waits', async () => {
    await meeting('m-off');
    const id = await queueSegment('m-off', 0);
    await settings({ apiBase: 'http://127.0.0.1:9/api/v1' });          // nothing listens on port 9
    assert.equal(await ev(() => ms.processOne('t', { meetingId: 'm-off' })), 'offline');
    let s = await seg(id); assert.equal(s.status, 'pending'); assert.match(s.lastError, /offline/); assert.equal(s.attempts, 0);
    await settings({ apiBase: replay.base });
    await ev((id) => ms.db.getSegment(id).then(s => ms.db.putSegment({ ...s, nextAttemptAt: 0 })), id);
    await ev(() => ms.drain('t', { meetingId: 'm-off', untilEmpty: true }));
    s = await seg(id); assert.equal(s.status, 'done');
  });

  test('A4: two contexts draining the same queue send each segment exactly once', async () => {
    await meeting('m-race');
    replay.state.requests.length = 0;
    replay.state.delayMs = 150;
    for (let i = 0; i < 8; i++) await queueSegment('m-race', i);
    await ev(() => Promise.all([ms.drain('ctx-a', { meetingId: 'm-race', untilEmpty: true, workers: 3 }), ms.drain('ctx-b', { meetingId: 'm-race', untilEmpty: true, workers: 3 })]));
    replay.state.delayMs = 0;
    const hashes = replay.state.requests.map(r => r.hash);
    assert.equal(hashes.length, 8, 'eight requests'); assert.equal(new Set(hashes).size, 8, 'no segment sent twice');
    const segs = await ev(() => ms.db.segmentsFor('m-race'));
    assert.ok(segs.every(s => s.status === 'done'));
  });

  test('the meetings page shows the transcript, its cost and the gaps', async () => {
    await meeting('m-page', { title: 'Page test' });
    replay.state.script.push('error-401');
    await queueSegment('m-page', 0);
    await ev(() => ms.processOne('t', { meetingId: 'm-page' }));   // held: shown as a gap
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extId}/meetings.html?id=m-page`);
    await page.waitForSelector('#lines li');
    assert.match(await page.textContent('#lines'), /failed: OpenRouter rejected the key/);
    assert.match(await page.textContent('#meta'), /0 sent/);
    await page.close();
  });

  test('7: the debrief is written from the transcript in the chosen language, shown, and leaves the transcript as it was', async () => {
    await meeting('m-debrief', { title: 'Debrief test' });
    await queueSegment('m-debrief', 0);
    await ev(() => ms.drain('t', { meetingId: 'm-debrief', untilEmpty: true }));
    await settings({ debriefLocale: 'pt-pt', debriefModel: 'google/gemini-3.5-flash' });
    const linesBefore = await ev(() => ms.db.linesFor('m-debrief'));
    replay.state.chats.length = 0;
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extId}/meetings.html?id=m-debrief`);
    await page.click('#debrief');
    await page.waitForSelector('#debriefBody h3', { timeout: 10000 });
    assert.equal(replay.state.chats.length, 1);
    assert.equal(replay.state.chats[0].model, 'google/gemini-3.5-flash'); assert.equal(replay.state.chats[0].zdr, true);
    assert.match(replay.state.chats[0].system, /Portuguese \(Portugal\)/);
    assert.match(replay.state.chats[0].user, /Meeting: We need to agree on the project scope\./);
    assert.match(await page.textContent('#debriefBody'), /prepare the first draft/);
    assert.match(await page.textContent('#debriefMeta'), /\$0\.0003 reported/);
    assert.equal(await page.locator('#debriefBody script, #debriefBody img').count(), 0);
    assert.deepEqual(await ev(() => ms.db.linesFor('m-debrief')), linesBefore, 'the transcript is unchanged');
    const m = await ev(() => ms.db.getMeeting('m-debrief'));
    assert.equal(m.debrief.locale, 'pt-pt'); assert.equal(m.debrief.costUsd, 0.00031);
    await page.close();
    await settings({ debriefLocale: 'en-gb' });
  });

  test('VoiceDebrief alignment: the pages carry its colour schemes and brand, and a stored scheme outside the five falls back to Signal', async () => {
    const page = await context.newPage();
    await settings({ theme: 'night' });
    await page.goto(`chrome-extension://${extId}/options.html`);
    await page.waitForFunction(() => document.documentElement.dataset.vdTheme === 'night');
    assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(8, 19, 31)');
    assert.match(await page.textContent('header.bar'), /VoiceDebrief\s*MeetScribe\s*BETA/);
    assert.match(await page.textContent('body'), /We do not know which provider handles your recording/);
    await settings({ theme: '"><script>' });
    await page.reload();
    await page.waitForFunction(() => document.documentElement.dataset.vdTheme === 'signal');
    await settings({ theme: 'signal' });
    await page.close();
  });

  test('A12: delete all leaves no meeting, segment, audio or line', async () => {
    await ev(() => ms.db.deleteAll());
    assert.deepEqual(await ev(() => ms.db.totals()), { meetings: 0, segments: 0, wavs: 0, lines: 0 });
  });
});
