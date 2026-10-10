#!/usr/bin/env node
// One-run Nightjar -> Didit sandbox setup.
// This script NEVER deploys and refuses to write to the production Firebase project.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PROD = 'nightjar-audio';
const API = 'https://verification.didit.me/v3';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ID = /^[a-z][a-z0-9-]{5,29}$/;
const EVENTS = ['status.updated', 'data.updated', 'user.status.updated'];
const help = process.argv.includes('--help') || process.argv.includes('-h');
const lines = (...parts) => console.log(...parts);

if (help) {
  lines('Nightjar Didit sandbox wizard', '',
    'Usage: node scripts/setup-didit-sandbox.mjs',
    'Lists Firebase staging projects, validates a Didit sandbox key, chooses a',
    'published KYC workflow, creates/reuses a sandbox webhook destination and',
    'stores four secrets in the STAGING Firebase project only. No deployment.');
  process.exit(0);
}

function firebase(args, { quiet = false } = {}) {
  const binary = process.platform === 'win32' ? 'firebase.cmd' : 'firebase';
  const result = spawnSync(binary, args, {
    cwd: ROOT, encoding: 'utf8', shell: process.platform === 'win32',
    maxBuffer: 2 * 1024 * 1024, windowsHide: true,
  });
  if (result.error || result.status !== 0) {
    const message = [result.stderr, result.stdout].filter(Boolean).join('\n');
    throw new Error('Firebase CLI failed: ' + (result.error?.message || message.trim().slice(0, 700)
      || 'exit ' + result.status));
  }
  if (!quiet && result.stdout?.trim()) lines(result.stdout.trim());
  return result.stdout.trim();
}

async function ask(label) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try { return (await rl.question(label)).trim(); }
  finally { rl.close(); }
}

async function hidden(label) {
  if (!process.stdin.isTTY || !process.stdin.setRawMode)
    throw new Error('Run this in an interactive PowerShell terminal to enter secrets privately.');
  process.stdout.write(label);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  try {
    return await new Promise((resolve, reject) => {
      let value = '';
      const onData = (chunk) => {
        const characters = chunk.toString('utf8');
        for (const char of characters) {
          if (char === '\u0003') { cleanup(); reject(new Error('Cancelled.')); return; }
          if (char === '\r' || char === '\n') {
            cleanup(); process.stdout.write('\n'); resolve(value.trim()); return;
          }
          if (char === '\b' || char === '\u007f') value = value.slice(0, -1);
          else if (char >= ' ' && char !== '\u007f') value += char;
        }
      };
      const cleanup = () => process.stdin.off('data', onData);
      process.stdin.on('data', onData);
    });
  } finally {
    process.stdin.setRawMode(false);
    process.stdin.pause();
  }
}

async function didit(key, endpoint, payload) {
  const resp = await fetch(API + endpoint, {
    method: payload === undefined ? 'GET' : 'POST',
    headers: { 'x-api-key': key, 'accept': 'application/json',
      ...(payload === undefined ? {} : { 'content-type': 'application/json' }) },
    body: payload === undefined ? undefined : JSON.stringify(payload),
    signal: AbortSignal.timeout(15000),
  });
  if (!resp.ok) throw new Error('Didit returned HTTP ' + resp.status + ' for ' + endpoint +
    (resp.status === 403 ? ' (check the sandbox API key and its permissions)' : ''));
  return resp.json();
}

function putSecret(project, name, value) {
  if (project === PROD || !ID.test(project)) throw new Error('Production-project protection stopped secret write.');
  if (!value || /[\r\n]/.test(value)) throw new Error('Missing or invalid ' + name);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nightjar-didit-'));
  const file = path.join(dir, 'secret');
  try {
    fs.writeFileSync(file, value, { mode: 0o600 });
    const result = spawnSync(process.platform === 'win32' ? 'firebase.cmd' : 'firebase',
      ['functions:secrets:set', name, '--data-file', file, '--project', project, '--non-interactive'],
      { cwd: ROOT, encoding: 'utf8', shell: process.platform === 'win32',
        maxBuffer: 512 * 1024, windowsHide: true });
    if (result.error || result.status !== 0) {
      const details = ((result.stderr || '') + '\n' + (result.stdout || ''))
        .replaceAll(value, '[redacted]').trim().slice(0, 600);
      throw new Error('Could not store ' + name + ': ' + (result.error?.message || details || 'Firebase CLI error'));
    }
    lines('  [saved] ' + name + ' in Firebase project ' + project);
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); }
    catch { console.error('SECURITY: Could not delete temporary secret file: ' + file); }
  }
}

