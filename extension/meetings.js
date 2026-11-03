// History (brief v2.0, 10): every meeting, its transcript with the gaps shown, the audio that was sent
// (play it, to check a line against what was heard), manual retry, exports, delete.
import * as db from './lib/db.js';
import { assemble, costOf, clock, toText, toMarkdown, toJson } from './lib/transcript.js';
import { drain } from './lib/queue.js';
import { BUILD } from './build.js';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
$('ver').textContent = 'v' + BUILD.version + (BUILD.test ? ' TEST' : '');
let current = new URLSearchParams(location.search).get('id');
let player = null;

async function list() {
  const ms = await db.listMeetings();
  $('none').hidden = ms.length > 0;
  if (!current && ms.length) current = ms[0].id;
  $('list').replaceChildren(...ms.map(m => {
    const li = el('li', m.id === current ? 'sel' : '');
    li.append(el('div', null, m.title), el('div', 'small dim', `${m.startedAt.slice(0, 16).replace('T', ' ')} · ${m.status}`));
    li.addEventListener('click', () => { current = m.id; history.replaceState(null, '', '?id=' + encodeURIComponent(m.id)); render(); });
    return li;
  }));
}

async function data() {
  const [meeting, segs, lines] = await Promise.all([db.getMeeting(current), db.segmentsFor(current), db.linesFor(current)]);
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
  const { meeting, segs, items, cost } = await data();
  if (!meeting) { $('detail').hidden = true; return; }
  $('detail').hidden = false;
  $('mTitle').textContent = meeting.title;
  const c = { done: 0, pending: 0, sending: 0, failed: 0, invalid: 0 }; for (const s of segs) c[s.status]++;
  const forced = segs.filter(s => s.cut === 'forced').length;
  const echoes = items.filter(i => i.flags?.includes('probable-echo')).length;
  const rows = [
    ['Started', meeting.startedAt], ['Ended', meeting.endedAt || '(not ended)'], ['Status', meeting.status], ['Channels', meeting.channels.join(', ')],
    ['Model', meeting.model], ['Segments', `${segs.length}: ${c.done} sent, ${c.pending + c.sending} waiting, ${c.failed} failed, ${c.invalid} not sendable; ${forced} forced cut(s)`],
    ['Cost', `$${cost.usd.toFixed(4)} reported over ${cost.requests} request(s)` + (cost.unknown ? `; ${cost.unknown} did not report a cost` : '')],
    ['Flags', `${items.filter(i => i.flags?.includes('suspect')).length} suspect line(s), ${echoes} probable echo(es)`],
  ];
  if (meeting.micError) rows.push(['Microphone', meeting.micError]);
  $('meta').replaceChildren(...rows.flatMap(([k, v]) => [el('span', 'k', k), el('span', null, v)]));
  $('lines').replaceChildren(...items.map(i => {
    const li = el('li', i.type === 'gap' ? 'gap' : (i.flags.length ? 'dimmed' : ''));
    li.append(el('span', 't', (i.timing === 'model' ? '' : '≈') + clock(i.startMs)), el('span', 'who ' + i.channel, i.label + ':'));
    if (i.type === 'line') { li.append(document.createTextNode(i.text)); for (const f of i.flags) li.append(el('span', 'flag', f)); }
    else li.append(document.createTextNode(`[${i.status}${i.lastError ? ': ' + i.lastError : ''}]`));
    const b = el('button', 'play', '▶'); b.title = 'Play the audio this came from'; b.addEventListener('click', () => play(i.segmentId)); li.append(b);
    return li;
  }));
}

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
  await db.retryFailed(current); say('Retrying…'); render();
  await drain('meetings-page', { meetingId: current, untilEmpty: true });
  say('Done.'); render();
});
$('del').addEventListener('click', async () => {
  if (!confirm('Delete this meeting, its transcript and its audio? This cannot be undone.')) return;
  await db.deleteMeeting(current); current = null; history.replaceState(null, '', location.pathname); render();
});

render();
setInterval(render, 3000);
