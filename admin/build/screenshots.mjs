// Screenshots of the real extension pages for the install page, from the TEST build: a two-channel capture
// of Chromium's fake audio device, transcribed by the local replay server. Run after package.mjs --test.
//   node admin/build/screenshots.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '../../tests/helpers/pw.mjs';
import { startReplay } from '../../tests/helpers/replay.mjs';
import { synth, wavFile } from '../../tests/helpers/audio.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const EXT = path.join(ROOT, 'tests', '.build', 'extension-test');
const OUT = path.join(ROOT, 'install', 'images');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ms-shots-'));
const wav = path.join(profile, '..', 'ms-shots.wav');
fs.writeFileSync(wav, wavFile(synth([['quiet', 1000], ['speech', 3000], ['quiet', 3000], ['speech', 2500], ['quiet', 4000]])));
const replay = await startReplay();
const ctx = await chromium.launchPersistentContext(profile, { channel: 'chromium', args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`,
  '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-audio-capture=${wav}`] });
let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker');
const id = new URL(sw.url()).host;
const url = (p) => `chrome-extension://${id}/${p}`;
await sw.evaluate((b) => chrome.storage.local.set({ apiKey: 'sk-or-v1-screenshot-not-a-key-0000', apiBase: b }), replay.base);
for (const p of ctx.pages()) if (p.url().includes('options.html')) await p.close();

await sw.evaluate(() => chrome.tabs.query({}).then(t => chrome.storage.session.set({ invoked: { tabId: t[0].id, windowId: t[0].windowId, title: 'Meet: weekly planning', url: 'https://meet.google.com/abc-defg-hij' } })));
const panel = await ctx.newPage(); await panel.setViewportSize({ width: 400, height: 760 });
await panel.goto(url('sidepanel.html')); await panel.waitForTimeout(800);
await panel.check('#useMic'); await panel.check('#consent'); await panel.waitForTimeout(300);
await panel.screenshot({ path: path.join(OUT, 'panel-start.png') });

const r = await sw.evaluate(() => ms.start({ streamId: 'test:fake', tabId: -1, title: 'Meet: weekly planning', mic: true }));
await new Promise(res => setTimeout(res, 24000));
await panel.reload(); await panel.waitForTimeout(1500);
await panel.screenshot({ path: path.join(OUT, 'panel-live.png') });
await sw.evaluate(() => ms.stop());
for (let i = 0; i < 60 && (await sw.evaluate(() => ms.getSession().then(s => s.state))) !== 'idle'; i++) await new Promise(res => setTimeout(res, 500));

const meetings = await ctx.newPage(); await meetings.setViewportSize({ width: 1200, height: 900 });
await meetings.goto(url('meetings.html?id=' + r.meetingId)); await meetings.waitForTimeout(1200);
await meetings.click('#debrief'); await meetings.waitForSelector('#debriefBody h3'); await meetings.waitForTimeout(500);
await meetings.screenshot({ path: path.join(OUT, 'meetings.png') });
const options = await ctx.newPage(); await options.setViewportSize({ width: 1000, height: 1100 });
await options.goto(url('options.html')); await options.waitForTimeout(1000);
await options.screenshot({ path: path.join(OUT, 'options.png') });
await ctx.close(); await replay.close();
fs.rmSync(profile, { recursive: true, force: true }); fs.rmSync(wav, { force: true });
console.log('screenshots: install/images/panel-start.png, panel-live.png, meetings.png, options.png');
