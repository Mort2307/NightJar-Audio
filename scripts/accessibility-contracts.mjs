import fs from 'node:fs';
import assert from 'node:assert/strict';
import path from 'node:path';

const root = process.cwd();
const files = [];
const walk = (dir) => {
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes:true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(rel);
    else if (/\.(tsx|html)$/.test(entry.name)) files.push(rel);
  }
};
walk('src');
files.push('index.html');

const failures = [];
for (const file of files) {
  const source = fs.readFileSync(path.join(root,file),'utf8');
  for (const match of source.matchAll(/<img\b[^>]*>/g)) {
    if (!/\balt\s*=/.test(match[0])) failures.push(file + ': image missing alt attribute -> ' + match[0].slice(0,120));
  }
  for (const match of source.matchAll(/<[^>]+\brole=["']dialog["'][^>]*>/g)) {
    if (!/\baria-modal\s*=/.test(match[0])) failures.push(file + ': dialog missing aria-modal -> ' + match[0].slice(0,140));
  }
}

const css = fs.readFileSync(path.join(root,'src/styles/product-system.css'),'utf8');
if (!css.includes('prefers-reduced-motion')) failures.push('product-system.css: reduced-motion media query missing');
if (!css.includes('focus-visible')) failures.push('product-system.css: focus-visible styling missing');
if (!css.includes('.sr-only')) failures.push('product-system.css: screen-reader-only utility missing');

if (failures.length) {
  console.error('ACCESSIBILITY CONTRACT FAILURES');
  for (const failure of failures) console.error('-', failure);
  process.exit(1);
}

// Midnight Gold is the sole public brand appearance. Historical theme IDs remain
// recognised by the backend, while the independent Vision Access controls provide
// accessible user-selected colours, scaling and motion preferences.
const backend=fs.readFileSync('functions/src/index.ts','utf8');
const themeUi=fs.readFileSync('src/components/ThemePreferences.tsx','utf8');
const themePlatform=fs.readFileSync('src/platform/nightjar-theme.ts','utf8');
const settings=fs.readFileSync('src/components/NightjarSettings.tsx','utf8');
const main=fs.readFileSync('src/main.tsx','utf8');
const brand=fs.readFileSync('src/styles/midnight-gold.css','utf8');
const vision=fs.readFileSync('src/styles/vision-access.css','utf8');
const publicProfile=fs.readFileSync('src/components/PublicProfile.tsx','utf8');

assert.match(themePlatform,/NIGHTJAR_BRAND_THEME: NightjarTheme = 'bronze'/,'Midnight Gold is the canonical brand theme');
assert.match(themePlatform,/nightjar\.appearance\.theme\.v1/,'local appearance cache remains compatible');
assert.match(themePlatform,/return NIGHTJAR_BRAND_THEME/,'old saved colours cannot override the locked brand');
assert.match(themePlatform,/document\.documentElement\.dataset\.nightjarTheme = NIGHTJAR_BRAND_THEME/,'applied brand never changes per account');
assert.match(themeUi,/Midnight Gold/,'appearance information names the new brand');
assert.match(themeUi,/Vision Access/,'accessible colour overrides are discoverable');
assert.doesNotMatch(themeUi,/nightjarThemes\.map|nightjarAccessibility\.save/,'user cannot re-enable archived colour schemes');
assert.match(themeUi,/simulationMode/,'simulation remains separate from live account settings');
assert.match(settings,/<ThemePreferences/,'Settings shows brand identity');
assert.match(settings,/<VisionAccessControls/,'low-vision controls stay available');
assert.match(main,/nightjarTheme\.initialise\(\)/,'brand applies before React');
assert.match(main,/import '\.\/styles\/midnight-gold\.css';/,'all screens load the central brand stylesheet');
assert.ok(main.indexOf('midnight-gold.css') < main.indexOf('vision-access.css'),'Vision Access styles load after brand rules');
assert.match(brand,/--nj-gold-gradient/,'consistent champagne-gold primary action');
assert.match(brand,/--bg:\s*#080808/,'background remains black rather than brown');
assert.match(brand,/--nj-text-secondary:\s*#c4baab/,'secondary text remains readable');
assert.match(brand,/:root\[data-nightjar-theme="bronze"\]:not\(\[data-nightjar-vision\]\)/,'brand rules defer to Vision Access');
assert.match(brand,/\.nj-up-root/,'audio player is included in design system');
assert.match(brand,/\.nj-mobile-nav/,'mobile navigation is included in design system');
assert.match(brand,/\.creator-profile-modal\.premium-public-profile/,'public creator profiles are included');
assert.match(publicProfile,/isOfficialCreator && <details className="nj-official-creator-badge"/,'gold creator crescent is conditional on an approved professional role');
assert.match(vision,/data-nightjar-vision="clarity"/,'high-contrast accessible override retained');
assert.match(vision,/data-nightjar-vision="paper"/,'paper accessible override retained');
assert.match(vision,/data-nightjar-vision-quiet/,'reduced-motion preference retained');
assert.match(backend,/theme: \['nocturne','aubergine','midnight','ember','obsidian','bronze'\]/,'previous cloud preference values remain valid without a backend migration');

console.log('Nightjar accessibility contracts passed.');
