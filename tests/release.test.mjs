// The download route a tester takes: releases/meetscribe-latest.zip, unzipped, loaded unpacked into Chromium.
// It must be the release build (not the TEST build), carry the current version, and start.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { chromium } from './helpers/pw.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { readZip } = createRequire(import.meta.url)('../admin/build/zip.cjs');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ms-release-'));
let context;
after(async () => { await context?.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

test('the latest zip unpacks to one folder that Chromium loads as the release build, at the current version', async () => {
  const version = fs.readFileSync(path.join(ROOT, 'admin/build/version.txt'), 'utf8').trim().slice(1);
  const entries = readZip(fs.readFileSync(path.join(ROOT, 'releases', 'meetscribe-latest.zip')));
  assert.ok(entries.every(e => e.name.startsWith('meetscribe/')), 'one top-level folder, meetscribe/');
  for (const e of entries) { const p = path.join(tmp, e.name); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, e.data); }
  const dir = path.join(tmp, 'meetscribe');
  context = await chromium.launchPersistentContext(path.join(tmp, 'profile'), { channel: 'chromium', args: [`--disable-extensions-except=${dir}`, `--load-extension=${dir}`] });
  let [sw] = context.serviceWorkers(); if (!sw) sw = await context.waitForEvent('serviceworker');
  const m = await sw.evaluate(() => chrome.runtime.getManifest());
  assert.equal(m.name, 'VoiceDebrief MeetScribe'); assert.equal(m.version, version);
  // first run opens the options page, where a tester starts
  const deadline = Date.now() + 5000;
  while (!context.pages().some(p => p.url().endsWith('/options.html')) && Date.now() < deadline) await new Promise(r => setTimeout(r, 200));
  const options = context.pages().find(p => p.url().endsWith('/options.html'));
  assert.ok(options, 'the options page opened on install');
  await options.waitForFunction(() => document.getElementById('provenance').textContent.includes('commit'));
  const prov = await options.textContent('#provenance');
  assert.match(prov, new RegExp(`MeetScribe ${version.replace(/\./g, '\\.')} · commit [0-9a-f]{12}`));
  assert.doesNotMatch(prov, /TEST/, 'the release build, not the TEST build');
});
