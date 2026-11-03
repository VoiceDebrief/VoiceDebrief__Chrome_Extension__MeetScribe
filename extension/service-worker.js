// The coordinator (brief v2.0, 3). Owns the session state, the offscreen document's life, the commands and
// the alarms. Never holds a media stream or audio: those live in the offscreen document.
import * as db from './lib/db.js';
import { drain, processOne } from './lib/queue.js';
import { encodeWav, floatToInt16 } from './lib/wav.js';
import { BUILD } from './build.js';
import { getSettings, setSettings } from './lib/settings.js';

const OFFSCREEN = 'offscreen.html';
const IDLE = { state: 'idle', meetingId: null, tabId: null, startedAt: null, mic: { enabled: false, muted: false, error: null }, paused: false, error: null };

const getSession = async () => (await chrome.storage.session.get({ session: IDLE })).session;
const setSession = async (patch) => { const s = { ...(await getSession()), ...patch }; await chrome.storage.session.set({ session: s }); return s; };

// Spike S1, answered by the first real call (3 November 2026): opening the side panel straight from the icon
// (openPanelOnActionClick) did not grant activeTab, so Chrome refused to capture the Meet tab. Route b: the icon
// click comes here, which IS the extension being invoked on that tab; it opens the panel and remembers the tab.
// Start then asks for that tab's stream ID from here, while the grant lasts (until the tab navigates or closes).
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => {});
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});      // first, while the click still counts
  chrome.storage.session.set({ invoked: { tabId: tab.id, windowId: tab.windowId, title: tab.title || null, url: tab.url || null, at: Date.now() } });
});

async function hasOffscreen() {
  const ctx = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'], documentUrls: [chrome.runtime.getURL(OFFSCREEN)] });
  return ctx.length > 0;
}
async function ensureOffscreen() {
  if (await hasOffscreen()) return;
  await chrome.offscreen.createDocument({ url: OFFSCREEN, reasons: ['USER_MEDIA'], justification: 'Capture the meeting tab and, if enabled, the microphone, and transcribe them.' });
}
const toOffscreen = (msg) => chrome.runtime.sendMessage({ target: 'offscreen', ...msg });

async function badge(state) {
  const text = state === 'capturing' ? 'REC' : state === 'paused' ? '||' : state === 'draining' ? '…' : '';
  await chrome.action.setBadgeText({ text });
  if (text) await chrome.action.setBadgeBackgroundColor({ color: state === 'capturing' ? '#b91c1c' : '#5c5f66' });
}

// One command at a time: start, stop, abort and delete run in order, so a double click cannot interleave two
// transitions (v0.3.1 review, finding 06).
let chain = Promise.resolve();
const serial = (fn) => { const p = chain.then(fn, fn); chain = p.catch(() => {}); return p; };

async function start(args) {
  const cur = await getSession();
  if (cur.state !== 'idle') return { ok: false, error: `already ${cur.state}` };
  let id = null;
  try { return await begin(args, (x) => { id = x; }); }
  catch (e) {
    // finding 06: whatever threw (createDocument, sendMessage, storage), leave a truthful, recoverable state
    if (id) await db.updateMeeting(id, { status: 'interrupted', endedAt: new Date().toISOString(), error: String(e && e.message || e) }).catch(() => {});
    await setSession({ ...IDLE, error: 'capture failed to start: ' + (e && e.message || e) });
    await chrome.offscreen.closeDocument().catch(() => {});
    await badge('idle');
    return { ok: false, error: String(e && e.message || e) };
  }
}

/** The stream ID for the tab the icon was clicked on. Throws a message a person can act on. */
async function streamFor(tabId) {
  const { invoked } = await chrome.storage.session.get({ invoked: null });
  if (!invoked || invoked.tabId !== tabId) throw new Error('click the MeetScribe icon while you are on the Meet tab, then press Start');
  try { return await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId }); }
  catch (e) { throw new Error(`Chrome would not capture this tab (${e.message}). Click the MeetScribe icon on the Meet tab again, then press Start`); }
}

