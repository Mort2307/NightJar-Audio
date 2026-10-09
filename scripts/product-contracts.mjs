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

// Dashboard summary tiles are navigation controls, not decorative counters.
const dashboardMetrics = read('src/components/RoleDashboard.tsx');
const editorStudio = read('src/components/EditorStudio.tsx');
const editorStyles = read('src/index.css');
if (!/metric\.onClick\s*\?/.test(dashboardMetrics) ||
    !dashboardMetrics.includes('className="nj-role-metric-link"') ||
    !dashboardMetrics.includes('type="button"') ||
    !dashboardMetrics.includes('aria-label=')) {
  fail('Role dashboard metric tiles must render accessible actionable buttons.');
} else pass('Role dashboard metric tiles are keyboard and touch accessible.');

for (const destination of [
  "destination:'administrator security alerts'",
  "destination:'image moderation'",
  "destination:'professional application bank'",
  "destination:'subscription ledger'",
  "destination:'your profile'",
  "destination:'your library'",
  "destination:'the professional directory'",
  "destination:'notifications'",
  "destination:'the release pipeline'",
  "destination:'the manuscript workspace'",
  "destination:'messages'",
]) {
  if (!app.includes(destination)) fail('Dashboard metric lacks route to ' + destination);
}
if (!app.includes('id="admin-security-alerts"')) fail('Admin security metric has no corresponding anchor.');
if (!["selectTab('portfolio')", "selectTab('collaborations')", "selectTab('profile')", "selectTab('projects')"]
  .every((call) => editorStudio.includes(call))) fail('Editor top tiles must open their relevant tabs.');
if (!editorStyles.includes('.editor-studio-metrics > button')) fail('Editor summary buttons lack visible interaction affordance.');
else pass('Editor summary tiles navigate to corresponding sections.');

if (process.exitCode) process.exit(process.exitCode);
console.log('Nightjar product contracts passed.');
