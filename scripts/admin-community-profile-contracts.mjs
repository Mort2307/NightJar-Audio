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

// Owner inspection is explicitly requested, server-authorised and audit logged.
// Ordinary public directory and profile requests cannot opt into this view.
const communityClient = read('src/platform/firebase-community.ts');
const ownerViewer = read('src/components/AdminLiveProfileViewer.tsx');
const workflow = read('.github/workflows/firebase-hosting-merge.yml');
assert.match(detail,/ownerPreview = input\.ownerPreview === true/,'preview opt-in must be explicit');
assert.match(detail,/if \(ownerPreview && !identity\.admin\)/,'only server-authenticated owners may override visibility');
assert.match(detail,/!ownerPreview && accountData\?\.status !== 'active'/,'inactive profiles remain hidden from members');
assert.match(detail,/!ownerPreview && \(nightjarTeam \? data\.adminCommunityVisible !== true : data\.publicProfile === false\)/,'private visibility remains enforced for members');
assert.match(detail,/db\.collection\('adminProfilePreviewAudit'\)\.add/,'every owner preview is audit logged');
assert.match(detail,/ownerOnlyPreview: true, accountStatus:/,'owner view identifies itself to its display');
assert.doesNotMatch(detail,/\b(?:passwordHash|authToken|securityEvents|verificationEvidence):\s/,'owner view must not expose private data');
assert.match(communityClient,/ownerPreview \? \{ ownerPreview: true \}/,'client must not request private inspection without explicit owner mode');
assert.match(ownerViewer,/getPublicProfile\(id, true\)/,'owner viewer uses protected inspection mode');
assert.match(ownerViewer,/readOnlyPreview\s+ownerOnlyPreview/,'full profile remains read only');
assert.match(publicProfile,/readOnlyPreview && ownerOnlyPreview/,'profile detail uses protected server gate');
assert.match(publicProfile,/!profile \|\| readOnlyPreview/,'owner preview cannot use share actions');
assert.match(workflow,/\[nightjar-owner-private-profile-release\]/,'backend-first deployment gate must be deliberate');
assert.match(workflow,/inputs\[function_names\]=getPublicProfile/,'deploy only the modified profile callable');

const follow = section('export const setProfileFollow = onCall', 'export const setFavouriteRelease = onCall');
assert.match(follow, /profile\.data\(\)\?\.adminCommunityVisible !== true/,
  'Following a private team profile must remain impossible');

assert.match(profileEditor, /checked=\{discoverable\}/);
assert.match(profileEditor, /adminCommunityVisible:event\.target\.checked/);
const contextualHelp = read('src/components/ContextHelp.tsx');
assert.match(profileEditor, /ContextHelp topic="team-profile-visibility"/, 'the opt-in privacy explanation remains accessible');
assert.match(contextualHelp, /Your administrator profile is private by default/, 'visibility defaults are explained in contextual help');
assert.match(app, /nightjarTeam:item\.nightjarTeam === true/);
assert.match(app, /profile\.adminCommunityVisible === true/);
assert.match(directory, /Official Nightjar Team/);
assert.match(publicProfile, /Official Nightjar Team/);

console.log('Nightjar opt-in administrator community profile privacy contracts passed.');
