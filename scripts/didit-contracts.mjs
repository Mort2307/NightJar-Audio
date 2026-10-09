import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

const read = (path) => fs.readFileSync(path, 'utf8');
const functions = read('functions/src/index.ts');
const handler = read('functions/src/didit.ts');
const app = read('src/App.tsx');
const hosting = JSON.parse(read('firebase.json'));

for (const [name, source] of [['functions', functions], ['UI', app]]) {
  assert.equal(/yoti/i.test(source), false, 'Yoti must not remain active in ' + name);
}
assert.match(functions, /data\\?\\.provider === 'didit'/);
assert.match(functions, /data\\?\\.environment === 'production'/);
assert.match(functions, /data\\?\\.reverifyRequired !== true/);
assert.match(functions, /startDiditAgeAssurance\\(identity\\.uid\\)/);
assert.match(handler, /request\\.rawBody/);
assert.match(handler, /X-Signature-V2/);
assert.match(handler, /X-Timestamp/);
assert.match(handler, /timingSafeEqual/);
assert.match(handler, /300/);
assert.match(handler, /diditWebhookEvents/);
assert.match(handler, /\\.doc\\(payload\\.event_id\\)\\.create\\(record\\)/);
assert.match(handler, /readCurrentDecision\\(sessionId\\)/);
assert.match(handler, /processDiditWebhookEvent = onDocumentCreated/);
assert.match(handler, /DIDIT_ADULT_WORKFLOW_CONFIRMED/);
assert.match(handler, /DIDIT_PRODUCTION_APPROVED/);
assert.match(handler, /currentSession\\.environment === 'live'/);
assert.match(handler, /SANDBOX_APPROVED/);
assert.equal(handler.includes("request.get('X-Signature-Simple')"), false, 'Deprecated partial signature is forbidden');
assert.equal(/console\\.log\\(.*raw/i.test(handler), false, 'Webhook raw payload must not be logged');
assert.equal(hosting.hosting.rewrites[0].source, '/api/webhooks/didit');
assert.equal(hosting.hosting.rewrites[0].function.functionId, 'diditWebhook');

for (const eventType of [
  'status.updated', 'data.updated', 'user.status.updated', 'user.data.updated',
  'business.status.updated', 'business.data.updated', 'activity.created',
  'transaction.created', 'transaction.status.updated', 'travel_rule.status.updated',
]) assert.ok(handler.includes("'" + eventType + "'"), 'Missing webhook family ' + eventType);

assert.ok(functions.includes('const AGE_ASSURANCE_CONFIGURED = false'),
  'Sandbox branch must not claim launch readiness without live approval');

// Demonstrate constant-time HMAC equivalence using a Unicode name, not a PII fixture.
const sorted = JSON.stringify({ a: 'Zoë', z: 3 });
const sig = crypto.createHmac('sha256', 'test-secret').update(sorted, 'utf8').digest();
assert.equal(crypto.timingSafeEqual(sig, crypto.createHmac('sha256', 'test-secret').update(sorted).digest()), true);

console.log('Didit security and integration contracts passed.');
