// Unit tests of the pure modules, in Node, against real objects: the WAV writer and its content check, the
// pause-based cutter on audio with a known shape, OpenRouter response parsing and error meaning, the
// transcript with its gaps, flags, cost and exports.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { encodeWav, checkWav, floatToInt16, resample, toBase64, SAMPLE_RATE } from '../extension/lib/wav.js';
import { Segmenter } from '../extension/lib/vad.js';
import { classify, backoffMs, parseTranscription } from '../extension/lib/openrouter.js';
import { linesFromResult, assemble, costOf, isSuspect, similarity, toText, toMarkdown, toJson, clock } from '../extension/lib/transcript.js';
import { transcriptForPrompt, buildMessages, blocks } from '../extension/lib/debrief.js';
import { DEBRIEF_PROMPT, LOCALES } from '../extension/lib/prompts.js';
import { synth } from './helpers/audio.mjs';

const cut = (plan, opts) => { const out = []; const s = new Segmenter(x => out.push(x), opts); const f = synth(plan); for (let i = 0; i < f.length; i += 2048) s.push(f.subarray(i, i + 2048)); s.flush('stop'); return { out, s, total: f.length }; };
const sec = (n) => n * SAMPLE_RATE;

describe('wav', () => {
  test('a written WAV passes the content check with the exact sample count', () => {
    const pcm = floatToInt16(synth([['speech', 500]]));
    const w = encodeWav(pcm);
    assert.equal(w.length, 44 + pcm.length * 2);
    const c = checkWav(w, pcm.length);
    assert.equal(c.ok, true); assert.equal(c.samples, pcm.length); assert.equal(c.sampleRate, 16000);
  });
  test('R1: a continuation chunk without a header is refused, not sent', () => {
    const w = encodeWav(floatToInt16(synth([['speech', 500]])));
    assert.match(checkWav(w.slice(44)).reason, /RIFF|shorter/);
    // a WebM continuation cluster starts 1F 43 B6 75: not a WAV, refused by content
    assert.equal(checkWav(new Uint8Array([0x1f, 0x43, 0xb6, 0x75, ...new Uint8Array(100)])).ok, false);
  });
  test('a truncated file, a wrong count, and all-zero audio are refused with a reason', () => {
    const pcm = floatToInt16(synth([['speech', 200]]));
    const w = encodeWav(pcm);
    assert.match(checkWav(w.slice(0, w.length - 10)).reason, /data chunk/);
    assert.match(checkWav(w, pcm.length + 1).reason, /expected/);
    assert.match(checkWav(encodeWav(new Int16Array(1600))).reason, /zero/);
  });
  test('resample keeps duration; base64 round-trips', () => {
    assert.equal(resample(new Float32Array(48000), 48000).length, 16000);
    const b = new Uint8Array([0, 1, 2, 250, 255]);
    assert.deepEqual([...Buffer.from(toBase64(b), 'base64')], [...b]);
  });
});

describe('cutting at pauses (R2, R3)', () => {
  test('silence alone produces no segment: nothing is sent', () => {
    const { out, s } = cut([['quiet', 20000]]);
    assert.equal(out.length, 0); assert.equal(s.stats.segments, 0);
  });
  test('digital silence (all zeros) produces no segment', () => {
    assert.equal(cut([['zero', 5000]]).out.length, 0);
  });
  test('two utterances separated by a long pause are two segments, cut in the pause', () => {
    const { out } = cut([['quiet', 1000], ['speech', 3000], ['quiet', 4000], ['speech', 2500], ['quiet', 3000]]);
    assert.equal(out.length, 2);
    assert.ok(out[0].startSample <= sec(1) && out[0].startSample >= sec(0.7), 'starts just before speech (pre-roll)');
    assert.ok(out[0].endSample > sec(4) && out[0].endSample < sec(8), 'ends inside the pause');
    assert.ok(out[1].startSample >= sec(7.5) && out[1].startSample <= sec(8));
    assert.equal(out[0].cut, 'pause');
  });
  test('short pauses inside speech do not cut before the minimum length', () => {
    const plan = []; for (let i = 0; i < 6; i++) plan.push(['speech', 1500], ['quiet', 400]);
    plan.push(['quiet', 3000]);
    const { out } = cut(plan);
    assert.equal(out.length, 1, 'one segment: 400 ms pauses are shorter than the pause threshold before 8 s');
  });
  test('after the minimum length, the first 600 ms pause closes the segment', () => {
    const { out } = cut([['speech', 9000], ['quiet', 800], ['speech', 3000], ['quiet', 3000]]);
    assert.equal(out.length, 2);
    assert.ok(out[0].endSample < sec(10));
  });
  test('unbroken speech is force-cut at 30 s and marked', () => {
    const { out } = cut([['speech', 70000], ['quiet', 3000]]);
    assert.equal(out.length, 3);
    assert.deepEqual(out.map(o => o.cut), ['forced', 'forced', 'pause']);
    assert.equal(out[0].endSample - out[0].startSample, sec(30));
    assert.equal(out[1].startSample, out[0].endSample, 'no gap and no overlap at a forced cut');
  });
  test('every sample in a segment is accounted for on the clock', () => {
    const { out, s, total } = cut([['quiet', 500], ['speech', 2000], ['quiet', 3000]]);
    assert.equal(s.clock, total);
    for (const o of out) assert.equal(o.int16.length, o.endSample - o.startSample);
  });
  test('skip moves the clock without audio (pause, mute)', () => {
    const got = []; const s = new Segmenter(x => got.push(x));
    s.push(synth([['speech', 2000]])); s.skip(sec(10)); s.push(synth([['speech', 2000], ['quiet', 3000]])); s.flush();
    assert.equal(got.length, 2);
    assert.ok(got[1].startSample >= sec(12) - 4000);
  });
});

