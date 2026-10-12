import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const app = read('src/App.tsx');
const profile = read('src/components/UserProfileStudio.tsx');
const onboarding = read('src/components/NightjarOnboarding.tsx');
const handle = read('src/platform/profile-handle.ts');
const server = read('functions/src/index.ts');

assert.match(handle, /!handle \|\| \/\^\[a-z0-9_-\]\{3,30\}\$\//, 'empty handles allowed, otherwise strict 3–30 rule');
assert.match(handle, /suggestNightjarHandle/, 'invalid handles can be corrected with one click');
assert.match(profile, /aria-invalid=\{!!handleProblem\}/, 'profile editor shows invalid handles inline');
assert.match(profile, /Save without a handle/, 'profile editing can continue without claiming a handle');
assert.match(onboarding, /if \(handleProblem\)/, 'onboarding validates before the network request');
assert.match(app, /const invalidHandle = nightjarHandleError\(profile.handle\)/, 'save validates handles before API call');
assert.match(app, /handle: normaliseNightjarHandle\(profile.handle\)/, 'submitted handles are normalised');
assert.match(app, /setProfileSaveError\(message\)/, 'save failures are visible');
assert.match(app, /setProfileBaseline\(structuredClone\(empty\)\)/, 'brand-new accounts can save their first profile edit');
assert.match(app, /nightjarListening\.taste\(\)\.catch/, 'recommendation loading cannot block profile editor');
const save = app.split('  const saveProfile = async () => {')[1]?.split('  const switchProfileEditRole')[0] ?? '';
assert.ok(save, 'profile save flow is present');
assert.doesNotMatch(save, /for \(const targetRole of rolesToSave\)/, 'save is not one network call per role');
assert.match(save, /await nightjarCommunity\.saveMyProfile\(payload, profileEditRole\)/, 'one atomic multi-role save');
assert.match(save, /getMyProfile\(\)\.catch\(\(\) => null\)/, 'optional refresh cannot produce a false failed save');
assert.match(server, /const validatedRoleProfiles:/, 'backend receives and validates role draft bundle');
assert.match(server, /approvedRoles/, 'backend checks approved roles');
assert.match(server, /Object\.assign\(roleProfiles, validatedRoleProfiles\)/, 'one transaction writes all approved role drafts');
assert.match(server, /Profile saved; creator tag indexing failed/, 'secondary tag indexing errors are isolated');
assert.match(server, /Profile saved; release display-name sync failed/, 'secondary release syncing errors are isolated');

// Real mobile tester: scrolling froze because premium card overrode
// .onboarding-card overflow:auto with overflow:hidden. Keyboard Tab worked,
// but touch users could not reach the bottom or complete their VA profile.
const css = read('src/index.css');
assert.match(css, /\.onboarding-card\.premium-onboarding-card\s*\{[^}]*overflow-y:\s*auto;/s,
  'Premium onboarding must be vertically scrollable on touch devices');
assert.match(css, /\.onboarding-card\.premium-onboarding-card\s*\{[^}]*touch-action:\s*pan-y;/s,
  'Onboarding must allow a native vertical touch gesture');
assert.match(css, /\.premium-onboarding-footer\s*\{[^}]*position:\s*sticky;/s,
  'Back, Continue, and Finish later remain reachable at the bottom');
assert.match(css, /max-height:\s*calc\(100dvh\s*-\s*16px/,
  'Onboarding fits a mobile dynamic viewport even when browser UI resizes');
assert.match(onboarding, /ref=\{cardRef\}/, 'Onboarding scroll container has a stable element ref');
assert.match(onboarding, /cardRef\.current\?\.scrollTo\(/, 'Switching steps resets the inner scroll position');
assert.match(onboarding, /const finishLater = async \(\) =>/, 'Finish later persists progress rather than simply closing');
assert.match(onboarding, /onboardingComplete:\s*false,[\s\S]*deferOnboarding:\s*true/,
  'Finishing later must not misrepresent an incomplete profile as completed');
assert.match(onboarding, /await nightjarCommunity\.saveMyProfile\(payload\)/,
  'Finish later stores the partial profile using Nightjar canonical profile saving');
assert.match(server, /onboardingDismissedAt:\s*FieldValue\.serverTimestamp\(\)/,
  'A Finish later choice must survive login, browser change and role switch');
assert.match(app, /setShowOnboarding\(nextProfile\.onboardingComplete !== true && !nextProfile\.onboardingDismissedAt\)/,
  'Dismissed onboarding must not reopen on every login');
assert.match(profile, /Resume profile setup/, 'Profile page must let people choose to return to guided setup');
assert.match(app, /onResumeOnboarding=\{\(\) => setShowOnboarding\(true\)\}/,
  'Profile page resumes setup explicitly');
assert.match(onboarding, /Save & finish later/, 'The voluntary deferral action is clearly labelled');

// DEVICE CONTINUITY: draft sync must not be device-only or blindly
// last-writer-wins. Each role is scoped to the authenticated account.
const drafts=read('src/platform/firebase-profile-drafts.ts');
const draftUI=read('src/components/CloudProfileDraft.tsx');
assert.match(server,/export const getMyProfileWorkingDraft=onCall/, 'cloud drafts readable by authenticated member');
assert.match(server,/export const saveMyProfileWorkingDraft=onCall/, 'cloud drafts persist changes');
assert.match(server,/export const clearMyProfileWorkingDraft=onCall/, 'published profiles can clear drafts');
assert.match(server,/profileRef\(uid\)\.collection\('workingDrafts'\)/, 'drafts are private and account-scoped');
assert.match(server,/current\.revision!==expectedRevision/, 'draft saves require compare-and-swap');
assert.match(server,/profileDraftScope\(input\.scope\)/, 'draft route validates profile scope');
assert.match(server,/professionalRolesForAccount\(account\.data\(\)\?\?\{\}\)/, 'only approved roles can save their role draft');
assert.match(drafts,/httpsCallable/, 'device continuity uses an authenticated Firebase callable');
assert.match(onboarding,/nightjarProfileDrafts\.get\('onboarding'\)/, 'onboarding restores in-progress form from account');
assert.match(onboarding,/nightjarProfileDrafts\.save\('onboarding'/, 'onboarding saves progress while user edits');
assert.match(onboarding,/lastSyncedRef\.current/, 'onboarding distinguishes pending versus synced fields');
assert.match(onboarding,/setDraftConflict\(true\)/, 'onboarding never silently overwrites conflicting edits');
assert.match(draftUI,/const scope=\('profile-'\+role\)/, 'each professional role has its own cloud draft');
assert.match(draftUI,/nightjarProfileDrafts\.save\(scope,payload,revisionRef\.current\)/, 'role profile autosaves revisions');
assert.match(draftUI,/Use latest saved version/, 'the member can restore another device\'s changes');
assert.match(app,/await profileCloudDraftRef\.current\.flush\(\)/, 'role switching awaits cloud save');
assert.match(app,/await controller\.flush\(\)/, 'publishing profile awaits cloud draft');
assert.match(app,/profileCloudDraftRef\.current\.clear\(\)/, 'successful published profile clears its own draft');
assert.doesNotMatch(draftUI,/localStorage|sessionStorage/, 'cloud draft editor is not browser-local');

console.log('Nightjar profile persistence and optional @handle regression contracts passed.');
