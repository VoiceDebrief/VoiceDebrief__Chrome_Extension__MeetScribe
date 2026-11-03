# MeetScribe

A Chrome extension that transcribes the Google Meet call you are in, on your own OpenRouter key: no bot in the call, no Google recording or transcription (so it works on Workspace Business Starter, which has neither), no server of ours.

**Status (3 November 2026): specified, not built.** This repository holds the extension's site: the review of the first brief, the brief that replaces it, and the plan. The extension itself will live in `extension/` from Phase 0.

| Page | What |
|---|---|
| [`index.md`](index.md) | What it is, the one rule, is it feasible |
| [`review/index.md`](review/index.md) | Review of brief v1.0 (ChatGPT draft): 14 claims that hold, 23 findings R1 to R23 |
| [`brief/index.md`](brief/index.md) | **Brief v2.0**, the specification to build from |
| [`plan/index.md`](plan/index.md) | Phase 0 spike (eight go/no-go questions, model bake-off), then three releases |
| [`models/index.md`](models/index.md) | OpenRouter's transcription models with price per hour, from [`data/stt-models.json`](data/stt-models.json) |
| [`sources/index.md`](sources/index.md) | Every external fact and where it was read |
| [`brief/v1/index.md`](brief/v1/index.md) | Brief v1.0 as received, unedited |

## How the site is built

Each page's `index.md` is the source; `index.html` beside it is generated. No dependencies, no network.

```
node admin/build/build.mjs              # regenerate every index.html and the model table
node admin/build/validate.mjs           # the gate: generated files current, links and anchors, no key-shaped strings, no em-dashes, no scripts
node admin/build/snapshot-models.mjs    # refresh data/stt-models.json from OpenRouter (needs the network; then build)
```

`.github/workflows/pages.yml` validates every push and publishes `main` to GitHub Pages.

## What needs a human

Enabling GitHub Pages (Source: GitHub Actions); choosing the domain (brief v2.0, open question 1) and adding a `CNAME`; the go for Phase 0.

Content CC BY 4.0; code Apache 2.0 (see [LICENSE](LICENSE)).
