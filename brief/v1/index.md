# MeetScribe brief v1.0 (original)

> **This is the original brief, kept as it was received on 3 November 2026, byte for byte below the line.** It was drafted by ChatGPT and is superseded by [brief v2.0](../index.md). The [review](../../review/index.md) says, section by section, what holds and what changed. Nothing below has been edited, so its mistakes stay where they were made.

---

# MeetScribe — Product Requirements & Technical Implementation Brief

**Version:** 1.0  
**Date:** November 2026  
**Project type:** Chrome browser extension  
**Platform:** Google Meet / Google Chrome  
**AI provider:** OpenRouter  
**Implementation language:** TypeScript  
**Target:** Personal-use MVP, extensible into a commercial product

---

# 1. Executive Summary

## 1.1 Project Overview

MeetScribe is a lightweight Chrome extension that captures audio from a Google Meet session, transcribes the conversation using speech-to-text models accessed through OpenRouter, and optionally generates structured AI-powered meeting notes.

The extension must work with Google Workspace Business Starter accounts, which do not include Google's native meeting transcription functionality.

The solution must operate independently of Google Meet's recording and transcription features.

The extension will capture:

- Audio played through the Google Meet browser tab.
- Audio from the user's own microphone.
- Optional timestamps indicating when speech occurred.

Audio will be processed in manageable segments and sent to the selected transcription model through OpenRouter.

The resulting transcript will be stored locally and made available for reading, searching, editing, copying, and exporting.

An optional second AI processing stage will generate meeting summaries, decisions, action items, and other structured outputs.

## 1.2 Primary Objective

Build a reliable, privacy-conscious, inexpensive Google Meet transcription tool that requires no additional Google Workspace subscription.

## 1.3 Guiding Principles

1. **Simple:** Start transcription with minimal interaction.
2. **Non-intrusive:** No meeting bot or additional participant.
3. **Local-first:** Store transcripts and meeting metadata locally by default.
4. **Model-independent:** Allow users to select available OpenRouter models.
5. **Reliable:** Protect against lost audio, API failures, and browser lifecycle events.
6. **Transparent:** Show when audio capture is active and inform users about data transmission.
7. **Extensible:** Separate capture, transcription, storage, and AI analysis into independent components.

---

# 2. Product Scope

## 2.1 MVP Requirements

| Feature | Priority | MVP |
|---|---|---|
| Detect an active Google Meet tab | P0 | Yes |
| Start/stop audio capture manually | P0 | Yes |
| Capture meeting tab audio | P0 | Yes |
| Capture local microphone audio | P0 | Yes |
| Preserve normal meeting audio playback | P0 | Yes |
| Transcribe using OpenRouter | P0 | Yes |
| Select transcription model | P0 | Yes |
| Save transcript locally | P0 | Yes |
| Export TXT and Markdown | P0 | Yes |
| Recover from transcription API errors | P0 | Yes |
| AI-generated meeting summaries | P1 | Yes |
| Action item extraction | P1 | Yes |
| Meeting history | P1 | Yes |
| Display timestamps | P1 | Yes |
| API usage and cost tracking | P1 | Yes |
| Speaker diarization | P2 | Later |
| Automatic participant-name matching | P2 | Later |
| Search across meetings | P2 | Later |
| Google Drive integration | P2 | Later |
| Multi-language translation | P2 | Later |
| Direct Claude/ChatGPT integration | P2 | Later |
| Multi-browser support | P2 | Later |

P0 = essential; P1 = desired MVP enhancement; P2 = future release.

## 2.2 Out of Scope

The initial version will not:

- Join meetings as an automated participant.
- Use Google Meet's recording features.
- Use the discontinued Google Meet Media API.
- Capture video or screen-sharing content.
- Automatically transcribe meetings without explicit user action.
- Offer a cloud-hosted transcript archive.
- Provide guaranteed identification of remote participants.
- Synchronize transcripts across devices.
- Support mobile Google Meet.

---

# 3. Target Users

## Primary User

An individual or small-business user who:

- Uses Google Meet regularly.
- Has Google Workspace Business Starter.
- Wants transcripts without upgrading Workspace.
- Prefers using their own OpenRouter API key.
- Wants full control over transcript storage.
- Uses ChatGPT, Claude, or other LLMs for analysing meetings.

## Secondary Users

