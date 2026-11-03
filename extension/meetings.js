// History (brief v2.0, 10): every meeting, its transcript with the gaps shown, the audio that was sent
// (play it, to check a line against what was heard), manual retry, exports, delete, the debrief.
//
// v0.3.2, after the v0.3.1 review: a debrief belongs to the meeting it was started for, whatever is selected
// when it arrives (finding 10), and says when the transcript has changed since (18); deletion goes through the
// service worker, which stops a capture first (01); meetings are buttons, and the page only rebuilds what
// changed, so keyboard focus survives the refresh (12).
import * as db from './lib/db.js';
import { assemble, costOf, clock, toText, toMarkdown, toJson } from './lib/transcript.js';
import { drain } from './lib/queue.js';
import { buildMessages, blocks } from './lib/debrief.js';
import { chat, API_BASE } from './lib/openrouter.js';
import { LOCALES } from './lib/prompts.js';
import { getSettings } from './lib/settings.js';
import { applyTheme } from './lib/theme.js';
import { BUILD } from './build.js';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
$('ver').textContent = 'v' + BUILD.version + (BUILD.test ? ' TEST' : '');
getSettings().then(s => applyTheme(s.theme));
const writing = new Set();     // meeting ids with a debrief being written
let current = new URLSearchParams(location.search).get('id');
let player = null;
let lastListSig = '', lastDetailSig = '';

/** What the transcript is, as far as a debrief is concerned: changes whenever a line or a gap changes. */
export const transcriptSig = (segs, lines) => `${lines.length}:${segs.map(s => s.id + '=' + s.status).sort().join(',')}`;

function select(id) {
  current = id; history.replaceState(null, '', '?id=' + encodeURIComponent(id));
  lastDetailSig = ''; render();
}

async function list() {
  const ms = await db.listMeetings();
  $('none').hidden = ms.length > 0;
  if (!current && ms.length) current = ms[0].id;
  const sig = current + '|' + ms.map(m => m.id + m.title + m.status).join('|');
  if (sig === lastListSig) return;
  lastListSig = sig;
  const focused = document.activeElement?.dataset?.meeting;
  $('list').replaceChildren(...ms.map(m => {
    const li = el('li', m.id === current ? 'sel' : '');
    const b = el('button', 'meeting');
    b.type = 'button'; b.dataset.meeting = m.id;
    if (m.id === current) b.setAttribute('aria-current', 'true');
    b.append(el('span', 'mt', m.title), el('span', 'small dim', `${m.startedAt.slice(0, 16).replace('T', ' ')} · ${m.status}`));
    b.addEventListener('click', () => select(m.id));
    li.append(b);
    return li;
  }));
  if (focused) $('list').querySelector(`[data-meeting="${CSS.escape(focused)}"]`)?.focus();
}

async function data(id = current) {
  const [meeting, segs, lines] = await Promise.all([db.getMeeting(id), db.segmentsFor(id), db.linesFor(id)]);
  return { meeting, segs, lines, items: assemble(segs, lines), cost: costOf(segs) };
}

async function play(segmentId) {
  const wav = await db.getWav(segmentId);
  if (!wav) return say('That segment\'s audio was deleted under the retention setting.');
  if (player) { player.pause(); URL.revokeObjectURL(player.src); }
  player = new Audio(URL.createObjectURL(new Blob([wav], { type: 'audio/wav' })));
  player.play();
}
const say = (t) => { $('msg').textContent = t; };

async function render() {
  await list();
  if (!current) { $('detail').hidden = true; return; }
  const { meeting, segs, lines, items, cost } = await data();
  if (!meeting) { $('detail').hidden = true; return; }
  $('detail').hidden = false;
  const sig = transcriptSig(segs, lines);
  renderDebrief(meeting, sig);
  const detailSig = meeting.id + meeting.status + sig + (meeting.endedAt || '');
  if (detailSig === lastDetailSig) return;          // nothing changed: leave the DOM (and focus, selection) alone
  lastDetailSig = detailSig;
  $('mTitle').textContent = meeting.title;
  const c = { done: 0, pending: 0, sending: 0, failed: 0, invalid: 0, empty: 0 }; for (const s of segs) c[s.status]++;
  const forced = segs.filter(s => s.cut === 'forced').length;
  const echoes = items.filter(i => i.flags?.includes('probable-echo')).length;
  const rows = [
    ['Started', meeting.startedAt], ['Ended', meeting.endedAt || '(not ended)'], ['Status', meeting.status], ['Channels', meeting.channels.join(', ')],
    ['Model', meeting.model], ['Segments', `${segs.length}: ${c.done} sent, ${c.pending + c.sending} waiting, ${c.failed} failed, ${c.empty} came back empty, ${c.invalid} not sendable; ${forced} forced cut(s)`],
    ['Cost', `$${cost.usd.toFixed(4)} reported over ${cost.requests} request(s)` + (cost.unknown ? `; ${cost.unknown} did not report a cost` : '') + '. The debrief is counted separately.'],
    ['Flags', `${items.filter(i => i.flags?.includes('suspect')).length} suspect line(s), ${echoes} probable echo(es)`],
  ];
  if (meeting.micError) rows.push(['Microphone', meeting.micError]);
  if ((meeting.lostSpans || []).length) rows.push(['Not saved', meeting.lostSpans.map(l => `${l.channel} ${clock(l.startMs)} to ${clock(l.endMs)}: ${l.error}`).join('; ')]);
  $('meta').replaceChildren(...rows.flatMap(([k, v]) => [el('span', 'k', k), el('span', null, v)]));
  $('lines').replaceChildren(...items.map(i => {
    const li = el('li', i.type === 'gap' ? 'gap' : (i.flags.length ? 'dimmed' : ''));
    li.append(el('span', 't', (i.timing === 'model' ? '' : '≈') + clock(i.startMs)));
    if (i.channel === 'mic') li.append(el('span', 'who mic', i.label + ':'));   // only You is labelled
    if (i.type === 'line') { li.append(document.createTextNode(i.text)); for (const f of i.flags) li.append(el('span', 'flag', f)); }
    else li.append(document.createTextNode(`[${i.status}${i.lastError ? ': ' + i.lastError : ''}]`));
    const b = el('button', 'play', '▶'); b.type = 'button';
    b.setAttribute('aria-label', `Play the audio of the ${i.channel === 'mic' ? 'microphone' : 'call'} line at ${clock(i.startMs)}`);
    b.title = 'Play the audio this came from'; b.addEventListener('click', () => play(i.segmentId)); li.append(b);
    return li;
  }));
}

