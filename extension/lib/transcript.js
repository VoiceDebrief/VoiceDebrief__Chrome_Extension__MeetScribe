// The transcript (brief v2.0, 6): lines from model output, the gaps that are not yet lines, labels that the
// channel proves, flags that dim a line without deleting it, cost that is never invented, and the exports.
// Pure: no chrome.*, no IndexedDB.

export const LABEL = { mic: 'You', tab: 'Meeting' };

// Stock phrases speech models produce from silence and noise. A match flags the line; it is never deleted.
export const HALLUCINATIONS = [
  /^thank(s| you)( so much| very much)? for watching[.!]?$/i,
  /^(please )?(like and )?subscribe( to (my|the|our) channel)?[.!]?$/i,
  /^subtitles? (by|from) /i,
  /^(transcribed|translated|captioned) by /i,
  /amara\.org/i,
  /^you$/i,
  /^\.+$/,
  /^obrigad[oa] por (assistir|ver)[.!]?$/i,
  /^legendas (pela|por) /i,
];
export const isSuspect = (text) => HALLUCINATIONS.some(r => r.test(text.trim()));

/** Lines for one transcribed segment. Model timestamps are offsets into the segment; added to its start. */
export function linesFromResult(seg, result, model) {
  const base = { meetingId: seg.meetingId, segmentId: seg.id, channel: seg.channel, model, generationId: result.generationId };
  if (!result.text) return [];
  if (result.segments) {
    return result.segments.filter(s => s.text).map((s, i) => ({
      ...base, id: `${seg.id}.${i}`, startMs: seg.startMs + Math.round(s.start * 1000), endMs: seg.startMs + Math.round(s.end * 1000),
      timing: 'model', text: s.text, flags: isSuspect(s.text) ? ['suspect'] : [],
      costUsd: i === 0 ? result.cost : null, costCarrier: i === 0,
    }));
  }
  return [{ ...base, id: `${seg.id}.0`, startMs: seg.startMs, endMs: seg.endMs, timing: 'segment-start',
            text: result.text, flags: isSuspect(result.text) ? ['suspect'] : [], costUsd: result.cost, costCarrier: true }];
}

const words = (t) => t.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
export function similarity(a, b) {
  const A = new Set(words(a)), B = new Set(words(b));
  if (!A.size || !B.size) return 0;
  let inter = 0; for (const w of A) if (B.has(w)) inter++;
  return inter / Math.min(A.size, B.size);
}

/**
 * Lines and gaps in time order. A gap is a segment with no lines yet (pending, sending, failed, invalid), so
 * the transcript is never silently shorter than the meeting. A microphone line that repeats a meeting line
 * overlapping it in time is marked probable-echo (brief v2.0, 6.2).
 */
export function assemble(segments, lines, { echoWindowMs = 1500, echoThreshold = 0.6 } = {}) {
  const bySeg = new Set(lines.map(l => l.segmentId));
  const tab = lines.filter(l => l.channel === 'tab');
  const items = lines.map(l => {
    const flags = [...(l.flags || [])];
    if (l.channel === 'mic' && tab.some(t => t.startMs <= l.endMs + echoWindowMs && t.endMs >= l.startMs - echoWindowMs && similarity(t.text, l.text) >= echoThreshold)) flags.push('probable-echo');
    return { type: 'line', ...l, flags, label: LABEL[l.channel] };
  });
  for (const s of segments) {
    if (s.status === 'done' || bySeg.has(s.id)) continue;
    items.push({ type: 'gap', segmentId: s.id, channel: s.channel, label: LABEL[s.channel], startMs: s.startMs, endMs: s.endMs, status: s.status, lastError: s.lastError || null });
  }
  return items.sort((a, b) => a.startMs - b.startMs || (a.channel < b.channel ? -1 : 1));
}

/** Cost as reported: the sum of known costs, and how many requests did not report one. Never invents. */
export function costOf(segments) {
  let usd = 0, unknown = 0, requests = 0;
  for (const s of segments) if (s.status === 'done') { requests++; if (s.costUsd === null || s.costUsd === undefined) unknown++; else usd += s.costUsd; }
  return { usd, unknown, requests };
}

export function clock(ms) {
  const t = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, s = t % 60;
  return [h, m, s].map(n => String(n).padStart(2, '0')).join(':');
}
const stamp = (i) => (i.timing === 'model' ? '' : '≈') + clock(i.startMs);
const gapText = (g) => `[${g.status}${g.lastError ? ': ' + g.lastError : ''}]`;
const flagText = (i) => i.flags && i.flags.length ? ` (${i.flags.join(', ')})` : '';

export function toText(meeting, items) {
  const head = [meeting.title, `Started: ${meeting.startedAt}`, meeting.endedAt ? `Ended: ${meeting.endedAt}` : null, `Model: ${meeting.model}`, ''].filter(x => x !== null);
  const body = items.map(i => i.type === 'line' ? `[${stamp(i)}] ${i.label}: ${i.text}${flagText(i)}` : `[${stamp(i)}] ${i.label}: ${gapText(i)}`);
  return head.concat(body).join('\n') + '\n';
}

export function toMarkdown(meeting, items, cost) {
  const md = [`# ${meeting.title}`, '', `- Started: ${meeting.startedAt}`];
  if (meeting.endedAt) md.push(`- Ended: ${meeting.endedAt}`);
  md.push(`- Transcription model: \`${meeting.model}\``);
  if (cost) md.push(`- Cost reported by OpenRouter: $${cost.usd.toFixed(4)} over ${cost.requests} requests` + (cost.unknown ? ` (${cost.unknown} did not report a cost)` : ''));
  md.push('', '## Transcript', '');
  for (const i of items) md.push(i.type === 'line' ? `**[${stamp(i)}] ${i.label}:** ${i.text}${flagText(i)}  ` : `*[${stamp(i)}] ${i.label}: ${gapText(i)}*  `);
  return md.join('\n') + '\n';
}

export function toJson(meeting, segments, items, cost) {
  const { ...m } = meeting;
  return JSON.stringify({
    format: 'meetscribe/meeting', version: 1, exported: new Date().toISOString(),
    meeting: m, cost,
    segments: segments.map(({ id, channel, startMs, endMs, status, cut, model, costUsd, language, lastError }) => ({ id, channel, startMs, endMs, status, cut, model: model ?? null, costUsd: costUsd ?? null, language: language ?? null, lastError: lastError ?? null })),
    items,
  }, null, 2) + '\n';
}
