import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const read = (path) => fs.readFileSync(path, 'utf8');

const vite = read('vite.config.ts');
const index = read('index.html');
const recovery = read('public/recover.html');
const sw = read('public/service-worker.js');
const css = read('src/index.css');
const hosting = JSON.parse(read('firebase.json'));
assert.match(vite, /sourceCommit/, 'build manifest must record an exact source revision');
assert.match(read('src/platform/pwa.ts'), /latestSourceCommit/, 'app compares deployed source revision');

assert.match(vite, /base:\s*['"]\/['"]/, 'Vite bundle must be rooted at / for deep-linked pages');
assert.match(index, /src="\/src\/main\.tsx"/, 'rooted bootstrap prevents nested route imports failing');
assert.match(index, /href="\/recover\.html"/, 'static recovery link remains when React cannot load');
assert.match(recovery, /serviceWorker\.getRegistrations\(\)/, 'standalone repair unregisters stale workers');
assert.match(recovery, /caches\.keys\(\)/, 'standalone repair clears stale app caches');
assert.match(recovery, /\/discover\?nightjar-refresh=/, 'standalone repair restarts at a known-good root path');
assert.match(sw, /const CACHE = 'nightjar-shell-v12'/, 'worker cache version rotates for fix');
assert.match(sw, /url\.pathname === '\/recover\.html'/, 'standalone repair bypasses the SPA cache');
assert.ok(hosting.hosting.rewrites.some((rule) => rule.source === '**' && rule.destination === '/index.html'), 'deep links have an SPA rewrite');
assert.match(css, /html\s*\{\s*scroll-behavior:\s*auto;/, 'routine navigation does not cause long smooth-scroll animation');

if (fs.existsSync('dist/version.json')) {
  const version = JSON.parse(read('dist/version.json'));
  const currentSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  assert.equal(version.sourceCommit, currentSha, 'production build must identify the Git source being shipped');
}
if (fs.existsSync('dist/index.html')) {
  const rendered = read('dist/index.html');
  assert.match(rendered, /src="\/assets\/[^"]+\.js"/, 'production HTML loads JS from absolute site root');
  for (const route of ['/admin/approvals', '/admin/people/creator', '/profile/roles', '/discover']) {
    const script = rendered.match(/src="(\/assets\/[^"]+\.js)"/)?.[1];
    assert.ok(script && new URL(script, 'https://nightjar.example' + route).pathname.startsWith('/assets/'), 'nested route bundle: ' + route);
  }
}
console.log('Nightjar refresh recovery, nested routes, worker cache and installation contracts passed.');
