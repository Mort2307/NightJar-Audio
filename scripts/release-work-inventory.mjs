import fs from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';

const strict = process.argv.includes('--strict');
const inventory = JSON.parse(fs.readFileSync('docs/release-pr-review.json', 'utf8'));
const repository = inventory.repository;
const blockers = [];
const warnings = [];
const sha = (value) => String(value ?? '').slice(0, 12);

const git = (...args) => {
  try { return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); }
  catch { return null; }
};
const branch = git('branch', '--show-current');
const commit = git('rev-parse', 'HEAD');
const main = git('rev-parse', 'refs/remotes/origin/main');
const dirty = git('status', '--porcelain');

console.log('\nNIGHTJAR — RELEASE WORK INVENTORY');
console.log('Release branch: ' + (branch ?? 'UNKNOWN'));
console.log('Local commit:   ' + (sha(commit) || 'UNKNOWN'));
console.log('Remote main:    ' + (sha(main) || 'NOT FETCHED'));
console.log('Source audit:   ' + inventory.auditedOn);

if (!branch || !commit) blockers.push('Not running in a readable Git checkout.');
if (branch && branch !== inventory.candidateBranch && branch !== 'main') {
  blockers.push('Unexpected release checkout: ' + branch);
}
if (dirty === null) blockers.push('Could not check working-tree cleanliness.');
else if (dirty) blockers.push('Uncommitted files detected. Commit or stash before installation/release.');

if (!main) blockers.push('origin/main is missing. First run git fetch origin --prune.');
else if (commit && spawnSync('git', ['merge-base', '--is-ancestor', main, commit]).status !== 0) {
  blockers.push('Release checkout is behind or diverged from origin/main.');
}

const decisions = new Set(['current_candidate', 'included', 'superseded', 'deferred', 'pending_review']);
for (const item of inventory.items) {
  if (!decisions.has(item.decision)) blockers.push('Unknown decision for PR #' + item.number + '.');
  const tip = git('rev-parse', '--verify', 'refs/remotes/origin/' + item.branch);
  const includedByAncestry = Boolean(tip && commit && spawnSync('git', ['merge-base', '--is-ancestor', tip, commit]).status === 0);
  const trace = !tip ? 'branch not fetched' : includedByAncestry ? 'Git ancestry included' : 'distinct Git history (compare contents)';
  const review = item.decision === 'pending_review'
    ? 'REVIEW REQUIRED'
    : item.decision === 'current_candidate'
      ? 'CURRENT CANDIDATE'
      : item.decision.toUpperCase();
  console.log('PR #' + String(item.number).padStart(2) + '  ' + review.padEnd(18) + ' ' + trace);
  if (item.decision === 'pending_review' && !includedByAncestry) {
    blockers.push('PR #' + item.number + ' has no approved release disposition: ' + item.reason);
  }
  // A missing reviewer, review timestamp or substantial explanation is not
  // an acceptable way to silently classify code as shipped/superseded/deferred.
  if (['included', 'superseded', 'deferred'].includes(item.decision)) {
    if (!item.reviewedBy || !item.reviewedAt || !item.reason || item.reason.length < 20) {
      blockers.push('PR #' + item.number + ' needs reviewer, date and substantive reason before ' + item.decision + '.');
    }
  }
  if (!tip) warnings.push('Cannot compare origin/' + item.branch + '; fetch latest branches.');
}

// Verify live GitHub PRs and exact-commit check runs when authenticated.
// GitHub CLI is optional; no tokens are written to disk or printed.
const ghRequest = async (endpoint) => {
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (token) {
    const response = await fetch('https://api.github.com/repos/' + repository + endpoint, {
      headers: { accept: 'application/vnd.github+json', authorization: 'Bearer ' + token, 'x-github-api-version': '2022-11-28' },
    });
    if (!response.ok) throw new Error('GitHub returned HTTP ' + response.status);
    return response.json();
  }
  const result = spawnSync('gh', ['api', 'repos/' + repository + endpoint], {
    encoding: 'utf8', maxBuffer: 4 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error('No authenticated gh CLI or GH_TOKEN/GITHUB_TOKEN available.');
  return JSON.parse(result.stdout);
};

try {
  const openPulls = await ghRequest('/pulls?state=open&per_page=100');
  const known = new Set(inventory.items.map((item) => Number(item.number)));
  for (const pr of openPulls) {
    if (!known.has(pr.number)) blockers.push('Untracked OPEN PR #' + pr.number + ': ' + pr.title);
  }
  const knownOpen = new Set(openPulls.map((pr) => pr.number));
  console.log('\nLive open pull requests: ' + openPulls.length);
  for (const item of inventory.items) {
    if (!knownOpen.has(item.number)) warnings.push('PR #' + item.number + ' no longer open; refresh inventory and verify its merge or closure.');
  }
  if (commit) {
    const checks = await ghRequest('/commits/' + commit + '/check-runs?per_page=100');
    const statuses = checks.check_runs ?? [];
    if (!statuses.length) blockers.push('No GitHub Actions check runs found for this exact commit.');
    for (const item of statuses) {
      const healthy = item.status === 'completed' && ['success', 'neutral', 'skipped'].includes(item.conclusion);
      console.log('CI ' + item.name + ': ' + (item.conclusion ?? item.status));
      if (!healthy) blockers.push('GitHub CI not green for commit ' + sha(commit) + ': ' + item.name);
    }
  }
} catch (error) {
  warnings.push('Live GitHub PR/check discovery unavailable: ' + (error instanceof Error ? error.message : String(error)));
  if (strict) blockers.push('Release cannot be certified without live open-PR and check-run verification.');
}

console.log('\n' + (blockers.length ? 'RELEASE BLOCKERS (' + blockers.length + ')' : 'No tracked release blockers'));
for (const item of blockers) console.log('  BLOCK: ' + item);
for (const item of warnings) console.log('  NOTE:  ' + item);
console.log('Inventory: docs/RELEASE_INVENTORY_2026-10-10.md');
console.log('Reviewer decisions: docs/release-pr-review.json');
if (strict && blockers.length) {
  console.error('\nSTOP: Nightjar is not cleared for full production installation.');
  process.exitCode = 1;
} else {
  console.log('\n' + (blockers.length ? 'Inventory only — do not deploy yet.' : 'Inventory checks clear; technical and device QA remain required.'));
}
