// AudioWorklet: down-mixes each block to mono and posts it in batches of about 128 ms, in a capture
// AudioContext created at 16 kHz where Chrome allows it (offscreen.js resamples if it does not).
//
// The privacy boundary lives HERE, on the audio thread (v0.3.1 review, finding 02). While gated (paused, or
// the microphone muted) samples are counted and dropped, never buffered; on every gate change the partial batch
// is posted first, so audio from before a mute is never mixed with audio after it. A flush posts what is
// buffered and acknowledges, so Stop loses no tail (finding 16).
//
// Messages out: { pcm: Float32Array } | { skip: n } (samples not captured) | { gateAck: bool } | { flushed: true }
// Messages in:  { gate: bool } | { flush: true }
class Tap extends AudioWorkletProcessor {
  constructor() {
    super();
    this.size = 2048; this.buf = new Float32Array(this.size); this.n = 0;
    this.gated = false; this.skipped = 0;
    this.port.onmessage = ({ data }) => {
      if (data && 'gate' in data) { this.emit(); this.emitSkip(); this.gated = !!data.gate; this.port.postMessage({ gateAck: this.gated }); }
      if (data && data.flush) { this.emit(); this.emitSkip(); this.port.postMessage({ flushed: true }); }
    };
  }
  emit() { if (this.n) { this.port.postMessage({ pcm: this.buf.slice(0, this.n) }); this.buf = new Float32Array(this.size); this.n = 0; } }
  emitSkip() { if (this.skipped) { this.port.postMessage({ skip: this.skipped }); this.skipped = 0; } }
  process(inputs) {
    const ch = inputs[0];
    if (!ch || !ch.length) return true;
    const len = ch[0].length;
    if (this.gated) { this.skipped += len; if (this.skipped >= this.size) this.emitSkip(); return true; }
    for (let i = 0; i < len; i++) {
      let s = 0; for (let c = 0; c < ch.length; c++) s += ch[c][i];
      this.buf[this.n++] = s / ch.length;
      if (this.n === this.size) this.emit();
    }
    return true;
  }
}
registerProcessor('meetscribe-tap', Tap);
