export type SubscriptionEntitlement = {
  userId?: unknown;
  status?: unknown;
  providerVerified?: unknown;
  billingProvider?: unknown;
  providerSubscriptionId?: unknown;
  confirmedMonthlyAmountPence?: unknown;
  currentPeriodEnd?: unknown;
};

const periodEndMillis = (value: unknown): number => {
  if (typeof value === 'object' && value !== null && 'toMillis' in value && typeof value.toMillis === 'function') {
    return value.toMillis();
  }
  if (typeof value === 'string') return Date.parse(value);
  return NaN;
};

// Only server-confirmed, current subscriptions may unlock protected content.
// A browser redirect or a manually entered planning amount is never proof of payment.
export const hasPaidEntitlement = (subscription: SubscriptionEntitlement | null | undefined, uid: string, now = Date.now()): boolean =>
  !!subscription
  && subscription.userId === uid
  && subscription.status === 'active'
  && subscription.providerVerified === true
  && typeof subscription.confirmedMonthlyAmountPence === 'number'
  && Number.isFinite(subscription.confirmedMonthlyAmountPence)
  && subscription.confirmedMonthlyAmountPence > 0
  && typeof subscription.billingProvider === 'string'
  && subscription.billingProvider.length > 0
  && typeof subscription.providerSubscriptionId === 'string'
  && subscription.providerSubscriptionId.length > 0
  && periodEndMillis(subscription.currentPeriodEnd) > now;

export const mayUseTemporaryAccess = (options: {
  publicAccessEnabled: boolean;
  ageAssuranceConfigured: boolean;
  administrator: boolean;
  explicitTester: boolean;
  accountActive: boolean;
}): boolean =>
  !options.publicAccessEnabled
  && !options.ageAssuranceConfigured
  && options.accountActive
  && (options.administrator || options.explicitTester);

/**
 * A closed-beta listener grant is NOT a paid subscription or age assurance.
 * The genuineAgeAssurance input must come from a live Didit approval; an
 * invite-only beta admission never satisfies the protected-content age gate.
 */
export const canUseBetaListening = (policy: {
  closedBeta: boolean;
  administrator: boolean;
  accountExists: boolean;
  accountSuspended: boolean;
  accountEmailMatches: boolean;
  genuineAgeAssurance: boolean;
  explicitTester: boolean;
}): boolean =>
  policy.closedBeta &&
  !policy.administrator &&
  policy.accountExists &&
  !policy.accountSuspended &&
  policy.accountEmailMatches &&
  policy.genuineAgeAssurance &&
  policy.explicitTester;
