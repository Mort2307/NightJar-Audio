// Pure source contracts for exact, allowlisted Didit issue feedback.
// No KYC API calls, Firebase writes, signed-session creation or paid checks.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(path, 'utf8');
const didit=read('functions/src/didit.ts');
const backend=read('functions/src/index.ts');
const client=read('src/platform/firebase-didit-controlled.ts');
const guidance=read('src/platform/didit-member-guidance.ts');
const owner=read('src/components/AdminDiditMemberOps.tsx');
const workflow=read('.github/workflows/firebase-hosting-merge.yml');
const source=didit.slice(didit.indexOf('const DIDIT_MEMBER_SAFE_WARNINGS'),didit.indexOf('// Confirm adulthood from approved'));
for(const name of ['DOCUMENT_EXPIRED','COULD_NOT_RECOGNIZE_DOCUMENT','DOCUMENT_TYPE_NOT_SUPPORTED','NO_FACE_DETECTED','LOW_FACE_MATCH_SIMILARITY'])
  assert.ok(source.includes(name), 'safe warning allowlist missing '+name);
for(const sensitive of ['LIVENESS_FACE_ATTACK','POSSIBLE_MATCH_FOUND','MRZ_VALIDATION_FAILED','date_of_birth','document_number','fraud_score'])
  assert.doesNotMatch(source,new RegExp(sensitive),'never expose risky or identity-specific provider codes');
assert.match(source,/DIDIT_MEMBER_SAFE_WARNINGS\.has\(code\)/,'only exact allowed warnings pass');
assert.match(source,/\['id_verifications', 'liveness_checks', 'face_matches'\]/,'derive from check-specific warnings, not overall verdict');
assert.match(didit,/memberIssueCodes: value\.decision && typeof value\.decision === 'object'/,'warning derivation occurs in signed event reader');
assert.match(didit,/diditMemberWarningCodesFromDecision\(value\.decision\)/);
assert.match(didit,/uid !== payload\.vendorData/,'signed event must still match account binding');
assert.match(didit,/memberIssueCodes: \[\]/,'new checks clear stale reasons');
assert.match(didit,/approved \? \{memberIssueCodes: \[\]\}/,'approvals clear old failures');
assert.match(backend,/diditSafeMemberWarningCodes\(age\.data\(\)\?\.memberIssueCodes\)/,'member status uses the approved server-side allowlist');
assert.match(backend,/providerVerified \? \[\] :/,'verified accounts must not display stale fail codes');
assert.match(backend,/verificationIssues, publicVerificationPaused/,'status endpoint returns sanitised warning codes');
assert.match(backend,/verificationIssues: verified \? \[\] : diditSafeMemberWarningCodes\(age\.memberIssueCodes\)/,'admin case uses same safe mapping');
assert.match(client,/verificationIssues\?: string\[\]/,'client does not accept arbitrary raw provider data');
assert.match(client,/providerStatus\?: string/,'real backend state can be explained');
assert.match(guidance,/providerGuidance\[code\]/,'member labels are taken from an explicit code map');
assert.match(owner,/safeAdminIssueLabels/,'owner can inspect actionable safe warnings');
assert.match(workflow,/\[nightjar-didit-member-reasons-release\]/,'backend-first deploy gate exists');
assert.match(workflow,/diditWebhook,processDiditWebhook,myDiditControlledCheck,adminInspectDiditMemberCase/,'signed reader and client reader deploy together');
console.log('Didit member warning classification, privacy minimisation and release ordering contracts PASS.');
