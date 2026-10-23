import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read=(path)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const entry=read('src/main.tsx');
const css=read('src/styles/human-first-operational-ui.css');
const legacy=read('src/styles/product-system.css');
const vision=read('src/styles/vision-access.css');
const mobile=read('src/components/MobileNavigation.tsx');

// The new layer is imported after the existing approved theme and Vision Access.
assert.ok(entry.includes("import './styles/human-first-operational-ui.css';"),
  'shared operational typography must load with the application');
assert.ok(entry.indexOf("import './styles/vision-access.css';") <
          entry.indexOf("import './styles/human-first-operational-ui.css';"),
  'existing Vision Access preferences must remain available');

// Evidence-based regression: historically these surfaces render 6.5–9px text.
assert.match(legacy,/\.nj-status-banner\s*\{[\s\S]*?font-size:8px;/,
  'status banner baseline changed; re-evaluate visual baseline before removing this contract');
assert.match(legacy,/\.nj-role-dashboard-metrics span\s*\{[\s\S]*?font-size:7px;/,
  'dashboard microtext baseline changed');
assert.match(legacy,/\.nj-mobile-nav button span\s*\{[\s\S]*?font-size:6\.5px;/,
  'mobile navigation microtext baseline changed');

// Scope is narrow and respects user-selected contrast and text-size profiles.
assert.match(css,/:root:not\(\[data-nightjar-vision\]\) \.nj-product-status \.nj-status-banner/,
  'visible status notices must be made readable');
assert.match(css,/\.nj-command-palette \.nj-command-copy strong/,
  'global search results need readable hierarchy');
assert.match(css,/\.nj-role-dashboard-metrics :is\(span,small\)/,
  'dashboard labels need readable sizes');
assert.match(css,/\.nj-next-action span:nth-child\(2\) small/,
  'quick actions need readable descriptions');
assert.match(css,/\.nj-notification-group-label/,
  'notification headings need readable labels');
assert.match(css,/\.nj-mobile-nav button > \.nj-mobile-nav-label/,
  'navigation labels need mobile sizes');
assert.match(css,/font-size:max\(0\.6875rem, 11px\)/,
  'mobile dock labels must not fall back to 6.5px');
assert.match(css,/font-size:max\(1rem, 16px\)/,
  'text-entry fields must avoid iPhone focus-zoom sizes');
assert.match(css,/input\[type="text"\]/,
  'text-entry selectors should be explicit rather than targeting every input');
assert.doesNotMatch(css,/input\[type="checkbox"\]|input\[type="radio"\]|input\[type="range"\]/,
  'decorative checkbox/radio/range sizing must not be changed');
assert.match(css,/@media \(prefers-reduced-motion: reduce\)/,
  'respect OS-level reduced-motion settings');
assert.match(css,/:focus-visible/,
  'keyboard focus must have an explicit visible state');
assert.match(vision,/:root\[data-nightjar-vision\].*focus-visible/,
  'vision-specific keyboard focus remains independently implemented');
assert.match(mobile,/aria-current=\{active \? 'page' : undefined\}/,
  'mobile navigation preserves accessible active-tab state');

// No new AI features, external APIs, payments or backend behaviour in this pass.
assert.doesNotMatch(css,/@import|https?:\/\/|data:image|font-face/,
  'style pass must not load new remote assets, fonts or CSS');

console.log('App-wide operational readability and accessibility contracts PASS.');
