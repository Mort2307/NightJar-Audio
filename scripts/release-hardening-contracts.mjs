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

requireText(functions,"roles: ['listener', ...professionalRoles]",'Public profiles must preserve Listener alongside professional roles.');
requireText(functions,"roles: identity.admin ? ['admin'] : ['listener', ...professionalRolesForAccount",'Private profile payload must preserve Listener alongside professional roles.');
for(const field of ['creatorLanguages','creatorDirectionModes','writerScriptLengths','writerRightsNote','artistMediums','artistDeliveryFormats','listenerCommunityStyle']){
  requireText(functions,field,'Role-specific server profile field missing: '+field);
  requireText(roleProfile,field,'Role-specific editor field missing: '+field);
}
requireText(publicProfile,"profile?.role && availableProfileRoles.includes",'Public multi-role profile must default to the account active/primary role.');
for(const marker of ['VA CREATOR PROFILE','WRITER PROFILE','ARTIST PROFILE','LISTENER SIGNATURE']){
  requireText(publicProfile,marker,'Bespoke public profile section missing: '+marker);
}

requireText(functions,'recordAuthenticationSuccess','Successful sign-in security telemetry is missing.');
requireText(functions,'listMySignInActivity','Private sign-in activity endpoint is missing.');
requireText(functions,"type:'account_security'",'New-device user notification is missing.');
requireText(functions,'passwordCaptured:false','Authentication activity must explicitly avoid password capture.');

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
