import { readFileSync } from 'node:fs';

const read = (name) => readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const backend = read('functions/src/index.ts');
const app = read('src/App.tsx');
const adminApi = read('src/platform/firebase-administration.ts');
const accountApi = read('src/platform/firebase-account.ts');
const safety = read('src/components/AdminMemberSafety.tsx');
const privacy = read('src/legal/nightjarLegal.ts');
const errors = [];

const requireMatch = (value, rx, msg) => { if (!rx.test(value)) errors.push(msg); };

requireMatch(backend, /export const adminSetAccountSuspension = onCall/, 'admin suspension callable missing');
requireMatch(backend, /getAuth\(\)\.updateUser\(userId, \{ disabled: suspended \}\)/, 'Auth disable/enable missing');
requireMatch(backend, /getAuth\(\)\.revokeRefreshTokens\(userId\)/, 'Firebase token revocation missing');
requireMatch(backend, /status: 'suspended'/, 'Nightjar backend account lockout missing');
requireMatch(backend, /memberSecurityActions/, 'Administrator action audit missing');
requireMatch(backend, /ADMIN_EMAILS\.has\(cleanEmail\(authUser\.email\)\)/, 'Owner email safety guard missing');
requireMatch(backend, /Use the audited suspension control to restore this member first/, 'role status dropdown must not unsuspend');
requireMatch(backend, /export const memberAccessStatus = onCall/, 'live member access status missing');
requireMatch(backend, /const result = await setMemberSuspension\(/, 'security alert must use lockout helper');
requireMatch(safety, /type="search"/, 'member search field missing');
requireMatch(safety, /reason\.trim\(\)\.length < 12/, 'case-note prerequisite missing');
requireMatch(safety, /window\.confirm/, 'member action confirmation missing');
requireMatch(app, /<AdminMemberSafety/, 'Owner Safety panel is not mounted');
requireMatch(app, /setAccountSuspension\(/, 'App suspension callable not connected');
requireMatch(app, /nightjarAccount\.accessStatus\(\)/, 'active member session check missing');
requireMatch(app, /nightjarProtection\.record\(/, 'app security shortcut logging not connected');
requireMatch(adminApi, /adminSetAccountSuspension/, 'client administrative callable missing');
requireMatch(accountApi, /memberAccessStatus/, 'client session status callable missing');
requireMatch(privacy, /does not record general keystrokes/, 'privacy disclosure missing');
if (/keylog|logEveryKey|recordTypedMessage/i.test(app)) errors.push('unexpected raw keystroke instrumentation found');
if (errors.length) {
  console.error('Nightjar lockout contracts failed:\n' + errors.map(x => '- ' + x).join('\n'));
  process.exit(1);
}
console.log('Nightjar lockout contracts PASS');
