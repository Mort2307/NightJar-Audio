/** Keeper-facing intake queues are derived from persisted Firestore application records.
 * A completed application stays in the returned bank as history; never delete it.
 */
export type ProfessionalApplicationRole = 'creator' | 'writer' | 'editor' | 'artist';
export type ProfessionalApplicationBox = 'pending' | 'approved' | 'history' | 'attention';

export type ProfessionalApplicationRecord = {
  status?: string | null;
  requestedRoles?: string[] | null;
  approvedRoles?: string[] | null;
};

const PROFESSIONAL_ROLES: readonly ProfessionalApplicationRole[] = ['creator', 'writer', 'editor', 'artist'];
const OPEN_STATUSES = new Set(['banked', 'waitlist']);
const CLOSED_STATUSES = new Set(['rejected', 'withdrawn']);

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
  approved: T[];
  history: T[];
  attention: T[];
} {
  const pending: T[] = [];
  const approved: T[] = [];
  const history: T[] = [];
  const attention: T[] = [];

  for (const application of applications) {
    const status = String(application.status ?? 'banked').toLowerCase();
    const remaining = pendingApplicationRoles(application);
    const approvedRoles = normaliseRoles(application.approvedRoles);

    if (OPEN_STATUSES.has(status) && remaining.length > 0) {
      // Only outstanding role decisions are counted as work awaiting approval.
      pending.push(application);
    } else if (CLOSED_STATUSES.has(status)) {
      // The final rejection/withdrawal decision wins, even for mixed-role accounts.
      history.push(application);
    } else if (status === 'approved' || (remaining.length === 0 && approvedRoles.length > 0)) {
      // Separate approved applications, including completed legacy banked records.
      approved.push(application);
    } else {
      // Orphaned/legacy records with no actionable role stay visible for diagnosis.
      attention.push(application);
    }
  }
  return { pending, approved, history, attention };
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
