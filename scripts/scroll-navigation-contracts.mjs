import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync('src/App.tsx', 'utf8');
const main = fs.readFileSync('src/main.tsx', 'utf8');
const policy = fs.readFileSync('src/platform/scroll-navigation.ts', 'utf8');
const css = fs.readFileSync('src/index.css', 'utf8');

assert.doesNotMatch(policy, /document\.addEventListener\(['"]click['"]/, 'scroll policy must not capture unrelated UI clicks');
assert.doesNotMatch(main, /installNightjarScrollPolicy/, 'global scroll handlers must not be installed');
assert.match(app, /scrollNightjarToTop\(\);/, 'explicit route navigation retains scroll-to-top behavior');
assert.match(policy, /export const scrollNightjarToTop/, 'scroll-to-top remains available for real navigation');
assert.match(css, /\.app-shell\s*\{[^}]*overflow-x:\s*clip;[^}]*overflow-y:\s*visible;/s,
  'application shell must not trap vertical scrolling');
assert.match(app, /document\.body\.style\.overflow\s*=\s*'hidden';/, 'protected manuscript viewer may lock only its background');
assert.match(app, /document\.body\.style\.overflow\s*=\s*original;/, 'protected manuscript viewer must unlock on close');
console.log('Nightjar native-page scrolling contracts passed.');
