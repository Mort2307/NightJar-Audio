import assert from 'node:assert/strict';
import fs from 'node:fs';

// Responsive regression guard for the Nightjar mobile dock, profile save CTA,
// keyboard focus and pressed-state feedback. Real-device visual QA is still required.
const app = fs.readFileSync('src/App.tsx', 'utf8');
const styles = fs.readFileSync('src/index.css', 'utf8');
const product = fs.readFileSync('src/styles/product-system.css', 'utf8');
const mobileNav = fs.readFileSync('src/components/MobileNavigation.tsx', 'utf8');

assert.match(app, /className="nj-mobile-profile-save"/, 'mobile save CTA exists');
assert.match(app, /view === 'profile' && !profileRolesPage && profileDirty/, 'mobile CTA only appears on an edited profile');
assert.match(app, /aria-label="Unsaved profile changes"/, 'save region is identified to screen readers');
assert.match(app, /aria-busy=\{profileLoading\}/, 'saving progress exposed');
assert.match(app, /disabled=\{profileLoading\}/, 'double-submit prevented');
assert.match(app, /has-mobile-profile-save/, 'page can reserve room for both fixed docks');

const mainEnd = app.search(/ {6}\{user && ageVerified && (?:!liveRolePreview && )?<MobileNavigation/);
const mobileSave = app.indexOf('className="nj-mobile-profile-save"');
const mainStart = app.indexOf('<main id="nightjar-main-content"');
assert.ok(mainEnd > mainStart && mobileSave > mainStart && mobileSave < mainEnd, 'mobile save mounts near bottom navigation');
const pageEnd = app.indexOf('      </main>', mainStart);
assert.ok(pageEnd >= 0 && mobileSave > pageEnd, 'fixed save is outside animated page, not trapped by its transform');

const onboarding=fs.readFileSync('src/components/NightjarOnboarding.tsx','utf8');
assert.match(styles, /\.onboarding-card\.premium-onboarding-card\s*\{[^}]*overflow-y:\s*auto;/, 'premium onboarding restores vertical touch scrolling');
assert.match(styles, /\.onboarding-card\.premium-onboarding-card\s*\{[^}]*max-height:\s*calc\(100dvh\s*-\s*30px\)/, 'onboarding height tracks mobile browser and keyboard viewport');
assert.match(styles, /\.onboarding-card\.premium-onboarding-card\s*>\s*\.premium-onboarding-footer\s*\{[^}]*position:\s*sticky;/, 'onboarding actions stay reachable while scrolling');
assert.match(onboarding, /ref=\{scrollContainerRef\}/, 'wizard scrolls its own panel instead of requiring keyboard tab');
assert.match(onboarding, /scrollContainerRef\.current\?\.scrollTo/, 'changing wizard steps starts at the next heading');
assert.match(onboarding, /onSkip/, 'wizard exposes a Finish later exit');
assert.match(app, /nextProfile\.onboardingComplete !== true && nextProfile\.onboardingDeferred !== true/, 'deferred onboarding does not reopen on later logins');
assert.match(app, /nightjarCommunity\.deferMyProfileOnboarding\(\)/, 'Finish later is persisted to the authenticated account');
const community=fs.readFileSync('src/platform/firebase-community.ts','utf8');
const backend=fs.readFileSync('functions/src/index.ts','utf8');
assert.match(community, /deferMyProfileOnboardingCall/, 'client has a durable onboarding deferral action');
assert.match(backend, /export const deferMyProfileOnboarding = onCall/, 'server persists the account-level deferral');
assert.match(backend, /onboardingDeferredAt: FieldValue\.serverTimestamp\(\)/, 'deferral stores an audit timestamp');
assert.match(backend, /input\.onboardingComplete === true \? \{ onboardingDeferred: false \}/, 'completing onboarding clears the deferral safely');

assert.match(styles, /\.premium-profile-page \.premium-profile-floating-save\s*\{\s*\/\*[^]*?display: none;/, 'old sticky save is not duplicated on mobile');
assert.match(styles, /\.nj-mobile-profile-save\s*\{[^]*?position: fixed;/, 'save CTA is fixed and remains accessible while editing');
assert.match(styles, /\.nj-mobile-profile-save\s*\{[^]*?bottom: calc\(var\(--nj-mobile-dock-clearance/, 'save CTA clears mobile navigation');
assert.match(styles, /\.app-shell\.has-mobile-profile-save\s*\{[^]*?padding-bottom: 148px;/, 'remaining page buttons can scroll above fixed save CTA');
assert.match(styles, /\.nj-mobile-profile-save \.primary-button\s*\{[^]*?min-height: 50px;/, 'mobile save is a comfortable touch target');

assert.match(product, /--nj-mobile-dock-clearance: 76px;/, 'compact dock clearance is centrally defined');
assert.match(product, /\.nj-mobile-nav\s*\{[^]*?bottom: calc\(6px \+ env\(safe-area-inset-bottom/, 'compact dock respects home-indicator safe area');
assert.match(product, /body\s*\{\s*padding-bottom: calc\(var\(--nj-mobile-dock-clearance\)/, 'bottom content clears fixed navigation');
assert.match(product, /\.nj-mobile-nav\s*\{[^]*?height: 61px;/, 'mobile dock remains one compact row');
assert.match(product, /\.nj-mobile-nav button\s*\{[^]*?height: 100%;/, 'mobile nav fills its single row');
assert.match(product, /\.nj-mobile-nav button:active/, 'nav buttons have visible pressed states');
assert.match(product, /:where\(button:not\(:disabled\)\):active/, 'all ordinary buttons have pressed-state feedback');
assert.match(product, /:focus-visible/, 'keyboard focus remains visible');
assert.match(product, /prefers-reduced-motion: reduce/, 'pressed feedback respects reduced-motion setting');
assert.match(product, /\.floating-account\s*\{\s*display: none;/, 'floating role chip does not hide bottom controls on phones');
assert.match(product, /\.testing-age-bypass-banner\s*\{\s*position: relative;/, 'QA notice does not cover the sticky header and its buttons');

assert.match(mobileNav, /aria-current=\{active \? 'page' : undefined\}/, 'active destination remains announced');
assert.match(mobileNav, /const settings: Item = \{ view: 'settings'/, 'settings is an actual mobile destination');
assert.match(mobileNav, /Exactly five unique destinations/, 'mobile navigation explicitly prevents duplicates');
assert.doesNotMatch(mobileNav, /roleHome/, 'duplicate Admin home/destination is removed');
assert.match(app, /view === 'settings' &&/, 'settings view is rendered as a distinct page');
assert.match(app, /import NightjarSettings from/, 'settings hub is integrated with app routing');
assert.match(product, /grid-template-rows: minmax\(0, 1fr\)/, 'mobile dock cannot form an extra row');


const workspaceTabs = fs.readFileSync('src/components/AdminWorkspaceTabs.tsx', 'utf8');
assert.match(app, /import AdminWorkspaceTabs/, 'Owner workspaces are implemented as a shared component');
assert.match(app, /adminWorkspace === 'overview' && <RoleDashboard/, 'Owner overview stays focused on active priorities');
assert.match(app, /adminWorkspace === 'launch' && <>/, 'launch readiness is kept out of routine dashboard scroll');
assert.match(app, /adminWorkspace === 'people' && <>/, 'People workpage keeps account-role management');
assert.match(app, /adminWorkspace === 'content' && <>/, 'Content workpage keeps moderation and approvals');
assert.match(app, /adminWorkspace === 'finance' && <>/, 'Finance has a separate workpage');
assert.match(app, /adminWorkspace === 'security' && <AdminSecurityAlerts/, 'Security alerts require the Safety workpage');
assert.match(app, /adminWorkspace === 'security' && <AdminAuthenticationLog/, 'Sign-in problems use the same focused Safety workpage');
assert.match(app, /adminWorkspace === 'tools' && <Suspense/, 'Mail tools are not mounted until requested');
assert.match(app, /\/admin\/workspace\//, 'admin workspace navigation uses dedicated deep links');
assert.match(app, /setAdminWorkspace\(\(workspaceFromPath/, 'browser Back restores admin workpage');
assert.match(workspaceTabs, /'overview' \| 'people' \| 'content' \| 'launch' \| 'finance' \| 'security' \| 'assistance' \| 'tools'/, 'all admin workspaces are present');
assert.match(workspaceTabs, /aria-current=\{active === section\.id \? 'page' : undefined\}/, 'current admin workspace is accessible');
assert.match(product, /\.nj-owner-workspaces\s*\{/, 'compact workspace navigation has CSS');
assert.match(product, /\.nj-admin-focused-grid \.admin-panel p\s*\{ font-size: 13px;/, 'Admin cards have readable body text');

const ownerNav = fs.readFileSync('src/components/AdminWorkspaceTabs.tsx', 'utf8');
const authCases = fs.readFileSync('src/components/AdminAuthenticationLog.tsx', 'utf8');
assert.match(ownerNav, /nj-owner-workspaces-compact/, 'non-overview admin workpages use compact single-row section navigation');
assert.match(product, /\.nj-owner-workspaces\.nj-owner-workspaces-compact\s*\{[^]*?overflow-x: auto;/, 'mobile admin sections are scrollable rather than four repeated rows');
assert.match(product, /\.admin-live-preview-diagnostic \.nj-script-visibility-info/, 'script titles and status descriptions have dedicated readable card space');
assert.match(authCases, /nj-auth-case-list/, 'sign-in activity renders grouped readable cases');
const artist = fs.readFileSync('src/components/ArtistStudio.tsx','utf8');
const portfolio = fs.readFileSync('src/components/ArtistPortfolioManager.tsx','utf8');
assert.match(app, /view === 'artist' && effectiveRole === 'artist' && !liveRolePreview/, 'Artist Studio must enforce current role and not allow read-only owner preview to edit');
assert.match(app, /onEditProfile=\{\(\) => \{ navigate\('profile'\); void switchProfileEditRole\('artist'\); \}\}/, 'Artist Studio profile link opens the correct professional identity');
assert.match(mobileNav, /\{ view: 'artist', label: 'Artist', accessibleLabel: 'Artist Studio'/, 'Artist bottom navigation opens its own studio, not generic Profile');
assert.match(app, /Your portfolio lives in Artist Studio/, 'Profile retains an Artist portfolio hand-off without mounting uploader');
assert.doesNotMatch(app, /<ArtistPortfolioManager/, 'Artwork submission does not live inside shared Profile route');
assert.match(artist, /section==='portfolio' &&/, 'Artist has a dedicated portfolio workpage');
assert.match(artist, /<ArtistPortfolioManager notify=\{notify\} demoMode=\{demoMode\}/, 'Artist Studio reuses existing moderated and fictional artwork safety flows');
assert.match(portfolio, /formOpen && <div className="artist-portfolio-form">/, 'Artwork upload is collapsed until user requests it');
assert.match(product, /\.nj-artist-studio-actions\s*\{/, 'Artist actions have responsive layout');

const onboarding = fs.readFileSync('src/components/NightjarOnboarding.tsx','utf8');
const server = fs.readFileSync('functions/src/index.ts','utf8');
const community = fs.readFileSync('src/platform/firebase-community.ts','utf8');

assert.match(styles, /\.premium-onboarding-card\s*\{[^}]*overflow-y:auto;/, 'onboarding modal must support touch scrolling');
assert.match(styles, /\.premium-onboarding-card\s*\{[^}]*touch-action:pan-y;/, 'touch swipes can scroll the onboarding form');
assert.match(styles, /\.premium-onboarding-footer\s*\{[^}]*position:sticky;/, 'the onboarding action bar stays reachable on narrow screens');
assert.match(styles, /\.premium-onboarding-card\s*\{[^}]*100dvh/, 'mobile onboarding height respects visual viewport');
assert.match(onboarding, /cardRef\.current\?\.scrollTo/, 'switching onboarding steps resets the inner form scroll');
assert.match(onboarding, /Save &amp; finish later/, 'member can intentionally postpone onboarding');
assert.match(onboarding, /savedDraft\?\.displayName/, 'saved onboarding draft prepopulates the resumed form');
assert.match(server, /export const pauseProfileOnboarding = onCall/, 'profile postponement persists through an authenticated server operation');
assert.match(server, /onboardingDismissed:dismiss/, 'the server persists whether the member actively postponed setup');
assert.match(app, /nextProfile\.onboardingComplete !== true && nextProfile\.onboardingDismissed !== true/, 'completed or postponed onboarding does not interrupt future logins');
assert.match(app, /Finish profile setup/, 'postponed setup has a visible profile-page resume action');
assert.match(app, /await nightjarCommunity\.pauseOnboarding\(draft,stepIndex,revision\)/, 'the save and finish later action persists the versioned cloud draft before closing');
assert.match(community, /pauseOnboardingCall/, 'client sends pause request to the correct backend callable');

const roleManager = fs.readFileSync('src/components/ProfessionalRoleManager.tsx','utf8');
const accountClient = fs.readFileSync('src/platform/firebase-account.ts','utf8');
assert.match(server,/export const getMyProfessionalApplicationDraft = onCall/, 'professional application drafts are cloud-readable');
assert.match(server,/export const saveMyProfessionalApplicationDraft = onCall/, 'professional application drafts are cloud-persisted');
assert.match(server,/currentRevision!==expectedRevision|currentRevision!==expected|expected!==revision/, 'draft cloud saving rejects stale versions across devices');
assert.match(onboarding,/nightjarCommunity\.saveOnboardingDraft/, 'onboarding fields autosave during input');
assert.match(onboarding,/cloudRevision\.current/, 'onboarding autosave preserves the account draft revision');
assert.match(roleManager,/nightjarAccount\.getApplicationDraft/, 'application draft is recovered on another device');
assert.match(roleManager,/nightjarAccount\.saveApplicationDraft/, 'application edits autosave to Firebase');
assert.match(accountClient,/getApplicationDraftCall/, 'professional draft read has a Firebase client connector');
assert.match(accountClient,/saveApplicationDraftCall/, 'professional draft write has a Firebase client connector');
console.log('Nightjar mobile dock, save-bar visibility and responsive touch-feedback contracts passed.');
