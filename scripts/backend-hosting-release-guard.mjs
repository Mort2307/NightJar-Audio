import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';

// GitHub Hosting deploys are intentionally selective. A functions/src change
// without a recognised, backend-first release tag can silently leave clients
// calling yesterday's Cloud Functions. Reject that mismatch before Hosting.
export function recognisedBackendTags(workflowSource) {
  return [...new Set([...workflowSource.matchAll(/contains\(github\.event\.head_commit\.message,\s*'(\[nightjar-[^']+\])'\)/g)]
    .map(match => match[1]))];
}
export function auditBackendRelease({changedFiles, commitMessage, workflowSource}) {
  const backendChanges = changedFiles.filter(path =>
    /^functions\/src\//.test(path) ||
    /^functions\/package(?:-lock)?\.json$/.test(path));
  if (!backendChanges.length) return {passed:true, backendChanges, matchingTags:[]};
  const matchingTags = recognisedBackendTags(workflowSource).filter(tag => commitMessage.includes(tag));
  return {passed:matchingTags.length > 0, backendChanges, matchingTags};
}
function git(...args) {
  return execFileSync('git', args, {encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
}
if (process.argv[1]?.endsWith('/backend-hosting-release-guard.mjs')) {
  const workflowSource = readFileSync('.github/workflows/firebase-hosting-merge.yml','utf8');
  const changedFiles = git('diff','--name-only','HEAD^','HEAD','--').split('\n').filter(Boolean);
  const commitMessage = git('show','-s','--format=%B','HEAD');
  const result = auditBackendRelease({changedFiles,commitMessage,workflowSource});
  if (!result.passed) {
    console.error('BLOCKED: Cloud Functions changed but no recognised backend-first release tag was present on the merged commit.');
    console.error('Affected paths:', result.backendChanges.join(', '));
    console.error('Re-merge with the reviewed exact selected-function deployment gate; do not run a blind all-backend deploy or disable this check.');
    process.exitCode = 1;
  } else {
    console.log(result.backendChanges.length
      ? 'Backend source changed; recognised release gate(s): ' + result.matchingTags.join(', ')
      : 'No Cloud Functions source change in this commit; Hosting-only workflow permitted.');
  }
}
