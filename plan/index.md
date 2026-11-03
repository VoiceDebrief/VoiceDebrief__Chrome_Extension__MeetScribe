# The plan: a spike, then three releases

Nothing is built yet. The order below follows the chrome-extensions hub's first sentence, *build a deliberately stupid recorder first*, and v1.0's own best section (its milestone 24). No phase starts without the editor's go; effort figures are rough, for one developer working with an agent.

## Phase 0: the spike (2 to 3 days)

**Build:** an unpacked extension with no UI beyond one side panel. Click, consent, capture both channels through the worklet, cut at pauses, write WAV segments to IndexedDB, list them with a play button and an export-as-zip button. Then one button that sends one segment to OpenRouter and shows the JSON that came back. No queue, no retry, no summary, no styling.

**Answer eight questions.** Each answer is recorded with the evidence (a recording, a screenshot, a number) in `admin/spike/`. A "no" is not a failure of the spike; it changes the brief.

| | Question | Go if | If not |
|---|---|---|---|
| S1 | Which gesture lets the side panel's Start button call `tabCapture.getMediaStreamId` for the Meet tab? | Route (a) works: action click opens the panel, Start captures | Route (b): the action click starts capture and opens the panel; consent moves to a first-run setting plus the panel's banner |
| S2 | Once the setup page has the microphone grant, does the offscreen document's `getUserMedia` succeed without a prompt? | Yes, on a fresh profile | Capture the microphone in the side panel's document instead and pass frames through a `MessageChannel` |
| S3 | On laptop speakers with `echoCancellation: true`, how much of the meeting appears in the microphone channel? | Under 5% of meeting lines echoed | Turn on `probable-echo` marking by default and recommend headphones in the panel |
| S4 | Two hours of capture: does the offscreen document's memory stay flat? | Within 50 MB of the 5-minute mark | Find the leak before Phase 1 (worklet buffers, unreleased blobs) |
| S5 | Do pause-based cuts land between words on a real meeting? | Under 1 forced cut in 20 | Tune the thresholds; consider a bundled VAD model |
| S6 | Which model? The bake-off below | One model is clearly good enough in English and Portuguese | Two defaults, by language |
| S7 | Is the microphone captured while muted in Meet? (Expected: yes) | (Confirms R4) | If no, record why; the separate mute stays either way |
| S8 | Does `AudioContext.setSinkId()` keep the meeting on the user's headset, and does capture work for Meet installed as an app window? | Both yes | Document the limitation in setup; app window support becomes a known gap |

### The bake-off (S6)

Four recordings, each 5 minutes, made with the spike itself so they have the real pipeline's audio: English with two speakers; Portuguese; English and Portuguese mixed; four people with crosstalk. Each transcribed by every candidate:

`openai/whisper-large-v3` · `openai/whisper-large-v3-turbo` · `mistralai/voxtral-mini-transcribe-3-0` · `nvidia/nemotron-3.5-transcribe` · `elevenlabs/scribe-v2` · `openai/gpt-transcribe`

Recorded per model and recording: the text, `usage.cost`, wall-clock latency, whether `verbose_json` worked, and the editor's judgement of errors on a marked passage (names, numbers, Portuguese words). The table is published on this site with the recordings' consent noted. The cheapest acceptable model wins.

**Exit:** a two-person test meeting, both channels, transcribed correctly, and all eight answers written down. Then brief v2.1 with the answers folded in.

## Phase 1: the recorder that cannot lose anything (about 2 weeks)

Queue with leases, retry and backoff, the errors table, cost with `null`, interrupted sessions, side panel live view, setup page, history, TXT and Markdown export, retention and delete. Tests for every silent failure in section 12 of the brief. The validator and the packaging script with the byte-for-byte zip.

**Exit:** a real 30-minute meeting transcribed with the network cut for 5 minutes in the middle, and every second accounted for (acceptance A3, A6).

## Phase 2: the notes (about 1 week)

Translate and summarise as a declared workflow; citations by segment ID; edits as a revision layer; JSON export; budget per meeting.

**Exit:** a real 90-minute meeting with usable notes, where every decision and action links back to the lines it came from.

## Phase 3: release (about 1 week)

Security self-review against the hub's [quality rubric](https://chrome-extensions.sgit.ai/rubric/index.html), accessibility pass, the privacy and permissions pages on this site, packaging, and the editor's decision on the Chrome Web Store.

**Exit:** an installable release with its zip, SHA-256 and release notes on this site.

## Proposed after that

Speaker labels (diarization spike; Meet captions as name hints), a browser-local engine (Whisper in WebGPU, bundled, so no audio leaves the machine), search across meetings, Drive export, custom summary templates.