function renderDebrief(meeting, sig) {
  const d = meeting.debrief;
  const busy = writing.has(meeting.id);
  $('debriefBox').hidden = !d && !busy;
  $('debrief').textContent = busy ? 'Writing the debrief…' : d ? 'Rewrite the debrief' : 'Write the debrief';
  $('debrief').disabled = busy;
  if (!d) { $('debriefBody').replaceChildren(); $('debriefMeta').textContent = busy ? 'Writing…' : ''; return; }
  const stale = d.transcriptSig && d.transcriptSig !== sig;
  $('debriefMeta').textContent = `Written ${d.generatedAt.slice(0, 16).replace('T', ' ')} by ${d.model}, in ${(LOCALES[d.locale] || {}).label || d.locale}` +
    (d.costUsd === null ? '; OpenRouter did not report the cost.' : `; $${d.costUsd.toFixed(4)} reported by OpenRouter.`) +
    (stale ? ' The transcript has changed since this was written: rewrite it to include the change.' : ' The transcript below is unchanged.') +
    ' The times are the model\'s references to lines below, not checked links.';
  $('debriefMeta').className = 'small ' + (stale ? 'warn' : 'dim');
  const key = d.generatedAt + sig;
  if ($('debriefBody').dataset.key === key) return;
  $('debriefBody').dataset.key = key;
  const nodes = []; let ul = null;
  for (const b of blocks(d.markdown)) {
    if (b.type === 'li') { if (!ul) { ul = el('ul'); nodes.push(ul); } ul.append(el('li', null, b.text)); continue; }
    ul = null; nodes.push(el(b.type === 'h' ? 'h3' : 'p', null, b.text));
  }
  $('debriefBody').replaceChildren(...nodes);
}

async function writeDebrief() {
  const id = current;                                 // finding 10: fixed now, before anything is awaited
  if (!id || writing.has(id)) return;
  const s = await getSettings();
  if (!s.apiKey) return say('Set your OpenRouter key on the options page first.');
  const { segs, lines, items } = await data(id);
  if (!items.some(i => i.type === 'line')) return say('Nothing transcribed yet: there is nothing to debrief.');
  const sig = transcriptSig(segs, lines);
  writing.add(id); say(''); render();
  try {
    const r = await chat({ apiBase: BUILD.test && s.apiBase ? s.apiBase : API_BASE, key: s.apiKey, model: s.debriefModel, messages: buildMessages(items, s.debriefLocale), zdr: s.zdr });
    if (!(await db.getMeeting(id))) { say('That meeting was deleted while its debrief was being written; the debrief was discarded.'); return; }
    await db.updateMeeting(id, { debrief: { markdown: r.text, model: r.model, locale: s.debriefLocale, generatedAt: new Date().toISOString(), costUsd: r.cost, generationId: r.generationId, transcriptSig: sig } });
    if (current === id) say('');
  } catch (e) {
    say(e.status === 401 || e.status === 403 ? 'OpenRouter rejected the key.' : e.status === 402 ? 'The OpenRouter key is out of credit.' : 'The debrief failed: ' + e.message + '. The transcript is untouched.');
  } finally { writing.delete(id); lastDetailSig = ''; render(); }
}
$('debrief').addEventListener('click', writeDebrief);

function download(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
const fileBase = (m) => 'meetscribe-' + m.startedAt.slice(0, 16).replace(/[:T]/g, '-');
$('exTxt').addEventListener('click', async () => { const d = await data(); download(fileBase(d.meeting) + '.txt', toText(d.meeting, d.items), 'text/plain'); });
$('exMd').addEventListener('click', async () => { const d = await data(); download(fileBase(d.meeting) + '.md', toMarkdown(d.meeting, d.items, d.cost), 'text/markdown'); });
$('exJson').addEventListener('click', async () => { const d = await data(); download(fileBase(d.meeting) + '.json', toJson(d.meeting, d.segs, d.items, d.cost), 'application/json'); });
$('retry').addEventListener('click', async () => {
  const id = current;
  await db.retryFailed(id); say('Retrying…'); lastDetailSig = ''; render();
  await drain('meetings-page', { meetingId: id, untilEmpty: true });
  await db.reconcileStatus(id).catch(() => {});
  say('Done.'); lastDetailSig = ''; render();
});
$('del').addEventListener('click', async () => {
  if (!confirm('Delete this meeting, its transcript and its audio from this browser? If it is being recorded, recording stops. This cannot be undone, and it cannot recall audio already sent to OpenRouter.')) return;
  const r = await chrome.runtime.sendMessage({ target: 'sw', type: 'delete-meeting', meetingId: current });
  if (!r?.ok) return say('Could not delete: ' + (r?.error || 'no answer'));
  current = null; history.replaceState(null, '', location.pathname); lastListSig = ''; lastDetailSig = ''; render();
});

render();
setInterval(render, 3000);
