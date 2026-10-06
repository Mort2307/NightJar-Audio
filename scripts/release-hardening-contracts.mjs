import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=(file)=>fs.readFileSync(path.join(root,file),'utf8');
const fail=(message)=>{ console.error('RELEASE HARDENING CONTRACT FAIL:',message); process.exitCode=1; };
const pass=(message)=>console.log('✓',message);

const app=read('src/App.tsx');
const functions=read('functions/src/index.ts');
const accountPortal=read('src/components/AccountPortal.tsx');
const mobile=read('src/components/MobileNavigation.tsx');
const artistStudio=read('src/components/ArtistStudio.tsx');
const roleProfiles=read('src/components/RoleProfileExtension.tsx');
const publicProfile=read('src/components/PublicProfile.tsx');
const recovery=read('src/components/AppRecoveryBoundary.tsx');
const productExperience=read('src/components/ProductExperience.tsx');
const pwa=read('src/platform/pwa.ts');
const sw=read('public/service-worker.js');
const firestore=read('firestore.rules');
const storage=read('storage.rules');
const finance=read('src/components/AdminFinanceSimulator.tsx');
const releaseGate=read('src/components/ReleaseReadinessDashboard.tsx');
const manifest=JSON.parse(read('public/manifest.webmanifest'));

const checks=[
  ['Artist is a routable application view', app.includes("'artist' | 'messages'") && app.includes("view === 'artist'")],
  ['Artist sign-in routes to Artist Studio', accountPortal.includes("account.role === 'artist'") && accountPortal.includes("return '/artist'")],
  ['Artist mobile navigation targets Artist Studio', mobile.includes("view:'artist'") && mobile.includes("label:'Artist'")],
  ['Artist has a dedicated workspace component', artistStudio.includes('ARTIST COMMAND CENTRE') && artistStudio.includes('ArtistPortfolioManager') && artistStudio.includes('CollaborationHub')],
  ['every non-editor role has distinct premium identity copy', ['LISTENER SHELF','VA PERFORMANCE PROFILE','WRITER DESK','ARTIST STUDIO'].every((label)=>roleProfiles.includes(label))],
  ['public profiles render selected role identity', publicProfile.includes("public-profile-role-' + profileRole") && publicProfile.includes('roleDetails.roleHeadline')],
  ['multi-role profile fallback cannot borrow another saved role slice', functions.includes('if (hasRoleProfiles)') && functions.includes('// Legacy migration only')],
  ['Listener remains available on multi-role profiles', functions.includes("['listener', ...professionalRolesForAccount") && functions.includes("const roles = ['listener', ...professionalRoles]")],
  ['successful authentication events are recorded', functions.includes('recordAuthenticationSuccess') && functions.includes("eventType: 'signin_success'")],
  ['new authentication devices create user notifications', functions.includes("subtype:'new_device_signin'") && functions.includes("collection('trustedAuthDevices')")],
  ['users can read their own authentication history', functions.includes('listMyAuthenticationEvents') && functions.includes("where('targetUserId', '==', identity.uid)")],
  ['manual app update clears all Cache Storage', pwa.includes('Promise.all(keys.map((key) => caches.delete(key)))')],
  ['manual update resets service-worker registrations', pwa.includes('getRegistrations()') && pwa.includes('registration.unregister()')],
  ['global update banner uses force-update flow', productExperience.includes('applyNightjarUpdate') && !productExperience.includes('window.location.reload()')],
  ['service worker supports explicit update activation', sw.includes("type === 'SKIP_WAITING'") && sw.includes("nightjar-shell-v10")],
  ['PWA manifest includes a maskable app icon', manifest.icons?.some((icon)=>String(icon.purpose).includes('maskable')) === true && fs.existsSync(path.join(root,'public/nightjar-icon-maskable-512.png'))],
  ['crash recovery uses force-refresh repair', recovery.includes('applyNightjarUpdate') && recovery.includes('Repair & reload Nightjar')],
  ['Directory rendering is bounded', app.includes('directoryVisibleLimit') && app.includes('visibleDirectoryProfiles') && app.includes('Load 30 more')],
  ['Firestore remains deny-by-default', /match \/\{document=\*\*\}[\s\S]*allow read, write: if false/.test(firestore)],
  ['Storage has no blanket authenticated read', !/allow read\s*:\s*if\s+request\.auth\s*!=\s*null/.test(storage)],
  ['Listener private activity is not added to public profile payload', !functions.slice(functions.indexOf('const publicProfileForAccount'),functions.indexOf('const calculateVerifiedListening')).includes('listeningEvents')],
  ['Finance Lab supports named comparison scenarios', finance.includes('ScenarioSnapshot') && finance.includes('finance-scenarios.v2') && finance.includes('Save current model')],
  ['Admin has a release-readiness dashboard', releaseGate.includes('ADMIN / RELEASE GATE') && releaseGate.includes('Code, Functions & Firebase contracts')],
];

for(const [label,ok] of checks){
  if(ok) pass(label);
  else fail(label);
}
if(process.exitCode) process.exit(process.exitCode);
console.log('Nightjar release-hardening contracts passed:',checks.length);
