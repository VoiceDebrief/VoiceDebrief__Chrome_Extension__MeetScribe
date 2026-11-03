// Builds the site: every page's index.md is the source, and index.html beside it is generated from it.
// No dependencies, no network. Also regenerates the generated regions inside markdown (the model table).
// The page list below is the single list of pages: validate.mjs fails on an index.md that is not in it.
//   node admin/build/build.mjs           write
//   node admin/build/build.mjs --check   exit 1 if any generated file is out of date (used by validate.mjs)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT    = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CHECK   = process.argv.includes('--check');
const VERSION = readFileSync(join(ROOT, 'admin/build/version.txt'), 'utf8').trim();
const REPO    = 'https://github.com/VoiceDebrief/VoiceDebrief__Chrome_Extension__MeetScribe';

const PAGES = [
  { path: '',          nav: 'Home',      title: 'MeetScribe: transcribe the Meet call you are in, on your own key',
    description: 'A Chrome extension that transcribes Google Meet calls through OpenRouter, without a bot, Google recording or a server: the review of the first brief, brief v2.0 and the plan.' },
  { path: 'install',   nav: 'Install',   title: 'Install and use MeetScribe',
    description: 'Load MeetScribe unpacked from a clone, set the OpenRouter key and microphone, and transcribe a Meet call; with screenshots and how to answer the spike questions.' },
  { path: 'built',     nav: 'Built',     title: 'What is built in MeetScribe',
    description: 'The reality file: what exists in the extension, how it is tested, what is not built yet, and what building it corrected in the brief.' },
  { path: 'review',    nav: 'Review',    title: 'Review of the MeetScribe brief v1.0',
    description: 'The ChatGPT-drafted MeetScribe brief checked claim by claim: 14 facts that hold, 6 choices that fail silently, 11 gaps, 6 changes, with evidence.' },
  { path: 'brief',     nav: 'Brief v2.0', title: 'MeetScribe brief v2.0',
    description: 'The specification for MeetScribe: capture, segmentation at pauses, the OpenRouter queue, transcript, notes, storage, permissions, privacy and acceptance criteria.' },
  { path: 'plan',      nav: 'Plan',      title: 'The MeetScribe plan: a spike, then three releases',
    description: 'Phase 0 spike with eight go/no-go questions and a model bake-off, then the recorder, the notes and the release.' },
  { path: 'models',    nav: 'Models',    title: 'Transcription models on OpenRouter, with price per hour',
    description: 'Every speech-to-text model OpenRouter lists, with price per hour of audio, generated from a dated snapshot.' },
  { path: 'sources',   nav: 'Sources',   title: 'MeetScribe sources',
    description: 'Every external fact the MeetScribe review and brief rest on, and where it was read.' },
  { path: 'versions',  nav: null,        title: 'MeetScribe release history',
    description: 'Every MeetScribe release, site and extension, with what changed.' },
  { path: 'brief/v1',  nav: null,        title: 'MeetScribe brief v1.0 (original, superseded)',
    description: 'The original MeetScribe brief, drafted by ChatGPT, kept unedited. Superseded by brief v2.0.' },
];

// ---------------------------------------------------------------- markdown (the subset these pages use)
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const slug = (s) => s.toLowerCase().replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const CHIPS = { keep: 'holds', verified: 'verified', wrong: 'wrong', critical: 'critical', missing: 'missing', change: 'change',
                spec: 'specified', spike: 'spike', proposed: 'proposed', unverified: 'unverified', built: 'built' };

