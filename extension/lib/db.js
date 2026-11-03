// IndexedDB, without a library (brief v2.0, 8). One database for every extension context: the offscreen
// document writes segments, the service worker and pages read them. Audio lives in its own store so listing
// segments never loads it. Leases make a segment sendable by one context at a time (brief v2.0, 5.3).

export const DB_NAME = 'meetscribe';
const VERSION = 1;
let dbp = null;

export function openDb() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, VERSION);
    r.onupgradeneeded = () => {
      const db = r.result;
      db.createObjectStore('meetings', { keyPath: 'id' });
      const s = db.createObjectStore('segments', { keyPath: 'id' });
      s.createIndex('meetingId', 'meetingId');
      s.createIndex('status', 'status');
      db.createObjectStore('wavs', { keyPath: 'segmentId' });
      const l = db.createObjectStore('lines', { keyPath: 'id' });
      l.createIndex('meetingId', 'meetingId');
      l.createIndex('segmentId', 'segmentId');
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  return dbp;
}

/** Runs fn(stores) in one transaction; fn issues requests synchronously and returns a value or a request. */
async function tx(names, mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(names, mode);
    const stores = Object.fromEntries(names.map(n => [n, t.objectStore(n)]));
    let out;
    try { out = fn(stores, t); } catch (e) { t.abort(); return reject(e); }
    t.oncomplete = () => resolve(out && out.__req ? out.__req.result : (out instanceof IDBRequest ? out.result : out));
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('transaction aborted'));
  });
}
const req = (r) => ({ __req: r });

export const uid = (p) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

// ---------------------------------------------------------------- meetings
export const putMeeting = (m) => tx(['meetings'], 'readwrite', s => { s.meetings.put(m); return m; });
export const getMeeting = (id) => tx(['meetings'], 'readonly', s => req(s.meetings.get(id)));
export async function listMeetings() {
  const all = await tx(['meetings'], 'readonly', s => req(s.meetings.getAll()));
  return all.sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
}
export async function updateMeeting(id, patch) {
  return tx(['meetings'], 'readwrite', s => {
    const r = s.meetings.get(id);
    r.onsuccess = () => { if (r.result) s.meetings.put({ ...r.result, ...(typeof patch === 'function' ? patch(r.result) : patch) }); };
  });
}

// ---------------------------------------------------------------- segments and their audio
/** Persist a segment and its WAV in one transaction: written before anything is sent. */
export const addSegment = (seg, wavBytes) => tx(['segments', 'wavs'], 'readwrite', s => {
  s.segments.put(seg);
  s.wavs.put({ segmentId: seg.id, bytes: wavBytes.buffer.slice(wavBytes.byteOffset, wavBytes.byteOffset + wavBytes.byteLength) });
  return seg;
});
export const getSegment = (id) => tx(['segments'], 'readonly', s => req(s.segments.get(id)));
export async function getWav(segmentId) {
  const r = await tx(['wavs'], 'readonly', s => req(s.wavs.get(segmentId)));
  return r ? new Uint8Array(r.bytes) : null;
}
export async function segmentsFor(meetingId) {
  const all = await tx(['segments'], 'readonly', s => req(s.segments.index('meetingId').getAll(meetingId)));
  return all.sort((a, b) => a.startMs - b.startMs || a.channel.localeCompare(b.channel));
}
export const putSegment = (seg) => tx(['segments'], 'readwrite', s => { s.segments.put(seg); return seg; });

/**
 * Takes a lease on the next sendable segment, atomically. Sendable: pending and due, or sending with an
 * expired lease (its context died). Returns the claimed segment or null.
 */
export async function claimNext(owner, { now = Date.now(), leaseMs = 90000, meetingId = null } = {}) {
  return tx(['segments'], 'readwrite', s => {
    const out = { seg: null };
    const r = s.segments.getAll();
    r.onsuccess = () => {
      const due = r.result.filter(x => (meetingId === null || x.meetingId === meetingId) && (
        (x.status === 'pending' && (x.nextAttemptAt || 0) <= now) ||
        (x.status === 'sending' && (x.claimedUntil || 0) < now)))
        .sort((a, b) => a.createdAt - b.createdAt);
      if (!due.length) return;
      const seg = { ...due[0], status: 'sending', claimedBy: owner, claimedUntil: now + leaseMs };
      s.segments.put(seg);
      out.seg = seg;
    };
    return out;
  }).then(o => o.seg);
}

