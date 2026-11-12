import { createHmac } from 'node:crypto';
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { diditWebhookSignatureValid } from './didit-webhook-security.js';

const secret = 'nightjar-didit-webhook-test-secret';
const rawBody = Buffer.from('{\n  "status": "Approved",\n  "event_id": "evt-123"\n}', 'utf8');
const sign = (body: Buffer, key = secret) =>
  createHmac('sha256', key).update(body).digest('hex');

test('accepts Didit v3 X-Signature-V2 HMAC over the exact raw body', () => {
  assert.equal(diditWebhookSignatureValid(rawBody, sign(rawBody), '', secret), true);
});

test('does not accept a signature over re-serialised or canonicalised JSON', () => {
  const canonical = Buffer.from('{"event_id":"evt-123","status":"Approved"}', 'utf8');
  assert.notEqual(sign(canonical), sign(rawBody));
  assert.equal(diditWebhookSignatureValid(rawBody, sign(canonical), '', secret), false);
});

test('accepts the legacy X-Signature header only when it signs the raw body', () => {
  assert.equal(diditWebhookSignatureValid(rawBody, '', sign(rawBody), secret), true);
  assert.equal(diditWebhookSignatureValid(rawBody, '', sign(Buffer.from('tampered')), secret), false);
});

test('rejects tampered bodies, wrong secrets, malformed signatures and empty secrets', () => {
  const signature = sign(rawBody);
  assert.equal(diditWebhookSignatureValid(Buffer.from(rawBody.toString().replace('Approved', 'Declined')), signature, '', secret), false);
  assert.equal(diditWebhookSignatureValid(rawBody, signature, '', 'wrong-secret'), false);
  assert.equal(diditWebhookSignatureValid(rawBody, 'not-a-signature', '', secret), false);
  assert.equal(diditWebhookSignatureValid(rawBody, signature, '', ''), false);
  assert.equal(diditWebhookSignatureValid(rawBody, '', '', secret), false);
});