function linkHref(href) {
  if (/^[a-z]+:/i.test(href) || href.startsWith('#')) return href;
  return href.replace(/(^|\/)index\.md(#.*)?$/, (m, a, h) => `${a}index.html${h || ''}`);
}

function inline(src) {
  const codes = [];
  let s = src.replace(/`([^`]+)`/g, (m, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
  s = esc(s);
  s = s.replace(/\[\[([a-z]+)\]\]/g, (m, k) => CHIPS[k] ? `<span class="chip chip-${k}">${CHIPS[k]}</span>` : m);
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m, alt, src) => `<img class="shot" src="${src}" alt="${alt}" loading="lazy">`);
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, t, h) => `<a href="${linkHref(h.replace(/&amp;/g, '&')).replace(/&/g, '&amp;')}">${t}</a>`);
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^\w*])\*([^*\s][^*]*?)\*(?=[^\w*]|$)/g, '$1<em>$2</em>');
  s = s.replace(/&lt;kbd&gt;(.*?)&lt;\/kbd&gt;/g, '<kbd>$1</kbd>');
  s = s.replace(/ {2}$/, '<br>');
  return s.replace(/\u0000(\d+)\u0000/g, (m, i) => `<code>${esc(codes[+i])}</code>`);
}

function render(md) {
  const lines = md.replace(/\r/g, '').split('\n');
  const out = [];
  const ids = new Set();
  let i = 0;
  const isBlockStart = (l) => /^(#{1,6} |```|> ?|\s*([-*]|\d+\.) |\|)/.test(l) || /^(---|\*\*\*)\s*$/.test(l) || /^<!--/.test(l);
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) { i++; continue; }
    if (/^<!--.*-->\s*$/.test(l)) { i++; continue; }                                  // markers
    let m;
    if ((m = l.match(/^(#{1,6}) (.*)$/))) {
      const lvl = m[1].length, html = inline(m[2]);
      let id = slug(html) || 'section'; while (ids.has(id)) id += '-x'; ids.add(id);
      out.push(`<h${lvl} id="${id}">${html}</h${lvl}>`); i++; continue;
    }
    if (l.startsWith('```')) {
      const lang = l.slice(3).trim(); const buf = []; i++;
      while (i < lines.length && !lines[i].startsWith('```')) buf.push(lines[i++]);
      i++;
      out.push(`<pre${lang ? ` data-lang="${esc(lang)}"` : ''}><code>${esc(buf.join('\n'))}</code></pre>`); continue;
    }
    if (/^(---|\*\*\*)\s*$/.test(l)) { out.push('<hr>'); i++; continue; }
    if (/^> ?/.test(l)) {
      const buf = []; while (i < lines.length && /^> ?/.test(lines[i])) buf.push(lines[i++].replace(/^> ?/, ''));
      out.push(`<blockquote>${render(buf.join('\n'))}</blockquote>`); continue;
    }
    if (l.startsWith('|')) {
      const rows = []; while (i < lines.length && lines[i].startsWith('|')) rows.push(lines[i++]);
      const cells = (r) => r.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map(c => c.trim().replace(/\\\|/g, '|'));
      const head = cells(rows[0]); const body = rows.slice(2).map(cells);
      const th = head.map(c => `<th>${inline(c)}</th>`).join('');
      const tb = body.map(r => `<tr>${r.map(c => `<td>${inline(c)}</td>`).join('')}</tr>`).join('\n');
      out.push(`<div class="tablewrap"><table>\n<thead><tr>${th}</tr></thead>\n<tbody>\n${tb}\n</tbody></table></div>`); continue;
    }
    if ((m = l.match(/^(\s*)([-*]|\d+\.) /))) {
      const ordered = /\d/.test(m[2]); const indent = m[1].length; const items = [];
      while (i < lines.length) {
        const x = lines[i];
        const mm = x.match(/^(\s*)([-*]|\d+\.) (.*)$/);
        if (mm && mm[1].length === indent) { items.push([mm[3]]); i++; continue; }
        if (mm && mm[1].length > indent) { items[items.length - 1].push(x.slice(indent + 2)); i++; continue; }
        if (x.trim() && /^\s{2,}/.test(x) && !mm) { items[items.length - 1].push(x.trim()); i++; continue; }
        break;
      }
      const li = items.map(([first, ...rest]) => {
        const sub = rest.filter(r => /^\s*([-*]|\d+\.) /.test(r));
        const cont = rest.filter(r => !/^\s*([-*]|\d+\.) /.test(r));
        return `<li>${inline([first, ...cont].join(' '))}${sub.length ? render(sub.join('\n')) : ''}</li>`;
      }).join('\n');
      out.push(ordered ? `<ol>\n${li}\n</ol>` : `<ul>\n${li}\n</ul>`); continue;
    }
    const buf = [];
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) buf.push(lines[i++]);
    out.push(`<p>${buf.map(inline).join('\n')}</p>`);
  }
  return out.join('\n');
}

// ---------------------------------------------------------------- generated regions inside markdown
function modelTable() {
  const d = JSON.parse(readFileSync(join(ROOT, 'data/stt-models.json'), 'utf8'));
  const money = (x) => x < 0.1 ? `$${x.toFixed(3)}` : `$${x.toFixed(2)}`;
  const rows = d.models.map(m => {
    const p = m.prompt === null ? null : +m.prompt, c = m.completion === null ? null : +m.completion;
    let hour, kind;
    if (p === null) { hour = 'not listed'; kind = 'unknown'; }
    else if (c && c > 0) { hour = 'token-priced'; kind = 'tokens'; }
    else if (p >= 0.01) { hour = 'unit unclear'; kind = 'unclear'; }
    else {
      const per = (m.endpoints || []).map(e => +e.prompt).filter(x => x > 0 && x < 0.01);
      const lo = Math.min(p, ...per) * 3600, hi = Math.max(p, ...per) * 3600;
      hour = Math.abs(hi - lo) < 1e-9 ? money(lo) : `${money(lo)} to ${money(hi)}`; kind = 'seconds';
    }
    const prov = m.endpoints === null ? 'not fetched' : [...new Set(m.endpoints.map(e => e.provider))].join(', ');
    return { m, hour, kind, prov, sort: kind === 'seconds' ? p : 9 + (kind === 'tokens' ? 0 : 1) };
  }).sort((a, b) => a.sort - b.sort || a.m.id.localeCompare(b.m.id));
  const t = ['| Model | Per hour | Listed price | Providers | Listed since |', '|---|---|---|---|---|'];
  for (const r of rows) {
    const listed = r.kind === 'tokens' ? `in ${r.m.prompt}, out ${r.m.completion} per token` : r.kind === 'seconds' ? `${r.m.prompt} per second` : `${r.m.prompt}, unit not stated`;
    t.push(`| \`${r.m.id}\` | ${r.hour} | ${listed} | ${r.prov} | ${r.m.created} |`);
  }
  return `Snapshot taken ${d.fetched_at.replace('T', ' ').slice(0, 16)} UTC: ${d.count} models.\n\n` + t.join('\n');
}
const GENERATED = { 'stt-models': modelTable };

