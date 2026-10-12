#!/usr/bin/env node
// Read-only post-deploy checks: Cloud Functions ACTIVE metadata + strictly
// allowlisted, idempotent public branding GETs. Never call login, payment,
// age verification, user actions, scheduled functions or webhooks.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { parseDeployLog } from './firebase-backend-report.mjs';

const PROJECT_ID = 'nightjar-audio';
const REGION = 'europe-west2';
const URL = 'https://nightjar-audio.web.app';
const PUBLIC_PROBES = Object.freeze({
  brandIcon192: '/app-icons/nightjar-192.png',
  brandIcon512: '/app-icons/nightjar-512.png',
  brandIconMaskable512: '/app-icons/nightjar-maskable-512.png',
  brandLogoImage: '/brand-logo',
  brandInstallManifest: '/app-manifest.webmanifest',
});

export function selectedTargets(scope, selection, rawLog) {
  const confirmed = parseDeployLog(rawLog).updatedFunctions;
  if (scope === 'functions:selected') {
    const names = [...new Set(selection.split(',').map((v) => v.trim()).filter(Boolean))];
    if (!names.length || names.length > 20) throw new Error('Invalid named-Functions selection.');
    if (names.some((n) => !/^[A-Za-z][A-Za-z0-9_-]{0,100}$/.test(n))) throw new Error('Invalid function name.');
    return names.map((name) => {
      const actual = confirmed.find((item) => item.name === name);
      return { name, region: actual?.region || REGION, updated: Boolean(actual) };
    });
  }
  if (scope === 'functions' || scope === 'all-backend') return confirmed.map((item) => ({ ...item, updated: true }));
  return [];
}

export async function httpProbe(name, fetcher = fetch) {
  const pathname = PUBLIC_PROBES[name];
  if (!pathname) return null; // Never guess URLs for callable/webhook/event handlers.
  let response;
  try {
    response = await fetcher(URL + pathname, {
      method: 'GET',
      redirect: 'manual',
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
      headers: { 'Cache-Control': 'no-store', 'User-Agent': 'Nightjar-Release-Verification/1' },
    });
  } catch {
    throw new Error('Public endpoint probe failed for ' + name + ' (network/timeout).');
  }
  await response.body?.cancel?.();
  const status = response.status;
  if (status === 200) return { name, httpStatus: status, outcome: 'reachable' };
  if (status === 404) return { name, httpStatus: status, outcome: 'inconclusive: branding may not be configured' };
  throw new Error('Unexpected HTTP ' + status + ' for allowlisted endpoint ' + name);
}

export function activeMetadata(name, region, command = execFileSync) {
  const output = command('gcloud', [
    'functions', 'describe', name, '--gen2',
    '--region=' + region, '--project=' + PROJECT_ID, '--format=json',
  ], { encoding: 'utf8', timeout: 30000, maxBuffer: 2 * 1024 * 1024 });
  const details = JSON.parse(output);
  const functionName = String(details.name || '');
  const state = String(details.state || '');
  if (!functionName.endsWith('/functions/' + name) || state !== 'ACTIVE') {
    throw new Error('Cloud Functions metadata was not ACTIVE for ' + name);
  }
  return { name, region, state, runtime: details.buildConfig?.runtime || null, updatedAt: details.updateTime || null };
}

export async function verify() {
  const temp = process.env.RUNNER_TEMP || '.';
  const rawLog = fs.existsSync(path.join(temp, 'nightjar-deploy.log'))
    ? fs.readFileSync(path.join(temp, 'nightjar-deploy.log'), 'utf8') : '';
  const scope = process.env.REQUESTED_SCOPE || '';
  const selection = process.env.SELECTED_FUNCTIONS || '';
  const outputPath = path.join(temp, 'nightjar-verify.json');
  const record = { schema: 1, project: PROJECT_ID, status: 'running', note: '', functions: [], probes: [] };
  try {
    const targets = selectedTargets(scope, selection, rawLog);
    if (scope === 'functions:selected' && !targets.every((t) => t.updated)) {
      // A function may be skipped as already up-to-date, so validate ACTIVE
      // metadata but report that this is not evidence of a new update.
      record.note = 'Some selected functions were not reported as updated; ACTIVE does not prove a new revision.';
    }
    if (targets.length === 0) {
      record.status = 'not-applicable';
      record.note = 'No individual Function update was reported. No mutating HTTP smoke tests performed.';
    } else {
      for (const item of targets) {
        if (!/^[a-z]+-[a-z]+\d$/.test(item.region)) throw new Error('Unknown function region for ' + item.name);
        record.functions.push(activeMetadata(item.name, item.region));
        const probe = await httpProbe(item.name);
        if (probe) record.probes.push(probe);
      }
      record.status = 'success';
      if (!record.note) record.note = 'Checked read-only Cloud Functions ACTIVE metadata; public probes run only for allowlisted branding endpoints.';
    }
  } catch (error) {
    record.status = 'failure';
    record.note = String(error.message || error).slice(0, 240);
    fs.writeFileSync(outputPath, JSON.stringify(record, null, 2) + '\n');
    throw error;
  }
  fs.writeFileSync(outputPath, JSON.stringify(record, null, 2) + '\n');
  process.stdout.write('Nightjar post-deployment checks: ' + record.status +
    ' | functions=' + record.functions.length + ' | public probes=' + record.probes.length + '\n');
}

if (process.argv[1]?.endsWith('/firebase-backend-verify.mjs')) {
  verify().catch((err) => {
    console.error('Nightjar verification failed: ' + String(err.message || err).slice(0, 240));
    process.exitCode = 1;
  });
}
