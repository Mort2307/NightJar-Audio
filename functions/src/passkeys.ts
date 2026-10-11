/**
 * Nightjar passkeys: WebAuthn user-verifying credentials with server-side
 * challenge/origin/RP verification. Never trust a browser "biometric succeeded"
 * boolean and never store biometric templates.
 *
 * Enable trusted custom domains through NIGHTJAR_PASSKEY_ORIGINS (comma-separated
 * HTTPS origins) before deploying. Firestore TTL should target expiresAt in
 * passkeyChallenges and passkeyRateLimits.
 */
import { createHash, randomBytes } from 'node:crypto';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
  type WebAuthnCredential,
} from '@simplewebauthn/server';

const REGION = 'europe-west2';
const ADMIN_EMAILS = new Set([
  'mike.owen230792@gmail.com',
  'megan.wright666@hotmail.com',
  'nightjar.audio.app@gmail.com',
]);
const KNOWN_ORIGINS = [
  'https://nightjar-audio.web.app',
  'https://nightjar-audio.firebaseapp.com',
];
const SHA = (value: string) => createHash('sha256').update(value).digest('hex');
const compact = (value: unknown, max = 160) => String(value ?? '').trim().slice(0, max);
const allowedOrigins = () => [...new Set([
  ...KNOWN_ORIGINS,
  ...(process.env.NIGHTJAR_PASSKEY_ORIGINS ?? '').split(',').map(x => x.trim()).filter(Boolean),
])].filter(value => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.origin === value && !url.username && !url.password;
  } catch { return false; }
});

const verifiedOrigin = (request: { rawRequest: { headers: Record<string, string | string[] | undefined> } }) => {
  const origin = compact(request.rawRequest.headers.origin, 260);
  if (!allowedOrigins().includes(origin)) {
    throw new HttpsError('failed-precondition', 'Passkeys are not enabled on this Nightjar address. Use the official Nightjar app address.');
  }
  return { origin, rpID: new URL(origin).hostname };
};

const recentVerifiedUser = async (request: { auth?: { uid: string; token: Record<string, unknown> } | null }) => {
  const claims = request.auth?.token ?? {};
  const uid = request.auth?.uid;
  const authTime = Number(claims.auth_time ?? 0);
  if (!uid || !claims.email_verified) throw new HttpsError('unauthenticated', 'Sign in and verify your email before managing passkeys.');
  if (!Number.isFinite(authTime) || Date.now() / 1000 - authTime > 600 || Date.now() / 1000 - authTime < -60) {
    throw new HttpsError('failed-precondition', 'For security, sign in with your password again before managing passkeys.');
  }
  const account = await getAuth().getUser(uid);
  if (account.disabled || !account.emailVerified || !account.email) throw new HttpsError('permission-denied', 'Account access is unavailable.');
  const snapshot = await getFirestore().collection('accounts').doc(uid).get();
  if (snapshot.data()?.status === 'suspended') throw new HttpsError('permission-denied', 'Account suspended.');
  return { uid, email: account.email.toLowerCase() };
};

const assertAccountEligible = async (uid: string) => {
  const db = getFirestore();
  const [user, account] = await Promise.all([
    getAuth().getUser(uid),
    db.collection('accounts').doc(uid).get(),
  ]);
  if (user.disabled || !user.emailVerified || !user.email || account.data()?.status === 'suspended') {
    throw new HttpsError('permission-denied', 'Unable to sign in with this passkey.');
  }
  // Nightjar is still a closed beta. Passkeys must never bypass the invitation gate.
  const email = user.email.trim().toLowerCase();
  const allow = await db.collection('closedBetaAllowlist').doc(SHA(email)).get();
  const testAccess = account.data()?.testAccess === true
    || ADMIN_EMAILS.has(email)
    || (allow.data()?.enabled === true && compact(allow.data()?.email, 320).toLowerCase() === email);
  if (!testAccess) throw new HttpsError('permission-denied', 'Nightjar private-test access is not available for this account.');
  return user;
};

const rateLimit = async (ip: string) => {
  const db = getFirestore();
  const windowId = Math.floor(Date.now() / (15 * 60_000));
  const ref = db.collection('passkeyRateLimits').doc(SHA(ip) + '-' + windowId);
  await db.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    const attempts = Number(snapshot.data()?.attempts ?? 0);
    if (attempts >= 25) throw new HttpsError('resource-exhausted', 'Too many passkey attempts. Try again later.');
    transaction.set(ref, {
      attempts: attempts + 1,
      expiresAt: Timestamp.fromMillis((windowId + 2) * 15 * 60_000),
    }, { merge: true });
  });
};

