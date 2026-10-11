import assert from 'node:assert/strict';
import fs from 'node:fs';

const functions = fs.readFileSync('functions/src/passkeys.ts', 'utf8');
const client = fs.readFileSync('src/platform/firebase-passkeys.ts', 'utf8');
const settings = fs.readFileSync('src/components/PasskeySettings.tsx', 'utf8');
const signin = fs.readFileSync('src/components/AccountAccess.tsx', 'utf8');
const packageJson = JSON.parse(fs.readFileSync('functions/package.json', 'utf8'));

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

console.log('Nightjar WebAuthn passkey security contracts passed (source checks only).');
