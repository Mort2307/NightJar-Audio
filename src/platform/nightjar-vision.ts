/** Optional, device-local low-vision display layer.
 * It never changes account entitlements, age access, role permissions or
 * the six Firebase-synced Nightjar appearance themes.
 * Device storage contains only a display choice, not medical information.
 */
export type VisionMode = 'off' | 'clarity' | 'paper' | 'focus' | 'soft';
export type VisionSize = 100 | 125 | 150 | 175 | 200;
export type VisionPreferences = { mode: VisionMode; textSize: VisionSize; quiet: boolean };

export const DEFAULT_VISION: VisionPreferences = { mode: 'off', textSize: 100, quiet: false };
export const VISION_MODES: { id: VisionMode; label: string; description: string; swatches: [string, string, string] }[] = [
  { id: 'off', label: 'Use my Nightjar theme', description: 'Keep your selected Nightjar appearance.', swatches: ['#0c0b0d','#a88aab','#eee7df'] },
  { id: 'clarity', label: 'Clarity', description: 'Black background, crisp white text and bold controls.', swatches: ['#050505','#ffffff','#f2f2f2'] },
  { id: 'paper', label: 'Paper', description: 'Warm light background with very dark text.', swatches: ['#f3eedf','#151515','#ffffff'] },
  { id: 'focus', label: 'Focus', description: 'Deep navy with distinct pale-blue actions.', swatches: ['#101820','#b8e9ff','#f2f6fa'] },
  { id: 'soft', label: 'Soft Glow', description: 'Matte charcoal with warm cream and amber.', swatches: ['#171717','#f5cf81','#f6e5be'] },
];
export const VISION_SIZES: VisionSize[] = [100, 125, 150, 175, 200];
const key = 'nightjar.vision.device.v1';
const validMode = (value: unknown): value is VisionMode => VISION_MODES.some(x => x.id === value);
const validSize = (value: unknown): value is VisionSize => VISION_SIZES.some(x => x === value);

const parse = (raw: unknown): VisionPreferences => {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_VISION };
  const data = raw as Record<string, unknown>;
  return {
    mode: validMode(data.mode) ? data.mode : DEFAULT_VISION.mode,
    textSize: validSize(data.textSize) ? data.textSize : DEFAULT_VISION.textSize,
    quiet: data.quiet === true,
  };
};

const apply = (prefs: VisionPreferences) => {
  const root = document.documentElement;
  if (prefs.mode === 'off') delete root.dataset.nightjarVision;
  else root.dataset.nightjarVision = prefs.mode;
  root.dataset.nightjarVisionScale = String(prefs.textSize);
  if (prefs.quiet) root.dataset.nightjarVisionQuiet = 'true';
  else delete root.dataset.nightjarVisionQuiet;
};

export const nightjarVision = {
  current(): VisionPreferences {
    try { return parse(JSON.parse(localStorage.getItem(key) ?? 'null')); }
    catch { return { ...DEFAULT_VISION }; }
  },
  apply(prefs: VisionPreferences): boolean {
    const safe = parse(prefs);
    apply(safe);
    let persisted = true;
    try { localStorage.setItem(key, JSON.stringify(safe)); } catch { persisted = false; }
    window.dispatchEvent(new CustomEvent('nightjar:vision-change', { detail: safe }));
    return persisted;
  },
  initialise() { apply(this.current()); },
};
