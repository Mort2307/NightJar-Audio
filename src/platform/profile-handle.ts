/**
 * Client-side feedback for the same handle contract enforced by saveMyProfile.
 * A handle is optional; only non-empty handles must match the server rule.
 */
export const normaliseNightjarHandle = (value: unknown): string =>
  String(value ?? '').trim().replace(/^@+/, '').toLowerCase();

export const nightjarHandleError = (value: unknown): string => {
  const handle = normaliseNightjarHandle(value);
  if (!handle || /^[a-z0-9_-]{3,30}$/.test(handle)) return '';
  return 'The @handle must be 3–30 letters, numbers, underscores or hyphens, without spaces. You can leave it blank if you prefer.';
};

export const suggestNightjarHandle = (value: unknown): string => {
  const candidate = normaliseNightjarHandle(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '')
    .slice(0, 30);
  return /^[a-z0-9_-]{3,30}$/.test(candidate) ? candidate : '';
};