describe('OpenRouter responses and errors', () => {
  test('parse verbose_json: text, segments, usage; missing cost is null, never 0', () => {
    const r = parseTranscription({ text: ' Hello there. ', language: 'en', segments: [{ start: 0, end: 1.2, text: 'Hello there.' }], usage: { seconds: 1.2 } }, 'gen-1', 'verbose_json');
    assert.equal(r.text, 'Hello there.'); assert.equal(r.cost, null); assert.equal(r.seconds, 1.2); assert.equal(r.generationId, 'gen-1');
    assert.equal(r.segments.length, 1);
  });
  test('parse json: no segments is null', () => {
    const r = parseTranscription({ text: 'Hi', usage: { cost: 0.0002, seconds: 3 } });
    assert.equal(r.segments, null); assert.equal(r.cost, 0.0002);
  });
  test('a response without text is an error, not an empty transcript', () => {
    assert.throws(() => parseTranscription({ error: 'x' }), /no text/);
  });
  test('what each status means', () => {
    assert.equal(classify(401).kind, 'key'); assert.equal(classify(403).kind, 'key'); assert.equal(classify(402).kind, 'credit');
    for (const s of [429, 500, 502, 503, 504, 524, 529]) assert.equal(classify(s).kind, 'retry', String(s));
    assert.equal(classify(0).kind, 'offline-or-key'); assert.equal(classify(400).kind, 'fatal-segment'); assert.equal(classify(413).kind, 'fatal-segment');
  });
  test('backoff doubles with jitter, and Retry-After wins', () => {
    assert.equal(backoffMs(1, null, () => 0), 2000); assert.equal(backoffMs(3, null, () => 0), 8000); assert.equal(backoffMs(3, null, () => 1), 12000);
    assert.equal(backoffMs(9, null, () => 0), 32000); assert.equal(backoffMs(2, 7), 7000);
  });
});

