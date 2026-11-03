// Which models to offer, and what we know about each (from data/bakeoff/2026-11-03*.json and a debrief check the
// same day, both with a real OpenRouter key). The live catalogue is the full choice; these are the shortlist.
//
// What the bake-off could and could not show: on clean synthetic speech (normal, fast, and fast + noise + Opus at
// 12 kb/s) every recommended transcription model scored 0 to 4.4% word errors, so it could not rank them. Real fast
// talkers are harder. The way to choose is to compare models on your own audio: the meetings page does that.

export const TRANSCRIPTION = [
  { id: 'openai/whisper-large-v3', tier: 'Standard', note: 'the default; cheapest Whisper with timestamps; 0 to 1.5% in our test' },
  { id: 'openai/whisper-large-v3-turbo', tier: 'Standard', note: 'cheapest and fastest; 0 to 2.9% in our test' },
  { id: 'deepgram/nova-3', tier: 'Better', note: 'best in our test overall (0 to 1.5%), fastest answers (about 0.4 s), timestamps' },
  { id: 'elevenlabs/scribe-v2', tier: 'Better', note: '0 to 2.9% in our test, timestamps; misheard one surname' },
  { id: 'assemblyai/universal-3-6-pro', tier: 'Better', note: '0 to 2.9% in our test, timestamps' },
  { id: 'openai/gpt-transcribe', tier: 'Better', note: '0 to 1.5% in our test; no timestamps (lines use the segment start)' },
];
// Offered in the full list with a warning, never recommended: it dropped most of the speech in our test.
export const AVOID = { 'openai/gpt-4o-transcribe': 'dropped most of the speech on fast and Portuguese speech in our test' };

export const DEBRIEF = [
  { id: 'google/gemini-3.5-flash', tier: 'Standard', note: 'the default, as voicedebrief.ai uses' },
  { id: 'openai/gpt-5.6-terra', tier: 'Better', note: 'fastest and cheapest of the four we checked' },
  { id: 'anthropic/claude-sonnet-5.5', tier: 'Better', note: 'careful about who owns an action' },
  { id: 'anthropic/claude-opus-5.5', tier: 'Best', note: 'the most careful; about twice the cost of Sonnet' },
  { id: 'openai/gpt-5.6-sol', tier: 'Best', note: 'not yet checked with this prompt' },
];

/** Price per hour of audio for a duration-priced transcription model, or null when the unit is not per second. */
export function perHour(m) {
  const p = +m.prompt, c = +m.completion;
  if (!(p > 0) || c > 0 || p >= 0.01) return null;
  return p * 3600;
}
/** Estimated debrief cost for an hour of meeting: about 13,000 words in (roughly 17,000 tokens), 1,000 tokens out. */
export function debriefPerHour(m) {
  const pi = +m.prompt, po = +m.completion;
  if (!(pi >= 0) || !(po >= 0)) return null;
  return 17000 * pi + 1000 * po;
}
export const money = (x) => (x === null || x === undefined ? 'price unknown' : x < 0.1 ? '$' + x.toFixed(3) : '$' + x.toFixed(2));

/** Option groups for a select: recommended (with notes) first, then the rest of the live list. */
export function groups(live, shortlist, price, avoid = {}) {
  const byId = new Map(live.map(m => [m.id, m]));
  const rec = shortlist.map(s => ({ ...s, live: byId.get(s.id) || null }));
  const rest = live.filter(m => !shortlist.some(s => s.id === m.id)).sort((a, b) => a.id.localeCompare(b.id));
  const label = (id, m, note) => `${id}${m ? ' · ' + money(price(m)) + '/h' : ''}${note ? ' · ' + note : ''}`;
  return [
    { label: 'Recommended', options: rec.map(r => ({ value: r.id, text: `${r.tier}: ${label(r.id, r.live, r.note)}`, missing: live.length > 0 && !r.live })) },
    { label: 'Every model OpenRouter lists now', options: rest.map(m => ({ value: m.id, text: label(m.id, m, avoid[m.id] ? 'AVOID: ' + avoid[m.id] : '') })) },
  ];
}
