import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue, type QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { getAuth } from 'firebase-admin/auth';
import { getMessaging } from 'firebase-admin/messaging';
import { createHash, randomUUID } from 'node:crypto';
import { HttpsError, onCall, onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { exchangeGoogleAuthorizationCode, getGoogleTokenInfo, getGoogleUserInfo, refreshGoogleAccessToken, revokeGoogleToken, sendGmailApiMessage } from './gmail-api';
import { DIDIT_API_KEY, DIDIT_WORKFLOW_ID, DIDIT_ENVIRONMENT, diditConfigured, diditMode, diditPass, startDiditSession } from './didit';
export { diditWebhook, processDiditWebhook } from './didit';

initializeApp();

const db = getFirestore();
const REGION = 'europe-west2';
const DIDIT_LIVE_PILOT_ADMINS_ONLY = true; // Closed beta: billable age sessions are admin-only.
const TESTING_AGE_ASSURANCE_BYPASS = true; // TESTING ONLY — must be false before public launch.
const CLOSED_BETA = true; // TESTING ONLY — must be false before public launch.
const CLOSED_BETA_ALLOWLIST_COLLECTION = 'closedBetaAllowlist';
const NIGHTJAR_GMAIL_CLIENT_ID = defineSecret('NIGHTJAR_GMAIL_CLIENT_ID');
const NIGHTJAR_GMAIL_CLIENT_SECRET = defineSecret('NIGHTJAR_GMAIL_CLIENT_SECRET');
const NIGHTJAR_GMAIL_SENDER_EMAIL = 'nightjar.audio.app@gmail.com';
const NIGHTJAR_GMAIL_SCOPE = 'openid email https://www.googleapis.com/auth/gmail.send';
const NIGHTJAR_GMAIL_REDIRECT_URI = 'https://europe-west2-nightjar-audio.cloudfunctions.net/adminGmailOAuthCallback';

const ADMIN_EMAILS = new Set([
  'mike.owen230792@gmail.com',
  'megan.wright666@hotmail.com',
  'nightjar.audio.app@gmail.com',
]);

type AccountRole = 'admin' | 'creator' | 'listener' | 'writer' | 'editor' | 'artist';
type SelectableRole = 'creator' | 'listener' | 'writer' | 'editor' | 'artist';

const cleanEmail = (value: unknown) => String(value ?? '').trim().toLowerCase();
const maskSecurityEmail = (value: unknown) => {
  const email = cleanEmail(value);
  const [local = '', domain = ''] = email.split('@');
  if (!local || !domain) return 'unknown account';
  const visible = local.length <= 2 ? local.slice(0, 1) : local.slice(0, 2);
  return visible + '***@' + domain;
};
const authenticationEventMillis = (data: Record<string, any>) => data.createdAt?.toMillis?.() ?? 0;

const accountRef = (uid: string) => db.collection('accounts').doc(uid);

const CURRENT_LEGAL_DOCUMENTS = {
  platform_terms: {
    id: 'platform_terms',
    version: '2026-10-09.1',
    title: 'Nightjar Terms of Use',
    path: '/legal/terms',
    requiredForAccount: true,
    requiredForProfessional: true,
  },
  privacy_notice: {
    id: 'privacy_notice',
    version: '2026-10-09.1',
    title: 'Nightjar Privacy Notice',
    path: '/legal/privacy',
    requiredForAccount: true,
    requiredForProfessional: true,
  },
  professional_terms: {
    id: 'professional_terms',
    version: '2026-10-09.1',
    title: 'Nightjar Professional & Content Terms',
    path: '/legal/professional',
    requiredForAccount: false,
    requiredForProfessional: true,
  },
} as const;

type LegalDocumentId = keyof typeof CURRENT_LEGAL_DOCUMENTS;

const legalAcceptanceRef = (uid: string, documentId: LegalDocumentId) =>
  accountRef(uid).collection('legalAcceptances').doc(documentId);

const currentLegalAcceptanceFor = async (uid: string, documentId: LegalDocumentId) => {
  const expected = CURRENT_LEGAL_DOCUMENTS[documentId];
  const snapshot = await legalAcceptanceRef(uid, documentId).get();
  const data = snapshot.data() ?? {};
  return {
    accepted: snapshot.exists && data.version === expected.version && data.withdrawnAt == null,
    version: cleanText(data.version, 60) || null,
    acceptedAt: toIso(data.acceptedAt),
  };
};

const requireCurrentLegalAcceptance = async (uid: string, documentId: LegalDocumentId) => {
  const status = await currentLegalAcceptanceFor(uid, documentId);
  if (!status.accepted) {
    const document = CURRENT_LEGAL_DOCUMENTS[documentId];
    throw new HttpsError(
      'failed-precondition',
      'Accept the current ' + document.title + ' before continuing.',
      { code:'legal_acceptance_required', documentId, version:document.version, path:document.path },
    );
  }
  return status;
};

const requireProfessionalLegalTerms = async (uid: string) => {
  await Promise.all([
    requireCurrentLegalAcceptance(uid, 'platform_terms'),
    requireCurrentLegalAcceptance(uid, 'privacy_notice'),
    requireCurrentLegalAcceptance(uid, 'professional_terms'),
  ]);
};

const validEmailAddress = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const testerAllowlistRef = (email: string) => db
  .collection(CLOSED_BETA_ALLOWLIST_COLLECTION)
  .doc(createHash('sha256').update(cleanEmail(email)).digest('hex'));

const testerAccessForEmail = async (emailValue: unknown) => {
  const email = cleanEmail(emailValue);
  if (!validEmailAddress(email)) return null;
  const snapshot = await testerAllowlistRef(email).get();
  const data = snapshot.data() ?? {};
  if (!snapshot.exists || data.enabled !== true || cleanEmail(data.email) !== email) return null;
  return data;
};

const closedBetaAccessFor = async (emailValue: unknown, accountState: Record<string, unknown> | null = null) => {
  const email = cleanEmail(emailValue);
  if (!CLOSED_BETA) return { allowed: true, reason: 'public-registration' as const };
  if (ADMIN_EMAILS.has(email)) return { allowed: true, reason: 'administrator' as const };
  if (accountState?.testAccess === true) return { allowed: true, reason: 'legacy-test-access' as const };
  if (await testerAccessForEmail(email)) return { allowed: true, reason: 'approved-tester' as const };
  return { allowed: false, reason: 'not-invited' as const };
};

const requireClosedBetaAccess = async (emailValue: unknown, accountState: Record<string, unknown> | null = null) => {
  const access = await closedBetaAccessFor(emailValue, accountState);
  if (!access.allowed) {
    throw new HttpsError(
      'permission-denied',
      'Nightjar is currently in private testing. This email has not been invited.',
      { code: 'closed_beta_not_invited' },
    );
  }
  return access;
};

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

const requireRegistrationIdentity = (request: { auth?: { uid: string; token: Record<string, unknown> } | null }) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Create or sign in to your Nightjar account first.');
  const email = cleanEmail(request.auth.token.email);
  if (!email) throw new HttpsError('failed-precondition', 'A valid account email is required.');
  return { uid: request.auth.uid, email };
};

export const getLegalAgreementStatus = onCall({ region: REGION }, async (request) => {
  const identity = requireVerifiedIdentity(request);
  const entries = await Promise.all(
    (Object.keys(CURRENT_LEGAL_DOCUMENTS) as LegalDocumentId[]).map(async (documentId) => {
      const document = CURRENT_LEGAL_DOCUMENTS[documentId];
      const acceptance = await currentLegalAcceptanceFor(identity.uid, documentId);
      return {
        ...document,
        accepted: acceptance.accepted,
        acceptedVersion: acceptance.version,
        acceptedAt: acceptance.acceptedAt,
      };
    }),
  );
  return { documents: entries };
});

export const acceptLegalAgreements = onCall({ region: REGION }, async (request) => {
  const identity = requireVerifiedIdentity(request);
  const input = (request.data ?? {}) as Record<string, unknown>;
  const requested = Array.isArray(input.documents) ? input.documents : [];
  const source = cleanText(input.source, 60) || 'account';
  if (!requested.length) throw new HttpsError('invalid-argument', 'Choose at least one Nightjar legal document to accept.');

  const accepted: Array<{ id: LegalDocumentId; version: string }> = [];
  const batch = db.batch();

  for (const raw of requested) {
    const entry = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
    const id = cleanText(entry.id, 60) as LegalDocumentId;
    if (!(id in CURRENT_LEGAL_DOCUMENTS)) throw new HttpsError('invalid-argument', 'Unknown Nightjar legal document.');
    const document = CURRENT_LEGAL_DOCUMENTS[id];
    const version = cleanText(entry.version, 60);
    if (version !== document.version) {
      throw new HttpsError('failed-precondition', 'That Nightjar legal document has changed. Review the current version before accepting.', {
        code:'legal_version_changed', documentId:id, currentVersion:document.version, path:document.path,
      });
    }
    if (entry.accepted !== true) throw new HttpsError('invalid-argument', 'Legal acceptance must be an explicit positive action.');

    batch.set(legalAcceptanceRef(identity.uid, id), {
      documentId:id,
      title:document.title,
      version:document.version,
      accepted:true,
      acceptedAt:FieldValue.serverTimestamp(),
      acceptedByUserId:identity.uid,
      acceptedByEmail:identity.email,
      source,
      withdrawnAt:null,
      updatedAt:FieldValue.serverTimestamp(),
    }, { merge:true });
    accepted.push({ id, version:document.version });
  }

  await batch.commit();
  return { accepted };
});

export const stageRegistrationIntent = onCall({ region: REGION }, async (request) => {
  const identity = requireRegistrationIdentity(request);
  await requireClosedBetaAccess(identity.email);
  const input = (request.data ?? {}) as { role?: unknown; roles?: unknown; referralCode?: unknown; legalAcceptances?: unknown };
  const legacyRole = String(input.role ?? '').trim();
  const submittedRoles = Array.isArray(input.roles)
    ? input.roles.map((value) => String(value ?? '').trim())
    : legacyRole ? [legacyRole] : [];
  const roles = Array.from(new Set(submittedRoles))
    .filter((role): role is SelectableRole => ['creator','listener','writer','editor','artist'].includes(role));
  if (!roles.length) roles.push('listener');
  const professionalRoles = roles.filter((role): role is ProfessionalRole => ['creator','writer','editor','artist'].includes(role));
  const legalInput = Array.isArray(input.legalAcceptances) ? input.legalAcceptances : [];
  const legalVersions = new Map(
    legalInput
      .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
      .filter((item) => item.accepted === true)
      .map((item) => [cleanText(item.id, 60), cleanText(item.version, 60)]),
  );
  for (const documentId of ['platform_terms','privacy_notice'] as LegalDocumentId[]) {
    const document = CURRENT_LEGAL_DOCUMENTS[documentId];
    if (legalVersions.get(documentId) !== document.version) {
      throw new HttpsError('failed-precondition', 'Review and accept the current ' + document.title + ' before creating a Nightjar account.', {
        code:'registration_legal_acceptance_required', documentId, version:document.version, path:document.path,
      });
    }
  }
  if (professionalRoles.length) {
    const document = CURRENT_LEGAL_DOCUMENTS.professional_terms;
    if (legalVersions.get('professional_terms') !== document.version) {
      throw new HttpsError('failed-precondition', 'Professional applicants must review and accept the current Nightjar Professional & Content Terms.', {
        code:'registration_professional_terms_required', documentId:'professional_terms', version:document.version, path:document.path,
      });
    }
  }
  const referralCode = String(input.referralCode ?? '').trim().slice(0,80);
  await db.collection('registrationIntents').doc(identity.uid).set({
    userId: identity.uid,
    email: identity.email,
    role: professionalRoles[0] ?? 'listener',
    roles: ['listener', ...professionalRoles],
    professionalRoles,
    legalAcceptances: Array.from(legalVersions.entries()).map(([id,version]) => ({ id, version })),
    legalAcceptedAt: FieldValue.serverTimestamp(),
    referralCode: professionalRoles.includes('creator') && referralCode ? referralCode : null,
    updatedAt: FieldValue.serverTimestamp(),
    createdAt: FieldValue.serverTimestamp(),
  }, { merge:true });
  return { role: professionalRoles[0] ?? 'listener', roles: ['listener', ...professionalRoles], professionalRoles, staged:true };
});

const requireAdminIdentity = (request: { auth?: { uid: string; token: Record<string, unknown> } | null }) => {
  const identity = requireVerifiedIdentity(request);
  if (!identity.admin) throw new HttpsError('permission-denied', 'Administrator access required.');
  return identity;
};

const requireActiveIdentity = async (request: { auth?: { uid: string; token: Record<string, unknown> } | null }) => {
  const identity = requireVerifiedIdentity(request);
  if (identity.admin) return identity;
  const snapshot = await accountRef(identity.uid).get();
  await requireClosedBetaAccess(identity.email, snapshot.data() ?? null);
  if (snapshot.exists && snapshot.data()?.status === 'suspended') {
    throw new HttpsError('permission-denied', 'This Nightjar account is suspended.');
  }
  return identity;
};


export const health = onRequest({ region: REGION }, (_request, response) => {
  response.status(200).json({ service: 'nightjar', status: 'ok' });
});

export const closedBetaRegistrationStatus = onCall({ region: REGION }, async (request) => {
  const email = cleanEmail((request.data as { email?: unknown } | undefined)?.email);
  if (!validEmailAddress(email)) {
    return {
      closedBeta: CLOSED_BETA,
      allowed: false,
      temporaryAgeBypass: false,
    };
  }
  const access = await closedBetaAccessFor(email);
  return {
    closedBeta: CLOSED_BETA,
    allowed: access.allowed,
    temporaryAgeBypass: access.allowed && TESTING_AGE_ASSURANCE_BYPASS,
  };
});

