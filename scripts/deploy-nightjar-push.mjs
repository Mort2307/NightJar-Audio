#!/usr/bin/env node
// Explicit guarded Nightjar push-only deploy. Never alters Didit settings or beta bypass.
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';

const project = 'nightjar-audio';
const branch = 'didit-verification-integration';
const bin = (name) => process.platform === 'win32' ? name + '.cmd' : name;
function run(cmd, args, quiet = false) {
  const executable = cmd === 'git' ? (process.platform === 'win32' ? 'git.exe' : 'git') : bin(cmd);
  const res = spawnSync(executable,args,{
    shell:process.platform==='win32', encoding:'utf8',
    stdio:quiet ? ['ignore','pipe','pipe'] : 'inherit',
    windowsHide:true, maxBuffer:3*1024*1024,
  });
  if (res.error || res.status !== 0) throw Error(cmd + ' ' + args.join(' ') + ' failed' +
    (res.error ? ': ' + res.error.message : quiet ? ': ' + (res.stderr||'').slice(0,400) : ''));
  return quiet ? (res.stdout||'').trim() : '';
}
async function main() {
  console.log('\nNIGHTJAR — PHONE PUSH ENABLEMENT');
  const key = ((fs.existsSync('.env.production.local') ?
    /^VITE_FIREBASE_VAPID_KEY=(.*)$/m.exec(fs.readFileSync('.env.production.local','utf8'))?.[1] : '') || '').trim();
  if (!/^[A-Za-z0-9_-]{70,180}$/.test(key) || !key.startsWith('B'))
    throw Error('A Firebase Web Push public key is missing. Run: npm run setup:push');
  if (run('git',['branch','--show-current'],true) !== branch) throw Error('Use branch ' + branch + '.');
  if (run('git',['status','--porcelain'],true)) throw Error('Working tree is not clean; review it before deploying.');
  run('git',['fetch','origin','main',branch]);
  if (run('git',['rev-parse','HEAD'],true) !== run('git',['rev-parse','origin/'+branch],true))
    throw Error('Pull latest GitHub changes first: git pull --ff-only origin ' + branch);
  const beta = fs.readFileSync('functions/src/index.ts','utf8');
  if (!beta.includes('const TESTING_AGE_ASSURANCE_BYPASS = true;') ||
    !beta.includes('const CLOSED_BETA = true;') ||
    !beta.includes('const DIDIT_LIVE_PILOT_ADMINS_ONLY = true;'))
    throw Error('Closed beta protections are not intact; refusing deployment.');
  for (const name of ['registerPushDevice','unregisterPushDevice','myPushNotificationStatus','sendTestPushNotification','brandInstallManifest','brandLogoImage','brandIcon192','brandIcon512','brandIconMaskable512','syncBrandIconVariants'])
    if (!beta.includes('export const ' + name + ' =')) throw Error('Push function is missing: ' + name);
  console.log('Firebase push public key found; validating Nightjar...');
  run('npm',['run','validate']);
  run('npm',['run','validate:didit']);
  run('npm',['--prefix','functions','run','check']);
  run('npm',['--prefix','functions','run','build']);
  run('npm',['run','build']);
  console.log('\nThis updates ONLY live Nightjar Hosting, device-push functions and brand-icon endpoints.',
    '\nDidit API secrets and the closed-beta access flags are unchanged.');
  const rl=createInterface({input:process.stdin,output:process.stdout});
  let answer;
  try { answer=(await rl.question('Type DEPLOY PUSH to confirm (anything else cancels): ')).trim(); }
  finally { rl.close(); }
  if(answer!=='DEPLOY PUSH'){console.log('Cancelled, nothing deployed.');return;}
  run('firebase',['deploy','--only',
    'functions:registerPushDevice,functions:unregisterPushDevice,functions:myPushNotificationStatus,functions:sendTestPushNotification,functions:brandInstallManifest,functions:brandLogoImage,functions:brandIcon192,functions:brandIcon512,functions:brandIconMaskable512,functions:syncBrandIconVariants,hosting',
    '--project',project]);
  console.log('Deployment complete. Open Nightjar Admin > Phone notifications on the DEVICE, enable, then send a test.');
}
if(process.argv.includes('--help')) console.log('npm run deploy:push — validate and deploy Nightjar Phone Push.');
else main().catch(e=>{console.error('\nSTOPPED: '+String(e?.message||e));process.exitCode=1});
