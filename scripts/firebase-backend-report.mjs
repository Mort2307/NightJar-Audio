#!/usr/bin/env node
// Sanitized, auditable Firebase deployment report. Never upload raw Firebase logs.
import fs from 'node:fs';
import path from 'node:path';

const stripAnsi = (value) => value.replace(/\u001b\[[0-9;]*m/g, '');
const tick = String.fromCharCode(96);
const safeCell = (value) => String(value).replace(/[\r\n|]/g, ' ').slice(0, 240);

export function parseDeployLog(raw) {
  const text = stripAnsi(raw);
  const updates = [];
  const successes = /functions\[([A-Za-z][A-Za-z0-9_-]*)\(([a-z]+-[a-z]+\d)\)\]\s+Successful (?:update|create) operation/gi;
  for (const match of text.matchAll(successes)) {
    updates.push({ name: match[1], region: match[2] });
  }
  const unique = [...new Map(updates.map((item) => [item.name + '/' + item.region, item])).values()];
  return {
    updatedFunctions: unique,
    deploymentComplete: text.includes('Deploy complete!'),
    warningCount: text.split(/\r?\n/).filter((line) => /(^|\s)(?:warn(?:ing)?|deprecated)\s*:/i.test(line) || /⚠|warning:/i.test(line)).length,
    errorCount: text.split(/\r?\n/).filter((line) => /(^|\s)(?:error|failed):/i.test(line) || /HTTP Error:\s*[45]\d\d/i.test(line)).length,
  };
}

export function buildReport({ rawLog, verification, scope, selection, conclusion, sha, runId, durationSeconds }) {
  const parsed = parseDeployLog(rawLog);
  const selected = scope === 'functions:selected'
    ? [...new Set(selection.split(',').map((x) => x.trim()).filter(Boolean))].sort()
    : [];
  const record = {
    schema: 1, project: 'nightjar-audio', commit: sha, runId, scope,
    result: conclusion, durationSeconds,
    requestedFunctions: selected, confirmedUpdatedFunctions: parsed.updatedFunctions,
    firebaseCompleted: parsed.deploymentComplete, warningsDetected: parsed.warningCount,
    errorsDetected: parsed.errorCount,
    postDeployChecks: verification?.functions ?? [],
    endpointProbes: verification?.probes ?? [],
    verificationStatus: verification?.status ?? 'not-run',
    verificationNote: verification?.note ?? 'No post-deployment verification was run.',
  };
  return record;
}

export function reportMarkdown(report) {
  const out = ['### Nightjar Firebase backend release report', '',
    '| Metric | Result |', '| --- | --- |',
    '| Project | ' + tick + report.project + tick + ' |',
    '| Commit | ' + tick + safeCell(report.commit) + tick + ' |',
    '| GitHub run | ' + safeCell(report.runId) + ' |',
    '| Requested scope | ' + tick + safeCell(report.scope) + tick + ' |',
    '| Job conclusion | **' + safeCell(report.result) + '** |',
    '| Deployment step output | ' + (report.firebaseCompleted ? 'Firebase reported complete' : 'Not confirmed / no write requested') + ' |',
    '| Duration (deployment step) | ' + (report.durationSeconds === null ? 'Not recorded' : report.durationSeconds + ' seconds') + ' |',
    '| Firebase log warnings / errors | ' + report.warningsDetected + ' / ' + report.errorsDetected + ' (counts only) |',
    '| Metadata verification | ' + safeCell(report.verificationStatus) + ' |',
    '',
  ];
  if (report.requestedFunctions.length) out.push('**Requested functions:** ' + report.requestedFunctions.map((n) => tick + n + tick).join(', '), '');
  if (report.confirmedUpdatedFunctions.length) {
    out.push('**Firebase-confirmed updated functions:**', '');
    for (const f of report.confirmedUpdatedFunctions) out.push('- ' + tick + safeCell(f.name) + tick + ' (' + safeCell(f.region) + ')');
    out.push('');
  } else if (report.scope !== 'auth-check' && report.scope !== 'plan') {
    out.push('No individual Function update was confirmed in the captured CLI output.', '');
  }
  if (report.postDeployChecks.length) {
    out.push('**Cloud Functions metadata (read-only):**', '');
    for (const check of report.postDeployChecks) out.push('- ' + tick + safeCell(check.name) + tick + ': ' + safeCell(check.state) + ' (' + safeCell(check.region) + ')');
    out.push('');
  }
  if (report.endpointProbes.length) {
    out.push('**Safe public HTTP probes:**', '');
    for (const probe of report.endpointProbes) out.push('- ' + tick + safeCell(probe.name) + tick + ': ' + safeCell(probe.outcome) + ' (HTTP ' + safeCell(probe.httpStatus) + ')');
    out.push('');
  }
  out.push('Only explicit GitHub Actions workflow dispatches can deploy backend resources. No secret values or raw logs are included in the report.', '');
  return out.join('\n');
}

function main() {
  const temp = process.env.RUNNER_TEMP || '.';
  const logFile = path.join(temp, 'nightjar-deploy.log');
  const verifyFile = path.join(temp, 'nightjar-verify.json');
  const startFile = path.join(temp, 'nightjar-deploy-start');
  const endFile = path.join(temp, 'nightjar-deploy-end');
  const read = (file) => fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  let verification = null;
  try { verification = JSON.parse(read(verifyFile)); } catch { /* not run or failed before JSON output */ }
  const start = Number(read(startFile));
  const end = Number(read(endFile));
  const durationSeconds = start > 0 && end >= start ? end - start : null;
  const report = buildReport({
    rawLog: read(logFile), verification,
    scope: process.env.REQUESTED_SCOPE || 'unknown',
    selection: process.env.SELECTED_FUNCTIONS || '',
    conclusion: process.env.NIGHTJAR_JOB_OUTCOME || 'unknown',
    sha: process.env.GITHUB_SHA || 'unknown', runId: process.env.GITHUB_RUN_ID || 'unknown',
    durationSeconds,
  });
  const reportPath = path.join(temp, 'nightjar-backend-release.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
  const summary = reportMarkdown(report);
  process.stdout.write(summary + '\n');
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + '\n');
}

if (process.argv[1]?.endsWith('/firebase-backend-report.mjs')) {
  try { main(); } catch (err) { console.error('Backend release report could not be produced: ' + err.message); process.exitCode = 1; }
}
