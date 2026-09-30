import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue, type QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { randomUUID } from 'node:crypto';
import { HttpsError, onCall, onRequest } from 'firebase-functions/v2/https';

initializeApp();

const db = getFirestore();
const REGION = 'europe-west2';
const AGE_ASSURANCE_CONFIGURED = false;

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

const requireAdminIdentity = (request: { auth?: { uid: string; token: Record<string, unknown> } | null }) => {
  const identity = requireVerifiedIdentity(request);
  if (!identity.admin) throw new HttpsError('permission-denied', 'Administrator access required.');
  return identity;
};

const accountRef = (uid: string) => db.collection('accounts').doc(uid);

const requireActiveIdentity = async (request: { auth?: { uid: string; token: Record<string, unknown> } | null }) => {
  const identity = requireVerifiedIdentity(request);
  if (identity.admin) return identity;
  const snapshot = await accountRef(identity.uid).get();
  if (snapshot.exists && snapshot.data()?.status === 'suspended') {
    throw new HttpsError('permission-denied', 'This Nightjar account is suspended.');
  }
  return identity;
};


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
  const identity = await requireActiveIdentity(request);
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

  if (requestedRole === 'creator') {
    await db.collection('creatorApplications').doc(identity.uid).set({
      userId: identity.uid,
      email: identity.email,
      status: 'pending',
      submittedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  }

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

const PROFILE_TAG_SEED = new Set([
  'Atmospheric','ASMR','Binaural','Cinematic','Conversational','Dialogue-heavy','Gentle','Immersive','Intimate','Playful','Romantic','Slow-paced','Story-led','Voice-led','Whispered','Sound-rich',
].map((item) => item.toLocaleLowerCase()));
const PROFILE_TAG_PROMOTION_THRESHOLD = 5;

const cleanProfileTag = (value: unknown) => cleanText(value, 48).replace(/\s+/g, ' ');
const profileTagKey = (value: unknown) => cleanProfileTag(value).toLocaleLowerCase();
const profileTagDocId = (value: unknown) => encodeURIComponent(profileTagKey(value)).slice(0, 220);
const customProfileTagMap = (value: unknown) => {
  const result = new Map<string, string>();
  for (const label of cleanStringList(value, 200)) {
    const key = profileTagKey(label);
    if (!key || PROFILE_TAG_SEED.has(key)) continue;
    if (!result.has(key)) result.set(key, cleanProfileTag(label));
  }
  return result;
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

const profileTagUsageCollection = () => db.collection('profileTagCreatorUsage');

const syncCreatorCustomTagUsage = async (creatorUserId: string) => {
  const [accountSnapshot, profileSnapshot, releasesSnapshot, existingUsageSnapshot] = await Promise.all([
    accountRef(creatorUserId).get(),
    profileRef(creatorUserId).get(),
    db.collection('releases').where('creatorUserId', '==', creatorUserId).limit(500).get(),
    profileTagUsageCollection().where('creatorUserId', '==', creatorUserId).limit(500).get(),
  ]);

  const accountData = accountSnapshot.data() ?? {};
  const activeCreator = accountSnapshot.exists
    && accountData.role === 'creator'
    && String(accountData.status ?? '') === 'active';

  const desiredTags = activeCreator
    ? customProfileTagMap([
      ...(Array.isArray(profileSnapshot.data()?.favouriteTags) ? profileSnapshot.data()?.favouriteTags : []),
      ...releasesSnapshot.docs.flatMap((doc) => Array.isArray(doc.data()?.tags) ? doc.data().tags : []),
    ])
    : new Map<string, string>();

  const desiredByTagId = new Map(
    [...desiredTags.entries()].map(([key, label]) => [profileTagDocId(label), { key, label }]),
  );
  const existingByTagId = new Map(
    existingUsageSnapshot.docs.map((doc) => [
      cleanText(doc.data()?.tagId, 220),
      { doc, label: cleanProfileTag(doc.data()?.label), key: profileTagKey(doc.data()?.label) },
    ]),
  );

  const affected = new Map<string, { label: string; key: string }>();
  const batch = db.batch();

  for (const [tagId, value] of desiredByTagId.entries()) {
    affected.set(tagId, value);
    if (existingByTagId.has(tagId)) continue;
    const usageRef = profileTagUsageCollection().doc(tagId + '__' + creatorUserId);
    batch.set(usageRef, {
      tagId,
      label: value.label,
      normalizedKey: value.key,
      creatorUserId,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  }

  for (const [tagId, value] of existingByTagId.entries()) {
    if (desiredByTagId.has(tagId)) continue;
    affected.set(tagId, {
      label: value.label || cleanProfileTag(tagId),
      key: value.key || profileTagKey(value.label),
    });
    batch.delete(value.doc.ref);
  }

  if (affected.size) await batch.commit();

  for (const [tagId, value] of affected.entries()) {
    const usageSnapshot = await profileTagUsageCollection().where('tagId', '==', tagId).limit(1000).get();
    const tagRef = db.collection('profileTagCatalogue').doc(tagId);
    const tagSnapshot = await tagRef.get();
    const existing = tagSnapshot.data() ?? {};
    const uniqueCreatorCount = usageSnapshot.size;
    if (!tagSnapshot.exists && uniqueCreatorCount === 0) continue;

    const wasPromoted = existing.status === 'promoted';
    const isHidden = existing.status === 'hidden';
    const nextStatus = isHidden
      ? 'hidden'
      : wasPromoted || uniqueCreatorCount >= PROFILE_TAG_PROMOTION_THRESHOLD
        ? 'promoted'
        : 'candidate';

    await tagRef.set({
      label: cleanProfileTag(existing.label) || value.label,
      normalizedKey: profileTagKey(existing.label) || value.key,
      source: 'creator_custom',
      uniqueCreatorCount,
      status: nextStatus,
      updatedAt: FieldValue.serverTimestamp(),
      ...(!tagSnapshot.exists ? { createdAt: FieldValue.serverTimestamp() } : {}),
      ...(!wasPromoted && !isHidden && uniqueCreatorCount >= PROFILE_TAG_PROMOTION_THRESHOLD
        ? { promotedAt: FieldValue.serverTimestamp() }
        : {}),
    }, { merge: true });
  }
};

const accountPresentation = async (uid: string) => {
  const [profileSnapshot, accountSnapshot] = await Promise.all([
    profileRef(uid).get(),
    accountRef(uid).get(),
  ]);
  const profile = profileSnapshot.data() ?? {};
  const account = accountSnapshot.data() ?? {};
  const email = cleanEmail(account.email);
  const displayName = cleanText(profile.displayName, 80)
    || cleanText(account.displayName, 80)
    || (email ? email.split('@')[0] : '')
    || 'Nightjar account';
  const handle = cleanHandle(profile.handle) || null;
  return { displayName, handle, email: email || null };
};

export const getMyProfile = onCall({ region: REGION }, async (request) => {
  const identity = await requireActiveIdentity(request);
  const snapshot = await profileRef(identity.uid).get();
  return { profile: snapshot.exists ? snapshot.data() : null };
});

export const profileTagCatalogue = onCall({ region: REGION }, async (request) => {
  const identity = await requireActiveIdentity(request);
  await requireAgeVerified(identity.uid);
  const snapshot = await db.collection('profileTagCatalogue').where('status', '==', 'promoted').limit(200).get();
  const tags = snapshot.docs
    .map((doc) => cleanProfileTag(doc.data()?.label))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
  return { tags };
});

export const adminProfileTagCatalogue = onCall({ region: REGION }, async (request) => {
  requireAdminIdentity(request);
  const snapshot = await db.collection('profileTagCatalogue').limit(500).get();
  const tags = snapshot.docs
    .map((doc) => {
      const data = doc.data() ?? {};
      const stamp = (value: any) => value?.toDate?.().toISOString?.() ?? null;
      return {
        id: doc.id,
        label: cleanProfileTag(data.label),
        normalizedKey: profileTagKey(data.label),
        source: cleanText(data.source, 40) || 'creator_custom',
        uniqueCreatorCount: Math.max(0, Number(data.uniqueCreatorCount ?? 0)),
        status: ['candidate', 'promoted', 'hidden'].includes(String(data.status)) ? String(data.status) : 'candidate',
        createdAt: stamp(data.createdAt),
        updatedAt: stamp(data.updatedAt),
        promotedAt: stamp(data.promotedAt),
      };
    })
    .filter((tag) => tag.label)
    .sort((a, b) => b.uniqueCreatorCount - a.uniqueCreatorCount || a.label.localeCompare(b.label));
  return { tags, promotionThreshold: PROFILE_TAG_PROMOTION_THRESHOLD };
});

export const adminSetProfileTagStatus = onCall({ region: REGION }, async (request) => {
  const identity = requireAdminIdentity(request);
  const input = (request.data ?? {}) as { tagId?: unknown; status?: unknown };
  const tagId = cleanText(input.tagId, 220);
  const status = cleanText(input.status, 20);
  if (!tagId) throw new HttpsError('invalid-argument', 'Tag is required.');
  if (!['candidate', 'promoted', 'hidden'].includes(status)) {
    throw new HttpsError('invalid-argument', 'Tag status is invalid.');
  }

  const ref = db.collection('profileTagCatalogue').doc(tagId);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new HttpsError('not-found', 'Tag candidate not found.');

  await ref.set({
    status,
    reviewedBy: identity.uid,
    reviewedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    ...(status === 'promoted' ? { promotedAt: FieldValue.serverTimestamp() } : {}),
  }, { merge: true });

  return { tagId, status };
});

const completedCollaborationCountFor = async (userId: string) => {
  const snapshot = await db.collection('collaborationProposals').limit(1000).get();
  return snapshot.docs.filter((doc) => {
    const data = doc.data() ?? {};
    return data.status === 'completed'
      && (data.writerUserId === userId || data.recipientUserId === userId);
  }).length;
};

const publicActivityBadges = (
  role: string,
  counts: { releases?: number; publishedScripts?: number; creditedReleases?: number; completedCollaborations?: number },
) => {
  const badges: Array<{ id: string; label: string; detail: string }> = [];
  const collaborations = Math.max(0, Number(counts.completedCollaborations ?? 0));

  if (role === 'creator' && Number(counts.releases ?? 0) > 0) {
    badges.push({ id: 'published-creator', label: 'Published Creator', detail: 'Has released work in the Nightjar catalogue.' });
  }
  if (role === 'writer' && Number(counts.publishedScripts ?? 0) > 0) {
    badges.push({ id: 'published-writer', label: 'Published Writer', detail: 'Has approved or published writing recorded by Nightjar.' });
  }
  if (role === 'editor' && Number(counts.creditedReleases ?? 0) > 0) {
    badges.push({ id: 'credited-editor', label: 'Credited Audio Editor', detail: 'Has public Nightjar release credits as an Audio Editor.' });
  }
  if (collaborations >= 5) {
    badges.push({ id: 'frequent-collaborator', label: 'Frequent Collaborator', detail: 'Five or more completed Nightjar collaborations.' });
  } else if (collaborations >= 1) {
    badges.push({ id: 'completed-collaborator', label: 'Completed Collaborator', detail: 'Has at least one completed Nightjar collaboration.' });
  }

  return badges;
};


const profilePortfolioOptionsFor = async (userId: string, role: string) => {
  if (role === 'creator') {
    const releases = await db.collection('releases').where('creatorUserId', '==', userId).limit(500).get();
    return releases.docs
      .filter((doc) => doc.data().status === 'released')
      .map((doc) => ({
        id: doc.id,
        type: 'release',
        title: cleanText(doc.data().title, 160) || 'Untitled release',
        subtitle: [cleanText(doc.data().category, 80), cleanText(doc.data().seriesTitle, 160)].filter(Boolean).join(' · '),
      }))
      .slice(0, 100);
  }

  if (role === 'writer' || role === 'editor') {
    const releases = await db.collection('releases').where('status', '==', 'released').limit(500).get();
    return releases.docs
      .filter((doc) => normaliseReleaseContributors(doc.data().contributors).some((credit) => credit.userId === userId))
      .map((doc) => {
        const credit = normaliseReleaseContributors(doc.data().contributors).find((item) => item.userId === userId);
        return {
          id: doc.id,
          type: 'credit',
          title: cleanText(doc.data().title, 160) || 'Nightjar release',
          subtitle: [cleanText(credit?.role, 80), cleanText(doc.data().creatorName, 120)].filter(Boolean).join(' · '),
        };
      })
      .slice(0, 100);
  }

  if (role === 'listener') {
    const playlists = await accountRef(userId).collection('playlists').limit(100).get();
    return playlists.docs.map((doc) => ({
      id: doc.id,
      type: 'playlist',
      title: cleanText(doc.data().title, 100) || 'Untitled playlist',
      subtitle: (Array.isArray(doc.data().releaseIds) ? doc.data().releaseIds.length : 0) + ' releases',
    }));
  }

  return [];
};

const validatedPortfolioIdsFor = async (userId: string, role: string, value: unknown) => {
  const requested = cleanStringList(value, 6);
  if (!requested.length || role === 'admin') return [];
  const eligible = new Set((await profilePortfolioOptionsFor(userId, role)).map((item) => item.id));
  return requested.filter((id) => eligible.has(id)).slice(0, 6);
};

export const getMyProfilePortfolioOptions = onCall({ region: REGION }, async (request) => {
  const identity = await requireActiveIdentity(request);
  await requireAgeVerified(identity.uid);
  const account = await accountRef(identity.uid).get();
  const role = identity.admin ? 'admin' : cleanText(account.data()?.role, 30);
  const [options, completedCollaborations] = await Promise.all([
    profilePortfolioOptionsFor(identity.uid, role),
    role === 'admin' ? Promise.resolve(0) : completedCollaborationCountFor(identity.uid),
  ]);
  return { role, options, completedCollaborations };
});

export const saveMyProfile = onCall({ region: REGION }, async (request) => {
  const identity = await requireActiveIdentity(request);
  const input = (request.data ?? {}) as Record<string, unknown>;
  const handle = cleanHandle(input.handle);
  if (handle) validateHandle(handle);
  const accountSnapshot = await accountRef(identity.uid).get();
  const profileRole = identity.admin ? 'admin' : String(accountSnapshot.data()?.role ?? '');
  const profileStatus = identity.admin ? 'active' : String(accountSnapshot.data()?.status ?? '');
  const featuredPortfolioIds = await validatedPortfolioIdsFor(identity.uid, profileRole, input.featuredPortfolioIds);

  const nextProfile = {
    displayName: cleanText(input.displayName, 80) || identity.email.split('@')[0],
    handle,
    headline: cleanText(input.headline, 140),
    bio: cleanText(input.bio, 1200),
    welcomeMessage: cleanText(input.welcomeMessage, 300),
    pronouns: cleanText(input.pronouns, 60),
    avatarInitials: cleanText(input.avatarInitials, 4).toUpperCase(),
    avatarTone: cleanText(input.avatarTone, 32) || 'plum',
    favouriteTags: cleanStringList(input.favouriteTags),
    favouriteTropes: cleanStringList(input.favouriteTropes),
    favouriteCategories: cleanStringList(input.favouriteCategories),
    roleFocus: cleanStringList(input.roleFocus),
    roleSpecialties: cleanStringList(input.roleSpecialties),
    roleSecondary: cleanStringList(input.roleSecondary),
    roleAvailability: cleanText(input.roleAvailability, 100),
    roleDetailOne: cleanText(input.roleDetailOne, 600),
    roleDetailTwo: cleanText(input.roleDetailTwo, 600),
    portfolioNote: cleanText(input.portfolioNote, 400),
    featuredPortfolioIds,
    publicProfile: profileRole === 'admin' ? false : input.publicProfile !== false,
    onboardingComplete: input.onboardingComplete === true,
    onboardingVersion: Math.max(0, Math.floor(Number(input.onboardingVersion ?? 1))),
    updatedAt: FieldValue.serverTimestamp(),
  };

  const targetProfileRef = profileRef(identity.uid);
  await db.runTransaction(async (transaction) => {
    const currentProfile = await transaction.get(targetProfileRef);
    const currentHandle = cleanHandle(currentProfile.data()?.handle);
    const targetHandleRef = handle ? db.collection('handles').doc(handle) : null;
    const targetHandle = targetHandleRef ? await transaction.get(targetHandleRef) : null;
    const oldHandleRef = currentHandle && currentHandle !== handle
      ? db.collection('handles').doc(currentHandle)
      : null;
    const oldHandle = oldHandleRef ? await transaction.get(oldHandleRef) : null;

    if (targetHandle?.exists && targetHandle.data()?.userId !== identity.uid) {
      throw new HttpsError('already-exists', 'That @handle is already in use.');
    }

    if (targetHandleRef) {
      transaction.set(targetHandleRef, {
        userId: identity.uid,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    if (oldHandleRef && oldHandle?.data()?.userId === identity.uid) {
      transaction.delete(oldHandleRef);
    }

    transaction.set(targetProfileRef, {
      ...nextProfile,
      ...(currentProfile.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
    }, { merge: true });
  });

  if (profileRole === 'creator' && profileStatus === 'active') {
    await syncCreatorCustomTagUsage(identity.uid);
  }

  const releases = await db.collection('releases').where('creatorUserId', '==', identity.uid).limit(450).get();
  if (!releases.empty) {
    const batch = db.batch();
    for (const release of releases.docs) {
      batch.set(release.ref, {
        creatorName: nextProfile.displayName,
        creatorHandle: nextProfile.handle,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }
    await batch.commit();
  }

  const saved = await targetProfileRef.get();
  return { profile: saved.data() ?? null };
});

const publicProfileForAccount = async (account: QueryDocumentSnapshot) => {
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
    welcomeMessage: data.welcomeMessage ?? null,
    pronouns: data.pronouns ?? null,
    avatarUrl: data.avatarStatus === 'approved' ? data.avatarUrl ?? null : null,
    avatarStatus: data.avatarStatus ?? null,
    avatarInitials: data.avatarInitials ?? null,
    initials: data.avatarInitials ?? null,
    avatarTone: data.avatarTone ?? 'plum',
    followerCount: Math.max(0, Number(data.followerCount ?? 0)),
    favouriteTags: Array.isArray(data.favouriteTags) ? data.favouriteTags : [],
    favouriteTropes: Array.isArray(data.favouriteTropes) ? data.favouriteTropes : [],
    favouriteCategories: Array.isArray(data.favouriteCategories) ? data.favouriteCategories : [],
    roleFocus: Array.isArray(data.roleFocus) ? data.roleFocus : [],
    roleSpecialties: Array.isArray(data.roleSpecialties) ? data.roleSpecialties : [],
    roleSecondary: Array.isArray(data.roleSecondary) ? data.roleSecondary : [],
    roleAvailability: data.roleAvailability ?? null,
    roleDetailOne: data.roleDetailOne ?? null,
    roleDetailTwo: data.roleDetailTwo ?? null,
    portfolioNote: data.portfolioNote ?? null,
    featuredPortfolioIds: Array.isArray(data.featuredPortfolioIds) ? data.featuredPortfolioIds : [],
  };
};

const calculateVerifiedListening = (events: Array<Record<string, any>>) => {
  const ordered = events
    .filter((event) => ['start', 'progress', 'complete'].includes(String(event.eventType ?? '')))
    .slice()
    .sort((a, b) => (a.createdAt?.toMillis?.() ?? 0) - (b.createdAt?.toMillis?.() ?? 0));

  const byUser = new Map<string, number>();
  const byCreator = new Map<string, number>();
  const listenersByCreator = new Map<string, Set<string>>();
  const lastPosition = new Map<string, { position: number; at: number }>();
  let totalSeconds = 0;

  for (const event of ordered) {
    const userId = cleanText(event.userId, 160);
    const releaseId = cleanText(event.releaseId, 160);
    const creatorUserId = cleanText(event.creatorUserId, 160);
    if (!userId || !releaseId) continue;

    const duration = Math.max(0, Number(event.durationSeconds ?? 0));
    let position = Math.max(0, Number(event.positionSeconds ?? 0));
    if (!Number.isFinite(position)) continue;
    if (duration > 0) position = Math.min(position, duration);

    const at = Number(event.createdAt?.toMillis?.() ?? 0);
    const key = userId + ':' + releaseId;
    const previous = lastPosition.get(key);
    let delta = 0;

    if (previous && event.eventType !== 'start' && at > previous.at && at - previous.at <= 30 * 60_000) {
      const elapsedSeconds = Math.max(0, (at - previous.at) / 1000);
      const forwardProgress = Math.max(0, position - previous.position);
      // Allow a small timing tolerance but never credit giant seek jumps or rapid event spam.
      delta = Math.min(forwardProgress, elapsedSeconds + 15, 120);
    }

    lastPosition.set(key, { position, at });
    if (delta <= 0) continue;

    byUser.set(userId, (byUser.get(userId) ?? 0) + delta);
    if (creatorUserId) {
      byCreator.set(creatorUserId, (byCreator.get(creatorUserId) ?? 0) + delta);
      const listeners = listenersByCreator.get(creatorUserId) ?? new Set<string>();
      listeners.add(userId);
      listenersByCreator.set(creatorUserId, listeners);
    }
    totalSeconds += delta;
  }

  return { byUser, byCreator, listenersByCreator, totalSeconds };
};

export const listCreators = onCall({ region: REGION }, async (request) => {
  const identity = await requireActiveIdentity(request);
  await requireAgeVerified(identity.uid);
  const [accounts, releases, listening] = await Promise.all([
    db.collection('accounts').where('role', '==', 'creator').limit(200).get(),
    db.collection('releases').where('status', '==', 'released').limit(1000).get(),
    db.collection('listeningEvents').limit(5000).get(),
  ]);

  const releaseCounts = new Map<string, number>();
  for (const release of releases.docs) {
    const creatorUserId = cleanText(release.data().creatorUserId, 160);
    if (creatorUserId) releaseCounts.set(creatorUserId, (releaseCounts.get(creatorUserId) ?? 0) + 1);
  }

  const verified = calculateVerifiedListening(listening.docs.map((doc) => doc.data()));

  const creators = (await Promise.all(
    accounts.docs
      .filter((doc) => doc.data().status === 'active')
      .map(async (doc) => {
        const base = await publicProfileForAccount(doc);
        if (!base) return null;
        const seconds = verified.byCreator.get(doc.id) ?? 0;
        return {
          ...base,
          followerCount: Number((base as any).followerCount ?? 0),
          releaseCount: releaseCounts.get(doc.id) ?? 0,
          verifiedListeningMinutes: Math.round((seconds / 60) * 10) / 10,
          listeningSharePercent: verified.totalSeconds > 0
            ? Math.round((seconds / verified.totalSeconds) * 1000) / 10
            : 0,
        };
      }),
  )).filter(Boolean);

  return { creators };
});

export const listPublicProfiles = onCall({ region: REGION }, async (request) => {
  const identity = await requireActiveIdentity(request);
  await requireAgeVerified(identity.uid);

  const [accounts, releases, scripts, collaborations] = await Promise.all([
    db.collection('accounts').limit(1000).get(),
    db.collection('releases').where('status', '==', 'released').limit(1000).get(),
    db.collection('scripts').limit(1000).get(),
    db.collection('collaborationProposals').limit(1000).get(),
  ]);

  const releaseCountByCreator = new Map<string, number>();
  const creditCountByUser = new Map<string, number>();
  for (const release of releases.docs) {
    const creatorUserId = cleanText(release.data().creatorUserId, 160);
    if (creatorUserId) releaseCountByCreator.set(creatorUserId, (releaseCountByCreator.get(creatorUserId) ?? 0) + 1);
    for (const credit of normaliseReleaseContributors(release.data().contributors)) {
      if (credit.userId) creditCountByUser.set(credit.userId, (creditCountByUser.get(credit.userId) ?? 0) + 1);
    }
  }

  const publishedScriptsByWriter = new Map<string, number>();
  for (const script of scripts.docs) {
    if (!['Approved','Published'].includes(String(script.data().status))) continue;
    const writerUserId = cleanText(script.data().writerUserId, 160);
    if (writerUserId) publishedScriptsByWriter.set(writerUserId, (publishedScriptsByWriter.get(writerUserId) ?? 0) + 1);
  }

  const collaborationCountByUser = new Map<string, number>();
  for (const collaboration of collaborations.docs) {
    const data = collaboration.data() ?? {};
    if (data.status !== 'completed') continue;
    const writerUserId = cleanText(data.writerUserId, 160);
    const recipientUserId = cleanText(data.recipientUserId, 160);
    if (writerUserId) collaborationCountByUser.set(writerUserId, (collaborationCountByUser.get(writerUserId) ?? 0) + 1);
    if (recipientUserId) collaborationCountByUser.set(recipientUserId, (collaborationCountByUser.get(recipientUserId) ?? 0) + 1);
  }

  const allowedRoles = new Set(['creator','writer','editor','listener']);
  const profiles = (await Promise.all(accounts.docs
    .filter((doc) => doc.data().status === 'active' && allowedRoles.has(String(doc.data().role ?? '')))
    .map(async (doc) => {
      const base = await publicProfileForAccount(doc);
      if (!base) return null;
      const role = String(doc.data().role ?? '');
      const releaseCount = releaseCountByCreator.get(doc.id) ?? 0;
      const publishedWorkCount = publishedScriptsByWriter.get(doc.id) ?? 0;
      const creditedReleaseCount = creditCountByUser.get(doc.id) ?? 0;
      const completedCollaborations = collaborationCountByUser.get(doc.id) ?? 0;
      return {
        ...base,
        role,
        releaseCount,
        publishedWorkCount,
        creditedReleaseCount,
        completedCollaborations,
        activityBadges: publicActivityBadges(role, {
          releases: releaseCount,
          publishedScripts: publishedWorkCount,
          creditedReleases: creditedReleaseCount,
          completedCollaborations,
        }),
      };
    }))).filter(Boolean);

  return { profiles };
});

export const getPublicProfile = onCall({ region: REGION }, async (request) => {
  const identity = await requireActiveIdentity(request);
  await requireAgeVerified(identity.uid);

  const userId = cleanText((request.data as { userId?: unknown } | undefined)?.userId, 160);
  if (!userId) throw new HttpsError('invalid-argument', 'Nightjar profile is required.');

  const [account, profile] = await Promise.all([
    accountRef(userId).get(),
    profileRef(userId).get(),
  ]);

  const accountData = account.data();
  const data = profile.data();
  if (
    !account.exists
    || !data
    || accountData?.status !== 'active'
    || accountData?.role === 'admin'
    || data.publicProfile === false
  ) {
    throw new HttpsError('not-found', 'Public Nightjar profile not found.');
  }

  const role = String(accountData?.role ?? '');
  const followingSnapshot = await accountRef(userId).collection('follows').limit(500).get();
  let publishedWorkCount = 0;
  let releaseCount = 0;
  let creatorReleases: ReturnType<typeof releasePayload>[] = [];
  let creditedReleases: ReturnType<typeof releasePayload>[] = [];
  let publicPlaylists: Array<{ id: string; title: string; releaseCount: number; releases: ReturnType<typeof releasePayload>[] }> = [];

  if (role === 'creator') {
    const releases = await db.collection('releases').where('creatorUserId', '==', userId).limit(500).get();
    creatorReleases = releases.docs
      .filter((doc) => doc.data().status === 'released')
      .map((doc) => releasePayload(doc.data(), doc.id))
      .sort((a, b) => String(b.releaseDate ?? '').localeCompare(String(a.releaseDate ?? '')));
    releaseCount = creatorReleases.length;
  } else if (role === 'writer') {
    const scripts = await db.collection('scripts').where('writerUserId', '==', userId).limit(500).get();
    publishedWorkCount = scripts.docs.filter((doc) => ['Approved','Published'].includes(String(doc.data().status))).length;
  }

  if (role === 'writer' || role === 'editor') {
    const releases = await db.collection('releases').where('status', '==', 'released').limit(500).get();
    creditedReleases = releases.docs
      .filter((doc) => normaliseReleaseContributors(doc.data().contributors).some((credit) => credit.userId === userId))
      .map((doc) => releasePayload(doc.data(), doc.id))
      .sort((a, b) => String(b.releaseDate ?? '').localeCompare(String(a.releaseDate ?? '')));
  }

  if (role === 'listener' && Array.isArray(data.featuredPortfolioIds) && data.featuredPortfolioIds.length) {
    const playlistDocs = await Promise.all(
      cleanStringList(data.featuredPortfolioIds, 6).map((playlistId) => accountRef(userId).collection('playlists').doc(playlistId).get()),
    );
    publicPlaylists = await Promise.all(playlistDocs
      .filter((playlist) => playlist.exists)
      .map(async (playlist) => {
        const releaseIds = cleanStringList(playlist.data()?.releaseIds, 50);
        const releaseDocs = await Promise.all(releaseIds.slice(0, 12).map((releaseId) => releaseRef(releaseId).get()));
        const releases = releaseDocs
          .filter((release) => release.exists && release.data()?.status === 'released')
          .map((release) => releasePayload(release.data() ?? {}, release.id));
        return {
          id: playlist.id,
          title: cleanText(playlist.data()?.title, 100) || 'Untitled playlist',
          releaseCount: releaseIds.length,
          releases,
        };
      }));
  }

  const hasPortfolioCuration = Array.isArray(data.featuredPortfolioIds);
  const selectedPortfolioIds = cleanStringList(data.featuredPortfolioIds, 6);
  const selectedPortfolioSet = new Set(selectedPortfolioIds);
  const featuredWork = role === 'creator'
    ? (hasPortfolioCuration ? creatorReleases.filter((release) => selectedPortfolioSet.has(String(release.id))) : creatorReleases.slice(0, 3))
    : (role === 'writer' || role === 'editor')
      ? (hasPortfolioCuration ? creditedReleases.filter((release) => selectedPortfolioSet.has(String(release.id))) : creditedReleases.slice(0, 3))
      : [];
  const completedCollaborations = ['creator','writer','editor'].includes(role)
    ? await completedCollaborationCountFor(userId)
    : 0;
  const activityBadges = publicActivityBadges(role, {
    releases: releaseCount,
    publishedScripts: publishedWorkCount,
    creditedReleases: creditedReleases.length,
    completedCollaborations,
  });

  return {
    profile: {
      userId,
      role,
      displayName: data.displayName ?? 'Nightjar member',
      name: data.displayName ?? 'Nightjar member',
      handle: data.handle ?? null,
      headline: data.headline ?? null,
      bio: data.bio ?? null,
      welcomeMessage: data.welcomeMessage ?? null,
      pronouns: data.pronouns ?? null,
      avatarUrl: data.avatarStatus === 'approved' ? data.avatarUrl ?? null : null,
      initials: data.avatarInitials ?? null,
      avatarTone: data.avatarTone ?? 'plum',
      followerCount: Math.max(0, Number(data.followerCount ?? 0)),
      followingCount: followingSnapshot.size,
      favouriteTags: Array.isArray(data.favouriteTags) ? data.favouriteTags : [],
      favouriteTropes: Array.isArray(data.favouriteTropes) ? data.favouriteTropes : [],
      favouriteCategories: Array.isArray(data.favouriteCategories) ? data.favouriteCategories : [],
      roleFocus: Array.isArray(data.roleFocus) ? data.roleFocus : [],
      roleSpecialties: Array.isArray(data.roleSpecialties) ? data.roleSpecialties : [],
      roleSecondary: Array.isArray(data.roleSecondary) ? data.roleSecondary : [],
      roleAvailability: data.roleAvailability ?? null,
      roleDetailOne: data.roleDetailOne ?? null,
      roleDetailTwo: data.roleDetailTwo ?? null,
      portfolioNote: data.portfolioNote ?? null,
      featuredPortfolioIds: selectedPortfolioIds,
      featuredWork,
      publicPlaylists,
      completedCollaborations,
      activityBadges,
      releaseCount,
      publishedWorkCount,
      creditedReleaseCount: creditedReleases.length,
      creditedReleases,
      publicProfile: true,
    },
  };
});

export const getCreatorProfile = onCall({ region: REGION }, async (request) => {
  const identity = await requireActiveIdentity(request);
  await requireAgeVerified(identity.uid);
  const creatorUserId = cleanText((request.data as { userId?: unknown } | undefined)?.userId, 128);
  if (!creatorUserId) throw new HttpsError('invalid-argument', 'Creator account is required.');

  const account = await accountRef(creatorUserId).get();
  if (!account.exists || account.data()?.role !== 'creator' || account.data()?.status !== 'active') {
    throw new HttpsError('not-found', 'Creator profile not found.');
  }

  const profile = await profileRef(creatorUserId).get();
  const data = profile.data();
  if (!data || data.publicProfile === false) throw new HttpsError('not-found', 'Creator profile not found.');

  const releasesSnapshot = await db.collection('releases').where('creatorUserId', '==', creatorUserId).limit(500).get();
  const releases = releasesSnapshot.docs
    .filter((doc) => doc.data().status === 'released')
    .map((doc) => releasePayload(doc.data(), doc.id))
    .sort((a, b) => String(b.releaseDate ?? '').localeCompare(String(a.releaseDate ?? '')));

  const completedCollaborations = await completedCollaborationCountFor(creatorUserId);

  return {
    creator: {
      userId: creatorUserId,
      name: data.displayName ?? 'Nightjar creator',
      handle: data.handle ?? null,
      headline: data.headline ?? null,
      bio: data.bio ?? null,
      welcomeMessage: data.welcomeMessage ?? null,
      pronouns: data.pronouns ?? null,
      avatarUrl: data.avatarStatus === 'approved' ? data.avatarUrl ?? null : null,
      avatarStatus: data.avatarStatus ?? null,
      initials: data.avatarInitials ?? null,
      followers: Math.max(0, Number(data.followerCount ?? 0)),
      followingCount: (await accountRef(creatorUserId).collection('follows').limit(500).get()).size,
      favouriteTags: Array.isArray(data.favouriteTags) ? data.favouriteTags : [],
      favouriteTropes: Array.isArray(data.favouriteTropes) ? data.favouriteTropes : [],
      favouriteCategories: Array.isArray(data.favouriteCategories) ? data.favouriteCategories : [],
      roleFocus: Array.isArray(data.roleFocus) ? data.roleFocus : [],
      roleSpecialties: Array.isArray(data.roleSpecialties) ? data.roleSpecialties : [],
      roleSecondary: Array.isArray(data.roleSecondary) ? data.roleSecondary : [],
      roleAvailability: data.roleAvailability ?? null,
      roleDetailOne: data.roleDetailOne ?? null,
      roleDetailTwo: data.roleDetailTwo ?? null,
      portfolioNote: data.portfolioNote ?? null,
      featuredPortfolioIds: Array.isArray(data.featuredPortfolioIds) ? data.featuredPortfolioIds : [],
      featuredReleases: (() => {
        const hasPortfolioCuration = Array.isArray(data.featuredPortfolioIds);
        const selected = new Set(cleanStringList(data.featuredPortfolioIds, 6));
        return hasPortfolioCuration ? releases.filter((release) => selected.has(String(release.id))) : releases.slice(0, 3);
      })(),
      completedCollaborations,
      activityBadges: publicActivityBadges('creator', {
        releases: releases.length,
        completedCollaborations,
      }),
      releases,
    },
  };
});

export const listWriters = onCall({ region: REGION }, async (request) => {
  const identity = await requireActiveIdentity(request);
  await requireAgeVerified(identity.uid);
  const accounts = await db.collection('accounts').where('role', '==', 'writer').limit(200).get();
  const writers = (await Promise.all(
    accounts.docs
      .filter((doc) => doc.data().status === 'active')
      .map(async (doc) => {
        const base = await publicProfileForAccount(doc);
        if (!base) return null;
        const scripts = await db.collection('scripts').where('writerUserId', '==', doc.id).limit(500).get();
        const publishedWorkCount = scripts.docs.filter((script) => ['Approved','Published'].includes(String(script.data().status))).length;
        return { ...base, publishedWorkCount };
      }),
  )).filter(Boolean);

  return { writers };
});

export const communityState = onCall({ region: REGION }, async (request) => {
  const identity = await requireActiveIdentity(request);
  const [follows, favourites] = await Promise.all([
    accountRef(identity.uid).collection('follows').limit(500).get(),
    accountRef(identity.uid).collection('favourites').limit(500).get(),
  ]);

  return {
    follows: follows.docs.map((doc) => ({
      targetUserId: doc.id,
      creatorUserId: doc.id,
      targetRole: doc.data().targetRole ?? null,
    })),
    favourites: favourites.docs.map((doc) => ({ releaseId: doc.id })),
  };
});

const persistProfileFollow = async (
  followerUserId: string,
  targetUserId: string,
  targetRole: string | null,
  following: boolean,
) => {
  const followRef = accountRef(followerUserId).collection('follows').doc(targetUserId);
  const targetProfileRef = profileRef(targetUserId);

  await db.runTransaction(async (transaction) => {
    const [existingFollow, targetProfile] = await Promise.all([
      transaction.get(followRef),
      transaction.get(targetProfileRef),
    ]);
    if (!targetProfile.exists) throw new HttpsError('not-found', 'Public Nightjar profile not found.');

    const currentCount = Math.max(0, Number(targetProfile.data()?.followerCount ?? 0));
    if (following && !existingFollow.exists) {
      transaction.set(followRef, {
        targetUserId,
        targetRole,
        createdAt: FieldValue.serverTimestamp(),
      });
      transaction.set(targetProfileRef, {
        followerCount: currentCount + 1,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    } else if (!following && existingFollow.exists) {
      transaction.delete(followRef);
      transaction.set(targetProfileRef, {
        followerCount: Math.max(0, currentCount - 1),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }
  });
};

export const setProfileFollow = onCall({ region: REGION }, async (request) => {
  const identity = await requireActiveIdentity(request);
  const input = (request.data ?? {}) as { targetUserId?: unknown; following?: unknown };
  const targetUserId = cleanText(input.targetUserId, 128);
  if (!targetUserId || targetUserId === identity.uid) {
    throw new HttpsError('invalid-argument', 'Choose another Nightjar profile to follow.');
  }

  const [target, profile] = await Promise.all([
    accountRef(targetUserId).get(),
    profileRef(targetUserId).get(),
  ]);
  if (!target.exists || target.data()?.status !== 'active' || target.data()?.role === 'admin') {
    throw new HttpsError('not-found', 'Public Nightjar profile not found.');
  }
  if (!profile.exists || profile.data()?.publicProfile === false) {
    throw new HttpsError('not-found', 'Public Nightjar profile not found.');
  }

  const following = input.following !== false;
  await persistProfileFollow(identity.uid, targetUserId, String(target.data()?.role ?? '') || null, following);

  return {
    targetUserId,
    targetRole: target.data()?.role ?? null,
    following,
  };
});

// Backward-compatible callable name while older clients migrate to generic profile follows.
export const setCreatorFollow = onCall({ region: REGION }, async (request) => {
  const identity = await requireActiveIdentity(request);
  const input = (request.data ?? {}) as { creatorUserId?: unknown; following?: unknown };
  const targetUserId = cleanText(input.creatorUserId, 128);
  if (!targetUserId || targetUserId === identity.uid) {
    throw new HttpsError('invalid-argument', 'Choose another Nightjar profile to follow.');
  }

  const [target, profile] = await Promise.all([
    accountRef(targetUserId).get(),
    profileRef(targetUserId).get(),
  ]);
  if (!target.exists || target.data()?.status !== 'active' || target.data()?.role !== 'creator' || !profile.exists || profile.data()?.publicProfile === false) {
    throw new HttpsError('not-found', 'Creator profile not found.');
  }

  const following = input.following !== false;
  await persistProfileFollow(identity.uid, targetUserId, 'creator', following);
  return { creatorUserId: targetUserId, following };
});

export const setFavouriteRelease = onCall({ region: REGION }, async (request) => {
  const identity = await requireActiveIdentity(request);
  const input = (request.data ?? {}) as { releaseId?: unknown; favourite?: unknown };
  const releaseId = cleanText(input.releaseId, 160);
  if (!releaseId) throw new HttpsError('invalid-argument', 'Release is required.');

  const ref = accountRef(identity.uid).collection('favourites').doc(releaseId);
  if (input.favourite === false) await ref.delete();
  else await ref.set({ createdAt: FieldValue.serverTimestamp() }, { merge: true });

  return { releaseId, favourite: input.favourite !== false };
});

type ModeratedImageKind = 'profile_avatar' | 'brand_logo' | 'release_artwork';

const IMAGE_CONTENT_TYPES = new Map([
  ['image/png', 'png'],
  ['image/jpeg', 'jpg'],
  ['image/webp', 'webp'],
]);

const publicImageUrl = (assetId: string) => {
  const projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || 'nightjar-audio-9d659';
  return `https://${REGION}-${projectId}.cloudfunctions.net/approvedImage?assetId=${encodeURIComponent(assetId)}`;
};

const decodeValidatedImage = (dataUrl: unknown, contentType: unknown) => {
  const type = cleanText(contentType, 80).toLowerCase();
  const extension = IMAGE_CONTENT_TYPES.get(type);
  if (!extension) throw new HttpsError('invalid-argument', 'Use PNG, JPG or WebP images.');

  const raw = String(dataUrl ?? '');
  const match = raw.match(/^data:([^;]+);base64,(.+)$/s);
  if (!match || match[1].toLowerCase() !== type) {
    throw new HttpsError('invalid-argument', 'Image data does not match its declared content type.');
  }

  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length || buffer.length > 5 * 1024 * 1024) {
    throw new HttpsError('invalid-argument', 'Image must be 5 MB or smaller.');
  }

  const png = buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]));
  const jpeg = buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const webp = buffer.length >= 12
    && buffer.subarray(0, 4).toString('ascii') === 'RIFF'
    && buffer.subarray(8, 12).toString('ascii') === 'WEBP';

  if ((type === 'image/png' && !png) || (type === 'image/jpeg' && !jpeg) || (type === 'image/webp' && !webp)) {
    throw new HttpsError('invalid-argument', 'The uploaded file is not a valid supported image.');
  }

  return { type, extension, buffer };
};

const clearAssetFile = async (asset: Record<string, unknown>) => {
  const storagePath = cleanText(asset.storagePath, 500);
  if (!storagePath) return;
  try { await getStorage().bucket().file(storagePath).delete({ ignoreNotFound: true }); } catch { /* metadata remains for audit */ }
};

export const submitImageAsset = onCall({ region: REGION }, async (request) => {
  const identity = await requireActiveIdentity(request);
  const input = (request.data ?? {}) as Record<string, unknown>;
  const kind = cleanText(input.kind, 40) as ModeratedImageKind;
  if (!['profile_avatar', 'brand_logo', 'release_artwork'].includes(kind)) {
    throw new HttpsError('invalid-argument', 'Unsupported image type.');
  }
  if (kind === 'brand_logo' && !identity.admin) {
    throw new HttpsError('permission-denied', 'Administrator access required for Nightjar branding.');
  }

  const targetId = kind === 'profile_avatar'
    ? identity.uid
    : cleanText(input.targetId, 160);

  if (kind === 'release_artwork' && !targetId) {
    throw new HttpsError('invalid-argument', 'Release artwork requires a release ID.');
  }

  if (kind === 'release_artwork') {
    const release = await db.collection('releases').doc(targetId).get();
    if (!release.exists) throw new HttpsError('not-found', 'Release not found.');
    if (!identity.admin) {
      const account = await accountRef(identity.uid).get();
      if (account.data()?.role !== 'creator' || account.data()?.status !== 'active') {
        throw new HttpsError('permission-denied', 'Active Creator access required.');
      }
      if (release.data()?.creatorUserId !== identity.uid) {
        throw new HttpsError('permission-denied', 'You cannot change artwork for another creator.');
      }
      if (release.data()?.status === 'released') {
        throw new HttpsError('failed-precondition', 'Live release artwork cannot be replaced directly.');
      }
    }
  }

  const { type, extension, buffer } = decodeValidatedImage(input.dataUrl, input.contentType);
  const assetId = randomUUID();
  const storagePath = `pending-images/${identity.uid}/${assetId}.${extension}`;

  await getStorage().bucket().file(storagePath).save(buffer, {
    resumable: false,
    contentType: type,
    metadata: {
      cacheControl: 'private,no-store,max-age=0',
      metadata: {
        nightjarAssetId: assetId,
        moderationStatus: 'pending',
      },
    },
  });

  const record = {
    id: assetId,
    ownerUserId: identity.uid,
    ownerEmail: identity.email,
    kind,
    targetId: targetId || null,
    fileName: cleanText(input.fileName, 180) || null,
    contentType: type,
    byteSize: buffer.length,
    storagePath,
    status: 'pending',
    moderationNote: null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  await db.collection('imageAssets').doc(assetId).set(record);

  if (kind === 'profile_avatar') {
    const existingProfile = await profileRef(identity.uid).get();
    const previousPendingId = cleanText(existingProfile.data()?.pendingAvatarAssetId, 160);
    if (previousPendingId && previousPendingId !== assetId) {
      const previousPending = await db.collection('imageAssets').doc(previousPendingId).get();
      if (previousPending.exists && previousPending.data()?.status === 'pending') {
        await clearAssetFile(previousPending.data() ?? {});
        await previousPending.ref.set({ status: 'removed', updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      }
    }
    await profileRef(identity.uid).set({
      pendingAvatarAssetId: assetId,
      pendingAvatarStatus: 'pending',
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  } else if (kind === 'brand_logo') {
    const brandingRef = db.collection('settings').doc('branding');
    const existingBranding = await brandingRef.get();
    const previousPendingId = cleanText(existingBranding.data()?.pendingLogoAssetId, 160);
    if (previousPendingId && previousPendingId !== assetId) {
      const previousPending = await db.collection('imageAssets').doc(previousPendingId).get();
      if (previousPending.exists && previousPending.data()?.status === 'pending') {
        await clearAssetFile(previousPending.data() ?? {});
        await previousPending.ref.set({ status: 'removed', updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      }
    }
    await brandingRef.set({
      pendingLogoAssetId: assetId,
      pendingLogoStatus: 'pending',
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  } else if (kind === 'release_artwork') {
    const releaseRefForArtwork = db.collection('releases').doc(targetId);
    const release = await releaseRefForArtwork.get();
    const previousPendingId = cleanText(release.data()?.pendingArtworkAssetId, 160);
    if (previousPendingId && previousPendingId !== assetId) {
      const previousPending = await db.collection('imageAssets').doc(previousPendingId).get();
      if (previousPending.exists && previousPending.data()?.status === 'pending') {
        await clearAssetFile(previousPending.data() ?? {});
        await previousPending.ref.set({ status: 'removed', updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      }
    }
    await releaseRefForArtwork.set({
      pendingArtworkAssetId: assetId,
      pendingArtworkStatus: 'pending',
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  }

  return { assetId, status: 'pending' };
});

export const approvedImage = onRequest({ region: REGION }, async (request, response) => {
  const assetId = cleanText(request.query.assetId, 160);
  if (!assetId) {
    response.status(400).send('Missing asset.');
    return;
  }

  const assetSnapshot = await db.collection('imageAssets').doc(assetId).get();
  const asset = assetSnapshot.data();
  if (!asset || asset.status !== 'approved') {
    response.status(404).send('Image not available.');
    return;
  }

  const storagePath = cleanText(asset.storagePath, 500);
  if (!storagePath) {
    response.status(404).send('Image not available.');
    return;
  }

  response.setHeader('Content-Type', cleanText(asset.contentType, 80) || 'application/octet-stream');
  response.setHeader('Cache-Control', 'no-store,max-age=0');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");

  const stream = getStorage().bucket().file(storagePath).createReadStream();
  stream.on('error', () => {
    if (!response.headersSent) response.status(404).send('Image not available.');
    else response.end();
  });
  stream.pipe(response);
});

export const getPendingImagePreview = onCall({ region: REGION }, async (request) => {
  requireAdminIdentity(request);
  const assetId = cleanText((request.data as { assetId?: unknown } | undefined)?.assetId, 160);
  if (!assetId) throw new HttpsError('invalid-argument', 'Image asset is required.');

  const snapshot = await db.collection('imageAssets').doc(assetId).get();
  const asset = snapshot.data();
  if (!asset || asset.status !== 'pending') {
    throw new HttpsError('failed-precondition', 'This image is no longer awaiting moderation.');
  }

  const storagePath = cleanText(asset.storagePath, 500);
  const contentType = cleanText(asset.contentType, 80);
  if (!storagePath || !contentType.startsWith('image/')) {
    throw new HttpsError('not-found', 'Pending image preview is unavailable.');
  }

  try {
    const [buffer] = await getStorage().bucket().file(storagePath).download();
    if (!buffer.length || buffer.length > 5 * 1024 * 1024) {
      throw new HttpsError('failed-precondition', 'Pending image is outside the allowed preview size.');
    }
    return {
      assetId,
      contentType,
      dataUrl: `data:${contentType};base64,${buffer.toString('base64')}`,
    };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    throw new HttpsError('not-found', 'Pending image preview could not be loaded.');
  }
});

export const listPendingImages = onCall({ region: REGION }, async (request) => {
  requireAdminIdentity(request);
  const snapshot = await db.collection('imageAssets').where('status', '==', 'pending').limit(100).get();

  const assets = snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      ownerUserId: data.ownerUserId ?? null,
      ownerEmail: data.ownerEmail ?? null,
      kind: data.kind ?? null,
      targetId: data.targetId ?? null,
      fileName: data.fileName ?? null,
      contentType: data.contentType ?? null,
      byteSize: data.byteSize ?? 0,
      status: data.status,
    };
  });

  return { assets };
});

export const moderateImageAsset = onCall({ region: REGION }, async (request) => {
  const admin = requireAdminIdentity(request);
  const input = (request.data ?? {}) as Record<string, unknown>;
  const assetId = cleanText(input.assetId, 160);
  const decision = cleanText(input.decision, 20);
  const note = cleanText(input.note, 600);
  if (!assetId || !['approved', 'rejected'].includes(decision)) {
    throw new HttpsError('invalid-argument', 'Choose an image and a moderation decision.');
  }
  if (decision === 'approved' && input.safetyConfirmed !== true) {
    throw new HttpsError('failed-precondition', 'Administrator image-safety review must be explicitly confirmed before approval.');
  }

  const ref = db.collection('imageAssets').doc(assetId);
  const snapshot = await ref.get();
  const asset = snapshot.data();
  if (!asset || asset.status !== 'pending') {
    throw new HttpsError('failed-precondition', 'This image is no longer pending moderation.');
  }

  if (decision === 'rejected') {
    await clearAssetFile(asset);
    await ref.set({
      status: 'rejected',
      moderationNote: note || null,
      reviewedBy: admin.uid,
      reviewedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    if (asset.kind === 'profile_avatar') {
      await profileRef(String(asset.ownerUserId)).set({
        pendingAvatarAssetId: null,
        pendingAvatarStatus: 'rejected',
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    } else if (asset.kind === 'brand_logo') {
      await db.collection('settings').doc('branding').set({
        pendingLogoAssetId: null,
        pendingLogoStatus: 'rejected',
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    } else if (asset.kind === 'release_artwork' && asset.targetId) {
      const releaseRefForArtwork = db.collection('releases').doc(String(asset.targetId));
      const release = await releaseRefForArtwork.get();
      if (release.exists && release.data()?.pendingArtworkAssetId === assetId) {
        await releaseRefForArtwork.set({
          pendingArtworkAssetId: null,
          pendingArtworkStatus: 'rejected',
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
      }
    }

    if (asset.ownerUserId) {
      await createNotification(String(asset.ownerUserId), {
        type: 'image_moderation',
        subtype: 'rejected',
        title: asset.kind === 'profile_avatar'
          ? 'Profile picture not approved'
          : asset.kind === 'release_artwork'
            ? 'Release artwork not approved'
            : 'Nightjar image not approved',
        message: note || 'The submitted image was not approved for use on Nightjar. You can remove it or submit a different image.',
        assetId,
        imageKind: asset.kind,
        targetId: asset.targetId ?? null,
      });
    }

    return { assetId, status: 'rejected' };
  }

  const url = publicImageUrl(assetId);
  await ref.set({
    status: 'approved',
    publicUrl: url,
    moderationNote: note || null,
    reviewedBy: admin.uid,
    moderationPolicy: 'no-explicit-imagery-v1',
    safetyConfirmed: true,
    reviewedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  if (asset.kind === 'profile_avatar') {
    const profile = await profileRef(String(asset.ownerUserId)).get();
    const previousAssetId = cleanText(profile.data()?.avatarAssetId, 160);
    await profileRef(String(asset.ownerUserId)).set({
      avatarAssetId: assetId,
      avatarUrl: url,
      avatarStatus: 'approved',
      pendingAvatarAssetId: null,
      pendingAvatarStatus: null,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    if (previousAssetId && previousAssetId !== assetId) {
      const previous = await db.collection('imageAssets').doc(previousAssetId).get();
      if (previous.exists) {
        await clearAssetFile(previous.data() ?? {});
        await previous.ref.set({ status: 'removed', updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      }
    }
  } else if (asset.kind === 'brand_logo') {
    const brandingRef = db.collection('settings').doc('branding');
    const branding = await brandingRef.get();
    const previousAssetId = cleanText(branding.data()?.logoAssetId, 160);
    await brandingRef.set({
      logoAssetId: assetId,
      logoUrl: url,
      logoStatus: 'approved',
      pendingLogoAssetId: null,
      pendingLogoStatus: null,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    if (previousAssetId && previousAssetId !== assetId) {
      const previous = await db.collection('imageAssets').doc(previousAssetId).get();
      if (previous.exists) {
        await clearAssetFile(previous.data() ?? {});
        await previous.ref.set({ status: 'removed', updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      }
    }
  } else if (asset.kind === 'release_artwork' && asset.targetId) {
    const releaseRefForArtwork = db.collection('releases').doc(String(asset.targetId));
    const release = await releaseRefForArtwork.get();
    if (!release.exists || release.data()?.pendingArtworkAssetId !== assetId) {
      await clearAssetFile(asset);
      await ref.set({ status: 'removed', publicUrl: null, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      throw new HttpsError('failed-precondition', 'This artwork is no longer the pending replacement for the release.');
    }
    const previousAssetId = cleanText(release.data()?.artworkAssetId, 160);
    await releaseRefForArtwork.set({
      artworkAssetId: assetId,
      artworkUrl: url,
      artworkStatus: 'approved',
      pendingArtworkAssetId: null,
      pendingArtworkStatus: null,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    if (previousAssetId && previousAssetId !== assetId) {
      const previous = await db.collection('imageAssets').doc(previousAssetId).get();
      if (previous.exists) {
        await clearAssetFile(previous.data() ?? {});
        await previous.ref.set({
          status: 'removed',
          publicUrl: null,
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
      }
    }
  }

  if (asset.ownerUserId) {
    await createNotification(String(asset.ownerUserId), {
      type: 'image_moderation',
      subtype: 'approved',
      title: asset.kind === 'profile_avatar'
        ? 'Profile picture approved'
        : asset.kind === 'release_artwork'
          ? 'Release artwork approved'
          : 'Nightjar image approved',
      message: asset.kind === 'release_artwork'
        ? 'Your artwork passed Nightjar image moderation and is now available to the release.'
        : 'Your image passed Nightjar moderation and is now approved for use.',
      assetId,
      imageKind: asset.kind,
      targetId: asset.targetId ?? null,
    });
  }

  return { assetId, status: 'approved', publicUrl: url };
});

export const getImageAssetStatus = onCall({ region: REGION }, async (request) => {
  const identity = await requireActiveIdentity(request);
  const assetId = cleanText((request.data as { assetId?: unknown } | undefined)?.assetId, 160);
  const snapshot = await db.collection('imageAssets').doc(assetId).get();
  const data = snapshot.data();
  if (!data) throw new HttpsError('not-found', 'Image record not found.');
  if (!identity.admin && data.ownerUserId !== identity.uid) {
    throw new HttpsError('permission-denied', 'You cannot inspect this image record.');
  }
  return {
    assetId,
    status: data.status,
    publicUrl: data.status === 'approved' ? data.publicUrl ?? publicImageUrl(assetId) : null,
    moderationNote: data.moderationNote ?? null,
  };
});

export const removeOwnedImageAsset = onCall({ region: REGION }, async (request) => {
  const identity = await requireActiveIdentity(request);
  const assetId = cleanText((request.data as { assetId?: unknown } | undefined)?.assetId, 160);
  if (!assetId) throw new HttpsError('invalid-argument', 'Image asset is required.');

  const ref = db.collection('imageAssets').doc(assetId);
  const snapshot = await ref.get();
  const asset = snapshot.data();
  if (!asset) throw new HttpsError('not-found', 'Image record not found.');
  if (!identity.admin && asset.ownerUserId !== identity.uid) {
    throw new HttpsError('permission-denied', 'You cannot remove this image.');
  }

  await clearAssetFile(asset);
  await ref.set({
    status: 'removed',
    publicUrl: null,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  if (asset.kind === 'release_artwork' && asset.targetId) {
    const releaseRefForArtwork = db.collection('releases').doc(String(asset.targetId));
    const release = await releaseRefForArtwork.get();
    if (release.exists) {
      const update: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
      if (release.data()?.pendingArtworkAssetId === assetId) {
        update.pendingArtworkAssetId = null;
        update.pendingArtworkStatus = null;
      }
      if (release.data()?.artworkAssetId === assetId) {
        update.artworkAssetId = null;
        update.artworkUrl = null;
        update.artworkStatus = null;
      }
      if (Object.keys(update).length > 1) await releaseRefForArtwork.set(update, { merge: true });
    }
  }

  return { removed: true, assetId };
});

export const removeProfileAvatar = onCall({ region: REGION }, async (request) => {
  const identity = await requireActiveIdentity(request);
  const profile = await profileRef(identity.uid).get();
  const data = profile.data() ?? {};
  for (const assetId of [data.avatarAssetId, data.pendingAvatarAssetId]) {
    const cleanId = cleanText(assetId, 160);
    if (!cleanId) continue;
    const asset = await db.collection('imageAssets').doc(cleanId).get();
    if (asset.exists && asset.data()?.ownerUserId === identity.uid) {
      await clearAssetFile(asset.data() ?? {});
      await asset.ref.set({ status: 'removed', updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    }
  }
  await profileRef(identity.uid).set({
    avatarAssetId: null,
    avatarUrl: null,
    avatarStatus: null,
    pendingAvatarAssetId: null,
    pendingAvatarStatus: null,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  return { removed: true };
});

export const getBranding = onCall({ region: REGION }, async () => {
  const snapshot = await db.collection('settings').doc('branding').get();
  const data = snapshot.data() ?? {};
  return {
    logoUrl: data.logoStatus === 'approved' ? data.logoUrl ?? null : null,
    logoStatus: data.logoStatus ?? null,
    pendingLogoAssetId: null,
  };
});

export const removeBrandLogo = onCall({ region: REGION }, async (request) => {
  requireAdminIdentity(request);
  const ref = db.collection('settings').doc('branding');
  const snapshot = await ref.get();
  const data = snapshot.data() ?? {};
  for (const assetId of [data.logoAssetId, data.pendingLogoAssetId]) {
    const cleanId = cleanText(assetId, 160);
    if (!cleanId) continue;
    const asset = await db.collection('imageAssets').doc(cleanId).get();
    if (asset.exists) {
      await clearAssetFile(asset.data() ?? {});
      await asset.ref.set({ status: 'removed', updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    }
  }
  await ref.set({
    logoAssetId: null,
    logoUrl: null,
    logoStatus: null,
    pendingLogoAssetId: null,
    pendingLogoStatus: null,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  return { removed: true };
});

type CreatorRateBand = {
  minPaidSubscribers: number;
  monthlyRatePence: number;
};

type CommercialSettings = {
  planningMonthlyPricePence: number | null;
  creatorPoolPercent: number | null;
  reservePercent: number | null;
  payoutCadence: string | null;
  eligibleListeningDefinition: string | null;
  compensationModel: 'capped_equal_rate' | null;
  creatorMonthlyCapPence: number | null;
  creatorRateBands: CreatorRateBand[];
  creatorEligibilityDefinition: string | null;
  popularityAffectsBaseRate: false;
  tipsEnabled: boolean;
  individualPurchasesEnabled: boolean;
};

const readCommercialSettings = async (): Promise<CommercialSettings> => {
  const snapshot = await db.collection('settings').doc('commercial').get();
  const data = snapshot.data() ?? {};
  return {
    planningMonthlyPricePence: typeof data.planningMonthlyPricePence === 'number'
      ? data.planningMonthlyPricePence
      : snapshot.exists && Object.prototype.hasOwnProperty.call(data, 'planningMonthlyPricePence')
        ? null
        : 500,
    creatorPoolPercent: typeof data.creatorPoolPercent === 'number' ? data.creatorPoolPercent : null,
    reservePercent: typeof data.reservePercent === 'number' ? data.reservePercent : null,
    payoutCadence: data.payoutCadence ? String(data.payoutCadence) : null,
    eligibleListeningDefinition: data.eligibleListeningDefinition ? String(data.eligibleListeningDefinition) : null,
    compensationModel: data.compensationModel === 'capped_equal_rate' ? 'capped_equal_rate' : 'capped_equal_rate',
    creatorMonthlyCapPence: typeof data.creatorMonthlyCapPence === 'number' ? Math.max(0, Math.round(data.creatorMonthlyCapPence)) : null,
    creatorRateBands: Array.isArray(data.creatorRateBands)
      ? data.creatorRateBands
        .map((item: any) => ({
          minPaidSubscribers: Math.max(0, Math.round(Number(item?.minPaidSubscribers ?? 0))),
          monthlyRatePence: Math.max(0, Math.round(Number(item?.monthlyRatePence ?? 0))),
        }))
        .filter((item: CreatorRateBand) => Number.isFinite(item.minPaidSubscribers) && Number.isFinite(item.monthlyRatePence))
        .sort((a: CreatorRateBand, b: CreatorRateBand) => a.minPaidSubscribers - b.minPaidSubscribers)
        .slice(0, 24)
      : [],
    creatorEligibilityDefinition: data.creatorEligibilityDefinition ? String(data.creatorEligibilityDefinition) : null,
    popularityAffectsBaseRate: false,
    tipsEnabled: data.tipsEnabled === true,
    individualPurchasesEnabled: data.individualPurchasesEnabled === true,
  };
};

export const commercialOverview = onCall({ region: REGION }, async (request) => {
  requireAdminIdentity(request);
  const [settings, subscriptions, creators] = await Promise.all([
    readCommercialSettings(),
    db.collection('subscriptions').limit(5000).get(),
    db.collection('accounts').where('role', '==', 'creator').limit(1000).get(),
  ]);

  let active = 0;
  let trialing = 0;
  let pastDue = 0;
  let activePaidSubscribers = 0;
  let confirmedGrossMrrPence = 0;
  let trialPotentialPence = 0;
  let pastDueAtRiskPence = 0;
  const fallbackMonthlyPricePence = Math.max(0, Math.round(settings.planningMonthlyPricePence ?? 0));

  for (const doc of subscriptions.docs) {
    const data = doc.data();
    const status = String(data.status ?? '');
    const confirmedAmount = typeof data.confirmedMonthlyAmountPence === 'number'
      ? Math.max(0, Math.round(data.confirmedMonthlyAmountPence))
      : null;
    const planningAmount = confirmedAmount ?? fallbackMonthlyPricePence;

    if (status === 'active') {
      active += 1;
      if (confirmedAmount != null && confirmedAmount > 0) {
        activePaidSubscribers += 1;
        confirmedGrossMrrPence += confirmedAmount;
      }
    } else if (status === 'trialing') {
      trialing += 1;
      trialPotentialPence += planningAmount;
    } else if (status === 'past_due') {
      pastDue += 1;
      pastDueAtRiskPence += planningAmount;
    }
  }

  const activeCreatorCount = creators.docs.filter((doc) => doc.data().status === 'active').length;
  const standardMonthlyCreatorRatePence = calculateCreatorRate(settings, activePaidSubscribers);
  const plannedCreatorPayoutPence = standardMonthlyCreatorRatePence * activeCreatorCount;
  const reservePence = settings.reservePercent == null
    ? 0
    : Math.max(0, Math.round(confirmedGrossMrrPence * (settings.reservePercent / 100)));
  const planningBalanceBeforeFeesTaxPence =
    confirmedGrossMrrPence - plannedCreatorPayoutPence - reservePence;

  return {
    settings,
    subscriptions: { active, trialing, pastDue },
    confirmedGrossMrrPence,
    activePaidSubscribers,
    unpricedActiveSubscriptions: Math.max(0, active - activePaidSubscribers),
    trialPotentialPence,
    pastDueAtRiskPence,
    potentialGrossWithTrialsPence: confirmedGrossMrrPence + trialPotentialPence,
    activeCreatorCount,
    standardMonthlyCreatorRatePence,
    plannedCreatorPayoutPence,
    reservePence,
    planningBalanceBeforeFeesTaxPence,
  };
});

export const saveCommercialSettings = onCall({ region: REGION }, async (request) => {
  const admin = requireAdminIdentity(request);
  const input = (request.data ?? {}) as Record<string, unknown>;

  const nullableNumber = (value: unknown, min: number, max: number, integer = false) => {
    if (value === null || value === '' || typeof value === 'undefined') return null;
    const number = Number(value);
    if (!Number.isFinite(number) || number < min || number > max) {
      throw new HttpsError('invalid-argument', 'Commercial setting is outside its allowed range.');
    }
    return integer ? Math.round(number) : Math.round(number * 100) / 100;
  };

  const rawBands = Array.isArray(input.creatorRateBands) ? input.creatorRateBands : [];
  const creatorRateBands: CreatorRateBand[] = rawBands
    .map((item: any) => ({
      minPaidSubscribers: Math.max(0, Math.round(Number(item?.minPaidSubscribers ?? 0))),
      monthlyRatePence: Math.max(0, Math.round(Number(item?.monthlyRatePence ?? 0))),
    }))
    .filter((item) => Number.isFinite(item.minPaidSubscribers) && Number.isFinite(item.monthlyRatePence))
    .sort((a, b) => a.minPaidSubscribers - b.minPaidSubscribers)
    .slice(0, 24);

  const settings: CommercialSettings = {
    planningMonthlyPricePence: nullableNumber(input.planningMonthlyPricePence, 0, 100000, true),
    creatorPoolPercent: null,
    reservePercent: nullableNumber(input.reservePercent, 0, 100),
    payoutCadence: cleanText(input.payoutCadence, 80) || null,
    eligibleListeningDefinition: cleanText(input.eligibleListeningDefinition, 1200) || null,
    compensationModel: 'capped_equal_rate',
    creatorMonthlyCapPence: nullableNumber(input.creatorMonthlyCapPence, 0, 10000000, true),
    creatorRateBands,
    creatorEligibilityDefinition: cleanText(input.creatorEligibilityDefinition, 1600) || null,
    popularityAffectsBaseRate: false,
    tipsEnabled: input.tipsEnabled === true,
    individualPurchasesEnabled: input.individualPurchasesEnabled === true,
  };

  await db.collection('settings').doc('commercial').set({
    ...settings,
    updatedBy: admin.uid,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  return { settings };
});

const londonDateKey = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/London',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date());

const deterministicDailyPick = <T>(items: T[], dateKey: string) => {
  if (!items.length) return null;
  const day = Math.floor(Date.parse(dateKey + 'T00:00:00Z') / 86400000);
  return items[Math.abs(day) % items.length] ?? null;
};

const spotlightForRole = async (role: 'creator' | 'writer' | 'editor', dateKey: string) => {
  const accounts = await db.collection('accounts').where('role', '==', role).limit(300).get();
  const eligible = (await Promise.all(
    accounts.docs
      .filter((doc) => doc.data().status === 'active')
      .sort((a, b) => a.id.localeCompare(b.id))
      .map(async (doc) => {
        const profile = await profileRef(doc.id).get();
        const data = profile.data();
        if (!data || data.publicProfile === false) return null;
        return {
          kind: role,
          name: data.displayName ?? (role === 'editor' ? 'Nightjar Audio Editor' : 'Nightjar member'),
          handle: data.handle ?? null,
          title: data.headline ?? (role === 'editor' ? 'Audio Editor profile' : role === 'creator' ? 'Creator profile' : 'Writer profile'),
          edition: role === 'editor' ? 'Audio Editor Spotlight' : role === 'creator' ? 'Creator Spotlight' : 'Writer Spotlight',
          detail: role === 'editor'
            ? 'A full day of recognition for an Audio Editor shaping Nightjar productions.'
            : role === 'creator'
              ? 'A full day of discovery for this Nightjar creator.'
              : 'A full day of discovery for this Nightjar writer.',
          initials: data.avatarInitials ?? null,
          imageUrl: data.avatarStatus === 'approved' ? data.avatarUrl ?? null : null,
          targetId: doc.id,
          publicProfile: true,
        };
      }),
  )).filter((item): item is NonNullable<typeof item> => Boolean(item));

  return deterministicDailyPick(eligible, dateKey);
};

const londonSpotlightContext = () => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  const weekdayIndex = ({ Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 } as Record<string, number>)[value('weekday')] ?? 0;
  const localDate = new Date(Date.UTC(Number(value('year')), Number(value('month')) - 1, Number(value('day'))));
  return { weekdayIndex, localDate };
};

const listenerSpotlightForToday = async (dateKey: string) => {
  const { weekdayIndex, localDate } = londonSpotlightContext();
  const weekStart = new Date(localDate);
  weekStart.setUTCDate(weekStart.getUTCDate() - weekdayIndex);
  const previousWeekStart = new Date(weekStart);
  previousWeekStart.setUTCDate(previousWeekStart.getUTCDate() - 7);
  const previousWeekEnd = new Date(weekStart);

  const [listenersSnapshot, eventsSnapshot] = await Promise.all([
    db.collection('accounts').where('role', '==', 'listener').limit(1000).get(),
    db.collection('listeningEvents').limit(10000).get(),
  ]);

  const listenerAccounts = new Map(
    listenersSnapshot.docs
      .filter((doc) => doc.data().status === 'active')
      .map((doc) => [doc.id, doc]),
  );

  const weeklyEvents = eventsSnapshot.docs
    .map((doc) => doc.data())
    .filter((event) => {
      const at = event.createdAt?.toMillis?.() ?? 0;
      return at >= previousWeekStart.getTime() && at < previousWeekEnd.getTime();
    })
    .sort((a, b) => (a.createdAt?.toMillis?.() ?? 0) - (b.createdAt?.toMillis?.() ?? 0));

  const verified = calculateVerifiedListening(weeklyEvents);
  const topSeven = Array.from(verified.byUser, ([userId, seconds]) => ({ userId, seconds }))
    .filter((item) => listenerAccounts.has(item.userId))
    .sort((a, b) => b.seconds - a.seconds || a.userId.localeCompare(b.userId))
    .slice(0, 7);

  const selectedIndex = topSeven.length ? weekdayIndex % topSeven.length : -1;
  if (selectedIndex < 0) {
    return {
      listener: null,
      listenerTopSevenCount: 0,
      listenerSpotlightDay: null,
      listenerWeek: previousWeekStart.toISOString().slice(0, 10),
    };
  }

  const selected = topSeven[selectedIndex];
  const profile = await profileRef(selected.userId).get();
  const data = profile.data() ?? {};
  const isPublic = data.publicProfile !== false;
  const displayName = data.displayName ?? 'Nightjar listener';

  return {
    listener: {
      kind: 'listener',
      name: isPublic ? displayName : 'A Nightjar listener',
      handle: isPublic ? data.handle ?? null : null,
      title: 'Community listener',
      edition: 'WEEKLY TOP 7 · #' + String(selectedIndex + 1),
      detail: 'Recognised for the most tracked listening activity in the previous completed week.',
      initials: isPublic ? data.avatarInitials ?? null : 'NJ',
      imageUrl: isPublic && data.avatarStatus === 'approved' ? data.avatarUrl ?? null : null,
      targetId: selected.userId,
      publicProfile: isPublic,
      date: dateKey,
      listenerRank: selectedIndex + 1,
      weeklyTrackedMinutes: Math.round(selected.seconds / 60),
      weeklyTopSevenCount: topSeven.length,
    },
    listenerTopSevenCount: topSeven.length,
    listenerSpotlightDay: selectedIndex + 1,
    listenerWeek: previousWeekStart.toISOString().slice(0, 10),
  };
};

const materializeSpotlightNotification = async (item: any, date: string) => {
  const targetId = cleanText(item?.targetId, 160);
  const kind = cleanText(item?.kind, 40);
  if (!targetId || !kind) return;
  const ref = accountRef(targetId).collection('notifications').doc('spotlight_' + date + '_' + kind);
  const existing = await ref.get();
  if (existing.exists) return;

  const title = kind === 'creator'
    ? 'You are today’s Creator Spotlight'
    : kind === 'writer'
      ? 'You are today’s Writer Spotlight'
      : kind === 'editor'
        ? 'You are today’s Audio Editor Spotlight'
        : 'Thank you — you’re today’s Listener Spotlight';

  const message = kind === 'creator'
    ? 'Your public Nightjar creator profile is featured for the full day.'
    : kind === 'writer'
      ? 'Your public Nightjar writer profile is featured for the full day.'
      : kind === 'editor'
        ? 'Your public Audio Editor profile is featured for the full day.'
        : 'Thank you for being part of Nightjar. You are being recognised from the previous week’s Top 7 listeners.';

  await ref.set({
    type: 'spotlight',
    subtype: kind,
    spotlightDate: date,
    targetUserId: targetId,
    title,
    message,
    listenerRank: kind === 'listener' ? item.listenerRank ?? null : null,
    read: false,
    createdAt: FieldValue.serverTimestamp(),
  });
};

export const spotlightState = onCall({ region: REGION }, async (request) => {
  const identity = await requireActiveIdentity(request);
  await requireAgeVerified(identity.uid);
  const date = londonDateKey();
  const [creator, writer, editor, listenerState] = await Promise.all([
    spotlightForRole('creator', date),
    spotlightForRole('writer', date),
    spotlightForRole('editor', date),
    listenerSpotlightForToday(date),
  ]);
  const spotlights = [creator, writer, editor, listenerState.listener].filter(Boolean);
  await Promise.all(spotlights.map((item) => materializeSpotlightNotification(item, date)));

  return {
    date,
    spotlights,
    listenerTopSevenCount: listenerState.listenerTopSevenCount,
    listenerSpotlightDay: listenerState.listenerSpotlightDay,
    listenerWeek: listenerState.listenerWeek,
  };
});

export const adminAccountOverview = onCall({ region: REGION }, async (request) => {
  requireAdminIdentity(request);
  const accountsSnapshot = await db.collection('accounts').limit(5000).get();
  const accounts = await Promise.all(accountsSnapshot.docs.map(async (doc) => {
    const account = doc.data();
    const profile = await profileRef(doc.id).get();
    const profileData = profile.data() ?? {};
    return {
      userId: doc.id,
      email: account.email ?? null,
      role: account.role ?? null,
      status: account.status ?? 'active',
      name: profileData.displayName ?? account.email?.split('@')?.[0] ?? 'Nightjar account',
      handle: profileData.handle ?? null,
      publicProfile: profileData.publicProfile !== false,
      avatarUrl: profileData.avatarStatus === 'approved' ? profileData.avatarUrl ?? null : null,
      testAccess: account.testAccess === true,
    };
  }));

  const counts = {
    listener: accounts.filter((account) => account.role === 'listener').length,
    creator: accounts.filter((account) => account.role === 'creator').length,
    writer: accounts.filter((account) => account.role === 'writer').length,
    editor: accounts.filter((account) => account.role === 'editor').length,
    admin: ADMIN_EMAILS.size,
  };

  return {
    people: {
      counts,
      accounts,
      administrators: Array.from(ADMIN_EMAILS).map((email) => ({
        email,
        role: 'admin',
        status: 'active',
      })),
    },
  };
});

export const adminSetTestAccess = onCall({ region: REGION }, async (request) => {
  const admin = requireAdminIdentity(request);
  const input = (request.data ?? {}) as Record<string, unknown>;
  const userId = cleanText(input.userId, 160);
  const enabled = input.enabled === true;
  if (!userId) throw new HttpsError('invalid-argument', 'Choose a Nightjar account.');

  const ref = accountRef(userId);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new HttpsError('not-found', 'Nightjar account not found.');

  const email = cleanEmail(snapshot.data()?.email);
  if (ADMIN_EMAILS.has(email)) {
    throw new HttpsError('failed-precondition', 'Administrator accounts already have temporary test access.');
  }

  await ref.set({
    testAccess: enabled,
    testAccessUpdatedBy: admin.uid,
    testAccessUpdatedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  return { userId, testAccess: enabled };
});

export const adminSetAccountRole = onCall({ region: REGION }, async (request) => {
  const admin = requireAdminIdentity(request);
  const input = (request.data ?? {}) as Record<string, unknown>;
  const userId = cleanText(input.userId, 160);
  const role = cleanText(input.role, 30) as AccountRole;
  const status = cleanText(input.status, 30);

  if (!userId || !['listener', 'creator', 'writer', 'editor'].includes(role)) {
    throw new HttpsError('invalid-argument', 'Choose a valid Nightjar account role.');
  }
  if (!['active', 'pending_review', 'suspended'].includes(status)) {
    throw new HttpsError('invalid-argument', 'Choose a valid account status.');
  }

  const ref = accountRef(userId);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new HttpsError('not-found', 'Nightjar account not found.');
  const email = cleanEmail(snapshot.data()?.email);
  if (ADMIN_EMAILS.has(email)) {
    throw new HttpsError('failed-precondition', 'Owner administrator accounts cannot be reassigned here.');
  }

  await ref.set({
    role,
    status,
    roleUpdatedBy: admin.uid,
    roleUpdatedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  await syncCreatorCustomTagUsage(userId);
  return { userId, role, status };
});

export const listCreatorApplications = onCall({ region: REGION }, async (request) => {
  requireAdminIdentity(request);
  const snapshot = await db.collection('creatorApplications').limit(500).get();
  const applications = await Promise.all(snapshot.docs.map(async (doc) => {
    const data = doc.data();
    const profile = await profileRef(String(data.userId ?? doc.id)).get();
    return {
      id: doc.id,
      userId: data.userId ?? doc.id,
      email: data.email ?? null,
      creatorName: profile.data()?.displayName ?? null,
      displayName: profile.data()?.displayName ?? null,
      status: data.status ?? 'pending',
    };
  }));
  applications.sort((a, b) => String(a.status).localeCompare(String(b.status)));
  return { applications };
});

export const decideCreatorApplication = onCall({ region: REGION }, async (request) => {
  const admin = requireAdminIdentity(request);
  const input = (request.data ?? {}) as Record<string, unknown>;
  const applicationId = cleanText(input.applicationId, 160);
  const decision = cleanText(input.decision, 30);
  if (!applicationId || !['approved', 'waitlist', 'rejected'].includes(decision)) {
    throw new HttpsError('invalid-argument', 'Choose a valid creator decision.');
  }

  const applicationRef = db.collection('creatorApplications').doc(applicationId);
  const application = await applicationRef.get();
  if (!application.exists) throw new HttpsError('not-found', 'Creator application not found.');

  const userId = String(application.data()?.userId ?? applicationId);
  const account = await accountRef(userId).get();
  if (!account.exists || account.data()?.role !== 'creator') {
    throw new HttpsError('failed-precondition', 'Creator account is no longer eligible for this application.');
  }

  await applicationRef.set({
    status: decision,
    decidedBy: admin.uid,
    decidedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  await accountRef(userId).set({
    status: decision === 'approved' ? 'active' : 'pending_review',
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  await syncCreatorCustomTagUsage(userId);
  return { applicationId, userId, decision, accountStatus: decision === 'approved' ? 'active' : 'pending_review' };
});

export const listBillingSubscriptions = onCall({ region: REGION }, async (request) => {
  requireAdminIdentity(request);
  const snapshot = await db.collection('subscriptions').limit(1000).get();
  const subscriptions = snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      userId: data.userId ?? null,
      email: data.email ?? null,
      plan: data.plan ?? null,
      status: data.status ?? 'unknown',
      confirmedMonthlyAmountPence: typeof data.confirmedMonthlyAmountPence === 'number' ? data.confirmedMonthlyAmountPence : null,
      currentPeriodEnd: toIso(data.currentPeriodEnd),
    };
  });
  return { subscriptions };
});

type ReleaseStatus = 'draft' | 'pending_review' | 'released' | 'rejected';

const releaseRef = (releaseId: string) => db.collection('releases').doc(releaseId);

const requireAccountRole = async (
  request: { auth?: { uid: string; token: Record<string, unknown> } | null },
  roles: AccountRole[],
) => {
  const identity = await requireActiveIdentity(request);
  if (identity.admin && roles.includes('admin')) return { ...identity, role: 'admin' as AccountRole, status: 'active' };
  const snapshot = await accountRef(identity.uid).get();
  const data = snapshot.data() ?? {};
  const role = data.role as AccountRole | null;
  const status = String(data.status ?? 'active');
  if (!role || !roles.includes(role)) throw new HttpsError('permission-denied', 'This Nightjar role does not have access.');
  if (status !== 'active') throw new HttpsError('failed-precondition', 'This Nightjar account is not active.');
  return { ...identity, role, status };
};

const releasePayload = (data: Record<string, unknown>, id: string) => ({
  id,
  creatorUserId: data.creatorUserId ?? null,
  creatorName: data.creatorName ?? 'Nightjar creator',
  creatorHandle: data.creatorHandle ?? null,
  title: data.title ?? '',
  description: data.description ?? '',
  category: data.category ?? '',
  genre: data.genre ?? '',
  mood: data.mood ?? '',
  tags: Array.isArray(data.tags) ? data.tags : [],
  tropes: Array.isArray(data.tropes) ? data.tropes : [],
  durationMinutes: typeof data.durationMinutes === 'number' ? data.durationMinutes : 0,
  artworkUrl: data.artworkStatus === 'approved' ? data.artworkUrl ?? null : null,
  artworkAssetId: data.artworkAssetId ?? null,
  artworkStatus: data.artworkStatus ?? null,
  pendingArtworkAssetId: data.pendingArtworkAssetId ?? null,
  pendingArtworkStatus: data.pendingArtworkStatus ?? null,
  audioAvailable: Boolean(data.audioStoragePath),
  status: data.status ?? 'draft',
  moderationNote: data.moderationNote ?? null,
  contributors: normaliseReleaseContributors(data.contributors),
  contentRating: cleanText(data.contentRating, 24) || 'adult',
  seriesTitle: cleanText(data.seriesTitle, 160) || null,
  episodeNumber: typeof data.episodeNumber === 'number' ? Math.max(0, Math.round(data.episodeNumber)) : null,
  nightjarOriginal: data.nightjarOriginal === true,
  productionNote: cleanText(data.productionNote, 1800) || null,
  releaseDate: toIso(data.releaseDate),
  createdAt: toIso(data.createdAt),
  updatedAt: toIso(data.updatedAt),
});

const releaseSearchText = (data: Record<string, unknown>) => [
  data.title,
  data.description,
  data.category,
  data.genre,
  data.mood,
  data.seriesTitle,
  data.contentRating,
  ...(Array.isArray(data.tags) ? data.tags : []),
  ...(Array.isArray(data.tropes) ? data.tropes : []),
  ...normaliseReleaseContributors(data.contributors).flatMap((item) => [item.name, item.role]),
].filter(Boolean).join(' ').toLowerCase();

export const listCatalogue = onCall({ region: REGION }, async (request) => {
  const identity = await requireActiveIdentity(request);
  await requireAgeVerified(identity.uid);
  const input = (request.data ?? {}) as { q?: unknown; category?: unknown };
  const query = cleanText(input.q, 120).toLowerCase();
  const category = cleanText(input.category, 80).toLowerCase();

  const snapshot = await db.collection('releases').where('status', '==', 'released').limit(500).get();
  const catalogue = snapshot.docs
    .filter((doc) => !category || cleanText(doc.data().category, 80).toLowerCase() === category)
    .filter((doc) => !query || releaseSearchText(doc.data()).includes(query))
    .map((doc) => releasePayload(doc.data(), doc.id));

  return { catalogue };
});

export const createRelease = onCall({ region: REGION }, async (request) => {
  const identity = await requireAccountRole(request, ['creator']);
  const input = (request.data ?? {}) as Record<string, unknown>;
  const profile = await profileRef(identity.uid).get();
  const profileData = profile.data() ?? {};
  const title = cleanText(input.title, 160);
  if (!title) throw new HttpsError('invalid-argument', 'Give the release a title first.');

  const ref = db.collection('releases').doc();
  const record = {
    creatorUserId: identity.uid,
    creatorName: profileData.displayName ?? identity.email.split('@')[0],
    creatorHandle: profileData.handle ?? null,
    title,
    description: cleanText(input.description, 3000),
    category: cleanText(input.category, 80),
    genre: cleanText(input.genre, 80),
    mood: cleanText(input.mood, 80),
    tags: cleanStringList(input.tags, 24),
    tropes: cleanStringList(input.tropes, 24),
    contributors: normaliseReleaseContributors(input.contributors),
    contentRating: cleanReleaseContentRating(input.contentRating),
    seriesTitle: cleanText(input.seriesTitle, 160) || null,
    episodeNumber: cleanEpisodeNumber(input.episodeNumber),
    nightjarOriginal: false,
    productionNote: cleanText(input.productionNote, 1800) || null,
    durationMinutes: 0,
    audioStoragePath: null,
    artworkAssetId: null,
    artworkUrl: null,
    artworkStatus: null,
    pendingArtworkAssetId: null,
    pendingArtworkStatus: null,
    status: 'draft' as ReleaseStatus,
    moderationNote: null,
    version: 1,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  await ref.set(record);
  await syncCreatorCustomTagUsage(identity.uid);
  const saved = await ref.get();
  return { release: releasePayload(saved.data() ?? record, ref.id) };
});

export const updateRelease = onCall({ region: REGION }, async (request) => {
  const identity = await requireAccountRole(request, ['creator']);
  const input = (request.data ?? {}) as Record<string, unknown>;
  const releaseId = cleanText(input.releaseId, 160);
  if (!releaseId) throw new HttpsError('invalid-argument', 'Release is required.');

  const ref = releaseRef(releaseId);
  const snapshot = await ref.get();
  const current = snapshot.data();
  if (!current || current.creatorUserId !== identity.uid) throw new HttpsError('not-found', 'Release not found.');
  if (current.status === 'released') throw new HttpsError('failed-precondition', 'Live releases cannot be edited directly.');

  const update = {
    title: cleanText(input.title ?? current.title, 160),
    description: cleanText(input.description ?? current.description, 3000),
    category: cleanText(input.category ?? current.category, 80),
    genre: cleanText(input.genre ?? current.genre, 80),
    mood: cleanText(input.mood ?? current.mood, 80),
    tags: Array.isArray(input.tags) ? cleanStringList(input.tags, 24) : (current.tags ?? []),
    tropes: Array.isArray(input.tropes) ? cleanStringList(input.tropes, 24) : (current.tropes ?? []),
    contributors: Array.isArray(input.contributors) ? normaliseReleaseContributors(input.contributors) : normaliseReleaseContributors(current.contributors),
    contentRating: typeof input.contentRating !== 'undefined' ? cleanReleaseContentRating(input.contentRating) : cleanReleaseContentRating(current.contentRating),
    seriesTitle: typeof input.seriesTitle !== 'undefined' ? cleanText(input.seriesTitle, 160) || null : current.seriesTitle ?? null,
    episodeNumber: typeof input.episodeNumber !== 'undefined' ? cleanEpisodeNumber(input.episodeNumber) : cleanEpisodeNumber(current.episodeNumber),
    productionNote: typeof input.productionNote !== 'undefined' ? cleanText(input.productionNote, 1800) || null : current.productionNote ?? null,
    durationMinutes: typeof input.durationMinutes === 'number' && Number.isFinite(input.durationMinutes)
      ? Math.max(0, Math.min(1440, input.durationMinutes))
      : current.durationMinutes ?? 0,
    updatedAt: FieldValue.serverTimestamp(),
  };
  await ref.set(update, { merge: true });
  await syncCreatorCustomTagUsage(identity.uid);
  const saved = await ref.get();
  return { release: releasePayload(saved.data() ?? {}, releaseId) };
});

export const deleteRelease = onCall({ region: REGION }, async (request) => {
  const identity = await requireAccountRole(request, ['creator']);
  const releaseId = cleanText((request.data as { releaseId?: unknown } | undefined)?.releaseId, 160);
  const ref = releaseRef(releaseId);
  const snapshot = await ref.get();
  const current = snapshot.data();
  if (!current || current.creatorUserId !== identity.uid) throw new HttpsError('not-found', 'Release not found.');
  if (current.status === 'released') throw new HttpsError('failed-precondition', 'Live releases must be unpublished by Nightjar administration.');

  const audioPath = cleanText(current.audioStoragePath, 500);
  if (audioPath) {
    try { await getStorage().bucket().file(audioPath).delete({ ignoreNotFound: true }); } catch { /* release deletion continues */ }
  }

  for (const assetId of [current.artworkAssetId, current.pendingArtworkAssetId]) {
    const cleanId = cleanText(assetId, 160);
    if (!cleanId) continue;
    const asset = await db.collection('imageAssets').doc(cleanId).get();
    if (asset.exists && asset.data()?.ownerUserId === identity.uid) {
      await clearAssetFile(asset.data() ?? {});
      await asset.ref.set({
        status: 'removed',
        publicUrl: null,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }
  }

  await ref.delete();
  await syncCreatorCustomTagUsage(identity.uid);
  return { deleted: true };
});

export const finalizeReleaseAudio = onCall({ region: REGION }, async (request) => {
  const identity = await requireAccountRole(request, ['creator']);
  const input = (request.data ?? {}) as Record<string, unknown>;
  const releaseId = cleanText(input.releaseId, 160);
  const storagePath = cleanText(input.storagePath, 500);
  if (!releaseId || !storagePath) throw new HttpsError('invalid-argument', 'Release audio is incomplete.');

  const expectedPrefix = `release-audio/${identity.uid}/${releaseId}/`;
  if (!storagePath.startsWith(expectedPrefix)) throw new HttpsError('permission-denied', 'Audio upload path is invalid.');

  const ref = releaseRef(releaseId);
  const snapshot = await ref.get();
  const current = snapshot.data();
  if (!current || current.creatorUserId !== identity.uid) throw new HttpsError('not-found', 'Release not found.');
  if (current.status === 'released') throw new HttpsError('failed-precondition', 'Live release audio cannot be replaced directly.');

  const file = getStorage().bucket().file(storagePath);
  const [exists] = await file.exists();
  if (!exists) throw new HttpsError('not-found', 'Uploaded audio was not found.');
  const [metadata] = await file.getMetadata();
  const size = Number(metadata.size ?? 0);
  const contentType = String(metadata.contentType ?? '');
  const allowed = ['audio/mpeg','audio/mp3','audio/wav','audio/x-wav','audio/mp4','audio/x-m4a','audio/ogg','audio/webm'];
  if (!allowed.includes(contentType) || !size || size > 25 * 1024 * 1024) {
    try { await file.delete({ ignoreNotFound: true }); } catch { /* validation failure remains authoritative */ }
    throw new HttpsError('invalid-argument', 'Uploaded audio is not a supported Nightjar audio file.');
  }

  const oldPath = cleanText(current.audioStoragePath, 500);
  await ref.set({
    audioStoragePath: storagePath,
    audioContentType: contentType,
    audioByteSize: size,
    durationMinutes: typeof input.durationMinutes === 'number' ? Math.max(0, Math.min(1440, input.durationMinutes)) : current.durationMinutes ?? 0,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  if (oldPath && oldPath !== storagePath) {
    try { await getStorage().bucket().file(oldPath).delete({ ignoreNotFound: true }); } catch { /* replacement is already valid */ }
  }

  const saved = await ref.get();
  return { release: releasePayload(saved.data() ?? {}, releaseId) };
});

export const removeReleaseAudio = onCall({ region: REGION }, async (request) => {
  const identity = await requireAccountRole(request, ['creator']);
  const releaseId = cleanText((request.data as { releaseId?: unknown } | undefined)?.releaseId, 160);
  const ref = releaseRef(releaseId);
  const snapshot = await ref.get();
  const current = snapshot.data();
  if (!current || current.creatorUserId !== identity.uid) throw new HttpsError('not-found', 'Release not found.');
  if (current.status === 'released') throw new HttpsError('failed-precondition', 'Live release audio cannot be removed directly.');

  const path = cleanText(current.audioStoragePath, 500);
  if (path) {
    try { await getStorage().bucket().file(path).delete({ ignoreNotFound: true }); } catch { /* record is still cleared */ }
  }
  await ref.set({
    audioStoragePath: null,
    audioContentType: null,
    audioByteSize: null,
    durationMinutes: 0,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  return { removed: true };
});

export const submitReleaseForModeration = onCall({ region: REGION }, async (request) => {
  const identity = await requireAccountRole(request, ['creator']);
  const releaseId = cleanText((request.data as { releaseId?: unknown } | undefined)?.releaseId, 160);
  const ref = releaseRef(releaseId);
  const snapshot = await ref.get();
  const data = snapshot.data();
  if (!data || data.creatorUserId !== identity.uid) throw new HttpsError('not-found', 'Release not found.');
  if (!data.title || !data.description || !data.category || !data.audioStoragePath) {
    throw new HttpsError('failed-precondition', 'Complete title, description, category and audio before submitting.');
  }
  if (data.pendingArtworkAssetId && data.pendingArtworkStatus === 'pending') {
    throw new HttpsError('failed-precondition', 'Artwork moderation must finish before release submission.');
  }
  await ref.set({
    status: 'pending_review',
    moderationNote: null,
    submittedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  const saved = await ref.get();
  return { release: releasePayload(saved.data() ?? {}, releaseId) };
});

export const creatorDashboard = onCall({ region: REGION }, async (request) => {
  const identity = await requireAccountRole(request, ['creator','admin']);
  const targetCreatorId = identity.role === 'creator'
    ? identity.uid
    : cleanText((request.data as { creatorUserId?: unknown } | undefined)?.creatorUserId, 160) || identity.uid;

  const releasesSnapshot = await db.collection('releases').where('creatorUserId', '==', targetCreatorId).limit(500).get();
  const releases = releasesSnapshot.docs.map((doc) => releasePayload(doc.data(), doc.id));
  const listeningSnapshot = await db.collection('listeningEvents').where('creatorUserId', '==', targetCreatorId).limit(5000).get();

  const verified = calculateVerifiedListening(listeningSnapshot.docs.map((doc) => doc.data()));
  const listeningSeconds = verified.byCreator.get(targetCreatorId) ?? 0;
  const listeners = verified.listenersByCreator.get(targetCreatorId) ?? new Set<string>();

  return {
    releases,
    metrics: {
      released: releases.filter((release) => release.status === 'released').length,
      drafts: releases.filter((release) => release.status !== 'released').length,
      verifiedListeningMinutes: Math.round((listeningSeconds / 60) * 10) / 10,
      uniqueListeners: listeners.size,
    },
  };
});

const temporaryAgeBypassFor = async (uid: string) => {
  if (AGE_ASSURANCE_CONFIGURED) return { allowed: false, reason: null as string | null };
  const snapshot = await accountRef(uid).get();
  const data = snapshot.data() ?? {};
  const email = cleanEmail(data.email);
  if (ADMIN_EMAILS.has(email)) return { allowed: true, reason: 'administrator' };
  if (data.testAccess === true) return { allowed: true, reason: 'tester' };
  return { allowed: false, reason: null as string | null };
};

const requireAgeVerified = async (uid: string) => {
  const snapshot = await db.collection('ageAssurance').doc(uid).get();
  const data = snapshot.data();
  if (data?.verified) return data;

  const bypass = await temporaryAgeBypassFor(uid);
  if (bypass.allowed) {
    return {
      verified: true,
      status: 'COMPLETE',
      provider: 'temporary-test-access',
      environment: 'development',
      temporaryBypass: true,
      temporaryBypassReason: bypass.reason,
    };
  }

  throw new HttpsError('permission-denied', 'Age assurance is required before playing Nightjar audio.');
};

export const getReleasePlaybackUrl = onCall({ region: REGION }, async (request) => {
  const identity = await requireActiveIdentity(request);
  await requireAgeVerified(identity.uid);
  const releaseId = cleanText((request.data as { releaseId?: unknown } | undefined)?.releaseId, 160);
  const snapshot = await releaseRef(releaseId).get();
  const data = snapshot.data();
  if (!data || data.status !== 'released' || !data.audioStoragePath) throw new HttpsError('not-found', 'Playable release not found.');

  const [url] = await getStorage().bucket().file(String(data.audioStoragePath)).getSignedUrl({
    action: 'read',
    expires: Date.now() + 15 * 60 * 1000,
  });
  return { releaseId, url, expiresInSeconds: 900 };
});

export const releaseModerationQueue = onCall({ region: REGION }, async (request) => {
  requireAdminIdentity(request);
  const snapshot = await db.collection('releases').where('status', '==', 'pending_review').limit(100).get();
  return { releases: snapshot.docs.map((doc) => releasePayload(doc.data(), doc.id)) };
});

const createNotification = async (userId: string, payload: Record<string, unknown>) => {
  const ref = accountRef(userId).collection('notifications').doc();
  await ref.set({
    ...payload,
    read: false,
    createdAt: FieldValue.serverTimestamp(),
  });
};

export const moderateRelease = onCall({ region: REGION }, async (request) => {
  const admin = requireAdminIdentity(request);
  const input = (request.data ?? {}) as Record<string, unknown>;
  const releaseId = cleanText(input.releaseId, 160);
  const decision = cleanText(input.decision, 30);
  const note = cleanText(input.note, 1200);
  const nightjarOriginal = input.nightjarOriginal === true;
  if (!['approved','changes','rejected'].includes(decision)) throw new HttpsError('invalid-argument', 'Invalid release moderation decision.');

  const ref = releaseRef(releaseId);
  const snapshot = await ref.get();
  const data = snapshot.data();
  if (!data) throw new HttpsError('not-found', 'Release not found.');
  if (data.status !== 'pending_review') throw new HttpsError('failed-precondition', 'Release is not awaiting moderation.');

  const status: ReleaseStatus = decision === 'approved' ? 'released' : decision === 'changes' ? 'draft' : 'rejected';
  await ref.set({
    status,
    moderationNote: note || null,
    moderatedBy: admin.uid,
    moderatedAt: FieldValue.serverTimestamp(),
    releaseDate: decision === 'approved' ? FieldValue.serverTimestamp() : data.releaseDate ?? null,
    nightjarOriginal: decision === 'approved' ? nightjarOriginal : data.nightjarOriginal === true,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  if (data.creatorUserId) {
    await createNotification(String(data.creatorUserId), {
      type: 'content',
      subtype: 'release',
      title: decision === 'approved'
        ? 'Your release is live on Nightjar'
        : decision === 'changes'
          ? 'Changes requested for your release'
          : 'Your release was not approved',
      message: decision === 'approved'
        ? 'Your release has passed Nightjar moderation and is available to age-verified listeners.'
        : decision === 'changes'
          ? 'Nightjar moderation requested changes before this release can be published.'
          : 'Your release was not approved for publication. Open Creator Studio to review the moderation note.',
      releaseId,
      moderationNote: note || null,
    });
  }

  const saved = await ref.get();
  return { release: releasePayload(saved.data() ?? {}, releaseId) };
});

export const recordListeningEvent = onCall({ region: REGION }, async (request) => {
  const identity = await requireActiveIdentity(request);
  await requireAgeVerified(identity.uid);
  const input = (request.data ?? {}) as Record<string, unknown>;
  const releaseId = cleanText(input.releaseId, 160);
  const release = await releaseRef(releaseId).get();
  const releaseData = release.data();
  if (!releaseData || releaseData.status !== 'released') throw new HttpsError('not-found', 'Release not found.');

  const eventType = cleanText(input.eventType, 30);
  if (!['start','progress','complete','skip','hide','favourite','unfavourite'].includes(eventType)) {
    throw new HttpsError('invalid-argument', 'Unsupported listening event.');
  }

  const event = {
    userId: identity.uid,
    creatorUserId: releaseData.creatorUserId ?? null,
    releaseId,
    eventType,
    positionSeconds: Math.max(0, Number(input.positionSeconds ?? 0)),
    durationSeconds: Math.max(0, Number(input.durationSeconds ?? 0)),
    completed: input.completed === true,
    intent: cleanText(input.intent, 120),
    category: releaseData.category ?? null,
    tags: Array.isArray(releaseData.tags) ? releaseData.tags : [],
    createdAt: FieldValue.serverTimestamp(),
  };
  await db.collection('listeningEvents').add(event);

  await accountRef(identity.uid).collection('tasteEvents').add({
    type: eventType,
    category: event.category,
    tags: event.tags,
    completed: event.completed,
    createdAt: FieldValue.serverTimestamp(),
  });

  return { recorded: true };
});

export const listeningResume = onCall({ region: REGION }, async (request) => {
  const identity = await requireActiveIdentity(request);
  const releaseId = cleanText((request.data as { releaseId?: unknown } | undefined)?.releaseId, 160);
  const snapshot = await db.collection('listeningEvents').where('userId', '==', identity.uid).limit(1000).get();
  const events = snapshot.docs
    .map((doc) => doc.data())
    .filter((event) => event.releaseId === releaseId)
    .sort((a, b) => {
      const aTime = a.createdAt?.toMillis?.() ?? 0;
      const bTime = b.createdAt?.toMillis?.() ?? 0;
      return bTime - aTime;
    });

  const latest = events[0];
  const duration = Number(events.find((event) => Number(event.durationSeconds ?? 0) > 0)?.durationSeconds ?? 0);
  const position = latest?.eventType === 'complete'
    ? 0
    : Number(events.find((event) => typeof event.positionSeconds !== 'undefined')?.positionSeconds ?? 0);

  return { releaseId, positionSeconds: Math.max(0, position), durationSeconds: Math.max(0, duration) };
});

export const tasteProfile = onCall({ region: REGION }, async (request) => {
  const identity = await requireActiveIdentity(request);
  const snapshot = await accountRef(identity.uid).collection('tasteEvents').limit(1000).get();
  const weights = new Map<string, number>();
  for (const doc of snapshot.docs) {
    const event = doc.data();
    const factor = event.type === 'skip' || event.type === 'hide' ? -1 : 1;
    for (const value of [...(Array.isArray(event.tags) ? event.tags : []), ...(event.category ? [event.category] : [])]) {
      const key = cleanText(value, 80);
      if (key) weights.set(key, (weights.get(key) ?? 0) + factor);
    }
  }
  const vector = Array.from(weights, ([label, weight]) => ({ label, weight }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 16);
  return { vector };
});

export const recommendations = onCall({ region: REGION }, async (request) => {
  const identity = await requireActiveIdentity(request);
  await requireAgeVerified(identity.uid);
  const input = (request.data ?? {}) as { intent?: unknown };
  const intent = cleanText(input.intent, 120).toLowerCase();

  const [profile, tasteSnapshot, followsSnapshot, releasesSnapshot] = await Promise.all([
    profileRef(identity.uid).get(),
    accountRef(identity.uid).collection('tasteEvents').limit(1000).get(),
    accountRef(identity.uid).collection('follows').limit(500).get(),
    db.collection('releases').where('status', '==', 'released').limit(500).get(),
  ]);

  const liked = new Map<string, number>();
  const profileData = profile.data() ?? {};
  for (const value of [
    ...(Array.isArray(profileData.favouriteTags) ? profileData.favouriteTags : []),
    ...(Array.isArray(profileData.favouriteTropes) ? profileData.favouriteTropes : []),
    ...(Array.isArray(profileData.favouriteCategories) ? profileData.favouriteCategories : []),
  ]) {
    const key = cleanText(value, 80).toLowerCase();
    if (key) liked.set(key, (liked.get(key) ?? 0) + 5);
  }

  for (const doc of tasteSnapshot.docs) {
    const event = doc.data();
    const factor = event.type === 'skip' || event.type === 'hide' ? -1 : 1;
    for (const value of [...(Array.isArray(event.tags) ? event.tags : []), ...(event.category ? [event.category] : [])]) {
      const key = cleanText(value, 80).toLowerCase();
      if (key) liked.set(key, (liked.get(key) ?? 0) + factor);
    }
  }

  const following = new Set(followsSnapshot.docs.map((doc) => doc.id));
  const items = releasesSnapshot.docs.map((doc) => {
    const data = doc.data();
    const values = [
      data.category, data.genre, data.mood,
      ...(Array.isArray(data.tags) ? data.tags : []),
      ...(Array.isArray(data.tropes) ? data.tropes : []),
    ].filter(Boolean).map((value) => String(value));
    let score = 0;
    for (const value of values) score += liked.get(value.toLowerCase()) ?? 0;
    if (data.creatorUserId && following.has(String(data.creatorUserId))) score += 8;
    if (intent && values.some((value) => value.toLowerCase().includes(intent))) score += 4;
    const matches = values.filter((value) => (liked.get(value.toLowerCase()) ?? 0) > 0).slice(0, 3);
    return {
      ...releasePayload(data, doc.id),
      score,
      reason: matches.length
        ? 'Because you chose ' + matches.join(', ') + '.'
        : data.creatorUserId && following.has(String(data.creatorUserId))
          ? 'From a creator you follow.'
          : 'A new release for your current discovery context.',
    };
  }).sort((a, b) => b.score - a.score).slice(0, 24);

  return { recommendations: items, model: { declaredWeight: 5, observedWeight: 1, socialWeight: 8, intentWeight: 4 } };
});

export const trendingReleases = onCall({ region: REGION }, async (request) => {
  const identity = await requireActiveIdentity(request);
  await requireAgeVerified(identity.uid);
  const [releasesSnapshot, listeningSnapshot] = await Promise.all([
    db.collection('releases').where('status', '==', 'released').limit(500).get(),
    db.collection('listeningEvents').limit(5000).get(),
  ]);
  const counts = new Map<string, number>();
  for (const doc of listeningSnapshot.docs) {
    const releaseId = cleanText(doc.data().releaseId, 160);
    if (releaseId) counts.set(releaseId, (counts.get(releaseId) ?? 0) + 1);
  }
  const trending = releasesSnapshot.docs
    .map((doc) => ({ ...releasePayload(doc.data(), doc.id), listeningEvents: counts.get(doc.id) ?? 0 }))
    .sort((a, b) => b.listeningEvents - a.listeningEvents)
    .slice(0, 24);
  return { trending };
});

export const listNotifications = onCall({ region: REGION }, async (request) => {
  const identity = await requireActiveIdentity(request);
  const [snapshot, account] = await Promise.all([
    accountRef(identity.uid).collection('notifications').limit(100).get(),
    accountRef(identity.uid).get(),
  ]);
  const stored = account.data()?.notificationPreferences ?? {};
  const preferences = {
    displayMode: ['full','discreet','minimal'].includes(String(stored.displayMode ?? '')) ? String(stored.displayMode) : 'discreet',
    newReleases: stored.newReleases !== false,
    followedProfiles: stored.followedProfiles !== false,
    collaborations: stored.collaborations !== false,
    payments: stored.payments !== false,
    comments: stored.comments !== false,
    announcements: stored.announcements !== false,
  };

  const enabled = (item: Record<string, any>) => {
    const type = String(item.type ?? '');
    const subtype = String(item.subtype ?? '');
    if (type === 'collaboration') return preferences.collaborations;
    if (type === 'payment' || subtype === 'payment') return preferences.payments;
    if (type === 'comment' || subtype === 'comment') return preferences.comments;
    if (type === 'announcement') return preferences.announcements;
    if (type === 'content' && subtype === 'release') return preferences.newReleases;
    if (type === 'spotlight' || type === 'follow' || subtype === 'follow') return preferences.followedProfiles;
    return true;
  };

  const present = (item: Record<string, any>) => {
    if (preferences.displayMode === 'full') return item;
    if (preferences.displayMode === 'minimal') {
      return { ...item, title: 'Nightjar', message: 'You have a new Nightjar notification.' };
    }
    return {
      ...item,
      title: String(item.type ?? '') === 'payment' ? 'Nightjar account update' : 'Nightjar update',
      message: 'There is a new update waiting for you in Nightjar.',
    };
  };

  const notifications = snapshot.docs
    .map((doc) => ({ id: doc.id, ...doc.data(), createdAt: toIso(doc.data().createdAt) }))
    .filter((item: any) => enabled(item))
    .sort((a: any, b: any) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')))
    .slice(0, 30)
    .map((item: any) => present(item));
  return { notifications, unreadCount: notifications.filter((item: any) => item.read !== true).length };
});

export const markNotificationRead = onCall({ region: REGION }, async (request) => {
  const identity = await requireActiveIdentity(request);
  const notificationId = cleanText((request.data as { notificationId?: unknown } | undefined)?.notificationId, 160);
  const ref = accountRef(identity.uid).collection('notifications').doc(notificationId);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new HttpsError('not-found', 'Notification not found.');
  await ref.set({ read: true, readAt: FieldValue.serverTimestamp() }, { merge: true });
  return { read: true };
});

export const ageStatus = onCall({ region: REGION }, async (request) => {
  const identity = await requireActiveIdentity(request);
  const snapshot = await db.collection('ageAssurance').doc(identity.uid).get();
  const data = snapshot.data() ?? {};
  const bypass = data.verified === true ? { allowed: false, reason: null as string | null } : await temporaryAgeBypassFor(identity.uid);
  const verified = data.verified === true || bypass.allowed;
  return {
    verified,
    status: verified ? 'COMPLETE' : String(data.status ?? 'NOT_STARTED'),
    ageThreshold: 18,
    configured: AGE_ASSURANCE_CONFIGURED,
    provider: data.provider ?? (bypass.allowed ? 'temporary-test-access' : 'not-configured'),
    environment: data.environment ?? (bypass.allowed ? 'development' : 'production'),
    verifiedAt: data.verifiedAt ?? null,
    reverifyRequired: data.reverifyRequired === true,
    testAvailable: identity.admin,
    temporaryBypass: bypass.allowed,
    temporaryBypassReason: bypass.reason,
  };
});

export const startAgeAssurance = onCall({ region: REGION }, async (request) => {
  const identity = await requireActiveIdentity(request);
  const bypass = await temporaryAgeBypassFor(identity.uid);
  if (bypass.allowed) {
    return {
      verified: true,
      status: 'COMPLETE',
      configured: AGE_ASSURANCE_CONFIGURED,
      provider: 'temporary-test-access',
      environment: 'development',
      temporaryBypass: true,
      temporaryBypassReason: bypass.reason,
    };
  }
  throw new HttpsError('failed-precondition', 'Production age-assurance provider credentials are not configured yet.');
});

export const adminAgeTestPass = onCall({ region: REGION }, async (request) => {
  const identity = requireAdminIdentity(request);
  await db.collection('ageAssurance').doc(identity.uid).set({
    verified: true,
    status: 'COMPLETE',
    ageThreshold: 18,
    provider: 'admin-test',
    environment: 'development',
    testMode: true,
    verifiedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  return { verified: true, status: 'COMPLETE', provider: 'admin-test' };
});

export const getAdminReleasePreviewUrl = onCall({ region: REGION }, async (request) => {
  requireAdminIdentity(request);
  const releaseId = cleanText((request.data as { releaseId?: unknown } | undefined)?.releaseId, 160);
  const snapshot = await releaseRef(releaseId).get();
  const data = snapshot.data();
  if (!data || !data.audioStoragePath) throw new HttpsError('not-found', 'Release audio not found.');
  const [url] = await getStorage().bucket().file(String(data.audioStoragePath)).getSignedUrl({
    action: 'read',
    expires: Date.now() + 10 * 60 * 1000,
  });
  return { releaseId, url, expiresInSeconds: 600 };
});

const toIso = (value: any) => {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  if (typeof value.toMillis === 'function') return new Date(value.toMillis()).toISOString();
  return null;
};

const scriptRef = (scriptId: string) => db.collection('scripts').doc(scriptId);

const scriptPayload = (data: Record<string, any>, id: string, includeContent = true) => ({
  id,
  title: data.title ?? 'Untitled manuscript',
  ...(includeContent ? { content: data.content ?? '' } : {}),
  status: data.status ?? 'Draft',
  access: data.access ?? 'Private',
  version: Number(data.version ?? 1),
  writerUserId: data.writerUserId ?? null,
  editorUserId: data.editorUserId ?? null,
  lastEditorialComment: data.lastEditorialComment ?? null,
  rights: normaliseScriptRights(data.rights),
  marketplace: normaliseScriptMarketplace(data.marketplace),
  createdAt: toIso(data.createdAt),
  updatedAt: toIso(data.updatedAt),
  submittedAt: toIso(data.submittedAt),
});

export const listWriterScripts = onCall({ region: REGION }, async (request) => {
  const identity = await requireAccountRole(request, ['writer', 'admin']);
  if (identity.role === 'admin') return { scripts: [] };
  const snapshot = await db.collection('scripts').where('writerUserId', '==', identity.uid).limit(500).get();
  const scripts = snapshot.docs
    .map((doc) => scriptPayload(doc.data(), doc.id, true))
    .sort((a, b) => String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')));
  return { scripts };
});

export const createWriterScript = onCall({ region: REGION }, async (request) => {
  const identity = await requireAccountRole(request, ['writer']);
  const input = (request.data ?? {}) as Record<string, unknown>;
  const title = cleanText(input.title, 180) || 'Untitled manuscript';
  const ref = db.collection('scripts').doc();
  await ref.set({
    title,
    content: cleanText(input.content, 200000),
    status: 'Draft',
    access: 'Private',
    version: 1,
    writerUserId: identity.uid,
    editorUserId: null,
    lastEditorialComment: null,
    rights: normaliseScriptRights(null),
    marketplace: normaliseScriptMarketplace(null),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  const saved = await ref.get();
  return { script: scriptPayload(saved.data() ?? {}, ref.id, true) };
});

export const updateWriterScript = onCall({ region: REGION }, async (request) => {
  const identity = await requireAccountRole(request, ['writer']);
  const input = (request.data ?? {}) as Record<string, unknown>;
  const scriptId = cleanText(input.scriptId, 160);
  const ref = scriptRef(scriptId);
  const snapshot = await ref.get();
  const data = snapshot.data();
  if (!data || data.writerUserId !== identity.uid) throw new HttpsError('not-found', 'Script not found.');
  if (!['Draft','Revision requested','Rejected'].includes(String(data.status ?? 'Draft'))) {
    throw new HttpsError('failed-precondition', 'This manuscript is currently locked for editorial review.');
  }
  await ref.set({
    title: cleanText(input.title ?? data.title, 180) || 'Untitled manuscript',
    content: cleanText(input.content ?? data.content, 200000),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  const saved = await ref.get();
  return { script: scriptPayload(saved.data() ?? {}, scriptId, true) };
});

export const deleteWriterScript = onCall({ region: REGION }, async (request) => {
  const identity = await requireAccountRole(request, ['writer']);
  const scriptId = cleanText((request.data as { scriptId?: unknown } | undefined)?.scriptId, 160);
  const ref = scriptRef(scriptId);
  const snapshot = await ref.get();
  const data = snapshot.data();
  if (!data || data.writerUserId !== identity.uid) throw new HttpsError('not-found', 'Script not found.');
  if (!['Draft','Rejected'].includes(String(data.status ?? 'Draft'))) {
    throw new HttpsError('failed-precondition', 'Submitted manuscripts cannot be deleted while editorial workflow is active.');
  }

  const [versions, permissions] = await Promise.all([
    ref.collection('versions').limit(500).get(),
    ref.collection('permissions').limit(500).get(),
  ]);
  const batch = db.batch();
  for (const doc of versions.docs) batch.delete(doc.ref);
  for (const doc of permissions.docs) batch.delete(doc.ref);
  batch.delete(ref);
  await batch.commit();
  return { deleted: true };
});

export const createWriterScriptVersion = onCall({ region: REGION }, async (request) => {
  const identity = await requireAccountRole(request, ['writer']);
  const scriptId = cleanText((request.data as { scriptId?: unknown } | undefined)?.scriptId, 160);
  const ref = scriptRef(scriptId);

  const nextVersion = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const data = snapshot.data();
    if (!data || data.writerUserId !== identity.uid) throw new HttpsError('not-found', 'Script not found.');
    const version = Number(data.version ?? 1) + 1;
    const versionRef = ref.collection('versions').doc(String(version));
    transaction.set(versionRef, {
      scriptId,
      version,
      title: data.title ?? 'Untitled manuscript',
      content: data.content ?? '',
      createdAt: FieldValue.serverTimestamp(),
    });
    transaction.set(ref, { version, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return version;
  });

  const saved = await ref.get();
  return { script: scriptPayload(saved.data() ?? {}, scriptId, true), version: nextVersion };
});

export const submitWriterScript = onCall({ region: REGION }, async (request) => {
  const identity = await requireAccountRole(request, ['writer']);
  const scriptId = cleanText((request.data as { scriptId?: unknown } | undefined)?.scriptId, 160);
  const ref = scriptRef(scriptId);
  const snapshot = await ref.get();
  const data = snapshot.data();
  if (!data || data.writerUserId !== identity.uid) throw new HttpsError('not-found', 'Script not found.');
  if (!cleanText(data.content, 200000)) throw new HttpsError('failed-precondition', 'Add manuscript content before submitting.');
  if (!['Draft','Revision requested','Rejected'].includes(String(data.status ?? 'Draft'))) {
    throw new HttpsError('failed-precondition', 'This manuscript is already in editorial workflow.');
  }

  await ref.set({
    status: 'Submitted',
    submittedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  const saved = await ref.get();
  return { script: scriptPayload(saved.data() ?? {}, scriptId, true) };
});

export const listEditorQueue = onCall({ region: REGION }, async (request) => {
  const identity = await requireAccountRole(request, ['editor', 'admin']);
  const snapshot = await db.collection('scripts').limit(1000).get();
  const activeStatuses = new Set(['Submitted','Under review','Revision requested']);
  const queue = snapshot.docs
    .filter((doc) => activeStatuses.has(String(doc.data().status)))
    .filter((doc) => identity.role === 'admin' || doc.data().editorUserId === identity.uid)
    .map((doc) => scriptPayload(doc.data(), doc.id, false))
    .sort((a, b) => String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')));
  return { queue };
});

export const reviewEditorScript = onCall({ region: REGION }, async (request) => {
  const identity = await requireAccountRole(request, ['editor']);
  const input = (request.data ?? {}) as Record<string, unknown>;
  const scriptId = cleanText(input.scriptId, 160);
  const status = cleanText(input.status, 40);
  if (!['Under review','Revision requested','Approved','Rejected'].includes(status)) {
    throw new HttpsError('invalid-argument', 'Invalid editorial state.');
  }

  const ref = scriptRef(scriptId);
  const snapshot = await ref.get();
  const data = snapshot.data();
  if (!data || data.editorUserId !== identity.uid) {
    throw new HttpsError('permission-denied', 'This manuscript is not assigned to this Audio Editor.');
  }

  const comment = cleanText(input.comment, 4000);
  await ref.set({
    status,
    lastEditorialComment: comment || null,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  if (data.writerUserId) {
    await createNotification(String(data.writerUserId), {
      type: 'editorial',
      subtype: 'script_review',
      title: status === 'Approved' ? 'Your manuscript was approved' : status === 'Revision requested' ? 'Revision requested' : status === 'Rejected' ? 'Editorial review completed' : 'Your manuscript is under review',
      message: comment || ('Editorial status changed to ' + status + '.'),
      scriptId,
    });
  }

  const saved = await ref.get();
  return { script: scriptPayload(saved.data() ?? {}, scriptId, false) };
});

export const listEditorAccounts = onCall({ region: REGION }, async (request) => {
  requireAdminIdentity(request);
  const snapshot = await db.collection('accounts').where('role', '==', 'editor').limit(500).get();
  const editors = await Promise.all(snapshot.docs
    .filter((doc) => doc.data().status === 'active')
    .map(async (doc) => {
      const profile = await profileRef(doc.id).get();
      return {
        userId: doc.id,
        email: doc.data().email ?? null,
        name: profile.data()?.displayName ?? doc.data().email?.split('@')?.[0] ?? 'Audio Editor',
      };
    }));
  return { editors };
});

export const adminListScripts = onCall({ region: REGION }, async (request) => {
  requireAdminIdentity(request);
  const snapshot = await db.collection('scripts').limit(1000).get();
  return {
    scripts: snapshot.docs.map((doc) => scriptPayload(doc.data(), doc.id, false))
      .sort((a, b) => String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? ''))),
  };
});

export const adminAssignEditor = onCall({ region: REGION }, async (request) => {
  const admin = requireAdminIdentity(request);
  const input = (request.data ?? {}) as Record<string, unknown>;
  const scriptId = cleanText(input.scriptId, 160);
  const editorUserId = cleanText(input.editorUserId, 160);
  if (!scriptId || !editorUserId) throw new HttpsError('invalid-argument', 'Script and Audio Editor are required.');

  const [script, editor] = await Promise.all([
    scriptRef(scriptId).get(),
    accountRef(editorUserId).get(),
  ]);
  if (!script.exists) throw new HttpsError('not-found', 'Script not found.');
  if (!editor.exists || editor.data()?.role !== 'editor' || editor.data()?.status !== 'active') {
    throw new HttpsError('failed-precondition', 'The selected account is not an active Audio Editor.');
  }

  await script.ref.set({
    editorUserId,
    status: script.data()?.status === 'Submitted' ? 'Under review' : script.data()?.status,
    assignedBy: admin.uid,
    assignedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  await createNotification(editorUserId, {
    type: 'editorial',
    subtype: 'assignment',
    title: 'New manuscript assigned',
    message: 'A Nightjar manuscript has been assigned to your Audio Editor queue.',
    scriptId,
  });

  const saved = await script.ref.get();
  return { script: scriptPayload(saved.data() ?? {}, scriptId, false) };
});

const activePermissionFor = async (scriptId: string, userId: string) => {
  const snapshot = await scriptRef(scriptId).collection('permissions').doc(userId).get();
  if (!snapshot.exists) return null;
  const data = snapshot.data() ?? {};
  if (data.revokedAt) return null;
  const expiresAt = data.expiresAt ? new Date(String(data.expiresAt)).getTime() : null;
  if (expiresAt && Number.isFinite(expiresAt) && expiresAt <= Date.now()) return null;
  return data;
};

export const listProtectedScripts = onCall({ region: REGION }, async (request) => {
  const identity = await requireAccountRole(request, ['creator','writer','editor','admin']);
  await requireAgeVerified(identity.uid);
  const snapshot = await db.collection('scripts').limit(1000).get();

  const visible: any[] = [];
  for (const doc of snapshot.docs) {
    const data = doc.data();
    let allowed = false;
    if (identity.role === 'admin') {
      allowed = true;
    } else if (data.writerUserId === identity.uid || data.editorUserId === identity.uid) {
      allowed = true;
    } else {
      allowed = Boolean(await activePermissionFor(doc.id, identity.uid));
    }
    if (allowed) visible.push(scriptPayload(data, doc.id, false));
  }

  return { scripts: visible };
});

const revokeReaderSessions = async (userId: string, scriptId?: string, reason = 'revoked') => {
  const snapshot = await accountRef(userId).collection('readerSessions').limit(500).get();
  const batch = db.batch();
  let count = 0;
  for (const doc of snapshot.docs) {
    const data = doc.data();
    if (data.status !== 'active') continue;
    if (scriptId && data.scriptId !== scriptId) continue;
    batch.set(doc.ref, {
      status: 'revoked',
      revokedAt: FieldValue.serverTimestamp(),
      revokedReason: reason,
    }, { merge: true });
    count += 1;
  }
  if (count) await batch.commit();
  return count;
};

const protectedEventMillis = (data: Record<string, any>) => data.createdAt?.toMillis?.() ?? 0;

const POSSIBLE_CAPTURE_EVENTS = new Set([
  'possible_screenshot_key',
  'possible_capture_shortcut',
]);
const NATIVE_CAPTURE_EVENTS = new Set([
  'native_screenshot_detected',
  'native_screen_capture_detected',
]);

const createSecurityAlertFirebase = async (userId: string, details: Record<string, unknown>) => {
  const ref = db.collection('securityAlerts').doc();
  const record = {
    userId,
    ...details,
    recipients: Array.from(ADMIN_EMAILS),
    status: 'open',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  await ref.set(record);

  await db.collection('securityCases').doc(ref.id).set({
    alertId: ref.id,
    userId,
    state: 'detection',
    history: [{
      state: 'detection',
      at: new Date().toISOString(),
      note: 'Suspicious activity detected; retained for review by all Nightjar owners.',
    }],
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  for (const email of ADMIN_EMAILS) {
    const ownerKey = Buffer.from(email).toString('base64url');
    await db.collection('ownerNotifications').doc(ownerKey).collection('items').add({
      type: 'security_alert',
      alertId: ref.id,
      severity: details.severity ?? 'medium',
      title: 'Nightjar security alert',
      message: details.reason ?? 'Suspicious protected-content activity requires review.',
      recipientEmail: email,
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    });
  }

  return ref.id;
};

const assessProtectedActivityFirebase = async (userId: string, signal: Record<string, unknown>) => {
  const now = Date.now();
  const snapshot = await db.collection('protectionEvents').where('userId', '==', userId).limit(1000).get();
  const items = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as any[];
  const recent = items.filter((item) => now - protectedEventMillis(item) < 60_000);
  const tenMinute = items.filter((item) => now - protectedEventMillis(item) < 600_000);
  const scriptId = cleanText(signal.relatedId, 160);
  const sameScriptRecent = recent.filter((item) => cleanText(item.relatedId, 160) === scriptId);
  const sameDeviceTenMinute = signal.deviceId ? tenMinute.filter((item) => item.deviceId === signal.deviceId) : [];
  const blocked = recent.filter((item) => ['blocked_interaction','copy_blocked','cut_blocked','selection_blocked','print_blocked','print_dialog_attempt','save_page_blocked','repeated_protected_interaction'].includes(String(item.eventType)));
  const possibleCaptureSignals = tenMinute.filter((item) => POSSIBLE_CAPTURE_EVENTS.has(String(item.eventType)));
  const nativeCaptureSignals = tenMinute.filter((item) => NATIVE_CAPTURE_EVENTS.has(String(item.eventType)));
  const rapidViews = sameScriptRecent.filter((item) => item.eventType === 'script_view' || item.eventType === 'reader_chunk_view');
  const distinctScripts = new Set(tenMinute.map((item) => cleanText(item.relatedId, 160)).filter(Boolean)).size;

  let score = 0;
  const reasons: string[] = [];
  if (recent.length >= 45) { score += 25; reasons.push('very high protected-content request velocity'); }
  else if (recent.length >= 25) { score += 12; reasons.push('elevated protected-content request velocity'); }
  if (sameScriptRecent.length >= 30) { score += 30; reasons.push('dense activity against one manuscript'); }
  else if (sameScriptRecent.length >= 15) { score += 15; reasons.push('repeated activity against one manuscript'); }
  if (rapidViews.length >= 20) { score += 25; reasons.push('rapid manuscript traversal'); }
  if (blocked.length >= 8) { score += 20; reasons.push('repeated blocked extraction interactions'); }
  else if (blocked.length >= 3) { score += 8; reasons.push('multiple blocked interactions'); }
  if (POSSIBLE_CAPTURE_EVENTS.has(String(signal.eventType))) {
    score += 12;
    reasons.push('browser reported a possible capture shortcut while protected content was open');
  }
  if (possibleCaptureSignals.length >= 4) {
    score += 30;
    reasons.push('repeated possible screen-capture signals while protected content was open');
  } else if (possibleCaptureSignals.length >= 2) {
    score += 15;
    reasons.push('multiple possible screen-capture signals while protected content was open');
  }
  if (NATIVE_CAPTURE_EVENTS.has(String(signal.eventType))) {
    score += signal.eventType === 'native_screen_capture_detected' ? 55 : 45;
    reasons.push(signal.eventType === 'native_screen_capture_detected'
      ? 'native shell reported active screen capture'
      : 'native shell reported an OS screenshot callback');
  }
  if (nativeCaptureSignals.length >= 2) {
    score += 15;
    reasons.push('multiple native capture callbacks');
  }
  if (distinctScripts >= 6) { score += 15; reasons.push('unusually broad manuscript access'); }
  if (sameDeviceTenMinute.length >= 80) { score += 10; reasons.push('high-volume activity from the same device token'); }
  if (signal.eventType === 'automation_pattern') { score += 35; reasons.push('automation-like access pattern'); }
  if (signal.eventType === 'reader_session_replay') { score += 40; reasons.push('reader-session replay detected'); }

  if (score < 40) return null;

  const alerts = await db.collection('securityAlerts').where('userId', '==', userId).limit(200).get();
  const duplicate = alerts.docs.some((doc) => {
    const data = doc.data();
    return data.status === 'open' && now - (data.createdAt?.toMillis?.() ?? 0) < 600_000;
  });
  if (duplicate) return null;

  const severity = score >= 85 ? 'critical' : score >= 60 ? 'high' : 'medium';
  const alertId = await createSecurityAlertFirebase(userId, {
    severity,
    riskScore: Math.min(score, 100),
    reason: reasons.join('; ') || 'Unusual protected-content activity requires review.',
    relatedId: scriptId || null,
    signal: {
      eventType: signal.eventType ?? null,
      recentEvents: recent.length,
      relatedEvents: sameScriptRecent.length,
      blockedEvents: blocked.length,
      possibleCaptureEvents: possibleCaptureSignals.length,
      nativeCaptureEvents: nativeCaptureSignals.length,
      rapidViews: rapidViews.length,
      distinctScripts,
      deviceId: signal.deviceId ?? null,
      detectionSource: signal.detectionSource ?? null,
      detectionConfidence: signal.detectionConfidence ?? null,
      clientPlatform: signal.clientPlatform ?? null,
      route: signal.route ?? null,
      readerSessionId: signal.readerSessionId ?? null,
    },
    automaticAction: 'none',
    reviewRequired: true,
  });

  return { alertId, severity, riskScore: Math.min(score, 100) };
};

export const recordProtectionEvent = onCall({ region: REGION }, async (request) => {
  const identity = await requireActiveIdentity(request);
  const input = (request.data ?? {}) as Record<string, unknown>;
  const eventType = cleanText(input.eventType, 80);
  if (!eventType) throw new HttpsError('invalid-argument', 'Protection event type is required.');

  const requestedConfidence = cleanText(input.detectionConfidence, 32);
  const detectionConfidence = ['contextual','possible','strong','native_callback'].includes(requestedConfidence)
    ? requestedConfidence
    : null;
  const record = {
    userId: identity.uid,
    eventType,
    relatedType: cleanText(input.relatedType, 80) || 'script',
    relatedId: cleanText(input.relatedId, 160) || null,
    deviceId: cleanText(input.deviceId, 180) || null,
    readerSessionId: cleanText(input.readerSessionId, 180) || null,
    clientPlatform: cleanText(input.clientPlatform, 120) || null,
    visibilityState: cleanText(input.visibilityState, 40) || null,
    viewport: cleanText(input.viewport, 80) || null,
    detectionSource: cleanText(input.detectionSource, 120) || null,
    detectionConfidence,
    route: cleanText(input.route, 240) || null,
    summary: cleanText(input.summary, 800) || null,
    createdAt: FieldValue.serverTimestamp(),
  };
  const ref = await db.collection('protectionEvents').add(record);

  const alert = await assessProtectedActivityFirebase(identity.uid, { ...record, createdAt: new Date().toISOString() });
  return { recorded: true, evidenceId: ref.id, alert };
});

export const openProtectedScript = onCall({ region: REGION }, async (request) => {
  const identity = await requireAccountRole(request, ['creator','writer','editor','admin']);
  await requireAgeVerified(identity.uid);
  const scriptId = cleanText((request.data as { scriptId?: unknown } | undefined)?.scriptId, 160);
  const ref = scriptRef(scriptId);
  const snapshot = await ref.get();
  const script = snapshot.data();
  if (!script) throw new HttpsError('not-found', 'Script not found.');

  let allowCopy = false;
  let allowExport = false;
  let permitted = false;

  if (script.writerUserId === identity.uid) {
    permitted = true;
    allowCopy = true;
    allowExport = true;
  } else if (script.editorUserId === identity.uid && identity.role === 'editor') {
    permitted = true;
  } else if (identity.role !== 'admin') {
    const permission = await activePermissionFor(scriptId, identity.uid);
    if (permission) {
      permitted = true;
      allowCopy = permission.allowCopy === true;
      allowExport = permission.allowExport === true;
    }
  }

  if (!permitted) {
    throw new HttpsError('permission-denied', 'You do not have an active full-manuscript access grant.');
  }

  const sessionRef = accountRef(identity.uid).collection('readerSessions').doc();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  await sessionRef.set({
    sessionId: sessionRef.id,
    accountId: identity.uid,
    scriptId,
    status: 'active',
    expiresAt,
    createdAt: FieldValue.serverTimestamp(),
  });

  await db.collection('protectionEvents').add({
    userId: identity.uid,
    eventType: 'script_view',
    relatedType: 'script',
    relatedId: scriptId,
    deviceId: null,
    summary: 'Protected manuscript opened through an authorised reader session.',
    createdAt: FieldValue.serverTimestamp(),
  });

  await assessProtectedActivityFirebase(identity.uid, { eventType: 'script_view', relatedId: scriptId });

  return {
    script: scriptPayload(script, scriptId, true),
    readerSession: {
      sessionId: sessionRef.id,
      accountId: identity.uid,
      expiresAt,
      status: 'active',
    },
    copyAllowed: allowCopy,
    exportAllowed: allowExport,
    canReadFull: true,
  };
});

export const listScriptPermissions = onCall({ region: REGION }, async (request) => {
  const identity = await requireAccountRole(request, ['writer']);
  const scriptId = cleanText((request.data as { scriptId?: unknown } | undefined)?.scriptId, 160);
  const script = await scriptRef(scriptId).get();
  if (!script.exists || script.data()?.writerUserId !== identity.uid) throw new HttpsError('not-found', 'Script not found.');
  const snapshot = await script.ref.collection('permissions').limit(500).get();
  return {
    permissions: snapshot.docs.map((doc) => ({
      recipientUserId: doc.id,
      allowCopy: doc.data().allowCopy === true,
      allowExport: doc.data().allowExport === true,
      expiresAt: doc.data().expiresAt ?? null,
      revokedAt: doc.data().revokedAt ?? null,
      updatedAt: toIso(doc.data().updatedAt),
    })),
  };
});

export const setScriptPermission = onCall({ region: REGION }, async (request) => {
  const identity = await requireAccountRole(request, ['writer']);
  const input = (request.data ?? {}) as Record<string, unknown>;
  const scriptId = cleanText(input.scriptId, 160);
  const recipientUserId = cleanText(input.recipientUserId ?? input.creatorUserId, 160);
  if (!scriptId || !recipientUserId) throw new HttpsError('invalid-argument', 'Recipient account is required.');
  if (recipientUserId === identity.uid) throw new HttpsError('invalid-argument', 'The writer already has full manuscript access.');

  const [script, recipient] = await Promise.all([
    scriptRef(scriptId).get(),
    accountRef(recipientUserId).get(),
  ]);
  if (!script.exists || script.data()?.writerUserId !== identity.uid) throw new HttpsError('not-found', 'Script not found.');
  if (!recipient.exists || recipient.data()?.status === 'suspended') throw new HttpsError('not-found', 'Recipient Nightjar account not found.');

  const permissionRef = script.ref.collection('permissions').doc(recipientUserId);
  const revoke = input.revoke === true;
  const expiresRaw = cleanText(input.expiresAt, 80);
  if (expiresRaw && !Number.isFinite(Date.parse(expiresRaw))) throw new HttpsError('invalid-argument', 'Expiry date is invalid.');

  await permissionRef.set({
    recipientUserId,
    allowCopy: revoke ? false : input.allowCopy === true,
    allowExport: revoke ? false : input.allowExport === true,
    expiresAt: revoke ? null : (expiresRaw || null),
    revokedAt: revoke ? new Date().toISOString() : null,
    grantedBy: identity.uid,
    updatedAt: FieldValue.serverTimestamp(),
    ...(revoke ? {} : { grantedAt: FieldValue.serverTimestamp() }),
  }, { merge: true });

  if (revoke) await revokeReaderSessions(recipientUserId, scriptId, 'writer_revoked_access');

  await createNotification(recipientUserId, {
    type: 'script_access',
    subtype: revoke ? 'revoked' : 'granted',
    title: revoke ? 'Manuscript access revoked' : 'Manuscript access granted',
    message: revoke
      ? 'A writer has revoked your access to a protected Nightjar manuscript.'
      : 'A writer has granted you controlled access to a protected Nightjar manuscript.',
    scriptId,
  });

  return {
    recipientUserId,
    allowCopy: !revoke && input.allowCopy === true,
    allowExport: !revoke && input.allowExport === true,
    expiresAt: revoke ? null : (expiresRaw || null),
    revoked: revoke,
  };
});

export const listProtectionEvidence = onCall({ region: REGION }, async (request) => {
  const identity = await requireActiveIdentity(request);
  const snapshot = await db.collection('protectionEvents').where('userId', '==', identity.uid).limit(500).get();
  const evidence = snapshot.docs
    .map((doc) => ({ id: doc.id, ...doc.data(), createdAt: toIso(doc.data().createdAt) }))
    .sort((a: any, b: any) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')));
  return { evidence };
});

export const listProtectionReports = onCall({ region: REGION }, async (request) => {
  const identity = await requireActiveIdentity(request);
  const [snapshot, presenter] = await Promise.all([
    db.collection('protectionReports').where('userId', '==', identity.uid).limit(500).get(),
    accountPresentation(identity.uid),
  ]);
  const reports = snapshot.docs
    .map((doc) => ({
      id: doc.id,
      ...doc.data(),
      reporterName: doc.data().reporterName ?? presenter.displayName,
      reporterHandle: doc.data().reporterHandle ?? presenter.handle,
      createdAt: toIso(doc.data().createdAt),
    }))
    .sort((a: any, b: any) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')));
  return { reports };
});

export const listAdminProtectionReports = onCall({ region: REGION }, async (request) => {
  requireAdminIdentity(request);
  const snapshot = await db.collection('protectionReports').limit(1000).get();
  const userIds = Array.from(new Set(snapshot.docs.map((doc) => cleanText(doc.data().userId, 160)).filter(Boolean)));
  const presentations = new Map<string, Awaited<ReturnType<typeof accountPresentation>>>();
  await Promise.all(userIds.map(async (userId) => {
    presentations.set(userId, await accountPresentation(userId));
  }));
  const reports = snapshot.docs
    .map((doc) => {
      const data = doc.data();
      const userId = cleanText(data.userId, 160);
      const presenter = presentations.get(userId);
      return {
        id: doc.id,
        ...data,
        reporterName: data.reporterName ?? presenter?.displayName ?? 'Nightjar account',
        reporterHandle: data.reporterHandle ?? presenter?.handle ?? null,
        reporterEmail: data.reporterEmail ?? presenter?.email ?? null,
        createdAt: toIso(data.createdAt),
        updatedAt: toIso(data.updatedAt),
      };
    })
    .sort((a: any, b: any) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')));
  return { reports };
});

export const submitProtectionReport = onCall({ region: REGION }, async (request) => {
  const identity = await requireActiveIdentity(request);
  const input = (request.data ?? {}) as Record<string, unknown>;
  const category = cleanText(input.category, 120) || 'Something else';
  const summary = cleanText(input.summary, 6000);
  if (!summary) throw new HttpsError('invalid-argument', 'Describe what happened before submitting.');

  const year = new Date().getFullYear();
  const counterRef = db.collection('counters').doc('protectionReports');
  const sequence = await db.runTransaction(async (transaction) => {
    const current = await transaction.get(counterRef);
    const data = current.data() ?? {};
    const next = Number(data.year) === year ? Number(data.value ?? 0) + 1 : 1;
    transaction.set(counterRef, { year, value: next, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return next;
  });

  const caseId = `NJ-${year}-${String(sequence).padStart(6, '0')}`;
  const presenter = await accountPresentation(identity.uid);
  const ref = db.collection('protectionReports').doc();
  await ref.set({
    caseId,
    userId: identity.uid,
    reporterName: presenter.displayName,
    reporterHandle: presenter.handle,
    reporterEmail: presenter.email,
    category,
    summary,
    status: 'New',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return {
    report: {
      id: ref.id,
      caseId,
      userId: identity.uid,
      reporterName: presenter.displayName,
      reporterHandle: presenter.handle,
      category,
      summary,
      status: 'New',
      createdAt: new Date().toISOString(),
    },
  };
});

export const listSecurityAlerts = onCall({ region: REGION }, async (request) => {
  requireAdminIdentity(request);
  const snapshot = await db.collection('securityAlerts').limit(500).get();
  const userIds = Array.from(new Set(snapshot.docs.map((doc) => cleanText(doc.data().userId, 160)).filter(Boolean)));
  const presentations = new Map<string, Awaited<ReturnType<typeof accountPresentation>>>();
  await Promise.all(userIds.map(async (userId) => {
    presentations.set(userId, await accountPresentation(userId));
  }));
  const alerts = snapshot.docs
    .map((doc) => {
      const data = doc.data();
      const userId = cleanText(data.userId, 160);
      const presenter = presentations.get(userId);
      return {
        id: doc.id,
        ...data,
        userName: presenter?.displayName ?? 'Nightjar account',
        userHandle: presenter?.handle ?? null,
        userEmail: presenter?.email ?? null,
        createdAt: toIso(data.createdAt),
      };
    })
    .sort((a: any, b: any) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')));
  return { alerts };
});

export const suspendFromSecurityAlert = onCall({ region: REGION }, async (request) => {
  const admin = requireAdminIdentity(request);
  const alertId = cleanText((request.data as { alertId?: unknown } | undefined)?.alertId, 160);
  const alertRef = db.collection('securityAlerts').doc(alertId);
  const alert = await alertRef.get();
  const data = alert.data();
  if (!data) throw new HttpsError('not-found', 'Security alert not found.');

  await accountRef(String(data.userId)).set({
    status: 'suspended',
    suspendedBy: admin.uid,
    suspendedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  const revokedCount = await revokeReaderSessions(String(data.userId), undefined, 'admin_security_action');

  await alertRef.set({
    status: 'actioned',
    action: 'suspended',
    actionedBy: admin.uid,
    actionedAt: FieldValue.serverTimestamp(),
    revokedReaderSessions: revokedCount,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  return { suspended: true, revokedReaderSessions: revokedCount };
});

export const revokeSessionsFromSecurityAlert = onCall({ region: REGION }, async (request) => {
  const admin = requireAdminIdentity(request);
  const alertId = cleanText((request.data as { alertId?: unknown } | undefined)?.alertId, 160);
  const alertRef = db.collection('securityAlerts').doc(alertId);
  const alert = await alertRef.get();
  const data = alert.data();
  if (!data) throw new HttpsError('not-found', 'Security alert not found.');
  const revokedCount = await revokeReaderSessions(String(data.userId), undefined, 'admin_security_review');
  await alertRef.set({
    lastAction: 'reader_sessions_revoked',
    lastActionBy: admin.uid,
    lastActionAt: FieldValue.serverTimestamp(),
    revokedReaderSessions: revokedCount,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  return { revoked: true, userId: data.userId, revokedReaderSessions: revokedCount };
});

export const closeSecurityAlertBenign = onCall({ region: REGION }, async (request) => {
  const admin = requireAdminIdentity(request);
  const input = (request.data ?? {}) as Record<string, unknown>;
  const alertId = cleanText(input.alertId, 160);
  const note = cleanText(input.note, 2000);
  const ref = db.collection('securityAlerts').doc(alertId);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new HttpsError('not-found', 'Security alert not found.');

  await ref.set({
    status: 'closed',
    action: 'benign',
    reviewNote: note || null,
    actionedBy: admin.uid,
    actionedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  return { closed: true };
});



const RELEASE_CONTENT_RATINGS = new Set(['sfw', 'suggestive', 'adult', 'explicit']);

const cleanReleaseContentRating = (value: unknown) => {
  const rating = cleanText(value, 24).toLowerCase();
  return RELEASE_CONTENT_RATINGS.has(rating) ? rating : 'adult';
};

const cleanEpisodeNumber = (value: unknown) => {
  if (value === null || value === '' || typeof value === 'undefined') return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(10000, Math.round(number))) : null;
};

const normaliseReleaseContributors = (value: unknown) => {
  if (!Array.isArray(value)) return [];
  const allowedRoles = new Set([
    'Voice Actor', 'Writer', 'Audio Editor', 'Producer', 'Director',
    'Sound Designer', 'Cover Artist', 'Composer', 'Other',
  ]);
  return value.slice(0, 24).map((item: any) => {
    const role = cleanText(item?.role, 48);
    return {
      userId: cleanText(item?.userId, 160) || null,
      name: cleanText(item?.name, 100),
      role: allowedRoles.has(role) ? role : 'Other',
    };
  }).filter((item) => item.name);
};

const normaliseScriptRights = (value: unknown) => {
  const input = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const licenceType = cleanText(input.licenceType, 40);
  return {
    copyrightOwner: cleanText(input.copyrightOwner, 120) || 'Writer',
    writerRetainsCopyright: input.writerRetainsCopyright !== false,
    licenceType: ['none','non-exclusive','exclusive'].includes(licenceType) ? licenceType : 'none',
    licenceLength: cleanText(input.licenceLength, 100) || null,
    adaptationApprovalRequired: input.adaptationApprovalRequired !== false,
    significantEditsApprovalRequired: input.significantEditsApprovalRequired !== false,
    castingApprovalRequired: input.castingApprovalRequired === true,
    finalAudioApprovalRequired: input.finalAudioApprovalRequired === true,
    aiTrainingAllowed: false,
    commercialUse: input.commercialUse === true,
    withdrawalTerms: cleanText(input.withdrawalTerms, 1200) || null,
  };
};

const normaliseScriptMarketplace = (value: unknown) => {
  const input = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const visibility = cleanText(input.visibility, 40);
  return {
    visibility: ['private','invitation','marketplace','unavailable','licensed'].includes(visibility) ? visibility : 'private',
    synopsis: cleanText(input.synopsis, 1800),
    genres: cleanStringList(input.genres, 16),
    tropes: cleanStringList(input.tropes, 24),
    commissionPricePence: typeof input.commissionPricePence === 'number'
      ? Math.max(0, Math.min(10000000, Math.round(input.commissionPricePence)))
      : null,
    collaborationWanted: input.collaborationWanted === true,
    editorWanted: input.editorWanted === true,
  };
};


type CollaborationStatus =
  | 'sent'
  | 'interested'
  | 'discussing'
  | 'accepted'
  | 'declined'
  | 'withdrawn'
  | 'in_production'
  | 'completed';

const collaborationPayload = (data: Record<string, any>, id: string) => ({
  id,
  scriptId: data.scriptId ?? null,
  scriptTitle: data.scriptTitle ?? 'Untitled manuscript',
  writerUserId: data.writerUserId ?? null,
  writerName: data.writerName ?? 'Nightjar writer',
  recipientUserId: data.recipientUserId ?? null,
  recipientName: data.recipientName ?? 'Nightjar collaborator',
  recipientRole: data.recipientRole ?? null,
  message: data.message ?? '',
  paymentProposal: data.paymentProposal ?? '',
  licenceSummary: data.licenceSummary ?? '',
  status: data.status ?? 'sent',
  responseNote: data.responseNote ?? '',
  createdAt: toIso(data.createdAt),
  updatedAt: toIso(data.updatedAt),
  respondedAt: toIso(data.respondedAt),
});

export const updateScriptRightsAndListing = onCall({ region: REGION }, async (request) => {
  const identity = await requireAccountRole(request, ['writer']);
  const input = (request.data ?? {}) as Record<string, unknown>;
  const scriptId = cleanText(input.scriptId, 160);
  const ref = scriptRef(scriptId);
  const snapshot = await ref.get();
  const data = snapshot.data();
  if (!data || data.writerUserId !== identity.uid) throw new HttpsError('not-found', 'Script not found.');
  if (String(data.status ?? '') === 'Published') {
    throw new HttpsError('failed-precondition', 'Published manuscript rights cannot be changed without a new agreement.');
  }

  const rights = normaliseScriptRights(input.rights);
  const marketplace = normaliseScriptMarketplace(input.marketplace);
  await ref.set({
    rights,
    marketplace,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  const saved = await ref.get();
  return { script: scriptPayload(saved.data() ?? {}, scriptId, true) };
});

export const listScriptMarketplace = onCall({ region: REGION }, async (request) => {
  const identity = await requireActiveIdentity(request);
  await requireAgeVerified(identity.uid);
  const snapshot = await db.collection('scripts').limit(1000).get();
  const scripts = (await Promise.all(snapshot.docs
    .filter((doc) => {
      const listing = normaliseScriptMarketplace(doc.data().marketplace);
      return listing.visibility === 'marketplace' && ['Approved','Published'].includes(String(doc.data().status ?? ''));
    })
    .map(async (doc) => {
      const data = doc.data();
      const writer = await accountPresentation(String(data.writerUserId ?? ''));
      return {
        id: doc.id,
        title: data.title ?? 'Untitled manuscript',
        writerUserId: data.writerUserId ?? null,
        writerName: writer.displayName,
        writerHandle: writer.handle,
        rights: normaliseScriptRights(data.rights),
        marketplace: normaliseScriptMarketplace(data.marketplace),
        updatedAt: toIso(data.updatedAt),
      };
    })));
  return { scripts };
});

export const collaborationDirectory = onCall({ region: REGION }, async (request) => {
  const identity = await requireActiveIdentity(request);
  await requireAgeVerified(identity.uid);
  const [snapshot, collaborations, publicReleases, scripts] = await Promise.all([
    db.collection('accounts').limit(1000).get(),
    db.collection('collaborationProposals').limit(1000).get(),
    db.collection('releases').where('status', '==', 'released').limit(1000).get(),
    db.collection('scripts').limit(1000).get(),
  ]);
  const completedByUser = new Map<string, number>();
  for (const collaboration of collaborations.docs) {
    const data = collaboration.data() ?? {};
    if (data.status !== 'completed') continue;
    for (const userId of [cleanText(data.writerUserId, 160), cleanText(data.recipientUserId, 160)].filter(Boolean)) {
      completedByUser.set(userId, (completedByUser.get(userId) ?? 0) + 1);
    }
  }

  const releaseCountByCreator = new Map<string, number>();
  const creditedReleaseCountByUser = new Map<string, number>();
  for (const release of publicReleases.docs) {
    const creatorUserId = cleanText(release.data().creatorUserId, 160);
    if (creatorUserId) releaseCountByCreator.set(creatorUserId, (releaseCountByCreator.get(creatorUserId) ?? 0) + 1);
    for (const credit of normaliseReleaseContributors(release.data().contributors)) {
      if (credit.userId) creditedReleaseCountByUser.set(credit.userId, (creditedReleaseCountByUser.get(credit.userId) ?? 0) + 1);
    }
  }
  const publishedScriptsByWriter = new Map<string, number>();
  for (const script of scripts.docs) {
    if (!['Approved','Published'].includes(String(script.data().status))) continue;
    const writerUserId = cleanText(script.data().writerUserId, 160);
    if (writerUserId) publishedScriptsByWriter.set(writerUserId, (publishedScriptsByWriter.get(writerUserId) ?? 0) + 1);
  }

  const allowedRoles = new Set(['creator','writer','editor']);
  const people = (await Promise.all(snapshot.docs
    .filter((doc) => doc.id !== identity.uid && doc.data().status === 'active' && allowedRoles.has(String(doc.data().role ?? '')))
    .map(async (doc) => {
      const profile = await profileRef(doc.id).get();
      const data = profile.data();
      if (!data || data.publicProfile === false) return null;
      return {
        userId: doc.id,
        role: doc.data().role,
        name: data.displayName ?? 'Nightjar member',
        handle: data.handle ?? null,
        headline: data.headline ?? null,
        avatarUrl: data.avatarStatus === 'approved' ? data.avatarUrl ?? null : null,
        favouriteTags: Array.isArray(data.favouriteTags) ? data.favouriteTags : [],
        favouriteCategories: Array.isArray(data.favouriteCategories) ? data.favouriteCategories : [],
        roleFocus: Array.isArray(data.roleFocus) ? data.roleFocus : [],
        roleSpecialties: Array.isArray(data.roleSpecialties) ? data.roleSpecialties : [],
        roleSecondary: Array.isArray(data.roleSecondary) ? data.roleSecondary : [],
        roleAvailability: data.roleAvailability ?? null,
        completedCollaborations: completedByUser.get(doc.id) ?? 0,
        activityBadges: publicActivityBadges(String(doc.data().role ?? ''), {
          releases: releaseCountByCreator.get(doc.id) ?? 0,
          publishedScripts: publishedScriptsByWriter.get(doc.id) ?? 0,
          creditedReleases: creditedReleaseCountByUser.get(doc.id) ?? 0,
          completedCollaborations: completedByUser.get(doc.id) ?? 0,
        }),
      };
    }))).filter(Boolean);
  return { people };
});

export const sendCollaborationProposal = onCall({ region: REGION }, async (request) => {
  const identity = await requireAccountRole(request, ['writer']);
  const input = (request.data ?? {}) as Record<string, unknown>;
  const scriptId = cleanText(input.scriptId, 160);
  const recipientUserId = cleanText(input.recipientUserId, 160);
  if (!scriptId || !recipientUserId || recipientUserId === identity.uid) {
    throw new HttpsError('invalid-argument', 'Choose a manuscript and another Nightjar collaborator.');
  }

  const [script, recipient, recipientProfile, writerProfile] = await Promise.all([
    scriptRef(scriptId).get(),
    accountRef(recipientUserId).get(),
    profileRef(recipientUserId).get(),
    profileRef(identity.uid).get(),
  ]);
  const scriptData = script.data();
  const recipientData = recipient.data();
  if (!scriptData || scriptData.writerUserId !== identity.uid) throw new HttpsError('not-found', 'Script not found.');
  if (!recipient.exists || recipientData?.status !== 'active' || !['creator','editor'].includes(String(recipientData?.role ?? ''))) {
    throw new HttpsError('not-found', 'Eligible collaborator not found.');
  }

  const ref = db.collection('collaborationProposals').doc();
  const record = {
    scriptId,
    scriptTitle: scriptData.title ?? 'Untitled manuscript',
    writerUserId: identity.uid,
    writerName: writerProfile.data()?.displayName ?? identity.email.split('@')[0],
    recipientUserId,
    recipientName: recipientProfile.data()?.displayName ?? 'Nightjar collaborator',
    recipientRole: recipientData?.role ?? null,
    message: cleanText(input.message, 2400),
    paymentProposal: cleanText(input.paymentProposal, 800),
    licenceSummary: cleanText(input.licenceSummary, 1200),
    status: 'sent' as CollaborationStatus,
    responseNote: '',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  await ref.set(record);

  await createNotification(recipientUserId, {
    type: 'collaboration',
    subtype: 'proposal',
    title: 'New collaboration proposal',
    message: `${record.writerName} sent ${record.scriptTitle} for your consideration.`,
    collaborationId: ref.id,
    scriptId,
  });

  const saved = await ref.get();
  return { proposal: collaborationPayload(saved.data() ?? record, ref.id) };
});

export const expressScriptInterest = onCall({ region: REGION }, async (request) => {
  const identity = await requireAccountRole(request, ['creator']);
  const input = (request.data ?? {}) as Record<string, unknown>;
  const scriptId = cleanText(input.scriptId, 160);
  const message = cleanText(input.message, 1800);
  if (!scriptId) throw new HttpsError('invalid-argument', 'Choose a marketplace script.');

  const [script, creatorProfile] = await Promise.all([
    scriptRef(scriptId).get(),
    profileRef(identity.uid).get(),
  ]);
  const data = script.data();
  if (!data) throw new HttpsError('not-found', 'Marketplace script not found.');
  const listing = normaliseScriptMarketplace(data.marketplace);
  if (listing.visibility !== 'marketplace' || !['Approved','Published'].includes(String(data.status ?? ''))) {
    throw new HttpsError('failed-precondition', 'This script is not currently open in the marketplace.');
  }
  const writerUserId = cleanText(data.writerUserId, 160);
  if (!writerUserId) throw new HttpsError('failed-precondition', 'This script has no writer account.');

  const writer = await accountPresentation(writerUserId);
  const creatorName = creatorProfile.data()?.displayName ?? identity.email.split('@')[0];
  const ref = db.collection('collaborationProposals').doc();
  const record = {
    scriptId,
    scriptTitle: data.title ?? 'Untitled manuscript',
    writerUserId,
    writerName: writer.displayName,
    recipientUserId: identity.uid,
    recipientName: creatorName,
    recipientRole: 'creator',
    initiatedByUserId: identity.uid,
    message,
    paymentProposal: '',
    licenceSummary: '',
    status: 'interested' as CollaborationStatus,
    responseNote: message,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    respondedAt: FieldValue.serverTimestamp(),
  };
  await ref.set(record);
  await createNotification(writerUserId, {
    type: 'collaboration',
    subtype: 'marketplace_interest',
    title: 'A Creator is interested in your script',
    message: creatorName + ' expressed interest in ' + String(data.title ?? 'your marketplace script') + '.',
    collaborationId: ref.id,
    scriptId,
  });
  const saved = await ref.get();
  return { proposal: collaborationPayload(saved.data() ?? record, ref.id) };
});

export const listMyCollaborations = onCall({ region: REGION }, async (request) => {
  const identity = await requireActiveIdentity(request);
  const snapshot = await db.collection('collaborationProposals').limit(1000).get();
  const proposals = snapshot.docs
    .filter((doc) => doc.data().writerUserId === identity.uid || doc.data().recipientUserId === identity.uid)
    .map((doc) => collaborationPayload(doc.data(), doc.id))
    .sort((a, b) => String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')));
  return { proposals };
});

export const respondCollaborationProposal = onCall({ region: REGION }, async (request) => {
  const identity = await requireActiveIdentity(request);
  const input = (request.data ?? {}) as Record<string, unknown>;
  const collaborationId = cleanText(input.collaborationId, 160);
  const status = cleanText(input.status, 40) as CollaborationStatus;
  if (!['interested','discussing','accepted','declined'].includes(status)) {
    throw new HttpsError('invalid-argument', 'Choose a valid collaboration response.');
  }

  const ref = db.collection('collaborationProposals').doc(collaborationId);
  const snapshot = await ref.get();
  const data = snapshot.data();
  if (!data || data.recipientUserId !== identity.uid) throw new HttpsError('not-found', 'Collaboration proposal not found.');
  if (['declined','withdrawn','completed'].includes(String(data.status ?? ''))) {
    throw new HttpsError('failed-precondition', 'This collaboration is already closed.');
  }

  const responseNote = cleanText(input.responseNote, 1600);
  await ref.set({
    status,
    responseNote,
    respondedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  if (data.writerUserId) {
    await createNotification(String(data.writerUserId), {
      type: 'collaboration',
      subtype: 'response',
      title: status === 'declined' ? 'Collaboration proposal declined' : 'Collaboration proposal updated',
      message: `${data.recipientName ?? 'A collaborator'} marked ${data.scriptTitle ?? 'your proposal'} as ${status.replace('_', ' ')}.`,
      collaborationId,
      scriptId: data.scriptId ?? null,
    });
  }

  const saved = await ref.get();
  return { proposal: collaborationPayload(saved.data() ?? {}, collaborationId) };
});

export const updateCollaborationStatus = onCall({ region: REGION }, async (request) => {
  const identity = await requireActiveIdentity(request);
  const input = (request.data ?? {}) as Record<string, unknown>;
  const collaborationId = cleanText(input.collaborationId, 160);
  const status = cleanText(input.status, 40) as CollaborationStatus;
  if (!['discussing','accepted','withdrawn','in_production','completed'].includes(status)) {
    throw new HttpsError('invalid-argument', 'Choose a valid collaboration state.');
  }

  const ref = db.collection('collaborationProposals').doc(collaborationId);
  const snapshot = await ref.get();
  const data = snapshot.data();
  if (!data || (data.writerUserId !== identity.uid && data.recipientUserId !== identity.uid)) {
    throw new HttpsError('not-found', 'Collaboration proposal not found.');
  }
  if (status === 'withdrawn' && data.writerUserId !== identity.uid) {
    throw new HttpsError('permission-denied', 'Only the writer can withdraw this proposal.');
  }

  await ref.set({
    status,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  const otherUserId = data.writerUserId === identity.uid ? data.recipientUserId : data.writerUserId;
  if (otherUserId) {
    await createNotification(String(otherUserId), {
      type: 'collaboration',
      subtype: 'status',
      title: 'Collaboration status changed',
      message: `${data.scriptTitle ?? 'A collaboration'} is now ${status.replace('_', ' ')}.`,
      collaborationId,
      scriptId: data.scriptId ?? null,
    });
  }

  const saved = await ref.get();
  return { proposal: collaborationPayload(saved.data() ?? {}, collaborationId) };
});

const calculateCreatorRate = (settings: CommercialSettings, activePaidSubscribers: number) => {
  let rate = 0;
  for (const band of settings.creatorRateBands) {
    if (activePaidSubscribers >= band.minPaidSubscribers) rate = band.monthlyRatePence;
  }
  if (settings.creatorMonthlyCapPence != null) rate = Math.min(rate, settings.creatorMonthlyCapPence);
  return Math.max(0, Math.round(rate));
};

export const creatorCompensationStatus = onCall({ region: REGION }, async (request) => {
  const identity = await requireAccountRole(request, ['creator','admin']);
  const [settings, subscriptions] = await Promise.all([
    readCommercialSettings(),
    db.collection('subscriptions').where('status', '==', 'active').limit(5000).get(),
  ]);
  const activePaidSubscribers = subscriptions.docs.filter((doc) => typeof doc.data().confirmedMonthlyAmountPence === 'number' && Number(doc.data().confirmedMonthlyAmountPence) > 0).length;
  return {
    model: settings.compensationModel,
    activePaidSubscribers,
    standardMonthlyRatePence: calculateCreatorRate(settings, activePaidSubscribers),
    monthlyCapPence: settings.creatorMonthlyCapPence,
    rateBands: settings.creatorRateBands,
    eligibilityDefinition: settings.creatorEligibilityDefinition,
    popularityAffectsBaseRate: false,
    verifiedListeningIsAnalyticsOnly: true,
    payoutCadence: settings.payoutCadence,
    viewerRole: identity.role,
  };
});

export const getNotificationPreferences = onCall({ region: REGION }, async (request) => {
  const identity = await requireActiveIdentity(request);
  const snapshot = await accountRef(identity.uid).get();
  const stored = snapshot.data()?.notificationPreferences ?? {};
  return {
    preferences: {
      displayMode: ['full','discreet','minimal'].includes(String(stored.displayMode ?? '')) ? stored.displayMode : 'discreet',
      newReleases: stored.newReleases !== false,
      followedProfiles: stored.followedProfiles !== false,
      collaborations: stored.collaborations !== false,
      payments: stored.payments !== false,
      comments: stored.comments !== false,
      announcements: stored.announcements !== false,
    },
  };
});

export const saveNotificationPreferences = onCall({ region: REGION }, async (request) => {
  const identity = await requireActiveIdentity(request);
  const input = (request.data ?? {}) as Record<string, unknown>;
  const displayMode = cleanText(input.displayMode, 20);
  const preferences = {
    displayMode: ['full','discreet','minimal'].includes(displayMode) ? displayMode : 'discreet',
    newReleases: input.newReleases !== false,
    followedProfiles: input.followedProfiles !== false,
    collaborations: input.collaborations !== false,
    payments: input.payments !== false,
    comments: input.comments !== false,
    announcements: input.announcements !== false,
  };
  await accountRef(identity.uid).set({
    notificationPreferences: preferences,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  return { preferences };
});

const listenerHistoryFor = async (uid: string) => {
  const [eventsSnapshot, favouritesSnapshot, hiddenContinueSnapshot, hiddenHistorySnapshot, accountSnapshot, releasesSnapshot] = await Promise.all([
    db.collection('listeningEvents').where('userId', '==', uid).limit(3000).get(),
    accountRef(uid).collection('favourites').limit(500).get(),
    accountRef(uid).collection('hiddenContinue').limit(500).get(),
    accountRef(uid).collection('hiddenHistory').limit(500).get(),
    accountRef(uid).get(),
    db.collection('releases').where('status', '==', 'released').limit(500).get(),
  ]);
  const releases = new Map(releasesSnapshot.docs.map((doc) => [doc.id, releasePayload(doc.data(), doc.id)]));
  const favouriteIds = new Set(favouritesSnapshot.docs.map((doc) => doc.id));
  const hiddenContinueIds = new Set(hiddenContinueSnapshot.docs.map((doc) => doc.id));
  const hiddenHistoryIds = new Set(hiddenHistorySnapshot.docs.map((doc) => doc.id));
  const historyClearedAt = toIso(accountSnapshot.data()?.historyClearedAt);
  const latest = new Map<string, any>();

  const ordered: Array<Record<string, any>> = eventsSnapshot.docs
    .map((doc): Record<string, any> => {
      const data = doc.data() as Record<string, any>;
      return { ...data, eventId: doc.id, createdAtIso: toIso(data.createdAt) };
    })
    .filter((event) => !historyClearedAt || !event.createdAtIso || String(event.createdAtIso) > historyClearedAt)
    .sort((a, b) => String(b.createdAtIso ?? '').localeCompare(String(a.createdAtIso ?? '')));

  for (const event of ordered) {
    const releaseId = cleanText(event.releaseId, 160);
    if (releaseId && !hiddenHistoryIds.has(releaseId) && !latest.has(releaseId)) latest.set(releaseId, event);
  }

  const history = Array.from(latest.entries()).map(([releaseId, event]) => {
    const release = releases.get(releaseId);
    if (!release) return null;
    const positionSeconds = Math.max(0, Number(event.positionSeconds ?? 0));
    const durationSeconds = Math.max(0, Number(event.durationSeconds ?? 0));
    const completed = event.eventType === 'complete' || event.completed === true;
    return {
      ...release,
      lastListenedAt: event.createdAtIso ?? null,
      positionSeconds,
      durationSeconds,
      completed,
      favourite: favouriteIds.has(releaseId),
    };
  }).filter(Boolean);

  return {
    history,
    continueListening: history.filter((item: any) => !item.completed && item.positionSeconds > 0 && !hiddenContinueIds.has(String(item.id))),
    favourites: history.filter((item: any) => item.favourite),
  };
};

export const listenerLibrary = onCall({ region: REGION }, async (request) => {
  const identity = await requireActiveIdentity(request);
  await requireAgeVerified(identity.uid);
  const library = await listenerHistoryFor(identity.uid);
  const playlistsSnapshot = await accountRef(identity.uid).collection('playlists').limit(100).get();
  const profile = await profileRef(identity.uid).get();
  const publicPlaylistIds = new Set(cleanStringList(profile.data()?.featuredPortfolioIds, 6));
  const playlists = playlistsSnapshot.docs
    .map((doc) => ({
      id: doc.id,
      title: doc.data().title ?? 'Untitled playlist',
      releaseIds: Array.isArray(doc.data().releaseIds) ? doc.data().releaseIds : [],
      publicOnProfile: publicPlaylistIds.has(doc.id),
      createdAt: toIso(doc.data().createdAt),
      updatedAt: toIso(doc.data().updatedAt),
    }))
    .sort((a, b) => String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')));
  return { ...library, playlists };
});

export const dismissContinueListening = onCall({ region: REGION }, async (request) => {
  const identity = await requireActiveIdentity(request);
  const releaseId = cleanText((request.data as { releaseId?: unknown } | undefined)?.releaseId, 160);
  if (!releaseId) throw new HttpsError('invalid-argument', 'Release is required.');
  await accountRef(identity.uid).collection('hiddenContinue').doc(releaseId).set({
    hiddenAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  return { releaseId, hidden: true };
});

export const hideHistoryItem = onCall({ region: REGION }, async (request) => {
  const identity = await requireActiveIdentity(request);
  const releaseId = cleanText((request.data as { releaseId?: unknown } | undefined)?.releaseId, 160);
  if (!releaseId) throw new HttpsError('invalid-argument', 'Release is required.');
  await accountRef(identity.uid).collection('hiddenHistory').doc(releaseId).set({
    hiddenAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  return { releaseId, hidden: true };
});

export const clearListenerHistory = onCall({ region: REGION }, async (request) => {
  const identity = await requireActiveIdentity(request);
  await accountRef(identity.uid).set({
    historyClearedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  return { cleared: true };
});

export const savePlaylist = onCall({ region: REGION }, async (request) => {
  const identity = await requireActiveIdentity(request);
  const input = (request.data ?? {}) as Record<string, unknown>;
  const playlistId = cleanText(input.playlistId, 160);
  const title = cleanText(input.title, 100) || 'Untitled playlist';
  const releaseIds = cleanStringList(input.releaseIds, 200);
  const ref = playlistId
    ? accountRef(identity.uid).collection('playlists').doc(playlistId)
    : accountRef(identity.uid).collection('playlists').doc();

  const current = await ref.get();
  await ref.set({
    title,
    releaseIds,
    updatedAt: FieldValue.serverTimestamp(),
    ...(current.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
  }, { merge: true });

  return { playlist: { id: ref.id, title, releaseIds } };
});

export const setPlaylistProfileVisibility = onCall({ region: REGION }, async (request) => {
  const identity = await requireAccountRole(request, ['listener']);
  const input = (request.data ?? {}) as Record<string, unknown>;
  const playlistId = cleanText(input.playlistId, 160);
  const visible = input.visible === true;
  if (!playlistId) throw new HttpsError('invalid-argument', 'Playlist is required.');

  const playlist = await accountRef(identity.uid).collection('playlists').doc(playlistId).get();
  if (!playlist.exists) throw new HttpsError('not-found', 'Playlist not found.');

  const profile = await profileRef(identity.uid).get();
  const current = cleanStringList(profile.data()?.featuredPortfolioIds, 6);
  const has = current.includes(playlistId);
  let next = current;

  if (visible && !has) {
    if (current.length >= 6) throw new HttpsError('failed-precondition', 'You can share up to six playlists on your public profile.');
    next = [...current, playlistId];
  } else if (!visible && has) {
    next = current.filter((id) => id !== playlistId);
  }

  await profileRef(identity.uid).set({
    featuredPortfolioIds: next,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  return { playlistId, visible: next.includes(playlistId), featuredPortfolioIds: next };
});

export const deletePlaylist = onCall({ region: REGION }, async (request) => {
  const identity = await requireActiveIdentity(request);
  const playlistId = cleanText((request.data as { playlistId?: unknown } | undefined)?.playlistId, 160);
  if (!playlistId) throw new HttpsError('invalid-argument', 'Playlist is required.');
  await accountRef(identity.uid).collection('playlists').doc(playlistId).delete();
  const profile = await profileRef(identity.uid).get();
  const featuredPortfolioIds = cleanStringList(profile.data()?.featuredPortfolioIds, 6).filter((id) => id !== playlistId);
  await profileRef(identity.uid).set({ featuredPortfolioIds, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return { deleted: true, playlistId };
});

export const transparencySnapshot = onCall({ region: REGION }, async (request) => {
  const identity = await requireActiveIdentity(request);
  await requireAgeVerified(identity.uid);
  const [settings, accounts] = await Promise.all([
    readCommercialSettings(),
    db.collection('accounts').limit(2000).get(),
  ]);
  const counts = { creators: 0, writers: 0, editors: 0 };
  for (const doc of accounts.docs) {
    if (doc.data().status !== 'active') continue;
    if (doc.data().role === 'creator') counts.creators += 1;
    if (doc.data().role === 'writer') counts.writers += 1;
    if (doc.data().role === 'editor') counts.editors += 1;
  }
  return {
    planningMonthlyPricePence: settings.planningMonthlyPricePence,
    compensationModel: settings.compensationModel,
    creatorMonthlyCapPence: settings.creatorMonthlyCapPence,
    popularityAffectsBaseRate: false,
    tipsEnabled: settings.tipsEnabled,
    individualPurchasesEnabled: settings.individualPurchasesEnabled,
    activeCreativeAccounts: counts,
    principles: [
      'Creators are paid against a published capped standard rate rather than popularity.',
      'Verified listening remains an analytics and discovery signal, not the standard-rate formula.',
      'Writers retain copyright unless an explicit agreement says otherwise.',
      'Nightjar does not permit AI training on protected manuscripts by default.',
    ],
  };
});


const reviewPayload = (data: Record<string, any>, id: string) => ({
  id,
  releaseId: data.releaseId ?? null,
  releaseTitle: data.releaseTitle ?? 'Nightjar release',
  userId: data.userId ?? null,
  reviewerName: data.reviewerName ?? 'Nightjar listener',
  reviewerHandle: data.reviewerHandle ?? null,
  rating: Math.max(1, Math.min(5, Math.round(Number(data.rating ?? 0)))),
  review: cleanText(data.review, 1600),
  status: data.status ?? 'pending',
  createdAt: toIso(data.createdAt),
  updatedAt: toIso(data.updatedAt),
  moderatedAt: toIso(data.moderatedAt),
});

export const submitReleaseReview = onCall({ region: REGION }, async (request) => {
  const identity = await requireActiveIdentity(request);
  await requireAgeVerified(identity.uid);
  const input = (request.data ?? {}) as Record<string, unknown>;
  const releaseId = cleanText(input.releaseId, 160);
  const rating = Math.round(Number(input.rating ?? 0));
  const review = cleanText(input.review, 1600);
  if (!releaseId || rating < 1 || rating > 5) throw new HttpsError('invalid-argument', 'Choose a rating from 1 to 5.');
  const release = await releaseRef(releaseId).get();
  const releaseData = release.data();
  if (!releaseData || releaseData.status !== 'released') throw new HttpsError('not-found', 'Release not found.');
  const profile = await accountPresentation(identity.uid);
  const ref = db.collection('releaseReviews').doc(identity.uid + '_' + releaseId);
  const existing = await ref.get();
  await ref.set({
    releaseId,
    releaseTitle: releaseData.title ?? 'Nightjar release',
    userId: identity.uid,
    reviewerName: profile.displayName,
    reviewerHandle: profile.handle,
    rating,
    review,
    status: 'pending',
    updatedAt: FieldValue.serverTimestamp(),
    ...(existing.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
  }, { merge: true });
  const saved = await ref.get();
  return { review: reviewPayload(saved.data() ?? {}, ref.id) };
});

export const listReleaseReviews = onCall({ region: REGION }, async (request) => {
  const identity = await requireActiveIdentity(request);
  await requireAgeVerified(identity.uid);
  const releaseId = cleanText((request.data as { releaseId?: unknown } | undefined)?.releaseId, 160);
  if (!releaseId) throw new HttpsError('invalid-argument', 'Release is required.');
  const snapshot = await db.collection('releaseReviews').where('releaseId', '==', releaseId).limit(500).get();
  const reviews = snapshot.docs
    .filter((doc) => doc.data().status === 'approved')
    .map((doc) => reviewPayload(doc.data(), doc.id))
    .sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')));
  const averageRating = reviews.length
    ? Number((reviews.reduce((sum, item) => sum + item.rating, 0) / reviews.length).toFixed(1))
    : null;
  const own = snapshot.docs.find((doc) => doc.data().userId === identity.uid);
  return {
    reviews,
    averageRating,
    ratingCount: reviews.length,
    myReview: own ? reviewPayload(own.data(), own.id) : null,
  };
});

export const adminListReviewQueue = onCall({ region: REGION }, async (request) => {
  requireAdminIdentity(request);
  const snapshot = await db.collection('releaseReviews').limit(500).get();
  const reviews = snapshot.docs
    .filter((doc) => doc.data().status === 'pending')
    .map((doc) => reviewPayload(doc.data(), doc.id))
    .sort((a, b) => String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? '')));
  return { reviews };
});

export const adminModerateReview = onCall({ region: REGION }, async (request) => {
  const admin = requireAdminIdentity(request);
  const input = (request.data ?? {}) as Record<string, unknown>;
  const reviewId = cleanText(input.reviewId, 320);
  const decision = cleanText(input.decision, 20);
  if (!['approved','rejected'].includes(decision)) throw new HttpsError('invalid-argument', 'Invalid review decision.');
  const ref = db.collection('releaseReviews').doc(reviewId);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new HttpsError('not-found', 'Review not found.');
  await ref.set({
    status: decision,
    moderatedBy: admin.uid,
    moderatedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  const saved = await ref.get();
  return { review: reviewPayload(saved.data() ?? {}, reviewId) };
});
