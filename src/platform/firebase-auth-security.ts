import { getFunctions, httpsCallable } from 'firebase/functions';
import { firebaseApp } from './firebase-auth';

const functions = getFunctions(firebaseApp, 'europe-west2');

export type AuthenticationSecurityEvent = {
  id: string;
  eventType: 'signin_failed' | 'closed_beta_signin_denied' | string;
  targetEmailMasked: string;
  targetUserId?: string | null;
  adminTarget: boolean;
  firebaseCode?: string | null;
  clientAttemptId?: string | null;
  clientPlatform?: string | null;
  route?: string | null;
  evidenceQuality?: string | null;
  createdAt?: string | null;
};

const recordCall = httpsCallable<{
  email: string;
  eventType: 'signin_failed' | 'closed_beta_signin_denied';
  firebaseCode: string;
  clientAttemptId?: string;
  clientPlatform?: string;
  route?: string;
}, { recorded: boolean; eventId?: string; alert?: { alertId?: string; severity?: string; riskScore?: number } | null }>(
  functions,
  'recordAuthenticationAttempt',
);

const listCall = httpsCallable<void, { events: AuthenticationSecurityEvent[] }>(
  functions,
  'listAuthenticationEvents',
);

const clientAttemptId = () => {
  const key = 'nightjar.auth-attempt-client.v1';
  try {
    const current = window.localStorage.getItem(key);
    if (current) return current;
    const next = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : 'nj-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
    window.localStorage.setItem(key, next);
    return next;
  } catch {
    return 'nightjar-client-unavailable';
  }
};

export const nightjarAuthSecurity = {
  async recordFailure(input: {
    email: string;
    eventType?: 'signin_failed' | 'closed_beta_signin_denied';
    firebaseCode?: string;
  }) {
    const result = await recordCall({
      email: input.email.trim(),
      eventType: input.eventType ?? 'signin_failed',
      firebaseCode: input.firebaseCode ?? 'auth/unknown',
      clientAttemptId: clientAttemptId(),
      clientPlatform: navigator.userAgent.slice(0, 120),
      route: window.location.pathname + window.location.search,
    });
    return result.data;
  },

  async events() {
    return (await listCall()).data;
  },
};