Freelancers, consultants, project managers, developers, and small teams who need searchable records of conversations and decisions.

---

# 4. User Experience

## 4.1 Initial Setup

The user installs the extension from a local development build or the Chrome Web Store.

On first launch, the extension presents a setup screen.

Required configuration:

1. OpenRouter API key.
2. Preferred transcription model.
3. Preferred transcript language or automatic language detection.
4. Microphone selection and permission.
5. Audio retention settings.
6. Confirmation that the user understands and will follow applicable meeting consent requirements.

Optional configuration:

- Summary model.
- Automatic summarisation after meetings.
- Maximum transcription expenditure per meeting.
- Audio processing segment duration.
- Default export format.

A **Test Connection** button must validate the API key and communicate whether the transcription service is available.

## 4.2 Starting a Meeting Transcript

Typical workflow:

1. The user joins a Google Meet meeting.
2. The extension detects an active Meet tab.
3. The extension icon displays an available status.
4. The user clicks the extension and selects **Start Transcription**.
5. The extension presents a short recording/transcription disclosure reminder and obtains any necessary permissions.
6. Audio capture begins.
7. The extension displays an active capture indicator.
8. Audio is processed and transcription results appear progressively.
9. The user can continue using Google Meet normally.

The user must be able to switch to other tabs while audio capture continues.

The extension must not interfere with microphone input, audio output, or Google Meet controls.

## 4.3 During the Meeting

The user can access a transcript dashboard displaying:

- Meeting title.
- Session start time.
- Elapsed time.
- Audio capture status.
- Microphone capture status.
- Current transcription status.
- Transcript text received so far.
- API usage and cost.
- Any warnings or processing errors.

Supported actions:

- Pause transcription.
- Resume transcription.
- Stop transcription.
- Copy transcript.
- Open the full dashboard.

Pausing must clearly distinguish between stopping audio capture and merely pausing API transcription. The default Pause action should suspend capture so the user does not unintentionally collect unwanted audio.

## 4.4 Ending the Meeting

The user selects **Stop Transcription**, or the extension detects that the captured Meet tab has closed or the media stream has ended.

The extension should:

1. Stop audio acquisition.
2. Finalise any buffered audio.
3. Complete pending transcription requests.
4. Reconcile transcript segments in chronological order.
5. Persist the final transcript.
6. Display the completed meeting.
7. Offer to generate an AI summary.

The extension should not silently discard pending or failed audio segments.

## 4.5 Viewing a Completed Meeting

A saved meeting contains:

**Meeting metadata**

- Title.
- Start and end timestamps.
- Duration.
- Language.
- Transcription model.
- Number of processed segments.
- Estimated or reported API cost.

**Transcript**

- Text.
- Time references where available.
- Optional audio-source labels.
- User-editable content.

**AI notes**

- Executive summary.
- Key discussion points.
- Decisions made.
- Action items.
- Open questions.
- Follow-up items.

---

# 5. Proposed User Interface

## 5.1 Extension Popup

Approximate dimensions: 380 × 500 pixels.

### Idle View

- Product name and icon.
- Google Meet connection status.
- Selected transcription model.
- Microphone status.
- Start Transcription button.
- Settings button.

### Active View

- Recording/transcription indicator.
- Elapsed timer.
- Tab audio indicator.
- Microphone indicator.
- Latest transcript text.
- Pause / Resume / Stop controls.
- Open Dashboard button.

### Completed View

- Meeting duration.
- Transcription completion status.
- Open Transcript button.
- Generate Summary button.
- Export button.

## 5.2 Full Dashboard

A dedicated extension page will provide more space for reading and managing meeting transcripts.

Suggested layout:

**Left panel**

- Meeting history.
- Meeting titles.
- Dates.
- Status indicators.

**Main panel**

- Meeting title and details.
- Transcript.
- Timestamps.
- Editable text.
- Search within transcript.

**Right panel or separate tab**

- Summary.
- Decisions.
- Action items.
- Questions.
- AI model selection.

## 5.3 Settings

Settings should be grouped into the following sections:

**OpenRouter**

- API key.
- Test Connection.
- Transcription model.
- Summary model.
- API cost reporting.

**Audio**

- Microphone selection.
- Include microphone toggle.
- Segment duration.
- Audio format.
- Language preference.

**Storage**