async function begin({ streamId, tabId, title, mic }, setId) {
  if (!(BUILD.test && streamId === 'test:fake')) streamId = await streamFor(tabId);   // route b: the stream ID is asked for here
  const s = await getSettings();
  const id = db.uid('meet'); setId(id);
  const startedAt = new Date().toISOString();
  await db.putMeeting({ id, title: title || 'Meeting ' + startedAt.slice(0, 16).replace('T', ' '), tabTitle: title || null, startedAt, endedAt: null,
                        status: 'capturing', sampleRate: 16000, channels: mic ? ['tab', 'mic'] : ['tab'], model: s.model, language: s.language || null });
  await setSession({ ...IDLE, state: 'starting', meetingId: id, tabId, startedAt, mic: { enabled: !!mic, muted: false, error: null } });
  await ensureOffscreen();
  const r = await toOffscreen({ type: 'start', streamId, meetingId: id, mic: !!mic, micDeviceId: s.micDeviceId, outputDeviceId: s.outputDeviceId });
  if (!r || !r.ok) {
    await db.updateMeeting(id, { status: 'interrupted', endedAt: new Date().toISOString(), error: r?.error || 'offscreen did not answer' });
    await setSession({ ...IDLE, error: r?.error || 'capture failed to start' });
    await chrome.offscreen.closeDocument().catch(() => {});
    await badge('idle');
    return { ok: false, error: r?.error || 'capture failed to start' };
  }
  await setSession({ state: 'capturing', mic: { enabled: !!mic, muted: false, error: r.micError || null } });
  await badge('capturing');
  return { ok: true, meetingId: id };
}

async function stop(reason = 'user') {
  const s = await getSession();
  if (!['capturing', 'paused', 'starting'].includes(s.state)) return { ok: false, error: 'not capturing' };
  if (!(await hasOffscreen())) {
    // finding 06: the capture page is gone (crashed, closed); there is nothing to stop, so settle here
    if (s.meetingId) { await db.updateMeeting(s.meetingId, { status: 'interrupted', endedAt: new Date().toISOString() }).catch(() => {}); await db.reconcileStatus(s.meetingId).catch(() => {}); }
    await setSession({ ...IDLE, lastMeetingId: s.meetingId, error: 'the capture page had stopped; what it saved is kept' });
    await badge('idle');
    kickDrain();
    return { ok: true };
  }
  await setSession({ state: 'draining', stopReason: reason });
  await badge('draining');
  await toOffscreen({ type: 'stop', reason }).catch(() => {});
  return { ok: true };
}

/** Stop capture at once, without sending anything more: used before deleting what is being captured. */
async function abortCapture() {
  if (await hasOffscreen()) { await toOffscreen({ type: 'abort' }).catch(() => {}); await chrome.offscreen.closeDocument().catch(() => {}); }
  const s = await getSession();
  await setSession({ ...IDLE, lastMeetingId: null });
  await badge('idle');
  return s;
}

/**
 * Deletion goes through here (finding 01): if the meeting is being captured, capture stops first, so no
 * later segment or result can be written for it. A request already in flight cannot be recalled from the
 * provider: its result is discarded when it arrives.
 */
async function deleteMeeting(meetingId) {
  const s = await getSession();
  if (s.meetingId === meetingId && s.state !== 'idle') await abortCapture();
  await db.deleteMeeting(meetingId);
  if ((await getSession()).lastMeetingId === meetingId) await setSession({ lastMeetingId: null });
  return { ok: true };
}
async function deleteAll() {
  const s = await getSession();
  if (s.state !== 'idle') await abortCapture();
  const before = await db.totals();
  await db.deleteAll();
  await setSession({ ...IDLE });
  return { ok: true, before };
}

