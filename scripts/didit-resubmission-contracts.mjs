import assert from 'node:assert/strict';
import fs from 'node:fs';

const backend=fs.readFileSync('functions/src/didit-resubmissions.ts','utf8');
const diditStarter=fs.readFileSync('functions/src/didit.ts','utf8');
const entry=fs.readFileSync('functions/src/index.ts','utf8');
const policy=fs.readFileSync('functions/src/didit-resubmission-guards.ts','utf8');
const member=fs.readFileSync('src/components/DiditDocumentResubmission.tsx','utf8');
const admin=fs.readFileSync('src/components/AdminDiditResubmissions.tsx','utf8');
const panel=fs.readFileSync('src/components/AdminDiditControlCentre.tsx','utf8');
const app=fs.readFileSync('src/App.tsx','utf8');
const api=fs.readFileSync('src/platform/firebase-didit-resubmission.ts','utf8');

assert.match(entry,/buildDiditResubmissionCallables\(/,'callables must be exposed');
assert.match(backend,/await deps\.requireActiveIdentity\(request\)/,'member status/request use trusted auth');
assert.match(backend,/deps\.requireAdminIdentity\(request\)/,'admin queue/review use server auth');
assert.match(backend,/if \(uid === admin\.uid\)/,'admin cannot approve their own request');
assert.match(backend,/item\.status !== 'requested' \|\| Number\(item\.revision\) !== revision/,'stale review rejected');
assert.match(backend,/tx\.update\(r,\{\s*status:'processing', claimId/,'atomic durable claim before provider call');
assert.match(backend,/MAX_PROVIDER_REQUESTS = 2/,'hard account/session provider cap');
assert.match(backend,/MAX_MEMBER_REQUESTS = 3/,'member request spam cap');
assert.match(backend,/explicitConsent !== true/,'member explicit consent');
assert.match(backend,/acknowledgedPossibleCharge !== true/,'admin cost acknowledgment');
assert.match(backend,/decision\.vendor_data !== uid/,'provider result is account bound');
assert.match(backend,/decision\.workflow_id !== data\.workflowId/,'provider result is workflow bound');
assert.match(backend,/decision\.session_kind !== 'user'/,'only individual KYC accepted');
assert.match(backend,/freshAge\.sessionId!==data\.sessionId/,'pre-write stale state rejected');
assert.match(backend,/isAccountBound\(uid,freshAge,freshSession\)/,'recheck account binding immediately before provider PATCH');
assert.match(backend,/new_status:'Resubmitted'/,'provider receives same-session resubmission');
assert.match(backend,/nodes_to_resubmit:\[\{node_id:selection\.nodeId,feature:'OCR'\}\]/,
  'only one provider-selected document OCR step may be repeated');
assert.match(backend,/send_email:false/,'no unreviewed provider email or PII disclosure');
assert.match(diditStarter,/if \(oldId && existing\.provider === 'didit' && existing\.environment === env\(\)\)/,
  'already linked checks cannot create a second billable provider session');
assert.match(app,/!\['FAIL','ABANDONED','EXPIRED','PENDING_REVIEW'\]\.includes\(ageProviderStatus\)/,
  'failed existing check must not show the start-new-check action');
assert.match(policy,/id\.status==='Approved'/,'approved ID missing DOB must halt');
assert.match(policy,/ids\.length!==1/,'ambiguous ID steps halt');
assert.match(policy,/id\.verification_method !== 'document'/,'no wallet/lookup repeat');
assert.match(policy,/lastProviderRequestMs\+24\*60\*60\*1000/,'24h cooldown');
assert.doesNotMatch(backend,/startDiditSession\(|\/v3\/session\/['"]\s*,\s*\{\s*method:'POST'/,
  'resubmissions never create new provider sessions');
assert.doesNotMatch(backend,/console\.(?:log|warn|error)|date_of_birth|document_number|source_image|face_image/,
  'never log or persist raw identity evidence');
assert.match(api,/myDiditResubmission/);
assert.match(api,/requestDiditResubmission/);
assert.match(api,/adminReviewDiditResubmission/);
assert.match(member,/Request document resubmission review/);
assert.match(member,/nightjarDiditResubmission\.request\(reason\)/);
assert.match(admin,/window\.confirm\(question\)/);
assert.match(admin,/Approve one ID resubmission/);
assert.match(panel,/<AdminDiditResubmissions \/>/);
assert.match(app,/<DiditDocumentResubmission \/>/);
assert.doesNotMatch(member,/startAgeAssurance|nightjarAge\.start|startDiditSession/,
  'member request must never start paid ID verification');
console.log('Safe Didit same-session resubmission contracts: PASS');
