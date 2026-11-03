// AudioWorklet: down-mixes each block to mono and posts it in batches of about 128 ms. Runs in a capture
// AudioContext created at 16 kHz where Chrome allows it; offscreen.js resamples if it does not.
class Tap extends AudioWorkletProcessor {
  constructor() { super(); this.buf = new Float32Array(2048); this.n = 0; }
  process(inputs) {
    const ch = inputs[0];
    if (ch && ch.length) {
      const len = ch[0].length;
      for (let i = 0; i < len; i++) {
        let s = 0; for (let c = 0; c < ch.length; c++) s += ch[c][i];
        this.buf[this.n++] = s / ch.length;
        if (this.n === this.buf.length) { this.port.postMessage(this.buf); this.buf = new Float32Array(2048); this.n = 0; }
      }
    }
    return true;
  }
}
registerProcessor('meetscribe-tap', Tap);
