# Review of the MeetScribe brief v1.0

The [v1.0 brief](../brief/v1/index.md) was drafted by ChatGPT. This page checks it, claim by claim, against the documentation as it stands on 3 November 2026 and against what the sgit.ai and VoiceDebrief projects have already learnt the hard way. The result is [brief v2.0](../brief/index.md).

> **Verdict: feasible, with high confidence for the core path.** Every API the brief depends on exists, is documented and is in use elsewhere: Chrome's tab capture into an offscreen document, `getUserMedia` for the microphone, and OpenRouter's `/api/v1/audio/transcriptions`. Nothing needs Google's cooperation. What the brief gets wrong is not whether it can be built but *how*: four of its choices produce failures that do not throw. They return a fluent transcript of the wrong thing, or a silent gap, and you find out weeks later.

## The short version

| | Count | What |
|---|---|---|
| [[keep]] | 14 | Facts and principles that hold: OpenRouter's endpoint, request shape, `verbose_json`, the 60-second timeout and model filter; Business Starter has no Meet transcripts; the Meet Media API is being shut down; the offscreen-document capture pattern; persist before sending; never discard; never let an LLM rewrite the transcript; never invent a cost |
| [[wrong]] | 6 | Choices that would fail silently or contradict the brief's own rules (below, R1 to R6) |
| [[missing]] | 11 | Things a real meeting will hit that the brief does not mention (R7 to R17) |
| [[change]] | 6 | Choices that work but cost more than they return: the stack, the tests, the summariser, the default model, the popup, the spending limit (R18 to R23) |

The four that matter most, in order: **R1** (the segments MediaRecorder produces are not decodable files), **R4** (the microphone is captured even when you are muted in Meet), **R2/R3** (fixed 20-second cuts plus silence produce invented text) and **R5** (without headphones your microphone channel transcribes the other people and labels them "You").

## What the brief gets right

Each of these was checked against the source on 3 November 2026. The [sources page](../sources/index.md) has the links.

| Claim in v1.0 | Status | Evidence |
|---|---|---|
| Business Starter does not include Google Meet transcripts | [[verified]] | Google's Meet help lists the editions with transcripts: Business Standard and Plus, Enterprise Starter, Standard and Plus, Teaching and Learning Upgrade, Education Plus, Workspace Individual. Business Starter is not on it. "Take notes for me" is Business Standard and above. |
| The Google Meet Media API is "discontinued" | [[verified]] | Meet REST API release notes, 28 October 2026: Google will "wind down the Google Meet Media API and permanently turn down its endpoints on January 15, 2027". Strictly it is deprecated, not yet gone; either way, not a foundation. |
| `POST https://openrouter.ai/api/v1/audio/transcriptions`, Bearer auth, `input_audio: {data, format}`, `language`, `response_format: "verbose_json"` | [[verified]] | OpenRouter's Speech-to-Text guide documents exactly this body, plus `temperature`, `timestamp_granularities` and `provider`. |
| Discover models with `?output_modalities=transcription` | [[verified]] | Works; returned 29 models on 3 November 2026 ([the snapshot](../models/index.md)). |
| `verbose_json` is not universal; fall back to plain text | [[verified]] | OpenRouter: providers without structured output reject it with a 400, "as do some individual models (for example `openai/gpt-4o-transcribe` and `microsoft/mai-transcribe-1.5`)". |
| Upstream timeout of about 60 seconds | [[verified]] | OpenRouter: "upstream providers time out after 60 seconds per request". |
| Cost is reported per request; do not invent it | [[verified]] | The response carries `usage.seconds` and `usage.cost` in USD. |
| Tab audio stops playing once captured; route it to an `AudioContext` | [[verified]] | Chrome's screen-capture guide does exactly this ("Continue to play the captured audio to the user"). |
| `getMediaStreamId` from a user gesture, redeemed with `getUserMedia` in an offscreen document | [[verified]] | Chrome's guide; `tabCapture` in a service worker from Chrome 116. |
| Service workers must not own media streams | [[verified]] | MV3 service workers are terminated when idle; the offscreen document is the supported home. |
| Persist audio before sending; never discard on API failure; segment IDs for idempotency | [[keep]] | The right instinct, and the chrome-extensions hub's first lesson ("build a deliberately stupid recorder first: just keep the bodies"). |
| Do not let an LLM silently rewrite the canonical transcript | [[keep]] | VoiceDebrief issue 055 reached the same rule: "the transcript is never overwritten. It is the record of what was actually said." |
| Do not present chunk timing as word timing; do not invent speakers | [[keep]] | The hub's fourth sentence: missing is `null`, and `null` never becomes `0`. |
| Start with one path: capture, one segment, one request, display | [[keep]] | Section 24 of v1.0 is the best section in it. v2.0 makes it Phase 0 with go/no-go questions. |

