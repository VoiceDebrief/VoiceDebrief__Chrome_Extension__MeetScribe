# Reviews of MeetScribe, and what happened to each finding

Every review of MeetScribe is kept here as it was received, with a status for every finding. A finding is **fixed** only when a test pins it; **partly** says which half is done; **open** is not done yet. Nothing is deleted when it is fixed.

## The v0.3.1 review (ChatGPT, 3 November 2026)

[The review as received (PDF, 11 pages)](v0.3.1/MeetScribe-v0.3.1-review.pdf). It was written by ChatGPT from the code at commit `a4bbdca`, without a real Meet call or paid API calls. Its verdict: *keep this as a supervised beta; fix the privacy and data-integrity defects before widening distribution.* We agree, and MeetScribe stays in beta.

Fixed in **v0.3.2**. The tests are in `tests/unit.test.mjs` and `tests/extension.test.mjs`, each named after its finding.

| # | Priority | Finding | Status | What changed |
|---|---|---|---|---|
| 01 | P1 | Deleting a running meeting does not stop its capture | [[built]] fixed | Deletion goes through the service worker, which stops capture first. A segment can only be written into a meeting that exists, and a result arriving for a deleted meeting is discarded with its segment. The wording says a delete cannot recall audio already sent. Test: *01* |
| 02 | P1 | Buffered muted audio can be admitted after unmute | [[built]] fixed | Mute and pause are applied inside the worklet, on the audio thread. Gated samples are counted and dropped, never buffered, and the partial batch is posted before every change. The test is the mute test (no microphone segments while muted). A tone placed exactly at the boundary is not tested yet |
| 03 | P2 | Privacy settings overstate their guarantees | [[built]] fixed | The zero-data-retention option is described as a request applied under the OpenRouter account's own settings, not a guarantee. The site and the extension say not to use MeetScribe for confidential meetings during the beta, and that local data is not encrypted. "Delete immediately" now happens when a segment is transcribed, and the alarms are re-created at startup |
| 04 | P1 | Stopping offline can block the next meeting indefinitely | [[built]] fixed | Requests time out at 75 s. Stop sends for at most 20 s, then frees recording and hands the rest to the service worker, and the meeting says `uploading`. Test: *04* |
| 05 | P1 | Fixing a rejected key does not resume live transcription | [[built]] fixed | Saving a key restarts the running capture's own drain, after waiting for the held one to wind down (the first fix raced with it, and the test caught it). Test: *05* |
| 06 | P2 | Failed startup and missing-recorder stops strand session state | [[built]] fixed | Start, stop and delete run one at a time; any failure in start rolls back to idle with the reason. Stop without a capture page settles on its own; pause and mute change state only if the capture page answered. Test: *06* |
| 07 | P1 | Storage failures silently discard speech | [[built]] fixed | A failed write pauses capture, records the lost span on the meeting, and the panel says what was not saved. The meeting ends `complete-with-gaps`. Test: *07* (a test-build switch makes storage fail) |
| 08 | P1 | Empty transcription is hidden as successful completion | [[built]] fixed | No text for a segment that held speech is a new status, `empty`: shown as a gap, audio kept, retryable, its cost counted, named in the debrief's input. Test: *08* |
| 09 | P2 | The echo heuristic removes legitimate replies from debriefs | [[built]] fixed | Probable echoes stay in what the debrief model reads, marked as uncertain; the prompt says a marked line may be a genuine reply. Test: *finding 09* (unit) |
| 10 | P1 | A debrief can be saved into the wrong meeting | [[built]] fixed | The meeting is fixed before anything is awaited, and the debrief is written only to it, only if it still exists. Test: *10* (switches meeting while the reply is delayed) |
| 11 | P1 | The published quick start tests the key without saving it | [[built]] fixed | One button, **Save and test**, and the guides say so. Test: *11* follows the home page's steps to an enabled Start |
| 12 | P2 | Meeting selection and status feedback are not accessible | [[spec]] partly | Meetings are buttons with a focus outline; inputs and selects have labels; status lines are live regions; the page rebuilds only what changed, so focus survives. Not done: a screen-reader audit, and keyboard tests |
| 13 | P2 | The lease cannot guarantee a segment is billed only once | [[spec]] partly | The lease (180 s) now outlives the longest request (75 s), so a live request cannot be claimed twice. A context that dies after sending can still cause a second send: the code and docs now say "at least once". Not done: an attempt ledger with uncertain spend |
| 14 | P2 | Every HTTP 400 disables verbose timestamps for that model | [[built]] fixed | Only a 400 that names the response format or timestamps switches a model to plain JSON. Test: *14* |
| 15 | P2 | Model timestamps are accepted outside the audio segment | [[built]] fixed | A timestamp must lie inside the audio sent (half a second of tolerance), or the response's times are set aside and its lines use the segment's start. Test: *15*, and the capture test now checks the rule on real segments |
| 16 | P2 | Fallback resampling drifts; Stop drops the worklet tail | [[spec]] partly | Stop flushes the worklet and waits for its acknowledgement, so the tail is kept. Not done: a stateful resampler. It is only used if Chrome refuses a 16 kHz context, which it has not so far |
| 17 | P2 | The shipped build identifies an older source commit | [[unverified]] open | The stamp still names the commit before the release commit. Next: stamp in CI from the release checkout, and publish an artifact-to-commit manifest |
| 18 | P2 | Debriefs can become stale without warning or verifiable citations | [[spec]] partly | A debrief records the transcript it was written from, and says when the transcript has changed since. The page says its times are the model's references, not checked links. Not done: citations validated against line IDs and made navigable |

Not acted on yet, from its wider assessment: the attempt ledger, indexed queries for long histories, branch protection on `dev`, an optional session-only key, and its QA plan for real devices (now the beta's job).

## The first real call (Dinis Cruz, 3 November 2026)

**S1 answered: no.** Opening the side panel straight from the toolbar icon (route a in [the plan](../plan/index.md)) did not let Chrome capture the Meet tab. The panel showed "the active tab", because it could not even read the tab's title. Its error flashed and vanished, wiped by the panel's refresh.

Fixed in v0.3.2 with **route b**. The icon click is handled by MeetScribe itself, which counts as invoking the extension on that tab. It opens the panel and remembers the tab, and **Start** asks Chrome for that tab's stream. The panel names the tab it will capture, or says to click the icon on the Meet tab; an error stays until the next Start. Automation cannot click the toolbar, so the test pins the rest of the route (no tab chosen: Start disabled, a clear message; a tab that was not clicked on is refused), and **the real check is the next call**.