const challengeRef = (id: string) => getFirestore().collection('passkeyChallenges').doc(id);
const writeChallenge = async (data: Record<string, unknown>) => {
  const challengeId = randomBytes(24).toString('base64url');
  await challengeRef(challengeId).set({
    ...data,
    expiresAt: Timestamp.fromMillis(Date.now() + 5 * 60_000),
    createdAt: FieldValue.serverTimestamp(),
  });
  return challengeId;
};

const useChallenge = async (id: string, kind: 'register' | 'login', origin: string) => {
  if (!/^[a-zA-Z0-9_-]{32}$/.test(id)) throw new HttpsError('permission-denied', 'Passkey challenge expired. Try again.');
  const ref = challengeRef(id);
  return getFirestore().runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    const data = snapshot.data();
    if (!data || data.kind !== kind || data.origin !== origin || Number(data.expiresAt?.toMillis?.() ?? 0) < Date.now()) {
      throw new HttpsError('permission-denied', 'Passkey challenge expired. Try again.');
    }
    transaction.delete(ref); // Single-use even if verification later fails.
    return data;
  });
};

const credentialRef = (credentialId: string) => getFirestore().collection('passkeyCredentials').doc(SHA(credentialId));

export const beginPasskeyRegistration = onCall({ region: REGION }, async request => {
  const { uid, email } = await recentVerifiedUser(request);
  const { origin, rpID } = verifiedOrigin(request);
  await assertAccountEligible(uid);
  const existing = await getFirestore().collection('passkeyCredentials').where('uid', '==', uid).limit(10).get();
  if (existing.size >= 10) throw new HttpsError('resource-exhausted', 'Remove an existing passkey before adding another.');
  const options = await generateRegistrationOptions({
    rpName: 'Nightjar',
    rpID,
    userName: email,
    userID: new TextEncoder().encode(uid),
    attestationType: 'none',
    authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
    excludeCredentials: existing.docs.map(doc => ({
      id: compact(doc.data().credentialId, 1200),
      transports: doc.data().transports ?? [],
    })),
  });
  const challengeId = await writeChallenge({ kind: 'register', challenge: options.challenge, origin, rpID, uid });
  return { challengeId, options };
});

export const finishPasskeyRegistration = onCall({ region: REGION }, async request => {
  const { uid } = await recentVerifiedUser(request);
  const { origin } = verifiedOrigin(request);
  const input = (request.data ?? {}) as Record<string, unknown>;
  const raw = input.response;
  if (!raw || typeof raw !== 'object' || JSON.stringify(raw).length > 24000) {
    throw new HttpsError('invalid-argument', 'Invalid passkey registration response.');
  }
  const challenge = await useChallenge(compact(input.challengeId, 80), 'register', origin);
  if (challenge.uid !== uid) throw new HttpsError('permission-denied', 'This challenge belongs to a different account.');
  await assertAccountEligible(uid);
  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: raw as RegistrationResponseJSON,
      expectedChallenge: String(challenge.challenge),
      expectedOrigin: String(challenge.origin),
      expectedRPID: String(challenge.rpID),
      requireUserVerification: true,
    });
  } catch {
    throw new HttpsError('permission-denied', 'Device verification did not succeed. Try again.');
  }
  if (!verification.verified || !verification.registrationInfo) throw new HttpsError('permission-denied', 'Passkey could not be verified.');
  const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
  if (!credential.id || !credential.publicKey) throw new HttpsError('permission-denied', 'Incomplete passkey registration.');
  const ref = credentialRef(credential.id);
  await getFirestore().runTransaction(async transaction => {
    const previous = await transaction.get(ref);
    if (previous.exists) throw new HttpsError('already-exists', 'This passkey is already registered.');
    transaction.create(ref, {
      uid, credentialId: credential.id,
      publicKey: Buffer.from(credential.publicKey).toString('base64url'),
      counter: credential.counter,
      transports: credential.transports ?? [],
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp,
      label: 'Passkey',
      createdAt: FieldValue.serverTimestamp(),
      lastUsedAt: null,
    });
  });
  return { registered: true };
});

