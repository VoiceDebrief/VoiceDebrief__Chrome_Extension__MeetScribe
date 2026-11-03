// Stamps the build, makes the download zip, and makes the test build.
//   node admin/build/package.mjs          stamps extension/build.js with the version, the commit and the time,
//                                         so the options page answers "which build am I running?", then zips
//                                         extension/ into releases/meetscribe-vX.Y.Z.zip and meetscribe-latest.zip
//                                         (one folder, meetscribe/, inside), each with its .sha256
//   node admin/build/package.mjs --test   copies extension/ to tests/.build/extension-test/ as a TEST build:
//                                         name marked, BUILD.test true, and a CSP that also allows
//                                         http://127.0.0.1 (the replay server). Never loaded by a person;
//                                         the validator refuses a release manifest that allows any host but openrouter.ai.
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const EXT = path.join(ROOT, 'extension');
const TEST = process.argv.includes('--test');
const VERSION = fs.readFileSync(path.join(ROOT, 'admin/build/version.txt'), 'utf8').trim();
if (!/^v\d+\.\d+\.\d+$/.test(VERSION)) throw new Error('version.txt must carry vX.Y.Z, got ' + VERSION);
const bare = VERSION.slice(1);
const manifest = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8'));
if (manifest.version !== bare) throw new Error(`extension/manifest.json says ${manifest.version}, version.txt says ${VERSION}`);

let commit = '';
try { commit = execSync('git rev-parse HEAD', { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch {}
const builtAt = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
const stamp = (build) => '// Written by admin/build/package.mjs. Shown on the options page, so "which build am I running?" has one answer.\n' +
  `export const BUILD = ${JSON.stringify(build)};\n`;

if (TEST) {
  const OUT = path.join(ROOT, 'tests', '.build', 'extension-test');
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.cpSync(EXT, OUT, { recursive: true });
  const m = { ...manifest, name: manifest.name + ' (TEST BUILD)',
    content_security_policy: { extension_pages: "script-src 'self'; object-src 'self'; connect-src https://openrouter.ai http://127.0.0.1:*" } };
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(m, null, 2) + '\n');
  fs.writeFileSync(path.join(OUT, 'build.js'), stamp({ version: bare, commit, built_at: builtAt, test: true }));
  console.log(`package: TEST build in ${path.relative(ROOT, OUT)}`);
} else {
  fs.writeFileSync(path.join(EXT, 'build.js'), stamp({ version: bare, commit, built_at: builtAt, test: false }));
  console.log(`package: stamped extension/build.js ${VERSION}, commit ${commit.slice(0, 12) || 'none'}, ${builtAt}`);

  // the download: extension/ as a zip, deterministic for a given tree, with its SHA-256; and a copy under a
  // name that never changes, so a post or a page can link "the latest" for good
  const { writeZip } = createRequire(import.meta.url)('./zip.cjs');
  const walk = (dir, base = dir, out = []) => { for (const n of fs.readdirSync(dir).sort()) { const p = path.join(dir, n); if (fs.statSync(p).isDirectory()) walk(p, base, out); else out.push(path.relative(base, p).split(path.sep).join('/')); } return out; };
  const zip = writeZip(walk(EXT).map(rel => ({ name: 'meetscribe/' + rel, data: fs.readFileSync(path.join(EXT, rel)) })), new Date(builtAt));
  const REL = path.join(ROOT, 'releases');
  fs.mkdirSync(REL, { recursive: true });
  const sha = crypto.createHash('sha256').update(zip).digest('hex');
  for (const name of [`meetscribe-${VERSION}.zip`, 'meetscribe-latest.zip']) {
    fs.writeFileSync(path.join(REL, name), zip);
    fs.writeFileSync(path.join(REL, name + '.sha256'), `${sha}  ${name}\n`);
  }
  console.log(`package: releases/meetscribe-${VERSION}.zip and meetscribe-latest.zip (${zip.length} bytes), sha256 ${sha}`);
}
