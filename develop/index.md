# Build, test and release MeetScribe

**There is no compile step.** Chrome loads the files in `extension/` exactly as they are in the repository: no bundler, no transpiler, no `npm install` needed to run the extension. "Building" here means four small things: stamping the build so the extension can say which one it is, regenerating the site's pages, running the tests, and running the gate. Each is one Node script with no dependencies. Only the tests need Playwright.

## What you need

| | Version | For |
|---|---|---|
| Google Chrome (or Chromium) | 116 or later | Running the extension |
| git | any | Getting and updating the code |
| Node.js | 20 or later (22 locally, 24 on the CI runner) | Stamping, the site, the gate, the tests |
| Playwright with Chromium | 1.63.0 | The tests only |

## 1. Get the code

```bash
git clone https://github.com/VoiceDebrief/VoiceDebrief__Chrome_Extension__MeetScribe.git
```

```bash
cd VoiceDebrief__Chrome_Extension__MeetScribe
```

`dev` is the default branch, and every push to it is a tagged release.

## 2. Load it in Chrome

1. Open `chrome://extensions` and turn on **Developer mode** (top right).
2. Press **Load unpacked** and pick the `extension/` folder (not the repository root).
3. Pin **VoiceDebrief MeetScribe** to the toolbar. The options page opens the first time: set your OpenRouter key there. [Install and use](../install/index.md) has the rest.

After a `git pull`, press the reload arrow on MeetScribe's card in `chrome://extensions`; Chrome does not notice file changes by itself. The bottom of the options page shows the version, commit and build time of what is loaded.

## 3. Stamp the build and make the zip (for a release)

```bash
node admin/build/package.mjs
```

This writes `extension/build.js` with the version from `admin/build/version.txt`, the current commit and the time, which the options page shows. It then zips `extension/` into `releases/meetscribe-vX.Y.Z.zip` and `releases/meetscribe-latest.zip` (one folder, `meetscribe/`, inside), each with its `.sha256`: the download testers use. The gate checks that the zip holds exactly `extension/`, byte for byte. The copy in the repository is stamped at each release, so a fresh clone already says which release it is. Stamping changes tracked files: commit them only when releasing (`git checkout extension/build.js releases/` drops them).

## 4. Run the tests

Once, to install Playwright and its Chromium:

```bash
npm install --no-save --no-package-lock playwright@1.63.0
```

```bash
npx playwright install chromium
```

Then, every time:

```bash
node tests/run.mjs
```

It builds a TEST copy of the extension in `tests/.build/extension-test/` and runs every `tests/*.test.mjs`. The TEST copy is marked in its name, and its CSP also allows `127.0.0.1`. The runner fails if a test fails, and also if a file ran no tests at all. There are three files:

- `unit.test.mjs` runs in Node, against the modules in `extension/lib/`: WAV writing and checking, cutting at pauses on audio with a known shape, OpenRouter responses and errors, the transcript, the debrief prompt.
- `release.test.mjs` unzips `releases/meetscribe-latest.zip`, loads it into Chromium the way a tester does, and checks that it is the release build at the current version.
- `extension.test.mjs` runs in Chromium:
  - The TEST extension is loaded unpacked, and Chromium's fake audio device plays a known WAV, standing in for the tab and the microphone.
  - A local server (`tests/helpers/replay.mjs`) plays OpenRouter and records every request it would have billed.
  - It covers capture to transcript, microphone off and muted, retry, the rejected key, offline, no double send, the debrief and the colour schemes.

`node tests/run.mjs unit` or `node tests/run.mjs extension` runs one file.

## 5. Run the gate

```bash
node admin/build/validate.mjs
```

The same check CI runs first. It fails on any of these:

- **The site:** a generated page out of date, a broken link or anchor, a key-shaped string anywhere, an em-dash on a page this site writes, a script on a site page.
- **The version:** one that disagrees between `version.txt`, the manifest and `package.json`.
- **The manifest:** one that differs from brief v2.0's section 9.
- **The extension's code:**
  - a network call outside `extension/lib/openrouter.js`
  - `eval`
  - HTML built from strings
  - remote code
  - a colour written outside `vd-tokens.css` (VoiceDebrief's rule)

## 6. The site

```bash
node admin/build/build.mjs
```

Each page's `index.md` is the source; `index.html` beside it is generated from it, so edit the markdown and run this. To preview, serve the repository root and open `http://localhost:8000/`:

```bash
python3 -m http.server 8000
```

Two refreshes, run by hand when wanted:

```bash
node admin/build/snapshot-models.mjs
```

(the OpenRouter model catalogue into `data/stt-models.json`; needs the network; then rebuild the site)

```bash
node admin/build/vendor-vd.mjs ../VoiceDebrief__Website
```

(VoiceDebrief's colour schemes, from a clone of the website repository, into `assets/` and `extension/`)

## 7. Release

**The version rule.** A push to `dev` is a **minor** release: the next patch number, `v0.3.1` → `v0.3.2`. Only a push to `main` is a **major** release: `v0.3.x` → `v0.4.0`. These are the semantics of OSBot-GitHub-Actions' `git__increment-tag`, which voicedebrief.ai's pipeline uses. CI refuses any other number. A release whose run failed was never tagged, so the fix ships under the same number.

A release to `dev`:

1. `git pull --ff-only origin dev`
2. Set `admin/build/version.txt` to the next minor (`git tag --sort=-v:refname | head -1` shows the latest), and the same number in `extension/manifest.json` and `package.json`.
3. `node admin/build/package.mjs`, then `node admin/build/build.mjs`, then `node tests/run.mjs`, then `node admin/build/validate.mjs`.
4. Add a row to `versions/index.md`, and update `built/index.md` if what exists changed.
5. Commit with the subject `site vX.Y.Z: what changed`, and push to `dev`.

A major release goes to `main`: the same steps with the next major (`v0.4.0`) and the subject `site v0.4.0: ...`, pushed to `main`. Then merge `main` back into `dev`; CI sees the tag already on that commit and accepts it as released.

Every push to `dev` or `main` runs `.github/workflows/deploy-pages.yml`:

1. **validate:** the gate.
2. **test:** the tests on GitHub's runner.
3. **tag-release:** tags `vX.Y.Z` on the commit whose subject carries it. It checks that `version.txt` agrees and that the number follows the rule above. It also adds tags for earlier release commits that have none.
4. **deploy:** publishes the site, the extension's source and the zip to GitHub Pages, from `dev` only.

A pull request runs validate and test only. The pattern is Fix the Page's; the actions are pinned to commit SHAs, as in the newsroom.

## When something goes wrong

| What you see | What to do |
|---|---|
| "Chrome would not capture this tab" | Click the MeetScribe icon while you are on the Meet tab, then press Start in the panel. Capture is granted by that click, on that tab (spike S1) |
| Segments stay "waiting" | Look at the options page's key test. If it passes, inspect the capture page: `chrome://extensions`, MeetScribe, **Inspect views: offscreen.html**, Console. The service worker has its own **Inspect** link; `ms.getSession()` there shows the session |
| "OpenRouter rejected the key" | Paste a fresh key on the options page. Held segments are sent as soon as it is saved |
| No **You** lines | The microphone is opt-in per meeting, and needs **Allow the microphone** on the options page once |
| You hear the meeting on the wrong speakers | Options, section 3: pick the device you use for Meet |
| Everything is a `probable-echo` | You are on speakers, so your microphone hears the call. Use headphones, or leave the microphone off |
