import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// CORS changes ONLY: use an explicit authenticated JSON API PATCH, rather
// than gcloud's generic bucket-update code path that returned GcsApiError('')
// without useful diagnostics on the original Nightjar deployment.
const [bucketMetadataPath, corsPolicyPath] = process.argv.slice(2);
if (!bucketMetadataPath || !corsPolicyPath) throw new Error('Usage: apply-nightjar-audio-cors.mjs <bucket-metadata.json> <cors-rules.json>');
const bucket = JSON.parse(readFileSync(bucketMetadataPath, 'utf8'));
const cors = JSON.parse(readFileSync(corsPolicyPath, 'utf8'));
assert.equal(bucket.name, 'nightjar-audio.firebasestorage.app', 'Wrong Cloud Storage bucket');
assert.ok(Array.isArray(cors) && cors.length >= 1 && cors.length <= 100, 'Invalid prepared CORS rule array');
const permitted = ['https://nightjar-audio.web.app', 'https://nightjar-audio.firebaseapp.com'];
assert.ok(cors.some(rule => permitted.every(origin => rule.origin?.includes(origin)) && rule.method?.includes('GET')), 'Approved Nightjar origins missing');
const original = Array.isArray(bucket.cors) ? bucket.cors : [];
assert.ok(original.every(rule => cors.some(candidate => JSON.stringify(candidate) === JSON.stringify(rule))), 'Existing CORS policy would be changed or removed');

const token = execFileSync('gcloud', ['auth','print-access-token'], { encoding: 'utf8', stdio: ['ignore','pipe','pipe'] }).trim();
assert.ok(token.length > 30, 'Missing short-lived GCP access token');
const urlBase = 'https://storage.googleapis.com/storage/v1/b/nightjar-audio.firebasestorage.app';
const headers = { Authorization: 'Bearer ' + token, Accept: 'application/json' };
const request = async (url, options = {}) => {
  const response = await fetch(url, { ...options, headers: { ...headers, ...(options.headers || {}) }, signal: AbortSignal.timeout(25000) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = data?.error?.code ?? response.status;
    const message = String(data?.error?.message || response.statusText || 'Unknown error').slice(0, 550);
    throw new Error('Cloud Storage API HTTP ' + code + ': ' + message);
  }
  return data;
};
const checks = await request(urlBase + '/iam/testPermissions?permissions=storage.buckets.get&permissions=storage.buckets.update');
const hasUpdate = (checks.permissions || []).includes('storage.buckets.update');
if (!hasUpdate) {
  throw new Error(
    'Missing IAM permission: storage.buckets.update on bucket nightjar-audio.firebasestorage.app for '
    + 'nightjar-backend-deploy@nightjar-audio.iam.gserviceaccount.com. '
    + 'The service account can read the bucket but cannot change CORS. '
    + 'Ask a Google Cloud IAM administrator to grant a narrowly scoped custom role containing '
    + 'storage.buckets.get and storage.buckets.update on this bucket, or apply the exact reviewed '
    + 'CORS config from an owner-authenticated Cloud Shell. Do not grant public object access.'
  );
}
console.log('PASS: verified storage.buckets.update permission on Nightjar audio bucket.');

const now = await request(urlBase + '?fields=name,metageneration,cors');
assert.equal(now.name, bucket.name, 'Storage bucket changed');
const nowCors = Array.isArray(now.cors) ? now.cors : [];
assert.ok(nowCors.every(rule => cors.some(candidate => JSON.stringify(candidate) === JSON.stringify(rule))), 'CORS was modified by another process; refusing to overwrite.');
const active = nowCors.some(rule => permitted.every(origin => rule.origin?.includes(origin))
  && rule.method?.includes('GET'));
if (active) {
  console.log('PASS: Nightjar CORS was already activated; no write necessary.');
} else {
  // PATCH only the CORS property. ifMetagenerationMatch protects concurrent
  // changes, including those to unrelated bucket metadata.
  const url = urlBase + '?fields=name,cors&ifMetagenerationMatch=' + encodeURIComponent(String(now.metageneration));
  await request(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cors }),
  });
  console.log('Nightjar Cloud Storage CORS PATCH accepted.');
}
const verified = await request(urlBase + '?fields=name,cors');
assert.equal(verified.name, bucket.name, 'Verification returned another bucket');
assert.ok((verified.cors || []).some(rule => permitted.every(origin => rule.origin?.includes(origin))
  && rule.method?.includes('GET')), 'Read-after-write verification failed');
assert.ok(original.every(rule => (verified.cors || []).some(candidate =>
  JSON.stringify(candidate) === JSON.stringify(rule))), 'Original CORS rules not preserved after write');
console.log('PASS: Nightjar EQ CORS now verified for official Hosting origins. Bucket ACLs, object permissions and signed URLs unchanged.');
