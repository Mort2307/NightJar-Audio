#!/usr/bin/env node
// Nightjar production Didit CONFIGURATION wizard. No session creation, deployments,
// role changes, bypass changes, or automatic charges are performed by this script.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PROJECT = 'nightjar-audio';
const API = 'https://verification.didit.me/v3';
const WEBHOOK_URL = 'https://nightjar-audio.web.app/api/webhooks/didit';
const EVENTS = ['status.updated', 'data.updated', 'user.status.updated'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const log = (...args) => console.log(...args);

function firebase(args) {
  const result = spawnSync(process.platform === 'win32' ? 'firebase.cmd' : 'firebase', args,
    { cwd: ROOT, encoding: 'utf8', windowsHide: true,
      shell: process.platform === 'win32', maxBuffer: 2 * 1024 * 1024 });
  if (result.error || result.status !== 0)
    throw Error('Firebase CLI failed: ' + String(result.error?.message || result.stderr || result.stdout || 'unknown').slice(0, 600));
  return result.stdout || '';
}

async function input(question) {
  const cli = createInterface({ input: process.stdin, output: process.stdout });
  try { return (await cli.question(question)).trim(); }
  finally { cli.close(); }
}

async function secretInput(label) {
  if (!process.stdin.isTTY || !process.stdin.setRawMode) throw Error('Open a normal PowerShell console to enter credentials.');
  process.stdout.write(label);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  return new Promise((resolve, reject) => {
    let key = '';
    const cleanup = () => { process.stdin.off('data', onData); process.stdin.setRawMode(false); process.stdin.pause(); };
    const onData = chunk => {
      for (const c of chunk.toString('utf8')) {
        if (c === '\u0003') { cleanup(); reject(Error('Cancelled.')); return; }
        if (c === '\r' || c === '\n') { cleanup(); process.stdout.write('\n'); resolve(key.trim()); return; }
        if (c === '\u007f' || c === '\b') key = key.slice(0, -1);
        else if (c >= ' ') key += c;
      }
    };
    process.stdin.on('data', onData);
  });
}

async function didit(key, route, body) {
  const response = await fetch(API + route, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'x-api-key': key, 'accept': 'application/json',
      ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw Error('Didit API ' + route + ' returned HTTP ' + response.status +
    (response.status === 403 ? ' (wrong, revoked, or insufficient-privilege API key)' : ''));
  return response.json();
}

function entries(response, field) {
  if (Array.isArray(response)) return response;
  for (const candidate of [response?.results, response?.[field], response?.data?.results,
    response?.data?.[field], response?.data, response?.items]) {
    if (Array.isArray(candidate)) return candidate;
  }
  throw Error('Unexpected Didit API response for ' + field + '; no secrets were saved.');
}

function writeFirebaseSecret(name, value) {
  if (!value || /[\r\n]/.test(value)) throw Error('Invalid value for ' + name);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nightjar-live-didit-'));
  const filename = path.join(dir, 'secret.txt');
  try {
    fs.writeFileSync(filename, value, { mode: 0o600 });
    firebase(['functions:secrets:set', name, '--data-file', filename,
      '--project', PROJECT, '--non-interactive']);
    log('  OK ' + name + ' saved to Firebase Secret Manager.');
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); }
    catch { console.error('WARNING: Remove temporary secret file manually: ' + filename); }
  }
}

