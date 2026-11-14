import { createHmac } from 'node:crypto';
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { diditWebhookSignatureValid } from './didit-webhook-security.js';

const secret = 'nightjar-didit-webhook-test-secret';
const sign = (payload: Buffer | string, key = secret) =>
  createHmac('sha256', key).update(payload).digest('hex');

test('accepts Didit V2 signature over sorted, compact canonical JSON', () => {
  const rawBody = Buffer.from('{\n  "status": "Approved",\n  "event_id": "evt-123"\n}', 'utf8');
  const canonical = '{"event_id":"evt-123","status":"Approved"}';
  assert.equal(diditWebhookSignatureValid(rawBody, sign(canonical), '', secret), true);
});

test('V2 canonical JSON preserves Unicode and sorts nested object keys recursively', () => {
  const rawBody = Buffer.from(
    '{"name":"José","nested":{"z":1,"a":2},"items":[{"y":true,"b":false}]}',
    'utf8',
  );
  const canonical = '{"items":[{"b":false,"y":true}],"name":"José","nested":{"a":2,"z":1}}';
  assert.equal(diditWebhookSignatureValid(rawBody, sign(canonical), '', secret), true);
});

test('does not mistake a raw-body HMAC for a valid V2 signature when canonical JSON differs', () => {
  const rawBody = Buffer.from('{\n  "status": "Approved",\n  "event_id": "evt-123"\n}', 'utf8');
  assert.equal(diditWebhookSignatureValid(rawBody, sign(rawBody), '', secret), false);
});

test('accepts legacy X-Signature only when it signs the exact raw body', () => {
  const rawBody = Buffer.from('{\n  "status": "Approved",\n  "event_id": "evt-123"\n}', 'utf8');
  assert.equal(diditWebhookSignatureValid(rawBody, '', sign(rawBody), secret), true);
  assert.equal(diditWebhookSignatureValid(rawBody, '', sign(Buffer.from('tampered')), secret), false);
});

test('falls back to a valid legacy raw-body signature when V2 is absent or invalid', () => {
  const rawBody = Buffer.from('{"event_id":"evt-123","status":"Approved"}', 'utf8');
  assert.equal(diditWebhookSignatureValid(rawBody, '0'.repeat(64), sign(rawBody), secret), true);
});

test('rejects tampered bodies, wrong secrets, malformed signatures, invalid JSON and empty secrets', () => {
  const rawBody = Buffer.from('{"event_id":"evt-123","status":"Approved"}', 'utf8');
  const canonical = '{"event_id":"evt-123","status":"Approved"}';
  const signature = sign(canonical);
  assert.equal(diditWebhookSignatureValid(Buffer.from(rawBody.toString().replace('Approved', 'Declined')), signature, '', secret), false);
  assert.equal(diditWebhookSignatureValid(rawBody, signature, '', 'wrong-secret'), false);
  assert.equal(diditWebhookSignatureValid(rawBody, 'not-a-signature', '', secret), false);
  assert.equal(diditWebhookSignatureValid(Buffer.from('{not json'), signature, '', secret), false);
  assert.equal(diditWebhookSignatureValid(rawBody, signature, '', ''), false);
  assert.equal(diditWebhookSignatureValid(rawBody, '', '', secret), false);
});
