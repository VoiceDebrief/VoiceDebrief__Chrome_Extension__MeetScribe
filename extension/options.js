// Options (brief v2.0, 10): key with a test, the microphone grant (the offscreen document cannot ask), devices,
// model, language, data policy, retention, delete all, and build provenance.
import * as db from './lib/db.js';
import { getSettings, setSettings, maskKey } from './lib/settings.js';
import { checkKey, listTranscriptionModels, API_BASE } from './lib/openrouter.js';
import { LOCALES } from './lib/prompts.js';
import { SCHEMES, applyTheme } from './lib/theme.js';
import { BUILD } from './build.js';

const $ = (id) => document.getElementById(id);
const say = (id, text, cls = '') => { $(id).textContent = text; $(id).className = 'small ' + cls; };
const apiBase = (s) => (BUILD.test && s.apiBase ? s.apiBase : API_BASE);
const opt = (value, text) => { const o = document.createElement('option'); o.value = value; o.textContent = text; return o; };

$('ver').textContent = 'v' + BUILD.version + (BUILD.test ? ' TEST' : '');
$('provenance').textContent = `MeetScribe ${BUILD.version}${BUILD.test ? ' (TEST BUILD)' : ''} · commit ${BUILD.commit ? BUILD.commit.slice(0, 12) : 'unstamped'} · built ${BUILD.built_at || 'unstamped'}`;

async function load() {
  const s = await getSettings();
  $('key').value = ''; $('key').placeholder = s.apiKey ? maskKey(s.apiKey) + ' (saved)' : 'sk-or-v1-…';
  $('language').value = s.language; $('zdr').checked = s.zdr; $('micDefault').checked = s.micDefault;
  $('retention').value = String(s.retentionDays);
  $('debriefLocale').replaceChildren(...Object.entries(LOCALES).map(([k, v]) => opt(k, v.label))); $('debriefLocale').value = s.debriefLocale;
  $('debriefModel').value = s.debriefModel;
  $('theme').replaceChildren(...Object.entries(SCHEMES).map(([k, v]) => opt(k, `${v.label} (${v.note})`))); $('theme').value = applyTheme(s.theme);
  const sel = $('model'); if (![...sel.options].some(o => o.value === s.model)) sel.append(opt(s.model, s.model)); sel.value = s.model;
  await devices(s);
  const t = await db.totals();
  $('totals').textContent = `${t.meetings} meeting(s), ${t.segments} segment(s), ${t.wavs} with audio kept, ${t.lines} transcript line(s).`;
}

async function devices(s) {
  let perm = 'prompt';
  try { perm = (await navigator.permissions.query({ name: 'microphone' })).state; } catch {}
  say('micState', perm === 'granted' ? 'Allowed: your voice can be transcribed.' : perm === 'denied' ? 'BLOCKED: your voice will not be transcribed. Allow the microphone for MeetScribe in Chrome\'s site settings.' : 'NOT ALLOWED YET: your voice will not be transcribed until you press Allow the microphone.', perm === 'granted' ? 'ok' : 'err');
  document.getElementById('grantMic').classList.toggle('primary', perm !== 'granted');
  document.getElementById('microphone').closest('section').classList.toggle('mic-bad', perm !== 'granted');
  const list = await navigator.mediaDevices.enumerateDevices();
  const mic = $('micDevice'), out = $('outDevice');
  mic.replaceChildren(opt('', 'System default'), ...list.filter(d => d.kind === 'audioinput' && d.deviceId !== 'default').map(d => opt(d.deviceId, d.label || 'Microphone')));
  out.replaceChildren(opt('', 'System default'), ...list.filter(d => d.kind === 'audiooutput' && d.deviceId !== 'default').map(d => opt(d.deviceId, d.label || 'Speaker')));
  mic.value = s.micDeviceId; out.value = s.outputDeviceId;
  if (mic.value !== s.micDeviceId) mic.value = ''; if (out.value !== s.outputDeviceId) out.value = '';
}

const saved = () => { $('saved').textContent = 'Saved ' + new Date().toLocaleTimeString(); };

