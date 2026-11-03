// Cutting a channel into segments at pauses (brief v2.0, 4.4). Energy against an adaptive noise floor,
// 20 ms hops, a hangover so the tail of a word is kept. A segment closes at the first pause once it is long
// enough, is forced closed at maxMs in unbroken speech, and a segment with almost no speech is dropped
// (silence is not sent: it costs money and comes back as invented text).
//
// Pure: no Web Audio, no chrome.*. Fed Float32 at 16 kHz, it calls onSegment with Int16 PCM and sample
// offsets on the channel's own clock (samples since the session started).
import { SAMPLE_RATE, floatToInt16 } from './wav.js';

export const VAD_DEFAULTS = {
  hopMs: 20,
  minMs: 8000,          // close at a pause only once the segment is this long...
  pauseMs: 600,         // ...and the pause is this long
  idleCloseMs: 2000,    // a short utterance followed by this much silence closes anyway
  maxMs: 30000,         // forced cut in unbroken speech
  preRollMs: 200,       // audio kept from before speech started
  minSpeechMs: 300,     // less speech than this in a segment and it is dropped as silence
  floorStart: 0.002,
  floorMin: 0.0005,
  ratio: 3.0,           // speech if rms > floor * ratio...
  absMin: 0.004,        // ...and above this
  hangoverMs: 300,
};

export class Segmenter {
  constructor(onSegment, opts = {}) {
    this.o = { ...VAD_DEFAULTS, ...opts };
    this.onSegment = onSegment;
    this.hop = Math.round(SAMPLE_RATE * this.o.hopMs / 1000);
    this.pending = new Float32Array(0);   // samples not yet a full hop
    this.clock = 0;                       // samples consumed (start of the next hop)
    this.floor = this.o.floorStart;
    this.hangover = 0;
    this.preRoll = [];                    // recent hops while idle: [{ start, f32 }]
    this.seg = null;                      // { start, hops: Float32Array[], speechMs, silenceMs }
    this.stats = { segments: 0, dropped: 0, forced: 0 };
  }

  /** Feed samples (Float32, 16 kHz). Any length. */
  push(f32) {
    let buf = f32;
    if (this.pending.length) { buf = new Float32Array(this.pending.length + f32.length); buf.set(this.pending); buf.set(f32, this.pending.length); }
    let i = 0;
    for (; i + this.hop <= buf.length; i += this.hop) this._hop(buf.subarray(i, i + this.hop));
    this.pending = buf.slice(i);
  }

  /** Close whatever is open (stop, pause, mute). cut names why. */
  flush(cut = 'stop') {
    if (this.pending.length) { const p = this.pending; this.pending = new Float32Array(0); this._hop(p); }   // a short last hop, real length
    if (this.seg) this._close(cut);
    this.preRoll = [];
  }

  /** Advance the clock over a span that was not captured (paused, muted), without audio. */
  skip(samples) {
    this.flush('stop');
    this.clock += samples;
  }

  _hop(frame) {
    let sum = 0;
    for (let k = 0; k < frame.length; k++) sum += frame[k] * frame[k];
    const rms = Math.sqrt(sum / frame.length);
    const loud = rms > Math.max(this.floor * this.o.ratio, this.o.absMin);
    if (loud) this.hangover = this.o.hangoverMs; else this.hangover = Math.max(0, this.hangover - this.o.hopMs);
    const speech = loud || this.hangover > 0;
    if (!loud) this.floor = Math.max(this.o.floorMin, this.floor * 0.98 + rms * 0.02);   // adapt on quiet hops only

    const start = this.clock;
    this.clock += frame.length;
    const copy = Float32Array.from(frame);

    if (!this.seg) {
      if (speech) {
        const pre = this.preRoll;
        this.seg = { start: pre.length ? pre[0].start : start, hops: pre.map(p => p.f32), speechMs: 0, silenceMs: 0 };
        this.preRoll = [];
      } else {
        this.preRoll.push({ start, f32: copy });
        const keep = Math.ceil(this.o.preRollMs / this.o.hopMs);
        if (this.preRoll.length > keep) this.preRoll.shift();
        return;
      }
    }
    this.seg.hops.push(copy);
    if (loud) { this.seg.speechMs += this.o.hopMs; this.seg.silenceMs = 0; } else this.seg.silenceMs += this.o.hopMs;

    const lenMs = this.seg.hops.reduce((a, h) => a + h.length, 0) * 1000 / SAMPLE_RATE;
    if (lenMs >= this.o.maxMs) return this._close('forced');
    if (lenMs >= this.o.minMs && this.seg.silenceMs >= this.o.pauseMs) return this._close('pause');
    if (this.seg.silenceMs >= this.o.idleCloseMs) return this._close('pause');
  }

  _close(cut) {
    const s = this.seg; this.seg = null;
    const n = s.hops.reduce((a, h) => a + h.length, 0);
    if (s.speechMs < this.o.minSpeechMs) { this.stats.dropped++; return; }
    const f32 = new Float32Array(n);
    let o = 0; for (const h of s.hops) { f32.set(h, o); o += h.length; }
    this.stats.segments++; if (cut === 'forced') this.stats.forced++;
    this.onSegment({ startSample: s.start, endSample: s.start + n, int16: floatToInt16(f32), cut, speechMs: s.speechMs });
  }
}
