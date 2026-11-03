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

## The bake-off candidates

[Phase 0](../plan/index.md) tests six of these on real recordings in English, Portuguese and both: `openai/whisper-large-v3`, `openai/whisper-large-v3-turbo`, `mistralai/voxtral-mini-transcribe-3-0`, `nvidia/nemotron-3.5-transcribe`, `elevenlabs/scribe-v2`, `openai/gpt-transcribe`. The choice is made on quality first; this table only says what each would cost if it wins.