export const beginPasskeySignIn = onCall({ region: REGION }, async request => {
  const { origin, rpID } = verifiedOrigin(request);
  await rateLimit(compact(request.rawRequest.ip || request.rawRequest.headers['x-forwarded-for'], 120) || 'unknown');
  const options = await generateAuthenticationOptions({ rpID, userVerification: 'required' });
  const challengeId = await writeChallenge({ kind: 'login', challenge: options.challenge, origin, rpID });
  return { challengeId, options };
});

export const finishPasskeySignIn = onCall({ region: REGION }, async request => {
  const { origin } = verifiedOrigin(request);
  await rateLimit(compact(request.rawRequest.ip || request.rawRequest.headers['x-forwarded-for'], 120) || 'unknown');
  const input = (request.data ?? {}) as Record<string, unknown>;
  const raw = input.response;
  if (!raw || typeof raw !== 'object' || JSON.stringify(raw).length > 24000) {
    throw new HttpsError('invalid-argument', 'Invalid passkey response.');
  }
  const challenge = await useChallenge(compact(input.challengeId, 80), 'login', origin);
  const assertion = raw as AuthenticationResponseJSON;
  const credentialId = compact(assertion.id, 1200);
  if (!credentialId) throw new HttpsError('permission-denied', 'Passkey verification unsuccessful.');
  const ref = credentialRef(credentialId);
  const snapshot = await ref.get();
  const record = snapshot.data();
  if (!record || record.credentialId !== credentialId || !record.uid || !record.publicKey) {
    throw new HttpsError('permission-denied', 'Passkey verification unsuccessful.');
  }
  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: assertion,
      expectedChallenge: String(challenge.challenge),
      expectedOrigin: String(challenge.origin),
      expectedRPID: String(challenge.rpID),
      credential: {
        id: credentialId,
        publicKey: new Uint8Array(Buffer.from(record.publicKey, 'base64url')),
        counter: Number(record.counter) || 0,
        transports: record.transports ?? [],
      } as WebAuthnCredential,
      requireUserVerification: true,
    });
  } catch {
    throw new HttpsError('permission-denied', 'Passkey verification unsuccessful.');
  }
  if (!verification.verified) throw new HttpsError('permission-denied', 'Passkey verification unsuccessful.');
  const uid = String(record.uid);
  await assertAccountEligible(uid);
  await getFirestore().runTransaction(async transaction => {
    const current = await transaction.get(ref);
    if (!current.exists || current.data()?.uid !== uid) {
      throw new HttpsError('permission-denied', 'This passkey was removed.');
    }
    const prior = Number(current.data()?.counter ?? 0);
    const next = Number(verification.authenticationInfo.newCounter);
    if (prior > 0 && next <= prior) throw new HttpsError('permission-denied', 'Passkey counter validation failed.');
    transaction.update(ref, { counter: next, lastUsedAt: FieldValue.serverTimestamp() });
  });
  const token = await getAuth().createCustomToken(uid);
  return { token };
});

export const listMyPasskeys = onCall({ region: REGION }, async request => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  const records = await getFirestore().collection('passkeyCredentials').where('uid', '==', uid).limit(10).get();
  return {
    passkeys: records.docs.map(doc => ({
      id: doc.id,
      label: compact(doc.data().label, 80) || 'Passkey',
      createdAt: doc.data().createdAt?.toDate?.()?.toISOString?.() ?? null,
      lastUsedAt: doc.data().lastUsedAt?.toDate?.()?.toISOString?.() ?? null,
    })),
  };
});

export const removeMyPasskey = onCall({ region: REGION }, async request => {
  const { uid } = await recentVerifiedUser(request);
  const id = compact((request.data as { id?: unknown } | null)?.id, 80);
  if (!/^[a-f0-9]{64}$/.test(id)) throw new HttpsError('invalid-argument', 'Unknown passkey.');
  const ref = getFirestore().collection('passkeyCredentials').doc(id);
  await getFirestore().runTransaction(async transaction => {
    const snap = await transaction.get(ref);
    if (!snap.exists || snap.data()?.uid !== uid) throw new HttpsError('not-found', 'Passkey is not registered to this account.');
    transaction.delete(ref);
  });
  return { removed: true };
});