async function main() {
  log('\nNIGHTJAR — REAL DIDIT / ADMIN-ONLY PILOT',
    'Sets up the existing live Nightjar app. Does NOT deploy or start any paid checks.\n');
  const projectList = JSON.parse(firebase(['projects:list', '--json']));
  if (!Array.isArray(projectList.result) ||
      !projectList.result.some(p => p.projectId === PROJECT))
    throw Error('The active Firebase login cannot access ' + PROJECT + '. No changes were made.');

  log('Didit LIVE API key: in your NightJar Audio app -> Developers -> API keys',
    'Please use a freshly rotated key. Never put it in Git or this chat.\n');
  const key = await secretInput('Live Didit API key (hidden): ');
  if (key.length < 20) throw Error('API key is missing or unexpectedly short.');
  const workflows = entries(await didit(key, '/workflows/'), 'workflows')
    .map(w => ({ ...w, id: w.workflow_id || w.uuid || w.id }))
    .filter(w => UUID.test(w.id || '') && !w.is_archived);
  if (!workflows.length) throw Error('Live API key works but Didit returned no usable workflow IDs.');

  log('\nWorkflows accessible to this LIVE key:');
  workflows.forEach((w, index) => {
    const name = w.workflow_label || w.name || w.label || '(unnamed)';
    log('  ' + (index + 1) + ') ' + name + ' — ' + w.id +
      ' [' + (w.workflow_type || w.type || 'type unspecified') + ', ' +
      (w.status || 'status unspecified') + ']');
  });
  const chosen = workflows.length === 1 ? '1' : await input('Select your 18+ KYC workflow number: ');
  const workflow = workflows[Number(chosen) - 1];
  if (!workflow) throw Error('Invalid workflow selection.');
  if (workflow.workflow_type && !['kyc','age_verification','age'].includes(String(workflow.workflow_type).toLowerCase()))
    throw Error('Selected workflow is not a user identity/age verification workflow.');
  if (workflow.status && ['draft','archived','disabled'].includes(String(workflow.status).toLowerCase()))
    throw Error('Selected workflow is not published/active.');
  const threshold = await input('Does this workflow REQUIRE identity-based 18+ and decline under-18 users? Type YES: ');
  if (threshold !== 'YES') {
    log('Stopped. Verify the 18+ rule in Didit before setting up live Nightjar.'); return;
  }
  log('\nChecking webhooks for ' + WEBHOOK_URL);
  const hooks = entries(await didit(key, '/webhook/destinations/'), 'destinations');
  const existing = hooks.find(h => h.url === WEBHOOK_URL);
  let webhookSecret;
  if (existing) {
    if (existing.webhook_version !== 'v3' ||
        EVENTS.some(name => !existing.subscribed_events?.includes(name)))
      throw Error('The existing webhook uses different version/events. Correct it in Didit first.');
    log('  Existing V3 webhook found. Enter its current (rotated) signing secret.');
    webhookSecret = await secretInput('Live webhook signing secret (hidden): ');
  } else {
    log('  No matching destination. One V3 destination will be created automatically.');
    const proceed = await input('Create this LIVE webhook destination now? Type YES: ');
    if (proceed !== 'YES') { log('Cancelled, no Firebase changes.'); return; }
    const created = await didit(key, '/webhook/destinations/', {
      label: 'Nightjar real age assurance',
      url: WEBHOOK_URL, webhook_version: 'v3', subscribed_events: EVENTS,
    });
    webhookSecret = created.secret_shared_key;
    if (!webhookSecret) throw Error('Didit created a destination but did not return its signing secret.');
    log('  Created Didit webhook destination. Secret captured privately.');
  }
  if (!webhookSecret || webhookSecret.length < 16) throw Error('Webhook signing secret is missing.');
  const confirm = await input('\nSave live credentials ONLY to Firebase project nightjar-audio? Type YES: ');
  if (confirm !== 'YES') { log('Cancelled, no Firebase changes.'); return; }

  writeFirebaseSecret('DIDIT_API_KEY', key);
  writeFirebaseSecret('DIDIT_WORKFLOW_ID', workflow.id);
  writeFirebaseSecret('DIDIT_WEBHOOK_SECRET', webhookSecret);
  writeFirebaseSecret('DIDIT_ENVIRONMENT', 'live');
  log('\nDONE: Four live values saved to Firebase Secret Manager.',
    'No live verification was started and nothing was deployed.',
    'Next: validate/build, deploy reviewed app + webhook, then test as Nightjar ADMIN only.');
}
if (process.argv.includes('--help')) {
  log('Run npm run setup:didit:live for an interactive, production-project-scoped setup. No deploy.');
} else {
  main().catch(error => { console.error('\nSTOPPED: ' + String(error?.message || error)); process.exitCode = 1; });
}
