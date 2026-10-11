export type NightjarTheme = 'nocturne' | 'aubergine' | 'midnight' | 'ember' | 'obsidian' | 'bronze';

export const nightjarThemes: { id: NightjarTheme; label: string; description: string; swatches: string[] }[] = [
  { id:'nocturne',label:'Nocturne',description:'Original Nightjar charcoal and soft plum.',swatches:['#0c0b0d','#a88aab','#eee7df'] },
  { id:'aubergine',label:'Velvet Plum',description:'Deep violet and satin lavender.',swatches:['#130e18','#b19acb','#f3e9f5'] },
  { id:'midnight',label:'Midnight Blue',description:'Ink navy and silver-blue highlights.',swatches:['#0a101c','#89a9d1','#eaf0fa'] },
  { id:'ember',label:'Ember',description:'Burgundy, copper and candlelit warmth.',swatches:['#170d12','#c69680','#f7e8de'] },
  { id:'obsidian',label:'Obsidian',description:'Pure charcoal with restrained metallic accents.',swatches:['#080a0c','#bbc5ce','#edf1f3'] },
  { id:'bronze',label:'Bronze Noir',description:'Jet black, burnished bronze and warm ivory — inspired by the Nightjar N.',swatches:['#080809','#b88a52','#f3e7d8'] },
];
const storageKey = 'nightjar.appearance.theme.v1';
const isTheme = (value:unknown):value is NightjarTheme => nightjarThemes.some((item)=>item.id===value);

const updateBrowserChrome = (theme: NightjarTheme) => {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) meta.content = theme === 'bronze' ? '#080809' : '#0c0b0d';
};

export const nightjarTheme = {
  current():NightjarTheme {
    try { const stored=window.localStorage.getItem(storageKey);return isTheme(stored)?stored:'nocturne'; }
    catch { return 'nocturne'; }
  },
  apply(theme:NightjarTheme) {
    document.documentElement.dataset.nightjarTheme = theme;
    updateBrowserChrome(theme);
    try { window.localStorage.setItem(storageKey,theme); } catch { /* private browser */ }
    window.dispatchEvent(new CustomEvent('nightjar-theme-change',{detail:theme}));
  },
  initialise() {
    const theme = this.current();
    document.documentElement.dataset.nightjarTheme = theme;
    updateBrowserChrome(theme);
  },
};
