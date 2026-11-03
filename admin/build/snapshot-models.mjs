// Snapshot of OpenRouter's speech-to-text catalogue, written to data/stt-models.json.
// Run by hand (it needs the network); the build never fetches, so a page is always generated
// from a dated file, never from whatever the API said at build time.
//   node admin/build/snapshot-models.mjs
import { writeFileSync } from 'node:fs';

const BASE = 'https://openrouter.ai/api/v1';
const get  = async (url) => { const r = await fetch(url); if (!r.ok) throw new Error(`${r.status} ${url}`); return r.json(); };

const list   = (await get(`${BASE}/models?output_modalities=transcription`)).data;
const models = [];
for (const m of list) {
  let endpoints = null;                                    // missing stays null, never []
  try {
    const e = (await get(`${BASE}/models/${m.id}/endpoints`)).data.endpoints;
    endpoints = e.map(x => ({ provider: x.provider_name, tag: x.tag, prompt: x.pricing?.prompt ?? null, completion: x.pricing?.completion ?? null }));
  } catch { /* recorded as null */ }
  models.push({
    id: m.id, name: m.name, created: new Date(m.created * 1000).toISOString().slice(0, 10),
    prompt: m.pricing?.prompt ?? null, completion: m.pricing?.completion ?? null,
    endpoints, description: m.description ?? null,
  });
}
const out = { source: `${BASE}/models?output_modalities=transcription`, fetched_at: new Date().toISOString(), count: models.length, models };
writeFileSync(new URL('../../data/stt-models.json', import.meta.url), JSON.stringify(out, null, 2) + '\n');
console.log(`${models.length} models written to data/stt-models.json`);
