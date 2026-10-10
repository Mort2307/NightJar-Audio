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

assert.match(product, /--nj-mobile-dock-clearance: 96px;/, 'dock clearance is centrally defined');
assert.match(product, /\.nj-mobile-nav\s*\{[^]*?bottom: calc\(8px \+ env\(safe-area-inset-bottom/, 'dock respects home-indicator safe area');
assert.match(product, /body\s*\{\s*padding-bottom: calc\(var\(--nj-mobile-dock-clearance\)/, 'bottom content clears fixed navigation');
assert.match(product, /\.nj-mobile-nav button\s*\{[^]*?min-height: 58px;/, 'mobile nav has sufficient tap height');
assert.match(product, /\.nj-mobile-nav button:active/, 'nav buttons have visible pressed states');
assert.match(product, /:where\(button:not\(:disabled\)\):active/, 'all ordinary buttons have pressed-state feedback');
assert.match(product, /:focus-visible/, 'keyboard focus remains visible');
assert.match(product, /prefers-reduced-motion: reduce/, 'pressed feedback respects reduced-motion setting');
assert.match(product, /\.floating-account\s*\{\s*display: none;/, 'floating role chip does not hide bottom controls on phones');
assert.match(product, /\.testing-age-bypass-banner\s*\{\s*position: relative;/, 'QA notice does not cover the sticky header and its buttons');

assert.match(mobileNav, /aria-current=\{active \? 'page' : undefined\}/, 'active destination remains announced');
console.log('Nightjar mobile dock, save-bar visibility and responsive touch-feedback contracts passed.');
