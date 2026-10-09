import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

const read = (path) => fs.readFileSync(path, 'utf8');
const functions = read('functions/src/index.ts');
const handler = read('functions/src/didit.ts');
const app = read('src/App.tsx');
const hosting = JSON.parse(read('firebase.json'));
const has = (source, marker) => assert.ok(source.includes(marker), 'Didit contract missing: ' + marker);

for (const [name, source] of [['functions', functions], ['UI', app]]) {
  assert.equal(/yoti/i.test(source), false, 'Yoti must not remain active in ' + name);
}
for (const marker of [
  "data?.provider === 'didit'", "data?.environment === 'production'",
  "data?.reverifyRequired !== true", 'startDiditAgeAssurance(identity.uid)',
]) has(functions, marker);
for (const marker of [
  'request.rawBody', 'X-Signature-V2', 'X-Timestamp', 'timingSafeEqual', '> 300',
  'diditWebhookEvents', '.doc(payload.event_id).create(record)',
  'readCurrentDecision(sessionId)', 'processDiditWebhookEvent = onDocumentCreated',
  'DIDIT_ADULT_WORKFLOW_CONFIRMED', 'DIDIT_PRODUCTION_APPROVED',
  "currentSession.environment === 'live'", 'SANDBOX_APPROVED',
]) has(handler, marker);
assert.equal(handler.includes("request.get('X-Signature-Simple')"), false,
  'Deprecated partial-body signature may not grant access.');
assert.equal(handler.includes('console.log(raw'), false, 'Webhook raw payload must not be logged.');
assert.equal(hosting.hosting.rewrites[0].source, '/api/webhooks/didit');
assert.equal(hosting.hosting.rewrites[0].function.functionId, 'diditWebhook');
for (const eventType of [
  'status.updated', 'data.updated', 'user.status.updated', 'user.data.updated',
  'business.status.updated', 'business.data.updated', 'activity.created',
  'transaction.created', 'transaction.status.updated', 'travel_rule.status.updated',
]) has(handler, "'" + eventType + "'");
has(functions, 'const AGE_ASSURANCE_CONFIGURED = false');

const unicode = JSON.stringify({ a: 'Zoë', z: 3 });
const secret = 'test-secret';
const hmac = crypto.createHmac('sha256', secret).update(unicode, 'utf8').digest();
assert.equal(crypto.timingSafeEqual(hmac, crypto.createHmac('sha256', secret).update(unicode).digest()), true);
console.log('Didit security and integration contracts passed.');
