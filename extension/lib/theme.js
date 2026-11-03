// VoiceDebrief's five colour schemes (vd-tokens.css), chosen on the options page. The stored value is an
// allowlist key and nothing else (VoiceDebrief's issue-041 rule): an unknown value falls back to Signal.
export const SCHEMES = {
  signal:    { label: 'Signal',    note: 'Light, green' },
  night:     { label: 'Night',     note: 'Dark, green' },
  paper:     { label: 'Paper',     note: 'Warm off-white, terracotta' },
  blueprint: { label: 'Blueprint', note: 'White, electric blue' },
  ember:     { label: 'Ember',     note: 'Dark, amber' },
};
export function applyTheme(key) {
  const k = Object.prototype.hasOwnProperty.call(SCHEMES, key) ? key : 'signal';
  document.documentElement.setAttribute('data-vd-theme', k);
  return k;
}
