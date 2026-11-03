# MeetScribe

A Chrome extension that transcribes the Google Meet call you are in, on your own OpenRouter key: no bot in the call, no Google recording or transcription (so it works on Workspace Business Starter, which has neither), no server of ours. Your words are labelled **You**, everyone else's **Meeting**, and every point in the notes links back to the lines it came from.

> **Status, 3 November 2026: v0.2.0, the first MVP, loads unpacked from a clone.** [Install and use it](install/index.md). It captures the meeting and, if you opt in, your microphone; cuts both at pauses; checks and stores every segment before sending it to OpenRouter; and shows the transcript live in Chrome's side panel, with exports. It has been tested in Chromium with fake audio and replayed responses (38 tests), **not yet on a real Meet call**. [What is built](built/index.md) is the honest list; notes and summaries are next.

## The one rule

> **MeetScribe listens only while you can see that it is listening, keeps every second it heard until that second is transcribed or you delete it, and never shows a guess as a fact.**

## Is it feasible?

Yes. Every API it needs exists and is documented: Chrome's tab capture into an offscreen document (Chrome 116 and later), `getUserMedia` for the microphone, and OpenRouter's `/api/v1/audio/transcriptions`, which listed 29 models on the day we looked. Nothing depends on Google, which matters: Google is shutting down the Meet Media API on 15 January 2027.

The first brief (v1.0, drafted by ChatGPT) had the facts mostly right and four choices that would have failed without an error:

| | What v1.0 did | What goes wrong | v2.0 |
|---|---|---|---|
| R1 | 20-second `MediaRecorder` chunks | Only the first chunk is a decodable file; the model invents text for the rest | Own the samples: worklet, 16 kHz PCM, a WAV per segment |
| R2, R3 | Fixed cuts with overlap; every segment sent | Words cut in half; silence comes back as "Thank you for watching" | Cut at pauses; drop silence before it is sent |
| R4 | Its own microphone stream | Records you while you are muted in Meet | Opt-in per meeting, its own mute and shortcut, said plainly |
| R5 | "Mic = You" | On speakers, the mic hears everyone; their words become yours | Echo cancellation, measured; echoes marked, never deleted |

The [review](review/index.md) has all 23 findings, the 14 claims that held, and a verdict on every section of v1.0.

## Read

- [Install and use v0.2.0](install/index.md): load unpacked, set the key, transcribe a call; how to answer the spike questions with it.
- [What is built](built/index.md): the reality file, with what building it corrected.
- [Review of brief v1.0](review/index.md): what holds, what is wrong, what is missing, what to change, with evidence.
- [Brief v2.0](brief/index.md): the specification to build from.
- [The plan](plan/index.md): Phase 0's eight go/no-go questions and the model bake-off, then three releases.
- [Transcription models](models/index.md): the OpenRouter catalogue with price per hour, from a dated snapshot.
- [Sources](sources/index.md): every fact, where it was read.
- [Brief v1.0, as received](brief/v1/index.md): kept unedited.

## Where it comes from

MeetScribe is the Chrome extension the [VoiceDebrief](https://voicedebrief.ai) brief deliberately left for later: the same bring-your-own-key OpenRouter model, the same rule that the transcript is never overwritten, and the lessons of its issue queue. It is built the way the [chrome-extensions.sgit.ai](https://chrome-extensions.sgit.ai) hub and [Fix the Page](https://fix-the-page.chrome-extension.sgit.ai) say extensions should be: a deliberately stupid recorder first, `null` never `0`, no remote code, and a release you can check against its source.
