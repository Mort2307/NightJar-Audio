/**
 * Separate unrelated parts of Nightjar's economy.
 * Internal platform economics (revenue shares, caps, payout projections,
 * cashflow and payment processing) remain admin-only until approved.
 * Writers may set their OWN asking price and negotiate an audio adaptation
 * licence with a VA. Offers do not collect payment or grant rights.
 * Listener subscription pricing is published separately and may be displayed.
 */
export const MEMBER_PAYMENT_FEATURES_ENABLED = false;
export const WRITER_PRICE_NEGOTIATION_ENABLED = true;
export const LISTENER_SUBSCRIPTION_PRICE_GBP = '£6.99/month';
