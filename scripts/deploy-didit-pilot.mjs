#!/usr/bin/env node
// Nightjar guarded live DIDIT ADMIN PILOT deploy. Explicit approval required.
// Does not remove closed beta / test bypass. Does not initiate Didit sessions.
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';

const project = 'nightjar-audio';
const branch = 'didit-verification-integration';
const binary = process.platform === 'win32' ? { git: 'git.exe', firebase: 'firebase.cmd', npm: 'npm.cmd' }
  : { git: 'git', firebase: 'firebase', npm: 'npm' };

function run(command, args, { quiet = false, acceptFailure = false } = {}) {
  const call = spawnSync(binary[command], args, {
    encoding: 'utf8', windowsHide: true, maxBuffer: 3 * 1024 * 1024,
    shell: process.platform === 'win32', stdio: quiet ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
  if (call.error || (call.status !== 0 && !acceptFailure))
    throw Error(command + ' ' + args.join(' ') + ' exited unsuccessfully (' +
      (call.error?.message || call.status) + ')' + (quiet ? ': ' + (call.stderr || '').slice(0, 250) : ''));
  return quiet ? { status: call.status, value: (call.stdout || '').trim() } : { status: call.status };
}

async function main() {
  console.log('\nNIGHTJAR — REVIEWED DIDIT LIVE ADMIN PILOT');
  const current = run('git', ['branch', '--show-current'], { quiet: true }).value;
  if (current !== branch) throw Error('Use branch ' + branch + ', not ' + current);
  if (run('git', ['status', '--porcelain'], { quiet: true }).value)
    throw Error('Uncommitted files detected. Review/commit or stash them before deploying.');
  run('git', ['fetch', 'origin', 'main', branch]);
  const currentHead = run('git', ['rev-parse', 'HEAD'], { quiet: true }).value;
  const remoteHead = run('git', ['rev-parse', 'origin/' + branch], { quiet: true }).value;
  if (currentHead !== remoteHead) throw Error('Branch is not identical to GitHub. Run git pull --ff-only first.');
  if (run('git', ['merge-base', '--is-ancestor', 'origin/main', 'HEAD'],
      { quiet: true, acceptFailure: true }).status !== 0)
    throw Error('Production main has changes absent from this branch. Rebase and revalidate before deployment.');

  const back = fs.readFileSync('functions/src/index.ts', 'utf8');
  const gifts = fs.readFileSync('functions/src/nightjars.ts', 'utf8');
  const didit = fs.readFileSync('functions/src/didit.ts', 'utf8');
  if (!back.includes('const TESTING_AGE_ASSURANCE_BYPASS = true;') ||
      !back.includes('const CLOSED_BETA = true;') ||
      !gifts.includes('const TESTING_AGE_ASSURANCE_BYPASS = true;') ||
      !back.includes('const DIDIT_LIVE_PILOT_ADMINS_ONLY = true;') ||
      !didit.includes('payload.adultEvidence === true'))
    throw Error('Closed-beta protections or adult-evidence checks are missing. Refusing deploy.');

  console.log('\nChecking Firebase secret metadata (NOT their values)...');
  for (const name of ['DIDIT_API_KEY','DIDIT_WORKFLOW_ID','DIDIT_WEBHOOK_SECRET','DIDIT_ENVIRONMENT'])
    run('firebase', ['functions:secrets:get', name, '--project', project], { quiet: true });
  console.log('Secret names are present. This does not prove they are the correct live values.');

  console.log('\nRunning full Nightjar validation...');
  run('npm', ['run', 'validate']);
  run('npm', ['--prefix', 'functions', 'run', 'check']);
  run('npm', ['--prefix', 'functions', 'run', 'build']);
  run('npm', ['run', 'build']);
  run('npm', ['run', 'validate:contracts']);
  run('npm', ['run', 'validate:release-hardening']);
  run('git', ['diff', '--check']);
  run('git', ['status', '--porcelain'], { quiet: true });

  console.log('\nCAUTION: The next action updates LIVE Nightjar Firebase Functions and Hosting.',
    '\nExisting approved testers remain on temporary bypass.',
    '\nOnly administrators can start chargeable real Didit checks.',
    '\nConfirm LIVE Didit credentials, a real 18+ KYC workflow and a rotated signing secret first.',
    '\nNo verification session is created by this script.');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  let confirm;
  try { confirm = (await rl.question('\nType DEPLOY PILOT to continue, anything else to cancel: ')).trim(); }
  finally { rl.close(); }
  if (confirm !== 'DEPLOY PILOT') { console.log('Cancelled; no deployment.'); return; }
  run('firebase', ['deploy', '--only', 'functions,hosting', '--project', project]);
  console.log('\nPilot deployed. Sign in as Nightjar admin, open the admin console,',
    'and use Didit live verification. Confirm webhook delivery and Firestore state.');
}
if (process.argv.includes('--help')) {
  console.log('npm run deploy:didit:pilot — guarded, validated, explicitly approved live pilot deployment');
} else {
  main().catch(error => { console.error('\nSTOPPED: ' + (error?.message || error)); process.exitCode = 1; });
}