## What is wrong

### R1. MediaRecorder segments are not standalone files [[critical]]

v1.0 section 7.5 says "MediaRecorder, with conversion where required" and 7.4 asks for 20-second segments. The obvious implementation is `recorder.start(20000)` and one `dataavailable` blob per segment. **Only the first blob carries the WebM header.** Blobs 2 to n are continuation clusters: not decodable on their own. Send one to a transcription model and you do not reliably get an error. VoiceDebrief already found out what you get instead (issue 025, 5 August 2026): an undecodable input produced "a fluent, confident transcript of audio the user never recorded", different on every run.

**Fix:** own the samples. An `AudioWorklet` in the offscreen document takes each channel, downsamples to 16 kHz mono and writes PCM; each segment is wrapped as a WAV with its own header. WAV is the format OpenRouter recommends for accuracy, it is trivially valid, and the sample counter becomes the clock (which also answers 7.3's "consistent audio clock"). 20 seconds of 16 kHz 16-bit mono is 640 KB, 853 KB as base64: well inside every limit. Compression (Opus through WebCodecs) is a later optimisation, not an MVP need. Before anything is sent, the segment is checked by content (RIFF header, sample count, non-zero energy), never by the label we gave it.

### R2. Fixed 20-second cuts, overlap and de-duplication [[wrong]]

Cutting every 20 seconds cuts through words, and v1.0's remedy (an overlap, then removing duplicate text "without deleting legitimate repeated speech") is a hard problem that the brief hands to the implementer in one sentence.

**Fix:** cut at pauses. A voice activity detector (energy with an adaptive noise floor to start; a bundled Silero-class model later if needed) closes a segment at the first pause after a minimum length (about 8 s), aims for 15 to 25 s, and forces a cut at 30 s only in unbroken speech. No overlap, so no de-duplication. Forced cuts are marked on the segment so the rare boundary error is explainable.

### R3. Silence becomes invented text [[wrong]]

A meeting is mostly silence on any one channel: your microphone while others speak, the tab while you speak. Whisper-family models are known to produce stock phrases from silence and noise ("Thank you for watching"). v1.0 sends every segment.

**Fix:** the same VAD drops segments with no speech before they are queued, and records that it did (a span of `silence` in the timeline, so a gap is explained, not missing). Returned text that matches a short list of known hallucination phrases is kept but flagged, never deleted. This also halves the bill for two channels (R9).

### R4. Your microphone is recorded while you are muted in Meet [[critical]]

v1.0 captures the microphone with its own `getUserMedia`. That stream does not know about Meet's mute button. Mute yourself in Meet to talk to someone in the room, and MeetScribe transcribes it, labelled "You", and sends it to a third party. The brief never mentions this.

**Fix:** the microphone channel is opt-in per meeting, has its own mute in the side panel and on a keyboard shortcut (`chrome.commands`), and the panel says plainly that MeetScribe's mute and Meet's mute are separate. Mirroring Meet's mute state needs a content script reading Meet's page (host permission, and Meet's DOM changes): v2.0 lists it as proposed, not MVP, and never as the only safeguard.

### R5. Without headphones, the microphone hears the meeting [[wrong]]

On laptop speakers the microphone channel picks up the remote participants. v1.0's main benefit of separate channels ("label locally captured speech as **You**") then labels other people's words as yours, and the transcript says everything twice. Whether Chrome's echo canceller removes audio replayed by the extension's own `AudioContext` is not documented.

**Fix:** request `echoCancellation: true`, then measure it in Phase 0 (spike question S3). If leakage remains, a cross-channel check marks a microphone line as `probable-echo` when the tab channel carried near-identical text in the same window. Marked, shown dimmed, never deleted.

### R6. The data model contradicts the brief's own rules [[wrong]]

`Meeting.totalCostUsd: number` cannot represent "the provider did not say", which section 8.6 requires. `TranscriptSegment.status: "completed" | "edited"` overwrites the model's text on edit, which 9.3 forbids. v2.0: costs are `number | null` with a separate count of requests whose cost is unknown; edits are a revision layer over an immutable model output.

## What is missing

### R7. The meeting moves to the wrong speakers [[missing]]

The replayed tab audio goes to the `AudioContext`'s default output device. If Meet was set to a headset and the system default is the laptop speakers, starting MeetScribe moves the meeting to the speakers mid-call. **Fix:** an output-device setting and `AudioContext.setSinkId()`; Phase 0 confirms the behaviour.

### R8. The popup cannot be the live view [[missing]]

v1.0 puts the active view in the popup. A popup closes the moment focus leaves it, which during a meeting is always. **Fix:** Chrome's side panel (as Fix the Page's playground does): it stays open beside Meet, follows the tab and holds the live transcript and controls. The popup can go entirely.

### R9. Two channels cost twice [[missing]]

Billing is per second of audio sent. Two always-on channels double it. With VAD (R3) each channel is billed only for its speech, so two channels cost about what one mixed channel would.

### R10. Asking for the microphone from an invisible page [[missing]]

An offscreen document is never shown, so it has nowhere to display Chrome's permission prompt, and a prompt raised from a popup closes the popup. **Fix:** a one-time setup page (a normal extension tab) asks for the microphone for the extension's origin; the offscreen document then uses that grant. Phase 0 confirms (S2).

### R11. Large data across message boundaries [[missing]]

`chrome.runtime.sendMessage` serialises to JSON: a `Blob` arrives as `{}` and large payloads hit a size limit. The chrome-extensions hub lists exactly this as one of its six silent failures ("a boundary that fails only when data gets big"). **Fix:** audio never crosses a message. The offscreen document writes segments to IndexedDB; messages carry IDs.

### R12. Storage that can be evicted [[missing]]

A two-hour meeting with the network down is up to 460 MB of queued WAV (two channels at 32 KB/s; VAD makes it far less in practice). **Fix:** the `unlimitedStorage` permission and `navigator.storage.persist()`; transcribed audio deleted on the retention schedule.

### R13. Two contexts sending the same segment [[missing]]

The offscreen document drains the queue during capture; after it, the service worker or the dashboard does. Segment IDs stop a duplicate *insert*, not a duplicate *charge*. **Fix:** a lease on each segment (`claimedBy`, `claimedUntil`) taken in an IndexedDB transaction before sending.

### R14. A rejected key looks like a network error [[missing]]

VoiceDebrief issue 032: when OpenRouter rejects a disabled key, the browser can receive the rejection without CORS headers, and `fetch` throws a bare `Failed to fetch`. **Fix:** in an extension, a host permission for `https://openrouter.ai/*` lifts the CORS restriction for extension pages, so the real 401 is readable; and on any network-shaped error the extension asks `GET /api/v1/key` before telling the user what went wrong.

### R15. Consent per meeting, and a notice for the others [[missing]]

v1.0 asks once at setup. Meet's own recording tells everyone in the call; MeetScribe cannot. **Fix:** the start dialog asks every meeting, and offers a one-click copy of a short notice to paste into Meet's chat. MeetScribe does not post it itself (that would mean scripting Meet's page).

### R16. Build provenance [[missing]]

The hub's first silent failure was ten days of testing an old build. **Fix:** the options page shows version, commit and build time, stamped at packaging, as Fix the Page does.

### R17. Telling the user where the audio goes, honestly [[missing]]

OpenRouter does not apply provider routing (`order`, `only`, `ignore`) to transcription requests; only the data-policy preferences (`zdr`, `data_collection`) apply. So the extension cannot promise which provider hears the meeting, only the policy it asked for. **Fix:** v2.0 sends `provider: { zdr: true }` by default, says which provider served each request when OpenRouter reports it, and uses VoiceDebrief's wording: the audio goes to OpenRouter and on to a provider we do not control.

## What to change

### R18. The stack [[change]]

v1.0: TypeScript, Vite with CRXJS, React, Tailwind, Zustand, Dexie. Six dependencies and a bundler for an extension with five small pages. The house style across sgit.ai and VoiceDebrief is native web components, no framework and no build step ([coding.sgit.ai/javascript](https://coding.sgit.ai/javascript/index.html); VoiceDebrief's CLAUDE.md: "No SPA frameworks by default"). For an extension the case is stronger: MV3 forbids remotely hosted code, so nothing can be imported from the tools origin the way the VoiceDebrief site does; a Web Store reviewer reads what ships; and a release zip that is the source byte for byte (Fix the Page's validator checks this) is only possible without a bundler. **v2.0:** ES modules and web components, no runtime dependencies, a 100-line IndexedDB wrapper instead of Dexie, types as JSDoc checked by `tsc --noEmit --checkJs --strict` (types without a build).

### R19. "Mocked OpenRouter responses" [[change]]

The estate's rule is no mocks ([nfrs.sgit.ai/testing](https://nfrs.sgit.ai/testing/index.html)). **v2.0:** responses recorded from real calls are replayed by a local server; Chromium's own fake-media flags (`--use-fake-device-for-media-stream`, `--use-file-for-fake-audio-capture=<wav>`) drive the microphone with known audio; a local page plays known audio into the tab that is captured; a keyless demo aborts any network request rather than faking one (VoiceDebrief issue 063).

### R20. Hierarchical summarisation from day one [[change]]

A two-hour meeting is roughly 18,000 to 25,000 words, about 25,000 to 35,000 tokens: one request for any current long-context model. **v2.0:** one pass with segment IDs as citations; split only when the transcript measurably exceeds the chosen model's context. Add VoiceDebrief's translate-before-summarise step for Portuguese meetings (issue 055).

### R21. `openai/whisper-1` as the default [[change]]

At $0.0001 per second ($0.36 an hour) it is the most expensive Whisper on OpenRouter. `openai/whisper-large-v3` lists from $0.027 an hour and `whisper-large-v3-turbo` from $0.012 (the [models page](../models/index.md) has the snapshot). Because OpenRouter does not apply provider ordering to transcription, the provider that serves a request, and so its price, can vary; `usage.cost` is the only number to show. **v2.0:** no default is picked from a price list. Phase 0 runs a bake-off on your own recordings (English, Portuguese, mixed) and the winner becomes the default.

### R22. A soft spending limit in the extension [[change]]

A limit enforced by the client is a suggestion. **v2.0:** the limit lives on the key: a dedicated OpenRouter key for MeetScribe with a credit limit and, if wanted, a model allowlist (the guidance on [voicedebrief.ai/openrouter-key](https://voicedebrief.ai/openrouter-key/)). The extension's per-meeting budget is a second, friendlier line.

### R23. Remote speaker names as a vague "later" [[change]]

Two concrete routes exist and v2.0 names both as proposed. (a) OpenRouter passes diarization options to some providers (Azure, Deepgram, Mistral's Voxtral 3) through `provider.options`; but speaker indices are per request, so "speaker 0" in one segment is not "speaker 0" in the next, and the labels must say so. (b) Meet's own live captions, available on every edition including Business Starter, carry speaker names; reading them means a content script on `meet.google.com` and depending on Meet's DOM. Neither is MVP.

## Section by section

| v1.0 section | Verdict | In v2.0 |
|---|---|---|
| 1 Executive summary | [[keep]] | Kept; the one rule added |
| 2 Scope | [[change]] | Side panel instead of popup; cost and history move to MVP-later |
| 3 Users | [[keep]] | Kept |
| 4 User experience | [[change]] | Consent per meeting; separate mic mute; side panel |
| 5 Interface | [[change]] | Side panel, setup page, dashboard, options with provenance |
| 6 Architecture | [[change]] | Contexts table; who owns what; no audio across messages |
| 7 Audio capture | [[wrong]] | PCM worklet, WAV per segment, VAD cuts, output device |
| 8 OpenRouter | [[keep]] | Kept, plus `zdr`, key check, lease, cost as `null` |
| 9 Transcript | [[change]] | No overlap stitching; revision layer; echo marks |
| 10 Summaries | [[change]] | One pass; translate first; citations by segment ID |
| 11 Storage | [[wrong]] | `null` costs; `unlimitedStorage`; leases |
| 12 Structure | [[change]] | No bundler; `extension/` folder like Fix the Page |
| 13 Permissions | [[change]] | `declarativeContent`, `sidePanel`, `unlimitedStorage`, `alarms`; host permission only for OpenRouter |
| 14 Lifecycle | [[keep]] | Kept, with the interrupted state made explicit |
| 15 Errors | [[keep]] | Kept, plus key-check and hallucination rows |
| 16 Privacy | [[change]] | Honest routing statement; ZDR by default; mic disclosure |
| 17 Export | [[keep]] | Kept |
| 18 Testing | [[change]] | Recorded real responses, Chromium fake media, keyless demo |
| 19 Acceptance | [[change]] | Measurable thresholds; the silent failures as tests |
| 20 Phases | [[change]] | Phase 0 spike with eight go/no-go questions |
| 21 Future | [[keep]] | Kept, with local Whisper (WebGPU) as a privacy mode |
| 22 Agent guidance | [[keep]] | Merged into the engineering rules |

## What this review did not do

It did not build anything. The four Chrome behaviours that only a real browser can settle (the gesture route for tab capture from the side panel, the microphone grant inheriting into the offscreen document, echo cancellation of replayed audio, `setSinkId` on the capture context) are written as questions for the [Phase 0 spike](../plan/index.md), not as facts. Prices are a dated snapshot and will move.
