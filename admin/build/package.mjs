// Stamps the build and makes the test build. No zip yet: the extension is loaded unpacked from extension/.
//   node admin/build/package.mjs          stamps extension/build.js with the version, the commit and the time,
//                                         so the options page answers "which build am I running?"
//   node admin/build/package.mjs --test   copies extension/ to tests/.build/extension-test/ as a TEST build:
//                                         name marked, BUILD.test true, and a CSP that also allows
//                                         http://127.0.0.1 (the replay server). Never loaded by a person;
//                                         the validator refuses a release manifest that allows any host but openrouter.ai.
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
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
}
