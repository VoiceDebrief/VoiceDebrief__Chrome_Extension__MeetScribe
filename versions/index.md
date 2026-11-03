# Release history

One version for the site and the extension, in `admin/build/version.txt`. Every push to `dev` is a release: CI validates, runs the tests, tags `vX.Y.Z` on the commit whose subject carries it (`site vX.Y.Z: ...`), then publishes the site.

| Version | Date | What changed |
|---|---|---|
| v0.2.0 | 3 November 2026 | The first MVP of the extension: tab capture played back on your device, an opt-in microphone with its own mute, 16 kHz taps cut at pauses, every segment checked and persisted before it is sent, the OpenRouter queue with leases, retries and the key check, the side panel, options and meetings pages, exports. 38 tests (Node and Chromium). CI now validates, tests, tags and deploys. Site: [install](../install/index.md), [what is built](../built/index.md), this page. |
| v0.1.0 | 3 November 2026 | The site: the review of brief v1.0, brief v2.0, the plan, the models snapshot, the sources. No extension. |
