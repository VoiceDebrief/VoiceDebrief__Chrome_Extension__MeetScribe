// The side panel (brief v2.0, 10): the live view beside Meet. Start (after consent), meters, the separate
// microphone mute, queue counts, cost as reported, live lines, pause and stop. Data is rendered with
// textContent only. The panel reads IndexedDB and session storage; it never holds audio.
import * as db from './lib/db.js';
import { assemble, costOf, clock } from './lib/transcript.js';
import { getSettings } from './lib/settings.js';
import { applyTheme } from './lib/theme.js';
import { BUILD } from './build.js';

const $ = (id) => document.getElementById(id);
const sw = (msg) => chrome.runtime.sendMessage({ target: 'sw', ...msg });
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

$('ver').textContent = 'v' + BUILD.version + (BUILD.test ? ' TEST' : '');
let session = null, settings = null, shownMeeting = null;
let startError = null;   // stays on screen until the next Start (the 1 s refresh used to wipe it at once)
let micGranted = null;    // the microphone permission for the extension's origin, as Chrome reports it

function banner(kind, text, link) {
  const b = $('banner');
  if (startError && !text) { kind = 'err'; text = startError; link = null; }
  const sig = `${kind}|${text || ''}|${link?.href || ''}`;
  if (b.dataset.sig === sig) return;                 // unchanged: do not re-announce it every second
  b.dataset.sig = sig; b.replaceChildren();
  if (!text) return;
  const d = el('div', kind, text + ' ');
  if (link) { const a = el('a', null, link.text); a.href = link.href; a.target = '_blank'; d.append(a); }
  b.append(d);
}

/** The tab the MeetScribe icon was last clicked on, if it still exists (route b: that click grants the capture). */
async function targetTab() {
  const { invoked } = await chrome.storage.session.get({ invoked: null });
  if (!invoked) return null;
  try { const t = await chrome.tabs.get(invoked.tabId); return { ...t, title: t.title || invoked.title, url: t.url || invoked.url }; } catch { return null; }
}

async function renderIdle() {
  const tab = await targetTab();
  const url = tab?.url || '';
  const isMeet = /^https:\/\/meet\.google\.com\//.test(url);
  $('tabinfo').textContent = !tab
    ? 'No tab chosen yet. Go to the Meet tab and click the MeetScribe icon in the toolbar: that click is what lets Chrome capture the tab.'
    : `${tab.title || 'Untitled tab'}${url ? ' (' + new URL(url).host + ')' : ''}` + (url && !isMeet ? '. Not a Google Meet tab: MeetScribe will still capture it.' : '') +
      ' To transcribe another tab, go to it and click the MeetScribe icon there.';
  $('start').disabled = !$('consent').checked || !settings.apiKey || !tab;
}

