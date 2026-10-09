#!/usr/bin/env node
// One-command Nightjar Web Push configuration for production builds.
// Firebase VAPID PUBLIC key is not an authentication secret; still never commit local env.
import fs from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';

const file = path.resolve('.env.production.local');
const name = 'VITE_FIREBASE_VAPID_KEY';
const validKey = value => /^[A-Za-z0-9_-]{70,180}$/.test(value) && value.startsWith('B');

async function main() {
  console.log('\nNIGHTJAR — PHONE PUSH CONFIGURATION\n',
    'One Firebase public Web Push key enables registrations on supported devices.',
    'Firebase Console > Project Settings > Cloud Messaging > Web Push certificates.',
    'Project: nightjar-audio. Copy the PUBLIC key, not any server or private key.\n');
  const existing = fs.existsSync(file) ? fs.readFileSync(file,'utf8') : '';
  const regex = /^VITE_FIREBASE_VAPID_KEY=(.*)$/m;
  const known = regex.exec(existing)?.[1]?.trim() || '';
  if (validKey(known)) {
    console.log('A VAPID public key is already configured in .env.production.local.');
    console.log('No change is necessary if it matches Firebase project nightjar-audio.');
    return;
  }
  const cli = createInterface({ input: process.stdin, output: process.stdout });
  let key;
  try { key = (await cli.question('Paste Firebase WEB PUSH public key here (local only): ')).trim(); }
  finally { cli.close(); }
  if (!validKey(key)) throw Error('Not a valid Web Push public key. Open Firebase Cloud Messaging > Web Push certificates and copy its public key.');
  const lines = existing.split(/\r?\n/).filter(line => !line.startsWith(name + '='));
  const body = (lines.filter((line,index) => line || index < lines.length - 1).join('\n').trimEnd() + '\n' + name + '=' + key + '\n').trimStart();
  fs.writeFileSync(file, body, { mode:0o600 });
  console.log('\nSaved locally to ignored .env.production.local for future Vite production builds.');
  console.log('No Firebase functions or hosting were deployed.');
  console.log('Next: npm run deploy:push');
}
if (process.argv.includes('--help')) console.log('npm run setup:push — configure Nightjar Web Push public VAPID key in local ignored production env.');
else main().catch(e=>{console.error('Push setup stopped: ' + String(e?.message || e));process.exitCode=1;});