async function finished(meetingId) {
  // the offscreen document stopped its streams and sent what it could in its bounded final drain
  await chrome.offscreen.closeDocument().catch(() => {});
  const s = await getSession();
  if (s.meetingId === meetingId) await setSession({ ...IDLE, lastMeetingId: meetingId });
  await badge('idle');
  kickDrain();   // anything still waiting (offline, backing off) is sent from here, by the alarm if need be
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg.target !== 'sw') return;
  const run = {
    start: () => serial(() => start(msg)),
    stop: () => serial(() => stop('user')),
    'delete-meeting': () => serial(() => deleteMeeting(msg.meetingId)),
    'delete-all': () => serial(() => deleteAll()),
    'meeting-deleted': async () => { const s = await getSession(); if (s.meetingId === msg.meetingId) await serial(() => abortCapture()); return { ok: true }; },
    'storage-error': async () => { const st = await setSession({ state: 'paused', paused: true, error: msg.error }); await badge(st.state); return { ok: true }; },
    pause: async () => {
      const r = await toOffscreen({ type: 'pause', paused: msg.paused }).catch(() => null);
      if (!r || !r.ok) return { ok: false, error: 'the capture page did not answer' };   // finding 06: state follows the effect
      const st = await setSession({ state: msg.paused ? 'paused' : 'capturing', paused: !!msg.paused, ...(msg.paused ? {} : { error: null }) }); await badge(st.state); return { ok: true };
    },
    mic: async () => { const r = await toOffscreen({ type: 'mic', muted: msg.muted }).catch(() => null); if (!r || !r.ok) return r || { ok: false }; const s = await getSession(); await setSession({ mic: { ...s.mic, muted: !!msg.muted } }); return r; },
    finished: () => finished(msg.meetingId),
    'mic-error': async () => { const s = await getSession(); await setSession({ mic: { ...s.mic, error: msg.error } }); return { ok: true }; },
    'tab-ended': () => stop('tab-ended'),
    session: () => getSession(),
    // finding 05: with a capture running, its own drain is restarted; otherwise this worker drains
    drain: () => requestDrain(),
    settings: () => getSettings(),
    'set-settings': async () => { await setSettings(msg.patch || {}); return { ok: true }; },
  }[msg.type];
  if (!run) return;
  run().then(reply, (e) => reply({ ok: false, error: String(e && e.message || e) }));
  return true;
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const s = await getSession();
  if (s.tabId === tabId && ['capturing', 'paused'].includes(s.state)) await stop('tab-closed');
});

chrome.commands.onCommand.addListener(async (cmd) => {
  const s = await getSession();
  if (cmd === 'toggle-mic' && s.mic.enabled && ['capturing', 'paused'].includes(s.state)) {
    await toOffscreen({ type: 'mic', muted: !s.mic.muted });
    await setSession({ mic: { ...s.mic, muted: !s.mic.muted } });
  }
  if (cmd === 'stop-capture') await stop('shortcut');
});

// After a restart: a capture cannot resume without a new click, so it is marked interrupted with its data
// kept (brief v2.0, 14 and A11), and whatever is queued is sent.
async function recover() {
  if (await hasOffscreen()) return;
  const s = await getSession();
  if (s.state !== 'idle') await setSession({ ...IDLE, error: 'the browser or extension restarted during capture' });
  for (const m of await db.listMeetings()) if (['capturing', 'paused', 'starting'].includes(m.status)) await db.updateMeeting(m.id, { status: 'interrupted', endedAt: m.endedAt || new Date().toISOString() });
  for (const m of await db.listMeetings()) if (['draining', 'uploading'].includes(m.status)) await db.reconcileStatus(m.id);
  await badge('idle');
}

// finding 05: with a capture running, its own drain is restarted; otherwise this worker drains
async function requestDrain() {
  if (await hasOffscreen()) return toOffscreen({ type: 'resume-drain' }).catch(() => ({ ok: false }));
  kickDrain(); return { ok: true };
}

let draining = null;
function kickDrain() {
  if (draining) return draining;
  draining = (async () => {
    if (await hasOffscreen()) return;          // the offscreen document drains while it is alive
    await drain('sw', { untilEmpty: true });
    for (const m of await db.listMeetings()) if (m.status === 'uploading') await db.reconcileStatus(m.id);
  })().finally(() => { draining = null; });
  return draining;
}

async function retention() {
  const { retentionDays } = await getSettings();
  await db.applyRetention(retentionDays < 0 ? null : retentionDays * 86400000);
}

// alarms can be lost with the profile on some Chrome versions: make sure they exist on every start (finding 03)
async function ensureAlarms() {
  if (!(await chrome.alarms.get('drain'))) chrome.alarms.create('drain', { periodInMinutes: 1 });
  if (!(await chrome.alarms.get('retention'))) chrome.alarms.create('retention', { periodInMinutes: 360 });
}
chrome.runtime.onStartup.addListener(() => { ensureAlarms(); recover().then(kickDrain); retention(); });
chrome.runtime.onInstalled.addListener(async (d) => {
  await recover();
  chrome.alarms.create('drain', { periodInMinutes: 1 });
  chrome.alarms.create('retention', { periodInMinutes: 360 });
  if (d.reason === 'install') chrome.runtime.openOptionsPage();
});
chrome.alarms.onAlarm.addListener((a) => { if (a.name === 'drain') kickDrain(); if (a.name === 'retention') retention(); });

// for the tests and for inspecting from the service worker's console
globalThis.ms = { getSession, setSession, start, stop, kickDrain, recover, deleteMeeting, deleteAll, requestDrain, db, drain, processOne, encodeWav, floatToInt16 };
