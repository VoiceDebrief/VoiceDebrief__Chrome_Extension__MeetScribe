// The model bake-off (plan, spike S6), runnable with a real OpenRouter key. It voices two short meeting scripts
// (English, and European Portuguese) with OpenRouter's text-to-speech, cuts them to MeetScribe's own format (16 kHz
// mono WAV, under 30 s), sends each to every candidate transcription model through extension/lib/openrouter.js (the
// extension's own client, verbose_json first, json if the model refuses it), and scores the text against the script
// (word error rate, after lower-casing and removing punctuation). It writes data/bakeoff/<date>.json.
// Three clips: the English meeting at a normal pace, the same meeting spoken fast (the editor, on a real call: "it is
// struggling with fast talking"), and the Portuguese one.
//
//   OPENROUTER_API_KEY=... node admin/build/bakeoff.mjs [model ...]
//
// The key is read from the environment, used in one header by the extension's client, and never printed or written.
// LIMITS, said plainly: the speech is synthetic and clean (two TTS voices, no noise, no crosstalk), so this ranks
// models on easy audio; a real meeting is harder. The scores say which models are worth trying on real calls.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { transcribe, classify, API_BASE } from '../../extension/lib/openrouter.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const KEY = process.env.OPENROUTER_API_KEY;
if (!KEY) { console.error('bakeoff: set OPENROUTER_API_KEY'); process.exit(1); }
const WORK = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'ms-bakeoff-'));
const DATE = new Date().toISOString().slice(0, 10);

export const SCRIPTS = {
  en: { voice: ['Kore', 'Puck'], turns: [
    'Morning everyone. Before we start, Priya, can you confirm the launch date for the Lisbon pilot?',
    'Yes. We move it to the fourteenth of November, and the budget stays at forty two thousand euros.',
    'Good. Then Marcus owns the onboarding guide, due next Friday, and I will send the contract to Hartwell today.',
    'One open question: do we still need the security review from Nadia before the pilot goes live?',
  ] },
  'en-fast': { voice: ['Kore', 'Puck'], instructions: 'Speak very fast, rushed, like an impatient person at the end of a long meeting, with almost no pauses.', turns: null },
  pt: { voice: ['Kore', 'Puck'], turns: [
    'Bom dia a todos. Joana, consegue confirmar a data de lançamento do piloto em Lisboa?',
    'Sim. Passa para catorze de novembro, e o orçamento mantém-se em quarenta e dois mil euros.',
    'Ótimo. O Ricardo fica com o guia de integração, para sexta-feira, e eu envio o contrato hoje.',
  ] },
};

SCRIPTS['en-fast'].turns = SCRIPTS.en.turns;
// The hard clip: the fast English, 20% faster again, with pink noise, squeezed through 12 kb/s Opus (the codec a call
// uses) and back. Clean synthetic speech did not separate the models; this is closer to a call with a fast talker.
SCRIPTS['en-hard'] = { ...SCRIPTS['en-fast'], derivedFrom: 'en-fast' };

export const CANDIDATES = [
  'openai/whisper-large-v3', 'openai/whisper-large-v3-turbo', 'openai/whisper-1', 'openai/gpt-transcribe', 'openai/gpt-4o-transcribe',
  'elevenlabs/scribe-v2', 'assemblyai/universal-3-6-pro', 'deepgram/nova-3', 'mistralai/voxtral-small-transcribe-3-0',
  'mistralai/voxtral-mini-transcribe-3-0', 'nvidia/nemotron-3.5-transcribe', 'google/gemini-3.5-transcribe', 'qwen/qwen3-asr-1.7b',
];

// Numbers count the same however they are written ("14th" = "fourteenth", "42,000" = "forty two thousand"): a model
// that writes digits has not misheard anything. Only the numbers in these scripts are mapped, and that is said here.
const NUMBERS = [[/\bforty[\s-]two thousand\b/g, '42000'], [/\b42,000\b/g, '42000'], [/\bfourteenth\b/g, '14th'],
                 [/\bquarenta e dois mil\b/g, '42 mil'], [/\bcatorze\b/g, '14'], [/\bpra\b/g, 'para']];
const words = (t) => NUMBERS.reduce((x, [re, to]) => x.replace(re, to), t.toLowerCase().normalize('NFC'))
  .replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
/** Word error rate: word-level edit distance over the reference length. */
export function wer(ref, hyp) {
  const r = words(ref), h = words(hyp);
  const d = Array.from({ length: r.length + 1 }, (_, i) => [i, ...Array(h.length).fill(0)]);
  for (let j = 1; j <= h.length; j++) d[0][j] = j;
  for (let i = 1; i <= r.length; i++) for (let j = 1; j <= h.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (r[i - 1] === h[j - 1] ? 0 : 1));
  return r.length ? d[r.length][h.length] / r.length : 0;
}

