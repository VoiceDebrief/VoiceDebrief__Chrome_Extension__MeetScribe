# MeetScribe and VoiceDebrief

MeetScribe is a VoiceDebrief product: [voicedebrief.ai](https://voicedebrief.ai)'s transcript and debrief, for a meeting instead of a voice note. This page says what it shares with the website now, what differs and why, and how its code is meant to move into the website.

## What is the same

Read from the VoiceDebrief website repository (`VoiceDebrief/VoiceDebrief__Website`, branch `dev`, commit `30ae8d9`) on 3 November 2026.

| | voicedebrief.ai | MeetScribe |
|---|---|---|
| The key | Bring your own OpenRouter key, kept in the browser; "we charge nothing and add no margin"; the guide at [/openrouter-key/](https://voicedebrief.ai/openrouter-key/) with *set a spend limit* as the step that matters | The same, in the same words, linking to the same guide |
| Where the audio goes | `routingHonest`: "Your audio and its transcript are sent to OpenRouter, which passes them to a model provider. We do not know which provider handles your recording, and we have no control over what they do with it. Do not use this for anything you would not hand to a third party." | The same sentence, unchanged, on the consent step, the options page and the site's footer |
| The caveat | `modelCaveat`, shown with the transcript, never before it | The same sentence, above every transcript |
| The artefacts | Transcript, then an optional translation, then a summary ("debrief"), then an optional infographic. The transcript is never overwritten (issue 055) | Transcript, then the debrief. The transcript is never changed; the debrief is a separate document |
| The debrief | `summary-prompt.md`: Key points, Actions, In one sentence; only what is in the transcript; written in the reader's `{{language}}` with the locale's `{{tone}}` | The same prompt made for a meeting (`extension/lib/prompts.js`): the same three sections and rules, plus Decisions, Open questions and a time on every point |
| Language and tone | Four locales: en-gb, en-us, pt-pt, pt-br, each with a language and a tone in `culture.json` | The same four, with the same values, for the debrief |
| The debrief model | `google/gemini-3.5-flash` (the declared workflow's summary step) | The same default, changeable on the options page |
| Colour | `vd-tokens.css`: five schemes (Signal, Night, Paper, Blueprint, Ember), and no colour written anywhere else | The same file, vendored unchanged (`admin/build/vendor-vd.mjs`), in the site and the extension; the same five schemes to choose from; the gate refuses a colour outside it |
| Brand | Voice*Debrief*, with BETA as permanent chrome | Voice*Debrief* MeetScribe, with BETA, in the site and in every extension page |
| Cost | Read back from OpenRouter, "unknown" never zero | `usage.cost` as reported; a missing cost is counted, never zero |
| Stack | Static, vanilla JS, web components, no framework, no build step | Static, vanilla JS modules, no framework, no build step, no dependencies |

## What differs, and why

- **Privacy wording, stricter for the beta.** MeetScribe adds one sentence to voicedebrief.ai's: do not use it for confidential meetings, because once audio reaches OpenRouter we cannot see or verify what happens to it. Its zero-data-retention option is described as a request to OpenRouter, not a guarantee (the v0.3.1 review, finding 03).

- **How the audio is transcribed.** voicedebrief.ai sends a whole voice note to a chat model (`google/gemini-3.5-flash`) as audio input. MeetScribe sends 8 to 30 second segments to OpenRouter's speech-to-text endpoint, because a meeting is long, arrives live, and must not be lost if one request fails. The model is chosen in the Phase 0 bake-off; Gemini through the chat route is one of the candidates worth adding to it.
- **Speakers.** A voice note has one speaker. A meeting has **You** (your microphone) and **Meeting** (the call). Nothing more is claimed.
- **No infographic yet.** It is an optional step on the website; it can follow the same way.
- **No translation step yet.** The debrief is written in the reader's language directly, as voicedebrief.ai's prompt also instructs. A separate translation of the transcript, as the website does, is the next step if it is wanted.
- **Where the key is kept.** In the extension's storage, not the website's `localStorage`: the two are different origins and cannot share it. The same key works in both.

## The path into voicedebrief.ai

The extension is the only way to capture a Meet tab's audio without a prompt each time, so the extension stays. What moves is everything after the capture:

1. **The pure modules** in `extension/lib/` (`wav`, `vad`, `openrouter`, `queue`, `transcript`, `debrief`, `prompts`) use no extension API except `db` and `settings`. They can be served by the website as they are, as versioned, immutable files, which is how it publishes its components.
2. **A meetings page on voicedebrief.ai** can read an exported meeting (the JSON export, `meetscribe/meeting` version 1) and offer the website's own steps on it: translation, the debrief, the infographic, the chat.
3. **A web-only capture** is possible too: a page can capture a tab's audio with `getDisplayMedia`, after the user picks the tab in Chrome's dialog. It is one more click per meeting and no install, and could live at `voicedebrief.ai/tools/` with the same modules. This is [[proposed]], not built.

When the website adopts any of these, it takes the files at a version, and this repository's tests stay the gate for them.
