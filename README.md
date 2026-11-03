# VoiceDebrief MeetScribe

A [VoiceDebrief](https://voicedebrief.ai) product: a Chrome extension that transcribes the Google Meet call you are in, and writes the debrief, on your own OpenRouter key: no bot in the call, no Google recording or transcription (so it works on Workspace Business Starter, which has neither), no server of ours.

Site: **https://meetscribe.chrome-extension.voicedebrief.ai/**

## Try it

1. Download **[meetscribe-latest.zip](https://meetscribe.chrome-extension.voicedebrief.ai/releases/meetscribe-latest.zip)** and unzip it (a folder called `meetscribe`).
2. `chrome://extensions`, switch on **Developer mode**, press **Load unpacked**, pick the `meetscribe` folder.
3. The options page opens: paste an OpenRouter key ([how to get one, with a spending cap](https://voicedebrief.ai/openrouter-key/)) and press **Test the key**.
4. In a Meet call, click the MeetScribe icon on the Meet tab: consent, **Start transcribing**. After the call: **Stop**, **Meetings**, **Write the debrief**.

Then [tell us what happened](https://github.com/VoiceDebrief/VoiceDebrief__Chrome_Extension__MeetScribe/issues/new?template=test-report.md). An hour of meeting costs roughly 5 to 15 US cents on OpenRouter (3 November 2026 prices); you pay OpenRouter directly, and MeetScribe charges nothing.

**Status (3 November 2026): v0.3.1, beta.** 45 automated tests pass (Node and Chromium, fake audio, replayed OpenRouter responses). The first real Meet calls are being made now. [`built/index.md`](built/index.md) says what exists; [`install/index.md`](install/index.md) has the full guide with screenshots.

## The site's pages

| Page | What |
|---|---|
| [`index.md`](index.md) | What it is, the one rule, is it feasible |
| [`install/index.md`](install/index.md) | Install and use v0.2.0; the spike questions it answers |
| [`built/index.md`](built/index.md) | What is built, how it is tested, what building it corrected |
| [`develop/index.md`](develop/index.md) | Build, test and release; what CI does |
| [`voicedebrief/index.md`](voicedebrief/index.md) | How MeetScribe lines up with voicedebrief.ai, and the path into it |
| [`review/index.md`](review/index.md) | Review of brief v1.0 (ChatGPT draft): 14 claims that hold, 23 findings R1 to R23 |
| [`brief/index.md`](brief/index.md) | **Brief v2.0**, the specification to build from |
| [`plan/index.md`](plan/index.md) | Phase 0 spike (eight go/no-go questions, model bake-off), then three releases |
| [`models/index.md`](models/index.md) | OpenRouter's transcription models with price per hour, from [`data/stt-models.json`](data/stt-models.json) |
| [`sources/index.md`](sources/index.md) | Every external fact and where it was read |
| [`brief/v1/index.md`](brief/v1/index.md) | Brief v1.0 as received, unedited |

## Structure

```
releases/                  meetscribe-vX.Y.Z.zip and meetscribe-latest.zip, each with .sha256: extension/ byte for byte
extension/                 the extension: manifest.json, service-worker.js, offscreen.*, worklet.js, sidepanel.*, options.*, meetings.*, ui.css, build.js, icons/
extension/lib/             wav, vad (cuts at pauses), openrouter, queue (leases, retries), transcript (lines, gaps, flags, exports), debrief + prompts (VoiceDebrief's prompt and locales), theme, db (IndexedDB), settings
tests/                     unit.test.mjs (Node), extension.test.mjs (Chromium), helpers/ (replay server, synthetic audio), fixtures/openrouter/, run.mjs
admin/build/               version.txt (owns the version) · validate.mjs (the gate) · build.mjs (site) · package.mjs (stamp, test build) · icons.mjs · screenshots.mjs · snapshot-models.mjs
.github/workflows/         deploy-pages.yml: validate, test, tag, deploy on every push to dev
```

## Build

There is no compile step: Chrome loads `extension/` as it is. Node 20+ runs the rest, with no dependencies except Playwright for the tests. [`develop/index.md`](develop/index.md) has it in full.

```bash
node admin/build/package.mjs
```

```bash
node admin/build/build.mjs
```

```bash
npm install --no-save --no-package-lock playwright@1.63.0 && npx playwright install chromium
```

```bash
node tests/run.mjs
```

```bash
node admin/build/validate.mjs
```

That is: stamp `extension/build.js` (version, commit, time); regenerate the site's HTML from its markdown; install Playwright (once); run the tests (unit in Node, the extension in Chromium); run the gate CI runs first.

## Release

A push to `dev` is a **minor** release (`v0.3.1` → `v0.3.2`); only a push to `main` is a **major** one (`v0.3.x` → `v0.4.0`). CI refuses any other number.

1. Set `admin/build/version.txt` to the next minor; set `extension/manifest.json` and `package.json` to match.
2. `node admin/build/package.mjs` (stamps `extension/build.js` and builds the release zip), `node admin/build/build.mjs`, `npm test`, `node admin/build/validate.mjs`.
3. Add a row to `versions/index.md`.
4. Commit with the subject `site vX.Y.Z: what changed` and push to `dev`.

Every push to `dev` or `main` runs `.github/workflows/deploy-pages.yml`: validate, test, tag `vX.Y.Z` on the release commit (checked against `version.txt`, the commit subject and the rule), then deploy the site to GitHub Pages from `dev`. A pull request runs validate and test only. [`develop/index.md`](develop/index.md) has the major-release steps.

## How the site is built

Each page's `index.md` is the source; `index.html` beside it is generated. No dependencies, no network.

```
node admin/build/build.mjs              # regenerate every index.html and the model table
node admin/build/validate.mjs           # the gate: generated files current, links and anchors, no key-shaped strings, no em-dashes, no scripts
node admin/build/snapshot-models.mjs    # refresh data/stt-models.json from OpenRouter (needs the network; then build)
```

## What needs a human

Trying it on a real Meet call. The domain is done: Route 53 CNAME `meetscribe.chrome-extension` to `voicedebrief.github.io`, the custom domain set in Settings, Pages, with HTTPS enforced. The `CNAME` file in this repository names it and the build reads it from there.

Content CC BY 4.0; code Apache 2.0 (see [LICENSE](LICENSE)).
