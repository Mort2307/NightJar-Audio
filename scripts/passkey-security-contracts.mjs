import assert from 'node:assert/strict';
import fs from 'node:fs';

const functions = fs.readFileSync('functions/src/passkeys.ts', 'utf8');
const client = fs.readFileSync('src/platform/firebase-passkeys.ts', 'utf8');
const settings = fs.readFileSync('src/components/PasskeySettings.tsx', 'utf8');
const signin = fs.readFileSync('src/components/AccountAccess.tsx', 'utf8');
const packageJson = JSON.parse(fs.readFileSync('functions/package.json', 'utf8'));
const launch = fs.readFileSync('src/components/NightjarLaunchUnlock.tsx', 'utf8');
const main = fs.readFileSync('src/main.tsx', 'utf8');
const portal = fs.readFileSync('src/components/AccountPortal.tsx', 'utf8');
const preference = fs.readFileSync('src/platform/nightjar-quick-unlock.ts', 'utf8');
const css = fs.readFileSync('src/index.css', 'utf8');

assert.match(functions, /verifyRegistrationResponse\(/, 'passkey registration must be verified server-side');
assert.match(functions, /verifyAuthenticationResponse\(/, 'sign-in must verify an authenticator signature server-side');
assert.match(functions, /requireUserVerification: true/g, 'device user verification must be required');
assert.match(functions, /expectedOrigin:/, 'WebAuthn challenges must bind to HTTPS origin');
assert.match(functions, /expectedRPID:/, 'WebAuthn challenges must bind to RP ID');
assert.match(functions, /transaction.delete\(ref\)/, 'challenge must be one time');
assert.match(functions, /Number\(data.expiresAt\?\.toMillis\?\.\(\) \?\? 0\) < Date.now\(\)/, 'challenges expire');
assert.match(functions, /await assertAccountEligible\(uid\)/, 'passkey cannot bypass closed beta or suspended-user access checks');
assert.match(functions, /prior > 0 && next <= prior/, 'counter rollback is rejected');
assert.match(functions, /getAuth\(\).createCustomToken\(uid\)/, 'firebase credentials are issued only after signature verification');
assert.match(functions, /await recentVerifiedUser\(request\)/, 'enrollment and revocation require recent session');
assert.match(client, /navigator.credentials.create\(/, 'enrollment uses the native WebAuthn API');
assert.match(client, /navigator.credentials.get\(/, 'sign in uses the native WebAuthn API');
assert.match(client, /signInWithCustomToken\(/, 'real Firebase session is minted from verified custom token');
assert.match(settings, /nightjarAuth.reauthenticate\(password\)/, 'passkey changes need password reauthentication');
assert.match(signin, /nightjarPasskeys.signIn\(/, 'sign-in screen exposes real passkey flow');
assert.ok(packageJson.dependencies['@simplewebauthn/server'], 'a maintained WebAuthn verification library is installed');
// Launch-biometric regression checks: render before account or role workspaces.
assert.match(main, /<NightjarLaunchUnlock>\{isAccountPortal \? <AccountPortal \/> : <App \/>\}<\/NightjarLaunchUnlock>/, 'biometric screen wraps every interactive Nightjar route');
assert.match(launch, /nightjarPasskeys.signIn\(preference.userId, controller.signal\)/, 'launch verifies the actual enrolled Nightjar account');
assert.match(launch, /nightjarQuickUnlock.markUnlocked\(identity.userId\)/, 'only a verified assertion unlocks the session');
assert.match(client, /expectedUserId && result.user.uid !== expectedUserId/, 'the other account passkey must not open this member\'s session');
assert.match(client, /signOut\(firebaseAuth\)/, 'mismatched or cancelled sign-in must revoke the browser session');
assert.match(launch, /navigator.onLine/, 'offline passkey fallback has an explanation');
assert.match(launch, /await nightjarAuth.signOut\(\)/, 'password fallback clears existing Firebase session');
assert.match(launch, /window.location.replace\('\/account\?entry=signin'\)/, 'password fallback leads to the real account portal');
assert.match(portal, /markPasswordAuthenticated\(nextIdentity.userId\)/, 'password sign-in retains access across legitimate full page redirects');
assert.match(settings, /Ask for biometrics when Nightjar opens/, 'launch unlock is visibly opt-in on each device');
assert.match(settings, /nightjarQuickUnlock.disable\(uid\)/, 'users can disable launch biometrics');
assert.match(preference, /localStorage\.setItem\(preferenceKey/, 'launch opt-in is stored locally per device');
assert.match(preference, /sessionStorage\.setItem\(sessionKey/, 'full-page login redirects avoid looping back into unlock');
assert.match(css, /\.nj-launch-unlock\s*\{/, 'branded splash follow-up screen has dedicated styling');

console.log('Nightjar WebAuthn passkey security contracts passed (source checks only).');
