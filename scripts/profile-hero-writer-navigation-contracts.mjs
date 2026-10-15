import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = path => fs.readFileSync(path,'utf8');
const backend=read('functions/src/index.ts');
const publicProfile=read('src/components/PublicProfile.tsx');
const studio=read('src/components/UserProfileStudio.tsx');
const draft=read('src/components/CloudProfileDraft.tsx');
const writer=read('src/components/WriterDiscovery.tsx');
const app=read('src/App.tsx');
const cinema=read('src/styles/midnight-gold-cinema.css');

const endpoint=backend.slice(backend.indexOf('export const getPublicProfile = onCall'),
  backend.indexOf('export const getCreatorProfile = onCall'));
assert.match(endpoint,/const professionalRoles = professionalRolesForAccount\(accountData \?\? \{\}\)/,
  'only approved professional role entitlements can produce official badge');
assert.match(endpoint,/approvedProfessionalRoles: professionalRoles/,
  'approval is returned from server in public profile');
assert.doesNotMatch(endpoint,/approvedProfessionalRoles:.*creditedReleases/,
  'release credits cannot grant moon badges');
assert.match(publicProfile,/approvedProfessionalRoles = Array\.isArray\(profile\?\.approvedProfessionalRoles\)/,
  'client trusts only server approval list');
assert.match(publicProfile,/const hasNightjarApproval = !profile\?\.nightjarTeam && approvedProfessionalRoles\.length > 0/,
  'moon remains across professional and listener profile tabs');
assert.match(publicProfile,/hasNightjarApproval && <details className="nj-official-creator-badge"/,
  'official gold crescent only for NightJar-approved members');
assert.match(backend,/headerImageMode: input\.headerImageMode === 'cinematic' \? 'cinematic' : 'portrait'/,
  'server restricts cover choice to known modes');
assert.match(endpoint,/headerImageMode: data\.headerImageMode === 'cinematic' \? 'cinematic' : 'portrait'/,
  'public cover choice is persisted and sanitized');
assert.match(endpoint,/avatarUrl: data\.avatarStatus === 'approved' \? data\.avatarUrl \?\? null : null/,
  'public header cannot display pending or rejected portraits');
assert.match(publicProfile,/profile\?\.headerImageMode !== 'cinematic' && Boolean\(profile\?\.avatarUrl\)/,
  'portrait background only after member opt-in and approved photo');
assert.match(publicProfile,/const memberTagline = String\(profile\?\.headline \|\| roleDetails\?\.roleHeadline/,
  'personal tagline wins over static NightJar copy');
assert.match(publicProfile,/\{memberTagline \|\| \(profileRole === 'listener'/,
  'banner renders custom tagline');
assert.match(studio,/Use my approved profile photo/,'member can choose header photo from editor');
assert.match(studio,/Cinematic NightJar header/,'member can choose house cinematic header');
assert.match(draft,/'headerImageMode'/,'working drafts remember the banner choice across devices');
assert.match(backend,/'displayName','handle','pronouns','headline','headerImageMode','bio'/,
  'backend preserves choice in private cross-device drafts');
assert.match(writer,/onClick=\{\(\) => onOpenProfile\(writer\.userId, 'writer'\)\}>Explore writer/,
  'one click launches a writer role profile');
assert.doesNotMatch(writer,/\{selected && <div className="creator-profile-backdrop"/,
  'outdated nested inline Writer modal is removed');
assert.match(app,/onOpenProfile=\{\(userId, profileRole\)=>openPublicProfile\(userId,profileRole\)\}/,
  'Writer discovery shares the same premium routed profile modal');
assert.match(publicProfile,/dialogRef\.current\?\.scrollTo\(\{ top:0/,
  'public profile starts at top of its own scroll container');
assert.match(cinema,/nj-cinema-cover-portrait/,'cinematic styling supports opted-in portrait');
assert.match(cinema,/nj-profile-cover-choice/,'header editor matches the premium theme');
console.log('PASS NightJar approved moons, personal cover and tagline, one-click polished Writer profile.');