- Audio retention policy.
- Clear meeting history.
- Export data.
- Delete all locally stored data.

**AI**

- Default summary template.
- Summary language.
- Custom summary instructions.

---

# 6. Technical Architecture

## 6.1 Architecture Overview

The application will consist of five independent subsystems:

1. Browser integration and session lifecycle.
2. Audio acquisition and processing.
3. Transcription API integration.
4. Local persistence.
5. AI summarisation and presentation.

The architecture must not depend on Google Meet's internal DOM structure for audio capture.

### High-Level Data Flow

```text
Google Meet Browser Tab
         |
         v
Chrome Tab Capture API
         |
         +------------------+
         |                  |
         v                  v
Remote Meeting Audio    Local Microphone
         |                  |
         +---------+--------+
                   |
                   v
             Audio Pipeline
                   |
             Segment Encoder
                   |
             Local Segment Queue
                   |
                   v
         OpenRouter STT Endpoint
                   |
                   v
           Transcript Segments
                   |
                   v
             Local Storage
                   |
          +--------+--------+
          |                 |
          v                 v
    Transcript UI      OpenRouter LLM
                            |
                            v
                      Meeting Summary
                            |
                            v
                        Export UI
```

## 6.2 Technology Stack

| Layer | Technology |
|---|---|
| Language | TypeScript |
| Extension platform | Chrome Manifest V3 |
| Build system | Vite + CRXJS or equivalent maintained tooling |
| UI | React |
| Styling | Tailwind CSS |
| State management | Zustand or lightweight equivalent |
| Audio capture | `chrome.tabCapture` |
| Microphone capture | `getUserMedia` |
| Audio processing | Web Audio API |
| Audio encoding | MediaRecorder, with conversion where required |
| Background capture | Chrome Offscreen Document |
| Database | IndexedDB |
| Database wrapper | Dexie |
| Settings | `chrome.storage.local` |
| Speech-to-text | OpenRouter Audio Transcriptions API |
| Summarisation | OpenRouter Chat Completions API |
| Testing | Vitest + Playwright |
| Package management | npm or pnpm |

### Architecture Constraint

Manifest V3 service workers are not persistent execution environments and must not directly own the media streams.

Audio capture and recording must be managed by an offscreen document or another supported persistent extension context.

The service worker should coordinate commands and lifecycle events.

---

# 7. Audio Capture

## 7.1 Google Meet Tab Audio

Use:

`chrome.tabCapture.getMediaStreamId()`

The stream ID is generated from a valid user gesture and passed to an offscreen document.

The offscreen document redeems the stream ID using `getUserMedia`.

Only audio should be captured.

Once tab audio is captured, Chrome may stop its normal playback path. The extension must explicitly route the captured audio to an `AudioContext.destination` to maintain the user's ability to hear the meeting.

This playback routing must not introduce audible echoes.

## 7.2 Local Microphone

The extension must separately capture the user's microphone.

Use:

`navigator.mediaDevices.getUserMedia({ audio: true })`

The microphone must never be routed back to the speakers merely to support recording, because this can create feedback and echo.

The user should be able to select a preferred microphone.

Microphone access denial must be handled gracefully.

If the user denies microphone permission, the application can continue with remote tab audio only, with a visible warning.

## 7.3 Audio Stream Strategy

The recommended approach is to retain two logically distinct channels:

- Remote meeting audio.
- Local microphone audio.

The MVP may combine them into a single recording for transcription, but the architecture should preserve the possibility of separate transcription streams.

Separate streams provide a useful advantage: the application can confidently label locally captured speech as **You**.

However, it cannot reliably identify individual remote participants from a mixed tab-audio stream.

When combining streams, use the Web Audio API and ensure that both sources share a consistent audio clock.

Avoid introducing feedback by confusing the recording destination with the speaker playback destination.

## 7.4 Audio Segmentation

Initial target segment duration: **20 seconds**, configurable between 10 and 60 seconds.

This is an engineering starting point, not a provider-imposed limit.

Requirements:

- Assign a unique ID to every segment.
- Store its start time, end time, and sequence number.
- Preserve its encoded audio until transcription succeeds or the user deletes it.
- Detect missing segments.
- Queue segments when connectivity is unavailable.
- Avoid unbounded in-memory buffering.
- Support a small configurable overlap between segments if needed.

If overlap is used, the stitching process must remove duplicate text without deleting legitimate repeated speech.

