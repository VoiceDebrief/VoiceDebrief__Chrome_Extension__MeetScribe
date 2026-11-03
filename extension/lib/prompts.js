// The debrief prompt and the reader's language and tone, aligned with voicedebrief.ai.
//
// DEBRIEF_PROMPT is VoiceDebrief's summary prompt (VoiceDebrief__Website, website/app/prompts/summary-prompt.md,
// commit 30ae8d9) made for a meeting: the same three sections in the same words (Key points, Actions, In one
// sentence), the same rules and the same {{language}} / {{tone}} paragraph, plus Decisions and Open questions
// and a time on every point so it links back to its line (brief v2.0, 7). Kept as a module, not a .md file, so
// the extension never fetches anything but OpenRouter.
export const DEBRIEF_PROMPT = `Write a debrief of the meeting transcript you have been given, in markdown.

Each transcript line is "[time] Speaker: text". "You" is the person who recorded the meeting, from their own
microphone. "Meeting" is everyone else in the call, from the call's audio: it is not one person, and the
transcript does not say who in the call said what. Lines marked "(not transcribed)" are gaps.

Structure it exactly as:

## Key points
3-8 bullet points capturing what was actually said - concrete facts, decisions, numbers and names, not
paraphrased vagueness. End each with the time of the line it comes from, as [hh:mm:ss].

## Decisions
Decisions explicitly agreed in the meeting, each with its time. If none, write "- none recorded".

## Actions
Any tasks, follow-ups or requests mentioned, each as "- [who] what [hh:mm:ss]". Name who only if the
transcript says who; otherwise write [unassigned]. Give a due date only if one was said. If none, write
"- none mentioned".

## Open questions
Questions raised and not answered. If none, write "- none".

## In one sentence
One plain sentence a busy person could read instead of sitting through the meeting.

Rules: use only what is in the transcript; do not invent or embellish; do not turn a suggestion into a
decision; keep the speakers' own words where they are clearer than a rewording. If a gap may hide something
that matters, say so.

**Write the whole debrief in {{language}}**, including the headings, whatever language the meeting was in.
This is the reader's debrief, not the speakers' - the transcript already preserves what was actually said.
Where a name, a number or a technical term was spoken, keep it exactly as spoken rather than translating it.

Tone for this reader: {{tone}}`;

// voicedebrief.ai's locales (website/app/locales/<id>/culture.json, commit 30ae8d9): the language and tone.
export const LOCALES = {
  'en-gb': { label: 'English (UK)',        language: 'English',               tone: 'Plain, direct British English. No marketing register, no exclamation marks.' },
  'en-us': { label: 'English (US)',        language: 'English',               tone: 'Plain, direct American English. No marketing register, no exclamation marks.' },
  'pt-pt': { label: 'Português (Portugal)', language: 'Portuguese (Portugal)', tone: "Português europeu, directo e sóbrio. Tratamento por 'você'. Sem registo publicitário nem pontos de exclamação." },
  'pt-br': { label: 'Português (Brasil)',   language: 'Portuguese (Brazil)',   tone: "Português brasileiro, direto e próximo. Tratamento por 'você'. Sem exageros de marketing." },
};
