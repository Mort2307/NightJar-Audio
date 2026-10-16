import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const backend = readFileSync(new URL('../functions/src/index.ts', import.meta.url), 'utf8');
const directory = readFileSync(new URL('../src/components/ProfessionalLibrary.tsx', import.meta.url), 'utf8');
assert.match(backend, /approvedProfessionalRoles: nightjarTeam \? \[\] : professionalRoles,/);
assert.match(directory, /Array\.isArray\(person\.approvedProfessionalRoles\) && person\.approvedProfessionalRoles\.length > 0/);
assert.doesNotMatch(directory, /category!==['"]listener['"] && belongsToLibraryCategory\(person,category\)/);
console.log('PASS: directory official moon depends on server-derived professional approval');
