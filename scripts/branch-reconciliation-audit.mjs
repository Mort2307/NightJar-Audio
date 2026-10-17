// Read-only forensic inventory of every remote NightJar branch.
// Never checks out, executes, merges or deletes untrusted historical source.
import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.env.RUNNER_TEMP || 'branch-audit-output';
mkdirSync(root, { recursive: true });
const run = (...args) => execFileSync('git', args, {
  encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
}).trim();
const zlist = (...args) => execFileSync('git', args, {
  encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
}).split('\0').filter(Boolean);
const main = 'refs/remotes/origin/main';
run('rev-parse', '--verify', main);
const refs = run('for-each-ref', '--format=%(refname:short)', 'refs/remotes/origin')
  .split('\n').filter(Boolean).filter(ref =>
    ref !== 'origin' && ref !== 'origin/HEAD' && ref !== 'origin/main'
    && !ref.startsWith('origin/audit/branch-by-branch-mainline-'));
const reviewed = [];
for (const short of refs) {
  const ref = 'refs/remotes/' + short;
  try {
    const sha = run('rev-parse', ref);
    const base = run('merge-base', main, ref);
    const ahead = Number(run('rev-list', '--count', base + '..' + ref));
    const behind = Number(run('rev-list', '--count', base + '..' + main));
    const ancestry = spawnSync('git', ['merge-base', '--is-ancestor', ref, main], { encoding: 'utf8' }).status === 0;
    const touched = zlist('diff', '--name-only', '--no-renames', '-z', base, ref);
    const different = touched.length
      ? zlist('diff', '--name-only', '--no-renames', '-z', main, ref, '--', ...touched)
      : [];
    const branchOnly = different.length
      ? zlist('diff', '--name-only', '--diff-filter=A', '--no-renames', '-z', main, ref, '--', ...different)
      : [];
    const codeOnly = branchOnly.filter(path => /^(src|functions|scripts|tests|\.github\/workflows)\//.test(path));
    const codeDifferent = different.filter(path => /^(src|functions|scripts|tests|\.github\/workflows)\//.test(path));
    const status = ancestry ? 'ancestor_in_main'
      : different.length === 0 ? 'changed_content_already_in_main'
      : codeOnly.length ? 'review_unrepresented_code_files'
      : codeDifferent.length ? 'review_changed_existing_code'
      : 'review_docs_assets_or_config';
    const row = {
      branch: short.replace(/^origin\//, ''), sha: sha.slice(0, 12),
      lastCommit: run('log', '-1', '--format=%cI', ref),
      lastSubject: run('log', '-1', '--format=%s', ref).slice(0, 140),
      ahead, behind, touchedFiles: touched.length, differentFiles: different.length,
      uniqueFileCount: branchOnly.length, uniqueCodeFileCount: codeOnly.length,
      status, uniqueFiles: branchOnly.slice(0, 35),
      differentCode: codeDifferent.slice(0, 24),
    };
    reviewed.push(row);
    console.log('NIGHTJAR_BRANCH_AUDIT_ROW ' + JSON.stringify(row));
  } catch (e) {
    const row = { branch: short.replace(/^origin\//, ''), status: 'audit_error', error: String(e).slice(0, 200) };
    reviewed.push(row);
    console.log('NIGHTJAR_BRANCH_AUDIT_ROW ' + JSON.stringify(row));
  }
}
reviewed.sort((a, b) =>
  (Number(b.uniqueCodeFileCount || 0) - Number(a.uniqueCodeFileCount || 0))
  || (Number(b.differentFiles || 0) - Number(a.differentFiles || 0))
  || a.branch.localeCompare(b.branch));
const byStatus = Object.fromEntries([...new Set(reviewed.map(row => row.status))].sort()
  .map(key => [key, reviewed.filter(row => row.status === key).length]));
const summary = {
  baseline: run('rev-parse', main), totalBranches: reviewed.length,
  byStatus, auditErrors: reviewed.filter(row => row.status === 'audit_error').length,
  warning: 'Different files on an old branch do not prove useful work is missing. Do not merge old branches without separate semantic review.',
};
const escape = x => String(x ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
const lines = [
  '# NightJar full historical branch reconciliation',
  '',
  'Baseline: main @ ' + summary.baseline,
  '',
  'This inventory compares each remote branch against main and its own merge base. It does not merge, deploy, or delete branches.',
  '',
  '> A historical branch with diverged files may merely contain older versions of functionality already released. Files flagged for review are not necessarily missing features.',
  '',
  '## Counts', '', '| Classification | Count |', '|---|---:|',
  ...Object.entries(byStatus).map(([name, count]) => '| ' + name + ' | ' + count + ' |'),
  '',
  '## Every historical branch', '',
  '| Branch | Status | Ahead / behind | Touched | Different vs main | Branch-only code | Branch-only filenames |',
  '|---|---|---:|---:|---:|---:|---|',
  ...reviewed.map(row => '| ' + escape(row.branch) + ' | ' + escape(row.status)
    + ' | ' + (row.ahead ?? '?') + '/' + (row.behind ?? '?')
    + ' | ' + (row.touchedFiles ?? '?') + ' | ' + (row.differentFiles ?? '?')
    + ' | ' + (row.uniqueCodeFileCount ?? '?') + ' | '
    + escape((row.uniqueFiles ?? []).slice(0, 8).join(', ')) + ' |'),
  '',
  'No historical branch was deleted. Semantic product validation and local-uncommitted-file discovery are separate tasks.',
];
const report = { summary, branches: reviewed };
const reportPath = join(root, 'nightjar-branch-audit.json');
const mdPath = join(root, 'nightjar-branch-audit.md');
writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
writeFileSync(mdPath, lines.join('\n') + '\n');
console.log('NIGHTJAR_BRANCH_AUDIT_SUMMARY ' + JSON.stringify(summary));
console.log('Audit report files: ' + reportPath + ', ' + mdPath);
if (process.env.GITHUB_STEP_SUMMARY) {
  const compact = lines.slice(0, lines.indexOf('## Every historical branch'));
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, compact.join('\n') + '\n');
}
if (summary.auditErrors) process.exitCode = 1;
