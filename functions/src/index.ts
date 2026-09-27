import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue, type QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { randomUUID } from 'node:crypto';
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
  const identity = await requireActiveIdentity(request);
  const snapshot = await profileRef(identity.uid).get();
  return { profile: snapshot.exists ? snapshot.data() : null };
});

export const saveMyProfile = onCall({ region: REGION }, async (request) => {
  const identity = await requireActiveIdentity(request);
  const input = (request.data ?? {}) as Record<string, unknown>;
  const handle = cleanHandle(input.handle);
  validateHandle(handle);

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
    favouriteTags: Array.isArray(data.favouriteTags) ? data.favouriteTags : [],
    roleFocus: Array.isArray(data.roleFocus) ? data.roleFocus : [],
  };
};

export const listCreators = onCall({ region: REGION }, async (request) => {
  await requireActiveIdentity(request);
  const accounts = await db.collection('accounts').where('role', '==', 'creator').limit(200).get();
  const creators = (await Promise.all(
    accounts.docs
      .filter((doc) => doc.data().status === 'active')
      .map(async (doc) => {
        const base = await publicProfileForAccount(doc);
        if (!base) return null;
        const releases = await db.collection('releases').where('creatorUserId', '==', doc.id).limit(500).get();
        return { ...base, releaseCount: releases.docs.filter((release) => release.data().status === 'released').length };
      }),
  )).filter(Boolean);

  return { creators };
});

export const getCreatorProfile = onCall({ region: REGION }, async (request) => {
  await requireActiveIdentity(request);
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
      favouriteTags: Array.isArray(data.favouriteTags) ? data.favouriteTags : [],
      releases,
    },
  };
});

export const listWriters = onCall({ region: REGION }, async (request) => {
  await requireActiveIdentity(request);
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
    follows: follows.docs.map((doc) => ({ creatorUserId: doc.id })),
    favourites: favourites.docs.map((doc) => ({ releaseId: doc.id })),
  };
});

