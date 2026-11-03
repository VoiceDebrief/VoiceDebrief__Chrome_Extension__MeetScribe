# MeetScribe

A Chrome extension that transcribes the Google Meet call you are in, on your own OpenRouter key: no bot in the call, no Google recording or transcription (so it works on Workspace Business Starter, which has neither), no server of ours.

**Status (3 November 2026): v0.2.0, the first MVP.** `extension/` is the extension, loaded unpacked; the rest is its site (the review of the first brief, brief v2.0, the plan, install and reality pages). Tested in Chromium with fake audio and replayed OpenRouter responses; not yet on a real Meet call.

## Run it

1. `chrome://extensions`, Developer mode on, **Load unpacked**, pick `extension/`.
2. The options page opens: paste an OpenRouter key (one with a credit limit), Test it, and Allow the microphone if you want your own voice transcribed.
3. On a Meet tab, click the MeetScribe icon: the side panel opens. Consent, Start, Stop. **Meetings** has the history and exports.

[`install/index.md`](install/index.md) has the detail and screenshots; [`built/index.md`](built/index.md) says what exists.

| Page | What |
|---|---|
| [`index.md`](index.md) | What it is, the one rule, is it feasible |
| [`install/index.md`](install/index.md) | Install and use v0.2.0; the spike questions it answers |
| [`built/index.md`](built/index.md) | What is built, how it is tested, what building it corrected |
| [`review/index.md`](review/index.md) | Review of brief v1.0 (ChatGPT draft): 14 claims that hold, 23 findings R1 to R23 |
| [`brief/index.md`](brief/index.md) | **Brief v2.0**, the specification to build from |
| [`plan/index.md`](plan/index.md) | Phase 0 spike (eight go/no-go questions, model bake-off), then three releases |
| [`models/index.md`](models/index.md) | OpenRouter's transcription models with price per hour, from [`data/stt-models.json`](data/stt-models.json) |
| [`sources/index.md`](sources/index.md) | Every external fact and where it was read |
| [`brief/v1/index.md`](brief/v1/index.md) | Brief v1.0 as received, unedited |

## Structure

```
extension/                 the extension: manifest.json, service-worker.js, offscreen.*, worklet.js, sidepanel.*, options.*, meetings.*, ui.css, build.js, icons/
extension/lib/             wav, vad (cuts at pauses), openrouter, queue (leases, retries), transcript (lines, gaps, flags, exports), db (IndexedDB), settings
tests/                     unit.test.mjs (Node), extension.test.mjs (Chromium), helpers/ (replay server, synthetic audio), fixtures/openrouter/, run.mjs
admin/build/               version.txt (owns the version) · validate.mjs (the gate) · build.mjs (site) · package.mjs (stamp, test build) · icons.mjs · screenshots.mjs · snapshot-models.mjs
.github/workflows/         deploy-pages.yml: validate, test, tag, deploy on every push to dev
```

## Test

```
npm install --no-save playwright@1.63.0 && npx playwright install chromium
npm test                                 # tests/run.mjs: builds the TEST extension, runs every test file, fails if one ran no tests
```

## Release

1. Bump `admin/build/version.txt` once; set `extension/manifest.json` and `package.json` to match.
2. `node admin/build/package.mjs` (stamps `extension/build.js`), `node admin/build/build.mjs`, `npm test`, `node admin/build/validate.mjs`.
3. Add a row to `versions/index.md`.
4. Commit with the subject `site vX.Y.Z: what changed` and push to `dev`.

Every push to `dev` runs `.github/workflows/deploy-pages.yml`: validate, test, tag `vX.Y.Z` on the release commit (checked against `version.txt` and the commit subject; the next minor, or a deliberate major), then deploy the site to GitHub Pages. A pull request runs validate and test only.

## How the site is built

Each page's `index.md` is the source; `index.html` beside it is generated. No dependencies, no network.

```
node admin/build/build.mjs              # regenerate every index.html and the model table
node admin/build/validate.mjs           # the gate: generated files current, links and anchors, no key-shaped strings, no em-dashes, no scripts
node admin/build/snapshot-models.mjs    # refresh data/stt-models.json from OpenRouter (needs the network; then build)
```

## What needs a human

Choosing the domain (brief v2.0, open question 1) and adding a `CNAME`; allowing `dev` in the `github-pages` environment if it is restricted; trying it on a real Meet call.

Content CC BY 4.0; code Apache 2.0 (see [LICENSE](LICENSE)).
