// Settings in chrome.storage.local (brief v2.0, 8: settings and the key only; everything else is IndexedDB).
// The key is read here and handed to one fetch header; it is never logged, exported or shown back in full.
import { API_BASE } from './openrouter.js';

export const DEFAULTS = {
  apiKey: '',
  model: 'openai/whisper-large-v3',   // a starting point until the Phase 0 bake-off picks one (brief v2.0, 5.5)
  language: '',                        // '' = auto-detect
  zdr: true,
  micDeviceId: '',
  outputDeviceId: '',
  micDefault: false,                   // the microphone is opt-in per meeting
  retentionDays: 7,                    // audio of transcribed segments; -1 keeps it
  noVerbose: {},                       // models that rejected verbose_json: { [model]: true }
  consentAcknowledged: false,
  theme: 'signal',                     // one of VoiceDebrief's five schemes (lib/theme.js)
  debriefModel: 'google/gemini-3.5-flash',   // the model voicedebrief.ai writes its summary with
  debriefLocale: 'en-gb',              // the reader's language and tone, as voicedebrief.ai's locales
  apiBase: API_BASE,                   // honoured only in the TEST build (its CSP is the only one that allows another host)
};

// An offscreen document has chrome.runtime and nothing else, so there the service worker reads and writes
// settings on its behalf.
const direct = () => typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;

export async function getSettings() {
  if (!direct()) return { ...DEFAULTS, ...(await chrome.runtime.sendMessage({ target: 'sw', type: 'settings' })) };
  const s = await chrome.storage.local.get(DEFAULTS);
  return { ...DEFAULTS, ...s };
}
export async function setSettings(patch) {
  if (!direct()) return chrome.runtime.sendMessage({ target: 'sw', type: 'set-settings', patch });
  return chrome.storage.local.set(patch);
}
export const maskKey = (k) => (k ? `${k.slice(0, 9)}…${k.slice(-4)}` : '');
