import test from 'node:test';
import assert from 'node:assert/strict';
import { analyseChange, batches, parseIndex } from './firebase-backend-plan.mjs';
import { parseDeployLog, buildReport } from './firebase-backend-report.mjs';
import { selectedTargets, activeMetadata, httpProbe } from './firebase-backend-verify.mjs';

const base = [
  'import { onRequest } from "firebase-functions/v2/https";',
  'const shared = 42;',
  'export const alpha = onRequest(() => shared);',
  'export const beta = onRequest(() => 2);',
].join('\n');
const sourceChange = base.replace('() => 2', '() => 3');
const sharedChange = base.replace('shared = 42', 'shared = 99');

const input = (after, changed = ['functions/src/index.ts']) =>
  ({ baseSource: base, headSource: after, changedFiles: changed, base: 'a', head: 'b' });

test('identifies a changed exported function without approving a deployment', () => {
  const r = analyseChange(input(sourceChange));
  assert.equal(r.mode, 'direct-export-candidates');
  assert.deepEqual(r.candidates, ['beta']);
  assert.deepEqual(r.batches, [['beta']]);
  assert.match(r.note, /advisory/);
});

test('shared helper edits block automatic narrowing even when no export body changes', () => {
  const r = analyseChange(input(sharedChange));
  assert.equal(r.mode, 'review-required');
  assert.deepEqual(r.batches, []);
  assert.ok(r.sharedImpact.some((x) => x.includes('Shared')));
});

test('changed imported module requires broad-impact review', () => {
  const r = analyseChange(input(base, ['functions/src/didit.ts']));
  assert.equal(r.mode, 'review-required');
  assert.deepEqual(r.batches, []);
});

test('removed exports require manual retention/deletion decisions', () => {
  const r = analyseChange(input(base.replace(/export const beta.*\n?/, '')));
  assert.equal(r.mode, 'review-required');
  assert.deepEqual(r.removedExports, ['beta']);
});

test('no backend code change produces no deployment suggestion', () => {
  const r = analyseChange(input(sourceChange, ['src/App.tsx']));
  assert.equal(r.mode, 'none');
  assert.deepEqual(r.batches, []);
});

test('invalid baseline never produces deployable batches', () => {
  const r = analyseChange({ ...input(sourceChange), baseSource: null });
  assert.equal(r.mode, 'review-required');
  assert.deepEqual(r.batches, []);
});

test('10-item batch size with hard max 20', () => {
  assert.deepEqual(batches(['z', 'a', 'a', 'b'], 2), [['a', 'b'], ['z']]);
  assert.throws(() => batches(['a'], 21));
});

test('TypeScript parser captures direct exports and reexports', () => {
  const p = parseIndex('export { diditWebhook } from "./didit";\nexport const f = 1;');
  assert.ok(p.exported.has('diditWebhook'));
  assert.ok(p.exported.has('f'));
});

test('sanitize ANSI Firebase deploy output and identify successful updates', () => {
  const parsed = parseDeployLog('\u001b[32m✔\u001b[0m functions[brandIcon192(europe-west2)] Successful update operation.\n✔ Deploy complete!\nWarning: one warning');
  assert.deepEqual(parsed.updatedFunctions, [{ name: 'brandIcon192', region: 'europe-west2' }]);
  assert.equal(parsed.deploymentComplete, true);
  assert.equal(parsed.warningCount, 1);
});

test('failed deployment cannot claim success in sanitized report', () => {
  const report = buildReport({
    rawLog: 'Error: 403 permission denied', verification: null,
    scope: 'functions:selected', selection: 'brandIcon192', conclusion: 'failure',
    sha: 'abc', runId: '1', durationSeconds: 14,
  });
  assert.equal(report.result, 'failure');
  assert.deepEqual(report.confirmedUpdatedFunctions, []);
  assert.deepEqual(report.requestedFunctions, ['brandIcon192']);
});

test('only explicitly named functions can be verified', () => {
  const r = selectedTargets('functions:selected', 'brandIcon192',
    'functions[brandIcon192(europe-west2)] Successful update operation.');
  assert.deepEqual(r, [{ name: 'brandIcon192', region: 'europe-west2', updated: true }]);
  assert.throws(() => selectedTargets('functions:selected', 'unsafe/123', ''));
  assert.deepEqual(selectedTargets('firestore:rules', 'brandIcon192', ''), []);
});

test('metadata check requires ACTIVE and exact function name', () => {
  const fake = () => JSON.stringify({ name: 'projects/nightjar-audio/locations/europe-west2/functions/brandIcon192', state: 'ACTIVE', buildConfig: { runtime: 'nodejs22' } });
  assert.equal(activeMetadata('brandIcon192', 'europe-west2', fake).runtime, 'nodejs22');
  assert.throws(() => activeMetadata('brandIcon192', 'europe-west2', () => '{"name":"wrong","state":"ACTIVE"}'));
});

test('only branding GET endpoints are probed, 404 remains inconclusive', async () => {
  let calls = 0;
  const fakeFetch = async (url, options) => {
    calls += 1;
    assert.match(url, /app-icons\/nightjar-192\.png/);
    assert.equal(options.method, 'GET');
    return { status: 404, body: { cancel: async () => {} } };
  };
  const outcome = await httpProbe('brandIcon192', fakeFetch);
  assert.match(outcome.outcome, /inconclusive/);
  assert.equal(await httpProbe('diditWebhook', fakeFetch), null);
  assert.equal(calls, 1);
});
