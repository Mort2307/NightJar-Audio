import fs from 'node:fs';

const read=(file)=>fs.readFileSync(file,'utf8');
const app=read('src/App.tsx');
const backend=read('functions/src/index.ts');
const firebase=read('firebase.json');
const firestore=read('firestore.rules');
const storage=read('storage.rules');
const pwa=read('src/platform/pwa.ts');
const sw=read('public/service-worker.js');
const pkg=JSON.parse(read('package.json'));

const clientBypass=/const TESTING_AGE_ASSURANCE_BYPASS\s*=\s*true/.test(app);
const backendBypass=/const TESTING_AGE_ASSURANCE_BYPASS\s*=\s*true/.test(backend);
const ageConfigured=/const AGE_ASSURANCE_CONFIGURED\s*=\s*true/.test(backend);
const closedBeta=/const CLOSED_BETA\s*=\s*true/.test(backend);
const failures=[];

if(clientBypass||backendBypass) failures.push('Testing age-assurance bypass is still enabled. Set TESTING_AGE_ASSURANCE_BYPASS = false before public launch.');
if(!ageConfigured) failures.push('Production age assurance is not configured. AGE_ASSURANCE_CONFIGURED must be true only after the live provider is genuinely connected.');
if(closedBeta) failures.push('Closed Beta registration is still enabled. Set CLOSED_BETA = false before public launch.');

if(!firebase.includes('"source": "/version.json"')||!firebase.includes('no-store,max-age=0,must-revalidate')) failures.push('Deployed build manifest is not protected against stale caching.');
if(!pwa.includes('getRegistrations()')||!pwa.includes('registration.unregister()')) failures.push('Force-update service-worker recovery contract is missing.');
if(!sw.includes("type === 'SKIP_WAITING'")) failures.push('Service worker does not support explicit update activation.');
if(!/match \/\{document=\*\*\}[\s\S]*allow read, write: if false/.test(firestore)) failures.push('Firestore is not deny-by-default for browser clients.');
if(/allow read\s*:\s*if\s+request\.auth\s*!=\s*null/.test(storage)) failures.push('Storage contains a blanket authenticated-read rule.');
if(!pkg.scripts?.validate||!pkg.scripts?.['validate:contracts']||!pkg.scripts?.['validate:security']) failures.push('Release validation scripts are incomplete.');

if(failures.length){
  console.error('LAUNCH READINESS FAIL');
  for(const failure of failures) console.error('-',failure);
  console.error('\nThis is expected during controlled testing while production age assurance / public registration are intentionally not enabled.');
  process.exit(1);
}

console.log('✓ Production age assurance configured.');
console.log('✓ Testing age-assurance bypass disabled.');
console.log('✓ Closed Beta registration disabled.');
console.log('✓ PWA update manifest and recovery path present.');
console.log('✓ Browser data access remains deny-by-default.');
console.log('✓ Validation scripts present.');
console.log('Nightjar launch-readiness gates passed.');
