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
assert.match(app, /adminWorkspace === 'security' && <section/, 'Security alerts require the Safety workpage');
assert.match(app, /adminWorkspace === 'tools' && <Suspense/, 'Mail tools are not mounted until requested');
assert.match(app, /\/admin\/workspace\//, 'admin workspace navigation uses dedicated deep links');
assert.match(app, /setAdminWorkspace\(\(workspaceFromPath/, 'browser Back restores admin workpage');
assert.match(workspaceTabs, /'overview' \| 'people' \| 'content' \| 'launch' \| 'finance' \| 'security' \| 'assistance' \| 'tools'/, 'all admin workspaces are present');
assert.match(workspaceTabs, /aria-current=\{active === section\.id \? 'page' : undefined\}/, 'current admin workspace is accessible');
assert.match(product, /\.nj-owner-workspaces\s*\{/, 'compact workspace navigation has CSS');
assert.match(product, /\.nj-admin-focused-grid \.admin-panel p\s*\{ font-size: 13px;/, 'Admin cards have readable body text');

console.log('Nightjar mobile dock, save-bar visibility and responsive touch-feedback contracts passed.');
