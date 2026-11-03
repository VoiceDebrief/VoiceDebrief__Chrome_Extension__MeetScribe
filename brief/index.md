# MeetScribe brief v2.0

A Chrome extension that transcribes a Google Meet call you are in, on your own OpenRouter key, without Google's recording or transcription features, a bot in the call, or a server of ours.

| | |
|---|---|
| Version | 2.0, 3 November 2026 |
| Replaces | [v1.0](v1/index.md) (ChatGPT draft); every change is reasoned on the [review](../review/index.md) |
| Status | [[spec]] Specified, nothing built. The [plan](../plan/index.md) starts with a Phase 0 spike |
| Family | VoiceDebrief ([voicedebrief.ai](https://voicedebrief.ai)) for the product; the [chrome-extensions.sgit.ai](https://chrome-extensions.sgit.ai) hub for how extensions are built |
| Owner | Dinis Cruz, editor |

Status marks used below: [[spec]] in this brief, to be built; [[spike]] a question Phase 0 must answer before the design is final; [[proposed]] an idea for the editor to accept or refuse, not in the MVP.

## 1. The one rule

> **MeetScribe listens only while you can see that it is listening, keeps every second it heard until that second is transcribed or you delete it, and never shows a guess as a fact.**

Everything below follows from it: a visible side panel instead of a hidden recorder; audio persisted before it is sent; a cost of `null` rather than a made-up `0`; a speaker label only where the channel proves it; a dimmed `probable-echo` line rather than a silent deletion.

## 2. Who it is for and what it does

The first user is one person on Google Workspace Business Starter, which has no Meet transcripts (Google's edition list stops at Business Standard), who already uses OpenRouter and wants transcripts and notes they hold themselves. Then freelancers, consultants and small teams on the same plan.

### In the MVP [[spec]]

- Start and stop by hand, from the side panel, on a `meet.google.com` tab.
- Two channels: the meeting (tab audio) and, if you opt in for this meeting, your microphone.
- You keep hearing the meeting, on the device you chose.
- Speech is cut at pauses, queued in IndexedDB, transcribed through OpenRouter, shown live in the side panel.
- Lines from your microphone are labelled **You**; lines from the tab are labelled **Meeting**. Nothing else is claimed about speakers.
- Nothing is lost: offline, rate-limited, out of credit, browser closed. Captured segments wait and are retried; failed ones are visible and can be retried by hand.
- After the meeting: a summary (decisions, actions, open questions) with each point citing the segments it rests on; optional translation first.
- History of meetings, edit with the original kept, export to TXT, Markdown and JSON.
- Cost per meeting as OpenRouter reported it, with requests whose cost was not reported counted separately.

### Later [[proposed]]

Remote speaker labels (section 13), search across meetings, a local Whisper engine as a "browser-local" privacy mode, Drive and Docs export, custom summary templates, a meeting assistant ("what did I agree to?").

### Never

A bot in the call. Google's recording, transcription or the Meet Media API (deprecated 28 October 2026, endpoints off 15 January 2027). Starting without a click. Hiding Chrome's capture indicator. A server of ours holding audio or transcripts. Video.

## 3. Architecture

### Who owns what

| Context | Lives | Owns | Never |
|---|---|---|---|
| Service worker | Wakes on events | Session state machine, commands, `tabs.onRemoved`, alarms to drain the queue after a restart | Holds a media stream or audio |
| Offscreen document (reason `USER_MEDIA`) | Only while capturing | Both streams, playback to the speakers, the worklet, VAD, writing segments, draining the queue during capture | Shows UI |
| Side panel | While open | Live transcript, start, stop, pause, mic mute, consent dialog, warnings | Holds audio |
| Setup page (an extension tab) | First run | API key, microphone grant, output device, test connection | |
| Dashboard (an extension tab) | On demand | History, transcript editing, summary, export, retries | |
| Options page | On demand | Settings, data deletion, build provenance | |

All contexts share the extension origin, so all read the same IndexedDB. Messages between them carry IDs and small state, never audio (a `Blob` sent through `chrome.runtime.sendMessage` arrives as `{}`).

### Data flow

```text
 Meet tab ──tabCapture.getMediaStreamId (user gesture)──┐
                                                        v
 Offscreen document                               getUserMedia(tab)      getUserMedia(mic, opt-in)
   tab stream ──► AudioContext ──► destination (setSinkId: your output device)
        │                                                              │
        └──► AudioWorklet: 16 kHz mono PCM, sample counter = clock ◄────┘   (one per channel)
                       │
                       ▼
               VAD: cut at pauses (8 s min, 15-25 s target, 30 s forced), drop silence
                       │
                       ▼
               WAV segment ──► IndexedDB  (status: pending)        ◄── persisted BEFORE any send
                                    │
                 drain (lease) ─────┤  offscreen during capture; service worker / dashboard after
                                    ▼
               POST openrouter.ai/api/v1/audio/transcriptions  { provider: { zdr: true } }
                                    │
                                    ▼
               transcript line (immutable model output) + usage.cost|null ──► side panel, dashboard
                                    │
                         after stop ▼
               (translate) ──► summary with segment citations ──► export
```

## 4. Capture

### 4.1 The meeting [[spec]] [[spike]]

The user's click on the extension is the gesture. The service worker calls `chrome.tabCapture.getMediaStreamId({ targetTabId })` (Chrome 116 and later), creates the offscreen document if absent, and passes it the ID. The offscreen document redeems it with `getUserMedia({ audio: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId } } })`, audio only.

Capturing silences the tab, so the offscreen document routes the stream to `AudioContext.destination` at once. The context's output goes to the device chosen in setup through `AudioContext.setSinkId()`, so the meeting does not jump from a headset to the laptop speakers.

Spike S1 decides the gesture route: (a) the action click opens the side panel and its Start button requests the stream ID, or (b) the action click itself starts capture and opens the panel. (a) is preferred because the consent dialog comes before any audio exists.

### 4.2 Your microphone [[spec]] [[spike]]

Opt-in per meeting, off by default. Granted once, for the extension's origin, from the setup page (an offscreen document cannot show a prompt, and a prompt from a popup closes it; spike S2 confirms the grant carries over). Requested with `echoCancellation: true, noiseSuppression: true, autoGainControl: true` and the device chosen in setup. Never routed to the speakers.

The side panel always shows the microphone's state, has its own mute, and says, in these words: *MeetScribe's microphone is separate from Meet's. Muting yourself in Meet does not mute MeetScribe.* A keyboard shortcut (`chrome.commands`, suggested <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>M</kbd>) toggles it from any tab. If the grant is refused or the device disappears, capture continues with the meeting channel and a visible warning.

### 4.3 Samples, not recorder blobs [[spec]]

MediaRecorder is not used for segments: with a timeslice only the first blob carries the container header, and the rest are not decodable files. Each channel goes through an `AudioWorklet` that downsamples to 16 kHz mono 16-bit PCM and posts frames to the offscreen document's main thread. The running sample count per channel is the clock: a segment's start and end are sample offsets from the session start, converted to milliseconds for display. Both channels start from the same `AudioContext.currentTime`, so they share one timeline.

Each segment is written as a WAV (RIFF header plus PCM): 32 KB per second, 640 KB for 20 seconds. Opus through WebCodecs is a later saving, not an MVP need.

### 4.4 Cutting at pauses [[spec]]

A voice activity detector per channel (RMS energy against an adaptive noise floor, with a 300 ms hangover) closes a segment at the first pause of at least 600 ms once the segment is 8 seconds long, and forces a cut at 30 seconds in unbroken speech. A forced cut is recorded on the segment (`cut: "forced"`). Segments with no speech are not stored as audio; the timeline records a `silence` span, so a gap is explained rather than missing. No overlap and no text de-duplication: a pause is a natural boundary.

### 4.5 Checked by content before sending [[spec]]

Before a segment is queued: the bytes start with `RIFF....WAVE`, the sample count matches the declared duration, and the energy is not zero. A segment that fails is marked `invalid` with the reason and kept for inspection. Never trust a label we wrote ourselves (VoiceDebrief issue 025).

## 5. Transcription

### 5.1 The request [[spec]]

```text
POST https://openrouter.ai/api/v1/audio/transcriptions
Authorization: Bearer <key from chrome.storage.local, never logged>
{
  "model": "<chosen in setup>",
  "input_audio": { "data": "<base64 WAV>", "format": "wav" },
  "language": "<ISO-639-1, or omitted for auto-detect>",
  "response_format": "verbose_json",
  "timestamp_granularities": ["segment"],
  "temperature": 0,
  "provider": { "zdr": true }
}
```

If the model rejects `verbose_json` with a 400, the extension records that for the model and retries with `json`; lines from that model show segment-level time only. The extension never sets `prompt` at the top level (OpenRouter accepts and ignores it); continuity prompts for providers that support them go under `provider.options` and are [[proposed]].

### 5.2 The response [[spec]]

Validate the status, then the shape. Store `text`, `segments` (offsets added to the audio segment's start), `language`, `usage.seconds`, `usage.cost` (or `null`), and the `X-Generation-Id` header. The model's output is immutable once stored.

Text that matches a known hallucination phrase ("thank you for watching", "subtitles by", and the like, a list kept in the repository with its sources) is flagged `suspect`, shown dimmed, never deleted.

### 5.3 The queue [[spec]]

Segments are `pending`, `sending`, `done`, `failed` or `invalid`. Before sending, a context takes a lease (`claimedBy`, `claimedUntil` = now + 90 s) in an IndexedDB transaction; a lease that expires returns the segment to `pending`. Two requests in flight per meeting at most. The offscreen document drains during capture; afterwards an `alarms` tick in the service worker and the open dashboard do. A browser restart resumes the drain.

### 5.4 Errors [[spec]]

| Response | Meaning | What happens |
|---|---|---|
| 200 | Done | Store, show, release the lease |
| 400 | Bad request | `verbose_json` rejected: retry once as `json`. Otherwise `failed` with the message; no retry |
| 401, 403 | Key rejected | Stop sending for every meeting; the panel names the key, not the network |
| 402 | Out of credit | Stop sending; keep capturing; say so; resume when the key works |
| 413 | Too large | Should not happen at 30 s maximum; `failed`, reported as a bug |
| 429, 529 | Rate limit, overloaded | Respect `Retry-After`; back off with jitter |
| 500, 502, 503, 504, 524 | Upstream or timeout | Back off with jitter, up to 5 attempts, then `failed` with a manual retry |
| `Failed to fetch` | Network, or a key rejected without CORS | Ask `GET /api/v1/key`. Rejected: treat as 401. Accepted: offline; keep the queue, retry on `online` |

Backoff: 2, 4, 8, 16, 32 s, each with up to 50% jitter.

### 5.5 Choosing the model [[spike]]

No default is chosen from a price list. Phase 0 transcribes the same recordings (English, Portuguese, mixed, one with crosstalk) with four to six candidates from the [snapshot](../models/index.md), and the editor picks on quality, then cost from `usage.cost`, then latency, then `verbose_json` support. Starting candidates: `openai/whisper-large-v3`, `openai/whisper-large-v3-turbo`, `mistralai/voxtral-mini-transcribe-3-0`, `nvidia/nemotron-3.5-transcribe`, `elevenlabs/scribe-v2`, `openai/gpt-transcribe`. The setup page lists the live catalogue (`/api/v1/models?output_modalities=transcription`) so the user can pick another.

## 6. The transcript

### 6.1 Lines [[spec]]

One line per returned segment (or per request, where the model gives no segments). Ordered by the audio segment's start sample, so out-of-order responses settle into place. A gap where a segment is `pending` or `failed` is shown as such, with a retry button: the transcript is never silently shorter than the meeting.

### 6.2 Labels [[spec]]

**You** for the microphone channel, **Meeting** for the tab. A microphone line whose text closely matches a tab line overlapping it in time is marked `probable-echo` and shown dimmed (spike S3 measures how often). No other speaker labels in the MVP.

### 6.3 Edits [[spec]]

Edits are a revision layer: `{ lineId, text, editedAt }`. The model's text stays; export offers edited (default) or original. Reprocessing never touches an edit.

### 6.4 Time [[spec]]

Every line has a start time to the millisecond on the session clock, honestly labelled: `≈` when it is the audio segment's start, exact when the model returned segment timestamps.

## 7. After the meeting

Declared as a small workflow file, as VoiceDebrief's pass is (issue 042): steps, model, ceiling per step, what to do on failure.

1. **Drain** until no segment is `pending` or `sending` (or the user proceeds with gaps, which the summary is told about).
2. **Translate** [[spec]], optional, on when the detected language differs from the summary language. The transcript is never replaced; the translation is a separate artefact. On failure the summary runs on the original.
3. **Summarise** [[spec]] with a chosen text model through `/api/v1/chat/completions`, in one request. Split into sections and merge only when the transcript is measured to exceed the model's context. The prompt requires: an executive summary; discussion points; decisions *explicitly* agreed; action items with owner and due date only where stated, otherwise `null`; open questions; suggestions kept apart from commitments; every item citing segment IDs, which the dashboard turns into links. Output is JSON, validated against a schema before display.

A failed summary leaves the transcript untouched.

## 8. Storage

IndexedDB through a small wrapper, no library. `chrome.storage.local` holds settings and the key only. Permission `unlimitedStorage`, and `navigator.storage.persist()` on first run.

```ts
// Types shown as TypeScript for reading; the code carries them as JSDoc.
type Meeting = {
  id: string; title: string; tabTitle: string | null;
  startedAt: string; endedAt: string | null;
  status: 'capturing' | 'paused' | 'draining' | 'complete' | 'interrupted';
  sampleRate: 16000; channels: ('tab' | 'mic')[];
  model: string; language: string | null;
  costUsd: number;            // the sum of reported costs only
  costUnknownRequests: number; // requests whose cost was not reported
};
type AudioSegment = {
  id: string; meetingId: string; channel: 'tab' | 'mic'; seq: number;
  startSample: number; endSample: number; cut: 'pause' | 'forced' | 'stop';
  wav: Blob | null;            // null once deleted under the retention policy
  status: 'pending' | 'sending' | 'done' | 'failed' | 'invalid';
  attempts: number; lastError: string | null;
  claimedBy: string | null; claimedUntil: number | null;
};
type Line = {
  id: string; meetingId: string; segmentId: string; channel: 'tab' | 'mic';
  startMs: number; endMs: number; timing: 'segment-start' | 'model';
  text: string;                // immutable model output
  flags: ('suspect' | 'probable-echo')[];
  model: string; generationId: string | null; costUsd: number | null;
};
type Edit = { lineId: string; text: string; editedAt: string };
type Summary = { id: string; meetingId: string; model: string; generatedAt: string;
  sourceLanguage: string | null; language: string; json: object; costUsd: number | null };
```

Retention defaults: transcripts and summaries until deleted; audio deleted 7 days after its segment is `done` (setting: immediately, 7 days, 30 days, keep); `failed` and `invalid` audio kept until retried or deleted. Delete meeting and Delete all data remove every row and blob, then report the count.

## 9. Permissions

| Permission | Why | Warning at install |
|---|---|---|
| `tabCapture` | The meeting's audio | No |
| `offscreen` | A document to hold the streams | No |
| `activeTab` | Confirm the invoked tab is `meet.google.com` | No |
| `sidePanel` | The live view | No |
| `declarativeContent` | Enable the icon only on `meet.google.com`, without reading any page | No |
| `storage`, `unlimitedStorage` | Settings; audio queue that is not evicted | No |
| `alarms` | Resume the queue after the service worker sleeps | No |
| `host_permissions: https://openrouter.ai/*` | Transcription and summary requests, readable errors | Yes: "Read and change your data on openrouter.ai" |

Not requested: `tabs`, `<all_urls>`, `meet.google.com` host access, `scripting`, `history`, `webRequest`, `debugger`. The microphone is a web permission granted on the setup page, not a manifest permission. `minimum_chrome_version: "116"`.

```json
"content_security_policy": {
  "extension_pages": "script-src 'self'; object-src 'self'; connect-src https://openrouter.ai"
}
```

## 10. Interface

- **Side panel** [[spec]]: idle (Meet detected, model, mic choice, Start); consent dialog; active (elapsed, channel meters, mic mute with the separate-mute sentence, queue counts `sent / pending / failed`, live lines, Pause, Stop); after (drain progress, Open in dashboard).
- **Setup page** [[spec]]: key with Test (`GET /api/v1/key`, shows the key's limit and usage), how to make a capped key, microphone grant and choice, output device with a test tone, model picker from the live catalogue, language.
- **Dashboard** [[spec]]: history on the left; transcript with search, edit and retry in the middle; summary on the right; export.
- **Options** [[spec]]: retention, budget per meeting, summary model and language, delete all; build provenance (version, commit, build time).

Pause stops capture (no audio exists for the paused span); it does not merely pause sending.

## 11. Privacy, consent, security

- **Where the audio goes.** Audio is captured on your machine and sent to OpenRouter, and from there to a model provider OpenRouter chooses. MeetScribe asks for zero-data-retention routes (`provider.zdr: true`) and shows the provider when OpenRouter reports it; it does not promise which provider hears your meeting. Transcripts, summaries and audio otherwise stay in this browser profile.
- **Consent, every meeting.** The start dialog: *You are about to transcribe this meeting. Tell the other participants, and stop if anyone objects. Recording or transcribing without consent is unlawful in some places.* With a Copy notice button (*"I'm using MeetScribe to transcribe this call on my own machine; the audio goes to a transcription service. Say if you'd rather I didn't."*). MeetScribe does not post it for you.
- **Visible.** Chrome's own capture indicator is never hidden; the icon badge shows while capturing; stopping is one click or the tab closing.
- **The key.** In `chrome.storage.local`, never in logs, exports, URLs or errors; replaceable and clearable. Use a dedicated OpenRouter key with a credit limit; that limit is the real spending cap.
- **The code.** No remote code, no `eval`, CSP above, transcript text rendered with `textContent` only, every message between contexts validated against its expected shape, no telemetry.

## 12. Engineering rules

1. ES modules and native web components; no framework, no bundler, no runtime dependencies. Types as JSDoc, checked with `tsc --noEmit --checkJs --strict` in CI.
2. `extension/` is what ships; the release zip equals it byte for byte, with a SHA-256 beside it.
3. Tests with no mocks: recorded real OpenRouter responses replayed by a local server; Chromium's fake media (`--use-fake-device-for-media-stream`, `--use-file-for-fake-audio-capture`) for the microphone; a local page playing known audio for the tab; a keyless demo that aborts any network request.
4. The silent failures are tests: a non-first MediaRecorder chunk is rejected by the content check; a `Blob` never crosses a message; a cost that was not reported stays `null`; a segment is never sent twice under concurrent drains; silence produces no request.
5. A validator gates every release: manifest permissions are exactly section 9's, no `fetch` outside `openrouter.ai`, no `innerHTML` with data, no key-shaped string (`sk-or-v1-`) anywhere.
6. British English, no em-dashes, in the code's strings and the site.

## 13. Speaker labels, later [[proposed]]

- **Diarization through OpenRouter.** Some providers accept diarization under `provider.options` and return a `speaker` index per segment. Indices are per request, so labels would read "Speaker A (this segment)" unless segments are longer or voices are matched across them. Needs its own spike.
- **Meet's captions.** Meet's live captions work on every edition and carry names. Reading them needs a content script and host access to `meet.google.com`, and depends on Meet's page structure. If adopted: read-only, opt-in, used only to suggest names for **Meeting** lines, never to replace audio transcription.

## 14. Acceptance criteria

| ID | Criterion | Measured by |
|---|---|---|
| A1 | Starts on Business Starter with Meet's recording and transcripts unused | Manual, on a Business Starter account |
| A2 | You hear the meeting, on your chosen device, with no echo and no added delay you can notice | Manual, headset and speakers |
| A3 | Every second captured is transcribed, `pending`, `failed` or `silence`; nothing unaccounted | Test: sum of spans equals session length |
| A4 | No segment is billed twice | Test: concurrent drains, killed service worker |
| A5 | 2 hours of capture: offscreen memory flat (within 50 MB of the 5-minute mark) | Spike S4, then a test |
| A6 | Network off for 10 minutes: all segments sent after it returns | Test |
| A7 | A rejected key is reported as a key problem, never as a network error | Test with a revoked key |
| A8 | The microphone is never captured unless enabled for this meeting, and its mute works from any tab | Test |
| A9 | Costs shown equal the sum of `usage.cost`; unreported costs are counted, not zero | Test |
| A10 | Summary items each cite at least one segment; no owner or date without one in the transcript | Test on recorded meetings |
| A11 | Meetings survive a browser restart; an interrupted capture is marked `interrupted` with its data | Test |
| A12 | Delete all leaves no MeetScribe data in IndexedDB or storage | Test |
| A13 | Exports: TXT, Markdown, JSON, never containing the key or audio | Test |

## 15. Open questions for the editor

1. Where the extension's site lives: this repository's GitHub Pages, `meetscribe.voicedebrief.ai`, or `meetscribe.chrome-extension.sgit.ai` beside Fix the Page.
2. Whether MeetScribe is a VoiceDebrief product (its key guidance, its privacy wording, possibly its declared-workflow code) or an sgit.ai example extension.
3. Chrome Web Store or load-unpacked only for the first users.
4. Whether the per-meeting consent dialog may be skipped for meetings you host alone (a recording of yourself).
5. The summary language default: the meeting's language or the browser's.
