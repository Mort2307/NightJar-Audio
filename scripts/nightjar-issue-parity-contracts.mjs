// Source-level acceptance for the Nightjar 16-issue reconciliation / visual parity.
// No Firebase writes, paid provider calls, personal records or claims of handset QA.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = name => readFileSync(name,'utf8');
const app = read('src/App.tsx');
const css = read('src/styles/nightjar-operations-parity.css');
const ledger = read('docs/NIGHTJAR_16_ISSUE_PARITY_2026-11-01.md');
const packageJson=JSON.parse(read('package.json'));
const expected=[137,144,147,219,242,252,274,275,286,290,292,295,301,306,310,318];
const found=[...ledger.matchAll(/^\| \[#(\d+)\]/gm)].map(match=>Number(match[1])).sort((a,b)=>a-b);
assert.deepEqual(found,expected,'track all and only the sixteen open Nightjar issues once');
for(const fragment of [
  'NOT RUN this pass', 'Owner', 'device acceptance', 'backend', 'Hosting',
  'Midnight Gold', 'Credited', 'Didit', 'NOT RUN', 'private'
]) assert.ok(ledger.includes(fragment),'issue ledger must be explicit: '+fragment);
assert.match(app,/import '\.\/styles\/nightjar-operations-parity\.css'/,'the parity layer must be loaded');
assert.match(css,/:root:not\(\[data-nightjar-vision\]\)/,'selected accessibility settings must not be overridden');
assert.match(css,/--nj-ops-touch: 44px/,'minimum primary operational tap height is 44px');
assert.match(css,/.nj-role-dashboard/,'cross-role dashboards covered');
assert.match(css,/.people-row-managed/,'owner people directory covered');
assert.match(css,/.nj-didit-case-fields/,'Didit diagnostics covered');
assert.match(css,/.featured-carousel-autoplay/,'home interactive captions covered');
assert.match(css,/.nj-mobile-nav/,'mobile navigation readability covered');
assert.match(css,/@media \(prefers-reduced-motion: reduce\)/,'motion preferences respected');
assert.match(css,/@media \(max-width:360px\)/,'narrow device handling included');
assert.doesNotMatch(css,/(?:!important|display:none|object-fit|filter:blur|position:fixed)/,'parity layer must not hide controls or reframe art');
assert.match(packageJson.scripts['validate:contracts'],/node scripts\/nightjar-issue-parity-contracts\.mjs/,'the parity pass must be enforced by standard CI');
console.log('Nightjar 16-issue parity and human-first UX source contracts PASS.');