// One action: Save stores the key and tests it, so the quick start ("paste, Save") ends with Start enabled
// (v0.3.1 review, finding 11). A held queue resumes, including a live capture's (finding 05).
$('saveKey').addEventListener('click', async () => {
  const k = $('key').value.trim();
  if (!k) return say('keyState', 'Paste a key first.', '');
  await setSettings({ apiKey: k });
  await db.resumeHeld();
  chrome.runtime.sendMessage({ target: 'sw', type: 'drain' }).catch(() => {});
  $('key').value = ''; await load();
  say('keyState', 'Saved. Testing it…');
  const r = await checkKey({ apiBase: apiBase(await getSettings()), key: k });
  if (r.ok) say('keyState', `Saved, and the key works${r.label ? ' (' + r.label + ')' : ''}. Usage $${r.usage ?? '?'}; limit ${r.limit === null ? 'none set: set one on openrouter.ai' : '$' + r.limit}. You can start transcribing.`, 'ok');
  else say('keyState', r.status === 401 || r.status === 403 ? 'Saved, but OpenRouter rejected this key: paste a working one.' : `Saved, but the key could not be checked (${r.status || 'network'}). It will be tried when you transcribe.`, '');
});
$('clearKey').addEventListener('click', async () => { await setSettings({ apiKey: '' }); await load(); say('keyState', 'Key removed.', ''); });
$('testKey').addEventListener('click', async () => {
  const s = await getSettings();
  const key = $('key').value.trim() || s.apiKey;
  if (!key) return say('keyState', 'No key to test.', '');
  say('keyState', 'Testing…');
  const r = await checkKey({ apiBase: apiBase(s), key });
  if (r.ok) say('keyState', `The key works${r.label ? ' (' + r.label + ')' : ''}. Usage $${r.usage ?? '?'}; limit ${r.limit === null ? 'none set: set one on openrouter.ai' : '$' + r.limit}.`, 'ok');
  else say('keyState', r.status === 401 || r.status === 403 ? 'OpenRouter rejected this key.' : `Could not check the key (${r.status || 'network'}).`, '');
});

$('grantMic').addEventListener('click', async () => {
  try { const m = await navigator.mediaDevices.getUserMedia({ audio: true }); m.getTracks().forEach(t => t.stop()); }
  catch (e) { say('micState', 'Not allowed: ' + e.message, ''); return; }
  await devices(await getSettings());
});
$('micDevice').addEventListener('change', async () => { await setSettings({ micDeviceId: $('micDevice').value }); saved(); });
$('outDevice').addEventListener('change', async () => { await setSettings({ outputDeviceId: $('outDevice').value }); saved(); });
$('micDefault').addEventListener('change', async () => { await setSettings({ micDefault: $('micDefault').checked }); saved(); });
$('testTone').addEventListener('click', async () => {
  const ctx = new AudioContext();
  if ($('outDevice').value && ctx.setSinkId) await ctx.setSinkId($('outDevice').value).catch(() => {});
  const o = ctx.createOscillator(), g = ctx.createGain(); g.gain.value = 0.1; o.frequency.value = 660;
  o.connect(g).connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.6); o.onended = () => ctx.close();
});

$('loadModels').addEventListener('click', async () => {
  const s = await getSettings();
  try {
    const models = await listTranscriptionModels({ apiBase: apiBase(s) });
    const per = (m) => (+m.completion > 0 ? 'token-priced' : +m.prompt < 0.01 ? '$' + (+m.prompt * 3600).toFixed(3) + '/h' : 'price unit not stated');
    $('model').replaceChildren(...models.map(m => opt(m.id, `${m.id} (${per(m)})`)));
    if (![...$('model').options].some(o => o.value === s.model)) $('model').append(opt(s.model, s.model));
    $('model').value = s.model;
    $('modelNote').textContent = `${models.length} transcription models listed by OpenRouter now. The cost shown in a meeting is what OpenRouter reports per request, not this list.`;
  } catch (e) { $('modelNote').textContent = 'Could not load the list: ' + e.message; }
});
$('model').addEventListener('change', async () => { await setSettings({ model: $('model').value }); saved(); });
$('language').addEventListener('change', async () => { await setSettings({ language: $('language').value.trim().toLowerCase() }); saved(); });
$('zdr').addEventListener('change', async () => { await setSettings({ zdr: $('zdr').checked }); saved(); });
$('debriefLocale').addEventListener('change', async () => { await setSettings({ debriefLocale: $('debriefLocale').value }); saved(); });
$('debriefModel').addEventListener('change', async () => { await setSettings({ debriefModel: $('debriefModel').value.trim() || 'google/gemini-3.5-flash' }); saved(); });
$('theme').addEventListener('change', async () => { await setSettings({ theme: applyTheme($('theme').value) }); saved(); });
$('retention').addEventListener('change', async () => { await setSettings({ retentionDays: Number($('retention').value) }); saved(); });

$('deleteAll').addEventListener('click', async () => {
  if (!confirm('Delete every meeting, transcript, debrief and stored audio in MeetScribe from this browser? A recording in progress stops. This cannot be undone, and it cannot recall audio already sent to OpenRouter. Your key and settings are kept: use Clear for the key.')) return;
  const r = await chrome.runtime.sendMessage({ target: 'sw', type: 'delete-all' });   // finding 01: stops a capture first
  const before = r?.before || { meetings: '?', segments: '?', lines: '?' };
  $('deleted').textContent = r?.ok ? `Deleted ${before.meetings} meeting(s), ${before.segments} segment(s), ${before.lines} line(s).` : 'Could not delete: ' + (r?.error || 'no answer');
  await load();
});

navigator.storage?.persist?.();
load();
