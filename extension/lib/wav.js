// WAV in and out, and the check every segment passes before it may be sent (brief v2.0, 4.5).
// A segment is checked by its bytes, never by the label we gave it: an undecodable file sent to a
// transcription model comes back as a fluent transcript of audio nobody recorded (VoiceDebrief issue 025).

export const SAMPLE_RATE = 16000;

/** Float32 samples in [-1, 1] to 16-bit PCM. */
export function floatToInt16(f32) {
  const out = new Int16Array(f32.length);
  for (let i = 0; i < f32.length; i++) {
    const s = Math.max(-1, Math.min(1, f32[i]));
    out[i] = s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff);
  }
  return out;
}

/** Linear resampling, for when the capture context did not give us 16 kHz. */
export function resample(f32, fromRate, toRate = SAMPLE_RATE) {
  if (fromRate === toRate) return f32;
  const n = Math.floor(f32.length * toRate / fromRate);
  const out = new Float32Array(n);
  const step = fromRate / toRate;
  for (let i = 0; i < n; i++) {
    const x = i * step, i0 = Math.floor(x), t = x - i0;
    const a = f32[i0] ?? 0, b = f32[i0 + 1] ?? a;
    out[i] = a + (b - a) * t;
  }
  return out;
}

/** 16-bit mono PCM to a complete WAV file (Uint8Array). */
export function encodeWav(int16, sampleRate = SAMPLE_RATE) {
  const dataBytes = int16.length * 2;
  const buf = new ArrayBuffer(44 + dataBytes);
  const v = new DataView(buf);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + dataBytes, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, dataBytes, true);
  new Int16Array(buf, 44).set(int16);
  return new Uint8Array(buf);
}

/**
 * Checks a WAV by content. Returns { ok: true, samples, sampleRate, seconds, rms } or { ok: false, reason }.
 * expectedSamples, when given, must match the data chunk exactly.
 */
export function checkWav(bytes, expectedSamples = null) {
  if (!(bytes instanceof Uint8Array)) bytes = new Uint8Array(bytes);
  if (bytes.length < 44) return { ok: false, reason: 'shorter than a WAV header' };
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (o) => String.fromCharCode(bytes[o], bytes[o + 1], bytes[o + 2], bytes[o + 3]);
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return { ok: false, reason: 'not RIFF/WAVE' };
  if (tag(12) !== 'fmt ' || v.getUint16(20, true) !== 1) return { ok: false, reason: 'not PCM' };
  if (v.getUint16(22, true) !== 1 || v.getUint16(34, true) !== 16) return { ok: false, reason: 'not 16-bit mono' };
  if (tag(36) !== 'data') return { ok: false, reason: 'no data chunk at 36' };
  const sampleRate = v.getUint32(24, true);
  const dataBytes = v.getUint32(40, true);
  if (dataBytes !== bytes.length - 44) return { ok: false, reason: `data chunk says ${dataBytes} bytes, file has ${bytes.length - 44}` };
  const samples = dataBytes / 2;
  if (expectedSamples !== null && samples !== expectedSamples) return { ok: false, reason: `expected ${expectedSamples} samples, found ${samples}` };
  if (samples === 0) return { ok: false, reason: 'no samples' };
  let sum = 0;
  for (let i = 0; i < samples; i++) { const s = v.getInt16(44 + i * 2, true) / 32768; sum += s * s; }
  const rms = Math.sqrt(sum / samples);
  if (rms === 0) return { ok: false, reason: 'all samples are zero' };
  return { ok: true, samples, sampleRate, seconds: samples / sampleRate, rms };
}

/** Bytes to base64, in chunks (btoa on a 600 KB string at once is fine, but this never builds one huge argument list). */
export function toBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
