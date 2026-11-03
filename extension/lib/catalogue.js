// The live model lists, fetched from OpenRouter (no key needed) and kept for a day in chrome.storage.local, so the
// options and meetings pages can offer every model without asking each time they open. Pages only.
import { listTranscriptionModels, listChatModels, API_BASE } from './openrouter.js';
import { BUILD } from '../build.js';

const DAY = 86400000;
async function cached(kind, fetcher, force) {
  const { modelCache = {} } = await chrome.storage.local.get('modelCache');
  const c = modelCache[kind];
  if (!force && c && Date.now() - c.at < DAY && c.list.length) return { list: c.list, at: c.at, cached: true };
  const { apiBase } = await chrome.storage.local.get('apiBase');
  const list = await fetcher({ apiBase: BUILD.test && apiBase ? apiBase : API_BASE });
  await chrome.storage.local.set({ modelCache: { ...modelCache, [kind]: { at: Date.now(), list } } });
  return { list, at: Date.now(), cached: false };
}
export const transcriptionModels = (force = false) => cached('stt', listTranscriptionModels, force);
export const chatModels = (force = false) => cached('chat', listChatModels, force);

/** Fills a <select> from groups(); keeps the current value even if the lists do not have it. */
export function fillSelect(sel, groupsList, current) {
  const opt = (value, text) => { const o = document.createElement('option'); o.value = value; o.textContent = text; return o; };
  sel.replaceChildren(...groupsList.filter(g => g.options.length).map(g => {
    const og = document.createElement('optgroup'); og.label = g.label;
    og.append(...g.options.map(o => opt(o.value, o.text + (o.missing ? ' (not listed by OpenRouter today)' : ''))));
    return og;
  }));
  if (current && ![...sel.options].some(o => o.value === current)) sel.prepend(opt(current, current + ' (your current choice)'));
  sel.value = current;
}