const pcmCache = {};
async function speak(lang) {
  const s = SCRIPTS[lang];
  if (s.derivedFrom) {
    const src = pcmCache[s.derivedFrom] || (await speak(s.derivedFrom), pcmCache[s.derivedFrom]);
    const opus = path.join(WORK, lang + '.ogg'), wav = path.join(WORK, lang + '.wav');
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 's16le', '-ar', '24000', '-ac', '1', '-i', src,
      '-f', 'lavfi', '-i', 'anoisesrc=color=pink:amplitude=0.03:sample_rate=24000',
      '-filter_complex', '[0:a]atempo=1.2[s];[s][1:a]amix=inputs=2:duration=first:normalize=0[m]', '-map', '[m]',
      '-c:a', 'libopus', '-b:a', '12k', opus]);
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', opus, '-ar', '16000', '-ac', '1', '-t', '29.5', '-c:a', 'pcm_s16le', wav]);
    const bytes = new Uint8Array(fs.readFileSync(wav));
    return { bytes, seconds: (bytes.length - 44) / 32000, reference: s.turns.join(' ') };
  }
  const res = await fetch(API_BASE + '/audio/speech', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + KEY },
    body: JSON.stringify({ model: 'google/gemini-3.8-flash-tts', response_format: 'pcm', voice: s.voice[0],
      input: s.turns.map((text, i) => ({ text, voice: s.voice[i % 2], ...(s.instructions ? { instructions: s.instructions } : {}) })) }),
  });
  if (!res.ok) throw new Error(`speech ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const pcm = path.join(WORK, lang + '.pcm'), wav = path.join(WORK, lang + '.wav');
  fs.writeFileSync(pcm, Buffer.from(await res.arrayBuffer()));
  pcmCache[lang] = pcm;
  // Gemini TTS returns 16-bit mono PCM at 24 kHz; MeetScribe sends 16 kHz mono 16-bit WAV, under 30 s
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 's16le', '-ar', '24000', '-ac', '1', '-i', pcm, '-ar', '16000', '-ac', '1', '-t', '29.5', '-c:a', 'pcm_s16le', wav]);
  const bytes = new Uint8Array(fs.readFileSync(wav));
  return { bytes, seconds: (bytes.length - 44) / 32000, reference: s.turns.join(' ') };
}

async function run(model, clip, lang) {
  const t0 = Date.now();
  const tryOnce = (verbose) => transcribe({ key: KEY, model, wav: clip.bytes, language: lang.startsWith('pt') ? 'pt' : 'en', verbose, zdr: false });
  let r, verboseOk = true;
  try { r = await tryOnce(true); }
  catch (e) {
    if (e.status === 400 && classify(400, e.message).kind === 'fallback-json') { verboseOk = false; r = await tryOnce(false); }
    else return { model, lang, error: `${e.status} ${e.message}`.slice(0, 200) };
  }
  return { model, lang, ms: Date.now() - t0, verbose: verboseOk, segments: r.segments ? r.segments.length : 0, timingRejected: r.timingRejected,
           cost: r.cost, seconds: r.seconds, wer: Number(wer(clip.reference, r.text).toFixed(3)), text: r.text };
}

// --rescore: recompute the error rates of a saved run from its texts, without calling anything
if (process.argv[2] === '--rescore') {
  const f = path.join(ROOT, 'data', 'bakeoff', (process.argv[3] || DATE) + '.json');
  const d = JSON.parse(fs.readFileSync(f, 'utf8'));
  for (const r of d.results) if (r.text !== undefined) r.wer = Number(wer(d.scripts[r.lang], r.text).toFixed(3));
  d.scoring = 'WER after lower-casing, removing punctuation, and writing the scripts\' numbers one way (digits)';
  fs.writeFileSync(f, JSON.stringify(d, null, 2) + '\n');
  console.log('bakeoff: rescored ' + path.relative(ROOT, f)); process.exit(0);
}
const args = process.argv.slice(2);
const ci = args.indexOf('--clips');
const only = ci >= 0 ? args.splice(ci, 2)[1].split(',') : null;
const models = args.length ? args : CANDIDATES;
const clips = {};
for (const lang of Object.keys(SCRIPTS).filter(l => !only || only.includes(l))) { clips[lang] = await speak(lang); console.log(`bakeoff: voiced ${lang}, ${clips[lang].seconds.toFixed(1)} s`); }
const results = [];
for (const model of models) for (const lang of Object.keys(clips)) {
  const r = await run(model, clips[lang], lang);
  results.push(r);
  console.log(`bakeoff: ${model.padEnd(42)} ${lang}  ${r.error ? 'ERROR ' + r.error : `WER ${(r.wer * 100).toFixed(1).padStart(5)}%  ${r.verbose ? 'timestamps' : 'no timestamps'}  ${r.ms} ms  cost ${r.cost ?? 'not reported'}`}`);
}
const out = { date: DATE, scoring: 'WER after lower-casing, removing punctuation, and writing the scripts\' numbers one way (digits)', method: 'synthetic two-voice speech (google/gemini-3.8-flash-tts), 16 kHz mono WAV, under 30 s; WER after lower-casing and removing punctuation; one run per model and language',
  limits: 'clean synthetic speech: no noise, no crosstalk, no real accents; ranks models on easy audio only', scripts: Object.fromEntries(Object.entries(SCRIPTS).map(([k, v]) => [k, v.turns.join(' ')])),
  clipSeconds: Object.fromEntries(Object.entries(clips).map(([k, v]) => [k, Number(v.seconds.toFixed(1))])), results };
fs.mkdirSync(path.join(ROOT, 'data', 'bakeoff'), { recursive: true });
const name = only ? `${DATE}-${only.join('+')}` : DATE;   // a partial run never overwrites a full one
fs.writeFileSync(path.join(ROOT, 'data', 'bakeoff', `${name}.json`), JSON.stringify(out, null, 2) + '\n');
console.log(`bakeoff: data/bakeoff/${name}.json`);
fs.rmSync(WORK, { recursive: true, force: true });
