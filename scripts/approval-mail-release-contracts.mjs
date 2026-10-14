import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const backend = readFileSync('functions/src/index.ts', 'utf8');
const workflow = readFileSync('.github/workflows/firebase-hosting-merge.yml', 'utf8');
const writer = readFileSync('src/components/WriterRightsPanel.tsx', 'utf8');
const app = readFileSync('src/App.tsx', 'utf8');

assert.match(backend, /export const sendProfessionalApprovalEmail = onDocumentCreated/);
assert.match(backend, /sendProfessionalApprovalEmailForEvent/);
assert.match(backend, /export const adminRetryProfessionalApprovalEmail = onCall/);
assert.match(workflow, /\[nightjar-approval-mail-release\]/);
assert.match(workflow, /sendProfessionalApprovalEmail,adminRetryProfessionalApprovalEmail/);
assert.match(workflow, /inputs\[scope\]=functions:selected/);
assert.match(workflow, /gh run watch "\$BACKEND_RUN_ID"/);
assert.match(workflow, /Release approval mail functions before Hosting/);
assert.match(backend, /const CLOSED_BETA = true;/);
assert.doesNotMatch(backend, /TESTING_AGE_ASSURANCE_BYPASS/, 'Tester bypass must not grant adult content access');

assert.match(writer, /submitForNightJarReview/);
assert.match(writer, /await nightjarScripts\.updateRights\(script\.id/);
assert.match(writer, /await submitManuscript\(\)/);
assert.match(writer, /List approved script for creators/);
assert.match(app, /submitManuscript=\{submitWriterScript\}/);
assert.match(app, /Review rights & submit/);
assert.match(app, /await nightjarScripts\.update\(writerSelected\.id/);
assert.match(app, /result\.script\?\.status !== 'Submitted'/);
assert.doesNotMatch(app, /onClick=\{\(\)=>void submitWriterScript\(\)\}/);

console.log('One-path Writer UX, beta gates and tagged approval-mail release contracts PASS');
