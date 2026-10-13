import assert from 'node:assert/strict';
import fs from 'node:fs';

const access = fs.readFileSync('src/components/AccountAccess.tsx', 'utf8');
const portal = fs.readFileSync('src/components/AccountPortal.tsx', 'utf8');
const auth = fs.readFileSync('src/platform/firebase-auth.ts', 'utf8');

assert.match(access, /<form className="account-access-card" onSubmit=/, 'login must submit via Enter as well as tapping the action');
assert.match(access, /type="submit" className="primary-button account-access-submit"/, 'primary auth action must be a genuine submit');
assert.doesNotMatch(access, /type="submit" className="primary-button account-access-submit"[^>]*onClick=\{submit\}/, 'avoid submitting twice');
assert.match(access, /name="email" type="email" inputMode="email" autoComplete="email"/, 'mobile keyboard and autofill must work');
assert.match(access, /name="password" required type=\{showPassword/, 'password managers must recognize the sign-in field');
assert.match(access, /autoComplete=\{mode === 'register' \? 'new-password' : 'current-password'\}/, 'registration must not suggest existing passwords');
assert.match(access, /rememberedEmailKey = 'nightjar\.auth\.remembered-email\.v1'/, 'remembering email should be deliberate');
assert.match(access, /if \(rememberEmail\) window\.localStorage\.setItem\(rememberedEmailKey, email\.trim\(\)\)/, 'remember only the email');
assert.doesNotMatch(access, /localStorage\.setItem\([^\n]*password/i, 'never save a password to localStorage');
assert.match(access, /firebaseErrorCode\(error\) !== 'auth\/user-not-found'/, 'password reset must avoid account enumeration');
assert.match(access, /Use a different email address/, 'unverified accounts need a clear account-switch route');
assert.match(access, /<details className="account-workspace-overview"/, 'workspace marketing should not push sign-in out of view');
assert.match(portal, /setAuthReady\(true\)/, 'wait for persisted Firebase authentication to hydrate');
assert.match(portal, /authReady && !identity\?\.emailVerified/, 'avoid showing a false logged-out state');
assert.match(portal, /Retry opening my account/, 'backend hiccups must be recoverable without changing password');
assert.match(auth, /browserLocalPersistence/, 'keep users signed in across reloads where supported');

console.log('Nightjar authentication, recovery and session UX contracts passed.');