A 20-second segment should not be assumed to produce an answer within exactly 20 seconds. Transcription is asynchronous and API latency will vary.

## 7.5 Audio Format

Prefer a compressed audio format supported by the chosen transcription provider.

Potential formats include:

- WebM/Opus.
- WAV.
- MP3.

MediaRecorder output depends on browser support. Do not assume that selecting an arbitrary MIME type produces that encoding.

At startup, verify encoder support using `MediaRecorder.isTypeSupported()`.

The transcription model must accept the actual encoded audio format.

If conversion is required, perform it in a worker or appropriate processing context without blocking the interface.

---

# 8. OpenRouter Integration

## 8.1 API Authentication

Use the user's OpenRouter API key.

The key must never be:

- Included in source control.
- Embedded in a public extension build.
- Added to application logs.
- Included in exported transcripts.
- Sent to any unrelated service.

For the personal-use MVP, support a user-supplied key stored locally with clear disclosure of the security trade-off.

Chrome extension storage is not a secure hardware vault. For a commercial release, consider a backend token broker or another stronger credential-management strategy.

## 8.2 Transcription Endpoint

**Endpoint**

`POST https://openrouter.ai/api/v1/audio/transcriptions`

**Authentication**

Bearer token.

**Initial default model**

`openai/whisper-1`

The model should be configurable rather than hardcoded.

Potential alternatives include:

- `openai/whisper-large-v3`
- `openai/whisper-large-v3-turbo`

The application should query the available transcription models using OpenRouter's model catalog with the `output_modalities=transcription` filter.

Model availability, pricing, accepted formats, and timestamp capabilities must be validated rather than assumed.

## 8.3 Example Request

```json
{
  "model": "openai/whisper-1",
  "input_audio": {
    "data": "<BASE64_AUDIO>",
    "format": "webm"
  },
  "language": "en",
  "response_format": "verbose_json"
}
```

The requested format must match the actual audio format and model/provider capability.

If a provider does not support `verbose_json`, the extension should either select a compatible provider/model or fall back to a plain-text transcription response with reduced timestamp functionality.

## 8.4 API Response Processing

For every transcription response:

1. Validate the HTTP status.
2. Validate the response structure.
3. Extract text.
4. Extract timestamps if returned.
5. Extract usage and cost data if available.
6. Associate the response with its original audio segment.
7. Persist the result.
8. Update the user interface.

Use audio-segment IDs to avoid inserting duplicate transcript content after request retries.

## 8.5 Timeout Handling

The current OpenRouter transcription endpoint has an upstream processing timeout of approximately 60 seconds.

The implementation must use short segments and handle timeouts explicitly.

A timeout should not cause an audio segment to be lost.

Retry policy:

- Retry transient HTTP and network errors.
- Respect `Retry-After` responses where provided.
- Use exponential backoff with jitter.
- Limit automatic retries.
- Allow manual retry of failed segments.

Authentication and invalid-request errors should be surfaced to the user without repeated futile retries.

## 8.6 Cost Tracking

Store per-request usage information whenever the provider returns it.

Display:

- Total audio duration processed.
- Number of requests.
- Transcription expenditure.
- Summary expenditure.
- Combined meeting cost.

The app should support an optional soft spending limit, with a warning before exceeding the configured budget.

The application must not invent exact costs when an API response does not provide them.

---

# 9. Transcript Processing

## 9.1 Transcript Segment Structure

Each transcript segment should include:

```ts
interface TranscriptSegment {
  id: string;
  meetingId: string;
  audioSegmentId: string;
  sequence: number;
  startMs: number;
  endMs: number;
  text: string;
  source: "tab" | "microphone" | "mixed";
  speakerId?: string;
  status: "completed" | "edited";
  modelId: string;
}
```

The timing fields must distinguish captured audio timing from speech-level timestamps.

If only chunk-level timing is available, the interface must not present approximate timing as exact word timing.

## 9.2 Transcript Stitching

Segment results may arrive out of order.

The transcript assembler must:

- Sort results by capture sequence.
- Preserve chronological order.
- Detect missing segments.
- Handle partial transcription failures.
- Remove duplicate boundary text when overlaps occur.
- Preserve punctuation and meaningful repetitions.
- Avoid using an LLM to silently rewrite the original transcript.

