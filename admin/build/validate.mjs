// The pre-release gate. No dependencies, no network.
//   node admin/build/validate.mjs
// 1. every generated file is up to date (build.mjs --check)
// 2. every index.md has its index.html, and every page is in build.mjs's list
// 3. every relative link in the HTML, the markdown and llms.txt resolves, including #anchors in HTML
// 4. no key-shaped string anywhere in the repository (OpenRouter, OpenAI, GitHub, AWS, private keys)
// 5. house style on the pages this site writes: no em-dashes (brief/v1 is kept verbatim and exempt)
// 6. no script on any page: this site is static
// 7. one version: admin/build/version.txt, extension/manifest.json and package.json agree; build.js is not a test build
// 8. the extension's manifest is exactly the planned one (brief v2.0, 9): permissions, the one host, the CSP
// 9. the extension's code: network only in lib/openrouter.js; no eval, new Function, remote script, innerHTML
// 10. colour only in vd-tokens.css (VoiceDebrief's rule)
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const fails = [];
const fail = (msg) => fails.push(msg);

const walk = (d) => readdirSync(d).flatMap(n => {
  if (['.git', 'node_modules', '.build', '.out'].includes(n)) return [];
  const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p];
});
const files = walk(ROOT);
const rel = (p) => relative(ROOT, p);

// 1
try { execFileSync(process.execPath, [join(ROOT, 'admin/build/build.mjs'), '--check'], { stdio: 'pipe' }); }
catch (e) { fail(`generated files out of date:\n${e.stderr}`); }

// 2
const listed = [...readFileSync(join(ROOT, 'admin/build/build.mjs'), 'utf8').matchAll(/path: '([^']*)'/g)].map(m => m[1]);
for (const md of files.filter(f => f.endsWith('index.md'))) {
  const dir = rel(dirname(md)) || '';
  if (dir.startsWith('admin')) continue;
  if (!listed.includes(dir)) fail(`${rel(md)} is not in build.mjs's page list`);
  if (!existsSync(join(dirname(md), 'index.html'))) fail(`${rel(md)} has no index.html`);
}

// 3
const anchors = new Map();
const idsOf = (html) => { if (!anchors.has(html)) anchors.set(html, new Set([...readFileSync(html, 'utf8').matchAll(/ id="([^"]+)"/g)].map(m => m[1]))); return anchors.get(html); };
const SITE = 'https://' + readFileSync(join(ROOT, 'CNAME'), 'utf8').trim();
const checkLink = (from, href) => {
  if (href.startsWith(SITE + '/')) { from = join(ROOT, 'index.html'); href = href.slice(SITE.length + 1) || 'index.html'; }   // our own absolute URLs must resolve here too
  if (/^([a-z]+:|\/\/)/i.test(href) || href.startsWith('mailto:')) return;
  const [path, frag] = href.split('#');
  const target = path ? resolve(dirname(from), decodeURI(path)) : from;
  if (!existsSync(target)) return fail(`${rel(from)}: broken link ${href}`);
  if (frag && target.endsWith('.html') && !idsOf(target).has(frag)) fail(`${rel(from)}: missing anchor ${href}`);
};
for (const f of files) {
  if (f.endsWith('.html')) for (const m of readFileSync(f, 'utf8').matchAll(/(?:href|src)="([^"]+)"/g)) checkLink(f, m[1].replace(/&amp;/g, '&'));
  if (f.endsWith('.md') && !rel(f).startsWith('admin/') && !rel(f).startsWith('tests/')) for (const m of readFileSync(f, 'utf8').matchAll(/\]\(([^)\s]+)\)/g)) checkLink(f, m[1]);
}
for (const m of readFileSync(join(ROOT, 'llms.txt'), 'utf8').matchAll(/\]\(([^)\s]+)\)/g)) checkLink(join(ROOT, 'llms.txt'), m[1]);

