// The queue (brief v2.0, 5.3 and 5.4): take a lease, check the WAV by content, send, settle. Runs in any
// extension context (offscreen document during capture, service worker after, the meetings page on a manual
// retry); leases stop two of them sending the same segment, so nothing is billed twice.
import * as db from './db.js';
import { checkWav } from './wav.js';
import { transcribe, checkKey, backoffMs, MAX_ATTEMPTS, API_BASE } from './openrouter.js';
import { linesFromResult } from './transcript.js';
import { getSettings, setSettings } from './settings.js';
import { BUILD } from '../build.js';

const sleep = (ms, signal) => new Promise(r => { const t = setTimeout(r, ms); signal?.addEventListener('abort', () => { clearTimeout(t); r(); }, { once: true }); });

/**
 * Processes one segment if one is due. Returns 'done' | 'retry' | 'failed' | 'invalid' | 'held' | 'offline' | 'idle'.
 * emit(event) receives { type, ... } for the UI; it never receives the key or audio.
 */
export async function processOne(owner, { meetingId = null, emit = () => {} } = {}) {
  const seg = await db.claimNext(owner, { meetingId });
  if (!seg) return 'idle';
  try { return await sendClaimed(owner, seg, emit); }
  catch (e) {
    // anything unexpected gives the lease back, so the segment is not stranded until the lease expires
    await db.settle(owner, seg.id, { status: 'pending', nextAttemptAt: Date.now() + 5000, lastError: ('internal: ' + (e && e.message || e)).slice(0, 300) }).catch(() => {});
    emit({ type: 'error', id: seg.id, error: String(e && e.message || e) });
    return 'retry';
  }
}

async function sendClaimed(owner, seg, emit) {
  const s = await getSettings();
  const apiBase = BUILD.test && s.apiBase ? s.apiBase : API_BASE;
  const settle = (patch, lines) => db.settle(owner, seg.id, patch, lines);

  if (!s.apiKey) {
    await settle({ status: 'failed', held: true, lastError: 'no OpenRouter key set' });
    emit({ type: 'key', reason: 'missing' });
    return 'held';
  }
  const wav = await db.getWav(seg.id);
  const check = wav ? checkWav(wav, seg.samples) : { ok: false, reason: 'audio missing' };
  if (!check.ok) {
    await settle({ status: 'invalid', lastError: 'not sent: ' + check.reason });
    emit({ type: 'segment', id: seg.id, status: 'invalid' });
    return 'invalid';
  }

  const model = seg.model || s.model;
  const verbose = !s.noVerbose[model];
  try {
    const r = await transcribe({ apiBase, key: s.apiKey, model, wav, language: s.language || null, verbose, zdr: s.zdr });
    const lines = linesFromResult({ ...seg }, r, model);
    const ok = await settle({ status: 'done', doneAt: Date.now(), model, costUsd: r.cost, seconds: r.seconds, language: r.language,
                              generationId: r.generationId, format: r.format, empty: lines.length === 0, lastError: null }, lines);
    emit({ type: 'segment', id: seg.id, status: ok ? 'done' : 'lost-lease' });
    return 'done';
  } catch (e) {
    const status = e.status ?? 0;
    if (status === 400 && verbose) {
      // the model (or its provider) rejected verbose_json: remember, and resend as plain json
      await setSettings({ noVerbose: { ...s.noVerbose, [model]: true } });
      await settle({ status: 'pending', nextAttemptAt: 0, lastError: 'verbose_json rejected; retrying as json' });
      return 'retry';
    }
    let kind = e.kind;
    if (kind === 'offline-or-key') {
      const k = await checkKey({ apiBase, key: s.apiKey });
      kind = !k.ok && (k.status === 401 || k.status === 403) ? 'key' : 'offline';
    }
    if (kind === 'key' || kind === 'credit') {
      const why = kind === 'key' ? 'OpenRouter rejected the key' : 'the OpenRouter key is out of credit';
      await settle({ status: 'failed', held: true, lastError: why });
      emit({ type: 'key', reason: kind });
      return 'held';
    }
    const attempts = (seg.attempts || 0) + 1;
    if (kind === 'offline' || kind === 'retry') {
      if (kind === 'retry' && attempts >= MAX_ATTEMPTS) {
        await settle({ status: 'failed', attempts, lastError: `gave up after ${attempts} attempts: ${status} ${e.message}`.slice(0, 300) });
        emit({ type: 'segment', id: seg.id, status: 'failed' });
        return 'failed';
      }
      const wait = backoffMs(attempts, e.retryAfter);
      await settle({ status: 'pending', attempts: kind === 'offline' ? seg.attempts || 0 : attempts, nextAttemptAt: Date.now() + wait,
                     lastError: (kind === 'offline' ? 'offline, will retry' : `${status} ${e.message}`).slice(0, 300) });
      emit({ type: kind === 'offline' ? 'offline' : 'segment', id: seg.id, status: 'pending' });
      return kind === 'offline' ? 'offline' : 'retry';
    }
    await settle({ status: 'failed', attempts, lastError: `${status} ${e.message}`.slice(0, 300) });
    emit({ type: 'segment', id: seg.id, status: 'failed' });
    return 'failed';
  }
}

/**
 * Drains with `workers` requests in flight. Stops when signal aborts, on a key or credit problem, or (if
 * untilEmpty) when nothing for this meeting is pending or sending. Offline: waits and keeps trying.
 */
export async function drain(owner, { meetingId = null, workers = 2, untilEmpty = false, signal = null, emit = () => {}, idleMs = 1000 } = {}) {
  let stop = false;
  const worker = async (n) => {
    while (!stop && !signal?.aborted) {
      const r = await processOne(`${owner}#${n}`, { meetingId, emit });
      if (r === 'held') { stop = true; break; }
      if (r === 'idle' || r === 'offline') {
        if (untilEmpty) {
          const c = await db.countByStatus(meetingId);
          if (!c.pending && !c.sending) break;
        }
        await sleep(r === 'offline' ? 3000 : idleMs, signal);
      }
    }
  };
  await Promise.all(Array.from({ length: workers }, (_, i) => worker(i)));
}