async function refresh() {
  [session, settings] = await Promise.all([chrome.storage.session.get({ session: null }).then(r => r.session), getSettings()]);
  const state = session?.state || 'idle';
  const counts = await db.countByStatus();
  const held = (await (async () => { const m = session?.meetingId || session?.lastMeetingId; return m ? (await db.segmentsFor(m)).filter(s => s.held) : []; })());

  if (!settings.apiKey) banner('warn', 'Set your OpenRouter key before starting.', { text: 'Open options', href: 'options.html' });
  else if (held.length) banner('err', `${held[0].lastError}: ${held.length} segment(s) are kept and will be sent once it is fixed.`, { text: 'Fix the key', href: 'options.html' });
  else if (startError) banner('err', startError);

  else if (session?.error) banner('warn', session.error);
  else if (!navigator.onLine && counts.pending) banner('warn', 'Offline: segments are saved and will be sent when the connection returns.');
  else banner();

  micStrip();
  $('idle').hidden = state !== 'idle';
  $('active').hidden = !['capturing', 'paused', 'starting'].includes(state);
  const meetingId = session?.meetingId || session?.lastMeetingId || null;
  $('after').hidden = !(state === 'draining' || (state === 'idle' && session?.lastMeetingId));
  $('live').hidden = !meetingId;

  if (state === 'idle') await renderIdle();
  if (meetingId) {
    const [meeting, segs, lines] = await Promise.all([db.getMeeting(meetingId), db.segmentsFor(meetingId), db.linesFor(meetingId)]);
    if (!meeting) return;
    const c = { done: 0, pending: 0, sending: 0, failed: 0, invalid: 0 }; for (const s of segs) c[s.status]++;
    const cost = costOf(segs);
    $('cDone').textContent = c.done; $('cPending').textContent = c.pending + c.sending; $('cFailed').textContent = c.failed + c.invalid;
    $('cCost').textContent = '$' + cost.usd.toFixed(cost.usd < 0.1 ? 4 : 2) + (cost.unknown ? '+?' : '');
    $('cCost').title = cost.unknown ? `${cost.unknown} request(s) did not report a cost` : 'as reported by OpenRouter';
    $('title').textContent = meeting.title;
    $('state').textContent = state === 'paused' ? 'PAUSED' : state === 'starting' ? 'STARTING' : 'REC';
    $('pause').textContent = state === 'paused' ? 'Resume' : 'Pause';
    if (session?.startedAt && state !== 'idle') $('elapsed').textContent = clock(Date.now() - Date.parse(session.startedAt));
    $('micRow').hidden = !session?.mic?.enabled;
    $('mute').textContent = session?.mic?.muted ? 'Unmute my mic' : 'Mute my mic';
    $('micState').textContent = session?.mic?.error ? session.mic.error : session?.mic?.enabled ? (session.mic.muted ? 'Your microphone is muted in MeetScribe.' : "MeetScribe hears your microphone, even when you are muted in Meet.") : 'Your microphone is not being transcribed.';
    $('afterState').textContent = state === 'draining' ? 'finishing' : meeting.status;
    $('afterText').textContent = state === 'draining' ? `Sending what is left: ${c.pending + c.sending} waiting.` : `${c.done} sent, ${c.failed + c.invalid} failed.`;
    $('openMeeting').href = 'meetings.html?id=' + encodeURIComponent(meetingId);
    renderLines(assemble(segs, lines), meetingId);
  }
}

function renderLines(items, meetingId) {
  const ol = $('lines');
  const nearBottom = window.innerHeight + window.scrollY >= document.body.scrollHeight - 40;
  if (shownMeeting !== meetingId) { ol.replaceChildren(); shownMeeting = meetingId; }
  const recent = items.slice(-150);
  ol.replaceChildren(...recent.map(i => {
    const li = el('li', i.type === 'gap' ? 'gap' : (i.flags.length ? 'dimmed' : ''));
    li.append(el('span', 't', (i.timing === 'model' ? '' : '≈') + clock(i.startMs)));
    if (i.channel === 'mic') li.append(el('span', 'who mic', i.label + ':'));   // only You is labelled
    if (i.type === 'line') { li.append(document.createTextNode(i.text)); for (const f of i.flags) li.append(el('span', 'flag', f)); }
    else li.append(document.createTextNode(i.status === 'failed' || i.status === 'invalid' ? `[${i.status}: ${i.lastError || ''}]` : `[${i.status}…]`));
    return li;
  }));
  if (nearBottom) window.scrollTo(0, document.body.scrollHeight);
}

$('consent').addEventListener('change', renderIdle);
async function micPermission() {
  try { micGranted = (await navigator.permissions.query({ name: 'microphone' })).state; } catch { micGranted = 'unknown'; }
  $('micNote').hidden = !$('useMic').checked;
  micStrip();
}
const openMicOptions = () => chrome.tabs.create({ url: chrome.runtime.getURL('options.html#microphone') });

/**
 * The microphone strip, at the top of the panel in every state (the editor, after the second real call: "make it
 * real obvious when that is not set"). Red: your voice is not, or would not be, transcribed. Amber: off or muted
 * by choice. Green: your voice is being transcribed (or will be, at Start).
 */
