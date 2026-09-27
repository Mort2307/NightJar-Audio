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
      welcomeMessage: data.welcomeMessage ?? null,
      pronouns: data.pronouns ?? null,
      avatarUrl: data.avatarStatus === 'approved' ? data.avatarUrl ?? null : null,
      avatarStatus: data.avatarStatus ?? null,
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
  const identity = requireVerifiedIdentity(request);
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
    await profileRef(identity.uid).set({
      pendingAvatarAssetId: assetId,
      avatarStatus: 'pending',
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  } else if (kind === 'brand_logo') {
    await db.collection('settings').doc('branding').set({
      pendingLogoAssetId: assetId,
      logoStatus: 'pending',
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
  response.setHeader('Cache-Control', 'public,max-age=3600');
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
        avatarStatus: 'rejected',
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    } else if (asset.kind === 'brand_logo') {
      await db.collection('settings').doc('branding').set({
        pendingLogoAssetId: null,
        logoStatus: 'rejected',
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
  const identity = requireVerifiedIdentity(request);
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
  const identity = requireVerifiedIdentity(request);
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
  const identity = requireVerifiedIdentity(request);
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
    planningMonthlyPricePence: typeof data.planningMonthlyPricePence === 'number' ? data.planningMonthlyPricePence : 500,
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
  requireVerifiedIdentity(request);
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

