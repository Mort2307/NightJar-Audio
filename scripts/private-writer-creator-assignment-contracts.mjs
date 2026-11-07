import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const grid = read('src/components/WriterManuscriptGrid.tsx');
const composer = read('src/components/WriterCreatorAssignmentButton.tsx');
const hub = read('src/components/CollaborationHub.tsx');
const backend = read('functions/src/index.ts');

assert.match(grid, /WriterCreatorAssignmentButton/);
assert.match(composer, /Assign to Creator/);
assert.match(composer, /private_writer_assignment/);
assert.match(composer, /Choose the work arrangement/);
assert.match(composer, /clientRequestId/);
assert.match(composer, /Only the selected Creator/);
assert.match(composer, /No ownership transfer or payment is triggered/);
assert.match(composer, /allowOriginalExport/);
assert.match(backend, /assignmentType === 'private_writer_assignment'/);
assert.match(backend, /const recipientRoles = recipientData \? professionalRolesForAccount\(recipientData\)/);
assert.match(backend, /recipientRoles\.includes\('creator'\)/);
assert.match(backend, /savePrivateRecordOnce\(ref, record, 'writerUserId', identity\.uid, clientRequestId\)/);
assert.match(backend, /scriptVersion: Math\.max\(1, Number\(scriptData\.version \?\? 1\)\)/);
assert.match(backend, /scriptContentRevision: Math\.max\(0, Number\(scriptData\.contentRevision \?\? 0\)\)/);
assert.match(backend, /latest\.scriptContentRevision/);
assert.match(backend, /credits: assignmentType === 'private_writer_assignment'/);
assert.match(backend, /grantSource: 'private_writer_assignment'/);
assert.match(backend, /allowCopy: false/);
assert.match(backend, /allowExport: latest\.allowOriginalExport === true/);
assert.match(backend, /originalStoragePath && canReadOriginalFile/);
assert.match(backend, /private_assignment_withdrawn/);
assert.match(hub, /Open assigned manuscript/);
assert.match(hub, /nightjarScripts\.openProtected\(proposal\.scriptId\)/);
assert.match(hub, /PRIVATE SCRIPT ASSIGNMENT/);

console.log('Private Writer → Creator assignment source contracts passed.');
