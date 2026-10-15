/**
 * NightJar's approved brand identity: Midnight Gold.
 *
 * The six historical IDs remain valid for existing cloud preference records and
 * legacy validators, but the public brand appearance is now intentionally locked.
 * Disability/low-vision colour and motion preferences are a separate overlay,
 * applied by nightjar-vision and never blocked by this theme lock.
 */
export type NightjarTheme = 'nocturne' | 'aubergine' | 'midnight' | 'ember' | 'obsidian' | 'bronze';
export const NIGHTJAR_BRAND_THEME: NightjarTheme = 'bronze';

export const nightjarThemes: { id: NightjarTheme; label: string; description: string; swatches: string[] }[] = [
  { id:'bronze', label:'Midnight Gold', description:'NightJar signature obsidian black, cinematic champagne gold and soft ivory.', swatches:['#080808','#d9b574','#f5efe5'] },
];

const storageKey = 'nightjar.appearance.theme.v1';

const updateBrowserChrome = () => {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) meta.content = '#080808';
};

export const nightjarTheme = {
  current():NightjarTheme {
    return NIGHTJAR_BRAND_THEME;
  },
  // Accept legacy values for compatibility, but never enable old colours.
  apply(_theme:NightjarTheme) {
    document.documentElement.dataset.nightjarTheme = NIGHTJAR_BRAND_THEME;
    updateBrowserChrome();
    try { window.localStorage.setItem(storageKey,NIGHTJAR_BRAND_THEME); } catch { /* private browser */ }
    window.dispatchEvent(new CustomEvent('nightjar-theme-change',{detail:NIGHTJAR_BRAND_THEME}));
  },
  initialise() {
    document.documentElement.dataset.nightjarTheme = NIGHTJAR_BRAND_THEME;
    updateBrowserChrome();
    try { window.localStorage.setItem(storageKey,NIGHTJAR_BRAND_THEME); } catch { /* private browser */ }
  },
};
