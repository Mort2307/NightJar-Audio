import { createHmac, timingSafeEqual } from 'node:crypto';

const equalHmac = (payload: Buffer | string, signature: string, secret: string): boolean => {
  if (!/^[a-f\\d]{64}$/i.test(signature) || !secret) return false;
  const expected = createHmac('sha256', secret).update(payload).digest();
  const supplied = Buffer.from(signature, 'hex');
  return supplied.length === expected.length && timingSafeEqual(expected, supplied);
};

/** Reproduce Didit's V2 canonical JSON: recursively sorted keys and compact UTF-8 JSON. */
const canonicalDiditJson = (rawBody: Buffer): string | null => {
  try {
    const parsed: unknown = JSON.parse(rawBody.toString('utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;

    const sortKeys = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(sortKeys);
      if (value !== null && typeof value === 'object') {
        const record = value as Record<string, unknown>;
        return Object.keys(record).sort().reduce<Record<string, unknown>>((sorted, key) => {
          sorted[key] = sortKeys(record[key]);
          return sorted;
        }, {});
      }
      return value;
    };

    return JSON.stringify(sortKeys(parsed));
  } catch {
    return null;
  }
};

/**
 * Didit X-Signature-V2 signs canonical JSON (sorted keys, compact separators,
 * Unicode preserved). Legacy X-Signature signs the exact raw request bytes.
 * X-Signature-Simple is deliberately not accepted because it does not
 * authenticate the decision payload.
 */
export const diditWebhookSignatureValid = (
  rawBody: Buffer,
  signatureV2: string,
  signatureV1: string,
  secret: string,
): boolean => {
  if (!secret) return false;

  if (signatureV2) {
    const canonical = canonicalDiditJson(rawBody);
    if (canonical !== null && equalHmac(canonical, signatureV2, secret)) return true;
  }

  return Boolean(signatureV1) && equalHmac(rawBody, signatureV1, secret);
};