/** Writes the result only if this context still holds the lease; returns false if it lost it. */
export async function settle(owner, segmentId, patch, lines = []) {
  return tx(['segments', 'lines'], 'readwrite', s => {
    const out = { ok: false };
    const r = s.segments.get(segmentId);
    r.onsuccess = () => {
      const seg = r.result;
      if (!seg || seg.claimedBy !== owner || seg.status !== 'sending') return;
      s.segments.put({ ...seg, ...patch, claimedBy: null, claimedUntil: null });
      for (const l of lines) s.lines.put(l);
      out.ok = true;
    };
    return out;
  }).then(o => o.ok);
}

export async function countByStatus(meetingId = null) {
  const all = await tx(['segments'], 'readonly', s => req(s.segments.getAll()));
  const c = { pending: 0, sending: 0, done: 0, failed: 0, invalid: 0 };
  for (const x of all) if (meetingId === null || x.meetingId === meetingId) c[x.status] = (c[x.status] || 0) + 1;
  return c;
}

/** Failed segments of a meeting go back to pending (manual retry). */
export async function retryFailed(meetingId) {
  return tx(['segments'], 'readwrite', s => {
    const r = s.segments.index('meetingId').getAll(meetingId);
    r.onsuccess = () => { for (const x of r.result) if (x.status === 'failed') s.segments.put({ ...x, status: 'pending', attempts: 0, nextAttemptAt: 0, lastError: null }); };
  });
}

/** Every segment that stopped for a key or credit problem resumes (after the key is fixed). */
export async function resumeHeld() {
  return tx(['segments'], 'readwrite', s => {
    const r = s.segments.getAll();
    r.onsuccess = () => { for (const x of r.result) if (x.status === 'failed' && x.held) s.segments.put({ ...x, status: 'pending', held: false, nextAttemptAt: 0, lastError: null }); };
  });
}

// ---------------------------------------------------------------- lines
export async function linesFor(meetingId) {
  return tx(['lines'], 'readonly', s => req(s.lines.index('meetingId').getAll(meetingId)));
}

// ---------------------------------------------------------------- retention and deletion
export async function deleteMeeting(meetingId) {
  return tx(['meetings', 'segments', 'wavs', 'lines'], 'readwrite', s => {
    s.meetings.delete(meetingId);
    const a = s.segments.index('meetingId').getAllKeys(meetingId);
    a.onsuccess = () => { for (const k of a.result) { s.segments.delete(k); s.wavs.delete(k); } };
    const b = s.lines.index('meetingId').getAllKeys(meetingId);
    b.onsuccess = () => { for (const k of b.result) s.lines.delete(k); };
  });
}
export async function deleteAll() {
  return tx(['meetings', 'segments', 'wavs', 'lines'], 'readwrite', s => { for (const n of ['meetings', 'segments', 'wavs', 'lines']) s[n].clear(); });
}
/** Deletes the audio of segments done more than keepMs ago. keepMs null keeps everything. Returns the count. */
export async function applyRetention(keepMs, now = Date.now()) {
  if (keepMs === null) return 0;
  return tx(['segments', 'wavs'], 'readwrite', s => {
    const out = { n: 0 };
    const r = s.segments.getAll();
    r.onsuccess = () => {
      for (const x of r.result) if (x.status === 'done' && x.hasAudio && (x.doneAt || 0) + keepMs <= now) {
        s.wavs.delete(x.id); s.segments.put({ ...x, hasAudio: false }); out.n++;
      }
    };
    return out;
  }).then(o => o.n);
}
export async function totals() {
  const [m, s, w, l] = await Promise.all(['meetings', 'segments', 'wavs', 'lines'].map(n => tx([n], 'readonly', st => req(st[n].count()))));
  return { meetings: m, segments: s, wavs: w, lines: l };
}