function fillRegions(md) {
  return md.replace(/<!-- generated:([a-z-]+) -->[\s\S]*?<!-- \/generated:\1 -->/g,
    (m, k) => `<!-- generated:${k} -->\n${GENERATED[k]()}\n<!-- /generated:${k} -->`);
}

// ---------------------------------------------------------------- page frame
function frame(page, body) {
  const depth = page.path ? page.path.split('/').length : 0;
  const up = depth ? '../'.repeat(depth) : '';
  const nav = PAGES.filter(p => p.nav && p.path).map(p =>
    `  <a class="nl${p.path === page.path || (page.path.startsWith(p.path + '/') && p.path) ? ' here' : ''}" href="${up}${p.path}/index.html">${p.nav}</a>`).join('\n');
  const crumb = page.path ? `<div class="crumb"><a href="${up}index.html">MeetScribe</a> / ${esc(page.path.replace(/\//g, ' / '))}</div>\n` : '';
  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(page.title)}</title>
<meta name="description" content="${esc(page.description)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="MeetScribe">
<meta property="og:title" content="${esc(page.title)}">
<meta property="og:description" content="${esc(page.description)}">
<link rel="alternate" type="text/markdown" href="index.md" title="This page as markdown">
<link rel="icon" href="${up}assets/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="${up}assets/site.css">
</head>
<body>

<nav class="site"><div class="row">
  <a class="brand" href="${up}index.html">meetscribe<span>.chrome-extension</span></a>
  <span class="stage-pill">first MVP · not yet tried on a real call</span>
  <a class="ver" href="${up}versions/index.html" title="Release history">${esc(VERSION)}</a>
${nav}
  <a class="gh" href="${REPO}">&#9733; GitHub</a>
</div></nav>

<main class="doc">
${crumb}${body}
</main>

<footer class="site"><div class="cols">
  <div>
    <div class="brandline">meetscribe<span>.chrome-extension</span></div>
    <p>A Chrome extension that transcribes the Google Meet call you are in, on your own OpenRouter key: no bot, no Google recording, no server of ours. First MVP, loaded unpacked. Content CC BY 4.0; code Apache 2.0.</p>
    <p class="partnote">This site is static, generated from the markdown beside each page, and has no analytics.</p>
    <p class="verline">site ${esc(VERSION)} · <a href="index.md">this page as markdown</a> · <a href="${up}llms.txt">llms.txt</a></p>
  </div>
  <div>
    <h4>MeetScribe</h4>
    <a href="${up}install/index.html">Install and use</a>
    <a href="${up}built/index.html">What is built</a>
    <a href="${up}review/index.html">Review of v1.0</a>
    <a href="${up}brief/index.html">Brief v2.0</a>
    <a href="${up}plan/index.html">Plan</a>
    <a href="${up}models/index.html">Models</a>
  </div>
  <div>
    <h4>Record</h4>
    <a href="${up}sources/index.html">Sources</a>
    <a href="${up}versions/index.html">Release history</a>
    <a href="${up}brief/v1/index.html">Brief v1.0, as received</a>
    <a href="${up}data/stt-models.json">stt-models.json</a>
    <a href="${REPO}">GitHub</a>
  </div>
  <div>
    <h4>Family</h4>
    <a href="https://voicedebrief.ai">voicedebrief.ai</a>
    <a href="https://chrome-extensions.sgit.ai">chrome-extensions.sgit.ai</a>
    <a href="https://fix-the-page.chrome-extension.sgit.ai">Fix the Page</a>
    <a href="https://sgit.ai">sgit.ai</a>
  </div>
</div></footer>
</body>
</html>
`;
}

// ---------------------------------------------------------------- run
let stale = [];
const put = (rel, content) => {
  const abs = join(ROOT, rel);
  const old = existsSync(abs) ? readFileSync(abs, 'utf8') : null;
  if (old === content) return;
  if (CHECK) stale.push(rel); else writeFileSync(abs, content);
};

for (const page of PAGES) {
  const mdRel = join(page.path, 'index.md');
  const md = fillRegions(readFileSync(join(ROOT, mdRel), 'utf8'));
  put(mdRel, md);
  put(join(page.path, 'index.html'), frame(page, render(md)));
}

if (CHECK) {
  if (stale.length) { console.error(`out of date, run node admin/build/build.mjs:\n  ${stale.join('\n  ')}`); process.exit(1); }
  console.log(`build check: ${PAGES.length} pages up to date`);
} else console.log(`built ${PAGES.length} pages, ${VERSION}`);
