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
 * A closed-beta grant temporarily supplies the full paid-feature experience
 * to an explicitly allowlisted tester. It is neither a paid subscription nor
 * genuine age assurance and must never be persisted as either.
 */
export const canUseBetaListening = (policy: {
  closedBeta: boolean;
  administrator: boolean;
  accountExists: boolean;
  accountSuspended: boolean;
  accountEmailMatches: boolean;
  explicitTester: boolean;
}): boolean =>
  policy.closedBeta &&
  !policy.administrator &&
  policy.accountExists &&
  !policy.accountSuspended &&
  policy.accountEmailMatches &&
  policy.explicitTester;
