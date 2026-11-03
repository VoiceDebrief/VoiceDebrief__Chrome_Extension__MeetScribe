# Transcription models on OpenRouter

Every speech-to-text model OpenRouter listed on the day of the snapshot, with its price per hour of audio. The table is generated from [data/stt-models.json](../data/stt-models.json), which `admin/build/snapshot-models.mjs` writes from `GET /api/v1/models?output_modalities=transcription` and each model's `/endpoints`. The build never fetches: the page says what the file says, and the file says when it was taken.

## How to read it

- **Per hour** is the listed `prompt` price times 3,600. OpenRouter's guide says duration-priced models are "priced per second of audio input"; the anchor that confirms the unit is `openai/whisper-1` at $0.0001 a second, which is OpenAI's published $0.006 a minute.
- **Token-priced** models (a non-zero `completion` price) bill by audio and text tokens; their hourly cost depends on the speech and is not computed here. Read `usage.cost` from a real request.
- **Unit unclear**: two Azure models list prices (0.1 and 0.36) that cannot be per second (that would be $360 and $1,296 an hour), and the unit is not stated. Not computed.
- **Range** is across the providers serving the model. OpenRouter does not apply provider ordering (`order`, `only`, `ignore`) to transcription requests, so which provider, and so which price, serves a given request is not yours to choose. The extension shows `usage.cost`, never this table.
- A meeting with both channels and VAD is billed for roughly the minutes anybody spoke, so an hour of meeting is close to an hour of billed audio, not two.

<!-- generated:stt-models -->
Snapshot taken 2026-11-03 00:24 UTC: 29 models.

| Model | Per hour | Listed price | Providers | Listed since |
|---|---|---|---|---|
| `nvidia/nemotron-3.5-asr-streaming-multilingual-0.6b` | $0.012 | 0.00000333 per second | DeepInfra | 2026-08-13 |
| `openai/whisper-large-v3-turbo` | $0.012 to $0.040 | 0.00000333 per second | DeepInfra, Groq | 2026-05-01 |
| `qwen/qwen3-asr-0.6b` | $0.012 | 0.00000333 per second | DeepInfra | 2026-08-13 |
| `openai/whisper-large-v3` | $0.027 to $0.11 | 0.0000075 per second | DeepInfra, Together, Groq | 2026-05-01 |
| `qwen/qwen3-asr-1.7b` | $0.027 | 0.0000075 per second | DeepInfra | 2026-08-13 |
| `mistralai/voxtral-mini-3b-2507` | $0.060 | 0.0000166667 per second | DeepInfra | 2026-08-13 |
| `nvidia/parakeet-tdt-0.6b-v3` | $0.090 | 0.000025 per second | Together | 2026-05-27 |
| `x-ai/grok-stt-1.0` | $0.10 | 0.0000277777777778 per second | xAI | 2026-07-23 |
| `nvidia/nemotron-3.5-transcribe` | $0.12 | 0.0000333 per second | DeepInfra | 2026-10-29 |
| `meta/muse-voice-transcribe-1.0` | $0.18 | 0.00005 per second | Meta | 2026-09-11 |
| `mistralai/voxtral-mini-transcribe` | $0.18 to $0.20 | 0.00005 per second | Mistral | 2026-05-15 |
| `mistralai/voxtral-small-24b-2507-stt` | $0.18 | 0.00005 per second | DeepInfra | 2026-08-13 |
| `mistralai/voxtral-mini-transcribe-3-0` | $0.21 to $0.23 | 0.0000583333 per second | Mistral | 2026-10-20 |
| `elevenlabs/scribe-v2` | $0.22 | 0.0000611111111111 per second | ElevenLabs | 2026-10-07 |
| `elevenlabs/scribe-v2-medical` | $0.22 | 0.0000611111111111 per second | ElevenLabs | 2026-10-07 |
| `mistralai/voxtral-small-transcribe-3-0` | $0.24 to $0.26 | 0.0000666667 per second | Mistral | 2026-10-20 |
| `deepgram/nova-3` | $0.26 | 0.0000716666666667 per second | Deepgram | 2026-07-15 |
| `openai/gpt-transcribe` | $0.27 | 0.000075 per second | OpenAI | 2026-08-05 |
| `assemblyai/universal-3-5-pro` | $0.30 | 0.0000833333 per second | AssemblyAI | 2026-09-22 |
| `assemblyai/universal-3-6-pro` | $0.30 | 0.0000833333 per second | AssemblyAI | 2026-10-14 |
| `fish-audio/transcribe-1` | $0.36 | 0.0001 per second | Fish Audio | 2026-07-29 |
| `fish-audio/transcribe-1-pro` | $0.36 | 0.0001 per second | Fish Audio | 2026-09-24 |
| `openai/whisper-1` | $0.36 | 0.0001 per second | OpenAI | 2026-04-27 |
| `google/chirp-3` | $0.96 | 0.000266666666667 per second | Google | 2026-05-05 |
| `google/gemini-3.5-transcribe` | token-priced | in 0.000002, out 0.000012 per token | Google AI Studio | 2026-09-25 |
| `openai/gpt-4o-mini-transcribe` | token-priced | in 0.00000125, out 0.000005 per token | OpenAI | 2026-05-01 |
| `openai/gpt-4o-transcribe` | token-priced | in 0.0000025, out 0.00001 per token | OpenAI | 2026-04-27 |
| `microsoft/mai-transcribe-1.5` | unit unclear | 0.36, unit not stated | Azure | 2026-06-02 |
| `microsoft/mai-transcribe-2` | unit unclear | 0.1, unit not stated | Azure | 2026-09-03 |
<!-- /generated:stt-models -->

