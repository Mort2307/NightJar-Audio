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


// A profession library must show every eligible multi-role public profile
// under each approved identity, and use role-specific public metadata.
const library=read('src/App.tsx');
if (!library.includes('PROFESSIONAL_LIBRARY_CATEGORIES') || !library.includes('NIGHTJAR · PROFESSIONAL LIBRARY')) fail('Dedicated professional library is missing.');
if (!library.includes("(person.roles??[person.role]).includes(category.id)")) fail('Multi-role members must appear in each eligible profession.');
if (!library.includes('roleSlice.roleHeadline||roleSlice.roleBio')) fail('Professional cards must use the selected role identity rather than the primary account role.');
if (!library.includes('openPublicProfile(person.userId,displayRole)')) fail('Role-specific library card must open the corresponding public profile tab.');
if (!library.includes("initialRole={publicProfileInitialRole??undefined}")) fail('Public profile deep links must retain their selected professional tab.');
if (!system.includes('.nj-professional-library-nav') || !system.includes('.nj-professional-library-group')) fail('Premium responsive professional library styles are missing.');

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
if (!app.includes("openAdminWorkspace('security')") || !read('src/components/AdminSecurityAlerts.tsx').includes('id="admin-security-alerts"')) fail('Admin security metric must navigate to the focused security workpage with a real anchor.');
if (!["selectTab('portfolio')", "selectTab('collaborations')", "selectTab('profile')", "selectTab('projects')"]
  .every((call) => editorStudio.includes(call))) fail('Editor top tiles must open their relevant tabs.');
if (!editorStyles.includes('.editor-studio-metrics > button')) fail('Editor summary buttons lack visible interaction affordance.');
else pass('Editor summary tiles navigate to corresponding sections.');

if (process.exitCode) process.exit(process.exitCode);
console.log('Nightjar product contracts passed.');
