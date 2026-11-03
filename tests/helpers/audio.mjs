// Synthetic audio with a known shape: speech-like bursts (a tone with a syllable-rate envelope) and quiet
// noise between them. The tests know exactly where the speech is, so they can check where the cuts land.
export const RATE = 16000;
let seed = 7;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff - 0.5; };

/** plan: [['speech', ms] | ['quiet', ms] | ['zero', ms]] at rate. Returns Float32Array. */
export function synth(plan, rate = RATE) {
  const total = plan.reduce((a, [, ms]) => a + Math.round(ms * rate / 1000), 0);
  const out = new Float32Array(total);
  let o = 0;
  for (const [kind, ms] of plan) {
    const n = Math.round(ms * rate / 1000);
    for (let i = 0; i < n; i++, o++) {
      const t = o / rate;
      if (kind === 'speech') out[o] = 0.25 * Math.sin(2 * Math.PI * 220 * t) * (0.6 + 0.4 * Math.sin(2 * Math.PI * 4 * t)) + 0.01 * rnd();
      else if (kind === 'quiet') out[o] = 0.0015 * rnd();
      else out[o] = 0;
    }
  }
  return out;
}

/** Float32 to a 16-bit mono WAV Buffer (for Chromium's --use-file-for-fake-audio-capture). */
export function wavFile(f32, rate = RATE) {
  const b = Buffer.alloc(44 + f32.length * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + f32.length * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28);
  b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(f32.length * 2, 40);
  for (let i = 0; i < f32.length; i++) b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(f32[i] * 32767))), 44 + i * 2);
  return b;
}