export const setCreatorFollow = onCall({ region: REGION }, async (request) => {
  const identity = await requireActiveIdentity(request);
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

  if (kind === 'release_artwork' && !identity.admin) {
    const account = await accountRef(identity.uid).get();
    if (account.data()?.role !== 'creator' || account.data()?.status !== 'active') {
      throw new HttpsError('permission-denied', 'Active Creator access required.');
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

export const listPendingImages = onCall({ region: REGION }, async (request) => {
  requireAdminIdentity(request);
  const snapshot = await db.collection('imageAssets').where('status', '==', 'pending').limit(100).get();

  const assets = await Promise.all(snapshot.docs.map(async (doc) => {
    const data = doc.data();
    let previewUrl: string | null = null;
    const storagePath = cleanText(data.storagePath, 500);
    if (storagePath) {
      try {
        const [url] = await getStorage().bucket().file(storagePath).getSignedUrl({
          action: 'read',
          expires: Date.now() + 15 * 60 * 1000,
        });
        previewUrl = url;
      } catch { previewUrl = null; }
    }
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
      previewUrl,
    };
  }));

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
    const releaseRef = db.collection('releases').doc(String(asset.targetId));
    const release = await releaseRef.get();
    if (release.exists) {
      await releaseRef.set({
        artworkAssetId: assetId,
        artworkUrl: url,
        artworkStatus: 'approved',
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }
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
    const releaseRef = db.collection('releases').doc(String(asset.targetId));
    const release = await releaseRef.get();
    if (release.exists && release.data()?.artworkAssetId === assetId) {
      await releaseRef.set({
        artworkAssetId: null,
        artworkUrl: null,
        artworkStatus: null,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
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

type CommercialSettings = {
  planningMonthlyPricePence: number | null;
  creatorPoolPercent: number | null;
  reservePercent: number | null;
  payoutCadence: string | null;
  eligibleListeningDefinition: string | null;
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
  };
};

export const commercialOverview = onCall({ region: REGION }, async (request) => {
  requireAdminIdentity(request);
  const [settings, subscriptions] = await Promise.all([
    readCommercialSettings(),
    db.collection('subscriptions').limit(5000).get(),
  ]);

  let active = 0;
  let trialing = 0;
  let pastDue = 0;
  let confirmedGrossMrrPence = 0;

  for (const doc of subscriptions.docs) {
    const data = doc.data();
    const status = String(data.status ?? '');
    if (status === 'active') {
      active += 1;
      if (typeof data.confirmedMonthlyAmountPence === 'number') {
        confirmedGrossMrrPence += Math.max(0, Math.round(data.confirmedMonthlyAmountPence));
      }
    } else if (status === 'trialing') trialing += 1;
    else if (status === 'past_due') pastDue += 1;
  }

  return {
    settings,
    subscriptions: { active, trialing, pastDue },
    confirmedGrossMrrPence,
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

  const settings: CommercialSettings = {
    planningMonthlyPricePence: nullableNumber(input.planningMonthlyPricePence, 0, 100000, true),
    creatorPoolPercent: nullableNumber(input.creatorPoolPercent, 0, 100),
    reservePercent: nullableNumber(input.reservePercent, 0, 100),
    payoutCadence: cleanText(input.payoutCadence, 80) || null,
    eligibleListeningDefinition: cleanText(input.eligibleListeningDefinition, 1200) || null,
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

export const spotlightState = onCall({ region: REGION }, async (request) => {
  await requireActiveIdentity(request);
  const date = londonDateKey();
  const [creator, writer, editor] = await Promise.all([
    spotlightForRole('creator', date),
    spotlightForRole('writer', date),
    spotlightForRole('editor', date),
  ]);
  return {
    date,
    spotlights: [creator, writer, editor].filter(Boolean),
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
    };
  }));

  const counts = {
    listener: accounts.filter((account) => account.role === 'listener').length,
    creator: accounts.filter((account) => account.role === 'creator').length,
    writer: accounts.filter((account) => account.role === 'writer').length,
    editor: accounts.filter((account) => account.role === 'editor').length,
    admin: accounts.filter((account) => account.role === 'admin').length,
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
      currentPeriodEnd: data.currentPeriodEnd ?? null,
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
  audioAvailable: Boolean(data.audioStoragePath),
  status: data.status ?? 'draft',
  moderationNote: data.moderationNote ?? null,
  releaseDate: data.releaseDate ?? null,
  createdAt: data.createdAt ?? null,
  updatedAt: data.updatedAt ?? null,
});

const releaseSearchText = (data: Record<string, unknown>) => [
  data.title,
  data.description,
  data.category,
  data.genre,
  data.mood,
  ...(Array.isArray(data.tags) ? data.tags : []),
  ...(Array.isArray(data.tropes) ? data.tropes : []),
].filter(Boolean).join(' ').toLowerCase();

export const listCatalogue = onCall({ region: REGION }, async (request) => {
  await requireActiveIdentity(request);
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
    durationMinutes: 0,
    audioStoragePath: null,
    artworkAssetId: null,
    artworkUrl: null,
    artworkStatus: null,
    status: 'draft' as ReleaseStatus,
    moderationNote: null,
    version: 1,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  await ref.set(record);
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
    durationMinutes: typeof input.durationMinutes === 'number' && Number.isFinite(input.durationMinutes)
      ? Math.max(0, Math.min(1440, input.durationMinutes))
      : current.durationMinutes ?? 0,
    artworkAssetId: Object.prototype.hasOwnProperty.call(input, 'artworkAssetId') ? input.artworkAssetId ?? null : current.artworkAssetId ?? null,
    artworkUrl: Object.prototype.hasOwnProperty.call(input, 'artworkUrl') ? input.artworkUrl ?? null : current.artworkUrl ?? null,
    artworkStatus: Object.prototype.hasOwnProperty.call(input, 'artworkStatus') ? input.artworkStatus ?? null : current.artworkStatus ?? null,
    updatedAt: FieldValue.serverTimestamp(),
  };
  await ref.set(update, { merge: true });
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
  await ref.delete();
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
  if (data.artworkAssetId && data.artworkStatus === 'pending') {
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

  let listeningSeconds = 0;
  const listeners = new Set<string>();
  for (const doc of listeningSnapshot.docs) {
    const event = doc.data();
    const duration = Math.max(0, Number(event.durationSeconds ?? 0));
    const position = Math.max(0, Number(event.positionSeconds ?? 0));
    listeningSeconds += Math.min(position, duration || position);
    if (event.userId) listeners.add(String(event.userId));
  }

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

const requireAgeVerified = async (uid: string) => {
  const snapshot = await db.collection('ageAssurance').doc(uid).get();
  const data = snapshot.data();
  if (!data?.verified) throw new HttpsError('permission-denied', 'Age assurance is required before playing Nightjar audio.');
  return data;
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
  await requireActiveIdentity(request);
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
  const snapshot = await accountRef(identity.uid).collection('notifications').limit(100).get();
  const notifications = snapshot.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .sort((a: any, b: any) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
    .slice(0, 30);
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
  return {
    verified: data.verified === true,
    status: data.verified === true ? 'COMPLETE' : String(data.status ?? 'NOT_STARTED'),
    ageThreshold: 18,
    configured: false,
    provider: data.provider ?? 'not-configured',
    environment: data.environment ?? 'production',
    verifiedAt: data.verifiedAt ?? null,
    reverifyRequired: data.reverifyRequired === true,
    testAvailable: identity.admin,
  };
});

export const startAgeAssurance = onCall({ region: REGION }, async (request) => {
  await requireActiveIdentity(request);
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
  const blocked = recent.filter((item) => ['blocked_interaction','copy_blocked','cut_blocked','selection_blocked','print_blocked','repeated_protected_interaction'].includes(String(item.eventType)));
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
      rapidViews: rapidViews.length,
      distinctScripts,
      deviceId: signal.deviceId ?? null,
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

  const record = {
    userId: identity.uid,
    eventType,
    relatedType: cleanText(input.relatedType, 80) || 'script',
    relatedId: cleanText(input.relatedId, 160) || null,
    deviceId: cleanText(input.deviceId, 180) || null,
    summary: cleanText(input.summary, 800) || null,
    createdAt: FieldValue.serverTimestamp(),
  };
  const ref = await db.collection('protectionEvents').add(record);

  const alert = await assessProtectedActivityFirebase(identity.uid, { ...record, createdAt: new Date().toISOString() });
  return { recorded: true, evidenceId: ref.id, alert };
});

export const openProtectedScript = onCall({ region: REGION }, async (request) => {
  const identity = await requireAccountRole(request, ['creator','writer','editor','admin']);
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

  void assessProtectedActivityFirebase(identity.uid, { eventType: 'script_view', relatedId: scriptId });

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
  const snapshot = await db.collection('protectionReports').where('userId', '==', identity.uid).limit(500).get();
  const reports = snapshot.docs
    .map((doc) => ({ id: doc.id, ...doc.data(), createdAt: toIso(doc.data().createdAt) }))
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
  const ref = db.collection('protectionReports').doc();
  await ref.set({
    caseId,
    userId: identity.uid,
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
  const alerts = snapshot.docs
    .map((doc) => ({ id: doc.id, ...doc.data(), createdAt: toIso(doc.data().createdAt) }))
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

