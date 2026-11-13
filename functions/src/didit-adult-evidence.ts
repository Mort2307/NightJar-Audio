type DiditIdVerification = {
  status?: unknown;
  verification_method?: unknown;
  date_of_birth?: unknown;
};

const approvedDocumentWithDateOfBirth = (value: unknown): value is DiditIdVerification => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const id = value as DiditIdVerification;
  if (!['Approved', 'APPROVED'].includes(String(id.status))) return false;
  // Didit v3 supports document, id_lookup and wallet verification methods.
  // Nightjar's adult gate requires documentary DOB evidence specifically.
  if (String(id.verification_method ?? '').toLowerCase() !== 'document') return false;
  if (typeof id.date_of_birth !== 'string') return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(id.date_of_birth);
  if (!match) return false;
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  const dob = new Date(Date.UTC(year, month - 1, day));
  return dob.getUTCFullYear() === year &&
    dob.getUTCMonth() === month - 1 &&
    dob.getUTCDate() === day;
};

const idVerifications = (decision: unknown): unknown[] => {
  if (!decision || typeof decision !== 'object' || Array.isArray(decision)) return [];
  const checks = (decision as Record<string, unknown>).id_verifications;
  return Array.isArray(checks) ? checks : [];
};

// This is only a categorical signal; never persist or expose the date itself.
export const diditDocumentBirthDateReturned = (decision: unknown): boolean =>
  idVerifications(decision).some(approvedDocumentWithDateOfBirth);

// Adult access requires an approved document-based ID verification with a
// real calendar DOB proving the user was already 18 on the decision date.
// ID lookup, wallet credentials, age estimation and generic Approved status
// are not substitutes for this specific Nightjar documentary evidence gate.
export const verifiedAdultFromDecision = (decision: unknown, at = new Date()): boolean => {
  const now = at.getTime();
  if (!Number.isFinite(now)) return false;
  const threshold = new Date(Date.UTC(
    at.getUTCFullYear() - 18,
    at.getUTCMonth(),
    at.getUTCDate(),
  )).getTime();
  return idVerifications(decision).some(value => {
    if (!approvedDocumentWithDateOfBirth(value)) return false;
    const id = value as DiditIdVerification;
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(id.date_of_birth as string);
    if (!match) return false;
    const dob = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return Number.isFinite(dob) && dob <= now && dob <= threshold;
  });
};
