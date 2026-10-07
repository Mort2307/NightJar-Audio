import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=(file)=>fs.readFileSync(path.join(root,file),'utf8');
const failures=[];
const requireText=(source,text,label)=>{if(!source.includes(text))failures.push(label);};

const functions=read('functions/src/index.ts');
const app=read('src/App.tsx');
const publicProfile=read('src/components/PublicProfile.tsx');
const roleProfile=read('src/components/RoleProfileExtension.tsx');
const updater=read('src/platform/pwa.ts');
const updateUi=read('src/components/AppUpdateControl.tsx');
const productExperience=read('src/components/ProductExperience.tsx');
const mobileNav=read('src/components/MobileNavigation.tsx');
const css=read('src/index.css');
const firestore=read('firestore.rules');
const storage=read('storage.rules');
const indexes=read('firestore.indexes.json');
const accountPortal=read('src/components/AccountPortal.tsx');

requireText(functions,"roles: ['listener', ...professionalRoles]",'Public profiles must preserve Listener alongside professional roles.');
requireText(functions,'publicRoleProfiles.listener?.featuredPortfolioIds','Detailed public profiles must use the Listener role slice for public playlists.');
requireText(functions,'listenerProfile.featuredPortfolioIds ?? profileData.featuredPortfolioIds','Listener library must use Listener role curation rather than the active professional portfolio.');
requireText(functions,'roleProfiles.listener = {','Listener playlist visibility must write to the Listener role slice.');
requireText(functions,'releaseCreditMatchesProfileRole','Writer and Editor release credits must be isolated by professional role.');
requireText(functions,'featuredWorkByRole','Public professional curation must remain role-addressable on multi-role accounts.');
requireText(publicProfile,'roleFeaturedWork','Public profile tabs must render their own featured professional work.');
requireText(accountPortal,"account.role === 'artist'",'Artist account portal routing is missing.');
requireText(accountPortal,"chooseRole('artist')",'Legacy Artist workspace selection is missing.');
requireText(functions,"roles: identity.admin ? ['admin'] : ['listener', ...professionalRolesForAccount",'Private profile payload must preserve Listener alongside professional roles.');
for(const field of ['creatorLanguages','creatorDirectionModes','writerScriptLengths','writerRightsNote','artistMediums','artistDeliveryFormats','listenerCommunityStyle']){
  requireText(functions,field,'Role-specific server profile field missing: '+field);
  requireText(roleProfile,field,'Role-specific editor field missing: '+field);
}
requireText(publicProfile,"profile?.role && availableProfileRoles.includes",'Public multi-role profile must default to the account active/primary role.');
for(const marker of ['VA CREATOR PROFILE','WRITER PROFILE','ARTIST PROFILE','LISTENER SIGNATURE']){
  requireText(publicProfile,marker,'Bespoke public profile section missing: '+marker);
}

requireText(functions,'requestedProfileRole','Multi-role profile saves must support an explicit approved profile role.');
requireText(functions,"That professional profile role has not been approved for this account.",'Role-targeted profile editing must enforce approved-role boundaries.');
requireText(functions,'topLevelProfileWrite','Multi-role saves must not overwrite active-workspace compatibility fields from another role.');
requireText(functions,"profileRole === activeWorkspaceRole",'Only the active workspace role may refresh legacy top-level role fields.');
requireText(functions,"...roleProfileSlice(profileData, 'creator')",'Creator directory cards must read the Creator role slice on multi-role accounts.');
requireText(functions,"role:'writer'",'Writer directory cards must remain explicitly Writer-scoped on multi-role accounts.');
requireText(functions,"professionalRolesForAccount(target.data() ?? {}).includes('creator')",'Backward-compatible Creator follows must support multi-role Creator accounts.');
requireText(app,'captureProfileRoleDraft','Multi-role profile drafts must be isolated before role switching.');
requireText(app,'profile-identity-tabs','Unified profile identity tabs are missing.');
requireText(app,'saveMyProfile(payload, targetRole)','Save-all must persist each approved role slice independently.');
requireText(app,'getMyProfilePortfolioOptions(nextRole)','Role switching must load role-specific showcase options without changing workspace.');
requireText(roleProfile,"role === 'editor'",'Audio Editor must participate in the unified professional profile editor.');

requireText(functions,'recordAuthenticationSuccess','Successful sign-in security telemetry is missing.');
requireText(functions,'listMySignInActivity','Private sign-in activity endpoint is missing.');
requireText(functions,"type:'account_security'",'New-device user notification is missing.');
requireText(functions,'passwordCaptured:false','Authentication activity must explicitly avoid password capture.');
requireText(indexes,'"collectionGroup": "signInActivity"','Successful sign-in activity TTL collection is missing.');
requireText(indexes,'"fieldPath": "retentionUntil"','Authentication retention TTL field is missing.');

requireText(updater,'navigator.serviceWorker.getRegistrations()','Force update must address all service-worker registrations.');
requireText(updater,'await Promise.all(keys.map((key) => caches.delete(key)))','Force update must clear legacy Cache Storage.');
requireText(updateUi,'Force refresh app','Manual force-refresh control is missing.');
requireText(productExperience,'applyNightjarUpdate','Automatic update banner must use hardened updater.');
requireText(app,'allowInstall={canAdmin && !simulationMode}','Install prompt must remain admin-only during testing.');
requireText(mobileNav,'Editor Studio','Mobile Editor navigation must not regress to legacy Editorial label.');

requireText(firestore,'allow read, write: if false','Firestore client access must remain deny-by-default.');
requireText(storage,'match /release-audio/{userId}/{releaseId}/{fileId}','Release-audio storage boundary missing.');
requireText(storage,'allow read: if false','Release audio must not be public through direct Storage reads.');

for(const marker of ['max-width:min(1100px,calc(100vw - 18px))','max-height:calc(100dvh - 18px)','@media (max-width:430px)']){
  requireText(css,marker,'Mobile/modal hardening marker missing: '+marker);
}

if(failures.length){
  console.error('RELEASE HARDENING CONTRACT FAILURES');
  failures.forEach((failure)=>console.error('-',failure));
  process.exit(1);
}
console.log('Nightjar release-hardening contracts passed.');