async function main() {
  lines('\nNIGHTJAR / DIDIT SANDBOX SETUP', 'No live deploy, no production secrets, no billing from Didit sandbox.\n');
  const listed = JSON.parse(firebase(['projects:list', '--json'], { quiet: true }));
  const projects = Array.isArray(listed.result) ? listed.result : [];
  const choices = projects.filter(p => ID.test(p.projectId || '') && p.projectId !== PROD);
  if (!choices.length) {
    lines('No separate Firebase staging project was found.',
      'Create one in Firebase first (with Firestore, Auth and Functions enabled).',
      'Do not reuse production project ' + PROD + '. No changes were made.');
    return;
  }
  lines('Available STAGING Firebase projects:');
  choices.forEach((p, i) => lines('  ' + (i + 1) + ') ' + p.projectId + ' — ' + (p.displayName || '')));
  const selected = choices.length === 1 ? '1' : await ask('Choose project number: ');
  const project = choices[Number(selected) - 1]?.projectId;
  if (!project || project === PROD) throw new Error('No valid staging project chosen.');
  const webhookUrl = 'https://' + project + '.web.app/api/webhooks/didit';
  lines('\nFirebase staging project: ' + project,
    'Sandbox webhook URL: ' + webhookUrl,
    'Didit sandbox keys: https://business.didit.me/ (Sandbox app -> Developers -> API keys)',
    'Do not use the production API key.\n');

  const key = await hidden('Paste the NEW Didit Sandbox API key (hidden): ');
  if (key.length < 20) throw new Error('API key is missing or unexpectedly short.');
  const all = await didit(key, '/workflows/');
  const workflows = (Array.isArray(all) ? all : all.results || [])
    .filter(w => w.workflow_type === 'kyc' && w.status === 'published' &&
      !w.is_archived && UUID.test(w.workflow_id || w.uuid || ''));
  if (!workflows.length) throw new Error('Sandbox key works, but no published KYC workflows were found.');
  lines('\nPublished KYC workflows available to this sandbox key:');
  workflows.forEach((w, i) => lines('  ' + (i + 1) + ') ' +
    (w.workflow_label || 'Untitled') + ' — ' + (w.features || 'features unknown')));
  const selection = workflows.length === 1 ? '1' : await ask('Choose workflow number: ');
  const wf = workflows[Number(selection) - 1];
  if (!wf) throw new Error('Invalid workflow choice.');
  const workflowId = wf.workflow_id || wf.uuid;
  lines('\nChecking sandbox-only API access (creates one unbilled test session)...');
  const smokeUid = 'nightjar-sandbox-setup-' + randomUUID();
  const smoke = await didit(key, '/session/', {
    workflow_id: workflowId, vendor_data: smokeUid, sandbox_scenario: 'decline_minimum_age',
  });
  if (smoke.vendor_data !== smokeUid || smoke.workflow_id !== workflowId ||
    !smoke.session_id || smoke.session_kind !== 'user') {
    throw new Error('Didit sandbox session response did not match the intended user and workflow.');
  }
  lines('  [passed] Sandbox-only session creation (live API keys reject sandbox_scenario).');

  const destinations = await didit(key, '/webhook/destinations/');
  if (!Array.isArray(destinations)) throw new Error('Unexpected Didit webhook destination list.');
  const existing = destinations.find(d => d.url === webhookUrl);
  let webhookSecret;
  if (existing) {
    lines('\nAn existing Didit sandbox webhook destination already uses this URL.');
    if (existing.webhook_version !== 'v3' ||
      EVENTS.some(evt => !existing.subscribed_events?.includes(evt))) {
      throw new Error('Existing webhook has different version/events. Edit it in Didit first.');
    }
    webhookSecret = await hidden('Paste that destination signing secret (hidden): ');
    if (!webhookSecret) throw new Error('No signing secret given.');
  } else {
    const confirm = await ask('\nCreate a V3 webhook for this STAGING URL and save Firebase secrets? (yes/no): ');
    if (confirm.toLowerCase() !== 'yes') {
      lines('Cancelled; no Firebase secrets or webhook destination were changed.'); return;
    }
    const created = await didit(key, '/webhook/destinations/', {
      label: 'Nightjar sandbox -> ' + project,
      url: webhookUrl, webhook_version: 'v3', subscribed_events: EVENTS,
    });
    webhookSecret = created.secret_shared_key;
    if (!webhookSecret) throw new Error('Destination was created but did not return a signing secret; check Didit console.');
    lines('  [created] Didit sandbox webhook destination ' + (created.uuid || ''));
  }
  putSecret(project, 'DIDIT_API_KEY', key);
  putSecret(project, 'DIDIT_WORKFLOW_ID', workflowId);
  putSecret(project, 'DIDIT_WEBHOOK_SECRET', webhookSecret);
  putSecret(project, 'DIDIT_ENVIRONMENT', 'sandbox');

  lines('\nCONFIGURATION SAVED (staging only).',
    'Didit API key verified as sandbox; webhook destination configured.',
    'Next: validate a strict 18+ decline policy, then deploy/test on the staging project.',
    'No functions or hosting were deployed; Nightjar production remains unchanged.');
}
main().catch(error => {
  console.error('\nSTOPPED SAFELY: ' + (error?.message || 'Unknown setup error'));
  process.exitCode = 1;
});
