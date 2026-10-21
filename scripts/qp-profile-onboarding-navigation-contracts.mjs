import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app=readFileSync('src/App.tsx','utf8');
const server=readFileSync('functions/src/index.ts','utf8');
const onboarding=readFileSync('src/components/NightjarOnboarding.tsx','utf8');

// A profile photo is a link to the member's profile, never a role-selection trap.
assert.match(app, /className="account-chip" aria-label="Open my NightJar profile" title="My profile" onClick=\{openProfileEditor\}/);
assert.match(app, /className="floating-account" onClick=\{openProfileEditor\} aria-label="Open my NightJar profile"/);
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
