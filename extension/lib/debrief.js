// The debrief (brief v2.0, 7): one request with the whole transcript, written in the reader's language and
// tone, kept apart from the transcript, which it never changes. Pure except for the one call it is handed.
import { DEBRIEF_PROMPT, LOCALES } from './prompts.js';
import { clock } from './transcript.js';

/** The transcript as the model reads it. Probable echoes are left out (they repeat a Meeting line); gaps are named. */
export function transcriptForPrompt(items) {
  return items.filter(i => !(i.flags || []).includes('probable-echo')).map(i => i.type === 'line'
    ? `[${clock(i.startMs)}] ${i.label}: ${i.text}${(i.flags || []).includes('suspect') ? ' (possibly not spoken)' : ''}`
    : `[${clock(i.startMs)}] ${i.label}: (not transcribed: ${i.status})`).join('\n');
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
