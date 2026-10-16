/**
 * NightJar verified-credit domain rules.
 *
 * A release's displayed contributor attribution is not proof of ownership of
 * a NightJar account. Keep credit claims and approvals in separate records.
 * All writes/permissions must be enforced by authenticated server functions.
 */

export const CREDIT_PROFESSIONS = ['va', 'writer', 'editor', 'artist'] as const;
export type CreditProfession = typeof CREDIT_PROFESSIONS[number];

export const CREDIT_CLAIM_STATES = [
  'awaiting_member', 'awaiting_uploader', 'uploader_confirmed',
  'uploader_disputed', 'uploader_unsure', 'admin_review',
  'approved', 'rejected', 'revoked',
] as const;
export type CreditClaimState = typeof CREDIT_CLAIM_STATES[number];

export const RELEASE_CREDIT_ROLES = [
  'Voice Actor', 'Writer', 'Audio Editor', 'Producer', 'Director',
  'Sound Designer', 'Cover Artist', 'Composer', 'Other',
] as const;
export type ReleaseCreditRole = typeof RELEASE_CREDIT_ROLES[number];

export type CreditClaimSource = 'member_claim' | 'uploader_invitation';
export type CreditClaimActor = 'contributor' | 'uploader' | 'admin';
export type CreditClaimEvent =
  | 'contributor_accept' | 'contributor_decline'
  | 'uploader_confirm' | 'uploader_dispute' | 'uploader_unsure'
  | 'submit_for_admin_review' | 'admin_approve' | 'admin_reject'
  | 'admin_revoke';

export interface VerifiedCreditClaim {
  id: string;
  releaseId: string;
  /** Stable ID for the specific attribution slot on a release. */
  contributorSlotId: string;
  /** Immutable account UID; never use an @handle as a foreign key. */
  claimantUserId: string;
  uploaderUserId: string;
  profession: CreditProfession;
  /** Exact published attribution; never collapse specialist credits into generic roles. */
  releaseRole?: ReleaseCreditRole;
  source: CreditClaimSource;
  state: CreditClaimState;
  createdAt: string;
  updatedAt: string;
  /** Set only after an explicit administrator decision. */
  approvedByAdminUserId?: string;
  approvedAt?: string;
  revokedAt?: string;
  /** A confirmed uploader is not sufficient proof without independent admin approval. */
  uploaderConfirmedAt?: string;
  /** Optional public-safe reason; confidential evidence belongs in restricted records. */
  reviewReason?: string;
}

type Transition = { from: CreditClaimState[]; event: CreditClaimEvent; actor: CreditClaimActor; to: CreditClaimState };

const TRANSITIONS: readonly Transition[] = [
  { from: ['awaiting_member'], event: 'contributor_accept', actor: 'contributor', to: 'uploader_confirmed' },
  { from: ['awaiting_member'], event: 'contributor_decline', actor: 'contributor', to: 'rejected' },
  { from: ['awaiting_uploader'], event: 'uploader_confirm', actor: 'uploader', to: 'uploader_confirmed' },
  { from: ['awaiting_uploader'], event: 'uploader_dispute', actor: 'uploader', to: 'uploader_disputed' },
  { from: ['awaiting_uploader'], event: 'uploader_unsure', actor: 'uploader', to: 'uploader_unsure' },
  { from: ['uploader_confirmed', 'uploader_disputed', 'uploader_unsure', 'awaiting_uploader'], event: 'submit_for_admin_review', actor: 'admin', to: 'admin_review' },
  { from: ['uploader_confirmed'], event: 'admin_approve', actor: 'admin', to: 'approved' },
  { from: ['awaiting_member','awaiting_uploader','uploader_confirmed','uploader_disputed','uploader_unsure','admin_review'], event: 'admin_reject', actor: 'admin', to: 'rejected' },
  { from: ['approved'], event: 'admin_revoke', actor: 'admin', to: 'revoked' },
];

/** Returns null when the requested transition is not permitted.\n * This is a pure state machine, not an authorization check: backend handlers\n * must verify actor UID, role, evidence and independence of corroboration.\n */
export function nextCreditClaimState(
  current: CreditClaimState,
  event: CreditClaimEvent,
  actor: CreditClaimActor,
): CreditClaimState | null {
  return TRANSITIONS.find(rule => rule.actor === actor && rule.event === event && rule.from.includes(current))?.to ?? null;
}

export function hasVerifiedCredit(claim: Pick<VerifiedCreditClaim, 'state' | 'approvedByAdminUserId' | 'approvedAt'>): boolean {
  return claim.state === 'approved' && Boolean(claim.approvedByAdminUserId && claim.approvedAt);
}

/**
 * Display labels only. Official professional approval must be derived
 * independently from server-maintained approvedProfessionalRoles.
 */
export const CREDIT_PROFESSION_LABELS: Record<CreditProfession, string> = {
  va: 'Voice Actor',
  writer: 'Writer',
  editor: 'Editor',
  artist: 'Artist',
};

export function creditedProfessions(claims: readonly VerifiedCreditClaim[], userId: string): CreditProfession[] {
  return CREDIT_PROFESSIONS.filter(profession => claims.some(claim =>
    claim.claimantUserId === userId && claim.profession === profession && hasVerifiedCredit(claim),
  ));
}

/** Legacy release role labels, including specialist contributions, are kept intact. */
export function creditProfessionFromReleaseRole(role: string): CreditProfession | null {
  switch (role.trim().toLowerCase()) {
    case 'voice actor': return 'va';
    case 'writer': return 'writer';
    case 'audio editor':
    case 'sound designer': return 'editor';
    case 'cover artist': return 'artist';
    default: return null;
  }
}

/** Account type is derived from verified credits, never from unreviewed release metadata. */
export type CreditedAccountKind = 'listener' | 'credited_listener' | 'official_professional';
export function creditedAccountKind(
  claims: readonly VerifiedCreditClaim[],
  userId: string,
  approvedProfessionalRoles: readonly string[],
): CreditedAccountKind {
  if (approvedProfessionalRoles.some(role => ['creator', 'writer', 'editor', 'artist'].includes(role))) {
    return 'official_professional';
  }
  return creditedProfessions(claims, userId).length ? 'credited_listener' : 'listener';
}

/** True only for an independent reviewer; self-confirmation cannot establish identity. */
export function canIndependentlyReviewCredit(
  claim: Pick<VerifiedCreditClaim, 'claimantUserId' | 'uploaderUserId'>,
  reviewerUserId: string,
): boolean {
  return Boolean(reviewerUserId) && reviewerUserId !== claim.claimantUserId && reviewerUserId !== claim.uploaderUserId;
}

/** A member may have many legitimate credits but only one active claim per release slot. */
export function hasActiveDuplicateCreditClaim(
  claims: readonly VerifiedCreditClaim[],
  candidate: Pick<VerifiedCreditClaim, 'releaseId' | 'contributorSlotId' | 'claimantUserId'>,
): boolean {
  return claims.some(claim => claim.releaseId === candidate.releaseId &&
    claim.contributorSlotId === candidate.contributorSlotId &&
    claim.claimantUserId === candidate.claimantUserId &&
    !['rejected', 'revoked'].includes(claim.state));
}
