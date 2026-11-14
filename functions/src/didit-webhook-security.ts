import { createHmac, timingSafeEqual } from 'node:crypto';

const equalHmac = (rawBody: Buffer, signature: string, secret: string): boolean => {
  if (!/^[a-f\d]{64}$/i.test(signature) || !secret) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest();
  const supplied = Buffer.from(signature, 'hex');
  return supplied.length === expected.length && timingSafeEqual(expected, supplied);
};

/**
 * Didit signs the exact raw HTTP request body. Do not parse/re-serialise JSON
 * before verifying X-Signature-V2: whitespace and property order are signed.
 * X-Signature remains supported for legacy v1 destinations and is also checked
 * against the raw body. X-Signature-Simple is deliberately not accepted.
 */
export const diditWebhookSignatureValid = (
  rawBody: Buffer,
  signatureV2: string,
  signatureV1: string,
  secret: string,
): boolean => Boolean(secret) &&
  (equalHmac(rawBody, signatureV2, secret) || equalHmac(rawBody, signatureV1, secret));