export const accountIdentity = onCall({ region: REGION }, async (request) => {
  const identity = requireVerifiedIdentity(request);
  const ref = accountRef(identity.uid);
  const [snapshot, registrationIntent] = await Promise.all([
    ref.get(),
    db.collection('registrationIntents').doc(identity.uid).get(),
  ]);
  const betaAccess = await requireClosedBetaAccess(identity.email, snapshot.data() ?? null);

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

  const current = snapshot.exists ? snapshot.data() ?? {} : {};
  const intentData = registrationIntent.data() ?? {};
  const rawStagedRole = String(intentData.role ?? '');
  const stagedProfessionalRoles = cleanProfessionalRoles(
    Array.isArray(intentData.professionalRoles)
      ? intentData.professionalRoles
      : Array.isArray(intentData.roles)
        ? intentData.roles
        : ['creator','writer','editor','artist'].includes(rawStagedRole) ? [rawStagedRole] : [],
  );
  const stagedRole = !current.role && rawStagedRole === 'listener' && !stagedProfessionalRoles.length
    ? 'listener' as SelectableRole
    : null;
  const role = (current.role as AccountRole | null) ?? (stagedProfessionalRoles.length ? 'listener' : stagedRole) ?? null;
  const status = String(current.status ?? 'active');

  await ref.set({
    email: identity.email,
    role,
    status,
    emailVerified: true,
    testAccess: current.testAccess === true || betaAccess.reason === 'approved-tester' || betaAccess.reason === 'legacy-test-access',
    updatedAt: FieldValue.serverTimestamp(),
    ...(snapshot.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
  }, { merge:true });

  if (stagedProfessionalRoles.length) {
    const applicationRef = professionalApplicationRef(identity.uid);
    const application = await applicationRef.get();
    const requestedRoles = Array.from(new Set([
      ...cleanProfessionalRoles(application.data()?.requestedRoles),
      ...stagedProfessionalRoles,
    ]));
    await applicationRef.set({
      userId: identity.uid,
      email: identity.email,
      requestedRoles,
      approvedRoles: professionalRolesForAccount(current),
      status: 'banked',
      source: 'registration',
      bankedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      ...(application.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
    }, { merge:true });
    await ref.set({
      pendingProfessionalRoles: requestedRoles,
      approvedProfessionalRoles: professionalRolesForAccount(current),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge:true });
  }

  const stagedReferralCode = stagedProfessionalRoles.includes('creator')
    ? String(registrationIntent.data()?.referralCode ?? '').trim().slice(0,80)
    : '';
  if (stagedReferralCode) {
    const referrals = await db.collection('creatorSuggestions').where('referralCode','==',stagedReferralCode).limit(1).get();
    const suggestion = referrals.docs[0];
    if (suggestion) {
      await suggestion.ref.set({
        status:'joined',
        claimedByUserId:identity.uid,
        claimedAt:FieldValue.serverTimestamp(),
        updatedAt:FieldValue.serverTimestamp(),
      }, { merge:true });
      await ref.set({
        creatorReferralCode:stagedReferralCode,
        creatorReferralSuggestionId:suggestion.id,
        updatedAt:FieldValue.serverTimestamp(),
      }, { merge:true });
    }
  }

  if (registrationIntent.exists) {
    const stagedLegal = Array.isArray(intentData.legalAcceptances) ? intentData.legalAcceptances : [];
    const legalBatch = db.batch();
    for (const raw of stagedLegal) {
      const item = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
      const id = cleanText(item.id, 60) as LegalDocumentId;
      if (!(id in CURRENT_LEGAL_DOCUMENTS)) continue;
      const document = CURRENT_LEGAL_DOCUMENTS[id];
      if (cleanText(item.version, 60) !== document.version) continue;
      legalBatch.set(legalAcceptanceRef(identity.uid, id), {
        documentId:id,
        title:document.title,
        version:document.version,
        accepted:true,
        acceptedAt:FieldValue.serverTimestamp(),
        acceptedByUserId:identity.uid,
        acceptedByEmail:identity.email,
        source:'registration',
        withdrawnAt:null,
        updatedAt:FieldValue.serverTimestamp(),
      }, { merge:true });
    }
    await legalBatch.commit();
    await registrationIntent.ref.delete();
  }

  return {
    userId: identity.uid,
    email: identity.email,
    admin: false,
    role,
    status,
    emailVerified: true,
  };
});

export const chooseAccountRole = onCall({ region: REGION }, async (request) => {
  const identity = await requireActiveIdentity(request);
  if (identity.admin) throw new HttpsError('failed-precondition', 'Administrator roles are assigned by Nightjar.');

  const input = (request.data ?? {}) as { role?: unknown; referralCode?: unknown };
  const requestedRole = String(input.role ?? '') as SelectableRole;
  if (!['creator', 'listener', 'writer', 'editor', 'artist'].includes(requestedRole)) {
    throw new HttpsError('invalid-argument', 'Choose Listener, Creator, Writer, Audio Editor or Artist.');
  }

  const ref = accountRef(identity.uid);
  const snapshot = await ref.get();
  const current = snapshot.data() ?? {};
  const professionalRequest = ['creator','writer','editor','artist'].includes(requestedRole);

  if (!professionalRequest) {
    await ref.set({
      email: identity.email,
      emailVerified: true,
      role: 'listener',
      status: 'active',
      updatedAt: FieldValue.serverTimestamp(),
      ...(snapshot.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
    }, { merge:true });
  } else {
    const applicationRef = professionalApplicationRef(identity.uid);
    const application = await applicationRef.get();
    const approved = professionalRolesForAccount(current);
    const applicationStatus = cleanText(application.data()?.status, 30);
    const carriedRequestedRoles = ['banked','waitlist'].includes(applicationStatus)
      ? cleanProfessionalRoles(application.data()?.requestedRoles)
      : [];
    const requestedRoles = Array.from(new Set([
      ...carriedRequestedRoles,
      requestedRole as ProfessionalRole,
    ])).filter((role) => !approved.includes(role));
    await ref.set({
      email: identity.email,
      emailVerified: true,
      role: cleanText(current.role, 30) || 'listener',
      status: 'active',
      approvedProfessionalRoles: approved,
      pendingProfessionalRoles: requestedRoles,
      updatedAt: FieldValue.serverTimestamp(),
      ...(snapshot.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
    }, { merge:true });
    await applicationRef.set({
      userId: identity.uid,
      email: identity.email,
      requestedRoles,
      approvedRoles: approved,
      status: 'banked',
      bankedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      ...(application.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
    }, { merge:true });
  }
  const status = professionalRequest ? 'banked' : 'active';

  const referralCode = cleanText(input.referralCode, 80);
  if (requestedRole === 'creator' && referralCode) {
    const referrals = await db.collection('creatorSuggestions').where('referralCode', '==', referralCode).limit(1).get();
    const suggestion = referrals.docs[0];
    if (suggestion) {
      await suggestion.ref.set({
        status: 'joined',
        claimedByUserId: identity.uid,
        claimedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      await accountRef(identity.uid).set({
        creatorReferralCode: referralCode,
        creatorReferralSuggestionId: suggestion.id,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }
  }

  return {
    userId: identity.uid,
    role: professionalRequest ? (cleanText(current.role, 30) || 'listener') : 'listener',
    requestedProfessionalRole: professionalRequest ? requestedRole : null,
    status,
  };
});

const cleanText = (value: unknown, maxLength: number) =>
  String(value ?? '').trim().slice(0, maxLength);

const validPublicUrl = (value: unknown) => {
  const raw = cleanText(value, 500);
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    return ['http:','https:'].includes(parsed.protocol) ? parsed.toString() : null;
  } catch {
    return null;
  }
};

export const submitCreatorSuggestion = onCall({ region: REGION }, async (request) => {
  const identity = await requireActiveIdentity(request);
  await requireAgeVerified(identity.uid);
  const input = (request.data ?? {}) as Record<string, unknown>;
  const creatorName = cleanText(input.creatorName, 120);
  const publicUrl = validPublicUrl(input.publicUrl);
  const note = cleanText(input.note, 1200);
  if (!creatorName) throw new HttpsError('invalid-argument', 'Creator name is required.');
  if (cleanText(input.publicUrl, 500) && !publicUrl) throw new HttpsError('invalid-argument', 'Creator link must be a valid http or https URL.');

  const profile = await profileRef(identity.uid).get();
  const ref = db.collection('creatorSuggestions').doc();
  const referralCode = randomUUID().replace(/-/g, '').slice(0, 14);
  await ref.set({
    creatorName,
    publicUrl,
    note: note || null,
    submittedByUserId: identity.uid,
    submittedByName: profile.data()?.displayName ?? identity.email.split('@')[0],
    submittedByHandle: profile.data()?.handle ?? null,
    referralCode,
    status: 'new',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return {
    suggestion: {
      id: ref.id,
      creatorName,
      publicUrl,
      status: 'new',
      referralCode,
      recommendationPath: '/account?entry=register&role=creator&ref=' + encodeURIComponent(referralCode),
    },
  };
});

export const listCreatorSuggestions = onCall({ region: REGION }, async (request) => {
  requireAdminIdentity(request);
  const snapshot = await db.collection('creatorSuggestions').limit(500).get();
  const suggestions = snapshot.docs
    .map((doc) => {
      const data = doc.data() ?? {};
      return {
        id: doc.id,
        creatorName: cleanText(data.creatorName, 120),
        publicUrl: validPublicUrl(data.publicUrl),
        note: cleanText(data.note, 1200) || null,
        submittedByUserId: cleanText(data.submittedByUserId, 160) || null,
        submittedByName: cleanText(data.submittedByName, 120) || 'Nightjar member',
        submittedByHandle: cleanText(data.submittedByHandle, 120) || null,
        referralCode: cleanText(data.referralCode, 80) || null,
        status: cleanText(data.status, 40) || 'new',
        claimedByUserId: cleanText(data.claimedByUserId, 160) || null,
        createdAt: toIso(data.createdAt),
        updatedAt: toIso(data.updatedAt),
      };
    })
    .sort((a,b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')));
  return { suggestions };
});

export const reviewCreatorSuggestion = onCall({ region: REGION }, async (request) => {
  const admin = requireAdminIdentity(request);
  const input = (request.data ?? {}) as Record<string, unknown>;
  const suggestionId = cleanText(input.suggestionId, 160);
  const status = cleanText(input.status, 40);
  if (!suggestionId) throw new HttpsError('invalid-argument', 'Creator suggestion is required.');
  if (!['new','contacted','invited','joined','dismissed'].includes(status)) {
    throw new HttpsError('invalid-argument', 'Creator suggestion status is invalid.');
  }
  const ref = db.collection('creatorSuggestions').doc(suggestionId);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new HttpsError('not-found', 'Creator suggestion not found.');
  await ref.set({
    status,
    reviewedBy: admin.uid,
    reviewedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  return { suggestionId, status };
});

export const creatorRecommendationLink = onCall({ region: REGION }, async (request) => {
  const identity = await requireActiveIdentity(request);
  await requireAgeVerified(identity.uid);
  const targetCreatorUserId = cleanText((request.data as Record<string, unknown> | undefined)?.targetCreatorUserId, 160);
  if (!targetCreatorUserId) throw new HttpsError('invalid-argument', 'Creator is required.');
  const target = await accountRef(targetCreatorUserId).get();
  if (!target.exists || target.data()?.role !== 'creator' || target.data()?.status !== 'active') {
    throw new HttpsError('not-found', 'Active Nightjar Creator not found.');
  }
  const code = createHash('sha256').update(identity.uid + '\u0000' + targetCreatorUserId).digest('hex').slice(0, 14);
  await db.collection('creatorRecommendations').doc(code).set({
    code,
    recommenderUserId: identity.uid,
    targetCreatorUserId,
    updatedAt: FieldValue.serverTimestamp(),
    createdAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  return { path: '/people/' + encodeURIComponent(targetCreatorUserId) + '?recommend=' + encodeURIComponent(code), code };
});


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
    && professionalRolesForAccount(accountData).includes('creator')
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

const cleanEditorExperienceYears = (value: unknown) => {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.min(60, Math.max(0, Math.floor(parsed)))
    : null;
};

const cleanEditorSkillLevels = (value: unknown, selectedSkills: unknown) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const allowedLevels = new Set(['Learning', 'Comfortable', 'Experienced', 'Specialist']);
  const allowedSkills = new Set(cleanStringList(selectedSkills, 30));
  if (!allowedSkills.size) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .slice(0, 30)
      .map(([skill, level]) => [cleanText(skill, 100), cleanText(level, 32)] as const)
      .filter(([skill, level]) => Boolean(skill) && allowedSkills.has(skill) && allowedLevels.has(level)),
  );
};

const roleProfileSlice = (data: Record<string, any>, role: string) => {
  const stored = data.roleProfiles && typeof data.roleProfiles === 'object' && data.roleProfiles[role] && typeof data.roleProfiles[role] === 'object'
    ? data.roleProfiles[role]
    : null;
  if (stored) {
    return {
      roleFocus: Array.isArray(stored.roleFocus) ? stored.roleFocus : [],
      roleSpecialties: Array.isArray(stored.roleSpecialties) ? stored.roleSpecialties : [],
      roleSecondary: Array.isArray(stored.roleSecondary) ? stored.roleSecondary : [],
      roleAvailability: cleanText(stored.roleAvailability, 100),
      roleHeadline: cleanText(stored.roleHeadline, 140),
      roleBio: cleanText(stored.roleBio, 1200),
      roleDetailOne: cleanText(stored.roleDetailOne, 600),
      roleDetailTwo: cleanText(stored.roleDetailTwo, 600),
      portfolioNote: cleanText(stored.portfolioNote, 400),
      featuredPortfolioIds: cleanStringList(stored.featuredPortfolioIds, 6),
      editorSoftware: cleanStringList(stored.editorSoftware, 16),
      editorProjectTypes: cleanStringList(stored.editorProjectTypes, 16),
      editorDeliveryFormats: cleanStringList(stored.editorDeliveryFormats, 16),
      editorCollaborationPreferences: cleanStringList(stored.editorCollaborationPreferences, 16),
      editorTurnaround: cleanText(stored.editorTurnaround, 80),
      editorExperienceYears: cleanEditorExperienceYears(stored.editorExperienceYears),
      editorSkillLevels: cleanEditorSkillLevels(stored.editorSkillLevels, stored.roleSpecialties),
      creatorLanguages: cleanStringList(stored.creatorLanguages, 12),
      creatorDirectionModes: cleanStringList(stored.creatorDirectionModes, 12),
      creatorDeliveryFormats: cleanStringList(stored.creatorDeliveryFormats, 12),
      creatorTurnaround: cleanText(stored.creatorTurnaround, 80),
      creatorEquipment: cleanText(stored.creatorEquipment, 300),
      writerScriptLengths: cleanStringList(stored.writerScriptLengths, 12),
      writerCollaborationPreferences: cleanStringList(stored.writerCollaborationPreferences, 12),
      writerTurnaround: cleanText(stored.writerTurnaround, 80),
      writerRightsNote: cleanText(stored.writerRightsNote, 500),
      artistMediums: cleanStringList(stored.artistMediums, 12),
      artistDeliveryFormats: cleanStringList(stored.artistDeliveryFormats, 12),
      artistTurnaround: cleanText(stored.artistTurnaround, 80),
      artistSoftware: cleanStringList(stored.artistSoftware, 12),
      listenerCommunityStyle: cleanStringList(stored.listenerCommunityStyle, 12),
    };
  }
  return {
    roleFocus: Array.isArray(data.roleFocus) ? data.roleFocus : [],
    roleSpecialties: Array.isArray(data.roleSpecialties) ? data.roleSpecialties : [],
    roleSecondary: Array.isArray(data.roleSecondary) ? data.roleSecondary : [],
    roleAvailability: cleanText(data.roleAvailability, 100),
    roleHeadline: cleanText(data.roleHeadline, 140),
    roleBio: cleanText(data.roleBio, 1200),
    roleDetailOne: cleanText(data.roleDetailOne, 600),
    roleDetailTwo: cleanText(data.roleDetailTwo, 600),
    portfolioNote: cleanText(data.portfolioNote, 400),
    featuredPortfolioIds: cleanStringList(data.featuredPortfolioIds, 6),
    editorSoftware: cleanStringList(data.editorSoftware, 16),
    editorProjectTypes: cleanStringList(data.editorProjectTypes, 16),
    editorDeliveryFormats: cleanStringList(data.editorDeliveryFormats, 16),
    editorCollaborationPreferences: cleanStringList(data.editorCollaborationPreferences, 16),
    editorTurnaround: cleanText(data.editorTurnaround, 80),
    editorExperienceYears: cleanEditorExperienceYears(data.editorExperienceYears),
    editorSkillLevels: cleanEditorSkillLevels(data.editorSkillLevels, data.roleSpecialties),
    creatorLanguages: cleanStringList(data.creatorLanguages, 12),
    creatorDirectionModes: cleanStringList(data.creatorDirectionModes, 12),
    creatorDeliveryFormats: cleanStringList(data.creatorDeliveryFormats, 12),
    creatorTurnaround: cleanText(data.creatorTurnaround, 80),
    creatorEquipment: cleanText(data.creatorEquipment, 300),
    writerScriptLengths: cleanStringList(data.writerScriptLengths, 12),
    writerCollaborationPreferences: cleanStringList(data.writerCollaborationPreferences, 12),
    writerTurnaround: cleanText(data.writerTurnaround, 80),
    writerRightsNote: cleanText(data.writerRightsNote, 500),
    artistMediums: cleanStringList(data.artistMediums, 12),
    artistDeliveryFormats: cleanStringList(data.artistDeliveryFormats, 12),
    artistTurnaround: cleanText(data.artistTurnaround, 80),
    artistSoftware: cleanStringList(data.artistSoftware, 12),
    listenerCommunityStyle: cleanStringList(data.listenerCommunityStyle, 12),
  };
};

export const getMyProfile = onCall({ region: REGION }, async (request) => {
  const identity = await requireActiveIdentity(request);
  const [snapshot, accountSnapshot] = await Promise.all([
    profileRef(identity.uid).get(),
    accountRef(identity.uid).get(),
  ]);
  if (!snapshot.exists) return { profile:null };
  const data = snapshot.data() ?? {};
  const activeRole = identity.admin ? 'admin' : cleanText(accountSnapshot.data()?.role, 30) || 'listener';
  return {
    profile: {
      ...data,
      ...roleProfileSlice(data, activeRole),
      activeRole,
      roles: identity.admin ? ['admin'] : ['listener', ...professionalRolesForAccount(accountSnapshot.data() ?? {})],
    },
  };
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


const releaseCreditMatchesProfileRole = (creditRole: unknown, profileRole: string) => {
  const role = cleanText(creditRole, 80);
  if (profileRole === 'writer') return role === 'Writer';
  if (profileRole === 'editor') return ['Audio Editor','Sound Designer','Producer'].includes(role);
  return false;
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
      .filter((doc) => normaliseReleaseContributors(doc.data().contributors).some((credit) =>
        credit.userId === userId && releaseCreditMatchesProfileRole(credit.role, role)))
      .map((doc) => {
        const credit = normaliseReleaseContributors(doc.data().contributors).find((item) =>
          item.userId === userId && releaseCreditMatchesProfileRole(item.role, role));
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

  if (role === 'artist') {
    const items = await publicArtistPortfolioFor(userId);
    return items.map((item) => ({
      id: item.id,
      type: 'artwork',
      title: item.title || 'Untitled artwork',
      subtitle: [item.commissionType, ...(item.tags ?? []).slice(0, 2)].filter(Boolean).join(' · '),
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
  const accountData = account.data() ?? {};
  const requestedRole = cleanText((request.data as Record<string, unknown> | undefined)?.profileRole, 30);
  const approvedRoles = professionalRolesForAccount(accountData);
  const fallbackRole = cleanText(accountData.role, 30) || 'listener';
  const role = identity.admin ? 'admin' : (requestedRole || fallbackRole);
  if (!identity.admin && role !== 'listener' && !approvedRoles.includes(role as AccountRole)) {
    throw new HttpsError('permission-denied', 'That professional profile role has not been approved for this account.');
  }
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
  const accountData = accountSnapshot.data() ?? {};
  const approvedRoles = professionalRolesForAccount(accountData);
  const requestedProfileRole = cleanText(input.profileRole, 30);
  const fallbackProfileRole = cleanText(accountData.role, 30) || 'listener';
  const profileRole = identity.admin ? 'admin' : (requestedProfileRole || fallbackProfileRole);
  if (!identity.admin && profileRole !== 'listener' && !approvedRoles.includes(profileRole as AccountRole)) {
    throw new HttpsError('permission-denied', 'That professional profile role has not been approved for this account.');
  }
  const profileStatus = identity.admin ? 'active' : String(accountData.status ?? '');
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
    roleHeadline: cleanText(input.roleHeadline, 140),
    roleBio: cleanText(input.roleBio, 1200),
    roleDetailOne: cleanText(input.roleDetailOne, 600),
    roleDetailTwo: cleanText(input.roleDetailTwo, 600),
    portfolioNote: cleanText(input.portfolioNote, 400),
    featuredPortfolioIds,
    editorSoftware: cleanStringList(input.editorSoftware, 16),
    editorProjectTypes: cleanStringList(input.editorProjectTypes, 16),
    editorDeliveryFormats: cleanStringList(input.editorDeliveryFormats, 16),
    editorCollaborationPreferences: cleanStringList(input.editorCollaborationPreferences, 16),
    editorTurnaround: cleanText(input.editorTurnaround, 80),
    editorExperienceYears: cleanEditorExperienceYears(input.editorExperienceYears),
    editorSkillLevels: cleanEditorSkillLevels(input.editorSkillLevels, input.roleSpecialties),
    creatorLanguages: cleanStringList(input.creatorLanguages, 12),
    creatorDirectionModes: cleanStringList(input.creatorDirectionModes, 12),
    creatorDeliveryFormats: cleanStringList(input.creatorDeliveryFormats, 12),
    creatorTurnaround: cleanText(input.creatorTurnaround, 80),
    creatorEquipment: cleanText(input.creatorEquipment, 300),
    writerScriptLengths: cleanStringList(input.writerScriptLengths, 12),
    writerCollaborationPreferences: cleanStringList(input.writerCollaborationPreferences, 12),
    writerTurnaround: cleanText(input.writerTurnaround, 80),
    writerRightsNote: cleanText(input.writerRightsNote, 500),
    artistMediums: cleanStringList(input.artistMediums, 12),
    artistDeliveryFormats: cleanStringList(input.artistDeliveryFormats, 12),
    artistTurnaround: cleanText(input.artistTurnaround, 80),
    artistSoftware: cleanStringList(input.artistSoftware, 12),
    listenerCommunityStyle: cleanStringList(input.listenerCommunityStyle, 12),
    publicProfile: profileRole === 'admin' ? false : input.publicProfile !== false,
    onboardingComplete: input.onboardingComplete === true,
    onboardingVersion: Math.max(0, Math.floor(Number(input.onboardingVersion ?? 1))),
    updatedAt: FieldValue.serverTimestamp(),
  };

  const activeWorkspaceRole = identity.admin ? 'admin' : fallbackProfileRole;
  const roleCompatibilityFields = new Set([
    'roleFocus','roleSpecialties','roleSecondary','roleAvailability','roleHeadline','roleBio','roleDetailOne','roleDetailTwo',
    'portfolioNote','featuredPortfolioIds','editorSoftware','editorProjectTypes','editorDeliveryFormats','editorCollaborationPreferences',
    'editorTurnaround','editorExperienceYears','editorSkillLevels','creatorLanguages','creatorDirectionModes','creatorDeliveryFormats',
    'creatorTurnaround','creatorEquipment','writerScriptLengths','writerCollaborationPreferences','writerTurnaround','writerRightsNote',
    'artistMediums','artistDeliveryFormats','artistTurnaround','artistSoftware','listenerCommunityStyle',
  ]);
  const topLevelProfileWrite = Object.fromEntries(
    Object.entries(nextProfile).filter(([key]) => profileRole === activeWorkspaceRole || !roleCompatibilityFields.has(key)),
  );

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

    const currentProfileData = currentProfile.data() ?? {};
    const roleProfiles = currentProfileData.roleProfiles && typeof currentProfileData.roleProfiles === 'object'
      ? { ...currentProfileData.roleProfiles }
      : {};
    if (profileRole && profileRole !== 'admin') {
      roleProfiles[profileRole] = {
        roleFocus: nextProfile.roleFocus,
        roleSpecialties: nextProfile.roleSpecialties,
        roleSecondary: nextProfile.roleSecondary,
        roleAvailability: nextProfile.roleAvailability,
        roleHeadline: nextProfile.roleHeadline,
        roleBio: nextProfile.roleBio,
        roleDetailOne: nextProfile.roleDetailOne,
        roleDetailTwo: nextProfile.roleDetailTwo,
        portfolioNote: nextProfile.portfolioNote,
        featuredPortfolioIds: nextProfile.featuredPortfolioIds,
        ...(profileRole === 'editor' ? {
          editorSoftware: nextProfile.editorSoftware,
          editorProjectTypes: nextProfile.editorProjectTypes,
          editorDeliveryFormats: nextProfile.editorDeliveryFormats,
          editorCollaborationPreferences: nextProfile.editorCollaborationPreferences,
          editorTurnaround: nextProfile.editorTurnaround,
          editorExperienceYears: nextProfile.editorExperienceYears,
          editorSkillLevels: nextProfile.editorSkillLevels,
        } : {}),
        ...(profileRole === 'creator' ? {
          creatorLanguages: nextProfile.creatorLanguages,
          creatorDirectionModes: nextProfile.creatorDirectionModes,
          creatorDeliveryFormats: nextProfile.creatorDeliveryFormats,
          creatorTurnaround: nextProfile.creatorTurnaround,
          creatorEquipment: nextProfile.creatorEquipment,
        } : {}),
        ...(profileRole === 'writer' ? {
          writerScriptLengths: nextProfile.writerScriptLengths,
          writerCollaborationPreferences: nextProfile.writerCollaborationPreferences,
          writerTurnaround: nextProfile.writerTurnaround,
          writerRightsNote: nextProfile.writerRightsNote,
        } : {}),
        ...(profileRole === 'artist' ? {
          artistMediums: nextProfile.artistMediums,
          artistDeliveryFormats: nextProfile.artistDeliveryFormats,
          artistTurnaround: nextProfile.artistTurnaround,
          artistSoftware: nextProfile.artistSoftware,
        } : {}),
        ...(profileRole === 'listener' ? {
          listenerCommunityStyle: nextProfile.listenerCommunityStyle,
        } : {}),
      };
    }

    transaction.set(targetProfileRef, {
      ...topLevelProfileWrite,
      roleProfiles,
      ...(currentProfile.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
    }, { merge: true });
  });

  if (profileStatus === 'active' && approvedRoles.includes('creator')) {
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
  const savedData = saved.data() ?? {};
  return {
    profile: {
      ...savedData,
      ...roleProfileSlice(savedData, profileRole || 'listener'),
      activeRole: profileRole || 'listener',
      roles: identity.admin ? ['admin'] : ['listener', ...approvedRoles],
    },
  };
});

const publicProfilePayload = (
  userId: string,
  accountData: Record<string, any>,
  data: Record<string, any> | undefined,
) => {
  if (!data || data.publicProfile === false) return null;
  const roles = professionalRolesForAccount(accountData);
  const activeRole = cleanText(accountData.role, 30);
  const publicRole = activeRole === 'listener' || roles.includes(activeRole as AccountRole)
    ? activeRole
    : (roles[0] ?? 'listener');
  return {
    userId,
    role: publicRole,
    roles: ['listener', ...roles],
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
    roleProfiles: data.roleProfiles && typeof data.roleProfiles === 'object' ? data.roleProfiles : {},
    ...roleProfileSlice(data, publicRole),
  };
};

const publicProfileForAccount = async (account: QueryDocumentSnapshot) => {
  const profile = await profileRef(account.id).get();
  return publicProfilePayload(account.id, account.data() ?? {}, profile.data());
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
  const [accounts, profilesSnapshot, releases, listening] = await Promise.all([
    db.collection('accounts').limit(1000).get(),
    db.collection('profiles').limit(1000).get(),
    db.collection('releases').where('status', '==', 'released').limit(1000).get(),
    db.collection('listeningEvents').limit(5000).get(),
  ]);
  const profileByUser = new Map(profilesSnapshot.docs.map((doc) => [doc.id, doc.data() ?? {}]));

  const releaseCounts = new Map<string, number>();
  for (const release of releases.docs) {
    const creatorUserId = cleanText(release.data().creatorUserId, 160);
    if (creatorUserId) releaseCounts.set(creatorUserId, (releaseCounts.get(creatorUserId) ?? 0) + 1);
  }

  const verified = calculateVerifiedListening(listening.docs.map((doc) => doc.data()));

  const creators = accounts.docs
    .filter((doc) => doc.data().status === 'active' && professionalRolesForAccount(doc.data() ?? {}).includes('creator'))
    .map((doc) => {
      const profileData = profileByUser.get(doc.id) ?? {};
      const base = publicProfilePayload(doc.id, doc.data() ?? {}, profileData);
      if (!base) return null;
      const seconds = verified.byCreator.get(doc.id) ?? 0;
      return {
        ...base,
        ...roleProfileSlice(profileData, 'creator'),
        role: 'creator',
        followerCount: Number((base as any).followerCount ?? 0),
        releaseCount: releaseCounts.get(doc.id) ?? 0,
        verifiedListeningMinutes: Math.round((seconds / 60) * 10) / 10,
        listeningSharePercent: verified.totalSeconds > 0
          ? Math.round((seconds / verified.totalSeconds) * 1000) / 10
          : 0,
      };
    })
    .filter(Boolean);

  return { creators };
});

export const listPublicProfiles = onCall({ region: REGION }, async (request) => {
  const identity = await requireActiveIdentity(request);
  await requireAgeVerified(identity.uid);

  const [accounts, profilesSnapshot, releases, scripts, collaborations] = await Promise.all([
    db.collection('accounts').limit(1000).get(),
    db.collection('profiles').limit(1000).get(),
    db.collection('releases').where('status', '==', 'released').limit(1000).get(),
    db.collection('scripts').limit(1000).get(),
    db.collection('collaborationProposals').limit(1000).get(),
  ]);
  const profileByUser = new Map(profilesSnapshot.docs.map((doc) => [doc.id, doc.data() ?? {}]));

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

  const allowedRoles = new Set(['creator','writer','editor','artist','listener']);
  const profiles = (await Promise.all(accounts.docs
    .filter((doc) => doc.data().status === 'active' && (allowedRoles.has(String(doc.data().role ?? '')) || professionalRolesForAccount(doc.data() ?? {}).length > 0))
    .map(async (doc) => {
      const data = profileByUser.get(doc.id);
      if (!data || data.publicProfile === false) return null;
      const accountData = doc.data() ?? {};
      const professionalRoles = professionalRolesForAccount(accountData);
      const activeRole = cleanText(accountData.role, 30);
      const role = activeRole === 'listener' || professionalRoles.includes(activeRole as AccountRole)
        ? activeRole
        : (professionalRoles[0] ?? 'listener');
      const roleSlice = roleProfileSlice(data, role);
      const releaseCount = releaseCountByCreator.get(doc.id) ?? 0;
      const publishedWorkCount = publishedScriptsByWriter.get(doc.id) ?? 0;
      const creditedReleaseCount = creditCountByUser.get(doc.id) ?? 0;
      const completedCollaborations = collaborationCountByUser.get(doc.id) ?? 0;
      return {
        userId: doc.id,
        role,
        roles: ['listener', ...professionalRoles],
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
        roleProfiles: data.roleProfiles && typeof data.roleProfiles === 'object' ? data.roleProfiles : {},
        ...roleSlice,
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

  const professionalRoles = professionalRolesForAccount(accountData ?? {});
  const activePublicRole = cleanText(accountData?.role, 30);
  const role = activePublicRole === 'listener' || professionalRoles.includes(activePublicRole as AccountRole)
    ? activePublicRole
    : (professionalRoles[0] ?? 'listener');
  const viewerSubscription = identity.admin ? null : await activeListeningSubscriptionFor(identity.uid);
  const followingSnapshot = await accountRef(userId).collection('follows').limit(500).get();
  let publishedWorkCount = 0;
  let releaseCount = 0;
  let creatorReleases: ReturnType<typeof releasePayload>[] = [];
  let creditedReleases: ReturnType<typeof releasePayload>[] = [];
  let publicPlaylists: Array<{ id: string; title: string; releaseCount: number; releases: ReturnType<typeof releasePayload>[] }> = [];

  if (professionalRoles.includes('creator')) {
    const releases = await db.collection('releases').where('creatorUserId', '==', userId).limit(500).get();
    creatorReleases = releases.docs
      .filter((doc) => doc.data().status === 'released')
      .map((doc) => decorateReleaseAccess(doc.data(), doc.id, identity.uid, { admin:identity.admin, subscription:viewerSubscription }))
      .sort((a, b) => String(b.releaseDate ?? '').localeCompare(String(a.releaseDate ?? '')));
    releaseCount = creatorReleases.length;
  }
  if (professionalRoles.includes('writer')) {
    const scripts = await db.collection('scripts').where('writerUserId', '==', userId).limit(500).get();
    publishedWorkCount = scripts.docs.filter((doc) => ['Approved','Published'].includes(String(doc.data().status))).length;
  }

  if (professionalRoles.includes('writer') || professionalRoles.includes('editor')) {
    const releases = await db.collection('releases').where('status', '==', 'released').limit(500).get();
    creditedReleases = releases.docs
      .filter((doc) => normaliseReleaseContributors(doc.data().contributors).some((credit) => credit.userId === userId))
      .map((doc) => decorateReleaseAccess(doc.data(), doc.id, identity.uid, { admin:identity.admin, subscription:viewerSubscription }))
      .sort((a, b) => String(b.releaseDate ?? '').localeCompare(String(a.releaseDate ?? '')));
  }

  const publicRoleProfiles = data.roleProfiles && typeof data.roleProfiles === 'object' ? data.roleProfiles : {};
  const listenerFeaturedIds = cleanStringList(
    publicRoleProfiles.listener?.featuredPortfolioIds ?? (!professionalRoles.length ? data.featuredPortfolioIds : []),
    6,
  );
  if (listenerFeaturedIds.length) {
    const playlistDocs = await Promise.all(
      listenerFeaturedIds.map((playlistId) => accountRef(userId).collection('playlists').doc(playlistId).get()),
    );
    publicPlaylists = await Promise.all(playlistDocs
      .filter((playlist) => playlist.exists)
      .map(async (playlist) => {
        const releaseIds = cleanStringList(playlist.data()?.releaseIds, 50);
        const releaseDocs = await Promise.all(releaseIds.slice(0, 12).map((releaseId) => releaseRef(releaseId).get()));
        const releases = releaseDocs
          .filter((release) => release.exists && release.data()?.status === 'released')
          .map((release) => decorateReleaseAccess(release.data() ?? {}, release.id, identity.uid, { admin:identity.admin, subscription:viewerSubscription }));
        return {
          id: playlist.id,
          title: cleanText(playlist.data()?.title, 100) || 'Untitled playlist',
          releaseCount: releaseIds.length,
          releases,
        };
      }));
  }

  const roleProfiles = publicRoleProfiles;
  const rolePortfolioIds = (targetRole: string) => cleanStringList(
    roleProfiles[targetRole]?.featuredPortfolioIds ?? (targetRole === role ? data.featuredPortfolioIds : []),
    6,
  );
  const selectedPortfolioIds = rolePortfolioIds(role);
  const orderForRole = <T extends { id: string }>(items: T[], targetRole: string) => {
    const ids = rolePortfolioIds(targetRole);
    if (!ids.length) return items.slice(0, 3);
    const byId = new Map(items.map((item) => [String(item.id), item]));
    return ids.map((id) => byId.get(id)).filter((item): item is T => Boolean(item));
  };
  const featuredWork = role === 'creator'
    ? orderForRole(creatorReleases, 'creator')
    : (role === 'writer' || role === 'editor')
      ? orderForRole(creditedReleases, role)
      : [];
  const creditedReleasesByRole = {
    writer: creditedReleases.filter((release: any) =>
      (release.contributors ?? []).some((credit: any) =>
        credit.userId === userId && releaseCreditMatchesProfileRole(credit.role, 'writer'))),
    editor: creditedReleases.filter((release: any) =>
      (release.contributors ?? []).some((credit: any) =>
        credit.userId === userId && releaseCreditMatchesProfileRole(credit.role, 'editor'))),
  };
  const featuredWorkByRole = {
    creator: orderForRole(creatorReleases, 'creator'),
    writer: orderForRole(creditedReleasesByRole.writer, 'writer'),
    editor: orderForRole(creditedReleasesByRole.editor, 'editor'),
  };

  const [completedCollaborations, publicArtistPortfolio, publicEditorPortfolio, publicWriterPortfolio] = await Promise.all([
    professionalRoles.length > 0 ? completedCollaborationCountFor(userId) : Promise.resolve(0),
    professionalRoles.includes('artist') ? publicArtistPortfolioFor(userId) : Promise.resolve([]),
    professionalRoles.includes('editor') ? publicEditorPortfolioFor(userId) : Promise.resolve([]),
    professionalRoles.includes('writer') ? publicWriterPortfolioFor(userId) : Promise.resolve([]),
  ]);
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
      roles: ['listener', ...professionalRoles],
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
      roleProfiles: data.roleProfiles && typeof data.roleProfiles === 'object' ? data.roleProfiles : {},
      featuredPortfolioIds: selectedPortfolioIds,
      featuredWork,
      featuredWorkByRole,
      creditedReleasesByRole,
      artistPortfolio: publicArtistPortfolio,
      editorPortfolio: publicEditorPortfolio,
      writerPortfolio: publicWriterPortfolio,
      featuredArtistPortfolio: role === 'artist'
        ? (() => {
            const ids = rolePortfolioIds('artist');
            if (!ids.length) return publicArtistPortfolio.slice(0, 6);
            const byId = new Map(publicArtistPortfolio.map((item) => [String(item.id), item]));
            return ids.map((id) => byId.get(id)).filter(Boolean);
          })()
        : [],
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
  if (!account.exists || account.data()?.status !== 'active' || !professionalRolesForAccount(account.data() ?? {}).includes('creator')) {
    throw new HttpsError('not-found', 'Creator profile not found.');
  }

  const profile = await profileRef(creatorUserId).get();
  const data = profile.data();
  if (!data || data.publicProfile === false) throw new HttpsError('not-found', 'Creator profile not found.');
  const viewerSubscription = identity.admin ? null : await activeListeningSubscriptionFor(identity.uid);

  const releasesSnapshot = await db.collection('releases').where('creatorUserId', '==', creatorUserId).limit(500).get();
  const releases = releasesSnapshot.docs
    .filter((doc) => doc.data().status === 'released')
    .map((doc) => decorateReleaseAccess(doc.data(), doc.id, identity.uid, { admin:identity.admin, subscription:viewerSubscription }))
    .sort((a, b) => String(b.releaseDate ?? '').localeCompare(String(a.releaseDate ?? '')));

  const completedCollaborations = await completedCollaborationCountFor(creatorUserId);
  const creatorRoleProfile = roleProfileSlice(data, 'creator');

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
      ...creatorRoleProfile,
      featuredReleases: (() => {
        const storedCreatorProfile = data.roleProfiles && typeof data.roleProfiles === 'object' && data.roleProfiles.creator && typeof data.roleProfiles.creator === 'object'
          ? data.roleProfiles.creator
          : null;
        const hasPortfolioCuration = storedCreatorProfile
          ? Array.isArray(storedCreatorProfile.featuredPortfolioIds)
          : Array.isArray(data.featuredPortfolioIds);
        const selected = cleanStringList(creatorRoleProfile.featuredPortfolioIds, 6);
        const byId = new Map(releases.map((release) => [String(release.id), release]));
        return hasPortfolioCuration
          ? selected.flatMap((id) => {
              const release = byId.get(id);
              return release ? [release] : [];
            })
          : releases.slice(0, 3);
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
  const accounts = await db.collection('accounts').limit(1000).get();
  const writers = (await Promise.all(
    accounts.docs
      .filter((doc) => doc.data().status === 'active' && professionalRolesForAccount(doc.data() ?? {}).includes('writer'))
      .map(async (doc) => {
        const base = await publicProfileForAccount(doc);
        if (!base) return null;
        const writerProfile = await profileRef(doc.id).get();
        const writerData = writerProfile.data() ?? {};
        const scripts = await db.collection('scripts').where('writerUserId', '==', doc.id).limit(500).get();
        const publishedWorkCount = scripts.docs.filter((script) => ['Approved','Published'].includes(String(script.data().status))).length;
        return { ...base, ...roleProfileSlice(writerData, 'writer'), role:'writer', publishedWorkCount };
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
  if (!target.exists || target.data()?.status !== 'active' || !professionalRolesForAccount(target.data() ?? {}).includes('creator') || !profile.exists || profile.data()?.publicProfile === false) {
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

type ModeratedImageKind = 'profile_avatar' | 'brand_logo' | 'release_artwork' | 'artist_portfolio';

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

const decodeExactBrandPng = (dataUrl: unknown, expectedSize: number, label: string) => {
  const match = String(dataUrl ?? '').match(/^data:image\/png;base64,(.+)$/s);
  if (!match) throw new HttpsError('invalid-argument', label + ' must be a PNG data URL.');
  const buffer = Buffer.from(match[1], 'base64');
  const signature = buffer.length >= 24 && buffer.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]));
  if (!signature || buffer.length > 4 * 1024 * 1024) throw new HttpsError('invalid-argument', label + ' is not a valid PNG.');
  if (buffer.readUInt32BE(16) !== expectedSize || buffer.readUInt32BE(20) !== expectedSize) throw new HttpsError('invalid-argument', label + ' must be exactly ' + expectedSize + '×' + expectedSize + ' pixels.');
  return buffer;
};

const clearBrandingIconFiles = async (branding: Record<string, unknown>) => {
  const paths = [cleanText(branding.icon192Path,500),cleanText(branding.icon512Path,500),cleanText(branding.maskable512Path,500)].filter(Boolean);
  await Promise.all(paths.map(async (path) => { try { await getStorage().bucket().file(path).delete({ignoreNotFound:true}); } catch { /* non-blocking cleanup */ } }));
};

export const submitImageAsset = onCall({ region: REGION }, async (request) => {
  const identity = await requireActiveIdentity(request);
  const input = (request.data ?? {}) as Record<string, unknown>;
  const kind = cleanText(input.kind, 40) as ModeratedImageKind;
  if (!['profile_avatar', 'brand_logo', 'release_artwork', 'artist_portfolio'].includes(kind)) {
    throw new HttpsError('invalid-argument', 'Unsupported image type.');
  }
  if (kind === 'brand_logo' && !identity.admin) {
    throw new HttpsError('permission-denied', 'Administrator access required for Nightjar branding.');
  }

  const targetId = kind === 'profile_avatar'
    ? identity.uid
    : cleanText(input.targetId, 160);

  if ((kind === 'release_artwork' || kind === 'artist_portfolio') && !targetId) {
    throw new HttpsError('invalid-argument', kind === 'artist_portfolio' ? 'Artist portfolio artwork requires a portfolio item ID.' : 'Release artwork requires a release ID.');
  }

  if (kind === 'artist_portfolio') {
    const [account, portfolioItem] = await Promise.all([
      accountRef(identity.uid).get(),
      db.collection('artistPortfolio').doc(targetId).get(),
    ]);
    if (!professionalRolesForAccount(account.data() ?? {}).includes('artist') || account.data()?.status !== 'active') {
      throw new HttpsError('permission-denied', 'Approved Artist access is required to upload portfolio artwork.');
    }
    if (!portfolioItem.exists || portfolioItem.data()?.ownerUserId !== identity.uid) {
      throw new HttpsError('not-found', 'Artist portfolio item not found.');
    }
  }

  if (kind === 'release_artwork') {
    const release = await db.collection('releases').doc(targetId).get();
    if (!release.exists) throw new HttpsError('not-found', 'Release not found.');
    if (!identity.admin) {
      const account = await accountRef(identity.uid).get();
      if (!professionalRolesForAccount(account.data() ?? {}).includes('creator') || account.data()?.status !== 'active') {
        throw new HttpsError('permission-denied', 'Active VA Creator access required.');
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
  } else if (kind === 'artist_portfolio') {
    const portfolioRef = db.collection('artistPortfolio').doc(targetId);
    const portfolioItem = await portfolioRef.get();
    const previousPendingId = cleanText(portfolioItem.data()?.pendingImageAssetId, 160);
    if (previousPendingId && previousPendingId !== assetId) {
      const previousPending = await db.collection('imageAssets').doc(previousPendingId).get();
      if (previousPending.exists && previousPending.data()?.status === 'pending') {
        await clearAssetFile(previousPending.data() ?? {});
        await previousPending.ref.set({ status:'removed', updatedAt:FieldValue.serverTimestamp() }, { merge:true });
      }
    }
    await portfolioRef.set({
      pendingImageAssetId: assetId,
      pendingImageStatus: 'pending',
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge:true });
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
  response.setHeader('Access-Control-Allow-Origin', '*');
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

export const brandLogoImage = onRequest({ region: REGION }, async (_request, response) => {
  const snap = await db.collection('settings').doc('branding').get();
  const branding = snap.data() ?? {};
  if (branding.logoStatus !== 'approved') { response.status(404).send('Nightjar logo not configured.'); return; }
  const fallbackUrl = validPublicUrl(branding.logoUrl);
  let assetId = cleanText(branding.logoAssetId,160);
  if (!assetId && fallbackUrl) { try { assetId = cleanText(new URL(fallbackUrl).searchParams.get('assetId'),160); } catch {} }
  if (!assetId) { if (fallbackUrl) response.redirect(302,fallbackUrl); else response.status(404).send('Nightjar logo not available.'); return; }
  const assetSnap = await db.collection('imageAssets').doc(assetId).get();
  const asset = assetSnap.data();
  const storagePath = cleanText(asset?.storagePath,500);
  if (!asset || asset.status !== 'approved' || asset.kind !== 'brand_logo' || !storagePath) { if (fallbackUrl) response.redirect(302,fallbackUrl); else response.status(404).send('Nightjar logo not available.'); return; }
  response.setHeader('Content-Type', cleanText(asset.contentType,80) || 'application/octet-stream');
  response.setHeader('Access-Control-Allow-Origin','*');
  response.setHeader('Cache-Control','no-store,max-age=0,must-revalidate');
  response.setHeader('Pragma','no-cache');
  response.setHeader('X-Content-Type-Options','nosniff');
  const stream=getStorage().bucket().file(storagePath).createReadStream();
  stream.on('error',()=>{ if(!response.headersSent && fallbackUrl) response.redirect(302,fallbackUrl); else if(!response.headersSent) response.status(404).send('Nightjar logo not available.'); else response.end(); });
  stream.pipe(response);
});

const streamBrandingIcon = async (field: 'icon192Path'|'icon512Path'|'maskable512Path', response: any) => {
  const snap=await db.collection('settings').doc('branding').get();
  const branding=snap.data()??{};
  const path=branding.logoStatus==='approved' ? cleanText(branding[field],500) : '';
  if(!path){ response.status(404).send('Nightjar app icon not generated yet.'); return; }
  response.setHeader('Content-Type','image/png');
  response.setHeader('Cache-Control','no-store,max-age=0,must-revalidate');
  response.setHeader('Pragma','no-cache');
  response.setHeader('X-Content-Type-Options','nosniff');
  const stream=getStorage().bucket().file(path).createReadStream();
  stream.on('error',()=>{ if(!response.headersSent) response.status(404).send('Nightjar app icon not available.'); else response.end(); });
  stream.pipe(response);
};
export const brandIcon192=onRequest({region:REGION},async(_r,res)=>{await streamBrandingIcon('icon192Path',res);});
export const brandIcon512=onRequest({region:REGION},async(_r,res)=>{await streamBrandingIcon('icon512Path',res);});
export const brandIconMaskable512=onRequest({region:REGION},async(_r,res)=>{await streamBrandingIcon('maskable512Path',res);});

export const syncBrandIconVariants = onCall({region:REGION},async(request)=>{
  const admin=requireAdminIdentity(request);
  const input=(request.data??{}) as Record<string,unknown>;
  const icon192=decodeExactBrandPng(input.icon192DataUrl,192,'192px app icon');
  const icon512=decodeExactBrandPng(input.icon512DataUrl,512,'512px app icon');
  const maskable512=decodeExactBrandPng(input.maskable512DataUrl,512,'512px maskable app icon');
  const ref=db.collection('settings').doc('branding');
  const snap=await ref.get();
  const branding=snap.data()??{};
  if(branding.logoStatus!=='approved'||!validPublicUrl(branding.logoUrl)) throw new HttpsError('failed-precondition','Approve the Nightjar logo before generating install icons.');
  await clearBrandingIconFiles(branding);
  const source=cleanText(branding.logoAssetId,160)||'approved-logo';
  const version=Date.now();
  const icon192Path=`brand-icons/${source}/${version}-192.png`;
  const icon512Path=`brand-icons/${source}/${version}-512.png`;
  const maskable512Path=`brand-icons/${source}/${version}-maskable-512.png`;
  const bucket=getStorage().bucket();
  await Promise.all([
    bucket.file(icon192Path).save(icon192,{resumable:false,contentType:'image/png',metadata:{cacheControl:'no-store,max-age=0'}}),
    bucket.file(icon512Path).save(icon512,{resumable:false,contentType:'image/png',metadata:{cacheControl:'no-store,max-age=0'}}),
    bucket.file(maskable512Path).save(maskable512,{resumable:false,contentType:'image/png',metadata:{cacheControl:'no-store,max-age=0'}}),
  ]);
  await ref.set({icon192Path,icon512Path,maskable512Path,iconVersion:version,iconSourceAssetId:cleanText(branding.logoAssetId,160)||null,iconsGeneratedBy:admin.uid,iconsGeneratedAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()},{merge:true});
  return {updated:true,version};
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
    } else if (asset.kind === 'artist_portfolio' && asset.targetId) {
      const portfolioRef = db.collection('artistPortfolio').doc(String(asset.targetId));
      const portfolio = await portfolioRef.get();
      if (portfolio.exists && portfolio.data()?.pendingImageAssetId === assetId) {
        await portfolioRef.set({
          pendingImageAssetId:null,
          pendingImageStatus:'rejected',
          status:'draft',
          updatedAt:FieldValue.serverTimestamp(),
        }, { merge:true });
      }
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
            : asset.kind === 'artist_portfolio'
              ? 'Portfolio artwork not approved'
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
    const previousBranding = branding.data() ?? {};
    const previousAssetId = cleanText(previousBranding.logoAssetId, 160);
    if (previousAssetId !== assetId) await clearBrandingIconFiles(previousBranding);
    await brandingRef.set({
      logoAssetId: assetId,
      logoUrl: url,
      logoStatus: 'approved',
      pendingLogoAssetId: null,
      pendingLogoStatus: null,
      icon192Path: null,
      icon512Path: null,
      maskable512Path: null,
      iconVersion: null,
      iconSourceAssetId: null,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    if (previousAssetId && previousAssetId !== assetId) {
      const previous = await db.collection('imageAssets').doc(previousAssetId).get();
      if (previous.exists) {
        await clearAssetFile(previous.data() ?? {});
        await previous.ref.set({ status: 'removed', updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      }
    }
  } else if (asset.kind === 'artist_portfolio' && asset.targetId) {
    const portfolioRef = db.collection('artistPortfolio').doc(String(asset.targetId));
    const portfolio = await portfolioRef.get();
    if (!portfolio.exists || portfolio.data()?.ownerUserId !== asset.ownerUserId || portfolio.data()?.pendingImageAssetId !== assetId) {
      await clearAssetFile(asset);
      await ref.set({ status:'removed', publicUrl:null, updatedAt:FieldValue.serverTimestamp() }, { merge:true });
      throw new HttpsError('failed-precondition', 'This image is no longer the pending artwork for the Artist portfolio item.');
    }
    const previousAssetId = cleanText(portfolio.data()?.imageAssetId, 160);
    await portfolioRef.set({
      imageAssetId:assetId,
      imageUrl:url,
      imageStatus:'approved',
      pendingImageAssetId:null,
      pendingImageStatus:null,
      status:'published',
      publishedAt:FieldValue.serverTimestamp(),
      updatedAt:FieldValue.serverTimestamp(),
    }, { merge:true });
    if (previousAssetId && previousAssetId !== assetId) {
      const previous = await db.collection('imageAssets').doc(previousAssetId).get();
      if (previous.exists) {
        await clearAssetFile(previous.data() ?? {});
        await previous.ref.set({ status:'removed', publicUrl:null, updatedAt:FieldValue.serverTimestamp() }, { merge:true });
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
          : asset.kind === 'artist_portfolio'
            ? 'Portfolio artwork approved'
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

  if (asset.kind === 'artist_portfolio' && asset.targetId) {
    const portfolioRef = db.collection('artistPortfolio').doc(String(asset.targetId));
    const portfolio = await portfolioRef.get();
    if (portfolio.exists) {
      const update: Record<string, unknown> = { updatedAt:FieldValue.serverTimestamp() };
      if (portfolio.data()?.pendingImageAssetId === assetId) {
        update.pendingImageAssetId = null;
        update.pendingImageStatus = null;
      }
      if (portfolio.data()?.imageAssetId === assetId) {
        update.imageAssetId = null;
        update.imageUrl = null;
        update.imageStatus = null;
        update.status = 'draft';
      }
      await portfolioRef.set(update, { merge:true });
    }
  }

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
    installIconsReady: Boolean(data.icon192Path && data.icon512Path && data.maskable512Path),
    iconVersion: data.iconVersion ?? null,
    pendingLogoAssetId: null,
  };
});

export const removeBrandLogo = onCall({ region: REGION }, async (request) => {
  requireAdminIdentity(request);
  const ref = db.collection('settings').doc('branding');
  const snapshot = await ref.get();
  const data = snapshot.data() ?? {};
  await clearBrandingIconFiles(data);
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
    icon192Path: null,
    icon512Path: null,
    maskable512Path: null,
    iconVersion: null,
    iconSourceAssetId: null,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  return { removed: true };
});


const artistPortfolioPayload = (data: Record<string, any>, id: string) => ({
  id,
  ownerUserId: cleanText(data.ownerUserId, 160),
  title: cleanText(data.title, 120),
  description: cleanText(data.description, 600),
  tags: cleanStringList(data.tags, 12),
  commissionType: cleanText(data.commissionType, 80) || null,
  status: cleanText(data.status, 30) || 'draft',
  imageUrl: data.imageStatus === 'approved' ? validPublicUrl(data.imageUrl) : null,
  imageStatus: cleanText(data.imageStatus, 30) || null,
  pendingImageAssetId: cleanText(data.pendingImageAssetId, 160) || null,
  pendingImageStatus: cleanText(data.pendingImageStatus, 30) || null,
  createdAt: toIso(data.createdAt),
  publishedAt: toIso(data.publishedAt),
  updatedAt: toIso(data.updatedAt),
});

export const createArtistPortfolioItem = onCall({ region: REGION }, async (request) => {
  const identity = await requireAccountRole(request, ['artist']);
  await requireAgeVerified(identity.uid);
  await requireProfessionalLegalTerms(identity.uid);
  const input = (request.data ?? {}) as Record<string, unknown>;
  const title = cleanText(input.title, 120);
  const description = cleanText(input.description, 600);
  const tags = cleanStringList(input.tags, 12);
  const commissionType = cleanText(input.commissionType, 80);
  const humanCreatedAttestation = input.humanCreatedAttestation === true;
  const rightsConfirmed = input.rightsConfirmed === true;
  const contributorPermissionsConfirmed = input.contributorPermissionsConfirmed === true;
  if (!title) throw new HttpsError('invalid-argument', 'Give the artwork a title.');
  if (!rightsConfirmed || !contributorPermissionsConfirmed) {
    throw new HttpsError('failed-precondition', 'Confirm that you control the rights to publish this artwork and have any required client, subject or collaborator permission.');
  }
  if (!humanCreatedAttestation) throw new HttpsError('failed-precondition', 'Artist portfolio submissions must be your own human-created artwork, not AI-generated imagery.');

  const existing = await db.collection('artistPortfolio').where('ownerUserId','==',identity.uid).limit(40).get();
  if (existing.docs.filter((doc)=>doc.data()?.status !== 'removed').length >= 24) {
    throw new HttpsError('resource-exhausted', 'Artist portfolios can contain up to 24 active pieces.');
  }

  const ref = db.collection('artistPortfolio').doc();
  await ref.set({
    ownerUserId:identity.uid,
    title,
    description,
    tags,
    commissionType:commissionType || null,
    humanCreatedAttestation:true,
    humanCreatedAttestedAt:FieldValue.serverTimestamp(),
    rightsConfirmed:true,
    contributorPermissionsConfirmed:true,
    rightsAttestedAt:FieldValue.serverTimestamp(),
    status:'draft',
    imageAssetId:null,
    imageUrl:null,
    imageStatus:null,
    pendingImageAssetId:null,
    pendingImageStatus:null,
    createdAt:FieldValue.serverTimestamp(),
    updatedAt:FieldValue.serverTimestamp(),
  });
  const saved = await ref.get();
  return { item:artistPortfolioPayload(saved.data() ?? {}, ref.id) };
});

export const myArtistPortfolio = onCall({ region: REGION }, async (request) => {
  const identity = await requireAccountRole(request, ['artist']);
  const snapshot = await db.collection('artistPortfolio').where('ownerUserId','==',identity.uid).limit(40).get();
  return {
    items:snapshot.docs
      .map((doc)=>artistPortfolioPayload(doc.data() ?? {}, doc.id))
      .filter((item)=>item.status !== 'removed')
      .sort((a,b)=>String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? ''))),
  };
});

export const removeArtistPortfolioItem = onCall({ region: REGION }, async (request) => {
  const identity = await requireAccountRole(request, ['artist']);
  const itemId = cleanText((request.data as Record<string, unknown> | undefined)?.itemId, 160);
  if (!itemId) throw new HttpsError('invalid-argument', 'Artist portfolio item is required.');
  const ref = db.collection('artistPortfolio').doc(itemId);
  const snapshot = await ref.get();
  const data = snapshot.data() ?? {};
  if (!snapshot.exists || data.ownerUserId !== identity.uid) throw new HttpsError('not-found', 'Artist portfolio item not found.');

  for (const rawId of [data.imageAssetId,data.pendingImageAssetId]) {
    const assetId = cleanText(rawId, 160);
    if (!assetId) continue;
    const asset = await db.collection('imageAssets').doc(assetId).get();
    if (asset.exists && asset.data()?.ownerUserId === identity.uid) {
      await clearAssetFile(asset.data() ?? {});
      await asset.ref.set({ status:'removed', publicUrl:null, updatedAt:FieldValue.serverTimestamp() }, { merge:true });
    }
  }
  await ref.set({
    status:'removed',
    imageAssetId:null,
    imageUrl:null,
    imageStatus:null,
    pendingImageAssetId:null,
    pendingImageStatus:null,
    updatedAt:FieldValue.serverTimestamp(),
  }, { merge:true });
  return { removed:true, itemId };
});

const publicArtistPortfolioFor = async (userId: string) => {
  const snapshot = await db.collection('artistPortfolio').where('ownerUserId','==',userId).limit(40).get();
  return snapshot.docs
    .map((doc)=>artistPortfolioPayload(doc.data() ?? {}, doc.id))
    .filter((item)=>item.status === 'published' && Boolean(item.imageUrl))
    .sort((a,b)=>String(b.publishedAt ?? '').localeCompare(String(a.publishedAt ?? '')))
    .slice(0,24);
}; 
const editorPortfolioPayload = (data: Record<string, any>, id: string) => ({
  id,
  ownerUserId: cleanText(data.ownerUserId, 160),
  title: cleanText(data.title, 140),
  description: cleanText(data.description, 1200),
  services: cleanStringList(data.services, 16),
  techniques: cleanStringList(data.techniques, 20),
  status: cleanText(data.status, 40) || 'draft',
  beforeAudioAvailable: Boolean(data.beforeAudioStoragePath),
  afterAudioAvailable: Boolean(data.afterAudioStoragePath),
  rightsConfirmed: data.rightsConfirmed === true,
  contributorPermissionsConfirmed: data.contributorPermissionsConfirmed === true,
  clientPermissionNote: cleanText(data.clientPermissionNote, 500) || null,
  createdAt: toIso(data.createdAt),
  submittedAt: toIso(data.submittedAt),
  moderatedAt: toIso(data.moderatedAt),
  publishedAt: toIso(data.publishedAt),
  updatedAt: toIso(data.updatedAt),
});

const publicEditorPortfolioFor = async (userId: string) => {
  const snapshot = await db.collection('editorPortfolio')
    .where('ownerUserId', '==', userId)
    .limit(100)
    .get();
  return snapshot.docs
    .filter((doc) => doc.data()?.status === 'published')
    .map((doc) => editorPortfolioPayload(doc.data(), doc.id))
    .sort((a,b) => String(b.publishedAt ?? b.updatedAt ?? '').localeCompare(String(a.publishedAt ?? a.updatedAt ?? '')));
};

const requireEditorPortfolioOwner = async (identity: Awaited<ReturnType<typeof requireActiveIdentity>>, itemId: string) => {
  const account = await accountRef(identity.uid).get();
  const approved = professionalRolesForAccount(account.data() ?? {});
  if (!identity.admin && (!approved.includes('editor') || account.data()?.status !== 'active')) {
    throw new HttpsError('permission-denied', 'Approved Audio Editor access is required.');
  }
  const ref = db.collection('editorPortfolio').doc(itemId);
  const snapshot = await ref.get();
  const data = snapshot.data();
  if (!data || (!identity.admin && data.ownerUserId !== identity.uid)) throw new HttpsError('not-found', 'Editor showcase item not found.');
  return { ref, snapshot, data };
};

export const createEditorPortfolioItem = onCall({ region: REGION }, async (request) => {
  const identity = await requireAccountRole(request, ['editor']);
  await requireProfessionalLegalTerms(identity.uid);
  const input = (request.data ?? {}) as Record<string, unknown>;
  const title = cleanText(input.title, 140);
  if (!title) throw new HttpsError('invalid-argument', 'Give the showcase item a title.');
  if (input.rightsConfirmed !== true || input.contributorPermissionsConfirmed !== true) {
    throw new HttpsError('failed-precondition', 'Confirm ownership/rights and contributor/client permission before uploading showcase audio.');
  }
  const ref = db.collection('editorPortfolio').doc();
  const record = {
    ownerUserId: identity.uid,
    title,
    description: cleanText(input.description, 1200),
    services: cleanStringList(input.services, 16),
    techniques: cleanStringList(input.techniques, 20),
    rightsConfirmed: true,
    contributorPermissionsConfirmed: true,
    clientPermissionNote: cleanText(input.clientPermissionNote, 500) || null,
    beforeAudioStoragePath: null,
    beforeAudioContentType: null,
    beforeAudioByteSize: null,
    afterAudioStoragePath: null,
    afterAudioContentType: null,
    afterAudioByteSize: null,
    status: 'draft',
    moderationNote: null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  await ref.set(record);
  return { item: editorPortfolioPayload(record, ref.id) };
});

export const myEditorPortfolio = onCall({ region: REGION }, async (request) => {
  const identity = await requireAccountRole(request, ['editor']);
  const snapshot = await db.collection('editorPortfolio').where('ownerUserId', '==', identity.uid).limit(100).get();
  return {
    items: snapshot.docs
      .map((doc) => editorPortfolioPayload(doc.data(), doc.id))
      .sort((a,b) => String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? ''))),
  };
});

export const finalizeEditorPortfolioAudio = onCall({ region: REGION }, async (request) => {
  const identity = await requireAccountRole(request, ['editor']);
  const input = (request.data ?? {}) as Record<string, unknown>;
  const itemId = cleanText(input.itemId, 160);
  const slot = cleanText(input.slot, 20);
  const storagePath = cleanText(input.storagePath, 600);
  if (!itemId || !['before','after'].includes(slot) || !storagePath) throw new HttpsError('invalid-argument', 'Editor showcase audio upload is incomplete.');

  const { ref, data } = await requireEditorPortfolioOwner(identity, itemId);
  if (!['draft','changes','rejected'].includes(String(data.status ?? 'draft'))) {
    throw new HttpsError('failed-precondition', 'This showcase item cannot be edited while moderation is active or after publication.');
  }
  const expectedPrefix = `editor-showcase/${identity.uid}/${itemId}/${slot}/`;
  if (!storagePath.startsWith(expectedPrefix)) throw new HttpsError('permission-denied', 'Editor showcase upload path is invalid.');

  const file = getStorage().bucket().file(storagePath);
  const [exists] = await file.exists();
  if (!exists) throw new HttpsError('not-found', 'Uploaded showcase audio was not found.');
  const [metadata] = await file.getMetadata();
  const size = Number(metadata.size ?? 0);
  const contentType = String(metadata.contentType ?? '');
  const allowed = ['audio/mpeg','audio/mp3','audio/wav','audio/x-wav','audio/mp4','audio/x-m4a','audio/ogg','audio/webm'];
  if (!allowed.includes(contentType) || !size || size > 20 * 1024 * 1024) {
    await file.delete({ ignoreNotFound:true }).catch(() => undefined);
    throw new HttpsError('invalid-argument', 'Use MP3, WAV, M4A, OGG or WebM showcase audio up to 20 MB.');
  }

  const pathField = slot === 'before' ? 'beforeAudioStoragePath' : 'afterAudioStoragePath';
  const oldPath = cleanText(data[pathField], 600);
  await ref.set({
    [pathField]: storagePath,
    [slot === 'before' ? 'beforeAudioContentType' : 'afterAudioContentType']: contentType,
    [slot === 'before' ? 'beforeAudioByteSize' : 'afterAudioByteSize']: size,
    status: ['changes','rejected'].includes(String(data.status)) ? 'draft' : data.status ?? 'draft',
    moderationNote: null,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge:true });

  if (oldPath && oldPath !== storagePath) {
    await getStorage().bucket().file(oldPath).delete({ ignoreNotFound:true }).catch(() => undefined);
  }
  const saved = await ref.get();
  return { item: editorPortfolioPayload(saved.data() ?? {}, itemId) };
});

export const submitEditorPortfolioItem = onCall({ region: REGION }, async (request) => {
  const identity = await requireAccountRole(request, ['editor']);
  const itemId = cleanText((request.data as Record<string, unknown> | undefined)?.itemId, 160);
  const { ref, data } = await requireEditorPortfolioOwner(identity, itemId);
  if (!data.afterAudioStoragePath) throw new HttpsError('failed-precondition', 'Attach the finished/after audio sample before submitting.');
  if (data.rightsConfirmed !== true || data.contributorPermissionsConfirmed !== true) {
    throw new HttpsError('failed-precondition', 'Rights and contributor/client permissions must be confirmed.');
  }
  await ref.set({
    status:'pending_review',
    submittedAt:FieldValue.serverTimestamp(),
    moderationNote:null,
    updatedAt:FieldValue.serverTimestamp(),
  }, { merge:true });
  const saved=await ref.get();
  return { item:editorPortfolioPayload(saved.data() ?? {}, itemId) };
});

export const editorPortfolioModerationQueue = onCall({ region: REGION }, async (request) => {
  requireAdminIdentity(request);
  const snapshot=await db.collection('editorPortfolio').where('status','==','pending_review').limit(100).get();
  return { items:snapshot.docs.map((doc)=>editorPortfolioPayload(doc.data(),doc.id)) };
});

export const moderateEditorPortfolioItem = onCall({ region: REGION }, async (request) => {
  const admin=requireAdminIdentity(request);
  const input=(request.data ?? {}) as Record<string,unknown>;
  const itemId=cleanText(input.itemId,160);
  const decision=cleanText(input.decision,30);
  const note=cleanText(input.note,1200);
  if(!['approved','changes','rejected'].includes(decision)) throw new HttpsError('invalid-argument','Invalid moderation decision.');
  const ref=db.collection('editorPortfolio').doc(itemId);
  const snapshot=await ref.get();
  const data=snapshot.data();
  if(!data || data.status!=='pending_review') throw new HttpsError('failed-precondition','Editor showcase item is not awaiting moderation.');
  const status=decision==='approved'?'published':decision==='changes'?'changes':'rejected';
  await ref.set({
    status,
    moderationNote:note||null,
    moderatedBy:admin.uid,
    moderatedAt:FieldValue.serverTimestamp(),
    publishedAt:decision==='approved'?FieldValue.serverTimestamp():data.publishedAt??null,
    updatedAt:FieldValue.serverTimestamp(),
  },{merge:true});
  if(data.ownerUserId){
    await createNotification(String(data.ownerUserId),{
      type:'content',subtype:'editor_portfolio',
      title:decision==='approved'?'Your Editor showcase is live':decision==='changes'?'Changes requested for your Editor showcase':'Your Editor showcase was not approved',
      message:decision==='approved'?'Your approved audio showcase is now visible on your public Audio Editor profile.':note||'Open Editor Studio to review the moderation result.',
      portfolioItemId:itemId,
    });
  }
  const saved=await ref.get();
  return { item:editorPortfolioPayload(saved.data() ?? {},itemId) };
});

export const getEditorPortfolioAudioUrl = onCall({ region: REGION }, async (request) => {
  const identity=await requireActiveIdentity(request);
  await requireAgeVerified(identity.uid);
  const input=(request.data ?? {}) as Record<string,unknown>;
  const itemId=cleanText(input.itemId,160);
  const slot=cleanText(input.slot,20);
  if(!['before','after'].includes(slot)) throw new HttpsError('invalid-argument','Choose a valid Editor showcase audio sample.');
  const snapshot=await db.collection('editorPortfolio').doc(itemId).get();
  const data=snapshot.data();
  if(!data || (data.status!=='published' && !identity.admin)) throw new HttpsError('not-found','Published Editor showcase item not found.');
  const path=cleanText(data[slot==='before'?'beforeAudioStoragePath':'afterAudioStoragePath'],600);
  if(!path) throw new HttpsError('not-found','That showcase audio sample is not available.');
  const [url]=await getStorage().bucket().file(path).getSignedUrl({action:'read',expires:Date.now()+10*60*1000});
  return { itemId,slot,url,expiresInSeconds:600 };
});

export const removeEditorPortfolioItem = onCall({ region: REGION }, async (request) => {
  const identity=await requireAccountRole(request,['editor']);
  const itemId=cleanText((request.data as Record<string,unknown>|undefined)?.itemId,160);
  const {ref,data}=await requireEditorPortfolioOwner(identity,itemId);
  if(data.status==='pending_review') throw new HttpsError('failed-precondition','Withdraw from moderation before deleting this showcase item.');
  for(const path of [data.beforeAudioStoragePath,data.afterAudioStoragePath]){
    const clean=cleanText(path,600);
    if(clean) await getStorage().bucket().file(clean).delete({ignoreNotFound:true}).catch(()=>undefined);
  }
  await ref.delete();
  return { removed:true,itemId };
});

type CreatorRateBand = {
  minPaidSubscribers: number;
  monthlyRatePence: number;
};

type CommercialSettings = {
  planningMonthlyPricePence: number | null;
  creatorPoolPercent: number;
  companyProfitPercent: number;
  businessFundPercent: number;
  planningEligibleNetPercent: number;
  safeCreatorUtilizationPercent: number;
  revenueAveragingDays: number;
  subscriberStressTestPercent: number;
  minimumBankedCreatorSlots: number;
  automaticCreatorSlotOpening: false;
  creatorSlotRecommendations: boolean;
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
  listenerSubscriptionUrl: string | null;
};

const DEFAULT_CREATOR_RATE_BANDS: CreatorRateBand[] = [
  { minPaidSubscribers: 0, monthlyRatePence: 0 },
  { minPaidSubscribers: 500, monthlyRatePence: 25000 },
  { minPaidSubscribers: 1000, monthlyRatePence: 50000 },
  { minPaidSubscribers: 2500, monthlyRatePence: 75000 },
  { minPaidSubscribers: 5000, monthlyRatePence: 150000 },
  { minPaidSubscribers: 7500, monthlyRatePence: 225000 },
  { minPaidSubscribers: 10000, monthlyRatePence: 300000 },
];

const readCommercialSettings = async (): Promise<CommercialSettings> => {
  const snapshot = await db.collection('settings').doc('commercial').get();
  const data = snapshot.data() ?? {};
  const creatorPoolPercent = typeof data.creatorPoolPercent === 'number' ? Math.max(0, Math.min(100, data.creatorPoolPercent)) : 50;
  const companyProfitPercent = typeof data.companyProfitPercent === 'number' ? Math.max(0, Math.min(100, data.companyProfitPercent)) : 30;
  const businessFundPercent = typeof data.businessFundPercent === 'number'
    ? Math.max(0, Math.min(100, data.businessFundPercent))
    : typeof data.reservePercent === 'number'
      ? Math.max(0, Math.min(100, data.reservePercent))
      : 20;
  const storedBands = Array.isArray(data.creatorRateBands)
    ? data.creatorRateBands
      .map((item: any) => ({
        minPaidSubscribers: Math.max(0, Math.round(Number(item?.minPaidSubscribers ?? 0))),
        monthlyRatePence: Math.max(0, Math.round(Number(item?.monthlyRatePence ?? 0))),
      }))
      .filter((item: CreatorRateBand) => Number.isFinite(item.minPaidSubscribers) && Number.isFinite(item.monthlyRatePence))
      .sort((a: CreatorRateBand, b: CreatorRateBand) => a.minPaidSubscribers - b.minPaidSubscribers)
      .slice(0, 24)
    : [];

  return {
    planningMonthlyPricePence: typeof data.planningMonthlyPricePence === 'number'
      ? data.planningMonthlyPricePence
      : snapshot.exists && Object.prototype.hasOwnProperty.call(data, 'planningMonthlyPricePence')
        ? null
        : 699,
    creatorPoolPercent,
    companyProfitPercent,
    businessFundPercent,
    planningEligibleNetPercent: typeof data.planningEligibleNetPercent === 'number'
      ? Math.max(1, Math.min(100, data.planningEligibleNetPercent))
      : 66.33,
    safeCreatorUtilizationPercent: typeof data.safeCreatorUtilizationPercent === 'number'
      ? Math.max(1, Math.min(100, data.safeCreatorUtilizationPercent))
      : 70,
    revenueAveragingDays: typeof data.revenueAveragingDays === 'number'
      ? Math.max(1, Math.min(365, Math.round(data.revenueAveragingDays)))
      : 90,
    subscriberStressTestPercent: typeof data.subscriberStressTestPercent === 'number'
      ? Math.max(0, Math.min(90, data.subscriberStressTestPercent))
      : 20,
    minimumBankedCreatorSlots: typeof data.minimumBankedCreatorSlots === 'number'
      ? Math.max(0, Math.min(100, Math.round(data.minimumBankedCreatorSlots)))
      : 2,
    automaticCreatorSlotOpening: false,
    creatorSlotRecommendations: data.creatorSlotRecommendations !== false,
    reservePercent: businessFundPercent,
    payoutCadence: data.payoutCadence ? String(data.payoutCadence) : 'Monthly',
    eligibleListeningDefinition: data.eligibleListeningDefinition ? String(data.eligibleListeningDefinition) : null,
    compensationModel: 'capped_equal_rate',
    creatorMonthlyCapPence: typeof data.creatorMonthlyCapPence === 'number'
      ? Math.max(0, Math.round(data.creatorMonthlyCapPence))
      : 300000,
    creatorRateBands: storedBands.length ? storedBands : DEFAULT_CREATOR_RATE_BANDS,
    creatorEligibilityDefinition: data.creatorEligibilityDefinition ? String(data.creatorEligibilityDefinition) : null,
    popularityAffectsBaseRate: false,
    tipsEnabled: data.tipsEnabled === true,
    individualPurchasesEnabled: data.individualPurchasesEnabled === true,
    listenerSubscriptionUrl: validPublicUrl(data.listenerSubscriptionUrl),
  };
};

const buildCommercialOverview = async (writeSnapshot: boolean) => {
  const [settings, subscriptions, accounts] = await Promise.all([
    readCommercialSettings(),
    db.collection('subscriptions').limit(5000).get(),
    db.collection('accounts').limit(2000).get(),
  ]);

  let active = 0;
  let trialing = 0;
  let pastDue = 0;
  let activePaidSubscribers = 0;
  let confirmedGrossMrrPence = 0;
  let eligibleNetRevenuePence = 0;
  let confirmedEligibleNetSubscriptionCount = 0;
  let trialPotentialPence = 0;
  let pastDueAtRiskPence = 0;
  const fallbackMonthlyPricePence = Math.max(0, Math.round(settings.planningMonthlyPricePence ?? 0));

  for (const doc of subscriptions.docs) {
    const data = doc.data();
    const status = String(data.status ?? '');
    const confirmedAmount = typeof data.confirmedMonthlyAmountPence === 'number'
      ? Math.max(0, Math.round(data.confirmedMonthlyAmountPence))
      : null;
    const confirmedEligibleNetAmount = typeof data.confirmedEligibleNetMonthlyAmountPence === 'number'
      ? Math.max(0, Math.round(data.confirmedEligibleNetMonthlyAmountPence))
      : null;
    const planningAmount = confirmedAmount ?? fallbackMonthlyPricePence;

    if (status === 'active') {
      active += 1;
      if (confirmedAmount != null && confirmedAmount > 0) {
        activePaidSubscribers += 1;
        confirmedGrossMrrPence += confirmedAmount;
        if (confirmedEligibleNetAmount != null) {
          eligibleNetRevenuePence += Math.min(confirmedAmount, confirmedEligibleNetAmount);
          confirmedEligibleNetSubscriptionCount += 1;
        } else {
          eligibleNetRevenuePence += Math.round(confirmedAmount * (settings.planningEligibleNetPercent / 100));
        }
      }
    } else if (status === 'trialing') {
      trialing += 1;
      trialPotentialPence += planningAmount;
    } else if (status === 'past_due') {
      pastDue += 1;
      pastDueAtRiskPence += planningAmount;
    }
  }

  const activeCreatorDocs = accounts.docs.filter((doc) => {
    const data = doc.data();
    return data.status === 'active' && professionalRolesForAccount(data).includes('creator');
  });
  const activeCreatorCount = activeCreatorDocs.length;
  const paidCreatorDocs = activeCreatorDocs.filter((doc) => doc.data().paidCreatorSlotActive === true);
  const paidCreatorCount = paidCreatorDocs.length;
  const standardMonthlyCreatorRatePence = calculateCreatorRate(settings, activePaidSubscribers);
  const plannedCreatorPayoutPence = standardMonthlyCreatorRatePence * paidCreatorCount;

  const dateKey = londonDateKey();
  const historySnapshot = await db.collection('commercialSnapshots')
    .orderBy('dateKey', 'desc')
    .limit(Math.min(365, Math.max(1, settings.revenueAveragingDays)))
    .get();
  const historyValues = historySnapshot.docs
    .map((doc) => doc.data())
    .filter((item) => String(item.dateKey ?? '') !== dateKey)
    .map((item) => Math.max(0, Math.round(Number(item.eligibleNetRevenuePence ?? 0))))
    .filter((value) => Number.isFinite(value));
  const rollingValues = [eligibleNetRevenuePence, ...historyValues].slice(0, settings.revenueAveragingDays);
  const rollingAverageEligibleNetRevenuePence = rollingValues.length
    ? Math.round(rollingValues.reduce((sum, value) => sum + value, 0) / rollingValues.length)
    : eligibleNetRevenuePence;
  const sustainableEligibleNetRevenuePence = Math.min(
    eligibleNetRevenuePence,
    rollingAverageEligibleNetRevenuePence || eligibleNetRevenuePence,
  );

  const creatorCapacityPence = Math.max(0, Math.round(eligibleNetRevenuePence * (settings.creatorPoolPercent / 100)));
  const companyProfitAllocationPence = Math.max(0, Math.round(eligibleNetRevenuePence * (settings.companyProfitPercent / 100)));
  const coreBusinessFundPence = Math.max(0, Math.round(eligibleNetRevenuePence * (settings.businessFundPercent / 100)));
  const unusedCreatorCapacityPence = Math.max(0, creatorCapacityPence - plannedCreatorPayoutPence);
  const growthAndStabilityFundContributionPence = coreBusinessFundPence + unusedCreatorCapacityPence;
  const safeCreatorPayrollPence = Math.max(0, Math.round(
    sustainableEligibleNetRevenuePence
      * (settings.creatorPoolPercent / 100)
      * (settings.safeCreatorUtilizationPercent / 100),
  ));
  const stressEligibleNetRevenuePence = Math.max(0, Math.round(
    sustainableEligibleNetRevenuePence * (1 - settings.subscriberStressTestPercent / 100),
  ));
  const stressCreatorCapacityPence = Math.max(0, Math.round(
    stressEligibleNetRevenuePence * (settings.creatorPoolPercent / 100),
  ));

  const theoreticalCreatorCapacity = standardMonthlyCreatorRatePence > 0
    ? Math.floor(creatorCapacityPence / standardMonthlyCreatorRatePence)
    : 0;
  const safeCreatorCapacity = standardMonthlyCreatorRatePence > 0
    ? Math.min(theoreticalCreatorCapacity, Math.floor(safeCreatorPayrollPence / standardMonthlyCreatorRatePence))
    : 0;
  const bankedCreatorCapacity = Math.max(0, theoreticalCreatorCapacity - paidCreatorCount);
  const safeReleaseSlots = Math.max(0, safeCreatorCapacity - paidCreatorCount);
  const creatorBudgetUtilizationPercent = creatorCapacityPence > 0
    ? Math.round((plannedCreatorPayoutPence / creatorCapacityPence) * 10000) / 100
    : 0;
  const stressTestPass = plannedCreatorPayoutPence <= stressCreatorCapacityPence;
  const afterNextBankedSlots = Math.max(0, theoreticalCreatorCapacity - (paidCreatorCount + 1));
  const nextCreatorRecommended = settings.creatorSlotRecommendations
    && standardMonthlyCreatorRatePence > 0
    && paidCreatorCount + 1 <= safeCreatorCapacity
    && afterNextBankedSlots >= settings.minimumBankedCreatorSlots
    && (paidCreatorCount + 1) * standardMonthlyCreatorRatePence <= stressCreatorCapacityPence;
  const capacityStatus = plannedCreatorPayoutPence > creatorCapacityPence
    ? 'overcommitted'
    : paidCreatorCount > safeCreatorCapacity || !stressTestPass
      ? 'guarded'
      : 'healthy';

  if (writeSnapshot) {
    await db.collection('commercialSnapshots').doc(dateKey).set({
      dateKey,
      activePaidSubscribers,
      confirmedGrossMrrPence,
      eligibleNetRevenuePence,
      paidCreatorCount,
      standardMonthlyCreatorRatePence,
      plannedCreatorPayoutPence,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  }

  return {
    settings,
    subscriptions: { active, trialing, pastDue },
    confirmedGrossMrrPence,
    activePaidSubscribers,
    unpricedActiveSubscriptions: Math.max(0, active - activePaidSubscribers),
    trialPotentialPence,
    pastDueAtRiskPence,
    potentialGrossWithTrialsPence: confirmedGrossMrrPence + trialPotentialPence,
    eligibleNetRevenuePence,
    eligibleNetRevenueSource: activePaidSubscribers === 0
      ? 'none'
      : confirmedEligibleNetSubscriptionCount === activePaidSubscribers
        ? 'confirmed'
        : confirmedEligibleNetSubscriptionCount === 0
          ? 'planning_estimate'
          : 'mixed',
    confirmedEligibleNetSubscriptionCount,
    rollingAverageEligibleNetRevenuePence,
    revenueHistorySampleDays: rollingValues.length,
    sustainableEligibleNetRevenuePence,
    activeCreatorCount,
    paidCreatorCount,
    standardMonthlyCreatorRatePence,
    plannedCreatorPayoutPence,
    creatorCapacityPence,
    companyProfitAllocationPence,
    coreBusinessFundPence,
    unusedCreatorCapacityPence,
    growthAndStabilityFundContributionPence,
    safeCreatorPayrollPence,
    stressEligibleNetRevenuePence,
    stressCreatorCapacityPence,
    theoreticalCreatorCapacity,
    safeCreatorCapacity,
    bankedCreatorCapacity,
    safeReleaseSlots,
    creatorBudgetUtilizationPercent,
    stressTestPass,
    nextCreatorRecommended,
    capacityStatus,
    creatorSlots: activeCreatorDocs.map((doc) => {
      const data = doc.data();
      return {
        userId: doc.id,
        displayName: data.displayName ?? data.name ?? data.email ?? 'Nightjar Creator',
        email: data.email ?? null,
        paidCreatorSlotActive: data.paidCreatorSlotActive === true,
      };
    }),
    reservePence: coreBusinessFundPence,
    planningBalanceBeforeFeesTaxPence: Math.max(0, eligibleNetRevenuePence - plannedCreatorPayoutPence),
  };
};

export const commercialOverview = onCall({ region: REGION }, async (request) => {
  requireAdminIdentity(request);
  return buildCommercialOverview(true);
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
  const requiredNumber = (value: unknown, fallback: number, min: number, max: number, integer = false) =>
    nullableNumber(value, min, max, integer) ?? fallback;

  const rawBands = Array.isArray(input.creatorRateBands) ? input.creatorRateBands : [];
  const creatorRateBands: CreatorRateBand[] = rawBands
    .map((item: any) => ({
      minPaidSubscribers: Math.max(0, Math.round(Number(item?.minPaidSubscribers ?? 0))),
      monthlyRatePence: Math.max(0, Math.round(Number(item?.monthlyRatePence ?? 0))),
    }))
    .filter((item) => Number.isFinite(item.minPaidSubscribers) && Number.isFinite(item.monthlyRatePence))
    .sort((a, b) => a.minPaidSubscribers - b.minPaidSubscribers)
    .slice(0, 24);

  const creatorPoolPercent = requiredNumber(input.creatorPoolPercent, 50, 0, 100);
  const companyProfitPercent = requiredNumber(input.companyProfitPercent, 30, 0, 100);
  const businessFundPercent = requiredNumber(input.businessFundPercent, 20, 0, 100);
  const allocationTotal = Math.round((creatorPoolPercent + companyProfitPercent + businessFundPercent) * 100) / 100;
  if (Math.abs(allocationTotal - 100) > 0.01) {
    throw new HttpsError('invalid-argument', 'Creator, company-profit and business-fund allocations must total 100%.');
  }

  const previous = await readCommercialSettings();
  const settings: CommercialSettings = {
    planningMonthlyPricePence: nullableNumber(input.planningMonthlyPricePence, 0, 100000, true),
    creatorPoolPercent,
    companyProfitPercent,
    businessFundPercent,
    planningEligibleNetPercent: requiredNumber(input.planningEligibleNetPercent, 66.33, 1, 100),
    safeCreatorUtilizationPercent: requiredNumber(input.safeCreatorUtilizationPercent, 70, 1, 100),
    revenueAveragingDays: requiredNumber(input.revenueAveragingDays, 90, 1, 365, true),
    subscriberStressTestPercent: requiredNumber(input.subscriberStressTestPercent, 20, 0, 90),
    minimumBankedCreatorSlots: requiredNumber(input.minimumBankedCreatorSlots, 2, 0, 100, true),
    automaticCreatorSlotOpening: false,
    creatorSlotRecommendations: input.creatorSlotRecommendations !== false,
    reservePercent: businessFundPercent,
    payoutCadence: cleanText(input.payoutCadence, 80) || 'Monthly',
    eligibleListeningDefinition: cleanText(input.eligibleListeningDefinition, 1200) || null,
    compensationModel: 'capped_equal_rate',
    creatorMonthlyCapPence: nullableNumber(input.creatorMonthlyCapPence, 0, 10000000, true) ?? 300000,
    creatorRateBands: creatorRateBands.length ? creatorRateBands : DEFAULT_CREATOR_RATE_BANDS,
    creatorEligibilityDefinition: cleanText(input.creatorEligibilityDefinition, 1600) || null,
    popularityAffectsBaseRate: false,
    tipsEnabled: input.tipsEnabled === true,
    individualPurchasesEnabled: input.individualPurchasesEnabled === true,
    listenerSubscriptionUrl: (() => {
      const raw = cleanText(input.listenerSubscriptionUrl, 500);
      if (!raw) return null;
      const url = validPublicUrl(raw);
      if (!url) throw new HttpsError('invalid-argument', 'Listener subscription checkout URL must use http or https.');
      return url;
    })(),
  };

  await db.collection('settings').doc('commercial').set({
    ...settings,
    updatedBy: admin.uid,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  await db.collection('settings').doc('commercial').collection('audit').add({
    changedBy: admin.uid,
    previous,
    next: settings,
    createdAt: FieldValue.serverTimestamp(),
  });

  return { settings };
});

export const setCreatorPaidSlotStatus = onCall({ region: REGION }, async (request) => {
  const admin = requireAdminIdentity(request);
  const input = (request.data ?? {}) as Record<string, unknown>;
  const userId = cleanText(input.userId, 180);
  const active = input.active === true;
  if (!userId) throw new HttpsError('invalid-argument', 'Creator user ID is required.');

  const ref = accountRef(userId);
  const snapshot = await ref.get();
  const account = snapshot.data();
  if (!snapshot.exists || !account || !professionalRolesForAccount(account).includes('creator')) {
    throw new HttpsError('not-found', 'Creator account was not found.');
  }
  if (active && account.status !== 'active') {
    throw new HttpsError('failed-precondition', 'Only active Creator accounts can receive a paid Creator slot.');
  }
  if ((account.paidCreatorSlotActive === true) === active) {
    return { active, overview: await buildCommercialOverview(false) };
  }

  if (active) {
    const overview = await buildCommercialOverview(false);
    const nextPaidCount = overview.paidCreatorCount + 1;
    if (nextPaidCount > overview.safeCreatorCapacity) {
      throw new HttpsError('failed-precondition', 'This slot would exceed Nightjar safe Creator payroll capacity.');
    }
    if (overview.theoreticalCreatorCapacity - nextPaidCount < overview.settings.minimumBankedCreatorSlots) {
      throw new HttpsError('failed-precondition', 'This slot would use Nightjar’s required banked Creator headroom.');
    }
    if (nextPaidCount * overview.standardMonthlyCreatorRatePence > overview.stressCreatorCapacityPence) {
      throw new HttpsError('failed-precondition', 'This slot would fail the configured subscriber stress test.');
    }
  }

  await ref.set({
    paidCreatorSlotActive: active,
    paidCreatorSlotUpdatedBy: admin.uid,
    paidCreatorSlotUpdatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  await db.collection('settings').doc('commercial').collection('creatorSlotAudit').add({
    userId,
    active,
    changedBy: admin.uid,
    createdAt: FieldValue.serverTimestamp(),
  });

  return { active, overview: await buildCommercialOverview(false) };
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

const spotlightForRole = async (role: 'creator' | 'writer' | 'editor' | 'artist', dateKey: string) => {
  const accounts = await db.collection('accounts').limit(2000).get();
  const eligible = (await Promise.all(
    accounts.docs
      .filter((doc) => doc.data().status === 'active' && professionalRolesForAccount(doc.data()).includes(role))
      .sort((a, b) => a.id.localeCompare(b.id))
      .map(async (doc) => {
        const profile = await profileRef(doc.id).get();
        const data = profile.data();
        if (!data || data.publicProfile === false) return null;
        return {
          kind: role,
          name: data.displayName ?? (role === 'editor' ? 'Nightjar Audio Editor' : role === 'artist' ? 'Nightjar Artist' : 'Nightjar member'),
          handle: data.handle ?? null,
          title: data.headline ?? (role === 'editor' ? 'Audio Editor profile' : role === 'creator' ? 'VA Creator profile' : role === 'artist' ? 'Artist profile' : 'Writer profile'),
          edition: role === 'editor' ? 'Audio Editor Spotlight' : role === 'creator' ? 'VA Creator Spotlight' : role === 'artist' ? 'Artist Spotlight' : 'Writer Spotlight',
          detail: role === 'editor'
            ? 'A full day of recognition for an Audio Editor shaping Nightjar productions.'
            : role === 'creator'
              ? 'A full day of discovery for this Nightjar VA Creator.'
              : role === 'artist'
                ? 'A full day of discovery for a human Artist shaping Nightjar visual work.'
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
    db.collection('accounts').limit(5000).get(),
    db.collection('listeningEvents').limit(10000).get(),
  ]);

  const listenerAccounts = new Map(
    listenersSnapshot.docs
      .filter((doc) => doc.data().status === 'active' && doc.data().role !== 'admin')
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
    ? 'You are today’s VA Creator Spotlight'
    : kind === 'writer'
      ? 'You are today’s Writer Spotlight'
      : kind === 'editor'
        ? 'You are today’s Audio Editor Spotlight'
        : kind === 'artist'
          ? 'You are today’s Artist Spotlight'
          : 'Thank you — you’re today’s Listener Spotlight';

  const message = kind === 'creator'
    ? 'Your public Nightjar VA Creator profile is featured for the full day.'
    : kind === 'writer'
      ? 'Your public Nightjar writer profile is featured for the full day.'
      : kind === 'editor'
        ? 'Your public Audio Editor profile is featured for the full day.'
        : kind === 'artist'
          ? 'Your public Artist profile is featured for the full day.'
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
  const [creator, writer, editor, artist, listenerState] = await Promise.all([
    spotlightForRole('creator', date),
    spotlightForRole('writer', date),
    spotlightForRole('editor', date),
    spotlightForRole('artist', date),
    listenerSpotlightForToday(date),
  ]);
  const spotlights = [creator, writer, editor, artist, listenerState.listener].filter(Boolean);
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
  const [accountsSnapshot, testerSnapshot, profilesSnapshot] = await Promise.all([
    db.collection('accounts').limit(5000).get(),
    db.collection(CLOSED_BETA_ALLOWLIST_COLLECTION).limit(1000).get(),
    db.collection('profiles').limit(5000).get(),
  ]);
  const profileByUser = new Map(profilesSnapshot.docs.map((doc) => [doc.id, doc.data() ?? {}]));
  const accounts = accountsSnapshot.docs.map((doc) => {
    const account = doc.data();
    const profileData = profileByUser.get(doc.id) ?? {};
    return {
      userId: doc.id,
      email: account.email ?? null,
      role: account.role ?? null,
      roles: account.role === 'admin' ? ['admin'] : ['listener', ...professionalRolesForAccount(account)],
      pendingProfessionalRoles: cleanProfessionalRoles(account.pendingProfessionalRoles),
      status: account.status ?? 'active',
      name: profileData.displayName ?? account.email?.split('@')?.[0] ?? 'Nightjar account',
      handle: profileData.handle ?? null,
      publicProfile: profileData.publicProfile !== false,
      avatarUrl: profileData.avatarStatus === 'approved' ? profileData.avatarUrl ?? null : null,
      testAccess: account.testAccess === true,
    };
  });

  const approvedTesters = testerSnapshot.docs
    .map((doc) => doc.data() ?? {})
    .filter((entry) => entry.enabled === true && validEmailAddress(cleanEmail(entry.email)))
    .map((entry) => ({
      email: cleanEmail(entry.email),
      enabled: true,
      note: cleanText(entry.note, 300) || null,
    }))
    .sort((a, b) => a.email.localeCompare(b.email));

  const counts = {
    listener: accounts.filter((account) => account.role !== 'admin').length,
    creator: accounts.filter((account) => account.roles?.includes('creator')).length,
    writer: accounts.filter((account) => account.roles?.includes('writer')).length,
    editor: accounts.filter((account) => account.roles?.includes('editor')).length,
    artist: accounts.filter((account) => account.roles?.includes('artist')).length,
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
    testing: {
      closedBeta: CLOSED_BETA,
      ageAssuranceConfigured: false /* Query protected ageStatus callable for actual provider configuration */,
      temporaryAgeBypassEnabled: TESTING_AGE_ASSURANCE_BYPASS,
      approvedTesters,
      approvedTesterCount: approvedTesters.length,
    },
  };
});

export const adminSetClosedBetaTester = onCall({ region: REGION }, async (request) => {
  const admin = requireAdminIdentity(request);
  const input = (request.data ?? {}) as Record<string, unknown>;
  const email = cleanEmail(input.email);
  const enabled = input.enabled !== false;
  const note = cleanText(input.note, 300);

  if (!validEmailAddress(email)) throw new HttpsError('invalid-argument', 'Enter a valid tester email address.');
  if (ADMIN_EMAILS.has(email)) {
    throw new HttpsError('failed-precondition', 'Administrator emails already have private test access.');
  }

  const allowRef = testerAllowlistRef(email);
  const existing = await allowRef.get();
  await allowRef.set({
    email,
    enabled,
    note: note || existing.data()?.note || null,
    updatedBy: admin.uid,
    updatedAt: FieldValue.serverTimestamp(),
    ...(existing.exists ? {} : { createdBy: admin.uid, createdAt: FieldValue.serverTimestamp() }),
  }, { merge: true });

  const matchingAccounts = await db.collection('accounts').where('email', '==', email).limit(5).get();
  await Promise.all(matchingAccounts.docs.map((doc) => doc.ref.set({
    testAccess: enabled,
    testAccessUpdatedBy: admin.uid,
    testAccessUpdatedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true })));

  return { email, enabled, matchedAccounts: matchingAccounts.size };
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

  const allowRef = testerAllowlistRef(email);
  const existingAllow = await allowRef.get();
  await allowRef.set({
    email,
    enabled,
    updatedBy: admin.uid,
    updatedAt: FieldValue.serverTimestamp(),
    ...(existingAllow.exists ? {} : { createdBy: admin.uid, createdAt: FieldValue.serverTimestamp() }),
  }, { merge: true });

  return { userId, testAccess: enabled };
});

export const adminSetAccountRole = onCall({ region: REGION }, async (request) => {
  const admin = requireAdminIdentity(request);
  const input = (request.data ?? {}) as Record<string, unknown>;
  const userId = cleanText(input.userId, 160);
  const role = cleanText(input.role, 30) as AccountRole;
  const status = cleanText(input.status, 30);

  if (!userId || !['listener', 'creator', 'writer', 'editor', 'artist'].includes(role)) {
    throw new HttpsError('invalid-argument', 'Choose a valid Nightjar account role.');
  }
  if (!['active', 'pending_review', 'suspended'].includes(status)) {
    throw new HttpsError('invalid-argument', 'Choose a valid account status.');
  }

  const ref = accountRef(userId);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new HttpsError('not-found', 'Nightjar account not found.');
  const accountData = snapshot.data() ?? {};
  const email = cleanEmail(accountData.email);
  if (ADMIN_EMAILS.has(email)) {
    throw new HttpsError('failed-precondition', 'Owner administrator accounts cannot be reassigned here.');
  }
  const approvedProfessionalRoles = professionalRolesForAccount(accountData);
  if (role !== 'listener' && !approvedProfessionalRoles.includes(role)) {
    throw new HttpsError('failed-precondition', 'Approve this professional role through the controlled application bank before making it the active workspace.');
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

const releaseWorkAccess = (data: Record<string, any>, userId: string) => {
  if (cleanText(data.creatorUserId, 160) === userId) return true;
  return normaliseReleaseContributors(data.contributors).some((credit) => credit.userId === userId);
};

const activeListeningSubscriptionFor = async (userId: string) => {
  const snapshot = await db.collection('subscriptions').where('userId', '==', userId).limit(20).get();
  const eligible = snapshot.docs.find((doc) => ['active','trialing'].includes(String(doc.data()?.status ?? '')));
  return eligible ? { id: eligible.id, status: String(eligible.data()?.status ?? '') } : null;
};

const playbackAccessFor = (
  data: Record<string, any>,
  userId: string,
  options: { admin?: boolean; subscription?: { id: string; status: string } | null } = {},
) => {
  if (options.admin) return { allowed:true, reason:'admin' as const };
  if (releaseWorkAccess(data, userId)) return { allowed:true, reason:'credited_work' as const };
  if (options.subscription) return { allowed:true, reason:'subscription' as const };
  return { allowed:false, reason:'subscription_required' as const };
};

const decorateReleaseAccess = (
  data: Record<string, any>,
  id: string,
  userId: string,
  options: { admin?: boolean; subscription?: { id: string; status: string } | null } = {},
) => {
  const access = playbackAccessFor(data, userId, options);
  return {
    ...releasePayload(data, id),
    playbackAllowed: access.allowed,
    playbackAccessReason: access.reason,
  };
};

type TranscriptPreferenceMode = 'on_demand' | 'always_open';

const cleanTranscriptPreferenceMode = (value: unknown): TranscriptPreferenceMode =>
  value === 'always_open' ? 'always_open' : 'on_demand';

const cleanTranscriptTextSize = (value: unknown) =>
  ['standard','large','extra_large'].includes(String(value)) ? String(value) : 'standard';

const accessibilityPreferencesPayload = (data: Record<string, any>) => ({
  transcriptMode: cleanTranscriptPreferenceMode(data.transcriptMode),
  transcriptFollowPlayback: data.transcriptFollowPlayback !== false,
  transcriptTextSize: cleanTranscriptTextSize(data.transcriptTextSize),
  transcriptHighContrast: data.transcriptHighContrast === true,
});

export const getAccessibilityPreferences = onCall({ region: REGION }, async (request) => {
  const identity = await requireActiveIdentity(request);
  const account = await accountRef(identity.uid).get();
  return {
    preferences: accessibilityPreferencesPayload(account.data()?.accessibilityPreferences ?? {}),
  };
});

export const saveAccessibilityPreferences = onCall({ region: REGION }, async (request) => {
  const identity = await requireActiveIdentity(request);
  const input = (request.data ?? {}) as Record<string, unknown>;
  const preferences = accessibilityPreferencesPayload(input);
  await accountRef(identity.uid).set({
    accessibilityPreferences: preferences,
    accessibilityPreferencesUpdatedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge:true });
  return { preferences };
});

export const myListeningAccess = onCall({ region: REGION }, async (request) => {
  const identity = await requireActiveIdentity(request);
  await requireAgeVerified(identity.uid);
  const [account, settings, subscription] = await Promise.all([
    accountRef(identity.uid).get(),
    readCommercialSettings(),
    identity.admin ? Promise.resolve(null) : activeListeningSubscriptionFor(identity.uid),
  ]);

  const role = identity.admin ? 'admin' : cleanText(account.data()?.role, 40) || null;
  return {
    role,
    subscribed: identity.admin || Boolean(subscription),
    subscriptionStatus: identity.admin ? 'admin' : subscription?.status ?? null,
    planningMonthlyPricePence: settings.planningMonthlyPricePence,
    subscriptionUrl: settings.listenerSubscriptionUrl,
    creditedWorkIncluded: true,
    rule: 'Work credited to your Nightjar account is included for you. Listening to unrelated paid catalogue work requires an active or trialing Listener subscription.',
  };
});

const professionalRolesForAccount = (data: Record<string, any>) => {
  const approved = Array.isArray(data.approvedProfessionalRoles)
    ? data.approvedProfessionalRoles.map((value: unknown) => cleanText(value, 30))
    : [];
  const legacyRole = cleanText(data.role, 30);
  if (['creator','writer','editor','artist'].includes(legacyRole) && String(data.status ?? 'active') === 'active') {
    approved.push(legacyRole);
  }
  return Array.from(new Set(approved.filter((role) => ['creator','writer','editor','artist'].includes(role)))) as AccountRole[];
};

const requireAccountRole = async (
  request: { auth?: { uid: string; token: Record<string, unknown> } | null },
  roles: AccountRole[],
) => {
  const identity = await requireActiveIdentity(request);
  if (identity.admin && roles.includes('admin')) return { ...identity, role: 'admin' as AccountRole, status: 'active' };
  const snapshot = await accountRef(identity.uid).get();
  const data = snapshot.data() ?? {};
  const activeRole = cleanText(data.role, 30) as AccountRole | '';
  const approvedProfessionalRoles = professionalRolesForAccount(data);
  const status = String(data.status ?? 'active');
  const allowedRole = roles.find((role) =>
    role === 'listener'
      ? true
      : role === activeRole || approvedProfessionalRoles.includes(role),
  ) ?? null;
  if (!allowedRole) throw new HttpsError('permission-denied', 'This Nightjar role does not have access.');
  if (status === 'suspended') throw new HttpsError('failed-precondition', 'This Nightjar account is suspended.');
  return { ...identity, role: allowedRole as AccountRole, activeRole: activeRole || 'listener', approvedProfessionalRoles, status };
};

const cleanReleaseTranscript = (value: unknown) =>
  String(value ?? '')
    .replace(/\u0000/g, '')
    .replace(/\r\n?/g, '\n')
    .trim()
    .slice(0, 120000);

const cleanTranscriptLanguage = (value: unknown) => {
  const language = cleanText(value, 35).replace(/[^A-Za-z0-9-]/g, '');
  return language || 'en';
};

const transcriptWordCount = (value: unknown) => {
  const text = cleanReleaseTranscript(value);
  return text ? text.split(/\s+/).filter(Boolean).length : 0;
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
  transcriptAvailable: Boolean(cleanReleaseTranscript(data.transcriptText)),
  transcriptLanguage: cleanTranscriptLanguage(data.transcriptLanguage),
  transcriptWordCount: transcriptWordCount(data.transcriptText),
  transcriptAccessibilityReviewed: data.transcriptAccessibilityReviewed === true,
  communityLikeCount: Math.max(0, Number(data.communityLikeCount ?? 0)),
  communityLoveCount: Math.max(0, Number(data.communityLoveCount ?? 0)),
  communityReactionCount: Math.max(0, Number(data.communityReactionCount ?? 0)),
  communityCommentCount: Math.max(0, Number(data.communityCommentCount ?? 0)),
  releaseDate: toIso(data.releaseDate),
  createdAt: toIso(data.createdAt),
  updatedAt: toIso(data.updatedAt),
});

const releaseOwnerPayload = (data: Record<string, unknown>, id: string) => ({
  ...releasePayload(data, id),
  rightsConfirmed: data.rightsConfirmed === true,
  contributorPermissionsConfirmed: data.contributorPermissionsConfirmed === true,
  rightsAttestedAt: toIso(data.rightsAttestedAt),
  transcriptText: cleanReleaseTranscript(data.transcriptText),
  transcriptUpdatedAt: toIso(data.transcriptUpdatedAt),
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

  const [snapshot, subscription] = await Promise.all([
    db.collection('releases').where('status', '==', 'released').limit(500).get(),
    identity.admin ? Promise.resolve(null) : activeListeningSubscriptionFor(identity.uid),
  ]);
  const catalogue = snapshot.docs
    .filter((doc) => !category || cleanText(doc.data().category, 80).toLowerCase() === category)
    .filter((doc) => !query || releaseSearchText(doc.data()).includes(query))
    .map((doc) => decorateReleaseAccess(doc.data(), doc.id, identity.uid, { admin:identity.admin, subscription }));

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
    rightsConfirmed: input.rightsConfirmed === true,
    contributorPermissionsConfirmed: input.contributorPermissionsConfirmed === true,
    rightsAttestedAt: input.rightsConfirmed === true && input.contributorPermissionsConfirmed === true ? FieldValue.serverTimestamp() : null,
    transcriptText: cleanReleaseTranscript(input.transcriptText),
    transcriptLanguage: cleanTranscriptLanguage(input.transcriptLanguage),
    transcriptAccessibilityReviewed: input.transcriptAccessibilityReviewed === true,
    transcriptUpdatedAt: cleanReleaseTranscript(input.transcriptText) ? FieldValue.serverTimestamp() : null,
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
  return { release: releaseOwnerPayload(saved.data() ?? record, ref.id) };
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
    rightsConfirmed: typeof input.rightsConfirmed !== 'undefined' ? input.rightsConfirmed === true : current.rightsConfirmed === true,
    contributorPermissionsConfirmed: typeof input.contributorPermissionsConfirmed !== 'undefined' ? input.contributorPermissionsConfirmed === true : current.contributorPermissionsConfirmed === true,
    rightsAttestedAt: input.rightsConfirmed === true && input.contributorPermissionsConfirmed === true
      ? FieldValue.serverTimestamp()
      : current.rightsAttestedAt ?? null,
    transcriptText: typeof input.transcriptText !== 'undefined' ? cleanReleaseTranscript(input.transcriptText) : cleanReleaseTranscript(current.transcriptText),
    transcriptLanguage: typeof input.transcriptLanguage !== 'undefined' ? cleanTranscriptLanguage(input.transcriptLanguage) : cleanTranscriptLanguage(current.transcriptLanguage),
    transcriptAccessibilityReviewed: typeof input.transcriptAccessibilityReviewed !== 'undefined'
      ? input.transcriptAccessibilityReviewed === true
      : current.transcriptAccessibilityReviewed === true,
    transcriptUpdatedAt: typeof input.transcriptText !== 'undefined' ? FieldValue.serverTimestamp() : current.transcriptUpdatedAt ?? null,
    durationMinutes: typeof input.durationMinutes === 'number' && Number.isFinite(input.durationMinutes)
      ? Math.max(0, Math.min(1440, input.durationMinutes))
      : current.durationMinutes ?? 0,
    updatedAt: FieldValue.serverTimestamp(),
  };
  await ref.set(update, { merge: true });
  await syncCreatorCustomTagUsage(identity.uid);
  const saved = await ref.get();
  return { release: releaseOwnerPayload(saved.data() ?? {}, releaseId) };
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
  return { release: releaseOwnerPayload(saved.data() ?? {}, releaseId) };
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
  await requireProfessionalLegalTerms(identity.uid);
  const releaseId = cleanText((request.data as { releaseId?: unknown } | undefined)?.releaseId, 160);
  const ref = releaseRef(releaseId);
  const snapshot = await ref.get();
  const data = snapshot.data();
  if (!data || data.creatorUserId !== identity.uid) throw new HttpsError('not-found', 'Release not found.');
  if (!data.title || !data.description || !data.category || !data.audioStoragePath) {
    throw new HttpsError('failed-precondition', 'Complete title, description, category and audio before submitting.');
  }
  if (data.rightsConfirmed !== true || data.contributorPermissionsConfirmed !== true) {
    throw new HttpsError(
      'failed-precondition',
      'Confirm that you control the rights needed to publish this release and have permission from every relevant performer, writer, artist or other contributor.',
      { code:'content_rights_attestation_required' },
    );
  }
  if (!cleanReleaseTranscript(data.transcriptText)) {
    throw new HttpsError(
      'failed-precondition',
      'Add a final-release transcript before submitting. Nightjar requires a text alternative for prerecorded audio.',
      { code:'transcript_required' },
    );
  }
  if (data.transcriptAccessibilityReviewed !== true) {
    throw new HttpsError(
      'failed-precondition',
      'Confirm that the transcript reflects the finished audio, including meaningful non-speech sound cues where relevant.',
      { code:'transcript_review_required' },
    );
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
  return { release: releaseOwnerPayload(saved.data() ?? {}, releaseId) };
});

export const creatorDashboard = onCall({ region: REGION }, async (request) => {
  const identity = await requireAccountRole(request, ['creator','admin']);
  const targetCreatorId = identity.role === 'creator'
    ? identity.uid
    : cleanText((request.data as { creatorUserId?: unknown } | undefined)?.creatorUserId, 160) || identity.uid;

  const releasesSnapshot = await db.collection('releases').where('creatorUserId', '==', targetCreatorId).limit(500).get();
  const releases = releasesSnapshot.docs.map((doc) => releaseOwnerPayload(doc.data(), doc.id));
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
  if (!TESTING_AGE_ASSURANCE_BYPASS) {
    return { allowed: false, reason: null as string | null };
  }
  const snapshot = await accountRef(uid).get();
  const data = snapshot.data() ?? {};
  const email = cleanEmail(data.email);
  if (ADMIN_EMAILS.has(email)) return { allowed: true, reason: 'administrator' };
  if (data.testAccess === true || await testerAccessForEmail(email)) {
    return { allowed: true, reason: 'approved-tester' };
  }
  return { allowed: false, reason: null as string | null };
};

const requireAgeVerified = async (uid: string) => {
  const snapshot = await db.collection('ageAssurance').doc(uid).get();
  const data = snapshot.data();
  const persistentVerified = diditPass(data);
  if (persistentVerified) return data;

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

  const subscription = identity.admin ? null : await activeListeningSubscriptionFor(identity.uid);
  const access = playbackAccessFor(data, identity.uid, { admin:identity.admin, subscription });
  if (!access.allowed) {
    throw new HttpsError(
      'failed-precondition',
      'A Nightjar subscription is required to listen to catalogue work you are not credited on.',
      { code:'subscription_required', releaseId },
    );
  }

  const grantExpiresAtMs = Date.now() + 16 * 60 * 1000;
  await accountRef(identity.uid).collection('playbackGrants').doc(releaseId).set({
    releaseId,
    accessReason: access.reason,
    grantedAt: FieldValue.serverTimestamp(),
    expiresAtMs: grantExpiresAtMs,
  }, { merge:true });

  const [url] = await getStorage().bucket().file(String(data.audioStoragePath)).getSignedUrl({
    action: 'read',
    expires: Date.now() + 15 * 60 * 1000,
  });
  return { releaseId, url, expiresInSeconds: 900, accessReason:access.reason };
});

export const getReleaseTranscript = onCall({ region: REGION }, async (request) => {
  const identity = await requireActiveIdentity(request);
  await requireAgeVerified(identity.uid);
  const releaseId = cleanText((request.data as { releaseId?: unknown } | undefined)?.releaseId, 160);
  if (!releaseId) throw new HttpsError('invalid-argument', 'Release is required.');

  const snapshot = await releaseRef(releaseId).get();
  const data = snapshot.data();
  if (!data) throw new HttpsError('not-found', 'Release transcript not found.');

  const transcriptText = cleanReleaseTranscript(data.transcriptText);
  if (!transcriptText) throw new HttpsError('not-found', 'This release does not have a transcript yet.');

  const ownDraft = data.creatorUserId === identity.uid;
  const adminPreview = identity.admin === true;
  if (data.status !== 'released' && !ownDraft && !adminPreview) {
    throw new HttpsError('not-found', 'Release transcript not found.');
  }

  let accessReason: 'admin' | 'credited_work' | 'subscription' = identity.admin
    ? 'admin'
    : 'credited_work';

  if (data.status === 'released' && !identity.admin) {
    const subscription = await activeListeningSubscriptionFor(identity.uid);
    const access = playbackAccessFor(data, identity.uid, { subscription });
    if (!access.allowed) {
      throw new HttpsError(
        'failed-precondition',
        'A Nightjar subscription is required to read transcripts for catalogue work you are not credited on.',
        { code:'subscription_required', releaseId },
      );
    }
    accessReason = access.reason as 'credited_work' | 'subscription';
  }

  return {
    releaseId,
    title: cleanText(data.title, 160),
    transcript: transcriptText,
    language: cleanTranscriptLanguage(data.transcriptLanguage),
    wordCount: transcriptWordCount(transcriptText),
    accessibilityReviewed: data.transcriptAccessibilityReviewed === true,
    accessReason,
  };
});

export const releaseModerationQueue = onCall({ region: REGION }, async (request) => {
  requireAdminIdentity(request);
  const snapshot = await db.collection('releases').where('status', '==', 'pending_review').limit(100).get();
  return { releases: snapshot.docs.map((doc) => releaseOwnerPayload(doc.data(), doc.id)) };
});

const notificationRouteFor = (payload: Record<string, unknown>) => {
  const type = cleanText(payload.type, 40);
  const subtype = cleanText(payload.subtype, 60);
  if (type === 'message' || subtype === 'professional_message' || subtype === 'direct_message') return '/messages';
  if (type === 'collaboration') return '/messages';
  if (type === 'payment' || subtype === 'payment') return '/profile';
  if (subtype === 'release' || subtype === 'release_comment' || subtype === 'release_reaction') return '/discover';
  return '/discover';
};

const deliverPushNotification = async (
  userId: string,
  payload: Record<string, unknown>,
  displayMode: string,
  notificationId: string,
) => {
  const devices = await accountRef(userId).collection('pushDevices').where('active', '==', true).limit(20).get();
  if (devices.empty) return { attempted: 0, sent: 0, failed: 0 };

  const title = cleanText(payload.title, 120) || 'Nightjar update';
  const message = cleanText(payload.message, 240) || 'Open Nightjar to view this update.';
  const tokens = devices.docs
    .map((doc) => cleanText(doc.data()?.token, 4096))
    .filter(Boolean);

  if (!tokens.length) return { attempted: 0, sent: 0, failed: 0 };

  const response = await getMessaging().sendEachForMulticast({
    tokens,
    data: {
      title,
      body: message,
      notificationId,
      type: cleanText(payload.type, 40),
      subtype: cleanText(payload.subtype, 60),
      route: notificationRouteFor(payload),
      displayMode,
    },
    webpush: {
      headers: { Urgency: ['message','payment','collaboration'].includes(cleanText(payload.type, 40)) ? 'high' : 'normal' },
    },
  });

  const invalidCodes = new Set([
    'messaging/registration-token-not-registered',
    'messaging/invalid-registration-token',
  ]);
  const writes: Promise<unknown>[] = [];

  response.responses.forEach((item, index) => {
    const doc = devices.docs.find((candidate) => cleanText(candidate.data()?.token, 4096) === tokens[index]);
    if (!doc) return;
    if (item.success) {
      writes.push(doc.ref.set({
        lastDeliveredAt: FieldValue.serverTimestamp(),
        lastError: null,
        deliverySuccessCount: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge:true }));
      return;
    }
    const errorCode = item.error?.code ?? 'messaging/unknown-error';
    writes.push(doc.ref.set({
      lastFailedAt: FieldValue.serverTimestamp(),
      lastError: cleanText(errorCode, 160),
      deliveryFailureCount: FieldValue.increment(1),
      active: invalidCodes.has(errorCode) ? false : true,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge:true }));
  });

  await Promise.allSettled(writes);
  return { attempted: tokens.length, sent: response.successCount, failed: response.failureCount };
};

export const registerPushDevice = onCall({ region: REGION }, async (request) => {
  const identity = await requireActiveIdentity(request);
  const input = (request.data ?? {}) as Record<string, unknown>;
  const token = cleanText(input.token, 4096);
  if (!token || token.length < 32) throw new HttpsError('invalid-argument', 'A valid push device token is required.');

  const tokenHash = createHash('sha256').update(token).digest('hex');
  const ref = accountRef(identity.uid).collection('pushDevices').doc(tokenHash);
  const existing = await ref.get();

  await ref.set({
    token,
    tokenHash,
    platform: cleanText(input.platform, 80) || 'web',
    userAgent: cleanText(input.userAgent, 500) || null,
    standalone: input.standalone === true,
    timezone: cleanText(input.timezone, 80) || null,
    active: true,
    permission: 'granted',
    lastRegisteredAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    ...(existing.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
  }, { merge:true });

  return { registered:true, deviceId: tokenHash.slice(0, 16) };
});

export const unregisterPushDevice = onCall({ region: REGION }, async (request) => {
  const identity = await requireActiveIdentity(request);
  const token = cleanText((request.data as Record<string, unknown> | undefined)?.token, 4096);
  if (!token) return { unregistered:false };
  const tokenHash = createHash('sha256').update(token).digest('hex');
  await accountRef(identity.uid).collection('pushDevices').doc(tokenHash).set({
    active:false,
    disabledAt:FieldValue.serverTimestamp(),
    updatedAt:FieldValue.serverTimestamp(),
  }, { merge:true });
  return { unregistered:true };
});

export const myPushNotificationStatus = onCall({ region: REGION }, async (request) => {
  const identity = await requireActiveIdentity(request);
  const snapshot = await accountRef(identity.uid).collection('pushDevices').limit(20).get();
  const devices = snapshot.docs.map((doc) => {
    const data = doc.data() ?? {};
    return {
      id: doc.id.slice(0, 16),
      active: data.active === true,
      platform: cleanText(data.platform, 80) || 'web',
      standalone: data.standalone === true,
      lastRegisteredAt: toIso(data.lastRegisteredAt),
      lastDeliveredAt: toIso(data.lastDeliveredAt),
      lastFailedAt: toIso(data.lastFailedAt),
      lastError: cleanText(data.lastError, 160) || null,
    };
  });
  return {
    activeDeviceCount: devices.filter((device) => device.active).length,
    devices,
  };
});

export const sendTestPushNotification = onCall({ region: REGION }, async (request) => {
  const identity = await requireActiveIdentity(request);
  const account = await accountRef(identity.uid).get();
  const stored = account.data()?.notificationPreferences ?? {};
  const displayMode = ['full','discreet','minimal'].includes(String(stored.displayMode ?? ''))
    ? String(stored.displayMode)
    : 'discreet';

  const ref = accountRef(identity.uid).collection('notifications').doc();
  const payload = displayMode === 'minimal'
    ? { type:'announcement', subtype:'push_test', title:'Nightjar update', message:'Open Nightjar to view this update.' }
    : { type:'announcement', subtype:'push_test', title:'Nightjar push test', message:'Push notifications are reaching this device successfully.' };

  await ref.set({
    ...payload,
    read:false,
    createdAt:FieldValue.serverTimestamp(),
  });

  const result = await deliverPushNotification(identity.uid, payload, displayMode, ref.id);
  if (!result.attempted) {
    throw new HttpsError('failed-precondition', 'No active Nightjar push device is registered for this account.', { code:'no_push_device' });
  }
  return result;
});

const createNotification = async (userId: string, payload: Record<string, unknown>) => {
  const account = await accountRef(userId).get();
  const preferences = account.data()?.notificationPreferences ?? {};
  const type = cleanText(payload.type, 40);
  const subtype = cleanText(payload.subtype, 60);
  const preferenceKey =
    type === 'message' || subtype === 'professional_message' || subtype === 'direct_message' ? 'messages'
      : type === 'comment' || subtype === 'comment' || subtype === 'release_comment' || subtype === 'release_reaction' ? 'comments'
        : type === 'collaboration' ? 'collaborations'
          : type === 'payment' || subtype === 'payment' ? 'payments'
            : type === 'content' && subtype === 'release' ? 'newReleases'
              : type === 'spotlight' || type === 'follow' || subtype === 'follow' ? 'followedProfiles'
                : type === 'announcement' ? 'announcements'
                  : null;
  if (preferenceKey && preferences[preferenceKey] === false) return;

  const displayMode = ['full','discreet','minimal'].includes(String(preferences.displayMode ?? ''))
    ? String(preferences.displayMode)
    : 'discreet';
  const safePayload = { ...payload };
  if (displayMode === 'minimal') {
    safePayload.title = 'Nightjar';
    safePayload.message = 'You have a new Nightjar notification.';
  } else if (displayMode === 'discreet') {
    safePayload.title = type === 'payment' || subtype === 'payment' ? 'Nightjar account update' : 'Nightjar update';
    safePayload.message = 'There is a new update waiting for you in Nightjar.';
  }

  const dedupeKey = cleanText(payload.dedupeKey, 240);
  const ref = dedupeKey
    ? accountRef(userId).collection('notifications').doc(createHash('sha256').update(dedupeKey).digest('hex').slice(0, 40))
    : accountRef(userId).collection('notifications').doc();
  const persistedPayload = { ...safePayload } as Record<string, unknown>;
  delete persistedPayload.dedupeKey;
  await ref.set({
    ...persistedPayload,
    read: false,
    createdAt: FieldValue.serverTimestamp(),
  }, { merge: Boolean(dedupeKey) });

  await deliverPushNotification(userId, safePayload, displayMode, ref.id).catch((error) => {
    console.warn('Nightjar push delivery failed', {
      userId,
      notificationId: ref.id,
      error: error instanceof Error ? error.message : String(error),
    });
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

  if (['start','progress','complete'].includes(eventType) && !identity.admin) {
    const grant = await accountRef(identity.uid).collection('playbackGrants').doc(releaseId).get();
    const expiresAtMs = Number(grant.data()?.expiresAtMs ?? 0);
    if (!grant.exists || !Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
      throw new HttpsError('failed-precondition', 'Open this release through Nightjar playback before recording listening activity.');
    }
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

  const subscription = identity.admin ? null : await activeListeningSubscriptionFor(identity.uid);
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
      ...decorateReleaseAccess(data, doc.id, identity.uid, { admin:identity.admin, subscription }),
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
  const [releasesSnapshot, listeningSnapshot, subscription] = await Promise.all([
    db.collection('releases').where('status', '==', 'released').limit(500).get(),
    db.collection('listeningEvents').limit(5000).get(),
    identity.admin ? Promise.resolve(null) : activeListeningSubscriptionFor(identity.uid),
  ]);
  const counts = new Map<string, number>();
  for (const doc of listeningSnapshot.docs) {
    const releaseId = cleanText(doc.data().releaseId, 160);
    if (releaseId) counts.set(releaseId, (counts.get(releaseId) ?? 0) + 1);
  }
  const trending = releasesSnapshot.docs
    .map((doc) => ({ ...decorateReleaseAccess(doc.data(), doc.id, identity.uid, { admin:identity.admin, subscription }), listeningEvents: counts.get(doc.id) ?? 0 }))
    .sort((a, b) => b.listeningEvents - a.listeningEvents)
    .slice(0, 24);
  return { trending };
});

const adminActionNotifications = async () => {
  const [intake, imageCount, releaseCount, reviewCount] = await Promise.all([
    db.collection('professionalApplications').where('status', 'in', ['banked','waitlist']).limit(250).get(),
    db.collection('imageAssets').where('status', '==', 'pending').count().get(),
    db.collection('releases').where('status', '==', 'pending_review').count().get(),
    db.collection('releaseReviews').where('status', '==', 'pending').count().get(),
  ]);
  const professionalCount = intake.docs.filter((doc) => {
    const item = doc.data() ?? {};
    const approved = new Set(cleanProfessionalRoles(item.approvedRoles));
    return cleanProfessionalRoles(item.requestedRoles).some((role) => !approved.has(role));
  }).length;
  const counts = [
    { id:'admin_action_professionals', subtype:'professional_approval', count:professionalCount, label:'professional role application', route:'/admin/approvals' },
    { id:'admin_action_images', subtype:'image_verification', count:imageCount.data().count, label:'image awaiting verification', route:'/admin/images' },
    { id:'admin_action_releases', subtype:'release_verification', count:releaseCount.data().count, label:'release awaiting moderation', route:'/admin?work=release-moderation' },
    { id:'admin_action_reviews', subtype:'review_verification', count:reviewCount.data().count, label:'review awaiting moderation', route:'/admin/reviews' },
  ];
  return counts.filter((item) => item.count > 0).map((item) => ({
    id:item.id,
    type:'admin_action',
    subtype:item.subtype,
    title:item.count + ' ' + item.label + (item.count === 1 ? '' : 's'),
    message:'Administrator action required. Open the relevant Nightjar review queue.',
    count:item.count,
    route:item.route,
    actionRequired:true,
    read:false,
    createdAt:new Date().toISOString(),
  }));
};

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
    messages: stored.messages !== false,
    announcements: stored.announcements !== false,
  };

  const enabled = (item: Record<string, any>) => {
    const type = String(item.type ?? '');
    const subtype = String(item.subtype ?? '');
    if (type === 'collaboration') return preferences.collaborations;
    if (type === 'payment' || subtype === 'payment') return preferences.payments;
    if (type === 'comment' || subtype === 'comment' || subtype === 'release_comment' || subtype === 'release_reaction') return preferences.comments;
    if (type === 'message' || subtype === 'professional_message' || subtype === 'direct_message') return preferences.messages;
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

  const regularNotifications = snapshot.docs
    .map((doc) => ({ id: doc.id, ...doc.data(), createdAt: toIso(doc.data().createdAt) }))
    .filter((item: any) => enabled(item))
    .sort((a: any, b: any) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')))
    .slice(0, 30)
    .map((item: any) => present(item));
  const ownerActions = identity.admin ? await adminActionNotifications().catch((error) => {
    console.warn('Nightjar owner action summary temporarily unavailable', error);
    return [] as Array<Record<string, unknown>>;
  }) : [];
  const notifications = [...ownerActions, ...regularNotifications].slice(0, 34);
  return {
    notifications,
    unreadCount: notifications.filter((item: any) => item.read !== true).length,
    ownerActionCount: ownerActions.length,
  };
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

export const ageStatus = onCall({
  region: REGION, secrets: [DIDIT_API_KEY, DIDIT_WORKFLOW_ID, DIDIT_ENVIRONMENT],
}, async request => {
  const identity = await requireActiveIdentity(request);
  const data = (await db.collection('ageAssurance').doc(identity.uid).get()).data() ?? {};
  const persistentlyVerified = diditPass(data);
  const bypass = persistentlyVerified ? { allowed: false, reason: null as string | null } : await temporaryAgeBypassFor(identity.uid);
  return {
    verified: persistentlyVerified || bypass.allowed,
    status: persistentlyVerified || bypass.allowed ? 'COMPLETE' : String(data.status ?? 'NOT_STARTED'),
    // The actual provider decision is separate from temporary test access.
    providerVerified: persistentlyVerified,
    providerStatus: String(data.status ?? 'NOT_STARTED'),
    livePilotAvailable: identity.admin && diditConfigured() && diditMode() === 'live',
    ageThreshold: 18,
    configured: diditConfigured(),
    provider: persistentlyVerified ? 'didit' : bypass.allowed ? 'temporary-test-access' : 'didit',
    environment: diditMode(), // Report ACTUAL configured provider mode even when tester bypass is active. Prevents chargeable live sessions being mislabelled as sandbox.
    verifiedAt: persistentlyVerified ? toIso(data.verifiedAt) : null,
    reverifyRequired: data.reverifyRequired === true,
    sessionActive: ['PENDING','IN_PROGRESS','PENDING_REVIEW','CREATING','RESUBMITTED'].includes(String(data.status ?? '')),
    temporaryBypass: bypass.allowed,
    temporaryBypassReason: bypass.reason,
    testAvailable: identity.admin || bypass.allowed,
  };
});

export const startAgeAssurance = onCall({
  region: REGION, secrets: [DIDIT_API_KEY, DIDIT_WORKFLOW_ID, DIDIT_ENVIRONMENT],
}, async request => {
  const identity = await requireActiveIdentity(request);
  const record = (await db.collection('ageAssurance').doc(identity.uid).get()).data() ?? {};
  if (diditPass(record)) return { verified: true, status: 'COMPLETE', configured: true, provider: 'didit', environment: 'live' };
  if (diditConfigured()) {
    if (DIDIT_LIVE_PILOT_ADMINS_ONLY && !identity.admin) {
      // Never charge or prompt closed-beta testers until Nightjar explicitly ends the pilot.
      const bypass = await temporaryAgeBypassFor(identity.uid);
      if (bypass.allowed) return {
        verified: true, status: 'COMPLETE', configured: true,
        provider: 'temporary-test-access', environment: 'development',
        temporaryBypass: true, temporaryBypassReason: bypass.reason,
      };
      throw new HttpsError('permission-denied', 'Live age verification is currently limited to Nightjar administrators.');
    }
    return startDiditSession(identity.uid);
  }
  const bypass = await temporaryAgeBypassFor(identity.uid);
  if (bypass.allowed) return {
    verified: true, status: 'COMPLETE', configured: false,
    provider: 'temporary-test-access', environment: 'development',
    temporaryBypass: true, temporaryBypassReason: bypass.reason,
  };
  throw new HttpsError('failed-precondition', 'Didit verification is not configured.');
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

const WRITER_SCRIPT_UPLOAD_MAX_BYTES = 8 * 1024 * 1024;
const WRITER_SCRIPT_UPLOAD_TYPES: Record<string, string> = {
  txt: 'text/plain',
  md: 'text/markdown',
  markdown: 'text/markdown',
  rtf: 'application/rtf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pdf: 'application/pdf',
};

const safeWriterUploadName = (value: unknown) => {
  const cleaned = String(value ?? '')
    .trim()
    .replace(/[\\/]+/g, '-')
    .replace(/[^a-zA-Z0-9._()\- ]+/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, 180);
  return cleaned || 'manuscript.txt';
};

const writerUploadExtension = (fileName: string) => {
  const match = fileName.toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1] ?? '';
};

const writerUploadPublicMeta = (value: unknown) => {
  const input = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const fileName = cleanText(input.fileName, 180);
  if (!fileName) return null;
  return {
    fileName,
    contentType: cleanText(input.contentType, 160) || 'application/octet-stream',
    sizeBytes: Math.max(0, Number(input.sizeBytes ?? 0)),
    uploadedAt: toIso(input.uploadedAt),
  };
};

const publicWriterPortfolioFor = async (userId: string) => {
  const snapshot = await db.collection('scripts').where('writerUserId', '==', userId).limit(500).get();
  return snapshot.docs
    .filter((doc) => ['Approved','Published'].includes(String(doc.data()?.status ?? '')))
    .map((doc) => {
      const data = doc.data() ?? {};
      const marketplace = normaliseScriptMarketplace(data.marketplace);
      const rights = normaliseScriptRights(data.rights);
      return {
        id:doc.id,
        title:cleanText(data.title,180) || 'Untitled manuscript',
        synopsis:marketplace.synopsis,
        genres:marketplace.genres,
        tropes:marketplace.tropes,
        visibility:marketplace.visibility,
        collaborationWanted:marketplace.collaborationWanted,
        editorWanted:marketplace.editorWanted,
        licenceType:rights.licenceType,
        commercialUse:rights.commercialUse,
        status:cleanText(data.status,40),
        updatedAt:toIso(data.updatedAt),
      };
    })
    .filter((item) => ['marketplace','licensed'].includes(item.visibility) && Boolean(item.synopsis))
    .sort((a,b) => String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')))
    .slice(0,24);
};

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
  sourceFile: writerUploadPublicMeta(data.originalUpload),
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

export const uploadWriterScriptFile = onCall({
  region: REGION,
  timeoutSeconds: 120,
  memory: '512MiB',
}, async (request) => {
  const identity = await requireAccountRole(request, ['writer']);
  const input = (request.data ?? {}) as Record<string, unknown>;
  const fileName = safeWriterUploadName(input.fileName);
  const extension = writerUploadExtension(fileName);
  const contentType = WRITER_SCRIPT_UPLOAD_TYPES[extension];
  if (!contentType) {
    throw new HttpsError(
      'invalid-argument',
      'Upload TXT, Markdown, RTF, DOC, DOCX or PDF manuscripts.',
      { code: 'unsupported_script_file' },
    );
  }

  const dataUrl = String(input.dataUrl ?? '');
  const comma = dataUrl.indexOf(',');
  if (comma < 0 || !/;base64$/i.test(dataUrl.slice(0, comma))) {
    throw new HttpsError('invalid-argument', 'The manuscript upload was not encoded correctly.');
  }

  let bytes: Buffer;
  try {
    bytes = Buffer.from(dataUrl.slice(comma + 1), 'base64');
  } catch {
    throw new HttpsError('invalid-argument', 'The manuscript upload could not be decoded.');
  }
  if (!bytes.length || bytes.length > WRITER_SCRIPT_UPLOAD_MAX_BYTES) {
    throw new HttpsError(
      'invalid-argument',
      'Manuscript files must be larger than 0 bytes and no more than 8 MB.',
      { code: 'script_file_size_invalid', maxBytes: WRITER_SCRIPT_UPLOAD_MAX_BYTES },
    );
  }

  if (extension === 'pdf' && bytes.subarray(0, 5).toString('ascii') !== '%PDF-') {
    throw new HttpsError('invalid-argument', 'That file does not appear to be a valid PDF.');
  }
  if (extension === 'docx' && !(bytes[0] === 0x50 && bytes[1] === 0x4b)) {
    throw new HttpsError('invalid-argument', 'That file does not appear to be a valid DOCX file.');
  }
  if (extension === 'doc') {
    const oleHeader = Buffer.from([0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1]);
    if (!bytes.subarray(0, 8).equals(oleHeader)) {
      throw new HttpsError('invalid-argument', 'That file does not appear to be a valid DOC file.');
    }
  }

  const titleFromFile = fileName.replace(/\.[^.]+$/, '').trim();
  const title = cleanText(input.title, 180) || cleanText(titleFromFile, 180) || 'Untitled manuscript';
  const extractedContent = ['txt','md','markdown'].includes(extension)
    ? bytes.toString('utf8').replace(/^\uFEFF/, '').slice(0, 200000)
    : '';

  const ref = db.collection('scripts').doc();
  const storagePath = 'script-uploads/' + identity.uid + '/' + ref.id + '/' + randomUUID() + '-' + fileName;
  const file = getStorage().bucket().file(storagePath);

  await file.save(bytes, {
    resumable: false,
    metadata: {
      contentType,
      cacheControl: 'private, no-store, max-age=0',
      contentDisposition: (extension === 'pdf' ? 'inline' : 'attachment') + '; filename="' + fileName.replace(/"/g, '') + '"',
      metadata: {
        writerUserId: identity.uid,
        scriptId: ref.id,
        purpose: 'protected-manuscript-source',
      },
    },
  });

  try {
    await ref.set({
      title,
      content: extractedContent,
      status: 'Draft',
      access: 'Private',
      version: 1,
      writerUserId: identity.uid,
      editorUserId: null,
      lastEditorialComment: null,
      originalUpload: {
        fileName,
        contentType,
        sizeBytes: bytes.length,
        storagePath,
        uploadedAt: FieldValue.serverTimestamp(),
      },
      rights: normaliseScriptRights(null),
      marketplace: normaliseScriptMarketplace(null),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  } catch (error) {
    await file.delete({ ignoreNotFound: true }).catch(() => undefined);
    throw error;
  }

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
  const originalStoragePath = cleanText(data.originalUpload?.storagePath, 500);
  batch.delete(ref);
  await batch.commit();
  if (originalStoragePath) {
    await getStorage().bucket().file(originalStoragePath).delete({ ignoreNotFound: true }).catch(() => undefined);
  }
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
      sourceFile: writerUploadPublicMeta(data.originalUpload),
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
  await requireProfessionalLegalTerms(identity.uid);
  const scriptId = cleanText((request.data as { scriptId?: unknown } | undefined)?.scriptId, 160);
  const ref = scriptRef(scriptId);
  const snapshot = await ref.get();
  const data = snapshot.data();
  if (!data || data.writerUserId !== identity.uid) throw new HttpsError('not-found', 'Script not found.');
  if (!cleanText(data.content, 200000) && !cleanText(data.originalUpload?.storagePath, 500)) {
    throw new HttpsError('failed-precondition', 'Add manuscript content or upload a source manuscript before submitting.');
  }
  const rights = normaliseScriptRights(data.rights);
  if (rights.ownershipAttested !== true || rights.contributorPermissionsConfirmed !== true) {
    throw new HttpsError(
      'failed-precondition',
      'Confirm manuscript ownership/authority and any contributor permissions in Rights & Licensing before submitting.',
      { code:'content_rights_attestation_required' },
    );
  }
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

const createSecurityAlertFirebase = async (userId: string | null, details: Record<string, unknown>) => {
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

const resolveAuthenticationTarget = async (email: string) => {
  try {
    const record = await getAuth().getUserByEmail(email);
    return record.uid;
  } catch {
    return null;
  }
};

const assessAuthenticationFailureFirebase = async (
  eventId: string,
  record: Record<string, any>,
) => {
  const now = Date.now();
  const snapshot = await db.collection('authenticationEvents').limit(750).get();
  const events = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as any[];
  const fifteenMinutes = events.filter((item) => now - authenticationEventMillis(item) < 15 * 60_000);
  const sameTarget = fifteenMinutes.filter((item) => item.emailHash === record.emailHash);
  const sameClient = record.clientAttemptId
    ? fifteenMinutes.filter((item) => item.clientAttemptId === record.clientAttemptId)
    : [];

  let score = 10;
  const reasons: string[] = [];

  if (sameTarget.length >= 3) {
    score += 35;
    reasons.push(String(sameTarget.length) + ' failed or blocked sign-in attempts against the same account within 15 minutes');
  }
  if (sameTarget.length >= 5) {
    score += 15;
    reasons.push('repeated credential attempts continued beyond the initial alert threshold');
  }
  if (sameClient.length >= 8) {
    score += 15;
    reasons.push('high-volume failed sign-in activity from the same Nightjar client token');
  }
  if (record.firebaseCode === 'auth/too-many-requests') {
    score += 45;
    reasons.push('Firebase rate limiting reported too many authentication attempts');
  }
  if (record.adminTarget === true) {
    score += 15;
    reasons.push('an owner administrator identity was targeted');
  }
  if (record.eventType === 'closed_beta_signin_denied') {
    score += 5;
    reasons.push('the sign-in identity was outside the private testing allowlist');
  }

  if (score < 45) return null;

  const alertSnapshot = await db.collection('securityAlerts').limit(500).get();
  const duplicate = alertSnapshot.docs.some((doc) => {
    const data = doc.data();
    return data.category === 'authentication'
      && data.status === 'open'
      && data.emailHash === record.emailHash
      && now - (data.createdAt?.toMillis?.() ?? 0) < 10 * 60_000;
  });
  if (duplicate) return null;

  const severity = score >= 80 ? 'critical' : score >= 60 ? 'high' : 'medium';
  const alertId = await createSecurityAlertFirebase(record.targetUserId ?? null, {
    category: 'authentication',
    severity,
    riskScore: Math.min(score, 100),
    reason: reasons.join('; ') || 'Repeated Nightjar-observed authentication failures require review.',
    relatedId: null,
    emailHash: record.emailHash,
    targetEmailMasked: record.targetEmailMasked,
    targetUserId: record.targetUserId ?? null,
    signal: {
      eventType: record.eventType,
      failedAttempts15m: sameTarget.length,
      sameClientAttempts15m: sameClient.length,
      firebaseCode: record.firebaseCode ?? null,
      clientPlatform: record.clientPlatform ?? null,
      route: record.route ?? '/account',
      evidenceQuality: 'nightjar_client_observed',
      latestAuthenticationEventId: eventId,
    },
    automaticAction: 'none',
    reviewRequired: true,
  });
  return { alertId, severity, riskScore: Math.min(score, 100) };
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

  let sourceFile: null | { fileName: string; contentType: string; sizeBytes: number; url: string; expiresAt: string } = null;
  const originalStoragePath = cleanText(script.originalUpload?.storagePath, 500);
  if (originalStoragePath) {
    const sourceExpiresAt = new Date(Date.now() + 15 * 60 * 1000);
    const [url] = await getStorage().bucket().file(originalStoragePath).getSignedUrl({
      action: 'read',
      expires: sourceExpiresAt,
    });
    sourceFile = {
      fileName: cleanText(script.originalUpload?.fileName, 180) || 'manuscript',
      contentType: cleanText(script.originalUpload?.contentType, 160) || 'application/octet-stream',
      sizeBytes: Math.max(0, Number(script.originalUpload?.sizeBytes ?? 0)),
      url,
      expiresAt: sourceExpiresAt.toISOString(),
    };
  }

  return {
    script: scriptPayload(script, scriptId, true),
    sourceFile,
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

export const recordAuthenticationAttempt = onCall({ region: REGION }, async (request) => {
  const input = (request.data ?? {}) as Record<string, unknown>;
  const email = cleanEmail(input.email);
  if (!validEmailAddress(email)) return { recorded: false, alert: null };

  const eventType = cleanText(input.eventType, 80);
  if (!['signin_failed','closed_beta_signin_denied'].includes(eventType)) {
    throw new HttpsError('invalid-argument', 'Unsupported authentication event type.');
  }

  const allowedCodes = new Set([
    'auth/invalid-credential',
    'auth/too-many-requests',
    'auth/user-disabled',
    'auth/invalid-email',
    'closed_beta_not_invited',
    'auth/unknown',
  ]);
  const submittedCode = cleanText(input.firebaseCode, 80);
  const firebaseCode = allowedCodes.has(submittedCode) ? submittedCode : 'auth/unknown';
  const emailHash = createHash('sha256').update(email).digest('hex');
  const targetUserId = await resolveAuthenticationTarget(email);
  const clientAttemptId = cleanText(input.clientAttemptId, 120) || null;

  const recentSnapshot = await db.collection('authenticationEvents').limit(750).get();
  const now = Date.now();
  const recentEvents = recentSnapshot.docs.map((doc) => doc.data()).filter((data) => now - authenticationEventMillis(data) < 15 * 60_000);
  const sameTargetRecent = recentEvents.filter((data) => data.emailHash === emailHash);
  const sameClientRecent = clientAttemptId ? recentEvents.filter((data) => data.clientAttemptId === clientAttemptId) : [];
  if (sameTargetRecent.length >= 60 || sameClientRecent.length >= 120) {
    return { recorded: false, throttled: true, alert: null };
  }

  const record = {
    eventType,
    emailHash,
    targetEmailMasked: maskSecurityEmail(email),
    targetUserId,
    adminTarget: ADMIN_EMAILS.has(email),
    firebaseCode,
    clientAttemptId,
    clientPlatform: cleanText(input.clientPlatform, 120) || null,
    route: cleanText(input.route, 160) || '/account',
    evidenceQuality: 'nightjar_client_observed',
    passwordCaptured: false,
    retentionUntil: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    createdAt: FieldValue.serverTimestamp(),
  };
  const ref = await db.collection('authenticationEvents').add(record);
  const alert = await assessAuthenticationFailureFirebase(ref.id, { ...record, createdAt: new Date().toISOString() });
  return { recorded: true, eventId: ref.id, alert };
});

export const recordAuthenticationSuccess = onCall({ region: REGION }, async (request) => {
  const identity = requireVerifiedIdentity(request);
  const input = (request.data ?? {}) as Record<string, unknown>;
  const clientAttemptId = cleanText(input.clientAttemptId, 120);
  if (!clientAttemptId) return { recorded:false, newDevice:false };

  const clientPlatform = cleanText(input.clientPlatform, 120) || null;
  const route = cleanText(input.route, 160) || '/account';
  const deviceKey = createHash('sha256').update(identity.uid + ':' + clientAttemptId).digest('hex').slice(0, 48);
  const deviceRef = accountRef(identity.uid).collection('authDevices').doc(deviceKey);
  const device = await deviceRef.get();
  const newDevice = !device.exists;

  await deviceRef.set({
    deviceKey,
    clientAttemptIdHash: createHash('sha256').update(clientAttemptId).digest('hex'),
    clientPlatform,
    firstSeenAt: device.exists ? device.data()?.firstSeenAt ?? FieldValue.serverTimestamp() : FieldValue.serverTimestamp(),
    lastSeenAt: FieldValue.serverTimestamp(),
    lastRoute: route,
  }, { merge:true });

  const activityRef = accountRef(identity.uid).collection('signInActivity').doc();
  await activityRef.set({
    eventType:'signin_success',
    clientPlatform,
    route,
    newDevice,
    passwordCaptured:false,
    retentionUntil:new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    createdAt:FieldValue.serverTimestamp(),
  });

  if (newDevice) {
    await createNotification(identity.uid, {
      type:'account_security',
      subtype:'new_signin_device',
      title:'New Nightjar sign-in',
      message:clientPlatform
        ? 'Nightjar was signed into from a new app or browser profile: ' + clientPlatform + '.'
        : 'Nightjar was signed into from a new app or browser profile.',
      dedupeKey:'new-signin-device:' + deviceKey,
      route:'/profile',
    });
  }

  return { recorded:true, newDevice };
});

export const listMySignInActivity = onCall({ region: REGION }, async (request) => {
  const identity = requireVerifiedIdentity(request);
  const snapshot = await accountRef(identity.uid).collection('signInActivity').limit(50).get();
  const activity = snapshot.docs
    .map((doc) => {
      const data = doc.data() ?? {};
      return {
        id:doc.id,
        eventType:'signin_success',
        clientPlatform:cleanText(data.clientPlatform,120) || null,
        route:cleanText(data.route,160) || null,
        newDevice:data.newDevice === true,
        createdAt:toIso(data.createdAt),
      };
    })
    .sort((a,b)=>String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')))
    .slice(0,20);
  return { activity };
});

export const listAuthenticationEvents = onCall({ region: REGION }, async (request) => {
  requireAdminIdentity(request);
  const snapshot = await db.collection('authenticationEvents').limit(500).get();
  const events = snapshot.docs
    .map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        eventType: cleanText(data.eventType, 80),
        targetEmailMasked: cleanText(data.targetEmailMasked, 180) || 'unknown account',
        targetUserId: cleanText(data.targetUserId, 160) || null,
        adminTarget: data.adminTarget === true,
        firebaseCode: cleanText(data.firebaseCode, 80) || null,
        clientAttemptId: cleanText(data.clientAttemptId, 120) || null,
        clientPlatform: cleanText(data.clientPlatform, 120) || null,
        route: cleanText(data.route, 160) || '/account',
        evidenceQuality: cleanText(data.evidenceQuality, 80) || 'nightjar_client_observed',
        createdAt: toIso(data.createdAt),
      };
    })
    .sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')));
  return { events };
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
        category: cleanText(data.category, 80) || 'protected_content',
        targetEmailMasked: cleanText(data.targetEmailMasked, 180) || null,
        targetUserId: cleanText(data.targetUserId, 160) || null,
        createdAt: toIso(data.createdAt),
      };
    })
    .sort((a: any, b: any) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')));
  return { alerts };
});

export const securityAlertEvidence = onCall({ region: REGION }, async (request) => {
  requireAdminIdentity(request);
  const alertId = cleanText((request.data as { alertId?: unknown } | undefined)?.alertId, 160);
  if (!alertId) throw new HttpsError('invalid-argument', 'Security alert is required.');

  const alert = await db.collection('securityAlerts').doc(alertId).get();
  const alertData = alert.data();
  if (!alertData) throw new HttpsError('not-found', 'Security alert not found.');

  const userId = cleanText(alertData.userId, 160);
  const relatedId = cleanText(alertData.relatedId, 160);
  const authenticationAlert = cleanText(alertData.category, 80) === 'authentication';
  const snapshot = authenticationAlert
    ? await db.collection('authenticationEvents').where('emailHash', '==', cleanText(alertData.emailHash, 100)).limit(100).get()
    : await db.collection('protectionEvents').where('userId', '==', userId).limit(1000).get();
  const evidence = snapshot.docs
    .map((doc) => {
      const data = doc.data() ?? {};
      return authenticationAlert ? {
        id: doc.id,
        eventType: cleanText(data.eventType, 80),
        relatedType: 'authentication',
        relatedId: null,
        deviceId: cleanText(data.clientAttemptId, 120) || null,
        readerSessionId: null,
        clientPlatform: cleanText(data.clientPlatform, 120) || null,
        visibilityState: null,
        viewport: null,
        detectionSource: 'nightjar_account_portal',
        detectionConfidence: 'contextual',
        route: cleanText(data.route, 160) || '/account',
        summary: (cleanText(data.targetEmailMasked, 180) || 'Nightjar account') + ' · ' + (cleanText(data.firebaseCode, 80) || 'authentication failure'),
        createdAt: toIso(data.createdAt),
      } : {
        id: doc.id,
        eventType: cleanText(data.eventType, 80),
        relatedType: cleanText(data.relatedType, 80) || null,
        relatedId: cleanText(data.relatedId, 160) || null,
        deviceId: cleanText(data.deviceId, 180) || null,
        readerSessionId: cleanText(data.readerSessionId, 180) || null,
        clientPlatform: cleanText(data.clientPlatform, 120) || null,
        visibilityState: cleanText(data.visibilityState, 40) || null,
        viewport: cleanText(data.viewport, 80) || null,
        detectionSource: cleanText(data.detectionSource, 120) || null,
        detectionConfidence: cleanText(data.detectionConfidence, 32) || null,
        route: cleanText(data.route, 240) || null,
        summary: cleanText(data.summary, 800) || null,
        createdAt: toIso(data.createdAt),
      };
    })
    .sort((a, b) => {
      const relatedOrder = Number(Boolean(b.relatedId && b.relatedId === relatedId)) - Number(Boolean(a.relatedId && a.relatedId === relatedId));
      return relatedOrder || String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? ''));
    })
    .slice(0, 100);

  return {
    alert: {
      id: alert.id,
      userId,
      relatedId: relatedId || null,
      severity: alertData.severity ?? 'medium',
      riskScore: Number(alertData.riskScore ?? 0),
      reason: cleanText(alertData.reason, 1200) || null,
      signal: alertData.signal ?? null,
      status: alertData.status ?? 'open',
      category: cleanText(alertData.category, 80) || 'protected_content',
      targetEmailMasked: cleanText(alertData.targetEmailMasked, 180) || null,
      targetUserId: cleanText(alertData.targetUserId, 160) || null,
      createdAt: toIso(alertData.createdAt),
    },
    evidence,
  };
});

export const suspendFromSecurityAlert = onCall({ region: REGION }, async (request) => {
  const admin = requireAdminIdentity(request);
  const alertId = cleanText((request.data as { alertId?: unknown } | undefined)?.alertId, 160);
  const alertRef = db.collection('securityAlerts').doc(alertId);
  const alert = await alertRef.get();
  const data = alert.data();
  if (!data) throw new HttpsError('not-found', 'Security alert not found.');
  if (cleanText(data.category, 80) === 'authentication') {
    throw new HttpsError('failed-precondition', 'Failed-login alerts are evidence only and cannot suspend the targeted account.');
  }

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
  if (cleanText(data.category, 80) === 'authentication') {
    throw new HttpsError('failed-precondition', 'A failed-login alert has no authenticated reader session to revoke.');
  }
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
    ownershipAttested: input.ownershipAttested === true,
    contributorPermissionsConfirmed: input.contributorPermissionsConfirmed === true,
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

// Admin-only, read-only visibility diagnostic using the SAME public listing
// eligibility rule as listScriptMarketplace. No manuscript contents, protected
// reader tokens, permissions or private source-file paths are returned.
export const adminPreviewScriptMarketplace = onCall({ region: REGION }, async (request) => {
  requireAdminIdentity(request);
  const snapshot = await db.collection('scripts').limit(1000).get();
  const diagnostics = snapshot.docs.map((doc) => {
    const data = doc.data() ?? {};
    const listing = normaliseScriptMarketplace(data.marketplace);
    const status = cleanText(data.status, 50) || 'Draft';
    const visible = listing.visibility === 'marketplace' && ['Approved','Published'].includes(status);
    const reasons = [
      ...(!['Approved','Published'].includes(status) ? ['Not approved or published'] : []),
      ...(listing.visibility !== 'marketplace' ? ['Not listed in the marketplace'] : []),
    ];
    return {
      id: doc.id,
      title: cleanText(data.title, 200) || 'Untitled manuscript',
      status,
      visibility: listing.visibility,
      visibleToProfessionals: visible,
      reasons,
    };
  }).sort((a,b) => a.title.localeCompare(b.title));
  return {
    diagnostics,
    eligible: diagnostics.filter((entry) => entry.visibleToProfessionals).length,
    total: diagnostics.length,
    rule: 'Approved or Published AND marketplace visibility. No protected script text is included.',
  };
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

  const allowedRoles = new Set(['creator','writer','editor','artist']);
  const people = (await Promise.all(snapshot.docs
    .filter((doc) => doc.id !== identity.uid && doc.data().status === 'active' && professionalRolesForAccount(doc.data() ?? {}).some((role) => allowedRoles.has(role)))
    .map(async (doc) => {
      const profile = await profileRef(doc.id).get();
      const data = profile.data();
      if (!data || data.publicProfile === false) return null;
      const roles = professionalRolesForAccount(doc.data() ?? {});
      const role = roles[0] ?? null;
      return {
        userId: doc.id,
        role,
        roles,
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
        activityBadges: publicActivityBadges(String(role ?? ''), {
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

// Professional messaging is implemented by the directConversations system below.
// The earlier parallel professionalConversations implementation was retired to keep one
// authoritative permission, moderation, unread and rate-limit model.

const calculateCreatorRate = (settings: CommercialSettings, activePaidSubscribers: number) => {
  let rate = 0;
  for (const band of settings.creatorRateBands) {
    if (activePaidSubscribers >= band.minPaidSubscribers) rate = band.monthlyRatePence;
  }
  if (settings.creatorMonthlyCapPence != null) rate = Math.min(rate, settings.creatorMonthlyCapPence);
  return Math.max(0, Math.round(rate));
};

export const creatorCompensationStatus = onCall({ region: REGION }, async (request) => {
  const identity = await requireAccountRole(request, ['admin']);
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
      messages: stored.messages !== false,
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
    messages: input.messages !== false,
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
  const profileData = profile.data() ?? {};
  const listenerProfile = profileData.roleProfiles && typeof profileData.roleProfiles === 'object'
    ? profileData.roleProfiles.listener ?? {}
    : {};
  const publicPlaylistIds = new Set(cleanStringList(listenerProfile.featuredPortfolioIds ?? profileData.featuredPortfolioIds, 6));
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
  const profileData = profile.data() ?? {};
  const roleProfiles = profileData.roleProfiles && typeof profileData.roleProfiles === 'object'
    ? { ...profileData.roleProfiles }
    : {};
  const listenerProfile = roleProfiles.listener && typeof roleProfiles.listener === 'object'
    ? { ...roleProfiles.listener }
    : {};
  const current = cleanStringList(listenerProfile.featuredPortfolioIds ?? profileData.featuredPortfolioIds, 6);
  const has = current.includes(playlistId);
  let next = current;

  if (visible && !has) {
    if (current.length >= 6) throw new HttpsError('failed-precondition', 'You can share up to six playlists on your public profile.');
    next = [...current, playlistId];
  } else if (!visible && has) {
    next = current.filter((id) => id !== playlistId);
  }

  roleProfiles.listener = {
    ...listenerProfile,
    featuredPortfolioIds: next,
  };
  await profileRef(identity.uid).set({
    roleProfiles,
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
  const profileData = profile.data() ?? {};
  const roleProfiles = profileData.roleProfiles && typeof profileData.roleProfiles === 'object'
    ? { ...profileData.roleProfiles }
    : {};
  const listenerProfile = roleProfiles.listener && typeof roleProfiles.listener === 'object'
    ? { ...roleProfiles.listener }
    : {};
  const featuredPortfolioIds = cleanStringList(listenerProfile.featuredPortfolioIds ?? profileData.featuredPortfolioIds, 6)
    .filter((id) => id !== playlistId);
  roleProfiles.listener = {
    ...listenerProfile,
    featuredPortfolioIds,
  };
  await profileRef(identity.uid).set({ roleProfiles, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return { deleted: true, playlistId };
});

export const transparencySnapshot = onCall({ region: REGION }, async (request) => {
  const identity = await requireActiveIdentity(request);
  await requireAgeVerified(identity.uid);
  const [settings, accounts] = await Promise.all([
    readCommercialSettings(),
    db.collection('accounts').limit(2000).get(),
  ]);
  const counts = { creators: 0, writers: 0, editors: 0, artists: 0 };
  for (const doc of accounts.docs) {
    if (doc.data().status !== 'active') continue;
    const roles = professionalRolesForAccount(doc.data() ?? {});
    if (roles.includes('creator')) counts.creators += 1;
    if (roles.includes('writer')) counts.writers += 1;
    if (roles.includes('editor')) counts.editors += 1;
    if (roles.includes('artist')) counts.artists += 1;
  }
  return {
    planningMonthlyPricePence: settings.planningMonthlyPricePence,
    compensationModel: settings.compensationModel,
    creatorMonthlyCapPence: settings.creatorMonthlyCapPence,
    popularityAffectsBaseRate: false,
    tipsEnabled: settings.tipsEnabled,
    individualPurchasesEnabled: settings.individualPurchasesEnabled,
    listenerSubscriptionUrl: settings.listenerSubscriptionUrl,
    activeCreativeAccounts: counts,
    principles: [
      'Creators are paid against a published capped standard rate rather than popularity.',
      'Verified listening remains an analytics and discovery signal, not the standard-rate formula.',
      'Writers retain copyright unless an explicit agreement says otherwise.',
      'Nightjar does not permit AI training on protected manuscripts by default.',
    ],
  };
});



const CREATIVE_MESSAGE_ROLES = new Set(['creator','writer','editor','artist']);
const directConversationId = (a: string, b: string) => createHash('sha256').update([a,b].sort().join('\u0000')).digest('hex');

const directMessagingBlockState = async (a: string, b: string) => {
  const [aBlocksB,bBlocksA] = await Promise.all([
    accountRef(a).collection('messageBlocks').doc(b).get(),
    accountRef(b).collection('messageBlocks').doc(a).get(),
  ]);
  return {
    blockedByMe:aBlocksB.exists,
    blockedByOther:bBlocksA.exists,
    blocked:aBlocksB.exists || bBlocksA.exists,
  };
};

const directMessagingBlockedBetween = async (a: string, b: string) => (await directMessagingBlockState(a,b)).blocked;

const messagingCollaborationContext = async (collaborationId: string, userA: string, userB: string) => {
  if (!collaborationId) return null;
  const snapshot = await db.collection('collaborationProposals').doc(collaborationId).get();
  const data = snapshot.data();
  if (!data) throw new HttpsError('not-found', 'Collaboration context not found.');
  const participants = new Set([cleanText(data.writerUserId, 160), cleanText(data.recipientUserId, 160)].filter(Boolean));
  if (!participants.has(userA) || !participants.has(userB)) {
    throw new HttpsError('permission-denied', 'That collaboration is not shared by both message participants.');
  }
  return {
    id: snapshot.id,
    title: cleanText(data.scriptTitle, 180) || 'Nightjar collaboration',
    status: cleanText(data.status, 40) || null,
  };
};

const commentPayload = (data: Record<string, any>, id: string) => ({
  id,
  releaseId: data.releaseId ?? null,
  userId: data.userId ?? null,
  commenterName: data.commenterName ?? 'Nightjar member',
  commenterHandle: data.commenterHandle ?? null,
  commenterRole: cleanText(data.commenterRole, 40) || 'listener',
  teamReply: data.teamReply === true,
  parentCommentId: cleanText(data.parentCommentId, 160) || null,
  replyToUserId: cleanText(data.replyToUserId, 160) || null,
  body: cleanText(data.body, 1200),
  status: data.status ?? 'visible',
  createdAt: toIso(data.createdAt),
  updatedAt: toIso(data.updatedAt),
});

const hideReleaseCommentReplies = async (parentCommentId: string, status: 'parent_deleted' | 'parent_removed') => {
  const replies = await db.collection('releaseComments').where('parentCommentId', '==', parentCommentId).limit(500).get();
  if (replies.empty) return;
  const batch = db.batch();
  for (const reply of replies.docs) {
    batch.set(reply.ref, {
      status,
      updatedAt:FieldValue.serverTimestamp(),
    }, { merge:true });
  }
  await batch.commit();
};

const directMessagePayload = (data: Record<string, any>, id: string) => ({
  id,
  conversationId: data.conversationId ?? null,
  senderUserId: data.senderUserId ?? null,
  senderName: data.senderName ?? 'Nightjar member',
  body: data.status === 'removed_by_admin' ? '' : cleanText(data.body, 4000),
  status: data.status ?? 'visible',
  collaborationId: data.collaborationId ?? null,
  readBy: Array.isArray(data.readBy) ? data.readBy.map(String) : [],
  readAt: data.readAt && typeof data.readAt === 'object' ? data.readAt : {},
  createdAt: toIso(data.createdAt),
  updatedAt: toIso(data.updatedAt),
});

const releaseCommunityState = async (releaseId: string, viewerUserId: string) => {
  const [legacyLoves, reactionsSnapshot, commentsSnapshot] = await Promise.all([
    db.collection('releaseLoves').where('releaseId', '==', releaseId).limit(5000).get(),
    db.collection('releaseReactions').where('releaseId', '==', releaseId).limit(5000).get(),
    db.collection('releaseComments').where('releaseId', '==', releaseId).limit(500).get(),
  ]);

  const reactionByUser = new Map<string,string>();
  for (const doc of reactionsSnapshot.docs) {
    const data = doc.data();
    const userId = cleanText(data.userId, 160);
    const reaction = cleanText(data.reaction, 20);
    if (userId && ['like','love'].includes(reaction)) reactionByUser.set(userId, reaction);
  }
  for (const doc of legacyLoves.docs) {
    const userId = cleanText(doc.data().userId, 160);
    if (userId && !reactionByUser.has(userId)) reactionByUser.set(userId, 'love');
  }

  let likes = 0;
  let loves = 0;
  for (const reaction of reactionByUser.values()) {
    if (reaction === 'like') likes += 1;
    if (reaction === 'love') loves += 1;
  }

  const comments = commentsSnapshot.docs
    .filter((doc) => doc.data().status === 'visible')
    .map((doc) => commentPayload(doc.data(), doc.id))
    .sort((a,b) => String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? '')));

  const myReaction = reactionByUser.get(viewerUserId) ?? null;
  return {
    comments,
    reactions:{ likes, loves, total:likes + loves, myReaction },
    loveCount:loves,
    lovedByMe:myReaction === 'love',
  };
};

const syncReleaseCommunitySummary = async (releaseId: string, viewerUserId = '') => {
  const state = await releaseCommunityState(releaseId, viewerUserId);
  await releaseRef(releaseId).set({
    communityLikeCount: state.reactions.likes,
    communityLoveCount: state.reactions.loves,
    communityReactionCount: state.reactions.total,
    communityCommentCount: state.comments.length,
    communitySummaryUpdatedAt: FieldValue.serverTimestamp(),
  }, { merge:true });
  return state;
};


export const releaseReactionState = onCall({ region: REGION }, async (request) => {
  const identity = await requireActiveIdentity(request);
  await requireAgeVerified(identity.uid);
  const account = identity.admin ? null : await accountRef(identity.uid).get();
  const viewerRole = identity.admin ? 'admin' : String(account?.data()?.role ?? '');
  if (viewerRole !== 'listener') return { reactions: [] };
  const [snapshot, legacyLoves] = await Promise.all([
    db.collection('releaseReactions').where('userId', '==', identity.uid).limit(1000).get(),
    db.collection('releaseLoves').where('userId', '==', identity.uid).limit(1000).get(),
  ]);
  const reactionByRelease = new Map<string,'like'|'love'>();
  for (const doc of snapshot.docs) {
    const releaseId = cleanText(doc.data().releaseId, 160);
    const reaction = cleanText(doc.data().reaction, 20);
    if (releaseId && (reaction === 'like' || reaction === 'love')) reactionByRelease.set(releaseId, reaction);
  }
  for (const doc of legacyLoves.docs) {
    const releaseId = cleanText(doc.data().releaseId, 160);
    if (releaseId && !reactionByRelease.has(releaseId)) reactionByRelease.set(releaseId, 'love');
  }
  return { reactions:[...reactionByRelease.entries()].map(([releaseId,reaction]) => ({ releaseId,reaction })) };
});

export const releaseCommunity = onCall({ region: REGION }, async (request) => {
  const identity = await requireActiveIdentity(request);
  await requireAgeVerified(identity.uid);
  const releaseId = cleanText((request.data as { releaseId?: unknown } | undefined)?.releaseId, 160);
  if (!releaseId) throw new HttpsError('invalid-argument', 'Release is required.');
  const release = await releaseRef(releaseId).get();
  if (!release.exists || release.data()?.status !== 'released') throw new HttpsError('not-found', 'Published release not found.');
  const account = identity.admin ? null : await accountRef(identity.uid).get();
  const viewerRole = identity.admin ? 'admin' : String(account?.data()?.role ?? '');
  const state = await releaseCommunityState(releaseId, identity.uid);
  return { ...state, canInteract:viewerRole === 'listener' };
});

export const setReleaseReaction = onCall({ region: REGION }, async (request) => {
  const identity = await requireAccountRole(request, ['listener']);
  await requireAgeVerified(identity.uid);
  const input = (request.data ?? {}) as Record<string, unknown>;
  const releaseId = cleanText(input.releaseId, 160);
  const reaction = cleanText(input.reaction, 20);
  if (!releaseId) throw new HttpsError('invalid-argument', 'Release is required.');
  if (reaction && !['like','love'].includes(reaction)) throw new HttpsError('invalid-argument', 'Choose Like or Love.');

  const release = await releaseRef(releaseId).get();
  const releaseData = release.data();
  if (!releaseData || releaseData.status !== 'released') throw new HttpsError('not-found', 'Published release not found.');

  const reactionRef = db.collection('releaseReactions').doc(releaseId + '__' + identity.uid);
  const legacyLoveRef = db.collection('releaseLoves').doc(releaseId + '__' + identity.uid);
  if (!reaction) {
    await Promise.all([reactionRef.delete().catch(()=>undefined), legacyLoveRef.delete().catch(()=>undefined)]);
  } else {
    await reactionRef.set({ releaseId, userId:identity.uid, reaction, updatedAt:FieldValue.serverTimestamp(), createdAt:FieldValue.serverTimestamp() }, { merge:true });
    if (reaction === 'love') await legacyLoveRef.set({ releaseId, userId:identity.uid, createdAt:FieldValue.serverTimestamp() }, { merge:true });
    else await legacyLoveRef.delete().catch(()=>undefined);
  }

  if (reaction) {
    const recipients = new Set<string>();
    const creatorUserId = cleanText(releaseData.creatorUserId, 160);
    if (creatorUserId && creatorUserId !== identity.uid) recipients.add(creatorUserId);
    for (const credit of normaliseReleaseContributors(releaseData.contributors)) {
      if (credit.userId && credit.userId !== identity.uid) recipients.add(credit.userId);
    }
    await Promise.all([...recipients].map((recipientUserId) => createNotification(recipientUserId, {
      type:'comment',
      subtype:'release_reaction',
      title:'New reaction to published work',
      message:'A Listener reacted to ' + String(releaseData.title ?? 'a Nightjar release') + '.',
      dedupeKey:'release-reaction:' + releaseId + ':' + identity.uid,
      releaseId,
      releaseTitle:String(releaseData.title ?? 'Nightjar release'),
      creatorName:String(releaseData.creatorName ?? ''),
    })));
  }

  return syncReleaseCommunitySummary(releaseId, identity.uid);
});

export const setReleaseLove = onCall({ region: REGION }, async (request) => {
  const identity = await requireAccountRole(request, ['listener']);
  await requireAgeVerified(identity.uid);
  const input = (request.data ?? {}) as Record<string, unknown>;
  const releaseId = cleanText(input.releaseId, 160);
  if (!releaseId) throw new HttpsError('invalid-argument', 'Release is required.');
  const release = await releaseRef(releaseId).get();
  if (!release.exists || release.data()?.status !== 'released') throw new HttpsError('not-found', 'Published release not found.');

  const loved = input.loved !== false;
  const reactionRef = db.collection('releaseReactions').doc(releaseId + '__' + identity.uid);
  const legacyLoveRef = db.collection('releaseLoves').doc(releaseId + '__' + identity.uid);
  if (loved) {
    await Promise.all([
      reactionRef.set({ releaseId, userId:identity.uid, reaction:'love', updatedAt:FieldValue.serverTimestamp(), createdAt:FieldValue.serverTimestamp() }, { merge:true }),
      legacyLoveRef.set({ releaseId, userId:identity.uid, createdAt:FieldValue.serverTimestamp() }, { merge:true }),
    ]);
  } else {
    await Promise.all([reactionRef.delete().catch(()=>undefined), legacyLoveRef.delete().catch(()=>undefined)]);
  }
  const state = await syncReleaseCommunitySummary(releaseId, identity.uid);
  return { releaseId, loved, loveCount:state.reactions.loves };
});

export const postReleaseComment = onCall({ region: REGION }, async (request) => {
  const identity = await requireAccountRole(request, ['listener']);
  await requireAgeVerified(identity.uid);
  const input = (request.data ?? {}) as Record<string, unknown>;
  const releaseId = cleanText(input.releaseId, 160);
  const body = cleanText(input.body, 1200);
  if (!releaseId || !body) throw new HttpsError('invalid-argument', 'Write a comment first.');

  const release = await releaseRef(releaseId).get();
  const releaseData = release.data();
  if (!releaseData || releaseData.status !== 'released') throw new HttpsError('not-found', 'Published release not found.');

  const recent = await db.collection('releaseComments').where('userId', '==', identity.uid).limit(100).get();
  const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
  if (recent.docs.filter((doc) => (doc.data().createdAt?.toMillis?.() ?? 0) >= fiveMinutesAgo).length >= 5) {
    throw new HttpsError('resource-exhausted', 'Please wait before posting more comments.');
  }

  const presenter = await accountPresentation(identity.uid);
  const ref = db.collection('releaseComments').doc();
  const record = {
    releaseId,
    userId:identity.uid,
    commenterName:presenter.displayName,
    commenterHandle:presenter.handle,
    commenterRole:'listener',
    teamReply:false,
    parentCommentId:null,
    replyToUserId:null,
    body,
    status:'visible',
    createdAt:FieldValue.serverTimestamp(),
    updatedAt:FieldValue.serverTimestamp(),
  };
  await ref.set(record);

  const recipients = new Set<string>();
  const creatorUserId = cleanText(releaseData.creatorUserId, 160);
  if (creatorUserId && creatorUserId !== identity.uid) recipients.add(creatorUserId);
  for (const credit of normaliseReleaseContributors(releaseData.contributors)) {
    if (credit.userId && credit.userId !== identity.uid) recipients.add(credit.userId);
  }
  await Promise.all([...recipients].map((recipientUserId) => createNotification(recipientUserId, {
    type:'comment',
    subtype:'release_comment',
    title:'New comment on published work',
    message:presenter.displayName + ' commented on ' + String(releaseData.title ?? 'a Nightjar release') + '.',
    releaseId,
    releaseTitle:String(releaseData.title ?? 'Nightjar release'),
    creatorName:String(releaseData.creatorName ?? ''),
    commentId:ref.id,
  })));

  const saved = await ref.get();
  const community = await syncReleaseCommunitySummary(releaseId, identity.uid);
  return { comment:commentPayload(saved.data() ?? record, ref.id), reactions:community.reactions, commentCount:community.comments.length };
});

export const replyToReleaseComment = onCall({ region: REGION }, async (request) => {
  const identity = await requireAccountRole(request, ['creator','writer','editor','artist']);
  await requireAgeVerified(identity.uid);
  const input = (request.data ?? {}) as Record<string, unknown>;
  const parentCommentId = cleanText(input.parentCommentId, 160);
  const body = cleanText(input.body, 1200);
  if (!parentCommentId || !body) throw new HttpsError('invalid-argument', 'Write a reply first.');

  const parent = await db.collection('releaseComments').doc(parentCommentId).get();
  const parentData = parent.data();
  if (!parentData || parentData.status !== 'visible' || parentData.parentCommentId) {
    throw new HttpsError('not-found', 'Comment not found.');
  }

  const releaseId = cleanText(parentData.releaseId, 160);
  const release = await releaseRef(releaseId).get();
  const releaseData = release.data();
  if (!releaseData || releaseData.status !== 'released') throw new HttpsError('not-found', 'Published release not found.');

  const creditedUserIds = new Set<string>();
  const creatorUserId = cleanText(releaseData.creatorUserId, 160);
  if (creatorUserId) creditedUserIds.add(creatorUserId);
  for (const credit of normaliseReleaseContributors(releaseData.contributors)) {
    if (credit.userId) creditedUserIds.add(credit.userId);
  }
  if (!creditedUserIds.has(identity.uid)) {
    throw new HttpsError('permission-denied', 'Only credited members of this release can reply as the work team.');
  }

  const recent = await db.collection('releaseComments').where('userId', '==', identity.uid).limit(100).get();
  const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
  if (recent.docs.filter((doc) => (doc.data().createdAt?.toMillis?.() ?? 0) >= fiveMinutesAgo).length >= 8) {
    throw new HttpsError('resource-exhausted', 'Please wait before posting more replies.');
  }

  const presenter = await accountPresentation(identity.uid);
  const ref = db.collection('releaseComments').doc();
  const record = {
    releaseId,
    userId:identity.uid,
    commenterName:presenter.displayName,
    commenterHandle:presenter.handle,
    commenterRole:identity.role,
    teamReply:true,
    parentCommentId,
    replyToUserId:cleanText(parentData.userId, 160) || null,
    body,
    status:'visible',
    createdAt:FieldValue.serverTimestamp(),
    updatedAt:FieldValue.serverTimestamp(),
  };
  await ref.set(record);

  const parentUserId = cleanText(parentData.userId, 160);
  if (parentUserId && parentUserId !== identity.uid) {
    await createNotification(parentUserId, {
      type:'comment',
      subtype:'release_comment_reply',
      title:'The work team replied to your comment',
      message:presenter.displayName + ' replied to your comment on ' + String(releaseData.title ?? 'a Nightjar release') + '.',
      releaseId,
      releaseTitle:String(releaseData.title ?? 'Nightjar release'),
      creatorName:String(releaseData.creatorName ?? ''),
      commentId:ref.id,
      parentCommentId,
    });
  }

  const saved = await ref.get();
  const community = await syncReleaseCommunitySummary(releaseId, identity.uid);
  return {
    comment:commentPayload(saved.data() ?? record, ref.id),
    reactions:community.reactions,
    commentCount:community.comments.length,
  };
});

export const deleteOwnReleaseComment = onCall({ region: REGION }, async (request) => {
  const identity = await requireActiveIdentity(request);
  await requireAgeVerified(identity.uid);
  const commentId = cleanText((request.data as { commentId?: unknown } | undefined)?.commentId, 160);
  const ref = db.collection('releaseComments').doc(commentId);
  const snapshot = await ref.get();
  if (!snapshot.exists || snapshot.data()?.userId !== identity.uid) throw new HttpsError('not-found', 'Comment not found.');
  const releaseId = cleanText(snapshot.data()?.releaseId, 160);
  const parentCommentId = cleanText(snapshot.data()?.parentCommentId, 160);
  await ref.set({ status:'deleted_by_user', body:'', updatedAt:FieldValue.serverTimestamp() }, { merge:true });
  if (!parentCommentId) await hideReleaseCommentReplies(commentId, 'parent_deleted');
  if (releaseId) await syncReleaseCommunitySummary(releaseId, identity.uid);
  return { deleted:true, commentId };
});

export const reportReleaseComment = onCall({ region: REGION }, async (request) => {
  const identity = await requireActiveIdentity(request);
  await requireAgeVerified(identity.uid);
  const input = (request.data ?? {}) as Record<string, unknown>;
  const commentId = cleanText(input.commentId, 160);
  const reason = cleanText(input.reason, 600);
  const comment = await db.collection('releaseComments').doc(commentId).get();
  if (!comment.exists || comment.data()?.status !== 'visible') throw new HttpsError('not-found', 'Comment not found.');
  if (comment.data()?.userId === identity.uid) throw new HttpsError('failed-precondition', 'You can delete your own comment instead.');

  const existing = await db.collection('communityReports')
    .where('reporterUserId','==',identity.uid)
    .limit(100).get();
  if (existing.docs.some((doc)=>doc.data().type === 'release_comment' && doc.data().commentId === commentId && doc.data().status === 'open')) {
    return { reported:true, reportId:existing.docs.find((doc)=>doc.data().type === 'release_comment' && doc.data().commentId === commentId)?.id ?? null };
  }

  const ref = db.collection('communityReports').doc();
  await ref.set({
    type:'release_comment',
    reporterUserId:identity.uid,
    subjectUserId:comment.data()?.userId ?? null,
    commentId,
    releaseId:comment.data()?.releaseId ?? null,
    snapshotText:cleanText(comment.data()?.body, 1200),
    reason:reason || 'Reported by a Nightjar member.',
    status:'open',
    createdAt:FieldValue.serverTimestamp(),
  });
  return { reported:true, reportId:ref.id };
});

const requireCreativeMessagingIdentity = async (
  request: { auth?: { uid: string; token: Record<string, unknown> } | null },
) => {
  const identity = await requireAccountRole(request, ['creator','writer','editor','artist']);
  await requireAgeVerified(identity.uid);
  return identity;
};

const conversationWaitingState = (data: Record<string, any>, viewerUserId: string) => {
  const lastSenderUserId = cleanText(data.lastSenderUserId, 160) || null;
  const lastMessageAt = toIso(data.lastMessageAt);
  const sentAt = lastMessageAt ? new Date(lastMessageAt).getTime() : 0;
  const waitingHours = sentAt > 0 ? Math.max(0, Math.floor((Date.now() - sentAt) / 3_600_000)) : 0;
  const awaitingReplyFromUserId = lastSenderUserId && Array.isArray(data.participantUserIds)
    ? data.participantUserIds.find((id:string) => id !== lastSenderUserId) ?? null
    : null;
  const waitingState = !lastSenderUserId
    ? 'none'
    : awaitingReplyFromUserId === viewerUserId
      ? 'awaiting_me'
      : lastSenderUserId === viewerUserId
        ? 'awaiting_them'
        : 'none';
  const resolvedForLastMessageAt = cleanText(data.resolvedForLastMessageAt, 80) || null;
  const resolved = Boolean(lastMessageAt && resolvedForLastMessageAt === lastMessageAt);
  const effectiveWaitingState = resolved ? 'resolved' : waitingState;
  const reminderForLastMessageAt = cleanText(data.reminderForLastMessageAt, 80) || null;
  const reminderAlreadySent = Boolean(lastMessageAt && reminderForLastMessageAt === lastMessageAt);
  return {
    waitingState:effectiveWaitingState,
    waitingHours,
    awaitingReplyFromUserId,
    reminderAlreadySent,
    reminderEligible: !resolved && waitingState === 'awaiting_them' && waitingHours >= 48 && !reminderAlreadySent,
    resolved,
    resolvedAt:toIso(data.resolvedAt),
    resolvedByUserId:cleanText(data.resolvedByUserId, 160) || null,
    lastReminderAt: toIso(data.lastReminderAt),
  };
};

export const listMessageConversations = onCall({ region: REGION }, async (request) => {
  const identity = await requireCreativeMessagingIdentity(request);
  const snapshot = await db.collection('directConversations')
    .where('participantUserIds', 'array-contains', identity.uid)
    .limit(250)
    .get();
  const conversations = (await Promise.all(snapshot.docs
    .map(async (doc) => {
      const data = doc.data() ?? {};
      const otherUserId = (data.participantUserIds ?? []).find((id: string) => id !== identity.uid) ?? null;
      const other = otherUserId ? await accountPresentation(otherUserId) : { displayName:'Nightjar collaborator', handle:null };
      const otherAccount = otherUserId ? await accountRef(otherUserId).get() : null;
      const otherProfile = otherUserId ? await profileRef(otherUserId).get() : null;
      const unreadCounts = data.unreadCounts && typeof data.unreadCounts === 'object' ? data.unreadCounts : {};
      const collaborationIds = cleanStringList(
        Array.isArray(data.collaborationIds) ? data.collaborationIds : data.collaborationId ? [data.collaborationId] : [],
        50,
      );
      const collaborationSnapshots = await Promise.all(
        collaborationIds.map((id) => db.collection('collaborationProposals').doc(id).get()),
      );
      const collaborations = collaborationSnapshots
        .filter((item) => item.exists)
        .map((item) => ({
          id:item.id,
          title:cleanText(item.data()?.scriptTitle, 180) || 'Nightjar collaboration',
          status:cleanText(item.data()?.status, 40) || null,
        }));
      const latestCollaborationId = cleanText(data.collaborationId, 160) || collaborationIds[collaborationIds.length - 1] || null;
      const latestCollaboration = collaborations.find((item) => item.id === latestCollaborationId) ?? collaborations[collaborations.length - 1] ?? null;
      return {
        id:doc.id,
        otherUserId,
        otherName:other.displayName,
        otherHandle:other.handle,
        otherRole:otherAccount?.data()?.role ?? null,
        otherAvatarUrl:otherProfile?.data()?.avatarStatus === 'approved' ? otherProfile?.data()?.avatarUrl ?? null : null,
        lastMessagePreview:cleanText(data.lastMessagePreview, 180),
        lastMessageAt:toIso(data.lastMessageAt),
        lastSenderUserId:data.lastSenderUserId ?? null,
        unreadCount:Math.max(0, Number(unreadCounts[identity.uid] ?? 0)),
        collaborationIds,
        collaborations,
        collaborationId:latestCollaboration?.id ?? null,
        collaborationTitle:latestCollaboration?.title ?? null,
        collaborationStatus:latestCollaboration?.status ?? null,
        otherReadAt:otherUserId && data.readAt && typeof data.readAt === 'object' ? data.readAt[otherUserId] ?? null : null,
        ...conversationWaitingState(data, identity.uid),
      };
    }))).sort((a,b)=>String(b.lastMessageAt ?? '').localeCompare(String(a.lastMessageAt ?? '')));
  return { conversations, unreadCount:conversations.reduce((sum,item)=>sum+item.unreadCount,0) };
});

export const startDirectConversation = onCall({ region: REGION }, async (request) => {
  const identity = await requireCreativeMessagingIdentity(request);
  const input = (request.data ?? {}) as Record<string, unknown>;
  const targetUserId = cleanText(input.targetUserId, 160);
  const collaborationId = cleanText(input.collaborationId, 160) || null;
  if (!targetUserId || targetUserId === identity.uid) throw new HttpsError('invalid-argument', 'Choose another creative account.');

  const target = await accountRef(targetUserId).get();
  const targetRoles = target.exists ? professionalRolesForAccount(target.data() ?? {}) : [];
  if (!target.exists || target.data()?.status !== 'active' || !targetRoles.some((role) => CREATIVE_MESSAGE_ROLES.has(role))) {
    throw new HttpsError('not-found', 'Eligible creative account not found.');
  }
  if (await directMessagingBlockedBetween(identity.uid, targetUserId)) {
    throw new HttpsError('permission-denied', 'Private messaging is blocked between these accounts.');
  }
  const collaborationContext = collaborationId
    ? await messagingCollaborationContext(collaborationId, identity.uid, targetUserId)
    : null;
  const id = directConversationId(identity.uid, targetUserId);
  const ref = db.collection('directConversations').doc(id);
  const existing = await ref.get();
  if (!existing.exists) {
    await ref.set({
      participantUserIds:[identity.uid,targetUserId].sort(),
      participantRoles:{ [identity.uid]:identity.role, [targetUserId]:targetRoles[0] ?? target.data()?.role ?? null },
      collaborationId:collaborationContext?.id ?? null,
      collaborationIds:collaborationContext ? [collaborationContext.id] : [],
      unreadCounts:{ [identity.uid]:0, [targetUserId]:0 },
      createdAt:FieldValue.serverTimestamp(),
      updatedAt:FieldValue.serverTimestamp(),
      lastMessageAt:null,
      lastMessagePreview:'',
      lastSenderUserId:null,
      reminderForLastMessageAt:null,
      lastReminderAt:null,
      lastReminderByUserId:null,
      resolvedForLastMessageAt:null,
      resolvedAt:null,
      resolvedByUserId:null,
    });
  } else if (collaborationContext) {
    const existingIds = cleanStringList(
      Array.isArray(existing.data()?.collaborationIds)
        ? existing.data()?.collaborationIds
        : existing.data()?.collaborationId ? [existing.data()?.collaborationId] : [],
      50,
    );
    const collaborationIds = existingIds.includes(collaborationContext.id)
      ? existingIds
      : [...existingIds, collaborationContext.id].slice(-50);
    await ref.set({
      collaborationId:collaborationContext.id,
      collaborationIds,
      updatedAt:FieldValue.serverTimestamp(),
    }, { merge:true });
  }
  return { conversationId:id };
});

export const listDirectMessages = onCall({ region: REGION }, async (request) => {
  const identity = await requireCreativeMessagingIdentity(request);
  const conversationId = cleanText((request.data as { conversationId?: unknown } | undefined)?.conversationId, 320);
  const ref = db.collection('directConversations').doc(conversationId);
  const conversation = await ref.get();
  const data = conversation.data();
  if (!data || !Array.isArray(data.participantUserIds) || !data.participantUserIds.includes(identity.uid)) {
    throw new HttpsError('not-found', 'Conversation not found.');
  }
  const snapshot = await ref.collection('messages')
    .orderBy('createdAt', 'desc')
    .limit(250)
    .get();
  const batch = db.batch();
  const messages = snapshot.docs
    .map((doc) => {
      const value = doc.data();
      const readBy = Array.isArray(value.readBy) ? value.readBy.map(String) : [];
      const readAt = value.readAt && typeof value.readAt === 'object' ? { ...value.readAt } : {};
      if (!readBy.includes(identity.uid)) {
        const seenAt = new Date().toISOString();
        readAt[identity.uid] = seenAt;
        batch.set(doc.ref, { readBy:[...readBy,identity.uid], readAt, updatedAt:FieldValue.serverTimestamp() }, { merge:true });
      }
      return directMessagePayload({ ...value, readBy:Array.from(new Set([...readBy,identity.uid])), readAt }, doc.id);
    })
    .sort((a,b)=>String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? '')));

  const unreadCounts = data.unreadCounts && typeof data.unreadCounts === 'object' ? { ...data.unreadCounts } : {};
  unreadCounts[identity.uid] = 0;
  batch.set(ref, { unreadCounts, readAt:{ ...(data.readAt ?? {}), [identity.uid]:new Date().toISOString() }, updatedAt:FieldValue.serverTimestamp() }, { merge:true });
  await batch.commit();
  const otherUserId = data.participantUserIds.find((id:string)=>id !== identity.uid) ?? null;
  const blockState = otherUserId
    ? await directMessagingBlockState(identity.uid, otherUserId)
    : { blocked:false, blockedByMe:false, blockedByOther:false };
  return {
    messages,
    ...blockState,
    conversation:{
      id:conversation.id,
      ...conversationWaitingState(data, identity.uid),
      collaborationId:cleanText(data.collaborationId, 160) || null,
      collaborationIds:cleanStringList(data.collaborationIds, 50),
    },
  };
});

export const sendDirectMessage = onCall({ region: REGION }, async (request) => {
  const identity = await requireCreativeMessagingIdentity(request);
  const input = (request.data ?? {}) as Record<string, unknown>;
  const conversationId = cleanText(input.conversationId, 320);
  const body = cleanText(input.body, 4000);
  const requestedCollaborationId = cleanText(input.collaborationId, 160) || null;
  if (!conversationId || !body) throw new HttpsError('invalid-argument', 'Write a message first.');

  const ref = db.collection('directConversations').doc(conversationId);
  const conversation = await ref.get();
  const data = conversation.data();
  if (!data || !Array.isArray(data.participantUserIds) || !data.participantUserIds.includes(identity.uid)) {
    throw new HttpsError('not-found', 'Conversation not found.');
  }
  const recipientUserId = data.participantUserIds.find((id: string) => id !== identity.uid);
  const recipient = recipientUserId ? await accountRef(recipientUserId).get() : null;
  const recipientRoles = recipient?.exists ? professionalRolesForAccount(recipient.data() ?? {}) : [];
  if (!recipientUserId || !recipient?.exists || recipient.data()?.status !== 'active' || !recipientRoles.some((role) => CREATIVE_MESSAGE_ROLES.has(role))) {
    throw new HttpsError('failed-precondition', 'The recipient account is no longer available for creative messaging.');
  }
  if (await directMessagingBlockedBetween(identity.uid, recipientUserId)) {
    throw new HttpsError('permission-denied', 'Private messaging is blocked between these accounts.');
  }

  const recent = await ref.collection('messages').where('senderUserId', '==', identity.uid).limit(100).get();
  const oneMinuteAgo = Date.now() - 60_000;
  if (recent.docs.filter((doc) => (doc.data().createdAt?.toMillis?.() ?? 0) >= oneMinuteAgo).length >= 12) {
    throw new HttpsError('resource-exhausted', 'Please slow down before sending more messages.');
  }

  const activeCollaboration = requestedCollaborationId
    ? await messagingCollaborationContext(requestedCollaborationId, identity.uid, recipientUserId)
    : null;
  const collaborationId = activeCollaboration?.id ?? (cleanText(data.collaborationId, 160) || null);

  const presenter = await accountPresentation(identity.uid);
  const messageRef = ref.collection('messages').doc();
  const message = {
    conversationId,
    senderUserId:identity.uid,
    senderName:presenter.displayName,
    body,
    status:'visible',
    collaborationId,
    readBy:[identity.uid],
    readAt:{ [identity.uid]:new Date().toISOString() },
    createdAt:FieldValue.serverTimestamp(),
    updatedAt:FieldValue.serverTimestamp(),
  };
  await messageRef.set(message);

  const unreadCounts = data.unreadCounts && typeof data.unreadCounts === 'object' ? { ...data.unreadCounts } : {};
  unreadCounts[recipientUserId] = Math.max(0, Number(unreadCounts[recipientUserId] ?? 0)) + 1;
  unreadCounts[identity.uid] = 0;
  const existingCollaborationIds = cleanStringList(
    Array.isArray(data.collaborationIds) ? data.collaborationIds : data.collaborationId ? [data.collaborationId] : [],
    50,
  );
  const collaborationIds = collaborationId && !existingCollaborationIds.includes(collaborationId)
    ? [...existingCollaborationIds, collaborationId].slice(-50)
    : existingCollaborationIds;
  await ref.set({
    unreadCounts,
    lastMessagePreview:body.slice(0,180),
    lastMessageAt:FieldValue.serverTimestamp(),
    lastSenderUserId:identity.uid,
    collaborationId,
    collaborationIds,
    reminderForLastMessageAt:null,
    lastReminderAt:null,
    lastReminderByUserId:null,
    resolvedForLastMessageAt:null,
    resolvedAt:null,
    resolvedByUserId:null,
    updatedAt:FieldValue.serverTimestamp(),
  }, { merge:true });

  await createNotification(recipientUserId, {
    type:'message',
    subtype:'direct_message',
    title:'New private message',
    message:presenter.displayName + ' sent you a private Nightjar message.',
    conversationId,
    collaborationId,
    senderUserId:identity.uid,
  });

  const saved = await messageRef.get();
  return { message:directMessagePayload(saved.data() ?? message, messageRef.id) };
});

export const closeDirectConversationLoop = onCall({ region: REGION }, async (request) => {
  const identity = await requireCreativeMessagingIdentity(request);
  const conversationId = cleanText((request.data as { conversationId?: unknown } | undefined)?.conversationId, 320);
  if (!conversationId) throw new HttpsError('invalid-argument', 'Conversation is required.');

  const ref = db.collection('directConversations').doc(conversationId);
  const conversation = await ref.get();
  const data = conversation.data();
  if (!data || !Array.isArray(data.participantUserIds) || !data.participantUserIds.includes(identity.uid)) {
    throw new HttpsError('not-found', 'Conversation not found.');
  }

  const lastMessageAt = toIso(data.lastMessageAt);
  if (!lastMessageAt) throw new HttpsError('failed-precondition', 'There is no message loop to close.');

  await ref.set({
    resolvedForLastMessageAt:lastMessageAt,
    resolvedAt:FieldValue.serverTimestamp(),
    resolvedByUserId:identity.uid,
    updatedAt:FieldValue.serverTimestamp(),
  }, { merge:true });

  return { conversationId, resolved:true, resolvedForLastMessageAt:lastMessageAt };
});

export const sendDirectMessageReminder = onCall({ region: REGION }, async (request) => {
  const identity = await requireCreativeMessagingIdentity(request);
  const conversationId = cleanText((request.data as { conversationId?: unknown } | undefined)?.conversationId, 320);
  if (!conversationId) throw new HttpsError('invalid-argument', 'Conversation is required.');

  const ref = db.collection('directConversations').doc(conversationId);
  const conversation = await ref.get();
  const data = conversation.data();
  if (!data || !Array.isArray(data.participantUserIds) || !data.participantUserIds.includes(identity.uid)) {
    throw new HttpsError('not-found', 'Conversation not found.');
  }

  const recipientUserId = data.participantUserIds.find((id:string) => id !== identity.uid);
  if (!recipientUserId) throw new HttpsError('failed-precondition', 'Conversation recipient is unavailable.');
  if (await directMessagingBlockedBetween(identity.uid, recipientUserId)) {
    throw new HttpsError('permission-denied', 'Private messaging is blocked between these accounts.');
  }

  const waiting = conversationWaitingState(data, identity.uid);
  if (waiting.waitingState !== 'awaiting_them') {
    throw new HttpsError('failed-precondition', 'This conversation is not waiting for the other person to reply.');
  }
  if (waiting.waitingHours < 48) {
    throw new HttpsError('failed-precondition', 'A reminder is available after 48 hours without a reply.');
  }
  if (waiting.reminderAlreadySent) {
    throw new HttpsError('already-exists', 'A reminder has already been sent for this unanswered message.');
  }

  const lastMessageAt = toIso(data.lastMessageAt);
  const presenter = await accountPresentation(identity.uid);
  await ref.set({
    reminderForLastMessageAt:lastMessageAt,
    lastReminderAt:FieldValue.serverTimestamp(),
    lastReminderByUserId:identity.uid,
    updatedAt:FieldValue.serverTimestamp(),
  }, { merge:true });

  await createNotification(recipientUserId, {
    type:'message',
    subtype:'direct_message_reminder',
    title:'A collaborator is waiting for your reply',
    message:presenter.displayName + ' sent a Nightjar follow-up on a professional conversation.',
    conversationId,
    collaborationId:cleanText(data.collaborationId, 160) || null,
    senderUserId:identity.uid,
  });

  return {
    conversationId,
    reminderSent:true,
    reminderForLastMessageAt:lastMessageAt,
  };
});

export const setDirectMessageBlock = onCall({ region: REGION }, async (request) => {
  const identity = await requireCreativeMessagingIdentity(request);
  const input = (request.data ?? {}) as Record<string, unknown>;
  const targetUserId = cleanText(input.targetUserId, 160);
  const blocked = input.blocked === true;
  if (!targetUserId || targetUserId === identity.uid) throw new HttpsError('invalid-argument', 'Choose another creative account.');
  const target = await accountRef(targetUserId).get();
  if (!target.exists || !professionalRolesForAccount(target.data() ?? {}).some((role) => CREATIVE_MESSAGE_ROLES.has(role))) throw new HttpsError('not-found', 'Creative account not found.');
  const ref = accountRef(identity.uid).collection('messageBlocks').doc(targetUserId);
  if (blocked) await ref.set({ targetUserId, createdAt:FieldValue.serverTimestamp(), updatedAt:FieldValue.serverTimestamp() }, { merge:true });
  else await ref.delete().catch(()=>undefined);
  return { targetUserId, blocked };
});

export const reportDirectMessage = onCall({ region: REGION }, async (request) => {
  const identity = await requireCreativeMessagingIdentity(request);
  const input = (request.data ?? {}) as Record<string, unknown>;
  const conversationId = cleanText(input.conversationId, 320);
  const messageId = cleanText(input.messageId, 160);
  const reason = cleanText(input.reason, 600);
  const conversation = await db.collection('directConversations').doc(conversationId).get();
  if (!conversation.exists || !conversation.data()?.participantUserIds?.includes(identity.uid)) throw new HttpsError('not-found', 'Conversation not found.');
  const message = await conversation.ref.collection('messages').doc(messageId).get();
  if (!message.exists || message.data()?.senderUserId === identity.uid) throw new HttpsError('not-found', 'Reportable message not found.');

  const existing = await db.collection('communityReports')
    .where('reporterUserId','==',identity.uid)
    .limit(100).get();
  const duplicate = existing.docs.find((doc) =>
    doc.data().type === 'direct_message'
    && doc.data().conversationId === conversationId
    && doc.data().messageId === messageId
    && doc.data().status === 'open'
  );
  if (duplicate) return { reported:true, reportId:duplicate.id };

  const ref = db.collection('communityReports').doc();
  await ref.set({
    type:'direct_message',
    reporterUserId:identity.uid,
    subjectUserId:message.data()?.senderUserId ?? null,
    conversationId,
    messageId,
    snapshotText:cleanText(message.data()?.body, 1200),
    reason:reason || 'Reported by a Nightjar member.',
    status:'open',
    createdAt:FieldValue.serverTimestamp(),
  });
  return { reported:true, reportId:ref.id };
});

export const adminListCommunityReports = onCall({ region: REGION }, async (request) => {
  requireAdminIdentity(request);
  const snapshot = await db.collection('communityReports').limit(1000).get();
  const reports = (await Promise.all(snapshot.docs
    .filter((doc) => doc.data().status === 'open')
    .map(async (doc) => {
      const data = doc.data() ?? {};
      const reporterUserId = cleanText(data.reporterUserId, 160);
      const subjectUserId = cleanText(data.subjectUserId, 160);
      const releaseId = cleanText(data.releaseId, 160);
      const [reporter, subject, subjectAccount, release] = await Promise.all([
        reporterUserId ? accountPresentation(reporterUserId) : Promise.resolve({ displayName:'Nightjar member', handle:null }),
        subjectUserId ? accountPresentation(subjectUserId) : Promise.resolve({ displayName:'Nightjar member', handle:null }),
        subjectUserId ? accountRef(subjectUserId).get() : Promise.resolve(null),
        releaseId ? releaseRef(releaseId).get() : Promise.resolve(null),
      ]);
      return {
        id:doc.id,
        ...data,
        reporterName:reporter.displayName,
        reporterHandle:reporter.handle,
        subjectName:subject.displayName,
        subjectHandle:subject.handle,
        subjectRole:subjectAccount?.data()?.role ?? null,
        releaseTitle:release?.data()?.title ?? null,
        createdAt:toIso(data.createdAt),
      };
    }))).sort((a:any,b:any)=>String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? '')));
  return { reports };
});

export const adminResolveCommunityReport = onCall({ region: REGION }, async (request) => {
  const admin = requireAdminIdentity(request);
  const input = (request.data ?? {}) as Record<string, unknown>;
  const reportId = cleanText(input.reportId, 160);
  const decision = cleanText(input.decision, 20);
  if (!['dismiss','remove'].includes(decision)) throw new HttpsError('invalid-argument', 'Choose a valid moderation decision.');
  const reportRef = db.collection('communityReports').doc(reportId);
  const report = await reportRef.get();
  const data = report.data();
  if (!data || data.status !== 'open') throw new HttpsError('not-found', 'Open report not found.');

  if (decision === 'remove' && data.type === 'release_comment' && data.commentId) {
    const commentRef = db.collection('releaseComments').doc(String(data.commentId));
    const comment = await commentRef.get();
    await commentRef.set({
      status:'removed_by_admin', body:'', moderatedBy:admin.uid, moderatedAt:FieldValue.serverTimestamp(), updatedAt:FieldValue.serverTimestamp(),
    }, { merge:true });
    if (!cleanText(comment.data()?.parentCommentId, 160)) await hideReleaseCommentReplies(String(data.commentId), 'parent_removed');
    const releaseId = cleanText(data.releaseId, 160);
    if (releaseId) await syncReleaseCommunitySummary(releaseId, admin.uid);
  }  if (decision === 'remove' && data.type === 'direct_message' && data.conversationId && data.messageId) {
    const conversationRef = db.collection('directConversations').doc(String(data.conversationId));
    const messageRef = conversationRef.collection('messages').doc(String(data.messageId));
    await messageRef.set({
      status:'removed_by_admin', body:'', moderatedBy:admin.uid, moderatedAt:FieldValue.serverTimestamp(),
    }, { merge:true });
    const conversation = await conversationRef.get();
    if (conversation.data()?.lastMessagePreview === data.snapshotText) {
      await conversationRef.set({
        lastMessagePreview:'Message removed by Nightjar moderation.',
        resolvedForLastMessageAt:toIso(conversation.data()?.lastMessageAt),
        resolvedAt:FieldValue.serverTimestamp(),
        resolvedByUserId:admin.uid,
        updatedAt:FieldValue.serverTimestamp(),
      }, { merge:true });
    }
  }
  await reportRef.set({
    status:decision === 'dismiss' ? 'dismissed' : 'actioned',
    decision,
    resolvedBy:admin.uid,
    resolvedAt:FieldValue.serverTimestamp(),
  }, { merge:true });

  const reporterUserId = cleanText(data.reporterUserId, 160);
  const subjectUserId = cleanText(data.subjectUserId, 160);
  if (reporterUserId) {
    await createNotification(reporterUserId, {
      type:'moderation',
      subtype:'community_report_reviewed',
      title:'Your Nightjar report was reviewed',
      message:decision === 'remove'
        ? 'Nightjar reviewed your report and removed the reported content.'
        : 'Nightjar reviewed your report. No content removal was applied.',
      reportId,
    });
  }
  if (decision === 'remove' && subjectUserId) {
    await createNotification(subjectUserId, {
      type:'moderation',
      subtype:'community_content_removed',
      title:'Nightjar moderation removed content',
      message:data.type === 'direct_message'
        ? 'A private message you sent was removed after Administrator review.'
        : 'A public comment or reply you posted was removed after Administrator review.',
      reportId,
    });
  }

  return { reportId, decision };
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
  const identity = await requireAccountRole(request, ['listener']);
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


export { nightjarGiftConfig, myNightjarWallet, sendNightjars, myNightjarEarnings, myNightjarGiftHistory, clearMatureNightjarGifts, adminNightjarPayoutOverview, adminGrantNightjars } from './nightjars.js';


// ---- Multi-role professional application bank --------------------------------
const PROFESSIONAL_ROLE_KEYS = ['creator','writer','editor','artist'] as const;
type ProfessionalRole = typeof PROFESSIONAL_ROLE_KEYS[number];
const professionalApplicationRef = (uid: string) => db.collection('professionalApplications').doc(uid);
const cleanProfessionalRoles = (value: unknown): ProfessionalRole[] => {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(
    value
      .map((item) => cleanText(item, 30))
      .filter((item): item is ProfessionalRole => PROFESSIONAL_ROLE_KEYS.includes(item as ProfessionalRole)),
  ));
};

export const myProfessionalRoles = onCall({ region: REGION }, async (request) => {
  const identity = await requireActiveIdentity(request);
  if (identity.admin) {
    return {
      listener: true,
      approvedProfessionalRoles: [] as ProfessionalRole[],
      pendingProfessionalRoles: [] as ProfessionalRole[],
      activeRole: 'admin',
      applicationStatus: null,
    };
  }
  const [accountSnapshot, applicationSnapshot] = await Promise.all([
    accountRef(identity.uid).get(),
    professionalApplicationRef(identity.uid).get(),
  ]);
  const account = accountSnapshot.data() ?? {};
  const application = applicationSnapshot.data() ?? {};
  const approvedProfessionalRoles = professionalRolesForAccount(account).filter((role): role is ProfessionalRole => PROFESSIONAL_ROLE_KEYS.includes(role as ProfessionalRole));
  const applicationStatus = applicationSnapshot.exists ? cleanText(application.status, 30) || 'banked' : null;
  const pendingProfessionalRoles = ['banked','waitlist'].includes(String(applicationStatus))
    ? cleanProfessionalRoles(application.requestedRoles).filter((role) => !approvedProfessionalRoles.includes(role))
    : [];
  return {
    listener: true,
    approvedProfessionalRoles,
    pendingProfessionalRoles,
    activeRole: cleanText(account.role, 30) || 'listener',
    applicationStatus,
    wave: cleanText(application.wave, 80) || null,
  };
});

export const submitProfessionalApplication = onCall({ region: REGION }, async (request) => {
  const identity = await requireActiveIdentity(request);
  await requireProfessionalLegalTerms(identity.uid);
  if (identity.admin) throw new HttpsError('failed-precondition', 'Administrator accounts do not use professional applications.');
  await requireAgeVerified(identity.uid);
  const input = (request.data ?? {}) as Record<string, unknown>;
  const requestedRoles = cleanProfessionalRoles(input.roles);
  if (!requestedRoles.length) throw new HttpsError('invalid-argument', 'Choose at least one professional role.');

  const [accountSnapshot, currentApplication] = await Promise.all([
    accountRef(identity.uid).get(),
    professionalApplicationRef(identity.uid).get(),
  ]);
  const account = accountSnapshot.data() ?? {};
  const approved = professionalRolesForAccount(account).filter((role): role is ProfessionalRole => PROFESSIONAL_ROLE_KEYS.includes(role as ProfessionalRole));
  const currentApplicationStatus = cleanText(currentApplication.data()?.status, 30);
  const carriedRequestedRoles = ['banked','waitlist'].includes(currentApplicationStatus)
    ? cleanProfessionalRoles(currentApplication.data()?.requestedRoles)
    : [];
  const requested = Array.from(new Set([...carriedRequestedRoles, ...requestedRoles]))
    .filter((role) => !approved.includes(role));

  await accountRef(identity.uid).set({
    status: String(account.status ?? 'active') === 'suspended' ? 'suspended' : 'active',
    role: cleanText(account.role, 30) || 'listener',
    approvedProfessionalRoles: approved,
    pendingProfessionalRoles: requested,
    updatedAt: FieldValue.serverTimestamp(),
    ...(accountSnapshot.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
  }, { merge:true });

  await professionalApplicationRef(identity.uid).set({
    userId: identity.uid,
    email: identity.email,
    requestedRoles: requested,
    approvedRoles: approved,
    status: 'banked',
    statement: cleanText(input.statement, 2400) || null,
    experience: cleanText(input.experience, 1600) || null,
    portfolioUrl: validPublicUrl(input.portfolioUrl),
    socialUrl: validPublicUrl(input.socialUrl),
    note: cleanText(input.note, 1200) || null,
    bankedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    ...(currentApplication.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
  }, { merge:true });

  return {
    status: 'banked',
    requestedRoles: requested,
    approvedProfessionalRoles: approved,
    message: 'Your professional application is stored in the Nightjar application bank for a future controlled intake wave.',
  };
});

export const removeProfessionalRole = onCall({ region: REGION }, async (request) => {
  const identity = await requireActiveIdentity(request);
  if (identity.admin) throw new HttpsError('failed-precondition', 'Administrator roles are managed separately.');
  const role = cleanText((request.data as Record<string, unknown> | undefined)?.role, 30) as ProfessionalRole;
  if (!PROFESSIONAL_ROLE_KEYS.includes(role)) throw new HttpsError('invalid-argument', 'Choose a valid professional role.');

  const [accountSnapshot, applicationSnapshot] = await Promise.all([
    accountRef(identity.uid).get(),
    professionalApplicationRef(identity.uid).get(),
  ]);
  const account = accountSnapshot.data() ?? {};
  const approved = professionalRolesForAccount(account).filter((value) => value !== role) as ProfessionalRole[];
  const applicationStatus = cleanText(applicationSnapshot.data()?.status, 30);
  const requested = (['banked','waitlist'].includes(applicationStatus)
    ? cleanProfessionalRoles(applicationSnapshot.data()?.requestedRoles)
    : []
  ).filter((value) => value !== role);
  const activeRole = cleanText(account.role, 30);
  const nextActiveRole = activeRole === role ? (approved[0] ?? 'listener') : (activeRole || 'listener');

  await accountRef(identity.uid).set({
    approvedProfessionalRoles: approved,
    pendingProfessionalRoles: requested,
    role: nextActiveRole,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge:true });
  if (applicationSnapshot.exists) {
    await applicationSnapshot.ref.set({
      requestedRoles: requested,
      approvedRoles: approved,
      status: requested.length ? 'banked' : approved.length ? 'approved' : 'withdrawn',
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge:true });
  }
  await syncCreatorCustomTagUsage(identity.uid);
  return { removedRole: role, approvedProfessionalRoles: approved, pendingProfessionalRoles: requested, activeRole: nextActiveRole };
});

export const setActiveNightjarRole = onCall({ region: REGION }, async (request) => {
  const identity = await requireActiveIdentity(request);
  if (identity.admin) return { activeRole:'admin' };
  const role = cleanText((request.data as Record<string, unknown> | undefined)?.role, 30);
  const accountSnapshot = await accountRef(identity.uid).get();
  const account = accountSnapshot.data() ?? {};
  const approved = professionalRolesForAccount(account);
  if (role !== 'listener' && !approved.includes(role as AccountRole)) {
    throw new HttpsError('permission-denied', 'That professional role has not been approved for this account.');
  }
  await accountRef(identity.uid).set({
    role,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge:true });
  return { activeRole: role, approvedProfessionalRoles: approved };
});

export const listProfessionalApplicationBank = onCall({ region: REGION }, async (request) => {
  requireAdminIdentity(request);
  const snapshot = await db.collection('professionalApplications').limit(1000).get();
  const applications = await Promise.all(snapshot.docs.map(async (doc) => {
    const data = doc.data() ?? {};
    const [profile, account, ageAssurance] = await Promise.all([
      profileRef(doc.id).get(),
      accountRef(doc.id).get(),
      db.collection('ageAssurance').doc(doc.id).get(),
    ]);
    const accountData = account.data() ?? {};
    // Resolve a pre-feature approval event only when no email status has ever
    // been recorded. Existing approvals are NOT emailed retroactively on deploy.
    let historicalApprovedEmailEventId: string | null = null;
    if (!data.approvalEmailEventId && cleanProfessionalRoles(data.approvedRoles).length > 0) {
      const pastEvents = await doc.ref.collection('events')
        .where('decision', '==', 'approved')
        .limit(50)
        .get();
      const latest = pastEvents.docs.sort((a, b) =>
        (b.data().createdAt?.toMillis?.() ?? 0) - (a.data().createdAt?.toMillis?.() ?? 0))[0];
      historicalApprovedEmailEventId = latest?.id ?? null;
    }
    const temporaryTestAccess = TESTING_AGE_ASSURANCE_BYPASS && accountData.testAccess === true;
    return {
      id: doc.id,
      userId: doc.id,
      email: data.email ?? accountData.email ?? null,
      ageVerified: diditPass(ageAssurance.data()),
      temporaryTestAccess,
      displayName: profile.data()?.displayName ?? null,
      requestedRoles: cleanProfessionalRoles(data.requestedRoles),
      approvedRoles: cleanProfessionalRoles(data.approvedRoles),
      status: cleanText(data.status, 30) || 'banked',
      wave: cleanText(data.wave, 80) || null,
      statement: cleanText(data.statement, 2400) || null,
      experience: cleanText(data.experience, 1600) || null,
      portfolioUrl: validPublicUrl(data.portfolioUrl),
      socialUrl: validPublicUrl(data.socialUrl),
      note: cleanText(data.note, 1200) || null,
      createdAt: toIso(data.createdAt),
      bankedAt: toIso(data.bankedAt),
      updatedAt: toIso(data.updatedAt),
      approvalEmailStatus: cleanText(data.approvalEmailStatus, 30) || null,
      approvalEmailEventId: cleanText(data.approvalEmailEventId, 160) || historicalApprovedEmailEventId,
      approvalEmailSentAt: toIso(data.approvalEmailSentAt),
      approvalEmailError: cleanText(data.approvalEmailError, 600) || null,
    };
  }));
  const statusOrder: Record<string, number> = { banked:0, waitlist:1, approved:2, rejected:3, withdrawn:4 };
  applications.sort((a,b) => (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9) || String(a.bankedAt ?? '').localeCompare(String(b.bankedAt ?? '')));
  const buckets = Object.fromEntries(PROFESSIONAL_ROLE_KEYS.map((role) => [
    role,
    applications.filter((item) => item.requestedRoles.includes(role) && !item.approvedRoles.includes(role)).length,
  ]));
  return { applications, buckets, total: applications.length };
});

// Administrator-only multi-profession access editor. Unlike adminSetAccountRole,
// this manages all approved professions on one identity, not its active workspace.
// Profiles and role-specific portfolio slices are deliberately never rewritten.
export const adminManageProfessionalRoles = onCall({ region: REGION }, async (request) => {
  const admin = requireAdminIdentity(request);
  const input = (request.data ?? {}) as Record<string, unknown>;
  const userId = cleanText(input.userId, 160);
  if (!userId || userId.includes('/')) throw new HttpsError('invalid-argument', 'Choose a Nightjar member.');
  if (!Array.isArray(input.approvedRoles) || !Array.isArray(input.expectedApprovedRoles)
    || input.approvedRoles.some((value) => typeof value !== 'string' || !PROFESSIONAL_ROLE_KEYS.includes(value as ProfessionalRole))
    || input.expectedApprovedRoles.some((value) => typeof value !== 'string' || !PROFESSIONAL_ROLE_KEYS.includes(value as ProfessionalRole))) {
    throw new HttpsError('invalid-argument', 'Select any combination of VA Creator, Writer, Audio Editor and Artist.');
  }
  const selected = cleanProfessionalRoles(input.approvedRoles);
  const expected = cleanProfessionalRoles(input.expectedApprovedRoles);
  const accountDocument = accountRef(userId);
  const applicationDocument = professionalApplicationRef(userId);
  const eventDocument = applicationDocument.collection('events').doc();

  // A role grant is not a shortcut around the member's own accepted
  // professional agreements or server-authorised 18+ private-beta access.
  // Revocations remain possible even when those conditions no longer hold.
  if (selected.some((role) => !expected.includes(role))) {
    await requireProfessionalLegalTerms(userId);
    await requireAgeVerified(userId);
  }

  const result = await db.runTransaction(async (tx) => {
    const [accountSnapshot, applicationSnapshot] = await Promise.all([
      tx.get(accountDocument),
      tx.get(applicationDocument),
    ]);
    if (!accountSnapshot.exists) throw new HttpsError('not-found', 'Nightjar member account not found.');
    const account = accountSnapshot.data() ?? {};
    if (ADMIN_EMAILS.has(cleanEmail(account.email)) || cleanText(account.role, 30) === 'admin') {
      throw new HttpsError('permission-denied', 'Administrator permissions cannot be granted or changed from the member role editor.');
    }

    const previouslyApproved = professionalRolesForAccount(account) as ProfessionalRole[];
    const sameRoles = (left: ProfessionalRole[], right: ProfessionalRole[]) =>
      left.length === right.length && left.every((role) => right.includes(role));
    if (!sameRoles(previouslyApproved, expected)) {
      throw new HttpsError('aborted', 'This member\'s roles have changed. Refresh the directory before saving.');
    }
    const addedRoles = selected.filter((role) => !previouslyApproved.includes(role));
    const removedRoles = previouslyApproved.filter((role) => !selected.includes(role));
    const currentRole = cleanText(account.role, 30);
    const activeRole = currentRole === 'listener' || selected.includes(currentRole as ProfessionalRole)
      ? currentRole
      : 'listener';

    if (!addedRoles.length && !removedRoles.length) {
      return { userId, approvedProfessionalRoles: previouslyApproved, pendingProfessionalRoles: cleanProfessionalRoles(account.pendingProfessionalRoles), activeRole, addedRoles, removedRoles, unchanged: true };
    }
    if (addedRoles.length && account.status === 'suspended') {
      throw new HttpsError('failed-precondition', 'Suspended accounts cannot receive new professional access. Review suspension separately.');
    }

    const application = applicationSnapshot.data() ?? {};
    const priorStatus = cleanText(application.status, 30);
    const previouslyRequested = ['banked','waitlist'].includes(priorStatus)
      ? cleanProfessionalRoles(application.requestedRoles)
      : [];
    const stillPending = previouslyRequested.filter((role) => !selected.includes(role));
    const applicationStatus = stillPending.length
      ? 'banked'
      : selected.length ? 'approved' : 'withdrawn';
    const now = FieldValue.serverTimestamp();

    tx.set(accountDocument, {
      approvedProfessionalRoles: selected,
      pendingProfessionalRoles: stillPending,
      role: activeRole,
      professionalAccessUpdatedBy: admin.uid,
      professionalAccessUpdatedAt: now,
      updatedAt: now,
    }, { merge: true });
    tx.set(applicationDocument, {
      userId,
      email: cleanEmail(account.email) || null,
      requestedRoles: stillPending,
      approvedRoles: selected,
      status: applicationStatus,
      wave: application.wave || 'Administrator access management',
      reviewedBy: admin.uid,
      reviewedAt: now,
      updatedAt: now,
      ...(applicationSnapshot.exists ? {} : { createdAt: now }),
    }, { merge: true });
    tx.create(eventDocument, {
      userId,
      decision: addedRoles.length ? 'approved' : 'admin_roles_updated',
      source: 'admin_multi_role_editor',
      roles: addedRoles,
      removedRoles,
      previousApprovedRoles: previouslyApproved,
      approvedRolesAfter: selected,
      pendingRolesAfter: stillPending,
      previousStatus: priorStatus || 'none',
      resultingStatus: applicationStatus,
      activeRole,
      reviewedBy: admin.uid,
      createdAt: now,
    });
    return {
      userId, approvedProfessionalRoles: selected, pendingProfessionalRoles: stillPending,
      activeRole, addedRoles, removedRoles, unchanged: false,
    };
  });
  if (!result.unchanged) await syncCreatorCustomTagUsage(userId);
  return result;
});

export const reviewProfessionalApplication = onCall({ region: REGION }, async (request) => {
  const admin = requireAdminIdentity(request);
  const input = (request.data ?? {}) as Record<string, unknown>;
  const userId = cleanText(input.userId, 160);
  const decision = cleanText(input.decision, 30);
  const selectedRoles = cleanProfessionalRoles(input.roles);
  const wave = cleanText(input.wave, 80);
  if (!userId || userId.includes('/') || !['banked','approved','rejected','waitlist'].includes(decision)) {
    throw new HttpsError('invalid-argument', 'Choose a valid application decision.');
  }

  // Role approval requires the account holder's accepted agreement and
  // authoritative age access. This intentionally does NOT enable suspended
  // accounts or silently grant permissions to accounts without consent.
  if (decision === 'approved') {
    await requireProfessionalLegalTerms(userId);
    await requireAgeVerified(userId);
  }

  const applicationRef = professionalApplicationRef(userId);
  const accountDocument = accountRef(userId);
  const eventDocument = applicationRef.collection('events').doc();
  const result = await db.runTransaction(async (tx) => {
    const [applicationSnapshot, accountSnapshot] = await Promise.all([
      tx.get(applicationRef),
      tx.get(accountDocument),
    ]);
    if (!applicationSnapshot.exists || !accountSnapshot.exists) {
      throw new HttpsError('not-found', 'Professional application not found.');
    }
    const application = applicationSnapshot.data() ?? {};
    const account = accountSnapshot.data() ?? {};
    if (ADMIN_EMAILS.has(cleanEmail(account.email)) || account.role === 'admin') {
      throw new HttpsError('permission-denied', 'Owner accounts are not professional applicants.');
    }
    if (decision === 'approved' && account.status === 'suspended') {
      throw new HttpsError('failed-precondition', 'A suspended account cannot be approved. Review its suspension separately.');
    }

    const requested = cleanProfessionalRoles(application.requestedRoles);
    const rolesReviewed = (selectedRoles.length ? selectedRoles : requested)
      .filter((role) => requested.includes(role));
    const rolesToApprove = decision === 'approved' ? rolesReviewed : [];
    if (decision === 'approved' && !rolesToApprove.length) {
      throw new HttpsError('failed-precondition', 'There are no pending professional roles selected for approval.');
    }
    const currentApproved = professionalRolesForAccount(account) as ProfessionalRole[];
    const nextApproved = decision === 'approved'
      ? Array.from(new Set([...currentApproved, ...rolesToApprove]))
      : currentApproved;
    const remainingRequested = decision === 'approved'
      ? requested.filter((role) => !rolesToApprove.includes(role))
      : decision === 'rejected' ? [] : requested;
    const nextStatus = decision === 'approved'
      ? (remainingRequested.length ? 'banked' : 'approved')
      : decision;
    const currentRole = cleanText(account.role, 30);
    const activeRole = currentRole === 'listener' ||
      (currentRole && nextApproved.includes(currentRole as ProfessionalRole))
      ? currentRole
      : (nextApproved[0] ?? 'listener');
    const now = FieldValue.serverTimestamp();

    // All three writes commit together. Firestore retries the read phase if
    // another admin changes the application or roles concurrently.
    tx.set(applicationRef, {
      requestedRoles: remainingRequested,
      approvedRoles: nextApproved,
      status: nextStatus,
      wave: wave || application.wave || null,
      reviewedBy: admin.uid,
      reviewedAt: now,
      updatedAt: now,
    }, { merge: true });
    tx.set(accountDocument, {
      approvedProfessionalRoles: nextApproved,
      pendingProfessionalRoles: remainingRequested,
      role: activeRole,
      // Preserve account.status: approving a profession never restores a
      // suspended or otherwise restricted account.
      professionalAccessUpdatedBy: admin.uid,
      professionalAccessUpdatedAt: now,
      updatedAt: now,
    }, { merge: true });
    tx.create(eventDocument, {
      userId,
      decision,
      roles: rolesReviewed,
      wave: wave || null,
      previousStatus: cleanText(application.status, 30) || 'banked',
      resultingStatus: nextStatus,
      approvedRolesAfter: nextApproved,
      pendingRolesAfter: remainingRequested,
      reviewedBy: admin.uid,
      createdAt: now,
    });
    return {
      userId, decision, approvedProfessionalRoles: nextApproved,
      pendingProfessionalRoles: remainingRequested, activeRole,
      applicationStatus: nextStatus, wave: wave || application.wave || null,
    };
  });
  await syncCreatorCustomTagUsage(userId);
  return result;
});

// NIGHTJAR_ADMIN_EMAIL_COMMUNICATIONS_V1

type AdminEmailAudience =
  | 'all_professionals'
  | 'creator'
  | 'writer'
  | 'editor'
  | 'artist'
  | 'all_testers'
  | 'all_members';

type AdminEmailCategory =
  | 'testing_update'
  | 'creator_operations'
  | 'account_service';

type AdminEmailRecipient = {
  email: string;
  displayName: string;
  firstName: string;
  roleLabel: string;
  userId: string | null;
  source: 'account' | 'tester_allowlist';
};

const EMAIL_AUDIENCES = new Set<AdminEmailAudience>([
  'all_professionals',
  'creator',
  'writer',
  'editor',
  'artist',
  'all_testers',
  'all_members',
]);

const EMAIL_CATEGORIES = new Set<AdminEmailCategory>([
  'testing_update',
  'creator_operations',
  'account_service',
]);

const MAX_EMAIL_CAMPAIGN_RECIPIENTS = 250;

const adminEmailAudienceLabel = (audience: AdminEmailAudience) => ({
  all_professionals: 'All professional creators',
  creator: 'VA Creators',
  writer: 'Writers',
  editor: 'Audio Editors',
  artist: 'Artists',
  all_testers: 'Founding / private-beta testers',
  all_members: 'All active Nightjar members',
}[audience]);

const adminEmailCategoryLabel = (category: AdminEmailCategory) => ({
  testing_update: 'Private testing update',
  creator_operations: 'Creator operations',
  account_service: 'Account / service',
}[category]);

const professionalRoleLabel = (roles: string[]) => {
  const labels = roles
    .filter((role) => ['creator','writer','editor','artist'].includes(role))
    .map((role) => role === 'creator' ? 'VA Creator' : role === 'editor' ? 'Audio Editor' : role === 'writer' ? 'Writer' : 'Artist');
  return labels.length ? labels.join(' · ') : 'Nightjar member';
};

const displayNameFromEmail = (email: string) => {
  const local = email.split('@')[0] || 'Nightjar member';
  const cleaned = local.replace(/[._+-]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!cleaned) return 'Nightjar member';
  return cleaned
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
    .slice(0, 80);
};

const firstNameFromDisplayName = (displayName: string) =>
  cleanText(displayName, 80).split(/\s+/).filter(Boolean)[0] || 'there';

const resolveAdminEmailAudience = async (audience: AdminEmailAudience): Promise<AdminEmailRecipient[]> => {
  const accountSnapshot = await db.collection('accounts').limit(2000).get();
  const candidates = accountSnapshot.docs
    .map((doc) => ({ doc, data: doc.data() ?? {} }))
    .filter(({ data }) => data.status !== 'suspended')
    .filter(({ data }) => !ADMIN_EMAILS.has(cleanEmail(data.email)))
    .filter(({ data }) => {
      const roles = professionalRolesForAccount(data);
      const status = String(data.status ?? 'active');
      if (audience === 'all_testers') return data.testAccess === true;
      if (status !== 'active') return false;
      if (audience === 'all_members') return true;
      if (audience === 'all_professionals') return roles.length > 0;
      if (audience === 'creator') return roles.includes('creator');
      if (audience === 'writer') return roles.includes('writer');
      if (audience === 'editor') return roles.includes('editor');
      if (audience === 'artist') return roles.includes('artist');
      return false;
    });

  const profileRefs = candidates.map(({ doc }) => profileRef(doc.id));
  const profileSnapshots = profileRefs.length
    ? await db.getAll(...profileRefs)
    : [];
  const profileById = new Map(profileSnapshots.map((snapshot) => [snapshot.id, snapshot.data() ?? {}]));

  const recipients = new Map<string, AdminEmailRecipient>();

  for (const { doc, data } of candidates) {
    const email = cleanEmail(data.email);
    if (!validEmailAddress(email)) continue;
    const profile = profileById.get(doc.id) ?? {};
    const displayName =
      cleanText(profile.displayName, 80)
      || cleanText(data.displayName, 80)
      || displayNameFromEmail(email);
    const roles = professionalRolesForAccount(data);
    recipients.set(email, {
      email,
      displayName,
      firstName: firstNameFromDisplayName(displayName),
      roleLabel: professionalRoleLabel(roles),
      userId: doc.id,
      source: 'account',
    });
  }

  if (audience === 'all_testers') {
    const testerSnapshot = await db.collection(CLOSED_BETA_ALLOWLIST_COLLECTION)
      .where('enabled', '==', true)
      .limit(2000)
      .get();

    for (const doc of testerSnapshot.docs) {
      const data = doc.data() ?? {};
      const email = cleanEmail(data.email);
      if (!validEmailAddress(email) || ADMIN_EMAILS.has(email) || recipients.has(email)) continue;
      const displayName =
        cleanText(data.displayName, 80)
        || cleanText(data.name, 80)
        || displayNameFromEmail(email);
      recipients.set(email, {
        email,
        displayName,
        firstName: firstNameFromDisplayName(displayName),
        roleLabel: 'Private-beta tester',
        userId: null,
        source: 'tester_allowlist',
      });
    }
  }

  return [...recipients.values()].sort((a, b) =>
    a.displayName.localeCompare(b.displayName, 'en-GB', { sensitivity: 'base' })
    || a.email.localeCompare(b.email)
  );
};

const escapeEmailHtml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const applyEmailPersonalisation = (template: string, recipient: AdminEmailRecipient) => template
  .replace(/\{\{\s*firstName\s*\}\}/gi, recipient.firstName)
  .replace(/\{\{\s*displayName\s*\}\}/gi, recipient.displayName)
  .replace(/\{\{\s*role\s*\}\}/gi, recipient.roleLabel);

const emailFooterText = (category: AdminEmailCategory) => {
  if (category === 'testing_update') {
    return "You are receiving this because you are participating in Nightjar's private testing.";
  }
  if (category === 'creator_operations') {
    return 'This is a Nightjar creator-operations message about the platform or your creator participation.';
  }
  return 'This is a Nightjar account/service communication.';
};

const renderAdminEmail = (
  subjectTemplate: string,
  bodyTemplate: string,
  category: AdminEmailCategory,
  recipient: AdminEmailRecipient,
) => {
  const subject = applyEmailPersonalisation(subjectTemplate, recipient).replace(/[\r\n]+/g, ' ').trim();
  const body = applyEmailPersonalisation(bodyTemplate, recipient).trim();
  const footer = emailFooterText(category);
  const text = body + '\n\n—\n' + footer + '\nNightjar — Audio, after dark. 🌙';
  const htmlBody = escapeEmailHtml(body).replace(/\r?\n/g, '<br>');
  const html = [
    '<div style="font-family:Arial,Helvetica,sans-serif;line-height:1.6;color:#f5f0f7;background:#171119;padding:28px;border-radius:18px">',
    '<div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#bfa8c9;margin-bottom:14px">Nightjar · ' + escapeEmailHtml(adminEmailCategoryLabel(category)) + '</div>',
    '<div style="font-size:16px">' + htmlBody + '</div>',
    '<div style="margin-top:28px;padding-top:18px;border-top:1px solid #3c2f41;color:#bfa8c9;font-size:12px">',
    escapeEmailHtml(footer) + '<br>Nightjar — Audio, after dark. 🌙',
    '</div></div>',
  ].join('');
  return { subject, text, html };
};

const gmailIntegrationRef = () => db.collection('systemIntegrations').doc('gmail');
const gmailOAuthStateRef = (state: string) => db
  .collection('gmailOAuthStates')
  .doc(createHash('sha256').update(state).digest('hex'));

const gmailOAuthConfig = () => {
  const clientId = String(NIGHTJAR_GMAIL_CLIENT_ID.value() ?? '').trim();
  const clientSecret = String(NIGHTJAR_GMAIL_CLIENT_SECRET.value() ?? '').trim();
  if (!clientId || !clientSecret) {
    throw new HttpsError(
      'failed-precondition',
      'Nightjar Gmail OAuth is not configured yet. Add the Google OAuth client ID and client secret first.',
      { code: 'gmail_oauth_not_configured' },
    );
  }
  return { clientId, clientSecret };
};

const gmailAccessToken = async () => {
  const integration = await gmailIntegrationRef().get();
  const refreshToken = String(integration.data()?.refreshToken ?? '').trim();
  if (!refreshToken) {
    throw new HttpsError(
      'failed-precondition',
      'Nightjar Mail is not connected to Gmail. Open the owner console and connect the Nightjar Gmail account.',
      { code: 'gmail_not_connected' },
    );
  }

  const config = gmailOAuthConfig();
  try {
    const token = await refreshGoogleAccessToken({
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      refreshToken,
    });
    const accessToken = token.access_token as string;
    const tokenInfo = await getGoogleTokenInfo(accessToken);
    if (!tokenInfo.scopes.includes('https://www.googleapis.com/auth/gmail.send')) {
      throw new Error('The Google authorisation is missing the gmail.send permission.');
    }
    return accessToken;
  } catch (error) {
    throw new HttpsError(
      'failed-precondition',
      'Nightjar could not refresh Gmail authorisation. Reconnect the Nightjar Gmail account in the owner console.',
      {
        code: 'gmail_reconnect_required',
        detail: cleanText(error instanceof Error ? error.message : error, 500),
      },
    );
  }
};

// Approval emails are transactionally claimed per approval event. Do not run
// external Gmail calls inside an application approval transaction: a mail
// outage must never revoke or rollback a creator's successfully approved roles.
const professionalApprovalEmailRef = (userId: string, eventId: string) =>
  professionalApplicationRef(userId).collection('approvalEmails').doc(eventId);

const approvalEmailSummary = async (
  userId: string,
  eventId: string,
  status: 'sending' | 'sent' | 'failed',
  error: string | null = null,
) => {
  const ref = professionalApplicationRef(userId);
  await db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    // A later role approval may have superseded this email in the UI.
    if (snapshot.data()?.approvalEmailEventId !== eventId) return;
    tx.set(ref, {
      approvalEmailStatus: status,
      approvalEmailError: error,
      approvalEmailStatusUpdatedAt: FieldValue.serverTimestamp(),
      ...(status === 'sent' ? { approvalEmailSentAt: FieldValue.serverTimestamp() } : {}),
    }, { merge: true });
  });
};

const sendProfessionalApprovalEmailForEvent = async (
  userId: string,
  eventId: string,
  decisionEvent: Record<string, unknown>,
  retryFailed: boolean,
): Promise<'sent' | 'failed' | 'skipped'> => {
  const roles = cleanProfessionalRoles(decisionEvent.roles);
  if (decisionEvent.decision !== 'approved' || roles.length === 0) return 'skipped';

  const deliveryRef = professionalApprovalEmailRef(userId, eventId);
  const claimed = await db.runTransaction(async (tx) => {
    const snapshot = await tx.get(deliveryRef);
    if (retryFailed) {
      if (!snapshot.exists) {
        tx.create(deliveryRef, {
          userId,
          eventId,
          roles,
          status: 'sending',
          attempts: 1,
          transport: 'gmail_api_oauth2',
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      } else {
        if (snapshot.data()?.status !== 'failed') return false;
        tx.set(deliveryRef, {
          status: 'sending',
          attempts: FieldValue.increment(1),
          lastError: null,
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
      }
    } else {
      if (snapshot.exists) return false;
      tx.create(deliveryRef, {
        userId,
        eventId,
        roles,
        status: 'sending',
        attempts: 1,
        transport: 'gmail_api_oauth2',
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    return true;
  });
  if (!claimed) return 'skipped';

  let email = '';
  try {
  // Preserve access on any notification failure; record it for safe admin retry.
  if (!retryFailed || !(await professionalApplicationRef(userId).get()).data()?.approvalEmailEventId) {
    await professionalApplicationRef(userId).set({
      approvalEmailEventId: eventId,
      approvalEmailStatus: 'sending',
      approvalEmailError: null,
      approvalEmailSentAt: null,
      approvalEmailStatusUpdatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  } else {
    await approvalEmailSummary(userId, eventId, 'sending');
  }

  const [accountSnap, applicationSnap, profileSnap] = await Promise.all([
    accountRef(userId).get(),
    professionalApplicationRef(userId).get(),
    profileRef(userId).get(),
  ]);
  email = cleanEmail(accountSnap.data()?.email || applicationSnap.data()?.email);
  const displayName = cleanText(profileSnap.data()?.displayName, 80)
    || cleanText(accountSnap.data()?.displayName, 80)
    || displayNameFromEmail(email);
  const roleLabel = professionalRoleLabel(roles);
  const wave = cleanText(decisionEvent.wave, 80);
  const recipient: AdminEmailRecipient = {
    email,
    displayName,
    firstName: firstNameFromDisplayName(displayName),
    roleLabel,
    userId,
    source: 'account',
  };
  const subject = 'Your Nightjar professional application has been approved';
  const body = [
    'Hi {{firstName}},',
    '',
    'Welcome to Nightjar! Your application has been approved for the following professional role' + (roles.length > 1 ? 's' : '') + ': {{role}}.',
    wave ? 'Intake wave: ' + wave + '.' : '',
    '',
    'Sign in to Nightjar with the same account you used to apply. Your approved professional workspace is now available, and you can complete your profile and prepare for collaboration.',
    '',
    'Nightjar is still in controlled testing. Approval does not mean the public platform has launched, guarantee publication, or promise a payment. Future releases and creator arrangements remain subject to the applicable professional terms, launch readiness and safety requirements.',
    '',
    'For questions, reply to this email.',
    '',
    'Welcome aboard,',
    'The Nightjar Team',
  ].filter((line) => line !== '').join('\n\n');

    if (!validEmailAddress(email)) throw new Error('Approved account is missing a valid email address.');
    const accessToken = await gmailAccessToken();
    const rendered = renderAdminEmail(subject, body, 'account_service', recipient);
    // Gmail has no true idempotency key. Never automatically resend a
    // previously claimed delivery whose outcome is unknown.
    const result = await sendGmailApiMessage({
      accessToken,
      fromEmail: NIGHTJAR_GMAIL_SENDER_EMAIL,
      fromName: 'Nightjar',
      replyTo: NIGHTJAR_GMAIL_SENDER_EMAIL,
      message: { toEmail: email, toName: displayName, ...rendered },
    });
    await deliveryRef.set({
      status: 'sent',
      providerMessageId: result.id || null,
      recipientEmail: email,
      subject: rendered.subject,
      sentAt: FieldValue.serverTimestamp(),
      lastError: null,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    await approvalEmailSummary(userId, eventId, 'sent').catch((error) =>
      console.error('Nightjar approval mail sent but summary update failed', eventId, error));
    await db.collection('emailAudit').add({
      type: 'professional_approval',
      userId,
      eventId,
      recipientEmail: email,
      roles,
      subject: rendered.subject,
      transport: 'gmail_api_oauth2',
      providerMessageId: result.id || null,
      createdAt: FieldValue.serverTimestamp(),
    }).catch((error) => console.error('Nightjar approval mail audit write failed', eventId, error));
    return 'sent';
  } catch (error) {
    const detail = cleanText(error instanceof Error ? error.message : error, 600) || 'Unknown notification error';
    await deliveryRef.set({
      status: 'failed',
      lastError: detail,
      recipientEmail: email || null,
      failedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    await approvalEmailSummary(userId, eventId, 'failed', detail).catch((summaryError) =>
      console.error('Nightjar approval mail failure summary update failed', eventId, summaryError));
    console.error('Nightjar creator approval mail failed', eventId, detail);
    return 'failed';
  }
};

export const sendProfessionalApprovalEmail = onDocumentCreated({
  document: 'professionalApplications/{userId}/events/{eventId}',
  region: REGION,
  secrets: [NIGHTJAR_GMAIL_CLIENT_ID, NIGHTJAR_GMAIL_CLIENT_SECRET],
  retry: false,
}, async (event) => {
  const userId = event.params.userId;
  const eventId = event.params.eventId;
  const data = event.data?.data() ?? {};
  if (data.decision !== 'approved' || cleanProfessionalRoles(data.roles).length === 0) return;
  await sendProfessionalApprovalEmailForEvent(userId, eventId, data, false);
});

export const adminRetryProfessionalApprovalEmail = onCall({
  region: REGION,
  secrets: [NIGHTJAR_GMAIL_CLIENT_ID, NIGHTJAR_GMAIL_CLIENT_SECRET],
}, async (request) => {
  requireAdminIdentity(request);
  const input = (request.data ?? {}) as Record<string, unknown>;
  const userId = cleanText(input.userId, 160);
  const eventId = cleanText(input.eventId, 160);
  if (!userId || !eventId || userId.includes('/') || eventId.includes('/')) {
    throw new HttpsError('invalid-argument', 'Select a valid approval email to retry.');
  }
  const decision = await professionalApplicationRef(userId).collection('events').doc(eventId).get();
  if (!decision.exists || decision.data()?.decision !== 'approved') {
    throw new HttpsError('failed-precondition', 'Only original approved-role notifications may be retried.');
  }
  const outcome = await sendProfessionalApprovalEmailForEvent(userId, eventId, decision.data() ?? {}, true);
  if (outcome === 'skipped') {
    throw new HttpsError('failed-precondition', 'This email has already been sent or is currently being processed.');
  }
  return { userId, eventId, outcome };
});

const publicCampaignSummary = (id: string, data: Record<string, any>) => ({
  id,
  subject: cleanText(data.subject, 180),
  category: cleanText(data.category, 40),
  categoryLabel: EMAIL_CATEGORIES.has(data.category as AdminEmailCategory)
    ? adminEmailCategoryLabel(data.category as AdminEmailCategory)
    : cleanText(data.category, 80),
  audience: cleanText(data.audience, 40),
  audienceLabel: EMAIL_AUDIENCES.has(data.audience as AdminEmailAudience)
    ? adminEmailAudienceLabel(data.audience as AdminEmailAudience)
    : cleanText(data.audience, 80),
  status: cleanText(data.status, 40),
  recipientCount: Number(data.recipientCount ?? 0),
  sentCount: Number(data.sentCount ?? 0),
  failedCount: Number(data.failedCount ?? 0),
  createdAt: toIso(data.createdAt),
  completedAt: toIso(data.completedAt),
  createdBy: cleanEmail(data.createdBy),
});


export const adminGmailOAuthStatus = onCall({
  region: REGION,
  secrets: [NIGHTJAR_GMAIL_CLIENT_ID, NIGHTJAR_GMAIL_CLIENT_SECRET],
}, async (request) => {
  requireAdminIdentity(request);
  let configured = true;
  try {
    gmailOAuthConfig();
  } catch {
    configured = false;
  }

  const integration = await gmailIntegrationRef().get();
  const connected = integration.exists && Boolean(String(integration.data()?.refreshToken ?? '').trim());
  let healthy = false;
  let reconnectRequired = false;

  if (configured && connected) {
    try {
      await gmailAccessToken();
      healthy = true;
    } catch {
      reconnectRequired = true;
    }
  }

  return {
    configured,
    connected,
    healthy,
    reconnectRequired,
    senderEmail: NIGHTJAR_GMAIL_SENDER_EMAIL,
    connectedAt: toIso(integration.data()?.connectedAt),
    connectedBy: cleanEmail(integration.data()?.connectedBy),
    scope: 'https://www.googleapis.com/auth/gmail.send',
    transport: 'gmail_api_oauth2',
  };
});

export const adminBeginGmailOAuth = onCall({
  region: REGION,
  secrets: [NIGHTJAR_GMAIL_CLIENT_ID, NIGHTJAR_GMAIL_CLIENT_SECRET],
}, async (request) => {
  const admin = requireAdminIdentity(request);
  const { clientId } = gmailOAuthConfig();
  const state = randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '');

  await gmailOAuthStateRef(state).set({
    adminUserId: admin.uid,
    adminEmail: admin.email,
    expiresAtMs: Date.now() + 15 * 60 * 1000,
    createdAt: FieldValue.serverTimestamp(),
  });

  const query = new URLSearchParams({
    client_id: clientId,
    redirect_uri: NIGHTJAR_GMAIL_REDIRECT_URI,
    response_type: 'code',
    scope: NIGHTJAR_GMAIL_SCOPE,
    access_type: 'offline',
    prompt: 'consent select_account',
    include_granted_scopes: 'true',
    login_hint: NIGHTJAR_GMAIL_SENDER_EMAIL,
    state,
  });

  return {
    authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth?' + query.toString(),
    senderEmail: NIGHTJAR_GMAIL_SENDER_EMAIL,
    redirectUri: NIGHTJAR_GMAIL_REDIRECT_URI,
  };
});

export const adminGmailOAuthCallback = onRequest({
  region: REGION,
  secrets: [NIGHTJAR_GMAIL_CLIENT_ID, NIGHTJAR_GMAIL_CLIENT_SECRET],
}, async (request, response) => {
  const state = cleanText(request.query.state, 300);
  const code = cleanText(request.query.code, 3000);
  const oauthError = cleanText(request.query.error, 200);

  const render = (ok: boolean, title: string, detail: string) => {
    response.status(ok ? 200 : 400).send(
      '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>Nightjar Mail</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0c0b0d;color:#eee7df;font-family:system-ui,sans-serif;padding:24px}.card{max-width:620px;border:1px solid #342c36;border-radius:22px;padding:30px;background:#151217}h1{font-family:Georgia,serif;font-weight:400}p{color:#afa4af;line-height:1.7}.ok{color:#cbb5cc}</style></head><body><main class="card"><div class="ok">NIGHTJAR · MAIL</div><h1>' +
      title +
      '</h1><p>' +
      detail +
      '</p><p>You can close this window and return to the Nightjar owner console.</p></main></body></html>',
    );
  };

  if (oauthError) {
    render(false, 'Google authorisation was cancelled.', 'Nightjar did not receive permission to send mail.');
    return;
  }
  if (!state || !code) {
    render(false, 'Authorisation could not be completed.', 'The Google callback was missing required information.');
    return;
  }

  const stateRef = gmailOAuthStateRef(state);
  const stateSnapshot = await stateRef.get();
  const stateData = stateSnapshot.data() ?? {};
  await stateRef.delete().catch(() => undefined);

  if (!stateSnapshot.exists || Number(stateData.expiresAtMs ?? 0) < Date.now() || !ADMIN_EMAILS.has(cleanEmail(stateData.adminEmail))) {
    render(false, 'This authorisation link has expired.', 'Start Gmail connection again from the Nightjar owner console.');
    return;
  }

  try {
    const config = gmailOAuthConfig();
    const token = await exchangeGoogleAuthorizationCode({
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      code,
      redirectUri: NIGHTJAR_GMAIL_REDIRECT_URI,
    });

    if (!token.refresh_token) {
      throw new Error('Google did not return an offline refresh token. Re-authorise with consent.');
    }

    const accessToken = token.access_token as string;
    const [userInfo, tokenInfo] = await Promise.all([
      getGoogleUserInfo(accessToken),
      getGoogleTokenInfo(accessToken),
    ]);
    if (!tokenInfo.scopes.includes('https://www.googleapis.com/auth/gmail.send')) {
      await revokeGoogleToken(token.refresh_token).catch(() => undefined);
      throw new Error('Google did not grant Nightjar the Gmail send permission. In Google Auth Platform → Data Access, add https://www.googleapis.com/auth/gmail.send, then reconnect and approve the send permission.');
    }
    if (!userInfo.emailVerified || userInfo.email !== NIGHTJAR_GMAIL_SENDER_EMAIL) {
      await revokeGoogleToken(token.refresh_token).catch(() => undefined);
      throw new Error('The authorised Google account was ' + (userInfo.email || 'unknown') + ', not ' + NIGHTJAR_GMAIL_SENDER_EMAIL + '.');
    }

    await gmailIntegrationRef().set({
      provider: 'gmail',
      transport: 'gmail_api_oauth2',
      senderEmail: NIGHTJAR_GMAIL_SENDER_EMAIL,
      refreshToken: token.refresh_token,
      grantedScope: token.scope ?? NIGHTJAR_GMAIL_SCOPE,
      googleSubject: userInfo.subject || null,
      connectedByUserId: cleanText(stateData.adminUserId, 160),
      connectedBy: cleanEmail(stateData.adminEmail),
      connectedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    render(true, 'Nightjar Mail is connected.', 'Google authorised ' + NIGHTJAR_GMAIL_SENDER_EMAIL + ' with send-only Gmail access.');
  } catch (error) {
    await gmailIntegrationRef().set({
      lastOAuthError: cleanText(error instanceof Error ? error.message : error, 600),
      lastOAuthErrorAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    render(false, 'Nightjar could not finish Gmail authorisation.', 'Return to the owner console and try Connect Gmail again.');
  }
});

export const adminDisconnectGmailOAuth = onCall({ region: REGION }, async (request) => {
  const admin = requireAdminIdentity(request);
  const integration = await gmailIntegrationRef().get();
  const refreshToken = String(integration.data()?.refreshToken ?? '').trim();

  if (refreshToken) {
    await revokeGoogleToken(refreshToken).catch(() => undefined);
  }

  await gmailIntegrationRef().set({
    refreshToken: FieldValue.delete(),
    googleSubject: FieldValue.delete(),
    disconnectedAt: FieldValue.serverTimestamp(),
    disconnectedByUserId: admin.uid,
    disconnectedBy: admin.email,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  return { disconnected: true };
});

export const adminEmailAudiencePreview = onCall({ region: REGION }, async (request) => {
  requireAdminIdentity(request);
  const audience = cleanText((request.data as Record<string, unknown> | undefined)?.audience, 40) as AdminEmailAudience;
  if (!EMAIL_AUDIENCES.has(audience)) {
    throw new HttpsError('invalid-argument', 'Choose a valid Nightjar email audience.');
  }
  const recipients = await resolveAdminEmailAudience(audience);
  return {
    audience,
    audienceLabel: adminEmailAudienceLabel(audience),
    recipientCount: recipients.length,
    sendLimit: MAX_EMAIL_CAMPAIGN_RECIPIENTS,
    overSendLimit: recipients.length > MAX_EMAIL_CAMPAIGN_RECIPIENTS,
    recipients: recipients.slice(0, 100).map((recipient) => ({
      email: recipient.email,
      displayName: recipient.displayName,
      roleLabel: recipient.roleLabel,
      source: recipient.source,
    })),
    recipientPreviewTruncated: recipients.length > 100,
  };
});

export const adminListEmailCampaigns = onCall({ region: REGION }, async (request) => {
  requireAdminIdentity(request);
  const snapshot = await db.collection('emailCampaigns')
    .orderBy('createdAt', 'desc')
    .limit(25)
    .get();
  return {
    campaigns: snapshot.docs.map((doc) => publicCampaignSummary(doc.id, doc.data() ?? {})),
  };
});

export const adminSendEmailTest = onCall({
  region: REGION,
  timeoutSeconds: 120,
  secrets: [NIGHTJAR_GMAIL_CLIENT_ID, NIGHTJAR_GMAIL_CLIENT_SECRET],
}, async (request) => {
  const admin = requireAdminIdentity(request);
  const input = (request.data ?? {}) as Record<string, unknown>;
  const subjectTemplate = cleanText(input.subject, 180);
  const bodyTemplate = cleanText(input.body, 12000);
  const category = cleanText(input.category, 40) as AdminEmailCategory;
  const submittedEmails = Array.isArray(input.recipientEmails)
    ? input.recipientEmails.map((value) => cleanEmail(value)).filter(Boolean)
    : [];

  if (!subjectTemplate || !bodyTemplate) throw new HttpsError('invalid-argument', 'Subject and message are required.');
  if (!EMAIL_CATEGORIES.has(category)) throw new HttpsError('invalid-argument', 'Choose a valid communication type.');

  const uniqueEmails = Array.from(new Set(submittedEmails.length ? submittedEmails : [admin.email]));
  if (uniqueEmails.length > 10) {
    throw new HttpsError('invalid-argument', 'Nightjar allows up to 10 manual test recipients at a time.');
  }
  const invalidEmails = uniqueEmails.filter((email) => !validEmailAddress(email));
  if (invalidEmails.length) {
    throw new HttpsError('invalid-argument', 'One or more manual test email addresses are invalid.');
  }

  const recipients: AdminEmailRecipient[] = uniqueEmails.map((email) => {
    const isAdminAddress = email === admin.email;
    const displayName = isAdminAddress ? 'Nightjar Admin' : displayNameFromEmail(email);
    return {
      email,
      displayName,
      firstName: isAdminAddress ? 'Nightjar' : firstNameFromDisplayName(displayName),
      roleLabel: isAdminAddress ? 'Administrator' : 'Test recipient',
      userId: isAdminAddress ? admin.uid : null,
      source: 'account',
    };
  });

  const results: { email: string; status: 'sent' | 'failed'; error?: string }[] = [];
  let accessToken: string;
  try {
    accessToken = await gmailAccessToken();
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    throw new HttpsError(
      'unavailable',
      'Nightjar Mail could not authorise with Gmail. Reconnect Gmail in the owner console.',
      { code: 'gmail_authorisation_failed' },
    );
  }

  for (const recipient of recipients) {
    const rendered = renderAdminEmail(subjectTemplate, bodyTemplate, category, recipient);
    try {
      const sent = await sendGmailApiMessage({
        accessToken,
        fromEmail: NIGHTJAR_GMAIL_SENDER_EMAIL,
        fromName: 'Nightjar',
        replyTo: NIGHTJAR_GMAIL_SENDER_EMAIL,
        message: {
          toEmail: recipient.email,
          toName: recipient.displayName,
          ...rendered,
        },
      });
      results.push({ email: recipient.email, status: 'sent' });
      await db.collection('emailAudit').add({
        type: 'manual_test',
        adminUserId: admin.uid,
        adminEmail: admin.email,
        subject: rendered.subject,
        category,
        recipientEmail: recipient.email,
        providerMessageId: sent.id || null,
        transport: 'gmail_api_oauth2',
        deliveryModel: 'one_recipient_per_message',
        createdAt: FieldValue.serverTimestamp(),
      });
    } catch (error) {
      results.push({
        email: recipient.email,
        status: 'failed',
        error: cleanText(error instanceof Error ? error.message : error, 600),
      });
    }
  }

  const sentCount = results.filter((result) => result.status === 'sent').length;
  const failedCount = results.length - sentCount;
  return {
    sent: failedCount === 0,
    recipientEmail: recipients.length === 1 ? recipients[0].email : null,
    recipientEmails: recipients.map((recipient) => recipient.email),
    sentCount,
    failedCount,
    results,
  };
});

export const adminSendEmailCampaign = onCall({
  region: REGION,
  timeoutSeconds: 540,
  memory: '512MiB',
  secrets: [NIGHTJAR_GMAIL_CLIENT_ID, NIGHTJAR_GMAIL_CLIENT_SECRET],
}, async (request) => {
  const admin = requireAdminIdentity(request);
  const input = (request.data ?? {}) as Record<string, unknown>;
  const subjectTemplate = cleanText(input.subject, 180);
  const bodyTemplate = cleanText(input.body, 12000);
  const audience = cleanText(input.audience, 40) as AdminEmailAudience;
  const category = cleanText(input.category, 40) as AdminEmailCategory;
  const clientRequestId = cleanText(input.clientRequestId, 120);
  const confirmed = input.confirmPrivateIndividualDelivery === true;

  if (!subjectTemplate || !bodyTemplate) throw new HttpsError('invalid-argument', 'Subject and message are required.');
  if (!EMAIL_AUDIENCES.has(audience)) throw new HttpsError('invalid-argument', 'Choose a valid Nightjar email audience.');
  if (!EMAIL_CATEGORIES.has(category)) throw new HttpsError('invalid-argument', 'Choose a valid communication type.');
  if (!confirmed) {
    throw new HttpsError(
      'failed-precondition',
      'Confirm that Nightjar will send one private email per recipient with no CC or BCC recipients.',
      { code: 'individual_delivery_confirmation_required' },
    );
  }
  if (!clientRequestId) throw new HttpsError('invalid-argument', 'A send request identifier is required.');

  const campaignId = createHash('sha256')
    .update(admin.uid + '\u0000' + clientRequestId)
    .digest('hex')
    .slice(0, 40);
  const campaignRef = db.collection('emailCampaigns').doc(campaignId);
  const existingCampaign = await campaignRef.get();
  if (existingCampaign.exists) {
    return { campaign: publicCampaignSummary(campaignId, existingCampaign.data() ?? {}), duplicateRequest: true };
  }

  const recipients = await resolveAdminEmailAudience(audience);
  if (!recipients.length) throw new HttpsError('failed-precondition', 'That audience currently has no deliverable email addresses.');
  if (recipients.length > MAX_EMAIL_CAMPAIGN_RECIPIENTS) {
    throw new HttpsError(
      'resource-exhausted',
      'This campaign has ' + recipients.length + ' recipients. Nightjar currently limits a single Gmail API campaign to ' + MAX_EMAIL_CAMPAIGN_RECIPIENTS + ' private deliveries.',
      { code: 'email_campaign_too_large', recipientCount: recipients.length, sendLimit: MAX_EMAIL_CAMPAIGN_RECIPIENTS },
    );
  }

  await campaignRef.create({
    subject: subjectTemplate,
    body: bodyTemplate,
    category,
    audience,
    audienceLabel: adminEmailAudienceLabel(audience),
    status: 'sending',
    recipientCount: recipients.length,
    sentCount: 0,
    failedCount: 0,
    createdByUserId: admin.uid,
    createdBy: admin.email,
    clientRequestId,
    deliveryModel: 'one_recipient_per_message',
    transport: 'gmail_api_oauth2',
    ccUsed: false,
    bccUsed: false,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  const pendingBatch = db.batch();
  for (const recipient of recipients) {
    const deliveryId = createHash('sha256').update(recipient.email).digest('hex');
    pendingBatch.set(campaignRef.collection('deliveries').doc(deliveryId), {
      email: recipient.email,
      displayName: recipient.displayName,
      firstName: recipient.firstName,
      roleLabel: recipient.roleLabel,
      userId: recipient.userId,
      source: recipient.source,
      status: 'pending',
      attempts: 0,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
  await pendingBatch.commit();

  const accessToken = await gmailAccessToken();
  let sentCount = 0;
  let failedCount = 0;

  for (const recipient of recipients) {
    const deliveryId = createHash('sha256').update(recipient.email).digest('hex');
    const deliveryRef = campaignRef.collection('deliveries').doc(deliveryId);
    const rendered = renderAdminEmail(subjectTemplate, bodyTemplate, category, recipient);
    try {
      const sent = await sendGmailApiMessage({
        accessToken,
        fromEmail: NIGHTJAR_GMAIL_SENDER_EMAIL,
        fromName: 'Nightjar',
        replyTo: NIGHTJAR_GMAIL_SENDER_EMAIL,
        message: {
          toEmail: recipient.email,
          toName: recipient.displayName,
          ...rendered,
        },
      });
      sentCount += 1;
      await deliveryRef.set({
        status: 'sent',
        attempts: FieldValue.increment(1),
        providerMessageId: sent.id || null,
        transport: 'gmail_api_oauth2',
        sentAt: FieldValue.serverTimestamp(),
        lastError: null,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    } catch (error) {
      failedCount += 1;
      await deliveryRef.set({
        status: 'failed',
        attempts: FieldValue.increment(1),
        transport: 'gmail_api_oauth2',
        lastError: cleanText(error instanceof Error ? error.message : error, 600),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }
  }

  const status = failedCount === 0 ? 'completed' : sentCount === 0 ? 'failed' : 'partial_failure';
  await campaignRef.set({
    status,
    sentCount,
    failedCount,
    completedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  const finished = await campaignRef.get();
  return { campaign: publicCampaignSummary(campaignId, finished.data() ?? {}), duplicateRequest: false };
});

export const adminRetryEmailCampaign = onCall({
  region: REGION,
  timeoutSeconds: 540,
  memory: '512MiB',
  secrets: [NIGHTJAR_GMAIL_CLIENT_ID, NIGHTJAR_GMAIL_CLIENT_SECRET],
}, async (request) => {
  const admin = requireAdminIdentity(request);
  const campaignId = cleanText((request.data as Record<string, unknown> | undefined)?.campaignId, 120);
  if (!campaignId) throw new HttpsError('invalid-argument', 'Campaign is required.');

  const campaignRef = db.collection('emailCampaigns').doc(campaignId);
  const campaignSnapshot = await campaignRef.get();
  if (!campaignSnapshot.exists) throw new HttpsError('not-found', 'Email campaign not found.');
  const campaign = campaignSnapshot.data() ?? {};
  const category = cleanText(campaign.category, 40) as AdminEmailCategory;
  if (!EMAIL_CATEGORIES.has(category)) throw new HttpsError('failed-precondition', 'Campaign communication type is invalid.');

  const failedSnapshot = await campaignRef.collection('deliveries')
    .where('status', '==', 'failed')
    .limit(MAX_EMAIL_CAMPAIGN_RECIPIENTS)
    .get();
  if (failedSnapshot.empty) {
    return { campaign: publicCampaignSummary(campaignId, campaign), retried: 0 };
  }

  await campaignRef.set({
    status: 'retrying',
    retryStartedByUserId: admin.uid,
    retryStartedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  const accessToken = await gmailAccessToken();
  let recovered = 0;
  let stillFailed = 0;

  for (const deliveryDoc of failedSnapshot.docs) {
    const delivery = deliveryDoc.data() ?? {};
    const email = cleanEmail(delivery.email);
    if (!validEmailAddress(email)) {
      stillFailed += 1;
      continue;
    }
    const recipient: AdminEmailRecipient = {
      email,
      displayName: cleanText(delivery.displayName, 80) || displayNameFromEmail(email),
      firstName: cleanText(delivery.firstName, 80) || firstNameFromDisplayName(cleanText(delivery.displayName, 80)),
      roleLabel: cleanText(delivery.roleLabel, 120) || 'Nightjar member',
      userId: cleanText(delivery.userId, 160) || null,
      source: delivery.source === 'tester_allowlist' ? 'tester_allowlist' : 'account',
    };
    const rendered = renderAdminEmail(cleanText(campaign.subject, 180), cleanText(campaign.body, 12000), category, recipient);
    try {
      const sent = await sendGmailApiMessage({
        accessToken,
        fromEmail: NIGHTJAR_GMAIL_SENDER_EMAIL,
        fromName: 'Nightjar',
        replyTo: NIGHTJAR_GMAIL_SENDER_EMAIL,
        message: {
          toEmail: recipient.email,
          toName: recipient.displayName,
          ...rendered,
        },
      });
      recovered += 1;
      await deliveryDoc.ref.set({
        status: 'sent',
        attempts: FieldValue.increment(1),
        providerMessageId: sent.id || null,
        transport: 'gmail_api_oauth2',
        sentAt: FieldValue.serverTimestamp(),
        lastError: null,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    } catch (error) {
      stillFailed += 1;
      await deliveryDoc.ref.set({
        attempts: FieldValue.increment(1),
        transport: 'gmail_api_oauth2',
        lastError: cleanText(error instanceof Error ? error.message : error, 600),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }
  }

  const previousSent = Number(campaign.sentCount ?? 0);
  const previousFailed = Number(campaign.failedCount ?? failedSnapshot.size);
  const sentCount = previousSent + recovered;
  const failedCount = Math.max(0, previousFailed - recovered);
  const status = failedCount === 0 ? 'completed' : sentCount === 0 ? 'failed' : 'partial_failure';

  await campaignRef.set({
    status,
    sentCount,
    failedCount,
    lastRetryRecovered: recovered,
    lastRetryFailed: stillFailed,
    lastRetryAt: FieldValue.serverTimestamp(),
    completedAt: status === 'completed' ? FieldValue.serverTimestamp() : campaign.completedAt ?? null,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  const refreshed = await campaignRef.get();
  return {
    campaign: publicCampaignSummary(campaignId, refreshed.data() ?? {}),
    retried: failedSnapshot.size,
    recovered,
    stillFailed,
  };
});
