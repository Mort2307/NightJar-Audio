import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { HttpsError, onCall, onRequest } from 'firebase-functions/v2/https';

initializeApp();

const db = getFirestore();
const REGION = 'europe-west2';

const ADMIN_EMAILS = new Set([
  'mike.owen230792@gmail.com',
  'megan.wright666@hotmail.com',
  'nightjar.audio.app@gmail.com',
]);

type AccountRole = 'admin' | 'creator' | 'listener' | 'writer' | 'editor';
type SelectableRole = 'creator' | 'listener' | 'writer';

const cleanEmail = (value: unknown) => String(value ?? '').trim().toLowerCase();

const requireVerifiedIdentity = (request: { auth?: { uid: string; token: Record<string, unknown> } | null }) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in to Nightjar first.');

  const email = cleanEmail(request.auth.token.email);
  if (!email || request.auth.token.email_verified !== true) {
    throw new HttpsError('failed-precondition', 'Verify your email before continuing.');
  }

  return {
    uid: request.auth.uid,
    email,
    admin: ADMIN_EMAILS.has(email),
  };
};

const accountRef = (uid: string) => db.collection('accounts').doc(uid);

export const health = onRequest({ region: REGION }, (_request, response) => {
  response.status(200).json({ service: 'nightjar', status: 'ok' });
});

export const accountIdentity = onCall({ region: REGION }, async (request) => {
  const identity = requireVerifiedIdentity(request);
  const ref = accountRef(identity.uid);
  const snapshot = await ref.get();

  if (identity.admin) {
    const record = {
      email: identity.email,
      role: 'admin' as AccountRole,
      status: 'active',
      emailVerified: true,
      updatedAt: FieldValue.serverTimestamp(),
      ...(snapshot.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
    };
    await ref.set(record, { merge: true });
    return {
      userId: identity.uid,
      email: identity.email,
      admin: true,
      role: 'admin',
      status: 'active',
      emailVerified: true,
    };
  }

  if (!snapshot.exists) {
    await ref.set({
      email: identity.email,
      role: null,
      status: 'active',
      emailVerified: true,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  } else {
    await ref.set({
      email: identity.email,
      emailVerified: true,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  }

  const data = snapshot.exists ? snapshot.data() ?? {} : {};
  return {
    userId: identity.uid,
    email: identity.email,
    admin: false,
    role: (data.role as AccountRole | null) ?? null,
    status: String(data.status ?? 'active'),
    emailVerified: true,
  };
});

export const chooseAccountRole = onCall({ region: REGION }, async (request) => {
  const identity = requireVerifiedIdentity(request);
  if (identity.admin) throw new HttpsError('failed-precondition', 'Administrator roles are assigned by Nightjar.');

  const requestedRole = String((request.data as { role?: unknown } | undefined)?.role ?? '') as SelectableRole;
  if (!['creator', 'listener', 'writer'].includes(requestedRole)) {
    throw new HttpsError('invalid-argument', 'Choose Listener, Creator or Writer.');
  }

  const ref = accountRef(identity.uid);
  const snapshot = await ref.get();
  const current = snapshot.data() ?? {};

  if (current.role && current.role !== requestedRole) {
    throw new HttpsError('failed-precondition', 'This Nightjar account already has a role.');
  }

  const status = requestedRole === 'creator' ? 'pending_review' : 'active';
  await ref.set({
    email: identity.email,
    emailVerified: true,
    role: requestedRole,
    status,
    updatedAt: FieldValue.serverTimestamp(),
    ...(snapshot.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
  }, { merge: true });

  return { userId: identity.uid, role: requestedRole, status };
});
