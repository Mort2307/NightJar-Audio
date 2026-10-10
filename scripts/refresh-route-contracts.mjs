import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const vite = read('vite.config.ts');
const index = read('index.html');
const recover = read('public/recover.html');
const hosting = JSON.parse(read('firebase.json')).hosting;
const app = read('src/App.tsx');
const css = read('src/index.css');
const navigation = read('src/platform/scroll-navigation.ts');

assert.match(vite, /base:\s*['"]\/['"]/, 'SPA assets must be rooted to prevent blank nested-route refreshes');
assert.match(index, /src="\/src\/main\.tsx"/, 'bootstrap must be rooted');
assert.match(index, /href="\/recover\.html"/, 'initial HTML must have a repair link even without JS');
assert.match(recover, /serviceWorker\.getRegistrations\(\)/, 'repair tool removes old workers');
assert.match(recover, /caches\.keys\(\)/, 'repair tool clears app caches');
assert.doesNotMatch(recover, /(?:localStorage|indexedDB|sessionStorage)\.clear\(/, 'repair must not wipe account state');
assert.equal(hosting.rewrites.at(-1)?.destination, '/index.html', 'Firebase must rewrite nested routes to root index');
assert.match(app, /topLevel = value\.split\('\/'\)\[0\]/, 'nested pages must initialize to their parent app route');
assert.match(app, /profileRolesPage/, 'professional role deep links must load without a separate account');
assert.match(css, /\.app-shell\s*\{[^}]*overflow-x:\s*clip;[^}]*overflow-y:\s*visible;/s, 'app shell must not lock vertical scrolling');
assert.doesNotMatch(navigation, /document\.addEventListener\(['"]click['"]/, 'navigation must not globally hijack taps');
assert.match(navigation, /behavior:\s*'instant'/, 'route changes must not animate across an endless page');

console.log('Nightjar startup, nested-route refresh and recovery contracts passed.');
