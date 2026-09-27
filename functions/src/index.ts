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

const cleanText = (value: unknown, maxLength: number) =>
  String(value ?? '').trim().slice(0, maxLength);

const cleanStringList = (value: unknown, maxItems = 16) => {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(
    value
      .map((item) => cleanText(item, 48))
      .filter(Boolean),
  )).slice(0, maxItems);
};

const cleanHandle = (value: unknown) =>
  cleanText(value, 30).replace(/^@+/, '').toLowerCase();

const validateHandle = (value: string) => {
  if (!/^[a-z0-9_-]{3,30}$/.test(value)) {
    throw new HttpsError(
      'invalid-argument',
      'Handle must be 3–30 characters using letters, numbers, underscores or hyphens.',
    );
  }
};

const profileRef = (uid: string) => db.collection('profiles').doc(uid);

export const getMyProfile = onCall({ region: REGION }, async (request) => {
  const identity = requireVerifiedIdentity(request);
  const snapshot = await profileRef(identity.uid).get();
  return { profile: snapshot.exists ? snapshot.data() : null };
});

export const saveMyProfile = onCall({ region: REGION }, async (request) => {
  const identity = requireVerifiedIdentity(request);
  const input = (request.data ?? {}) as Record<string, unknown>;
  const handle = cleanHandle(input.handle);
  validateHandle(handle);

  const nextProfile = {
    displayName: cleanText(input.displayName, 80) || identity.email.split('@')[0],
    handle,
    headline: cleanText(input.headline, 140),
    bio: cleanText(input.bio, 1200),
    pronouns: cleanText(input.pronouns, 60),
    avatarInitials: cleanText(input.avatarInitials, 4).toUpperCase(),
    avatarTone: cleanText(input.avatarTone, 32) || 'plum',
    favouriteTags: cleanStringList(input.favouriteTags),
    favouriteTropes: cleanStringList(input.favouriteTropes),
    favouriteCategories: cleanStringList(input.favouriteCategories),
    roleFocus: cleanStringList(input.roleFocus),
    publicProfile: input.publicProfile !== false,
    onboardingComplete: input.onboardingComplete === true,
    onboardingVersion: Math.max(0, Math.floor(Number(input.onboardingVersion ?? 1))),
    updatedAt: FieldValue.serverTimestamp(),
  };

  const targetProfileRef = profileRef(identity.uid);
  const targetHandleRef = db.collection('handles').doc(handle);

  await db.runTransaction(async (transaction) => {
    const currentProfile = await transaction.get(targetProfileRef);
    const currentHandle = cleanHandle(currentProfile.data()?.handle);
    const targetHandle = await transaction.get(targetHandleRef);
    const oldHandleRef = currentHandle && currentHandle !== handle
      ? db.collection('handles').doc(currentHandle)
      : null;
    const oldHandle = oldHandleRef ? await transaction.get(oldHandleRef) : null;

    if (targetHandle.exists && targetHandle.data()?.userId !== identity.uid) {
      throw new HttpsError('already-exists', 'That @handle is already in use.');
    }

    transaction.set(targetHandleRef, {
      userId: identity.uid,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    if (oldHandleRef && oldHandle?.data()?.userId === identity.uid) {
      transaction.delete(oldHandleRef);
    }

    transaction.set(targetProfileRef, {
      ...nextProfile,
      ...(currentProfile.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
    }, { merge: true });
  });

  const saved = await targetProfileRef.get();
  return { profile: saved.data() ?? null };
});

const publicProfileForAccount = async (account: FirebaseFirestore.QueryDocumentSnapshot) => {
  const profile = await profileRef(account.id).get();
  const data = profile.data();
  if (!data || data.publicProfile === false) return null;
  return {
    userId: account.id,
    role: account.data().role ?? null,
    displayName: data.displayName ?? 'Nightjar member',
    name: data.displayName ?? 'Nightjar member',
    handle: data.handle ?? null,
    headline: data.headline ?? null,
    bio: data.bio ?? null,
    pronouns: data.pronouns ?? null,
    avatarInitials: data.avatarInitials ?? null,
    initials: data.avatarInitials ?? null,
    avatarTone: data.avatarTone ?? 'plum',
    favouriteTags: Array.isArray(data.favouriteTags) ? data.favouriteTags : [],
    roleFocus: Array.isArray(data.roleFocus) ? data.roleFocus : [],
  };
};

export const listCreators = onCall({ region: REGION }, async (request) => {
  requireVerifiedIdentity(request);
  const accounts = await db.collection('accounts').where('role', '==', 'creator').limit(200).get();
  const creators = (await Promise.all(
    accounts.docs
      .filter((doc) => doc.data().status === 'active')
      .map(async (doc) => {
        const base = await publicProfileForAccount(doc);
        if (!base) return null;
        return { ...base, releaseCount: 0 };
      }),
  )).filter(Boolean);

  return { creators };
});

export const getCreatorProfile = onCall({ region: REGION }, async (request) => {
  requireVerifiedIdentity(request);
  const creatorUserId = cleanText((request.data as { userId?: unknown } | undefined)?.userId, 128);
  if (!creatorUserId) throw new HttpsError('invalid-argument', 'Creator account is required.');

  const account = await accountRef(creatorUserId).get();
  if (!account.exists || account.data()?.role !== 'creator' || account.data()?.status !== 'active') {
    throw new HttpsError('not-found', 'Creator profile not found.');
  }

  const profile = await profileRef(creatorUserId).get();
  const data = profile.data();
  if (!data || data.publicProfile === false) throw new HttpsError('not-found', 'Creator profile not found.');

  return {
    creator: {
      userId: creatorUserId,
      name: data.displayName ?? 'Nightjar creator',
      handle: data.handle ?? null,
      headline: data.headline ?? null,
      bio: data.bio ?? null,
      pronouns: data.pronouns ?? null,
      initials: data.avatarInitials ?? null,
      favouriteTags: Array.isArray(data.favouriteTags) ? data.favouriteTags : [],
      releases: [],
    },
  };
});

export const listWriters = onCall({ region: REGION }, async (request) => {
  requireVerifiedIdentity(request);
  const accounts = await db.collection('accounts').where('role', '==', 'writer').limit(200).get();
  const writers = (await Promise.all(
    accounts.docs
      .filter((doc) => doc.data().status === 'active')
      .map(async (doc) => {
        const base = await publicProfileForAccount(doc);
        return base ? { ...base, publishedWorkCount: 0 } : null;
      }),
  )).filter(Boolean);

  return { writers };
});

export const communityState = onCall({ region: REGION }, async (request) => {
  const identity = requireVerifiedIdentity(request);
  const [follows, favourites] = await Promise.all([
    accountRef(identity.uid).collection('follows').limit(500).get(),
    accountRef(identity.uid).collection('favourites').limit(500).get(),
  ]);

  return {
    follows: follows.docs.map((doc) => ({ creatorUserId: doc.id })),
    favourites: favourites.docs.map((doc) => ({ releaseId: doc.id })),
  };
});

export const setCreatorFollow = onCall({ region: REGION }, async (request) => {
  const identity = requireVerifiedIdentity(request);
  const input = (request.data ?? {}) as { creatorUserId?: unknown; following?: unknown };
  const creatorUserId = cleanText(input.creatorUserId, 128);
  if (!creatorUserId || creatorUserId === identity.uid) {
    throw new HttpsError('invalid-argument', 'Choose another creator to follow.');
  }

  const creator = await accountRef(creatorUserId).get();
  if (!creator.exists || creator.data()?.role !== 'creator' || creator.data()?.status !== 'active') {
    throw new HttpsError('not-found', 'Creator profile not found.');
  }

  const ref = accountRef(identity.uid).collection('follows').doc(creatorUserId);
  if (input.following === false) await ref.delete();
  else await ref.set({ createdAt: FieldValue.serverTimestamp() }, { merge: true });

  return { creatorUserId, following: input.following !== false };
});

export const setFavouriteRelease = onCall({ region: REGION }, async (request) => {
  const identity = requireVerifiedIdentity(request);
  const input = (request.data ?? {}) as { releaseId?: unknown; favourite?: unknown };
  const releaseId = cleanText(input.releaseId, 160);
  if (!releaseId) throw new HttpsError('invalid-argument', 'Release is required.');

  const ref = accountRef(identity.uid).collection('favourites').doc(releaseId);
  if (input.favourite === false) await ref.delete();
  else await ref.set({ createdAt: FieldValue.serverTimestamp() }, { merge: true });

  return { releaseId, favourite: input.favourite !== false };
});

