import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (name) => fs.readFileSync(name, 'utf8');
const backend = read('functions/src/index.ts');
const app = read('src/App.tsx');
const client = read('src/platform/firebase-administration.ts');
const member = read('src/components/AdminMemberRoleEditor.tsx');
const live = read('src/components/AdminLiveMarketplacePreview.tsx');
const marketplace = read('src/components/ScriptMarketplace.tsx');
const marketplaceActions = read('src/components/MarketplaceScriptActions.tsx');
const css = read('src/index.css');

// One member can be approved for any combination of professions; Listener is
// preserved as the permanent personal identity. No new account is created.
assert.match(member, /Manage Roles & Access/, 'direct admin member access control exists');
for (const role of ["'creator'", "'writer'", "'editor'", "'artist'"]) {
  assert.ok(member.includes(role), 'multi-selector includes ' + role);
}
assert.match(member, /type="checkbox" checked=\{selected\.includes\(id\)\}/, 'professions are independently selected');
assert.match(member, /Listener <small>Always included<\/small>/, 'Listener identity remains permanent');
assert.match(member, /Save selected roles/, 'explicit save controls access changes');
assert.match(member, /Remove .* access from this account/, 'role removal needs confirmation');
assert.match(member, /role=\u0022alert\u0022/, 'permission errors are visible to admins');
assert.match(app, /<AdminMemberRoleEditor/, 'role editor is mounted in admin People');
assert.match(app, /manageAccountProfessions/, 'admin UI handles full approved role set');
assert.match(client, /'adminManageProfessionalRoles'/, 'client uses dedicated multirole callable');
assert.match(backend, /export const adminManageProfessionalRoles = onCall/, 'backend manages an approved set, not a primary role swap');
assert.match(backend, /const admin = requireAdminIdentity\(request\)/, 'role mutations require administrator auth');
assert.match(backend, /approvedProfessionalRoles: selected/, 'all approved professions persist atomically');
assert.match(backend, /tx\.create\(eventDocument/, 'admin role grant\/removal is audit logged');
assert.match(backend, /sameRoles\(previouslyApproved, expected\)/, 'parallel updates are conflict checked');
assert.match(backend, /await requireProfessionalLegalTerms\(userId\)/, 'professional role grants require current contributor agreements');
assert.match(backend, /await requireAgeVerified\(userId\)/, 'role grants require authoritative live age evidence or explicitly allowlisted QA access');
assert.match(backend, /addedRoles\.length && account\.status === 'suspended'/, 'suspended accounts cannot be granted professional roles');
assert.match(backend, /: 'listener';/, 'removing an active profession returns to Listener');
const roleMutation = backend.split('export const adminManageProfessionalRoles = onCall')[1]?.split('export const reviewProfessionalApplication = onCall')[0] ?? '';
assert.ok(roleMutation, 'admin multi-role callable is present');
assert.match(roleMutation, /db\.runTransaction/, 'multi-role updates must be transactional');
assert.doesNotMatch(roleMutation, /tx\.set\(profileRef/, 'role grants must never rewrite saved role-specific profile data');

// Admin real-data preview must NOT impersonate a member, disclose manuscript
// contents, or bypass protected reader access.
assert.match(app, /openAdminPanel\('live-preview'\)/, 'Owner Console offers a separate live preview page');
assert.match(app, /panel === 'live-preview' \|\| panel === 'profile-viewer'\) && demoMode/, 'both real-data preview pages exit fictional demo mode');
assert.match(app, /<AdminLiveMarketplacePreview notify=\{notify\}/, 'live preview mounts in dedicated routed page');
assert.match(live, /previewScriptMarketplace\(\)/, 'admin visibility diagnostic uses actual server data');
assert.match(live, /<ScriptMarketplace/, 'actual VA marketplace component is reused');
assert.match(live, /demoMode=\{false\}/, 'public marketplace fetch uses real records only');
assert.match(live, /readOnlyPreview/, 'live preview cannot create interest\/collaboration');
assert.match(marketplace, /readOnlyPreview=\{readOnlyPreview\}/, 'read-only flag passed to all marketplace actions');
assert.match(marketplaceActions, /if\(readOnlyPreview\|\|\(demoMode&&\!simulationMode\)\)/, 'runtime checks forbid read-only preview writes');
assert.match(marketplaceActions, /Read-only live preview/, 'interactions visibly disabled');
assert.match(backend, /export const adminPreviewScriptMarketplace = onCall/, 'admin-only availability diagnostic is implemented');
assert.match(backend, /listing\.visibility === 'marketplace' && Boolean\(listing\.synopsis\.trim\(\)\) && \['Approved','Published'\]\.includes\(status\)/, 'diagnostic matches marketplace discoverability');
assert.match(backend, /No protected script text is included/, 'privacy requirement documented in diagnostic');
assert.match(css, /\.admin-member-multi-role-options/, 'checkboxes are styled for touch');
assert.match(css, /\.admin-live-preview/, 'preview remains responsive');


// A dedicated live member preview is distinct from the original VA script
// visibility audit and the fictional 'View as' QA simulator.
const realProfile = read('src/components/AdminLiveProfileViewer.tsx');
const publishedProfile = read('src/components/PublicProfile.tsx');
const product = read('src/styles/product-system.css');
assert.match(app, /openAdminPanel\('profile-viewer'\)/, 'owner can open dedicated real member preview');
assert.match(app, /<AdminLiveProfileViewer accounts=\{adminOverview\?\.people\?\.accounts \?\? \[\]\}/, 'owner viewer receives live admin accounts');
assert.match(app, /openLiveMemberProfile\(account\.userId\)/, 'a listed member can be opened straight from the People workpage');
assert.match(app, /tags\|branding\|live-preview\|profile-viewer/, 'profile viewer deep-link is reloadable');
assert.match(app, /adminPanel !== 'profile-viewer' \|\| demoMode \|\| !canAdmin/, 'live accounts are loaded only after leaving simulation');
assert.match(realProfile, /nightjarCommunity\.getPublicProfile\(id, true\)/, 'owner viewer requests server-authorised profile inspection rather than member publication');
assert.match(realProfile, /const \[selected,setSelected\] = useState<string\[\]>/, 'viewer supports selecting more than one account');
assert.match(realProfile, /prev\.length>=3/, 'comparison has a bounded account count');
assert.match(realProfile, /type="checkbox" checked=\{chosen\.includes\(role\)\}/, 'multiple approved role checkboxes are supported');
assert.match(realProfile, /approvedRoles\(account\)/, 'role picker uses account roles actually approved');
assert.match(realProfile, /readOnlyPreview/, 'exact public profile opens in non-mutating state');
assert.match(realProfile, /result\.status==='private'/, 'unpublished or missing profiles render a safe empty state');
assert.match(realProfile, /ownerOnlyPreview/, 'owner viewer keeps inspection mode scoped to read-only profile component');
assert.doesNotMatch(realProfile, /getMyProfile\(|getProtectedScript\(|listDirectMessages\(|saveMyProfile\(/, 'viewer cannot call member-private endpoints');
assert.match(publishedProfile, /initialRole\?: string/, 'member profile supports opening a selected role');
assert.match(publishedProfile, /!readOnlyPreview && <button className="secondary-button" onClick=\{\(\) => void onToggleFollow/, 'owner preview does not mutate follows');
assert.match(publishedProfile, /!readOnlyPreview && .*setGiftOpen\(true\)/, 'owner preview cannot open money-sending flow');
assert.match(product, /\.nj-profile-viewer-account-list/, 'viewer search results have responsive layout');
assert.match(product, /\.nj-profile-viewer-role-select/, 'approved roles are readable on mobile');

console.log('Nightjar admin multi-role grants and live tester marketplace preview contracts passed.');