// 4
const SECRET = /sk-or-v1-[0-9a-f]{32,}|sk-(?:proj-)?[A-Za-z0-9_-]{32,}|gh[pousr]_[A-Za-z0-9]{30,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----/;
for (const f of files) {
  if (/\.(png|jpg|zip|ico)$/.test(f)) continue;
  const m = readFileSync(f, 'utf8').match(SECRET);
  if (m) fail(`${rel(f)}: key-shaped string (${m[0].slice(0, 12)}...)`);
}

// 5, 6
for (const f of files.filter(f => /\.(md|html|txt)$/.test(f))) {
  const r = rel(f);
  if (r.startsWith('brief/v1/')) continue;
  const s = readFileSync(f, 'utf8');
  if (s.includes('\u2014')) fail(`${r}: em-dash (house style)`);
  if (f.endsWith('.html') && !r.startsWith('extension/') && /<script/i.test(s)) fail(`${r}: a script on a static page`);
}

// 7
const version = readFileSync(join(ROOT, 'admin/build/version.txt'), 'utf8').trim();
const manifest = JSON.parse(readFileSync(join(ROOT, 'extension/manifest.json'), 'utf8'));
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
if (!/^v\d+\.\d+\.\d+$/.test(version)) fail(`version.txt: ${version} is not vX.Y.Z`);
if (manifest.version !== version.slice(1)) fail(`extension/manifest.json version ${manifest.version} != version.txt ${version}`);
if (pkg.version !== version.slice(1)) fail(`package.json version ${pkg.version} != version.txt ${version}`);
const build = readFileSync(join(ROOT, 'extension/build.js'), 'utf8');
if (/"test":\s*true/.test(build)) fail('extension/build.js is a TEST build stamp: run node admin/build/package.mjs');
if (!build.includes(`"version":"${version.slice(1)}"`)) fail('extension/build.js is stamped with another version: run node admin/build/package.mjs');

// 8
const PERMS = ['activeTab', 'alarms', 'offscreen', 'sidePanel', 'storage', 'tabCapture', 'unlimitedStorage'];
const CSP = "script-src 'self'; object-src 'self'; connect-src https://openrouter.ai";
if (JSON.stringify([...(manifest.permissions || [])].sort()) !== JSON.stringify(PERMS)) fail(`manifest permissions ${JSON.stringify(manifest.permissions)} are not exactly ${PERMS.join(', ')}`);
if (JSON.stringify(manifest.host_permissions) !== JSON.stringify(['https://openrouter.ai/*'])) fail('manifest host_permissions must be exactly ["https://openrouter.ai/*"]');
if (manifest.optional_host_permissions || manifest.content_scripts) fail('manifest asks for optional hosts or content scripts: not in brief v2.0, section 9');
if (manifest.content_security_policy?.extension_pages !== CSP) fail(`manifest CSP must be exactly: ${CSP}`);
if (manifest.manifest_version !== 3 || manifest.minimum_chrome_version !== '116') fail('manifest must be MV3 with minimum_chrome_version 116');

// 9
for (const f of files.filter(f => rel(f).startsWith('extension/') && /\.(js|html)$/.test(f))) {
  const r = rel(f), s = readFileSync(f, 'utf8');
  const code = s.replace(/^\s*\/\/.*$/gm, '');
  if (/\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon/.test(code) && r !== 'extension/lib/openrouter.js') fail(`${r}: network call outside lib/openrouter.js`);
  if (/\beval\s*\(|new\s+Function\s*\(|setTimeout\s*\(\s*['"`]/.test(code)) fail(`${r}: eval or a string compiled as code`);
  if (/\.innerHTML\s*=|\.outerHTML\s*=|insertAdjacentHTML|document\.write/.test(code)) fail(`${r}: HTML built from strings (render with textContent)`);
  if (/<script[^>]+src=["'](https?:)?\/\//i.test(s) || /import\s[^;]*from\s*['"]https?:/.test(code) || /import\(\s*['"]https?:/.test(code)) fail(`${r}: remote code`);
  if (/<script(?![^>]*\bsrc=)[^>]*>/i.test(s) && r.endsWith('.html')) fail(`${r}: inline script (the CSP forbids it)`);
}

// 11. one domain: the CNAME file; README and llms.txt name it, the manifest's homepage is it, no page links the old address
if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(SITE.slice(8))) fail(`CNAME: "${SITE.slice(8)}" is not a hostname`);
for (const f of ['README.md', 'llms.txt']) if (!readFileSync(join(ROOT, f), 'utf8').includes(SITE)) fail(`${f} does not name the site ${SITE}`);
if (manifest.homepage_url !== SITE + '/') fail(`manifest homepage_url should be ${SITE}/`);
for (const f of files.filter(f => /\.(md|html|txt)$/.test(f) && !rel(f).startsWith('brief/v1/') && !rel(f).startsWith('admin/'))) {
  if (/voicedebrief\.github\.io\/VoiceDebrief__Chrome_Extension__MeetScribe(?!\/? redirects)/.test(readFileSync(f, 'utf8').replace(/older address voicedebrief\.github\.io\/VoiceDebrief__Chrome_Extension__MeetScribe\/ redirects/g, ''))) fail(`${rel(f)}: links the old github.io address`);
}

// 12. the download is the source: releases/meetscribe-<version>.zip holds exactly extension/, byte for byte,
//     meetscribe-latest.zip is the same bytes, and each .sha256 matches
{
  const { readZip } = createRequire(import.meta.url)('./zip.cjs');
  const name = `meetscribe-${version}.zip`, zp = join(ROOT, 'releases', name);
  if (!existsSync(zp)) fail(`releases/${name} is missing: run node admin/build/package.mjs`);
  else {
    const zb = readFileSync(zp);
    const entries = new Map(readZip(zb).map(e => [e.name, e.data]));
    const ext = files.filter(f => rel(f).startsWith('extension/')).map(f => [rel(f).replace(/^extension\//, 'meetscribe/'), readFileSync(f)]);
    for (const [n, d] of ext) if (!entries.has(n)) fail(`releases/${name}: missing ${n}`); else if (!entries.get(n).equals(d)) fail(`releases/${name}: ${n} differs from extension/ (run package.mjs)`);
    for (const n of entries.keys()) if (!ext.some(([m]) => m === n)) fail(`releases/${name}: carries ${n}, which is not in extension/`);
    const sha = createHash('sha256').update(zb).digest('hex');
    for (const z of [name, 'meetscribe-latest.zip']) {
      const s = join(ROOT, 'releases', z + '.sha256');
      if (!existsSync(s) || !readFileSync(s, 'utf8').startsWith(sha)) fail(`releases/${z}.sha256 does not match the zip`);
    }
    if (!existsSync(join(ROOT, 'releases', 'meetscribe-latest.zip')) || !readFileSync(join(ROOT, 'releases', 'meetscribe-latest.zip')).equals(zb)) fail('releases/meetscribe-latest.zip is not the current release');
  }
}

// 10. colour lives in vd-tokens.css only (VoiceDebrief's rule, scripts/check_themes.py there): no hex or rgb()
//     literal in any other stylesheet or extension page
for (const f of files.filter(f => /\.(css|html)$/.test(f) && !f.endsWith('vd-tokens.css'))) {
  const r = rel(f);
  if (!r.endsWith('.css') && !r.startsWith('extension/')) continue;
  const m = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').match(/#[0-9a-fA-F]{3,8}\b(?![^<]*>)|rgba?\(/);
  if (m) fail(`${r}: colour literal ${m[0]} (colour comes from vd-tokens.css)`);
}

if (fails.length) { console.error(`validate: ${fails.length} failure(s)\n- ${fails.join('\n- ')}`); process.exit(1); }
console.log(`validate: ok (${files.length} files checked)`);