The canonical transcript should remain as close as practical to the transcription model's output.

## 9.3 Transcript Editing

The user must be able to edit transcript text.

Edited content should be stored separately from the original model output or tracked with revision metadata.

The app must not overwrite user edits during reprocessing.

---

# 10. AI Meeting Summaries

## 10.1 Summary Generation

After transcription, the user can select **Generate Summary**.

The extension sends the completed transcript to a configurable text LLM through OpenRouter.

The summary model is independent of the transcription model.

## 10.2 Required Summary Structure

The default summary should include:

### Executive Summary

A concise overview of the meeting.

### Main Discussion Points

Important subjects discussed.

### Decisions

Explicit decisions agreed during the meeting.

### Action Items

Each action item should contain:

- Task description.
- Owner, when identified.
- Due date, when stated.
- Status, if relevant.
- Supporting transcript reference when available.

### Open Questions

Unanswered questions requiring further discussion.

### Follow-Up Recommendations

Potential next steps, clearly separated from actions that were explicitly agreed.

## 10.3 Accuracy Requirements

The summarisation model must:

- Avoid inventing decisions.
- Avoid assigning owners without evidence.
- Avoid fabricating due dates.
- Distinguish suggestions from confirmed commitments.
- Mark uncertain information appropriately.
- Cite the relevant transcript passage or segment where possible.

## 10.4 Long Transcript Support

Long meetings may exceed a summarisation model's context window.

Implement a hierarchical summarisation process:

1. Divide the transcript into logical sections.
2. Extract structured facts from each section.
3. Merge recurring topics and duplicate actions.
4. Produce the final summary.
5. Preserve references to the original transcript.

Summaries must be regenerated after significant manual transcript edits if the user requests it.

---

# 11. Local Data Storage

## 11.1 Storage Technology

Use IndexedDB through Dexie or a comparable wrapper.

Avoid using `chrome.storage.local` to store large audio blobs.

## 11.2 Data Entities

### Meeting

```ts
interface Meeting {
  id: string;
  title: string;
  startedAt: string;
  endedAt?: string;
  status:
    | "active"
    | "processing"
    | "completed"
    | "interrupted";
  language?: string;
  transcriptionModel: string;
  summaryModel?: string;
  totalCostUsd: number;
}
```

### Audio Segment

```ts
interface AudioSegment {
  id: string;
  meetingId: string;
  sequence: number;
  startMs: number;
  endMs: number;
  source: "tab" | "microphone" | "mixed";
  mimeType: string;
  blob?: Blob;
  status:
    | "pending"
    | "processing"
    | "completed"
    | "failed";
  attempts: number;
}
```

### Meeting Summary

```ts
interface MeetingSummary {
  id: string;
  meetingId: string;
  model: string;
  generatedAt: string;
  executiveSummary: string;
  discussionPoints: string[];
  decisions: string[];
  actionItems: ActionItem[];
  openQuestions: string[];
}
```

## 11.3 Retention Policy

Default behaviour:

- Retain transcripts and summaries locally.
- Retain raw audio only while necessary for transcription and enabled retries.
- Delete successfully processed audio after a configurable retention period.
- Allow users to opt into longer audio retention.
- Provide a clear Delete Meeting operation.
- Provide Delete All Data.

Audio retention and transcript retention must be independently configurable.

On deletion, remove data from local stores and any application-controlled temporary queues.

---

# 12. Extension Structure

Recommended directory layout:

```text
meetscribe/
├── public/
│   ├── manifest.json
│   └── icons/
│
├── src/
│   ├── background/
│   │   ├── service-worker.ts
│   │   └── session-manager.ts
│   │
│   ├── capture/
│   │   ├── offscreen.html
│   │   ├── offscreen.ts
│   │   ├── tab-audio.ts
│   │   ├── microphone.ts
│   │   ├── audio-pipeline.ts
│   │   └── segment-recorder.ts
│   │
│   ├── api/
│   │   ├── openrouter-client.ts
│   │   ├── transcription.ts
│   │   ├── summarization.ts
│   │   └── models.ts
│   │
│   ├── transcript/
│   │   ├── assembler.ts
│   │   ├── normalization.ts
│   │   └── export.ts
│   │
│   ├── storage/
│   │   ├── database.ts
│   │   ├── repositories.ts
│   │   └── migrations.ts
│   │
│   ├── popup/
│   │   ├── Popup.tsx
│   │   └── components/
│   │
│   ├── dashboard/
│   │   ├── Dashboard.tsx
│   │   └── components/
│   │
│   ├── settings/
│   │   └── Settings.tsx
│   │
│   ├── shared/
│   │   ├── types.ts
│   │   ├── messages.ts
│   │   └── constants.ts
│   │
│   └── tests/
│
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

The exact build structure may change to accommodate the selected extension bundler.

---

# 13. Browser Permissions

The initial Manifest V3 configuration should request only the permissions actually necessary.

Expected permissions include:

- `activeTab`
- `tabCapture`
- `offscreen`
- `storage`

Potentially required:

- `scripting`, if the product later adds an in-meeting interface.
- Host access to `meet.google.com` for meeting detection or contextual features.
- Host access to `openrouter.ai` for API requests.

Additional permissions must be justified individually.

The extension must not request unrestricted browsing-history access or access to unrelated websites.

A visible extension surface should be responsible for obtaining microphone permission where needed before handing the stream or capture process to the supported recording context.

---

# 14. Session Lifecycle

Implement an explicit session state machine.

States:

```text
IDLE
  |
  v
INITIALIZING
  |
  v
CAPTURING <------ RESUMING
  |                ^
  v                |
PAUSED ------------+
  |
  v
STOPPING
  |
  v
PROCESSING
  |
  v
COMPLETED
```

Error and interruption states should be handled separately.

## Lifecycle Requirements

The application must:

- Prevent duplicate active sessions for the same tab.
- Detect media track termination.
- Detect when the meeting tab closes.
- Detect microphone disconnection.
- Handle temporary network failures.
- Recover queued work after service-worker suspension.
- Recover durable data after browser restart.
- Clearly distinguish active capture from post-meeting processing.

A browser restart cannot automatically restore an interrupted live media stream without an appropriate new user action. The application should preserve existing data and mark the session as interrupted.

---

# 15. Error Handling

| Scenario | Expected behaviour |
|---|---|
| Missing API key | Show configuration prompt |
| Invalid API key | Stop API calls and display error |
| Insufficient API credit | Preserve local data and request account action |
| Microphone denied | Offer tab-audio-only capture |
| Tab capture denied | Explain required permissions |
| Unsupported audio format | Offer conversion or compatible model |
| API timeout | Retry with bounded backoff |
| API rate limit | Respect retry delay and queue segments |
| Internet disconnected | Save audio segments locally |
| Browser restarted | Preserve data and mark interrupted session |
| Meet tab closed | Stop capture and process buffered data |
| Model unavailable | Offer another model |
| Storage quota exceeded | Stop safely, warn user, and preserve existing data where possible |
| Transcript generation fails | Preserve audio for retry |
| Summary generation fails | Keep completed transcript intact |

Errors must never silently discard data.

The UI should distinguish recoverable problems from permanent failures.

---

# 16. Privacy, Security, and Consent

## 16.1 Privacy Model

The application should follow a local-first design.

By default:

- Audio is captured locally.
- Audio is sent only to the configured transcription service when processing is enabled.
- Transcripts remain local.
- Summaries are generated only when requested, unless the user enables automatic summaries.
- No user analytics are collected without consent.

Note: Sending audio to OpenRouter makes this a third-party processing workflow, not a completely offline solution.

The actual upstream model provider may also receive the audio. The product must explain this clearly.

## 16.2 Meeting Consent

The extension must not encourage covert transcription.

Before starting, display a reminder that users are responsible for informing participants and obtaining necessary consent.

The extension must not attempt to hide Chrome's capture indicators or circumvent Google Meet's controls.

For business use, the implementation should consider GDPR and any applicable contractual, employment, confidentiality, and data-protection requirements.

## 16.3 API Data Policies

Where available, offer configuration of OpenRouter data-handling preferences, including zero-data-retention-compatible routes.

Do not claim a zero-retention guarantee unless the selected provider and its current policies support it.

## 16.4 Security Requirements

- No hardcoded credentials.
- No remote executable code in the extension.
- Restrictive content security policy.
- HTTPS API connections.
- No transcript data in routine diagnostic logs.
- Sanitize rendered transcript content.
- Protect against cross-site scripting.
- Minimise host permissions.
- Avoid exposing API keys through content scripts.
- Provide secure key replacement and clearing.
- Validate all API responses and inter-context messages.

---

# 17. Export Requirements

## 17.1 Plain Text

Export a readable transcript containing:

- Meeting title.
- Date.
- Start time.
- Duration.
- Transcript with timestamps where available.

## 17.2 Markdown

Include metadata, transcript, and optional AI summary.

Example:

```markdown
# Product Planning Meeting