## The first bake-off, 3 November 2026

Run with a real OpenRouter key by `admin/build/bakeoff.mjs`, which anyone can re-run. Two text-to-speech voices (`google/gemini-3.8-flash-tts`) read a short meeting script with names, dates and sums, in English and in European Portuguese. Each clip was cut to MeetScribe's own format (16 kHz mono WAV, under 30 s) and sent through the extension's own client. The English was also spoken fast, and then made harder still: 20% faster again, with background noise, squeezed through 12 kb/s Opus, the codec a call uses. The data is in [data/bakeoff/](../data/bakeoff/2026-11-03.json).

<!-- generated:bakeoff -->
2 run(s), 2026-11-03. Word error rate; lower is better.

| Model | English | English, fast | Fast, noisy, Opus 12 kb/s | Portuguese | Timestamps |
|---|---|---|---|---|---|
| `openai/whisper-1` | 1.5% | 0.0% | 0.0% | 0.0% | yes |
| `openai/whisper-large-v3` | 1.5% | 1.5% | 0.0% | 0.0% | yes |
| `deepgram/nova-3` | 1.5% | 0.0% | 1.5% | 0.0% | yes |
| `qwen/qwen3-asr-1.7b` | 1.5% | 1.5% | 0.0% | 0.0% | yes |
| `openai/whisper-large-v3-turbo` | 1.5% | 0.0% | 2.9% | 0.0% | yes |
| `openai/gpt-transcribe` | 1.5% | 1.5% | 1.5% | 0.0% | no |
| `elevenlabs/scribe-v2` | 2.9% | 2.9% | 1.5% | 0.0% | yes |
| `assemblyai/universal-3-6-pro` | 2.9% | 2.9% | 2.9% | 0.0% | yes |
| `mistralai/voxtral-small-transcribe-3-0` | 2.9% | 2.9% | 2.9% | 0.0% | yes |
| `mistralai/voxtral-mini-transcribe-3-0` | 2.9% | 4.4% | 2.9% | 0.0% | yes |
| `google/gemini-3.5-transcribe` | 2.9% | 4.4% | 4.4% | 0.0% | yes |
| `openai/gpt-4o-transcribe` | 2.9% | 76.5% | 76.5% | 68.8% | no |
| `nvidia/nemotron-3.5-transcribe` | error (429) | error (429) | error (429) | error (429) | ? |
<!-- /generated:bakeoff -->

**What it shows.** Two things, and only two.

- **On clean synthetic speech, the recommended models are all good.** They score 0 to 4.4%, even fast and noisy. That is too easy a test to rank them: synthetic voices articulate perfectly, and real people talking fast do not. The way to choose is to compare models on your own recordings, which the extension does: **⇄** on any line of a meeting transcribes that piece again with another model, side by side.
- **`openai/gpt-4o-transcribe` silently dropped most of the speech.** On the fast, hard and Portuguese clips it returned only the first sentence. It is never recommended, and the extension's full list marks it AVOID.

Scoring: word error rate after lower-casing, removing punctuation, and writing the scripts' numbers one way, so "14th" and "fourteenth" count as the same word. `nvidia/nemotron-3.5-transcribe` returned 429 (rate limited) on every try and was not scored.

## The debrief models, checked the same day

The English transcript, with the extension's own debrief prompt, through four models. All four kept the five sections.

| Model | Time | Cost for this short test | Note |
|---|---|---|---|
| `google/gemini-3.5-flash` | 5.4 s | $0.014 | the default, as voicedebrief.ai uses |
| `openai/gpt-5.6-terra` | 3.3 s | $0.004 | fastest and cheapest |
| `anthropic/claude-sonnet-5.5` | 6.9 s | $0.011 | said the "I" who owns an action is not identified |
| `anthropic/claude-opus-5.5` | 9.5 s | $0.022 | the most careful about owners and dates |

## The bake-off candidates

[Phase 0](../plan/index.md) tests six of these on real recordings in English, Portuguese and both: `openai/whisper-large-v3`, `openai/whisper-large-v3-turbo`, `mistralai/voxtral-mini-transcribe-3-0`, `nvidia/nemotron-3.5-transcribe`, `elevenlabs/scribe-v2`, `openai/gpt-transcribe`. The choice is made on quality first; this table only says what each would cost if it wins.
