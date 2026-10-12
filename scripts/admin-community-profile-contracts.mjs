import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const backend = read('functions/src/index.ts');
const profileEditor = read('src/components/UserProfileStudio.tsx');
const publicProfile = read('src/components/PublicProfile.tsx');
const directory = read('src/components/ProfessionalLibrary.tsx');
const app = read('src/App.tsx');
const section = (start, end) => {
  const after = backend.split(start)[1];
  assert.ok(after, 'Missing backend section: ' + start);
  const body = after.split(end)[0];
  assert.ok(body, 'Missing backend section terminator: ' + end);
  return body;
};

// Admin publication must be an entirely separate, explicit opt-in. A historic
// publicProfile:true value must NEVER publish an administrator automatically.
const save = section('export const saveMyProfile = onCall', 'const publicProfilePayload =');
assert.match(save, /publicProfile: profileRole === 'admin' \? false : input\.publicProfile !== false/);
assert.match(save, /adminCommunityVisible: identity\.admin && input\.adminCommunityVisible === true/);

const payload = section('const publicProfilePayload =', 'const publicProfileForAccount =');
assert.match(payload, /nightjarTeam = accountData\.role === 'admin'/);
assert.match(payload, /nightjarTeam \? data\.adminCommunityVisible !== true : data\.publicProfile === false/);
assert.match(payload, /roles: nightjarTeam \? \['listener'\] : \['listener', \.\.\.roles\]/);
assert.doesNotMatch(payload, /\b(?:email|passwordHash|authToken|adminPermissions|securityEvents):\s/,
  'Public payload must never expose administrator-only data');

const listing = section('export const listPublicProfiles = onCall', 'export const getPublicProfile = onCall');
assert.match(listing, /nightjarTeam \? data\.adminCommunityVisible !== true : data\.publicProfile === false/);
assert.match(listing, /roles: nightjarTeam \? \['listener'\] : \['listener', \.\.\.professionalRoles\]/);
assert.match(listing, /nightjarTeam,/);

const detail = section('export const getPublicProfile = onCall', 'export const getCreatorProfile = onCall');
assert.match(detail, /nightjarTeam \? data\.adminCommunityVisible !== true : data\.publicProfile === false/);
assert.match(detail, /roles: nightjarTeam \? \['listener'\] : \['listener', \.\.\.professionalRoles\]/);
assert.match(detail, /nightjarTeam,/);

const follow = section('export const setProfileFollow = onCall', 'export const setFavouriteRelease = onCall');
assert.match(follow, /profile\.data\(\)\?\.adminCommunityVisible !== true/,
  'Following a private team profile must remain impossible');

assert.match(profileEditor, /checked=\{discoverable\}/);
assert.match(profileEditor, /adminCommunityVisible:event\.target\.checked/);
assert.match(profileEditor, /Off by default/);
assert.match(app, /nightjarTeam:item\.nightjarTeam === true/);
assert.match(app, /profile\.adminCommunityVisible === true/);
assert.match(directory, /Official Nightjar Team/);
assert.match(publicProfile, /Official Nightjar Team/);

console.log('Nightjar opt-in administrator community profile privacy contracts passed.');
