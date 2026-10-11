import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=(file)=>fs.readFileSync(path.join(root,file),'utf8');
const sw=read('public/service-worker.js');
const app=read('src/App.tsx');
const protection=read('functions/src/index.ts');
const accountAccess=read('src/components/AccountAccess.tsx');
const authSecurity=read('src/platform/firebase-auth-security.ts');
const pwa=read('src/platform/pwa.ts');
const vite=read('vite.config.ts');
const hosting=read('firebase.json');
const failures=[];

if (!sw.includes("url.pathname.startsWith('/assets/')")) failures.push('service worker must explicitly restrict static-asset caching');
if (/caches\.put\([^\n]*(script|manuscript|account|profile|firebase|functions)/i.test(sw)) failures.push('service worker appears to cache protected/dynamic Nightjar data');
if (!app.includes('possible_screenshot_key')) failures.push('protected reader possible screenshot signal is missing');
if (!app.includes('possible_capture_shortcut')) failures.push('protected reader capture-shortcut signal is missing');
if (!app.includes('native_screenshot_detected')) failures.push('native screenshot bridge event is missing');
if (!protection.includes('detectionConfidence')) failures.push('server protection evidence confidence classification is missing');
if (!protection.includes('no automatic') && !app.includes('no automatic freeze') && !read('src/components/SecurityEvidenceReview.tsx').includes('Human review only')) failures.push('human-review security principle must remain visible in security evidence UI');
if (!protection.includes('recordAuthenticationAttempt')) failures.push('authentication-attempt backend logging is missing');
if (!protection.includes('passwordCaptured: false')) failures.push('authentication security records must explicitly state that passwords are not captured');
if (!protection.includes("category: 'authentication'")) failures.push('authentication alerts must remain a distinct security-alert category');
if (!accountAccess.includes('nightjarAuthSecurity.recordFailure')) failures.push('Nightjar account portal is not reporting observed failed sign-ins');
if (!authSecurity.includes('nightjar_client_observed')) failures.push('authentication evidence quality must be explicit about client-observed scope');
if (!pwa.includes("fetch('/version.json")) failures.push('manual update check must compare against the deployed build manifest');
if (!vite.includes("fileName: 'version.json'")) failures.push('Nightjar build must emit the update version manifest');
if (!hosting.includes('"source": "/version.json"') || !hosting.includes('no-store,max-age=0,must-revalidate')) failures.push('version manifest must be served without cache');

const evidenceReview=read('src/components/SecurityEvidenceReview.tsx');
if (!protection.includes('authorisedTarget') || !protection.includes('getAuth().getUser(targetUid)')) failures.push('authenticated target resolution must be server-side');
if (!protection.includes("requireAdminIdentity(request);") || !protection.includes("const eligible = authUser.emailVerified === true")) failures.push('authorised outreach requires authenticated administrators and verified account');
if (!protection.includes('closedBetaAccessFor(email, account)')) failures.push('contact information must be gated by current closed-beta permission');
if (!protection.includes("account.status !== 'suspended'")) failures.push('suspended members must not be eligible for routine outreach');
if (!protection.includes('authUser.disabled !== true')) failures.push('disabled Firebase accounts must not receive authorised outreach status');
if (!protection.includes('matchesTarget') || !protection.includes("alertData.emailHash")) failures.push('contact details must match the targeted email hash');
if (!protection.includes('email: eligible ? email : null')) failures.push('unapproved accounts must not disclose contact emails');
if (!evidenceReview.includes("authorisedTarget?.eligible")) failures.push('support contact link must be shown only for authorised registered targets');
if (!evidenceReview.includes('person who entered the credentials')) failures.push('UI must distinguish account owner from actor');
if (!evidenceReview.includes('<details className="nj-evidence-technical">')) failures.push('technical evidence must be collapsed by default');
if (!evidenceReview.includes('Please do not send your password')) failures.push('support email must not solicit credentials');

const assistance = read('src/components/AdminAssistance.tsx');
const assistanceClient = read('src/platform/firebase-account-assistance.ts');
const workspaceNav = read('src/components/AdminWorkspaceTabs.tsx');
if (!protection.includes('export const adminAccountAssistanceLookup = onCall') || !protection.includes('export const adminSendAccountAssistanceEmail = onCall')) failures.push('Owner account assistance endpoints must be implemented.');
if (!protection.includes('const assistanceContactTarget = async') || !protection.includes('const administrator = ADMIN_EMAILS.has(email)')) failures.push('Owner/admin identities must not be assisted through member recovery.');
if (!protection.includes('const admin = requireAdminIdentity(request);') || !protection.includes('memberRequested !== true')) failures.push('Account recovery email must require an owner and a confirmed member request.');
if (!protection.includes('target.canReset') || !protection.includes('target.canVerify') || !protection.includes('!target.registered')) failures.push('Account recovery must enforce current verified eligibility.');
if (!protection.includes('await gmailAccessToken()') || !protection.includes('generatePasswordResetLink') || !protection.includes('generateEmailVerificationLink')) failures.push('Recovery links must be generated on the server and sent through Nightjar Mail.');
if (!protection.includes('adminAssistanceEvents') || !protection.includes('lastSentAtMs') || !protection.includes('count >= 3')) failures.push('Recovery email requests require rate limiting and a durable audit trail.');
if (!assistance.includes('window.confirm(') || !assistance.includes('I confirm the actual account holder')) failures.push('Owner must confirm a member assistance request.');
if (!assistance.includes('no supported administrator') || !assistance.includes('Nightjar currently flags repeated failures')) failures.push('Assistance must not promise Firebase unlock or claim an invented 24-hour Nightjar lockout.');
if (!assistanceClient.includes('adminAccountAssistanceLookup') || !workspaceNav.includes("id: 'assistance'") || !app.includes("<AdminAssistance initialEmail=")) failures.push('Admin Assistance must be accessible through a dedicated Owner workspace.');

const loginLog = read('src/components/AdminAuthenticationLog.tsx');
const preview = read('src/components/AdminLiveMarketplacePreview.tsx');
if (!app.includes('<AdminAuthenticationLog') || !loginLog.includes('What happened?') || !loginLog.includes('What should you do?')) failures.push('Login failures must be explained through account-centred, plain-English cases');
if (!loginLog.includes('event.targetKey || event.id') || loginLog.includes('event.targetEmailMasked || event.id')) failures.push('Login grouping must never merge different emails sharing the same mask');
if (!protection.includes('targetKey: cleanText(data.emailHash') || !protection.includes('accountOwnerByTarget.get(event.targetKey)')) failures.push('Admin account log must group safely and expose verified registered members only');
if (!protection.includes('authUser.emailVerified') || !protection.includes('getAuth().getUser(uid)') || !protection.includes('closedBetaAccessFor(email, accountSnapshot.data()')) failures.push('Admin login contact fields must be gated by current verification and approved access');
if (!loginLog.includes('onAssistance(g.owner!.email)')) failures.push('Known members should link to secure assistance rather than receive an automatic reset');
if (!loginLog.includes('<details className="nj-auth-records">') || !loginLog.includes('<summary>Technical details</summary>')) failures.push('Raw authentication diagnostics must be collapsed by default');
if (!preview.includes('nj-script-visibility-info')) failures.push('Script visibility cards must have a full-width diagnostic body');

if (failures.length) {
  console.error('SECURITY CONTRACT FAILURES');
  failures.forEach((failure)=>console.error('-',failure));
  process.exit(1);
}
console.log('Nightjar security contracts passed.');
