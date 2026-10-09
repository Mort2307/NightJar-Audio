/** Keeper-facing intake queues are derived from persisted Firestore application records.
 * A completed application stays in the returned bank as history; never delete it.
 */
export type ProfessionalApplicationRole = 'creator' | 'writer' | 'editor' | 'artist';
export type ProfessionalApplicationBox = 'pending' | 'history' | 'attention';

export type ProfessionalApplicationRecord = {
  status?: string | null;
  requestedRoles?: string[] | null;
  approvedRoles?: string[] | null;
};

const PROFESSIONAL_ROLES: readonly ProfessionalApplicationRole[] = ['creator', 'writer', 'editor', 'artist'];
const OPEN_STATUSES = new Set(['banked', 'waitlist']);
const FINAL_STATUSES = new Set(['approved', 'rejected', 'withdrawn']);

const normaliseRoles = (input: unknown): ProfessionalApplicationRole[] =>
  Array.isArray(input)
    ? Array.from(new Set(input.filter((value): value is ProfessionalApplicationRole =>
      PROFESSIONAL_ROLES.includes(value as ProfessionalApplicationRole))))
    : [];

export function pendingApplicationRoles(application: ProfessionalApplicationRecord): ProfessionalApplicationRole[] {
  const approved = new Set(normaliseRoles(application.approvedRoles));
  return normaliseRoles(application.requestedRoles).filter((role) => !approved.has(role));
}

export function classifyProfessionalApplications<T extends ProfessionalApplicationRecord>(applications: readonly T[]): {
  pending: T[];
  history: T[];
  attention: T[];
} {
  const pending: T[] = [];
  const history: T[] = [];
  const attention: T[] = [];

  for (const application of applications) {
    const status = String(application.status ?? 'banked').toLowerCase();
    const remaining = pendingApplicationRoles(application);
    const approved = normaliseRoles(application.approvedRoles);

    if (FINAL_STATUSES.has(status) || (remaining.length === 0 && approved.length > 0)) {
      // Includes legacy "banked" records whose final role was already approved.
      history.push(application);
    } else if (OPEN_STATUSES.has(status) && remaining.length > 0) {
      pending.push(application);
    } else {
      // Inconsistent/stale records must remain visible, but must not have approval buttons.
      attention.push(application);
    }
  }
  return { pending, history, attention };
}

export function filterProfessionalApplicationsByRole<T extends ProfessionalApplicationRecord>(
  applications: readonly T[],
  role: 'all' | ProfessionalApplicationRole,
): T[] {
  if (role === 'all') return [...applications];
  return applications.filter((item) =>
    normaliseRoles(item.requestedRoles).includes(role) ||
    normaliseRoles(item.approvedRoles).includes(role),
  );
}
