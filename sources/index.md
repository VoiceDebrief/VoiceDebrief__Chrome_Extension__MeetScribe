# Sources

Every external fact the [review](../review/index.md) and [brief v2.0](../brief/index.md) rest on, with where it was read. All were read on 3 November 2026. Where a fact is about behaviour no document states, it is marked as a [[spike]] question rather than listed here as a fact.

## Google

| Fact | Source |
|---|---|
| Meet transcripts are available in Business Standard, Business Plus, Enterprise Starter, Standard and Plus, Teaching and Learning Upgrade, Education Plus and Workspace Individual; not Business Starter | [Use transcripts with Google Meet](https://support.google.com/meet/answer/12849897) |
| "Take notes for me" is Business Standard and Plus among Business editions | [Workspace Updates, April 2026](https://workspaceupdates.googleblog.com/2026/04/require-explicit-consent-for-take-notes-with-Gemini-recordings-and-transcripts-in-Google-Meet.html) and earlier posts |
| The Meet Media API is deprecated (28 October 2026); its endpoints are turned down on 15 January 2027; the Meet REST API and Add-ons SDK are unaffected | [Meet REST API release notes](https://developers.google.com/meet/docs/release-notes) |

## Chrome

| Fact | Source |
|---|---|
| Tab capture from a service worker from Chrome 116; stream ID passed to an offscreen document; captured audio replayed through an `AudioContext` so the user keeps hearing it | [Audio recording and screen capture](https://developer.chrome.com/docs/extensions/how-to/web-platform/screen-capture) |
| Offscreen documents and their reasons, including `USER_MEDIA` | [chrome.offscreen](https://developer.chrome.com/docs/extensions/reference/api/offscreen) |
| The side panel | [chrome.sidePanel](https://developer.chrome.com/docs/extensions/reference/api/sidePanel) |
| Enabling the action by URL without host permissions | [chrome.declarativeContent](https://developer.chrome.com/docs/extensions/reference/api/declarativeContent) |
| Extension pages with host permissions are not limited by CORS for those hosts | [Cross-origin network requests](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests) |
| No remotely hosted code in Manifest V3 | [Manifest V3: remotely hosted code](https://developer.chrome.com/docs/extensions/develop/migrate/remote-hosted-code) |
| `AudioContext.setSinkId()` | [MDN: AudioContext.setSinkId](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/setSinkId) |
| `MediaRecorder` timeslice chunks are pieces of one stream, not separate files | [MDN: MediaRecorder.start](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/start) |

## OpenRouter

| Fact | Source |
|---|---|
| `/api/v1/audio/transcriptions`: body, `verbose_json`, `timestamp_granularities`, `provider.zdr`, `provider.options`; `prompt` accepted and ignored; routing preferences not applied to transcription; 60-second upstream timeout; 25 MB multipart cap; `usage.seconds` and `usage.cost`; `X-Generation-Id` | [Speech-to-Text guide](https://openrouter.ai/docs/guides/overview/multimodal/stt.md), [API reference](https://openrouter.ai/docs/api/api-reference/stt/create-transcription.md) |
| `verbose_json` rejected by some models, e.g. `openai/gpt-4o-transcribe`, `microsoft/mai-transcribe-1.5` | Speech-to-Text guide, "Verbose transcripts" |
| The model catalogue and prices | [data/stt-models.json](../data/stt-models.json), from `/api/v1/models?output_modalities=transcription` |
| Zero data retention routing | [ZDR](https://openrouter.ai/docs/guides/features/zdr.md) |

## What this family already learnt

| Lesson | Source |
|---|---|
| Undecodable audio comes back as a fluent invented transcript, not an error; detect by content, not by label | VoiceDebrief issue 025, [issues/done/025-ogg-mime-hallucinated-transcript.md](https://github.com/VoiceDebrief/VoiceDebrief__Website/blob/dev/issues/done/025-ogg-mime-hallucinated-transcript.md) |
| A rejected key can surface as `Failed to fetch`; ask `GET /api/v1/key` | VoiceDebrief issue 032 |
| Translate before summarising; never overwrite the transcript | VoiceDebrief issue 055 |
| The pass as a declared workflow with ceilings per step | VoiceDebrief issue 042 |
| A keyless demo that aborts the network instead of mocking it | VoiceDebrief issue 063 |
| A capped, dedicated OpenRouter key | [voicedebrief.ai/openrouter-key](https://voicedebrief.ai/openrouter-key/) |
| Build a deliberately stupid recorder first; missing is `null`; the six silent failures; build provenance | [chrome-extensions.sgit.ai](https://chrome-extensions.sgit.ai), [silent failures](https://chrome-extensions.sgit.ai/silent-failures/index.html), [checklist](https://chrome-extensions.sgit.ai/checklist/index.html), [rubric](https://chrome-extensions.sgit.ai/rubric/index.html) |
| `activeTab` over host permissions; the side panel; release zip equal to the source; a validator as the gate | [fix-the-page.chrome-extension.sgit.ai](https://fix-the-page.chrome-extension.sgit.ai) |
| Native web components, no framework, no build step | [coding.sgit.ai/javascript](https://coding.sgit.ai/javascript/index.html) |
| No mocks; link the measurement, date every number | [nfrs.sgit.ai](https://nfrs.sgit.ai) |
