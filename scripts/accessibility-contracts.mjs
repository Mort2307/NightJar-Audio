import fs from 'node:fs';
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

// Theme customisation is account-backed but never bypasses existing transcript controls.
const themeUi=fs.readFileSync('src/components/ThemePreferences.tsx','utf8');
const themePlatform=fs.readFileSync('src/platform/nightjar-theme.ts','utf8');
const settings=fs.readFileSync('src/components/NightjarSettings.tsx','utf8');
const main=fs.readFileSync('src/main.tsx','utf8');
assert.match(themeUi,/nightjarAccessibility\.save\(\{\.\.\.current,theme:next\}\)/,'theme saves alongside existing preferences');
assert.match(themeUi,/nightjarThemes\.map/,'theme swatches are selectable');
assert.match(themeUi,/simulationMode/,'theme preview preserves role-simulation separation');
assert.match(themePlatform,/nightjar\.appearance\.theme\.v1/,'theme is cached locally for instant bootstrap');
assert.match(main,/nightjarTheme\.initialise\(\)/,'theme applies before rendering the app');
assert.match(settings,/<ThemePreferences/,'Settings exposes theme choices');
assert.match(backend,/theme: \['nocturne','aubergine','midnight','ember','obsidian'\]/,'theme preference is whitelist validated by Firebase');

console.log('Nightjar accessibility contracts passed.');
