// Refreshes the VoiceDebrief colour schemes vendored here (assets/vd-tokens.css, extension/vd-tokens.css)
// from a clone of VoiceDebrief/VoiceDebrief__Website. MeetScribe is a VoiceDebrief product: its colour comes
// from that file and nowhere else.   node admin/build/vendor-vd.mjs <path to VoiceDebrief__Website clone>
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const VD = process.argv[2];
if (!VD) { console.error('usage: node admin/build/vendor-vd.mjs <VoiceDebrief__Website clone>'); process.exit(1); }
const src = fs.readFileSync(path.join(VD, 'website/vd-tokens.css'), 'utf8').split('\n');
const start = src.findIndex(l => l === ':root,');
const end = src.findIndex(l => l.includes('B. The --wa-* layer'));
if (start < 0 || end < 0) throw new Error('vd-tokens.css has changed shape: find layer A by hand');
let commit = 'unknown'; try { commit = execSync('git rev-parse --short HEAD', { cwd: VD }).toString().trim(); } catch {}
const out = [
  `/* Vendored from VoiceDebrief/VoiceDebrief__Website, website/vd-tokens.css at commit ${commit} (layer A: the five`,
  `   --vd-* schemes, unchanged). MeetScribe is a VoiceDebrief product and takes its colour from the same file;`,
  `   refresh with admin/build/vendor-vd.mjs. Switch scheme with data-vd-theme on <html>; absent is Signal. */`,
  '', ...src.slice(start, end - 1)].join('\n').replace(/\n+$/, '\n');
for (const f of ['assets/vd-tokens.css', 'extension/vd-tokens.css']) fs.writeFileSync(path.join(ROOT, f), out);
console.log(`vendor-vd: layer A from ${commit} into assets/ and extension/`);
