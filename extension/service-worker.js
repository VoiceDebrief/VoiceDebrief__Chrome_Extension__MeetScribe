// The coordinator (brief v2.0, 3). Owns the session state, the offscreen document's life, the commands and
// the alarms. Never holds a media stream or audio: those live in the offscreen document.
import * as db from './lib/db.js';
import { drain, processOne } from './lib/queue.js';
import { encodeWav, floatToInt16 } from './lib/wav.js';
import { getSettings, setSettings } from './lib/settings.js';

const OFFSCREEN = 'offscreen.html';
const IDLE = { state: 'idle', meetingId: null, tabId: null, startedAt: null, mic: { enabled: false, muted: false, error: null }, paused: false, error: null };

const getSession = async () => (await chrome.storage.session.get({ session: IDLE })).session;
const setSession = async (patch) => { const s = { ...(await getSession()), ...patch }; await chrome.storage.session.set({ session: s }); return s; };

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

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

async function start({ streamId, tabId, title, mic }) {
  const cur = await getSession();
  if (cur.state !== 'idle') return { ok: false, error: `already ${cur.state}` };
  const s = await getSettings();
  const id = db.uid('meet');
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
  await setSession({ state: 'draining', stopReason: reason });
  await badge('draining');
  await toOffscreen({ type: 'stop', reason }).catch(() => {});
  return { ok: true };
}

async function finished(meetingId) {
  // the offscreen document stopped its streams and drained the queue
  await chrome.offscreen.closeDocument().catch(() => {});
  const s = await getSession();
  if (s.meetingId === meetingId) await setSession({ ...IDLE, lastMeetingId: meetingId });
  await badge('idle');
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg.target !== 'sw') return;
  const run = {
    start: () => start(msg),
    stop: () => stop('user'),
    pause: async () => { await toOffscreen({ type: 'pause', paused: msg.paused }); const st = await setSession({ state: msg.paused ? 'paused' : 'capturing', paused: !!msg.paused }); await badge(st.state); return { ok: true }; },
    mic: async () => { const r = await toOffscreen({ type: 'mic', muted: msg.muted }); const s = await getSession(); await setSession({ mic: { ...s.mic, muted: !!msg.muted } }); return r; },
    finished: () => finished(msg.meetingId),
    'mic-error': async () => { const s = await getSession(); await setSession({ mic: { ...s.mic, error: msg.error } }); return { ok: true }; },
    'tab-ended': () => stop('tab-ended'),
    session: () => getSession(),
    drain: async () => { kickDrain(); return { ok: true }; },
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
  for (const m of await db.listMeetings()) if (m.status === 'draining') await db.updateMeeting(m.id, { status: 'complete' });
  await badge('idle');
}

let draining = null;
function kickDrain() {
  if (draining) return draining;
  draining = (async () => {
    if (await hasOffscreen()) return;          // the offscreen document drains while it is alive
    await drain('sw', { untilEmpty: true });
  })().finally(() => { draining = null; });
  return draining;
}

async function retention() {
  const { retentionDays } = await getSettings();
  await db.applyRetention(retentionDays < 0 ? null : retentionDays * 86400000);
}

chrome.runtime.onStartup.addListener(() => { recover().then(kickDrain); });
chrome.runtime.onInstalled.addListener(async (d) => {
  await recover();
  chrome.alarms.create('drain', { periodInMinutes: 1 });
  chrome.alarms.create('retention', { periodInMinutes: 360 });
  if (d.reason === 'install') chrome.runtime.openOptionsPage();
});
chrome.alarms.onAlarm.addListener((a) => { if (a.name === 'drain') kickDrain(); if (a.name === 'retention') retention(); });

// for the tests and for inspecting from the service worker's console
globalThis.ms = { getSession, setSession, start, stop, kickDrain, recover, db, drain, processOne, encodeWav, floatToInt16 };
