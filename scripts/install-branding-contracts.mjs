import assert from 'node:assert/strict';
import fs from 'node:fs';

const file = (name) => fs.readFileSync(name, 'utf8');
const backend = file('functions/src/index.ts');
const manifest = file('index.html');
const hosting = JSON.parse(file('firebase.json')).hosting;
const generator = file('src/platform/branding-icons.ts');
const panel = file('src/components/AdminInstallBranding.tsx');
const app = file('src/App.tsx');
const stylesheet = file('src/index.css');
const worker = file('public/service-worker.js');

assert.match(backend, /export const brandInstallManifest = onRequest/, 'public dynamic manifest is available');
const start = backend.indexOf('export const brandInstallManifest = onRequest');
const end = backend.indexOf('export const syncBrandIconVariants = onCall', start);
assert.ok(start > 0 && end > start, 'manifest route is independent from icon mutations');
const handler = backend.slice(start, end);
assert.match(handler, /logoStatus==='approved'/, 'only an approved Nightjar logo can populate launcher icons');
assert.match(handler, /icon192Path && branding\.icon512Path && branding\.maskable512Path/, 'manifest uses generated icons only when all dimensions exist');
assert.match(handler, /nightjar-home-192\.png/, 'fallback icons keep first-time installation functional');
assert.match(handler, /no-store,max-age=0,must-revalidate/, 'manifest prevents stale installs');
assert.match(backend, /export const syncBrandIconVariants = onCall/, 'existing admin-only icon upload stays protected');
assert.match(backend, /const admin=requireAdminIdentity\(request\)/, 'icon generation is admin-only');
assert.match(generator, /image\.src = '\/brand-logo\?nightjar-install='/, 'generator loads moderated same-origin Nightjar logo');
assert.match(generator, /syncBrandIcons\(/, 'generator uses validated backend callable');
assert.match(generator, /drawApprovedLogo\(logo, 512, true\)/, 'Android maskable icon included');
assert.match(panel, /data\?\.logoStatus !== 'approved'/, 'button is disabled for unapproved logos');
assert.match(panel, /window\.confirm\(/, 'admin explicitly confirms installation icon changes');
assert.match(panel, /simulationMode \|\| busy/, 'demo mode cannot write icons');
assert.match(app, /openAdminPanel\('branding'\)/, 'Owner console has an icon repair tile');
assert.match(app, /<AdminInstallBranding/, 'Owner icon generator mounts on a dedicated page');
assert.match(app, /tags\|branding\|live-preview/, 'icon page survives direct refresh');
assert.match(manifest, /rel="manifest" href="\/app-manifest\.webmanifest\?v=13"/, 'entrypoint uses the dynamic manifest');
assert.match(manifest, /href="\/recover\.html"/, 'original hard-refresh recovery entrypoint is preserved');
for(const [source, functionId] of [
  ['/app-manifest.webmanifest','brandInstallManifest'],
  ['/app-icons/nightjar-192.png','brandIcon192'],
  ['/app-icons/nightjar-512.png','brandIcon512'],
  ['/app-icons/nightjar-maskable-512.png','brandIconMaskable512'],
]) {
  assert.ok(hosting.rewrites.some(x => x.source === source && x.function?.functionId === functionId),
    'Hosting routes ' + source + ' to ' + functionId);
}
assert.equal(hosting.rewrites.at(-1)?.destination, '/index.html', 'nested SPA routes remain recoverable');
assert.match(stylesheet, /\.nj-install-branding-actions/, 'generator controls are responsive');
assert.match(worker, /self\.addEventListener\('install'/, 'existing service-worker installation remains');
console.log('Nightjar approved-logo PWA manifest, icon generation and Owner controls passed.');
