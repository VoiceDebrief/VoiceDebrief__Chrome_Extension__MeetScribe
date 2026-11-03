# What is built in v0.3.0

The first MVP: Phase 0's recorder plus most of Phase 1's queue. This page is the reality file: if something is not listed here as built, it does not exist yet, whatever [brief v2.0](../brief/index.md) says.

> **Tested in Chromium with a fake audio device and a local server replaying OpenRouter responses. Not yet tried on a real Google Meet call or with a real OpenRouter key.** The replayed responses are shaped from OpenRouter's documented examples, not recorded. The first real run should record some to replace them (`tests/fixtures/openrouter/README.md`).

## Built

| Brief v2.0 | What | Where | Tested |
|---|---|---|---|
| 4.1 | Tab capture: stream ID from the side panel's Start click, redeemed in an offscreen document, played back so you keep hearing the meeting, on the output device you chose (`setSinkId`) | `sidepanel.js`, `offscreen.js` | [[built]] in Chromium with a fake device standing in for the tab; [[spike]] S1, S8 on a real call |
| 4.2 | Microphone: opt-in per meeting, granted once on the options page, separate mute in the panel and on <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>M</kbd>, the "separate from Meet's mute" sentence | `options.js`, `offscreen.js`, `service-worker.js` | [[built]] A8: no mic segments when off, none while muted |
| 4.3 | AudioWorklet taps in a 16 kHz context (resampled in JS if Chrome refuses the rate); one sample clock per channel | `worklet.js`, `offscreen.js` | [[built]] |
| 4.4 | Cuts at pauses: energy against an adaptive floor, 8 s minimum, 600 ms pause, 2 s idle close, 30 s forced cut, silence dropped | `lib/vad.js` | [[built]] 8 unit tests on audio with a known shape |
| 4.5 | Each segment is checked by its bytes before sending; one that fails is kept as `invalid`, never sent | `lib/wav.js`, `lib/queue.js` | [[built]] unit and Chromium |
| 5.1 to 5.4 | The request (`verbose_json`, `provider.zdr`), fallback to `json` remembered per model, the errors table, backoff with jitter and `Retry-After`, the key check on a network-shaped error, leases | `lib/openrouter.js`, `lib/queue.js`, `lib/db.js` | [[built]] A4 (no double send under two drains), A7, retry, fallback |
| 6 | Lines from model output kept as returned; gaps shown; **You** and **Meeting** by channel; `probable-echo` and `suspect` flags; `≈` for times that are a segment's start | `lib/transcript.js` | [[built]] |
| 8 | IndexedDB without a library: meetings, segments, audio apart, lines; `unlimitedStorage`; retention of transcribed audio; delete a meeting; delete all | `lib/db.js` | [[built]] A12 |
| 9 | The manifest exactly as specified; the validator refuses any other | `manifest.json`, `admin/build/validate.mjs` | [[built]] |
| 10 | Side panel, options (key test, microphone grant, devices, live model list, retention, provenance), meetings page (play the audio a line came from, retry, export TXT, Markdown, JSON, delete) | `sidepanel.*`, `options.*`, `meetings.*` | [[built]] pages load without errors |
| 7 | The debrief: voicedebrief.ai's summary prompt made for a meeting (Key points, Decisions, Actions, Open questions, In one sentence, each point timed), in voicedebrief.ai's four locales' language and tone, `google/gemini-3.5-flash` by default; probable echoes left out of what the model reads; stored apart from the transcript, which it never changes; rendered as text, never HTML; in the Markdown and JSON exports | `lib/prompts.js`, `lib/debrief.js`, `meetings.js` | [[built]] unit and Chromium |
| - | VoiceDebrief alignment: its colour schemes (vendored, five, chosen on the options page, allowlisted), brand and BETA mark, `routingHonest` and `modelCaveat` sentences, key guidance. [The details](../voicedebrief/index.md) | `vd-tokens.css`, `lib/theme.js`, every page | [[built]] Chromium; the gate refuses a colour outside `vd-tokens.css` |
| 14 | Session states, stop on tab close, an interrupted capture marked after a restart, the queue resumed by an alarm | `service-worker.js` | [[built]] in part: restart recovery is not yet tested |

## Not built yet

- Translation of the transcript as a separate artefact, the declared workflow, and the infographic (brief v2.0, section 7; voicedebrief.ai has all three).
- Edits as a revision layer (6.3). The transcript is read-only.
- A per-meeting budget, and enabling the icon only on Meet pages through `declarativeContent`. It is not in the manifest, because a permission nothing uses is a permission too many.
- A release zip and the Chrome Web Store.

## What building it corrected

These go into the brief's next version.

1. **An offscreen document has `chrome.runtime` and nothing else.** Brief v2.0 has the offscreen document drain the queue, and the queue reads its settings from `chrome.storage`, which does not exist there. The first Chromium run showed segments stuck in `sending`: the error came after the lease was taken. Now the offscreen document asks the service worker for settings, and an unexpected error gives the lease back at once instead of stranding the segment for 90 seconds.
2. **A drain needs a way to hand back a lease on any error, not only on the ones it expects.** This was the same incident; `processOne` now wraps the whole send.
3. **The test runner read Node's output, and Node changed it.** The first CI run on `dev` passed all 38 tests and still failed. GitHub's runner has Node 24, whose default test reporter prints `ℹ tests 12` where Node 22 printed `# tests 12` when piped, so the runner counted zero tests. It refused, as it was written to: a file that runs no tests is a failure. It now asks for the TAP reporter by name.
4. **The repository's `.gitignore` hid the code.** GitHub's Python template ignores `lib/` and `build/`, so `extension/lib/` and `admin/build/` were left out of the first commits without a word. It was found by checking a fresh clone before the first push of the extension, and replaced.
5. **The microphone's clock starts later than the tab's.** `getUserMedia` takes time, so the microphone channel's first sample is set from the capture context's current time, not zero. Otherwise a **You** line would sort before the **Meeting** line it answers.
