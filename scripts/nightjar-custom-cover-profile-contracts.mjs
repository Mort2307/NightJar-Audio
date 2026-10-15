import assert from 'node:assert/strict';
import fs from 'node:fs';

// Source contracts only: no user profile, upload, external API or deployment is invoked.
const backend=fs.readFileSync('functions/src/index.ts','utf8');
const publicProfile=fs.readFileSync('src/components/PublicProfile.tsx','utf8');
const creatorProfile=fs.readFileSync('src/components/CreatorProfile.tsx','utf8');
const studio=fs.readFileSync('src/components/UserProfileStudio.tsx','utf8');
const app=fs.readFileSync('src/App.tsx','utf8');
const media=fs.readFileSync('src/platform/firebase-media.ts','utf8');
const style=fs.readFileSync('src/index.css','utf8');
const optimizer=fs.readFileSync('src/platform/profile-image-optimizer.ts','utf8');

assert.match(backend,/type ModeratedImageKind = 'profile_avatar' \| 'profile_banner'/,'custom banner is a separate moderated asset type');
assert.match(backend,/kind === 'profile_avatar' \|\| kind === 'profile_banner'\s*\?\s*identity\.uid/,'only the signed-in member may claim a profile cover');
assert.match(backend,/pendingBannerAssetId:assetId, pendingBannerStatus:'pending'/,'new covers are held for moderation');
assert.match(backend,/profile\.data\(\)\?\.pendingBannerAssetId !== assetId/,'replaced or withdrawn covers cannot be approved later');
assert.match(backend,/bannerAssetId:assetId, bannerUrl:url, bannerStatus:'approved'/,'only approved cover is published');
assert.match(backend,/bannerUrl: data\.bannerStatus === 'approved' \? data\.bannerUrl \?\? null : null/,'nonapproved covers are never exposed publicly');
assert.match(backend,/export const removeProfileBanner = onCall/,'owners can withdraw their cover');
assert.match(backend,/asset\.data\(\)\?\.ownerUserId === identity\.uid && asset\.data\(\)\?\.kind === 'profile_banner'/,'removal is owner and kind scoped');
assert.match(backend,/\['cinematic','portrait','custom'\]\.includes\(String\(input\.headerImageMode\)\)/,'custom cover choice is saved server side');
assert.match(backend,/\['cinematic','portrait','custom'\]\.includes\(String\(data\.headerImageMode\)\)/,'custom choice is returned to visitors');
assert.match(studio,/name="nightjar-profile-cover" value="custom"/,'member can select independent cover');
assert.match(studio,/onUploadBanner\(file\)/,'member uploads cover through moderated uploader');
assert.match(studio,/onRemoveBanner\(\)/,'member can remove cover');
assert.match(app,/kind:'profile_banner'/,'member uploader uses the new moderated kind');
assert.match(optimizer,/purpose: 'portrait' \| 'banner'/,'banner gets separate optimised dimensions and metadata stripping');
assert.match(media,/removeProfileBanner/,'owner removal has a Firebase callable');
assert.match(publicProfile,/approvedProfessionalRoles/,'official creator badge is based on server-approved roles, not credits');
assert.match(publicProfile,/const bannerFromCustom = profile\?\.headerImageMode === 'custom' && Boolean\(profile\?\.bannerUrl\)/,'only selected, approved custom cover is displayed');
assert.match(publicProfile,/memberTagline/,'personal text is shown on the cover');
assert.match(publicProfile,/nj-full-profile-route/,'one-click public profile opens in a dedicated full-height surface');
assert.match(publicProfile,/root\.scrollTo/,'section buttons scroll the profile, not the page underneath');
assert.match(style,/creator-profile-backdrop\.nj-full-profile-route/,'full-height route styling exists');
assert.match(style,/:root\[data-nightjar-vision\]/,'accessibility mode retains its theme overrides');
assert.match(creatorProfile,/nj-legacy-official-moon/,'less-used creator route has an approved moon');
console.log('NightJar independent approved covers, official moons, private scroll and accessibility checks PASS.');
