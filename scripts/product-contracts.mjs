import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const fail = (message) => { console.error('PRODUCT CONTRACT FAIL:', message); process.exitCode = 1; };
const pass = (message) => console.log('✓', message);

const app = read('src/App.tsx');
const main = read('src/main.tsx');
const system = read('src/styles/product-system.css');
const pkg = JSON.parse(read('package.json'));

for (const file of ['src/App.tsx','src/main.tsx','src/styles/product-system.css']) {
  if (/<<<<<<<|=======|>>>>>>>/.test(read(file))) fail(file + ' contains merge-conflict markers.');
}

if (!main.includes('AppRecoveryBoundary')) fail('App recovery boundary is not mounted.');
else pass('App recovery boundary mounted.');

if (!app.includes('GlobalCommandPalette')) fail('Universal Nightjar command search is not mounted.');
else pass('Universal command search mounted.');

if (!app.includes('MobileNavigation')) fail('Role-aware mobile navigation is not mounted.');
else pass('Mobile navigation mounted.');

if (!app.includes('RoleDashboard')) fail('Role command-centre dashboard is missing.');
else pass('Role dashboards mounted.');

if (!system.includes('prefers-reduced-motion')) fail('Reduced-motion accessibility contract is missing.');
else pass('Reduced-motion support present.');

if (!system.includes(':focus-visible')) fail('Global focus-visible treatment is missing.');
else pass('Focus-visible treatment present.');

if (!system.includes('.nj-skeleton')) fail('Branded loading skeleton system is missing.');
else pass('Skeleton system present.');

if (!pkg.scripts?.['validate:contracts']) fail('Package scripts do not expose validate:contracts.');
if (!pkg.scripts?.['validate:bundle']) fail('Package scripts do not expose validate:bundle.');

if (process.exitCode) process.exit(process.exitCode);
console.log('Nightjar product contracts passed.');
