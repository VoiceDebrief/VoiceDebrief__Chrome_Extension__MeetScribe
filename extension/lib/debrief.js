// The debrief (brief v2.0, 7): one request with the whole transcript, written in the reader's language and
// tone, kept apart from the transcript, which it never changes. Pure except for the one call it is handed.
import { DEBRIEF_PROMPT, LOCALES } from './prompts.js';
import { clock } from './transcript.js';

/**
 * The transcript as the model reads it. Every line goes in: a probable echo is marked, not removed, because the
 * echo check is a word heuristic and a genuine reply ("I will send the report today") can trip it (v0.3.1 review,
 * finding 09). Gaps are named, so the debrief can say what it could not see.
 */
export function transcriptForPrompt(items) {
  return items.map(i => {
    if (i.type !== 'line') return `[${clock(i.startMs)}] ${i.label}: (not transcribed: ${i.status})`;
    const f = i.flags || [];
    const notes = [f.includes('probable-echo') ? 'may be the microphone hearing the Meeting line above' : null, f.includes('suspect') ? 'possibly not spoken' : null].filter(Boolean);
    return `[${clock(i.startMs)}] ${i.label}: ${i.text}${notes.length ? ' (' + notes.join('; ') + ')' : ''}`;
  }).join('\n');
}

export function buildMessages(items, localeId = 'en-gb') {
  const loc = LOCALES[localeId] || LOCALES['en-gb'];
  const system = DEBRIEF_PROMPT.replace('{{language}}', loc.language).replace('{{tone}}', loc.tone);
  return [{ role: 'system', content: system }, { role: 'user', content: 'Transcript:\n\n' + transcriptForPrompt(items) }];
}

/** Markdown to safe blocks for rendering with textContent: [{ type: 'h' | 'li' | 'p', text }]. */
export function blocks(md) {
  const out = [];
  for (const raw of md.replace(/\r/g, '').split('\n')) {
    const l = raw.trim();
    if (!l) continue;
    let m;
    if ((m = l.match(/^#{1,6}\s+(.*)$/))) out.push({ type: 'h', text: m[1] });
    else if ((m = l.match(/^[-*]\s+(.*)$/))) out.push({ type: 'li', text: m[1].replace(/\*\*/g, '') });
    else out.push({ type: 'p', text: l.replace(/\*\*/g, '') });
  }
  return out;
}