let stripAction = null;
function micStrip() {
  const state = session?.state || 'idle';
  const live = ['capturing', 'paused', 'starting'].includes(state);
  let kind, text, action = null;
  if (live) {
    if (session?.mic?.error) { kind = 'bad'; text = '🎤 Your voice is NOT being transcribed: ' + session.mic.error + '.'; action = ['Fix the microphone', openMicOptions]; }
    else if (!session?.mic?.enabled) { kind = 'warn'; text = '🎤 Your voice is not being transcribed: the microphone is off for this meeting. Only the call is.'; }
    else if (session?.mic?.muted) { kind = 'warn'; text = '🎤 Your microphone is muted in MeetScribe: your voice is not being transcribed.'; action = ['Unmute', () => sw({ type: 'mic', muted: false }).then(refresh)]; }
    else { kind = 'ok'; text = '🎤 Your voice is being transcribed (lines labelled You).'; }
  } else if (micGranted !== 'granted') {
    kind = 'bad';
    text = micGranted === 'denied' ? '🎤 Microphone BLOCKED: your voice will NOT be transcribed. Allow it for MeetScribe in Chrome\'s site settings.'
      : '🎤 Microphone NOT ALLOWED yet: your voice will NOT be transcribed, only the call.';
    action = ['Allow the microphone', openMicOptions];
  } else if (!$('useMic').checked) {
    kind = 'warn'; text = '🎤 Microphone allowed, but off for the next meeting: only the call will be transcribed.';
    action = ['Turn it on', () => { $('useMic').checked = true; micPermission(); }];
  } else { kind = 'ok'; text = '🎤 Microphone allowed and on: your voice will be transcribed, labelled You.'; }
  const el = $('micStrip');
  el.className = 'strip ' + kind;
  if ($('micStripText').textContent !== text) $('micStripText').textContent = text;
  const b = $('micStripAction');
  b.hidden = !action; if (action) { b.textContent = action[0]; stripAction = action[1]; }
}
$('micStripAction').addEventListener('click', () => stripAction && stripAction());
$('useMic').addEventListener('change', micPermission);
window.addEventListener('focus', micPermission);
navigator.permissions.query({ name: 'microphone' }).then(p => { p.onchange = micPermission; }).catch(() => {});
$('copy').addEventListener('click', async () => { await navigator.clipboard.writeText($('notice').value); $('copied').textContent = 'Copied.'; });

$('start').addEventListener('click', async () => {
  $('start').disabled = true; startError = null; banner();
  const tab = await targetTab();
  if (!tab) { startError = 'Go to the Meet tab and click the MeetScribe icon in the toolbar, then press Start.'; return refresh(); }
  // route b: the service worker asks Chrome for the stream of the tab the icon was clicked on
  const r = await sw({ type: 'start', tabId: tab.id, title: tab.title || null, mic: $('useMic').checked });
  if (!r?.ok) { startError = 'Could not start: ' + (r?.error || 'no answer from the extension'); $('start').disabled = false; }
  else $('consent').checked = false;
  refresh();
});
$('stop').addEventListener('click', async () => { await sw({ type: 'stop' }); refresh(); });
$('pause').addEventListener('click', async () => { await sw({ type: 'pause', paused: session?.state !== 'paused' }); refresh(); });
$('mute').addEventListener('click', async () => { await sw({ type: 'mic', muted: !session?.mic?.muted }); refresh(); });

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.target !== 'ui' || msg.type !== 'levels') return;
  const w = (v) => (v === null ? 0 : Math.min(100, Math.round(Math.sqrt(v) * 250))) + '%';
  $('lvTab').style.width = w(msg.tab); $('lvMic').style.width = w(msg.micMuted ? 0 : msg.mic);
});

getSettings().then(s => { applyTheme(s.theme); $('useMic').checked = !!s.micDefault; micPermission(); });
refresh();
setInterval(refresh, 1000);
