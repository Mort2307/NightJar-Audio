import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const app = read('src/App.tsx');
const root = read('src/components/AppRecoveryBoundary.tsx');
const section = read('src/components/ProfileSectionBoundary.tsx');
const profile = read('src/components/UserProfileStudio.tsx');
const role = read('src/components/RoleProfileExtension.tsx');
const activity = read('src/components/AccountSecurityActivity.tsx');
const legal = read('src/components/LegalAgreementPanel.tsx');
const accessibility = read('src/components/AccessibilityPreferences.tsx');

assert.match(app, /ProfileSectionBoundary title="Cloud profile draft"/, 'cloud draft failures are isolated');
assert.match(app, /ProfileSectionBoundary title="Your profile editor"/, 'personal profile editor failures are isolated');
assert.match(app, /ProfileSectionBoundary title="Professional identity editor"/, 'role editor failures are isolated');
for (const title of ['Social links', 'Accessibility preferences', 'Legal agreements', 'Sign-in activity']) {
  assert.match(profile, new RegExp('ProfileSectionBoundary title="' + title + '"'), title + ' fails independently');
}
assert.match(section, /static getDerivedStateFromError/, 'render or chunk load errors are contained');
assert.match(section, /Try this section again/, 'failing section can retry without global navigation');
assert.match(section, /Copy error details/, 'support can obtain original error without reproducing it');
assert.match(root, /Copy error details/, 'global fallback includes actionable error details');
assert.match(root, /componentStack/, 'global fallback includes local React component trace');
assert.match(profile, /Array\.isArray\(profile\.favouriteTags\)/, 'legacy tags cannot crash profile rendering');
assert.match(role, /Array\.isArray\(profile\.roleSpecialties\)/, 'legacy role data cannot crash specialty controls');
assert.match(activity, /Array\.isArray\(data\?\.activity\)/, 'unexpected activity payload cannot crash');
assert.match(legal, /Array\.isArray\(data\?\.documents\)/, 'unexpected legal payload cannot crash');
assert.match(accessibility, /DEFAULT_ACCESSIBILITY_PREFERENCES,/, 'missing preference fields use safe defaults');
assert.doesNotMatch(section, /setProfile\(|localStorage|sessionStorage|signOut/, 'recovery must not modify or log out account');
console.log('Nightjar profile crash containment and legacy-data contracts passed.');
