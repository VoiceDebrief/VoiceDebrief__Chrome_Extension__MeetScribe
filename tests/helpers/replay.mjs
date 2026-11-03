// A local OpenRouter that replays fixture files (tests/fixtures/openrouter/*.json). The test decides what
// the next responses are; the server records every request it got (model, format, the audio's hash and
// whether its bytes are a valid WAV), so a test can count what would have been billed. CORS is open because
// the test build reaches it from the extension's origin without a host permission.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'openrouter');
export const fixture = (name) => JSON.parse(fs.readFileSync(path.join(DIR, name + '.json'), 'utf8'));

export function startReplay() {
  const state = { requests: [], chats: [], chatScript: [], chatDelayMs: 0, script: [], fallback: 'transcription-verbose', key: 'key', delayMs: 0 };
  const server = http.createServer((req, res) => {
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-expose-headers': 'x-generation-id' };
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', async () => {
      const url = new URL(req.url, 'http://127.0.0.1');
      const send = (f) => { res.writeHead(f.status, { 'content-type': 'application/json', ...cors, ...f.headers }); res.end(JSON.stringify(f.body)); };
      if (url.pathname === '/api/v1/key') return send(fixture(state.key));
      if (url.pathname === '/api/v1/models') return send({ status: 200, headers: {}, body: { data: [{ id: 'openai/whisper-large-v3', name: 'Whisper Large V3', pricing: { prompt: '0.0000075', completion: '0' } }] } });
      let p = {}; try { p = JSON.parse(body); } catch {}
      if (url.pathname === '/api/v1/chat/completions') {
        state.chats.push({ model: p.model, zdr: p.provider?.zdr ?? null, system: p.messages?.[0]?.content || '', user: p.messages?.[1]?.content || '' });
        if (state.chatDelayMs) await new Promise(r => setTimeout(r, state.chatDelayMs));
        return send(fixture(state.chatScript.length ? state.chatScript.shift() : 'chat-debrief'));
      }
      if (url.pathname !== '/api/v1/audio/transcriptions') { res.writeHead(404, cors); return res.end(); }
      const audio = Buffer.from(p.input_audio?.data || '', 'base64');
      const validWav = audio.length > 44 && audio.toString('ascii', 0, 4) === 'RIFF' && audio.toString('ascii', 8, 12) === 'WAVE' && audio.readUInt32LE(40) === audio.length - 44;
      const name = state.script.length ? state.script.shift() : state.fallback;
      state.requests.push({ model: p.model, format: p.response_format, zdr: p.provider?.zdr ?? null, auth: (req.headers.authorization || '').slice(0, 12), bytes: audio.length, validWav, hash: crypto.createHash('sha256').update(audio).digest('hex'), answered: name });
      if (state.delayMs) await new Promise(r => setTimeout(r, state.delayMs));
      send(fixture(name));
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => {
    const { port } = server.address();
    resolve({ state, base: `http://127.0.0.1:${port}/api/v1`, close: () => new Promise(r => { server.closeAllConnections?.(); server.close(r); }) });
  }));
}