describe('transcript', () => {
  const seg = (o) => ({ id: 's1', meetingId: 'm', channel: 'tab', startMs: 10000, endMs: 20000, status: 'done', ...o });
  test('model timestamps are offsets into the segment', () => {
    const lines = linesFromResult(seg(), { text: 'a b', segments: [{ start: 1, end: 2, text: 'a' }, { start: 2.5, end: 4, text: 'b' }], cost: 0.01, generationId: 'g' }, 'm1');
    assert.deepEqual(lines.map(l => [l.startMs, l.endMs, l.timing]), [[11000, 12000, 'model'], [12500, 14000, 'model']]);
  });
  test('without model timestamps a line carries the segment start, marked approximate', () => {
    const [l] = linesFromResult(seg(), { text: 'hello', segments: null, cost: null, generationId: null }, 'm1');
    assert.equal(l.timing, 'segment-start'); assert.equal(l.startMs, 10000);
    assert.match(toText({ title: 'T', startedAt: 'x', model: 'm' }, assemble([seg()], [{ ...l }])), /\[≈00:00:10\] Meeting: hello/);
  });
  test('labels come from the channel only: You for the microphone, Meeting for the tab', () => {
    const items = assemble([seg(), seg({ id: 's2', channel: 'mic' })], [
      ...linesFromResult(seg(), { text: 'from the call', segments: null }, 'm'),
      ...linesFromResult(seg({ id: 's2', channel: 'mic', startMs: 30000, endMs: 32000 }), { text: 'from me', segments: null }, 'm')]);
    assert.deepEqual(items.map(i => i.label), ['Meeting', 'You']);
  });
  test('a segment not yet transcribed is a visible gap, never a silent hole', () => {
    const items = assemble([seg({ status: 'failed', lastError: '500 boom' }), seg({ id: 's2', status: 'pending', startMs: 20000 })], []);
    assert.deepEqual(items.map(i => [i.type, i.status]), [['gap', 'failed'], ['gap', 'pending']]);
    assert.match(toMarkdown({ title: 'T', startedAt: 'x', model: 'm' }, items), /failed: 500 boom/);
  });
  test('R5: a microphone line repeating a meeting line at the same time is marked probable-echo, not deleted', () => {
    const tab = linesFromResult(seg(), { text: 'We should ship the release on Friday', segments: null }, 'm');
    const mic = linesFromResult(seg({ id: 's2', channel: 'mic', startMs: 10400, endMs: 19000 }), { text: 'we should ship the release on friday', segments: null }, 'm');
    const own = linesFromResult(seg({ id: 's3', channel: 'mic', startMs: 40000, endMs: 42000 }), { text: 'I can prepare the draft', segments: null }, 'm');
    const items = assemble([], [...tab, ...mic, ...own]);
    assert.equal(items.length, 3);
    assert.deepEqual(items.find(i => i.segmentId === 's2').flags, ['probable-echo']);
    assert.deepEqual(items.find(i => i.segmentId === 's3').flags, []);
    assert.ok(similarity('a b c', 'x y z') === 0);
  });
  test('R3: stock phrases from silence are flagged suspect, not deleted', () => {
    assert.ok(isSuspect('Thank you for watching!')); assert.ok(isSuspect('Subtitles by the Amara.org community')); assert.ok(isSuspect('you'));
    assert.ok(!isSuspect('Thank you, that was useful.'));
    const [l] = linesFromResult(seg(), { text: 'Thank you for watching.', segments: null }, 'm');
    assert.deepEqual(l.flags, ['suspect']);
  });
  test('cost is the sum of what was reported; unreported costs are counted, not zero', () => {
    const c = costOf([seg({ costUsd: 0.01 }), seg({ costUsd: null }), seg({ costUsd: 0.02 }), seg({ status: 'pending', costUsd: null })]);
    assert.equal(c.requests, 3); assert.equal(c.unknown, 1); assert.ok(Math.abs(c.usd - 0.03) < 1e-12);
  });
  test('exports never carry the key or audio', () => {
    const m = { id: 'm', title: 'T', startedAt: 'x', model: 'm1' };
    const j = toJson(m, [seg({ costUsd: 0.01 })], assemble([seg()], []), costOf([seg()]));
    assert.doesNotMatch(j, /sk-or|apiKey|wav|bytes/);
    assert.equal(JSON.parse(j).format, 'meetscribe/meeting');
  });
  test('clock', () => { assert.equal(clock(3723000), '01:02:03'); assert.equal(clock(-5), '00:00:00'); });
});

