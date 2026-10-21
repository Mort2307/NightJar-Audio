import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app=readFileSync('src/App.tsx','utf8');
const server=readFileSync('functions/src/index.ts','utf8');
const onboarding=readFileSync('src/components/NightjarOnboarding.tsx','utf8');

// The avatar opens a small, accessible menu with Profile and role options.
// Ordinary members use My Roles, while Admin can inspect isolated role demos.
assert.match(app, /className="account-chip" aria-label="Open account menu: profile and roles"/);
assert.match(app, /aria-expanded=\{accountMenuOpen\} aria-controls="nj-account-options"/);
assert.match(app, /className="nj-account-menu-popover" id="nj-account-options"/);
assert.match(app, /onClick=\{openProfileEditor\}><UserCircle2[^]*?My Profile/);
assert.match(app, /onClick=\{openMyRoles\}><ShieldCheck[^]*?Switch Roles/);
assert.match(app, /className="floating-account" onClick=\{openProfileEditor\} aria-label="Open my NightJar profile"/);
assert.match(app, /if \(!accountMenuRef\.current\?\.contains\(event\.target as Node\)\) setAccountMenuOpen\(false\)/, 'outside tap closes the menu');
assert.match(app, /event\.key === 'Escape'[^]*?accountMenuTriggerRef\.current\?\.focus\(\)/, 'Escape returns focus to the avatar');
assert.match(app, /LIVE_PREVIEW_ROLES\.map\(option => <button[^]*?startSimulation\(option\.id\)/, 'Admin has direct safe access to five role demos');
assert.match(app, /onClick=\{\(\) => \{ setAccountMenuOpen\(false\); openLiveMemberProfile\(\); \}\}/, 'Live public profile viewer remains distinct from fictional simulation');
assert.match(app, /interactiveRoleTest \? disableDemoMode\(\) : clearAdminPreview\(\)/, 'Admin can return from either type of preview');
assert.match(app, /const startSimulation = \(next: PreviewRole[^]*?if \(!canAdmin\) return;/, 'only Admin can start simulated role previews');
assert.match(app, /No real account was impersonated/, 'simulations do not represent real users');
assert.match(app, /role && <button type="button" className="secondary-button" onClick=\{\(\) => setRolePicker\(false\)\}/,
  'Existing members can always exit account setup');
assert.match(app, /onClick=\{openMyRoles\}>My Roles<\/button>/, 'Role switching remains available from My Roles');
assert.match(app, /onClick=\{openProfileEditor\}[^>]*>[^<]*<ArrowLeft/, 'My Roles has a profile return route');

// The automatic welcome modal can only be presented once per member/session,
// independent of account role changes, and only after successful profile fetch.
assert.match(app, /onboardingPromptedUsersRef = useRef<Set<string>>\(new Set\(\)\)/);
assert.match(app, /onboardingFinishedUsersRef = useRef<Set<string>>\(new Set\(\)\)/);
assert.match(app, /if \(completed\) \{\s*setShowOnboarding\(false\);\s*\} else if \(!onboardingPromptedUsersRef\.current\.has\(memberId\)\)/);
assert.match(app, /setShowOnboarding\(nextProfile\.onboardingDeferred !== true && nextProfile\.onboardingDismissed !== true\)/);
assert.doesNotMatch(app,/setShowOnboarding\(nextProfile\.onboardingComplete !== true/, 'Role refresh must not reopen wizard');

// A deliberate profile editor save completes introductory setup, including when
// the member did not use the three-step welcome form.
const save=app.split('  const saveProfile = async () => {')[1].split('  const switchProfileEditRole')[0];
assert.match(save, /onboardingComplete: true/);
assert.match(save, /await nightjarCommunity\.saveMyProfile\(payload, profileEditRole\)/);
assert.match(save, /onboardingFinishedUsersRef\.current\.add\(user\.userId\)/);
assert.match(save, /setShowOnboarding\(false\)/);
assert.match(onboarding,/onboardingComplete: true/);
assert.match(app,/onComplete=\{\(nextProfile\) => \{ onboardingFinishedUsersRef\.current\.add\(user\.userId\)/);

// The backend persists completion monotonically, even when an old draft saves.
assert.match(server,/const onboardingNowComplete = nextProfile\.onboardingComplete \|\| onboardingWasComplete/);
assert.match(server,/if\(data\.onboardingComplete===true\)return \{dismissed:false,completed:true/);
console.log('PASS NightJar QP profile navigation, once-per-session onboarding and completion persistence contracts.');
