// OpenRouter: transcription, the key check, the model list, and what each failure means (brief v2.0, 5).
// The key is passed in, used in one header, and never logged, thrown or returned.
import { toBase64 } from './wav.js';

export const API_BASE = 'https://openrouter.ai/api/v1';
const APP_HEADERS = { 'X-Title': 'MeetScribe', 'HTTP-Referer': 'https://github.com/VoiceDebrief/VoiceDebrief__Chrome_Extension__MeetScribe' };

/** What a failure means and what to do about it. kind: retry | fatal-segment | key | credit | offline-or-key | fallback-json */
export function classify(status, message = '') {
  // only an error that names the response format or timestamps is a format-capability error (review finding 14)
  if (status === 400 && /verbose_json|response_format|timestamp_granularit/i.test(message)) return { kind: 'fallback-json' };
  if (status === 400 || status === 413 || status === 404 || status === 422) return { kind: 'fatal-segment' };
  if (status === 401 || status === 403) return { kind: 'key' };
  if (status === 402) return { kind: 'credit' };
  if (status === 408 || status === 429 || status === 529 || status >= 500) return { kind: 'retry' };
  if (status === 0) return { kind: 'offline-or-key' };
  return { kind: 'fatal-segment' };
}

/** 2, 4, 8, 16, 32 s, each with up to 50% jitter; Retry-After wins when given. attempt starts at 1. */
export function backoffMs(attempt, retryAfterSeconds = null, rand = Math.random) {
  if (retryAfterSeconds !== null && Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0) return Math.min(retryAfterSeconds, 300) * 1000;
  const base = 1000 * Math.pow(2, Math.min(attempt, 5));
  return Math.round(base * (1 + 0.5 * rand()));
}

export const MAX_ATTEMPTS = 5;

export class ApiError extends Error {
  constructor(status, message, retryAfter = null) { super(message); this.status = status; this.retryAfter = retryAfter; this.kind = classify(status, message).kind; }
}

export const REQUEST_TIMEOUT_MS = 75000;   // OpenRouter's upstream timeout is 60 s; the queue's lease is 180 s

async function call(apiBase, key, path, init = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  let res;
  try {
    res = await fetch(apiBase + path, { ...init, signal: AbortSignal.timeout(timeoutMs),
      headers: { ...APP_HEADERS, ...(init.headers || {}), ...(key ? { Authorization: 'Bearer ' + key } : {}) } });
  } catch (e) {
    if (e && (e.name === 'TimeoutError' || e.name === 'AbortError')) throw new ApiError(408, `no answer within ${Math.round(timeoutMs / 1000)} s`);
    throw new ApiError(0, 'network: ' + (e && e.message || 'fetch failed'));   // a rejected key can look like this (VoiceDebrief issue 032)
  }
  const text = await res.text();
  let body = null; try { body = text ? JSON.parse(text) : null; } catch { body = null; }
  if (!res.ok) {
    const msg = (body && body.error && (body.error.message || body.error.code)) || text.slice(0, 300) || res.statusText;
    const ra = res.headers.get('retry-after');
    throw new ApiError(res.status, String(msg), ra !== null && ra !== '' && !isNaN(+ra) ? +ra : null);
  }
  return { body, res };
}

/**
 * Transcribe one WAV. Returns { text, segments|null, language|null, seconds|null, cost|null, generationId|null, format }.
 * A model that rejects verbose_json is retried once as json by the caller (kind 'fallback-json').
 */
export async function transcribe({ apiBase = API_BASE, key, model, wav, language = null, verbose = true, zdr = true }) {
  const payload = {
    model,
    input_audio: { data: toBase64(wav), format: 'wav' },
    temperature: 0,
    response_format: verbose ? 'verbose_json' : 'json',
    ...(verbose ? { timestamp_granularities: ['segment'] } : {}),
    ...(language ? { language } : {}),
    ...(zdr ? { provider: { zdr: true } } : {}),
  };
  const { body, res } = await call(apiBase, key, '/audio/transcriptions', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  });
  const seconds = wav.length > 44 ? (wav.length - 44) / 32000 : null;   // 16 kHz, 16-bit mono
  return parseTranscription(body, res.headers.get('x-generation-id'), verbose ? 'verbose_json' : 'json', seconds);
}

/**
 * Validates the shape. Missing is null, never 0 or ''. Model timestamps must lie inside the audio that was sent
 * (0 <= start <= end <= its length, with half a second of tolerance); if any does not, every timestamp of the
 * response is set aside and the lines fall back to the segment's own start (review finding 15).
 */
export function parseTranscription(body, generationId = null, format = 'json', audioSeconds = null) {
  if (!body || typeof body.text !== 'string') throw new ApiError(502, 'response has no text field');
  const usage = body.usage && typeof body.usage === 'object' ? body.usage : {};
  const segments = Array.isArray(body.segments)
    ? body.segments.filter(s => s && typeof s.text === 'string' && Number.isFinite(s.start) && Number.isFinite(s.end))
        .map(s => ({ start: s.start, end: s.end, text: s.text.trim() }))
    : null;
  const limit = audioSeconds === null ? Infinity : audioSeconds + 0.5;
  const timingOk = !segments || segments.every(x => x.start >= 0 && x.end >= x.start && x.end <= limit);
  return {
    text: body.text.trim(),
    segments: segments && segments.length && timingOk ? segments : null,
    timingRejected: !timingOk,
    language: typeof body.language === 'string' ? body.language : null,
    seconds: Number.isFinite(usage.seconds) ? usage.seconds : (Number.isFinite(body.duration) ? body.duration : null),
    cost: Number.isFinite(usage.cost) ? usage.cost : null,
    generationId: generationId || null,
    format,
  };
}

/** GET /key: { ok: true, label, limit, usage } or { ok: false, status }. */
export async function checkKey({ apiBase = API_BASE, key }) {
  try {
    const { body } = await call(apiBase, key, '/key');
    const d = (body && body.data) || {};
    return { ok: true, label: d.label ?? null, limit: d.limit ?? null, usage: d.usage ?? null, limitRemaining: d.limit_remaining ?? null };
  } catch (e) {
    return { ok: false, status: e.status, kind: e.kind };
  }
}

/** The live transcription catalogue: [{ id, name, prompt, completion }]. */
export async function listTranscriptionModels({ apiBase = API_BASE } = {}) {
  const { body } = await call(apiBase, null, '/models?output_modalities=transcription');
  return ((body && body.data) || []).map(m => ({ id: m.id, name: m.name, prompt: m.pricing?.prompt ?? null, completion: m.pricing?.completion ?? null }));
}

/** One chat completion (the debrief). Returns { text, model, cost|null, generationId|null }. */
export async function chat({ apiBase = API_BASE, key, model, messages, zdr = true, temperature = 0.2 }) {
  const { body } = await call(apiBase, key, '/chat/completions', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, temperature, usage: { include: true }, ...(zdr ? { provider: { zdr: true } } : {}) }),
  });
  const text = body?.choices?.[0]?.message?.content;
  if (typeof text !== 'string' || !text.trim()) throw new ApiError(502, 'the model returned no text');
  return { text: text.trim(), model: body.model || model, cost: Number.isFinite(body?.usage?.cost) ? body.usage.cost : null, generationId: body.id || null };
}