describe('the debrief, aligned with voicedebrief.ai', () => {
  const seg = (o) => ({ id: 's1', meetingId: 'm', channel: 'tab', startMs: 0, endMs: 5000, status: 'done', ...o });
  const items = () => assemble([seg(), seg({ id: 's9', status: 'failed', startMs: 60000 })], [
    ...linesFromResult(seg(), { text: 'We ship on Friday', segments: null }, 'm'),
    ...linesFromResult(seg({ id: 's2', channel: 'mic', startMs: 100, endMs: 4000 }), { text: 'we ship on friday', segments: null }, 'm'),
    ...linesFromResult(seg({ id: 's3', channel: 'mic', startMs: 30000, endMs: 32000 }), { text: 'I will write the notes', segments: null }, 'm')]);
  test('finding 09: the model reads every line with times and labels; a probable echo is marked, not removed; gaps are named', () => {
    const t = transcriptForPrompt(items());
    assert.equal(t, '[00:00:00] Meeting: We ship on Friday\n[00:00:00] You: we ship on friday (may be the microphone hearing the Meeting line above)\n[00:00:30] You: I will write the notes\n[00:01:00] Meeting: (not transcribed: failed)');
  });
  test('finding 09: a genuine reply that repeats a question is still in the debrief input', () => {
    const q = linesFromResult(seg({ id: 'q' }), { text: 'Can you send the report today?', segments: null }, 'm');
    const a = linesFromResult(seg({ id: 'a', channel: 'mic', startMs: 2500, endMs: 4000 }), { text: 'I will send the report today', segments: null }, 'm');
    const t = transcriptForPrompt(assemble([], [...q, ...a]));
    assert.match(t, /You: I will send the report today/);
  });
  test('the prompt keeps voicedebrief.ai\'s sections and fills the reader\'s language and tone', () => {
    for (const h of ['## Key points', '## Actions', '## In one sentence', '## Decisions', '## Open questions']) assert.ok(DEBRIEF_PROMPT.includes(h), h);
    const [sys, user] = buildMessages(items(), 'pt-pt');
    assert.match(sys.content, /Write the whole debrief in Portuguese \(Portugal\)/);
    assert.ok(sys.content.includes(LOCALES['pt-pt'].tone));
    assert.doesNotMatch(sys.content, /\{\{/);
    assert.match(user.content, /^Transcript:/);
    assert.match(buildMessages(items(), 'xx').at(0).content, /in English\*\*/, 'an unknown locale falls back to en-gb');
  });
  test('the debrief renders as blocks of text, never as HTML', () => {
    assert.deepEqual(blocks('## Key points\n- a **b** <img src=x>\n\nplain'), [{ type: 'h', text: 'Key points' }, { type: 'li', text: 'a b <img src=x>' }, { type: 'p', text: 'plain' }]);
  });
  test('the Markdown export carries the debrief above the transcript, with the model caveat', () => {
    const md = toMarkdown({ title: 'T', startedAt: 'x', model: 'm', debrief: { markdown: '## Key points\n- a', model: 'g', generatedAt: 'y' } }, items());
    assert.ok(md.indexOf('## Debrief') < md.indexOf('## Transcript'));
    assert.match(md, /### Key points/);
    assert.match(md, /Written by a model, not a stenographer/);
  });
});

describe('v0.3.1 review fixes, pure parts', () => {
  test('15: model timestamps outside the audio are set aside, with the response kept', () => {
    const body = (segs) => ({ text: 'a b', segments: segs, usage: {} });
    assert.ok(parseTranscription(body([{ start: 0, end: 0.9, text: 'a' }]), null, 'verbose_json', 1).segments);
    for (const bad of [[{ start: -9, end: 0.5, text: 'a' }], [{ start: 0.8, end: 0.2, text: 'a' }], [{ start: 0, end: 10000, text: 'a' }],
                       [{ start: 0, end: 0.5, text: 'a' }, { start: 0.5, end: 3, text: 'b' }]]) {
      const r = parseTranscription(body(bad), null, 'verbose_json', 1);
      assert.equal(r.segments, null, JSON.stringify(bad)); assert.equal(r.timingRejected, true); assert.equal(r.text, 'a b');
    }
  });
  test('14: only a format-capability 400 is a verbose_json fallback; any other 400 is that segment\'s failure', () => {
    assert.equal(classify(400, 'response_format verbose_json is not supported by this model').kind, 'fallback-json');
    assert.equal(classify(400, 'Unsupported language: xx').kind, 'fatal-segment');
    assert.equal(classify(400, 'Request blocked by your guardrail policy').kind, 'fatal-segment');
  });
  test('08: a request that came back empty is a billed request, and a visible, retryable gap', () => {
    const segs = [{ id: 'e', meetingId: 'm', channel: 'tab', startMs: 0, endMs: 3000, status: 'empty', costUsd: 0.0002, lastError: 'the model returned no text for this speech' }];
    const c = costOf(segs); assert.equal(c.requests, 1); assert.equal(c.usd, 0.0002);
    const items = assemble(segs, []);
    assert.equal(items.length, 1); assert.equal(items[0].type, 'gap'); assert.equal(items[0].status, 'empty');
    assert.match(transcriptForPrompt(items), /not transcribed: empty/);
  });
  test('13: a request gives up before its lease could expire', async () => {
    const { REQUEST_TIMEOUT_MS } = await import('../extension/lib/openrouter.js');
    assert.ok(REQUEST_TIMEOUT_MS < 180000 - 30000, 'the 180 s lease outlives the request with margin');
  });
});
