// Draws the extension's icons (extension/icons/{16,48,128}.png) from the same shapes as assets/favicon.svg:
// a teal rounded square with five white sound bars. No dependencies: a 4x supersampled rasteriser and a
// minimal PNG writer.   node admin/build/icons.mjs
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc32 = (b) => { let c = -1; for (const x of b) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; };
function png(w, h, rgba) {
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4); }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
// shapes in a 128-unit box, as in favicon.svg
const inRoundRect = (x, y, rx, ry, rw, rh, r) => {
  if (x < rx || y < ry || x > rx + rw || y > ry + rh) return false;
  const cx = Math.min(Math.max(x, rx + r), rx + rw - r), cy = Math.min(Math.max(y, ry + r), ry + rh - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
};
const BARS = [[26, 52, 10, 24], [44, 36, 10, 56], [62, 44, 10, 40], [80, 30, 10, 68], [98, 50, 6, 28]];
function draw(size) {
  const ss = 4, out = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
    let bg = 0, fg = 0;
    for (let sy = 0; sy < ss; sy++) for (let sx = 0; sx < ss; sx++) {
      const x = (px + (sx + 0.5) / ss) * 128 / size, y = (py + (sy + 0.5) / ss) * 128 / size;
      if (!inRoundRect(x, y, 5, 5, 118, 118, 28)) continue;
      if (BARS.some(([bx, by, bw, bh]) => inRoundRect(x, y, bx, by, bw, bh, bw / 2))) fg++; else bg++;
    }
    const n = ss * ss, a = (bg + fg) / n, o = (py * size + px) * 4;
    if (!a) continue;
    const t = fg / (bg + fg);   // white over #115e59
    out[o] = Math.round(0x11 + (255 - 0x11) * t); out[o + 1] = Math.round(0x5e + (255 - 0x5e) * t); out[o + 2] = Math.round(0x59 + (255 - 0x59) * t); out[o + 3] = Math.round(a * 255);
  }
  return png(size, size, out);
}
for (const s of [16, 48, 128]) writeFileSync(new URL(`../../extension/icons/${s}.png`, import.meta.url), draw(s));
console.log('icons: extension/icons/16.png, 48.png, 128.png');
