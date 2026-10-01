import fs from 'node:fs';

const app = fs.readFileSync('src/App.tsx','utf8');
const backend = fs.readFileSync('functions/src/index.ts','utf8');

const clientBypass = /const TESTING_AGE_ASSURANCE_BYPASS\s*=\s*true/.test(app);
const backendBypass = /const TESTING_AGE_ASSURANCE_BYPASS\s*=\s*true/.test(backend);

if (clientBypass || backendBypass) {
  console.error('LAUNCH READINESS FAIL: testing age-assurance bypass is still enabled.');
  console.error('Set TESTING_AGE_ASSURANCE_BYPASS = false in both src/App.tsx and functions/src/index.ts before public launch.');
  process.exit(1);
}

console.log('✓ Testing age-assurance bypass disabled.');
console.log('Nightjar launch-readiness age gate passed.');
