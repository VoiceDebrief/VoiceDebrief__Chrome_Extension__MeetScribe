# Install and use MeetScribe v0.3.0

The first MVP, loaded unpacked from a clone of the repository. No Chrome Web Store, no zip, no compile step: Chrome runs the files in `extension/` as they are in the repository. [Build, test and release](../develop/index.md) has the developer's side.

## Install

1. Clone the repository (default branch `dev`): `git clone https://github.com/VoiceDebrief/VoiceDebrief__Chrome_Extension__MeetScribe`
2. Open `chrome://extensions` and turn on **Developer mode**.
3. **Load unpacked**, and pick the `extension/` folder.
4. Pin MeetScribe to the toolbar. The options page opens by itself the first time.

After a `git pull`, press the reload arrow on MeetScribe's card in `chrome://extensions`. The options page shows the version, commit and build time, so you can check which build is running.

## Set up (once)

![The options page](images/options.png)

1. **OpenRouter key.** Paste a key you made for MeetScribe, **with a credit limit**, then Save and **Test the key**. The test shows the key's usage and limit.
2. **Microphone.** Press **Allow the microphone** only if you want your own voice transcribed. Chrome asks here because the capture page is never shown and cannot ask.
3. **Where you hear the meeting.** Pick the headset or speakers you use for Meet, and press **Play a test tone**.
4. **Model.** **Load the live list** shows every OpenRouter transcription model with its listed price per hour. `openai/whisper-large-v3` is the starting point until the Phase 0 bake-off picks a default.
5. **The debrief.** Pick the language it is written in (voicedebrief.ai's four: English UK or US, Portuguese Portugal or Brazil). The model defaults to `google/gemini-3.5-flash`, as on voicedebrief.ai.

## Use it in a meeting

![The side panel before starting](images/panel-start.png)

1. Join the Meet call. While on the Meet tab, click the MeetScribe icon (or <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd>). The side panel opens beside Meet.
2. If you want your own voice too, tick **Also transcribe my microphone**. It is separate from Meet's mute: use the panel's **Mute my mic** or <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>M</kbd>.
3. Tell the participants: **Copy notice for Meet's chat** and paste it into the chat. Then tick **I have told the participants** and press **Start transcribing**. The icon shows **REC**.
4. Lines appear in the panel a few seconds after each pause in speech. **Meeting** is the call; **You** is your microphone. Dimmed lines are flagged (`probable-echo`, `suspect`), never deleted.
5. **Stop**, or close the Meet tab. MeetScribe sends what is still waiting and marks the meeting complete.

![The side panel during a meeting (test build, fake audio)](images/panel-live.png)

## Afterwards

**Meetings** (in the panel's header) lists every meeting. You can:

- press **Write the debrief** for voicedebrief.ai's debrief of the meeting (key points, decisions, actions, open questions, one sentence), each point with the time of the line it came from. The transcript is never changed.
- read the transcript with its gaps, and play the audio any line came from (▶).
- retry failed segments.
- export TXT, Markdown (with the debrief) or JSON.
- delete a meeting.

**Delete all MeetScribe data** is on the options page.

![A meeting with its debrief (test build: fake audio, and replayed responses. The same audio is on both channels, so every "You" line is a probable echo)](images/meetings.png)

## What this build answers for the Phase 0 spike

Each spike question from [the plan](../plan/index.md) can be answered with this build on a real call. Please note what you see:

| | Question | How to see it |
|---|---|---|
| S1 | Does Start in the side panel capture the Meet tab? | If not, the panel says "Chrome would not capture this tab" and quotes Chrome's message |
| S2 | Does the microphone work in the capture page after the one-time grant? | A microphone problem shows under the meters and on the meeting page |
| S3 | How much of the meeting leaks into your microphone on speakers? | Count the dimmed `probable-echo` lines with and without headphones |
| S4 | Memory over 2 hours | `chrome://extensions`, MeetScribe, inspect `offscreen.html`, Memory tab |
| S5 | Do the cuts fall between words? | The meeting page's "forced cut(s)" count; play a segment with ▶ |
| S6 | Which model? | Change the model on the options page between meetings; the meeting page shows the cost OpenRouter reported |
| S7 | Is the mic captured while muted in Meet? | Mute in Meet only and speak: a **You** line appears (expected: yes) |
| S8 | Does the meeting stay on your headset? | Pick it in options; listen when you press Start |

## Testing it tomorrow: a short script

1. Pull `dev`, reload the extension, and check the options page's footer shows **0.3.0**.
2. Make or reuse a capped OpenRouter key; **Test the key**.
3. A two-person Meet call, headphones on, microphone **on**. Talk for five minutes, with one stretch muted in Meet only (S7).
4. Stop. On the meeting page, check that every second is a line, a gap with a reason, or silence. Play two segments with ▶. Count the forced cuts (S5).
5. **Write the debrief**; check every point against the line its time names.
6. Again on laptop speakers, to count the `probable-echo` lines (S3).
7. Export Markdown and JSON, and keep them with your notes for the spike page.

The developer's side (stamping, tests, the gate, release) is on [Build, test and release](../develop/index.md).
