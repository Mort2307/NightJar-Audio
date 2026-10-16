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


// Role-aware public links: a multi-role member opened from Writers must
// display the Writer identity, not accidentally fall back to primary VA.
const professionalLibrary=read('src/components/ProfessionalLibrary.tsx');
if (!professionalLibrary.includes('onOpen(person.userId,category)')) fail('Profession cards must request their exact public profile role.');
if (!app.includes("initialRole={publicProfileInitialRole??undefined}")) fail('Public Profile must start on the requested category role.');
if (!app.includes("new URLSearchParams(window.location.search).get('role')")) fail('The chosen profile role must survive page refresh and browser navigation.');

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

const listenerHome = app.indexOf("{view === 'discover' && (");
const listenerHero = app.indexOf('<section className="hero-section">', listenerHome);
if (listenerHome < 0 || listenerHero < listenerHome || app.slice(listenerHome, listenerHero).includes('<RoleDashboard')) {
  fail('Listener Home must open with the premium audio hero, not account statistics.');
} else pass('Listener Home puts listening discovery before account statistics.');

const listenerProfile = app.indexOf("{view === 'profile' && !profileRolesPage && (");
const listenerProfileEnd = app.indexOf("{view === 'profile' && profileRolesPage && (", listenerProfile);
if (listenerProfile < 0 || listenerProfileEnd < listenerProfile ||
    !app.slice(listenerProfile, listenerProfileEnd).includes('title="Your Nightjar at a glance."') ||
    !app.slice(listenerProfile, listenerProfileEnd).includes("label:'Favourites'") ||
    !app.slice(listenerProfile, listenerProfileEnd).includes("label:'Following'") ||
    !app.slice(listenerProfile, listenerProfileEnd).includes("label:'Updates'")) {
  fail('Listener account statistics must remain accessible from Profile.');
} else pass('Listener account statistics are available on Profile.');

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
  "destination:'your following list'",
  "destination:'notifications'",
  "destination:'the release pipeline'",
  "destination:'the manuscript workspace'",
  "destination:'messages'",
]) {
  if (!app.includes(destination)) fail('Dashboard metric lacks route to ' + destination);
}
if (!app.includes("setMyConnectionsKind('following')")) fail('Following tile must open actual connections.');
if (!app.includes("openAdminWorkspace('security')") || !read('src/components/AdminSecurityAlerts.tsx').includes('id="admin-security-alerts"')) fail('Admin security metric must navigate to the focused security workpage with a real anchor.');
if (!["selectTab('portfolio')", "selectTab('collaborations')", "selectTab('profile')", "selectTab('projects')"]
  .every((call) => editorStudio.includes(call))) fail('Editor top tiles must open their relevant tabs.');
if (!editorStyles.includes('.editor-studio-metrics > button')) fail('Editor summary buttons lack visible interaction affordance.');
else pass('Editor summary tiles navigate to corresponding sections.');

if (process.exitCode) process.exit(process.exitCode);
console.log('Nightjar product contracts passed.');
