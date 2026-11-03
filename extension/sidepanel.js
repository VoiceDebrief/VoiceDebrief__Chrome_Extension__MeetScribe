// The side panel (brief v2.0, 10): the live view beside Meet. Start (after consent), meters, the separate
// microphone mute, queue counts, cost as reported, live lines, pause and stop. Data is rendered with
// textContent only. The panel reads IndexedDB and session storage; it never holds audio.
import * as db from './lib/db.js';
import { assemble, costOf, clock } from './lib/transcript.js';
import { getSettings } from './lib/settings.js';
import { BUILD } from './build.js';

const $ = (id) => document.getElementById(id);
const sw = (msg) => chrome.runtime.sendMessage({ target: 'sw', ...msg });
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

$('ver').textContent = 'v' + BUILD.version + (BUILD.test ? ' TEST' : '');
let session = null, settings = null, shownMeeting = null;

function banner(kind, text, link) {
  const b = $('banner'); b.replaceChildren();
  if (!text) return;
  const d = el('div', kind, text + ' ');
  if (link) { const a = el('a', null, link.text); a.href = link.href; a.target = '_blank'; d.append(a); }
  b.append(d);
}

async function targetTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

async function renderIdle() {
  const tab = await targetTab();
  const url = tab?.url || '';
  const isMeet = /^https:\/\/meet\.google\.com\//.test(url);
  $('tabinfo').textContent = tab ? (tab.title ? `${tab.title}${url ? ' (' + new URL(url).host + ')' : ''}` : 'the active tab') + (url && !isMeet ? '. Not a Google Meet tab: MeetScribe will still capture it.' : '') : 'No active tab.';
  $('start').disabled = !$('consent').checked || !settings.apiKey;
}

async function refresh() {
  [session, settings] = await Promise.all([chrome.storage.session.get({ session: null }).then(r => r.session), getSettings()]);
  const state = session?.state || 'idle';
  const counts = await db.countByStatus();
  const held = (await (async () => { const m = session?.meetingId || session?.lastMeetingId; return m ? (await db.segmentsFor(m)).filter(s => s.held) : []; })());

  if (!settings.apiKey) banner('warn', 'Set your OpenRouter key before starting.', { text: 'Open options', href: 'options.html' });
  else if (held.length) banner('err', `${held[0].lastError}: ${held.length} segment(s) are kept and will be sent once it is fixed.`, { text: 'Fix the key', href: 'options.html' });
  else if (session?.error) banner('warn', session.error);
  else if (!navigator.onLine && counts.pending) banner('warn', 'Offline: segments are saved and will be sent when the connection returns.');
  else banner();

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
    li.append(el('span', 't', (i.timing === 'model' ? '' : '≈') + clock(i.startMs)), el('span', 'who ' + i.channel, i.label + ':'));
    if (i.type === 'line') { li.append(document.createTextNode(i.text)); for (const f of i.flags) li.append(el('span', 'flag', f)); }
    else li.append(document.createTextNode(i.status === 'failed' || i.status === 'invalid' ? `[${i.status}: ${i.lastError || ''}]` : `[${i.status}…]`));
    return li;
  }));
  if (nearBottom) window.scrollTo(0, document.body.scrollHeight);
}

$('consent').addEventListener('change', renderIdle);
$('useMic').addEventListener('change', () => { $('micNote').hidden = !$('useMic').checked; });
$('copy').addEventListener('click', async () => { await navigator.clipboard.writeText($('notice').value); $('copied').textContent = 'Copied.'; });

$('start').addEventListener('click', async () => {
  $('start').disabled = true;
  const tab = await targetTab();
  if (!tab) return banner('err', 'No active tab to capture.');
  let streamId;
  try {
    // called here, in the click, on the tab the panel was opened for (spike S1, route a)
    streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id });
  } catch (e) {
    $('start').disabled = false;
    return banner('err', `Chrome would not capture this tab: ${e.message}. Click the MeetScribe icon while on the Meet tab, then Start.`);
  }
  const r = await sw({ type: 'start', streamId, tabId: tab.id, title: tab.title || null, mic: $('useMic').checked });
  if (!r?.ok) { $('start').disabled = false; banner('err', 'Could not start: ' + (r?.error || 'no answer')); }
  $('consent').checked = false;
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

getSettings().then(s => { $('useMic').checked = !!s.micDefault; $('micNote').hidden = !s.micDefault; });
refresh();
setInterval(refresh, 1000);
