#!/usr/bin/env node
// The test runner (as in Fix the Page). Builds the TEST extension, runs every tests/*.test.mjs with node's own
// runner, and fails if any file was not run or ran zero tests (the hub's fifth silent failure: a test file
// nothing runs). Exit 1 on any failure. TAP is asked for by name: Node 23+ defaults to the spec reporter even
// when piped, and its counts read differently (the first CI run counted 0 tests and failed, on Node 24).   node tests/run.mjs [filter]
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TESTS = path.join(ROOT, 'tests');
const only = process.argv.slice(2);
const files = fs.readdirSync(TESTS).filter((f) => f.endsWith('.test.mjs')).sort().filter((f) => !only.length || only.some((o) => f.includes(o)));
if (!files.length) { console.error('run: no test files found'); process.exit(1); }

const build = spawnSync(process.execPath, [path.join(ROOT, 'admin/build/package.mjs'), '--test'], { stdio: 'inherit' });
if (build.status !== 0) { console.error('run: could not build the test extension'); process.exit(1); }

let failed = 0; const ran = [];
for (const f of files) {
  console.log(`\n=== ${f}`);
  const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap', path.join(TESTS, f)], { encoding: 'utf8', timeout: 15 * 60 * 1000 });
  const out = (r.stdout || '') + (r.stderr || '');
  const n = Number((/^# tests (\d+)/m.exec(out) || [])[1] || 0);
  const nf = Number((/^# fail (\d+)/m.exec(out) || [0, 1])[1]);
  process.stdout.write(out.split('\n').filter((l) => /^(not ok|ok |# (tests|pass|fail)|    (not ok|ok ))/.test(l) || /Error|expected|actual/.test(l)).join('\n') + '\n');
  if (r.status !== 0 || nf > 0 || n === 0) { failed++; console.error(`run: ${f} FAILED (exit ${r.status}, ${n} tests, ${nf} failed)`); if (!n) process.stdout.write(out); }
  else console.log(`run: ${f} ok (${n} tests)`);
  ran.push({ f, n });
}
console.log(`\nrun: ${ran.length} file(s), ${ran.reduce((a, x) => a + x.n, 0)} tests, ${failed} file(s) failed`);
process.exit(failed ? 1 : 0);
