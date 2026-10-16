// No paid ID sessions, Firestore writes, provider APIs, or deployment.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const fn=read('functions/src/verified-credits.ts');
const index=read('functions/src/index.ts');
const client=read('src/platform/firebase-verified-credits.ts');
const workspace=read('src/components/VerifiedCreditWorkspace.tsx');
const app=read('src/App.tsx');
const rules=read('firestore.rules');
const indexes=JSON.parse(read('firestore.indexes.json'));
const hosting=read('.github/workflows/firebase-hosting-merge.yml');
const domain=read('src/platform/verified-credit.ts');
const backendWorkflow=read('.github/workflows/firebase-backend-deploy.yml');
const requirePattern=(source,pattern,label)=>assert.match(source,pattern,label);
for(const [pattern,label] of [
  [/tx\.create\(lock/, 'atomic slot lock'],
  [/tx\.create\(auditRef\(id\)/, 'append-only transition audit'],
  [/uploaderUserId !== identity\.uid/, 'uploader identity from verified auth'],
  [/claimantUserId !== identity\.uid/, 'invited member identity from verified auth'],
  [/requireAdmin\(request\)/, 'independent administrative authorisation'],
  [/\[data\.claimantUserId,data\.uploaderUserId\]\.includes\(identity\.uid\)/, 'no self-approval'],
  [/requireAgeVerified\(identity\.uid\)/, 'adult account gating'],
  [/state:'awaiting_member'/, 'uploader invitation persists awaiting member acceptance'],
  [/member_appeal/, 'appeal action recorded'],
  [/notifyCredit\(invitedUserId/, 'invitation notifies actual member'],
  [/notifyReviewers\(id,'ready_for_review'/, 'admin review actionable notification'],
  [/notifyReviewers\(id,'appeal_requested'/, 'appeal notifies independent reviewers'],
  [/notifyCredit\(claimant,id,'uploader_'/, 'uploader response notifies claimant'],
  [/type:'verified_credit'/, 'credit-specific actionable notification type'],
  [/getCreditClaim = onCall/, 'direct-link lookup is account scoped'],
  [/if \(data\.claimantUserId !== identity\.uid && data\.uploaderUserId !== identity\.uid\)/, 'target lookup nonparticipant guard'],
  [/query\.startAfter\(previous\)/, 'paginated owner queue'],
  [/const page = ordered\.slice\(0,50\)/, 'paginated member queue'],
]) requirePattern(fn,pattern,label);
for(const marker of ['getCreditClaim','inviteCreditedContributor','respondToCreditInvitation','appealCreditClaim','adminReviewCreditClaim']) {
  assert.ok(index.includes(marker)&&client.includes(marker),'Callable/client wiring missing: '+marker);
}
requirePattern(index,/createNotification,\s*async \(\) => \{/, 'reuse existing NightJar notification writer');
requirePattern(index,/ADMIN_EMAILS\.has\(cleanEmail\(account\.email\)\)/,'send owner reviews only to server-listed admins');
requirePattern(index,/where\('state','==','approved'\)/,'public credits must originate from approvals');
requirePattern(app,/item\.type === 'verified_credit'/,'notification opens verified credit route');
requirePattern(app,/target\.pathname === '\/admin\/workspace\/content' && canAdmin/,'owner link remains permission-gated');
requirePattern(app,/target\.pathname === '\/profile'/,'member credit deep link supported');
requirePattern(workspace,/verifiedCreditApi\.getClaim\(focusedClaimId\)/,'direct links work for historical claims outside first page');
requirePattern(workspace,/verifiedCreditApi\.invitationResponse/,'invite acceptance and decline supported');
requirePattern(workspace,/verifiedCreditApi\.appeal/,'correction appeal interface');
requirePattern(workspace,/nextCursor&&<button/,'pagination controls present');
requirePattern(domain,/awaiting_member/,'domain states match live backend');
assert.doesNotMatch(domain,/awaiting_contributor/,'legacy states must not leak into frontend');
requirePattern(rules,/match \/\{document=\*\*\} \{\s*allow read, write: if false;/,'firestore denies direct client writes');
const want=[
  'claimantUserId:ASCENDING,createdAt:DESCENDING',
  'uploaderUserId:ASCENDING,createdAt:DESCENDING',
  'claimantUserId:ASCENDING,state:ASCENDING,approvedAt:DESCENDING',
];
const actual=indexes.indexes.map(i=>i.collectionGroup==='verifiedCreditClaims'?i.fields.map(f=>f.fieldPath+':'+f.order).join(','):'');
for(const key of want) assert.ok(actual.includes(key),'Missing composite index '+key);
requirePattern(hosting,/Deploy verified credits indexes and functions before Hosting/,'release must deploy credits backend-first');
requirePattern(hosting,/deploy_credit_batch 'firestore:indexes'/,'release indexes before callables');
requirePattern(hosting,/deploy_credit_batch 'functions:selected'/,'release callables before hosting');
assert.ok(backendWorkflow.includes('firestore-index-preservation-guard.mjs'),'prevent deletion of existing production indexes');
assert.match(backendWorkflow,/REQUESTED_SCOPE\" == \"functions\" \|\|/,'full policy change must be released using scoped batches');
assert.match(backendWorkflow,/batch_size=10/,'all-functions release uses small verified batches');
assert.match(backendWorkflow,/read -r -a targets <<< \"\$DEPLOY_SCOPE\"/,'full functions deploy enumerates exact non-deleting targets');
// The Github PR preview workflow runs on main; CI must explicitly parse the
// PR version of the production workflow or malformed YAML can go unnoticed.
const diditStage=hosting.slice(hosting.indexOf('name: Enforce mandatory approved Didit access before Hosting'),
  hosting.indexOf('# Staged account-wide release.'));
assert.match(diditStage,/git show HEAD\^:functions\/src\/index\.ts/,'Didit policy transitions must auto-trigger complete backend release');
assert.match(diditStage,/current_paused/,'current age-verification switch is inspected');
assert.match(diditStage,/old_bypass/,'legacy tester bypass transition is inspected');
assert.match(diditStage,/DIDIT_VERIFICATION_PAUSED = false/,'mandatory Didit gate must be enabled before deploying');
assert.match(diditStage,/inputs\[scope\]=functions/,'global Didit policy change requires every protected function');
assert.equal((hosting.match(/      - name: Deploy Hosting live/g)??[]).length,1,'exactly one live Hosting deploy step');
assert.equal((hosting.match(/      - name: Deploy verified credits indexes and functions before Hosting/g)??[]).length,1,'exactly one credit backend deploy step');
assert.ok(hosting.indexOf('name: Deploy verified credits indexes and functions before Hosting') <
          hosting.indexOf('name: Deploy Hosting live'),'credit backend must deploy ahead of Hosting');
assert.match(read('.github/workflows/nightjar-pr-preflight.yml'),/ruby -r yaml -e/,'CI must parse production workflow YAML');
assert.ok(backendWorkflow.includes('prepare-safe-firestore-indexes.mjs'),'production indexes are merged additively before deploy');
assert.ok(backendWorkflow.includes('verified-credit-index-readiness.mjs'),'indexes must be READY before changing backends');
assert.ok(hosting.indexOf('name: Deploy verified credits indexes and functions before Hosting') <
    hosting.indexOf('name: Enforce mandatory approved Didit access before Hosting'),
    'credit indexes must be READY before deploying the global verified-18+ Cloud Functions batch');
console.log('Nightjar verified-credit release contract PASS: identity, permissions, notifications, navigation, pagination, indexes, backend-first release.');