Date: 2026-11-03
Duration: 42 minutes

## Transcript

[00:00:15] Speaker:
We need to agree on the project scope.

[00:00:28] You:
I can prepare the first draft.

## Decisions

- Complete scope review this week.

## Action Items

- Prepare project scope.
  Owner: You
  Due: Not specified
```

## 17.3 JSON

Provide structured JSON export for integration with other systems.

JSON should contain stable IDs, meeting metadata, transcript segments, timestamps, summaries, and action items.

Do not export API credentials or raw audio by default.

---

# 18. Testing Strategy

## 18.1 Unit Tests

Cover:

- Transcript assembly.
- Segment ordering.
- Overlap handling.
- Cost calculation.
- State transitions.
- API response parsing.
- Storage operations.
- Export generation.

## 18.2 Integration Tests

Use mocked OpenRouter API responses to test:

- Successful transcription.
- Timeouts.
- Invalid credentials.
- Rate limiting.
- Missing timestamp data.
- Partial transcription failure.
- Repeated and out-of-order responses.

## 18.3 Manual Google Meet Tests

Test the extension in actual Google Meet sessions using a Google Workspace Business Starter account.

Required scenarios:

1. Two-participant meeting.
2. Multiple participants.
3. Microphone muted and unmuted.
4. Headphones connected.
5. Audio output device changed.
6. Microphone disconnected mid-meeting.
7. Long periods of silence.
8. Participants talking simultaneously.
9. Changing browser tabs.
10. Meeting tab closure.
11. Network interruption.
12. Browser restart.
13. Thirty-minute meeting.
14. Ninety-minute meeting.
15. Two-hour meeting.
16. English-language meeting.
17. Portuguese-language meeting.
18. Mixed English and Portuguese speech.

## 18.4 Reliability Targets

Initial engineering targets:

- No loss of successfully persisted audio segments.
- No duplicate transcript segments after retries.
- No significant user-perceived disruption to Meet audio.
- No microphone feedback.
- Successful recovery of queued audio after a temporary API outage.
- Successful transcript export after an interrupted session.
- Bounded memory usage during a two-hour meeting.
- Clear and accurate capture-state indicators.

These are acceptance targets to verify, not guaranteed properties of the underlying browser or speech models.

---

# 19. Acceptance Criteria

The MVP is complete when all the following conditions are satisfied.

### AC-01 — Google Workspace Compatibility

A user with Google Workspace Business Starter can start transcription from a normal Google Meet session without activating Google Meet's native recording or transcription features.

### AC-02 — Audio Capture

Remote audio and local microphone speech can both be captured.

### AC-03 — Meeting Usability

Starting the extension does not prevent the user from hearing or speaking in Google Meet.

### AC-04 — Transcription

Audio segments are successfully sent to a selected compatible OpenRouter speech-to-text model and returned as text.

### AC-05 — Transcript Completeness

All successfully captured segments are either transcribed or explicitly marked as failed or pending.

### AC-06 — Long Meetings

A 90-minute meeting can be processed without uncontrolled growth of memory usage or loss of persisted segments.

### AC-07 — Error Recovery

Temporary network or transcription failures do not erase already captured segments.

### AC-08 — Export

Users can export completed transcripts as TXT and Markdown.

### AC-09 — AI Summary

The extension can generate a meeting summary using a selected OpenRouter text model.

### AC-10 — Local Storage

Meetings and transcripts remain accessible after closing and reopening Chrome.

### AC-11 — Transparency

Users can see when audio capture is active and stop it immediately.

### AC-12 — Cost Visibility

The application displays actual API usage costs when provided by OpenRouter.

### AC-13 — Cleanup

Users can permanently remove stored meeting data from application-controlled storage.

---

# 20. Development Phases

## Phase 1 — Technical Proof of Concept

**Objective:** Validate the riskiest part of the architecture.

Deliverables:

- Minimal Chrome extension.
- Google Meet tab detection.
- Tab audio capture.
- Microphone capture.
- Confirmed normal playback.
- Short local audio capture.
- Successful OpenRouter transcription.

Exit requirement: Record and accurately transcribe a short two-person test conversation, including both the local microphone and remote participant.

## Phase 2 — Functional MVP

Deliverables:

- Audio segmentation.
- Persistent segment queue.
- Automatic transcription.
- Transcript assembly.
- Basic extension UI.
- Meeting start/stop controls.
- Local transcript storage.
- TXT and Markdown exports.
- Basic settings.

Exit requirement: A complete 30-minute meeting transcript is available and exportable.

## Phase 3 — Reliability and AI

Deliverables:

- API retries.
- Cost tracking.
- Long-meeting validation.
- Summary generation.
- Decisions and action items.
- Meeting history.
- Improved failure recovery.
- Audio retention settings.

Exit requirement: Successful 90-minute test meeting with recoverable failures and usable AI notes.

## Phase 4 — Release Preparation

Deliverables:

- Security review.
- Accessibility review.
- Browser compatibility testing.
- Automated regression tests.
- User documentation.
- Privacy disclosures.
- Chrome Web Store packaging.

Exit requirement: A distributable Chrome extension suitable for a limited beta.

---

# 21. Future Enhancements

Potential future releases may introduce:

### Speaker Recognition

Use diarization to distinguish remote speakers and allow manual matching to participant names.

### Live Captions

Display short-latency transcription in a side panel or optional overlay, with clear distinction between provisional and final text.

### Searchable Knowledge Base

Enable semantic search across transcripts.

### Meeting Assistant

Allow users to ask:

- What was decided?
- Which tasks were assigned to me?
- What topics remain unresolved?
- What did we say about a specific customer?

### External Integrations

Potential destinations:

- Google Drive.
- Google Docs.
- Notion.
- Obsidian.
- Slack.
- Microsoft Teams.
- CRM systems.

### Custom AI Templates

Allow users to configure summaries for:

- Project meetings.
- Client calls.
- Sales discovery.
- Technical reviews.
- Interviews.
- Product planning.

### Multi-Provider Transcription

Support direct transcription through additional providers or local speech-to-text engines.

---

# 22. Implementation Guidance for an AI Coding Agent

The following development principles must be applied throughout implementation.

1. Use TypeScript with strict type checking.
2. Follow Chrome Manifest V3 requirements.
3. Do not rely on persistent service-worker execution.
4. Separate media capture from API processing.
5. Persist audio segments before transmitting them.
6. Never discard audio solely because an API request failed.
7. Keep all external API integrations behind typed interfaces.
8. Make transcription and summarisation models configurable.
9. Use IndexedDB for large, durable data.
10. Avoid unnecessary backend infrastructure.
11. Do not depend on undocumented Google Meet internals.
12. Never inject remote executable JavaScript.
13. Design for recoverability and clear error states.
14. Include automated tests for critical modules.
15. Implement capture permissions and consent disclosures transparently.
16. Do not invent speaker identities or exact timestamps.
17. Do not silently modify the canonical transcript using an LLM.
18. Do not introduce unnecessary authentication or cloud services.

Build and validate incrementally, beginning with tab capture, microphone capture, normal audio playback, and one successful transcription request.

Do not begin advanced features until the audio pipeline has been tested in an actual Google Meet session.

---

# 23. Definition of Success

MeetScribe is successful when a Google Workspace Business Starter user can:

1. Join a normal Google Meet meeting.
2. Click the extension to start transcription.
3. Participate normally without using Google Meet recording.
4. Capture the conversation, including their own speech.
5. Receive a complete text transcript through OpenRouter.
6. Generate useful meeting notes with an LLM.
7. Export and retain the information locally.
8. Repeat the process reliably, without managing external infrastructure.

**The primary success measure is reliable, low-friction transcription rather than the number of AI features.**

---

# 24. Recommended First Development Milestone

Implement only the following initial workflow:

**Start Capture → Capture Tab + Microphone → Save a Short Audio Segment → Send to OpenRouter → Display Transcript**

Use a fixed speech-to-text model for this first technical test.

Do not implement diarization, meeting history, summarisation, or complex settings until this path works reliably.

Once the audio pipeline is proven, build the remaining functionality around it.

**End of implementation brief — version 1.0.**