import assert from 'node:assert/strict';
import fs from 'node:fs';

const member = fs.readFileSync('src/components/ProfessionalRoleManager.tsx', 'utf8');
const legalClient = fs.readFileSync('src/platform/firebase-legal.ts', 'utf8');
const backend = fs.readFileSync('functions/src/index.ts', 'utf8');
const css = fs.readFileSync('src/index.css', 'utf8');

// Current version, user-initiated consent; never silently check or accept terms.
assert.match(member, /nightjarLegal\.status\(\)/, 'member role upgrades load authoritative legal versions');
assert.match(member, /missingProfessionalTerms.*filter\(/s, 'only missing professional agreements are presented');
assert.match(member, /document\.requiredForProfessional && !document\.accepted/, 'agreements respect professional requirements');
assert.match(member, /if \(!legalDocuments\)/, 'unavailable legal status must fail closed for role upgrades');
assert.match(member, /if \(!termsConfirmed\)/, 'explicit member confirmation is mandatory');
assert.match(member, /nightjarLegal\.accept\(/, 'consent is recorded through server callable');
assert.match(member, /id, version, accepted: true as const/, 'the accepted agreement version is recorded');
assert.match(member, /'professional-role-upgrade'/, 'professional consent source is audited');
assert.match(member, /if \(!\(await acceptProfessionalTerms\(\)\)\) return;/, 'professional applications are gated on consent');
assert.match(member, /role !== 'listener' && !\(await acceptProfessionalTerms\(\)\)/, 'Listener access remains available when professional legal status is unavailable');
assert.match(member, /Your existing approved workspaces and Listener access are unchanged/, 'legal service outage does not hide saved professional roles');
assert.match(member, /type="checkbox" checked=\{termsConfirmed\}/, 'consent requires a user-controlled checkbox');
assert.match(member, /href=\{document\.path\}/, 'users can read each current version');
assert.match(member, /Retry legal status/, 'users can retry an unavailable legal service');
assert.match(legalClient, /'acceptLegalAgreements'/, 'acceptance uses the authenticated legal agreement endpoint');

const application = backend.split('export const submitProfessionalApplication = onCall')[1]?.split('export const removeProfessionalRole = onCall')[0] || '';
assert.ok(application, 'server-side application workflow exists');
assert.match(application, /requireProfessionalLegalTerms\(identity\.uid\)/, 'server independently requires contributor agreements');
const admin = backend.split('export const adminManageProfessionalRoles = onCall')[1]?.split('export const reviewProfessionalApplication = onCall')[0] || '';
assert.match(admin, /requireProfessionalLegalTerms\(userId\)/, 'administrator role grants cannot bypass member agreement');
assert.match(css, /\.professional-terms-consent input/, 'mobile-usable agreement control is styled');
console.log('Nightjar self-service professional agreement and role-upgrade contracts passed.');
