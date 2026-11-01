// Nightjar release-scope guard. A frontend-only release may use the approved
// Hosting pipeline without being blocked by newly disclosed vulnerabilities in
// *unchanged* backend dependencies. Any backend/rules/config edit fails closed
// into mandatory Cloud Functions audit. Separate scheduled audits remain active.
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';

export function requiresBackendAudit(changedFiles) {
  return changedFiles.some(path => /^(?:functions\/|firestore\.rules$|storage\.rules$|firestore\.indexes\.json$|firebase\.json$|\.firebaserc$)/.test(path));
}

export function classifyRelease(changedFiles) {
  if (!Array.isArray(changedFiles) || changedFiles.length === 0 ||
      changedFiles.some(path => typeof path !== 'string' || !path.trim())) {
    throw new Error('Cannot prove a safe change scope. Run full backend audit.');
  }
  return { backendChanged: requiresBackendAudit(changedFiles), changedCount: changedFiles.length };
}

if (process.argv[1]?.endsWith('ci-release-scope.mjs')) {
  try {
    const output = execFileSync('git', ['diff','--name-only','HEAD^','HEAD','--'], {
      encoding: 'utf8', stdio: ['ignore','pipe','pipe'],
    });
    const paths = output.split('\n').filter(Boolean);
    const { backendChanged, changedCount } = classifyRelease(paths);
    const label = backendChanged ? 'backend/material changes — strict security audit required'
      : 'Hosting-only change — validate frontend and keep backend dependency audit separate';
    console.log('Nightjar release scope:', label, '('+changedCount+' files)');
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT,
      'backend_changed=' + (backendChanged ? 'true' : 'false') + '\n');
    else console.log('backend_changed=' + (backendChanged ? 'true' : 'false'));
  } catch (error) {
    console.error('Nightjar release scope could not be safely determined:', String(error));
    process.exitCode = 1;
  }
}
