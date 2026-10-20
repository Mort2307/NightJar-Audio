import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue, FieldPath, type QueryDocumentSnapshot, type DocumentReference } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { getAuth } from 'firebase-admin/auth';
import { getMessaging } from 'firebase-admin/messaging';
import { createHash, randomUUID } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
import { HttpsError, onCall, onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { exchangeGoogleAuthorizationCode, getGoogleTokenInfo, getGoogleUserInfo, refreshGoogleAccessToken, revokeGoogleToken, sendGmailApiMessage } from './gmail-api';
import { DIDIT_API_KEY, DIDIT_WORKFLOW_ID, DIDIT_ENVIRONMENT, diditConfigured, diditMode, diditPass, startDiditSession, verifiedAdultFromDecision } from './didit';
import { hasPaidEntitlement } from './entitlements';
import { buildVerifiedCreditCallables } from './verified-credits';
import { buildNightjarQualityCallables } from './nightjar-quality';
export { diditWebhook, processDiditWebhook } from './didit';
export {notifyPublishedAudio,notifyPublishedScript,notifyPublishedArtwork,notifyNewFollower} from './publication-notifications';
export { beginPasskeyRegistration, finishPasskeyRegistration, beginPasskeySignIn, finishPasskeySignIn, listMyPasskeys, removeMyPasskey } from './passkeys';
export {
  getAdminAttentionPreferences, saveAdminAttentionPreferences,
  adminAttentionProfessionalApplications, adminAttentionReleases, adminAttentionScripts,
  adminAttentionImages, adminAttentionReviews, adminAttentionEditorPortfolio,
  adminAttentionReports, adminAttentionSecurity, adminAttentionSuggestions, adminAttentionBilling,
} from './admin-attention';

initializeApp();

const db = getFirestore();
const REGION = 'europe-west2';
// Emergency reversible stop: no new Didit sessions until live-session creation is repaired.
const DIDIT_VERIFICATION_PAUSED = false; // Public self-service Didit age verification enabled; existing approved accounts remain verified.
const DIDIT_LIVE_PILOT_ADMINS_ONLY = false; // All authenticated, unverified members may begin the standard mandatory age check.
const TESTING_AGE_ASSURANCE_BYPASS = false; // Mandatory verified-18+ rollout: private tester bypass no longer grants adult access.
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
    version: '2026-10-15.2',
    title: 'Nightjar Terms of Use',
    path: '/legal/terms',
    requiredForAccount: true,
    requiredForProfessional: true,
  },
  privacy_notice: {
    id: 'privacy_notice',
    version: '2026-10-15.1',
    title: 'Nightjar Privacy Notice',
    path: '/legal/privacy',
    requiredForAccount: true,
    requiredForProfessional: true,
  },
  age_assurance_notice: {
    id: 'age_assurance_notice',
    version: '2026-10-14.3',
    title: 'Nightjar Age Verification & Didit Privacy Notice',
    path: '/legal/age-verification',
    requiredForAccount: false,
    requiredForProfessional: false,
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
    // Preserve each explicit decision: the current-version mirror is overwritten
    // when terms change and is not sufficient to evidence earlier acceptances.
    batch.create(accountRef(identity.uid).collection('legalAcceptanceHistory').doc(), {
      documentId:id,
      title:document.title,
      version:document.version,
      accepted:true,
      acceptedAt:FieldValue.serverTimestamp(),
      acceptedByUserId:identity.uid,
      acceptedByEmail:identity.email,
      source,
    });
    accepted.push({ id, version:document.version });
  }

  // Update an account mirror as part of the legal acceptance transaction,
  // so active-account middleware can enforce versions with no extra reads.
  const acceptedFields: Record<string, unknown> = {};
  if (accepted.some((entry) => entry.id === 'platform_terms')) {
    acceptedFields.acceptedPlatformTermsVersion = CURRENT_LEGAL_DOCUMENTS.platform_terms.version;
  }
  if (accepted.some((entry) => entry.id === 'privacy_notice')) {
    acceptedFields.acknowledgedPrivacyNoticeVersion = CURRENT_LEGAL_DOCUMENTS.privacy_notice.version;
  }
  if (Object.keys(acceptedFields).length) {
    batch.set(accountRef(identity.uid), {
      ...acceptedFields, legalUpdatedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
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
  const account = snapshot.data() ?? {};
  await requireClosedBetaAccess(identity.email, account);
  if (account.status === 'suspended') {
    throw new HttpsError('permission-denied', 'This Nightjar account is suspended.');
  }
  if (account.acceptedPlatformTermsVersion !== CURRENT_LEGAL_DOCUMENTS.platform_terms.version ||
      account.acknowledgedPrivacyNoticeVersion !== CURRENT_LEGAL_DOCUMENTS.privacy_notice.version) {
    throw new HttpsError('failed-precondition', 'Review Nightjar\'s current Terms of Use and Privacy Notice before continuing.', {
      code: 'mandatory_agreement_required',
    });
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
    suspensionReason: status === 'suspended' ? cleanText(current.suspensionReason, 500) : null,
    suspensionCaseId: status === 'suspended' ? cleanText(current.suspensionCaseId, 80) : null,
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
      legalBatch.create(accountRef(identity.uid).collection('legalAcceptanceHistory').doc(), {
        documentId:id,
        title:document.title,
        version:document.version,
        accepted:true,
        acceptedAt:FieldValue.serverTimestamp(),
        acceptedByUserId:identity.uid,
        acceptedByEmail:identity.email,
        source:'registration',
      });
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

// Cross-device WORKING drafts are not public profiles. They are always stored
// under the authenticated account, rather than device storage, and use
// optimistic revision checks to avoid silently overwriting another device.
const PROFILE_DRAFT_SHARED_FIELDS = new Set([
  'displayName','handle','pronouns','headline','headerImageMode','bio','welcomeMessage',
  'favouriteTags','favouriteTropes','favouriteCategories','publicProfile',
  'avatarInitials','avatarTone',
]);
const PROFILE_DRAFT_ROLE_FIELDS = new Set([
  'roleFocus','roleSpecialties','roleSecondary','roleAvailability','roleHeadline',
  'roleBio','roleDetailOne','roleDetailTwo','portfolioNote','featuredPortfolioIds',
  'creatorLanguages','creatorDirectionModes','creatorDeliveryFormats','creatorTurnaround','creatorEquipment',
  'writerScriptLengths','writerCollaborationPreferences','writerTurnaround','writerRightsNote',
  'editorSoftware','editorProjectTypes','editorDeliveryFormats','editorCollaborationPreferences',
  'editorTurnaround','editorExperienceYears','editorSkillLevels',
  'artistMediums','artistDeliveryFormats','artistTurnaround','artistSoftware','listenerCommunityStyle',
]);
// Studio metadata drafts are private account-owned working copies, not submissions.
// Never retain selected File blobs or legal attestations across devices.
const STUDIO_DRAFT_FIELDS:Record<string,Set<string>>={
  'form-editor-showcase':new Set(['title','description','services','techniques','permissionNote']),
  'form-artist-portfolio':new Set(['title','description','tags','commissionType']),
};
const profileDraftScope = (raw:unknown) => {
  const scope=cleanText(raw,40);
  if(scope==='onboarding'||/^profile-(listener|creator|writer|editor|artist|admin)$/.test(scope)||Object.prototype.hasOwnProperty.call(STUDIO_DRAFT_FIELDS,scope))return scope;
  throw new HttpsError('invalid-argument','Unknown Nightjar profile draft.');
};
const scopedProfileDraftRef=(uid:string,scope:string)=>profileRef(uid).collection('workingDrafts').doc(scope);
const assertProfileDraftAccess=async(uid:string,scope:string)=>{
  const role=scope.startsWith('profile-')?scope.slice(8):scope==='form-editor-showcase'?'editor':scope==='form-artist-portfolio'?'artist':'listener';
  if(role==='listener'||scope==='onboarding')return;
  const account=await accountRef(uid).get();
  if(role==='admin'){
    if(account.data()?.role!=='admin')throw new HttpsError('permission-denied','Administrator profile required.');
    return;
  }
  if(!professionalRolesForAccount(account.data()??{}).includes(role as AccountRole)){
    throw new HttpsError('permission-denied','An approved professional role is required for this draft.');
  }
};
const profileDraftData=(raw:unknown,scope:string)=>{
  if(!raw || typeof raw!=='object' || Array.isArray(raw))throw new HttpsError('invalid-argument','A profile draft object is required.');
  const result:Record<string,unknown>={};
  const validFields=STUDIO_DRAFT_FIELDS[scope]??(scope==='onboarding'?PROFILE_DRAFT_SHARED_FIELDS:new Set([...PROFILE_DRAFT_SHARED_FIELDS,...PROFILE_DRAFT_ROLE_FIELDS]));
  for(const [key,value] of Object.entries(raw as Record<string,unknown>)){
    if(key==='stepIndex'&&scope==='onboarding'){
      result.stepIndex=Math.max(0,Math.min(2,Math.floor(Number(value)||0)));
      continue;
    }
    if(!validFields.has(key))continue;
    if(value===null||typeof value==='boolean'||typeof value==='string'||typeof value==='number'){
      if(typeof value==='string' && value.length>(scope.startsWith('form-')?1500:3000))throw new HttpsError('invalid-argument','Working draft field is too long.');
      result[key]=value;
    }else if(Array.isArray(value)){
      if(value.length>40 || value.some(item=>typeof item!=='string'||item.length>180))throw new HttpsError('invalid-argument','Profile draft selection is too large.');
      result[key]=value;
    }else if(key==='editorSkillLevels'&&value&&typeof value==='object'&&!Array.isArray(value)){
      const levels=Object.entries(value as Record<string,unknown>);
      if(levels.length>40||levels.some(([k,v])=>k.length>180||typeof v!=='string'||v.length>80))
        throw new HttpsError('invalid-argument','Profile draft skills are too large.');
      result[key]=Object.fromEntries(levels);
    }
  }
  if(JSON.stringify(result).length>32000)throw new HttpsError('invalid-argument','Profile draft is too large.');
  return result;
};
const profileDraftSnapshot=(data:Record<string,any>|undefined)=>{
  if(!data)return {revision:0,payload:null,updatedAt:null};
  return {
    revision:Math.max(0,Number(data.revision??0)),
    payload:data.payload??null,
    updatedAt:data.updatedAt?.toDate?.()?.toISOString?.()??null,
  };
};
export const getMyProfileWorkingDraft=onCall({region:REGION},async(request)=>{
  const identity=await requireActiveIdentity(request);
  const scope=profileDraftScope((request.data as Record<string,unknown>|undefined)?.scope);
  if(scope.startsWith('form-'))await requireAgeVerified(identity.uid);
  await assertProfileDraftAccess(identity.uid,scope);
  const snap=await scopedProfileDraftRef(identity.uid,scope).get();
  return {scope,...profileDraftSnapshot(snap.data())};
});
export const saveMyProfileWorkingDraft=onCall({region:REGION},async(request)=>{
  const identity=await requireActiveIdentity(request);
  const input=(request.data??{}) as Record<string,unknown>;
  const scope=profileDraftScope(input.scope);
  if(scope.startsWith('form-'))await requireAgeVerified(identity.uid);
  await assertProfileDraftAccess(identity.uid,scope);
  const expectedRevision=Number(input.expectedRevision);
  if(!Number.isSafeInteger(expectedRevision)||expectedRevision<0)
    throw new HttpsError('invalid-argument','Invalid profile draft version.');
  const payload=profileDraftData(input.payload,scope);
  const ref=scopedProfileDraftRef(identity.uid,scope);
  return db.runTransaction(async(tx)=>{
    const snap=await tx.get(ref);
    const existing=snap.data();
    const current=profileDraftSnapshot(existing);
    if(current.revision!==expectedRevision){
      return {saved:false,scope,...current};
    }
    const revision=expectedRevision+1;
    tx.set(ref,{payload,revision,updatedAt:FieldValue.serverTimestamp(),ownerUserId:identity.uid});
    return {saved:true,scope,revision,payload,updatedAt:null};
  });
});
export const clearMyProfileWorkingDraft=onCall({region:REGION},async(request)=>{
  const identity=await requireActiveIdentity(request);
  const input=(request.data??{}) as Record<string,unknown>;
  const scope=profileDraftScope(input.scope);
  if(scope.startsWith('form-'))await requireAgeVerified(identity.uid);
  await assertProfileDraftAccess(identity.uid,scope);
  const expectedRevision=Number(input.expectedRevision);
  if(!Number.isSafeInteger(expectedRevision)||expectedRevision<0)
    throw new HttpsError('invalid-argument','Invalid profile draft version.');
  const ref=scopedProfileDraftRef(identity.uid,scope);
  return db.runTransaction(async(tx)=>{
    const snap=await tx.get(ref);
    const current=profileDraftSnapshot(snap.data());
    if(current.revision!==expectedRevision)return {cleared:false,revision:current.revision};
    if(snap.exists)tx.delete(ref);
    return {cleared:true,revision:0};
  });
});

export const getMyProfile = onCall({ region: REGION }, async (request) => {
  const identity = await requireActiveIdentity(request);
  const [snapshot, accountSnapshot] = await Promise.all([
    profileRef(identity.uid).get(),
    accountRef(identity.uid).get(),
  ]);
  if (!snapshot.exists) return { profile:null };
  const data = snapshot.data() ?? {};
  const {avatarRemovalPending,bannerRemovalPending,...safeProfileData}=data;
  const activeRole = identity.admin ? 'admin' : cleanText(accountSnapshot.data()?.role, 30) || 'listener';
  return {
    profile: {
      ...safeProfileData,
      avatarCleanupPending:Array.isArray(avatarRemovalPending) && avatarRemovalPending.length>0,
      bannerCleanupPending:Array.isArray(bannerRemovalPending) && bannerRemovalPending.length>0,
      ...roleProfileSlice(data, activeRole),
      activeRole,
      roles: identity.admin ? ['admin'] : ['listener', ...professionalRolesForAccount(accountSnapshot.data() ?? {})],
    },
  };
});

// "Finish later" is a durable account choice, not a session-only dismiss.
// Keep the incomplete profile editable; never grant a professional role here.
export const deferMyProfileOnboarding = onCall({ region: REGION }, async (request) => {
  const identity = await requireActiveIdentity(request);
  await requireAgeVerified(identity.uid);
  const ref = profileRef(identity.uid);
  await db.runTransaction(async (tx) => {
    const existing = await tx.get(ref);
    if (existing.data()?.onboardingComplete === true) return;
    tx.set(ref, {
      onboardingDeferred: true,
      onboardingDeferredAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });
  return { deferred: true };
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

// Nightjar's handshake is an evidence-backed portfolio statistic. Earlier
// public releases count even if the collaboration proposal feature did not yet
// exist. Never infer participants from names alone: require linked account IDs.
// A proposal and a published release by the same pair are reconciled instead
// of counted twice. Private proposal titles and terms are never disclosed.
type CollaborationEvidenceDoc = { id: string; data: () => Record<string, any> };
const verifiedCollaborationEvidence = (
  released: CollaborationEvidenceDoc[],
  proposals: CollaborationEvidenceDoc[],
) => {
  type PublishedWork = {
    releaseId: string; title: string; releaseDate: string | null;
    contributors: Array<{ userId: string; name: string; role: string }>;
  };
  const releasesByUser = new Map<string, PublishedWork[]>();
  const publishedPairCount = new Map<string, number>();
  const pairKey = (left: string, right: string) => [left, right].sort().join('|');
  for (const doc of released) {
    const data = doc.data() ?? {};
    if (data.status !== 'released') continue;
    const team = new Map<string, { userId: string; name: string; role: string }>();
    const ownerId = cleanText(data.creatorUserId, 160);
    if (ownerId) team.set(ownerId, {
      userId: ownerId, name: cleanText(data.creatorName, 100) || 'Nightjar creator', role: 'Voice Actor',
    });
    for (const credit of normaliseReleaseContributors(data.contributors)) {
      if (!credit.userId) continue;
      if (!team.has(credit.userId)) team.set(credit.userId, {
        userId: credit.userId, name: credit.name, role: credit.role,
      });
    }
    if (team.size < 2) continue;
    const members = [...team.values()];
    const item: PublishedWork = {
      releaseId: doc.id,
      title: cleanText(data.title, 160) || 'Untitled release',
      releaseDate: toIso(data.releaseDate) ?? toIso(data.releasedAt) ?? null,
      contributors: members,
    };
    for (const member of members) {
      const list = releasesByUser.get(member.userId) ?? [];
      list.push(item);
      releasesByUser.set(member.userId, list);
    }
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        const key = pairKey(members[i].userId, members[j].userId);
        publishedPairCount.set(key, (publishedPairCount.get(key) ?? 0) + 1);
      }
    }
  }
  const proposalPairs = new Map<string, { left: string; right: string; count: number }>();
  for (const doc of proposals) {
    const data = doc.data() ?? {};
    if (data.status !== 'completed') continue;
    const left = cleanText(data.writerUserId, 160);
    const right = cleanText(data.recipientUserId, 160);
    if (!left || !right || left === right) continue;
    const key = pairKey(left, right);
    const previous = proposalPairs.get(key);
    proposalPairs.set(key, { left, right, count: (previous?.count ?? 0) + 1 });
  }
  const workflowOnlyByUser = new Map<string, number>();
  for (const [key, pair] of proposalPairs) {
    const additional = Math.max(0, pair.count - (publishedPairCount.get(key) ?? 0));
    if (!additional) continue;
    for (const userId of [pair.left, pair.right]) {
      workflowOnlyByUser.set(userId, (workflowOnlyByUser.get(userId) ?? 0) + additional);
    }
  }
  const counts = new Map<string, number>();
  for (const [userId, works] of releasesByUser) counts.set(userId, works.length);
  for (const [userId, count] of workflowOnlyByUser) counts.set(userId, (counts.get(userId) ?? 0) + count);
  return { counts, releasesByUser, workflowOnlyByUser };
};

const completedCollaborationCountFor = async (userId: string) => {
  const [releases, proposals] = await Promise.all([
    db.collection('releases').where('status', '==', 'released').limit(1000).get(),
    db.collection('collaborationProposals').limit(1000).get(),
  ]);
  return verifiedCollaborationEvidence(releases.docs, proposals.docs).counts.get(userId) ?? 0;
};

export const getVerifiedCollaborationHistory = onCall({ region: REGION }, async (request) => {
  const identity = await requireActiveIdentity(request);
  await requireAgeVerified(identity.uid);
  const input = (request.data ?? {}) as { userId?: unknown };
  const requestedUserId = cleanText(input.userId, 160) || identity.uid;
  const [account, profile, releases, proposals] = await Promise.all([
    accountRef(requestedUserId).get(),
    profileRef(requestedUserId).get(),
    db.collection('releases').where('status', '==', 'released').limit(1000).get(),
    db.collection('collaborationProposals').limit(1000).get(),
  ]);
  const a = account.data() ?? {};
  const p = profile.data() ?? {};
  const isOwner = requestedUserId === identity.uid;
  const publiclyAvailable = a.status === 'active'
    && (a.role === 'admin' ? p.adminCommunityVisible === true : p.publicProfile !== false);
  if (!isOwner && !publiclyAvailable) throw new HttpsError('not-found', 'Profile not available.');
  const evidence = verifiedCollaborationEvidence(releases.docs, proposals.docs);
  const published = evidence.releasesByUser.get(requestedUserId) ?? [];
  return {
    userId: requestedUserId,
    count: evidence.counts.get(requestedUserId) ?? 0,
    published: published.sort((a, b) =>
      String(b.releaseDate ?? '').localeCompare(String(a.releaseDate ?? ''))).slice(0, 100),
    workflowOnlyCount: evidence.workflowOnlyByUser.get(requestedUserId) ?? 0,
  };
});

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

// Social profile links are a shared, public-facing part of the member identity.
// Use separate account-owned documents: saving a link must not overwrite profile
// drafts or other professional-role settings.
const socialLinkCollection = (uid: string) => profileRef(uid).collection('socialLinks');
const socialLinkPlatform = (hostname: string) => {
  const host = hostname.toLowerCase().replace(/^(www|m)\./, '');
  const rules: Array<[string, string]> = [
    ['instagram.com','Instagram'], ['tiktok.com','TikTok'], ['youtube.com','YouTube'], ['youtu.be','YouTube'],
    ['x.com','X'], ['twitter.com','X'], ['bsky.app','Bluesky'], ['threads.net','Threads'],
    ['facebook.com','Facebook'],['fb.com','Facebook'], ['twitch.tv','Twitch'],
    ['reddit.com','Reddit'], ['tumblr.com','Tumblr'], ['soundcloud.com','SoundCloud'],
    ['open.spotify.com','Spotify'],['spotify.com','Spotify'], ['patreon.com','Patreon'],
    ['ko-fi.com','Ko-fi'], ['linktr.ee','Linktree'],['beacons.ai','Beacons'],
    ['carrd.co','Carrd'], ['onlyfans.com','OnlyFans'],['fansly.com','Fansly'],
  ];
  return rules.find(([domain]) => host === domain || host.endsWith('.' + domain))?.[1] ?? 'Website';
};

const validatedSocialUrl = (input: unknown) => {
  const raw = cleanText(input, 500);
  if (!raw || raw.length > 500) throw new HttpsError('invalid-argument', 'Paste a social profile link (maximum 500 characters).');
  let url: URL;
  try { url = new URL(raw); } catch { throw new HttpsError('invalid-argument', 'Paste the full social link starting with https://'); }
  if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || url.port) {
    throw new HttpsError('invalid-argument', 'Social links must use secure https:// addresses without credentials or custom ports.');
  }
  const host = url.hostname.toLowerCase();
  if (!host.includes('.') || host === 'localhost' || host.endsWith('.local') ||
      /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)) {
    throw new HttpsError('invalid-argument', 'Use a public social profile address.');
  }
  url.hash = '';
  return {url:url.toString(),platform:socialLinkPlatform(host)};
};


type SocialPhotoRemoval={id:string;path:string};
const safeSocialPhotoPath=(uid:string,id:string,path:string) =>
  ['png','jpg','webp'].some(ext=>path==='pending-images/'+uid+'/'+id+'.'+ext);
const socialPhotoReceipts=(data:Record<string,any>):SocialPhotoRemoval[] =>
  Array.isArray(data.photoRemovalPending)?data.photoRemovalPending.map((item:any)=>({
    id:cleanText(item?.id,160),path:cleanText(item?.path,500),
  })):[];
const socialLinkPayload = (id:string, data:Record<string,any>) => ({
  id,
  url:cleanText(data.url,500),
  platform:cleanText(data.platform,60)||'Website',
  photoUrl:data.photoStatus==='approved' ? cleanText(data.photoUrl,500)||null : null,
  photoStatus:data.pendingPhotoStatus==='pending' ? 'pending' : data.pendingPhotoStatus==='rejected' ? 'rejected' : data.photoStatus==='approved' ? 'approved' : null,
  pendingPhotoAssetId:cleanText(data.pendingPhotoAssetId,160)||null,
  photoCleanupPending:socialPhotoReceipts(data).length>0,
});

// A removed link remains as a non-public tombstone only while private photo
// deletion needs a retry. The receipt is account-private and bounded.
const cleanupOwnedSocialPhotos=async(uid:string,id:string)=>{
  const ref=socialLinkCollection(uid).doc(id);
  const snap=await ref.get();
  const receipts=socialPhotoReceipts(snap.data()??{});
  if(receipts.length>8)throw new HttpsError('failed-precondition','Too many incomplete social image removals.');
  let failed=false;
  for(const receipt of receipts){
    if(!/^[a-zA-Z0-9_-]{1,160}$/.test(receipt.id)||
      !safeSocialPhotoPath(uid,receipt.id,receipt.path)){failed=true;continue;}
    try{
      await getStorage().bucket().file(receipt.path).delete({ignoreNotFound:true});
      const assetRef=db.collection('imageAssets').doc(receipt.id);
      await db.runTransaction(async tx=>{
        const latest=await tx.get(ref);
        const image=await tx.get(assetRef);
        const link=latest.data();
        if(!link)return;
        const existing=socialPhotoReceipts(link);
        if(image.exists && image.data()?.storageRemovalPendingPath===receipt.path)
          tx.set(assetRef,{status:'removed',publicUrl:null,storageRemovalPendingPath:null,
            updatedAt:FieldValue.serverTimestamp()},{merge:true});
        const remaining=existing.filter(item=>item.id!==receipt.id||item.path!==receipt.path);
        if(link.deleted && remaining.length===0 && !link.photoAssetId && !link.pendingPhotoAssetId)
          tx.delete(ref);
        else tx.set(ref,{photoRemovalPending:remaining,updatedAt:FieldValue.serverTimestamp()},{merge:true});
      });
    }catch(error){
      failed=true;
      console.warn('Social image cleanup pending',id,error instanceof Error?error.message:'Unknown Storage error');
    }
  }
  if(!receipts.length && snap.data()?.deleted){
    await db.runTransaction(async tx=>{
      const latest=await tx.get(ref);
      const link=latest.data();
      if(link?.deleted && !link.photoAssetId && !link.pendingPhotoAssetId && !socialPhotoReceipts(link).length)
        tx.delete(ref);
    });
  }
  const latest=await ref.get();
  return failed || socialPhotoReceipts(latest.data()??{}).length>0;
};

// Deleting a social link or changing the linked account first retires both its
// approved/pending images and its public identity in the SAME transaction.
const changeSocialLink=async(uid:string,id:string,mode:'save'|'delete',
    next?:{url:string;platform:string})=>{
  const ref=socialLinkCollection(uid).doc(id);
  await db.runTransaction(async tx=>{
    const existing=await tx.get(ref);
    if(!existing.exists){
      if(mode==='delete')return;
      throw new HttpsError('not-found','Social link no longer exists.');
    }
    const data=existing.data()??{};
    if(data.deleted){
      if(mode==='delete')return;
      throw new HttpsError('failed-precondition','This social link has been deleted.');
    }
    const changed=mode==='delete'||(next && data.url!==next.url);
    if(!changed){
      tx.set(ref,{url:next?.url,platform:next?.platform,updatedAt:FieldValue.serverTimestamp()},{merge:true});
      return;
    }
    const old=socialPhotoReceipts(data);
    if(old.length>8)throw new HttpsError('failed-precondition','Social picture cleanup needs investigation.');
    const ids=[...new Set([data.photoAssetId,data.pendingPhotoAssetId,...old.map(item=>item.id)]
      .map(value=>cleanText(value,160)).filter(Boolean))];
    if(ids.length>8||ids.some(id=>!/^[a-zA-Z0-9_-]{1,160}$/.test(id)))
      throw new HttpsError('failed-precondition','Social image reference needs investigation.');
    const imageRefs=ids.map(assetId=>db.collection('imageAssets').doc(assetId));
    const images=await Promise.all(imageRefs.map(image=>tx.get(image)));
    const pending:SocialPhotoRemoval[]=[];
    for(let i=0;i<ids.length;i++){
      const asset=images[i].data();
      if(asset && (asset.ownerUserId!==uid||asset.kind!=='social_avatar'||asset.targetId!==id))
        throw new HttpsError('failed-precondition','Social image ownership requires investigation.');
      const path=cleanText(old.find(item=>item.id===ids[i])?.path||
        asset?.storageRemovalPendingPath||asset?.storagePath,500);
      if(path && !safeSocialPhotoPath(uid,ids[i],path))
        throw new HttpsError('failed-precondition','Social image Storage path requires investigation.');
      if(path)pending.push({id:ids[i],path});
    }
    tx.set(ref,{
      ...(mode==='delete'?{deleted:true,url:'',platform:'Website'}:{deleted:false,url:next?.url,platform:next?.platform}),
      photoAssetId:null,photoUrl:null,photoStatus:null,
      pendingPhotoAssetId:null,pendingPhotoStatus:null,
      photoRemovalPending:pending,updatedAt:FieldValue.serverTimestamp(),
    },{merge:true});
    for(let i=0;i<ids.length;i++){
      if(images[i].exists){
        const path=pending.find(item=>item.id===ids[i])?.path??null;
        tx.set(imageRefs[i],{status:path?'removing':'removed',publicUrl:null,
          storageRemovalPendingPath:path,updatedAt:FieldValue.serverTimestamp()},{merge:true});
      }
    }
  });
  return cleanupOwnedSocialPhotos(uid,id);
};

export const listMySocialLinks = onCall({region:REGION},async(request)=>{
  const identity=await requireActiveIdentity(request);
  const docs=await socialLinkCollection(identity.uid).limit(100).get();
  if(docs.size===100)throw new HttpsError('resource-exhausted','Social link history needs an administrator review.');
  const active=docs.docs.filter(doc=>!doc.data().deleted);
  return {
    links:active.map(doc=>socialLinkPayload(doc.id,doc.data()))
      .sort((a,b)=>a.platform.localeCompare(b.platform)||a.url.localeCompare(b.url)),
    cleanupLinkIds:docs.docs.filter(doc=>doc.data().deleted&&socialPhotoReceipts(doc.data()).length>0).map(doc=>doc.id),
  };
});

export const saveMySocialLink = onCall({region:REGION},async(request)=>{
  const identity=await requireActiveIdentity(request);
  const input=(request.data??{}) as Record<string,unknown>;
  const result=validatedSocialUrl(input.url);
  const id=cleanText(input.id,120);
  if(id && !/^[a-zA-Z0-9_-]{5,120}$/.test(id))
    throw new HttpsError('invalid-argument','Social link identifier is invalid.');
  const collection=socialLinkCollection(identity.uid);
  const ref=id ? collection.doc(id) : collection.doc();
  if(!id){
    const snapshot=await collection.limit(100).get();
    if(snapshot.size>=100)throw new HttpsError('resource-exhausted','Social link history needs administrator review.');
    if(snapshot.docs.filter(doc=>!doc.data().deleted).length>=12)
      throw new HttpsError('resource-exhausted','You can save up to 12 social links.');
    await ref.create({url:result.url,platform:result.platform,deleted:false,
      createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});
  }else{
    await changeSocialLink(identity.uid,id,'save',result);
  }
  const saved=await ref.get();
  if(!saved.exists||saved.data()?.deleted)
    throw new HttpsError('aborted','Social link changed. Refresh your profile.');
  return {link:socialLinkPayload(ref.id,saved.data()??{})};
});

export const deleteMySocialLink = onCall({region:REGION},async(request)=>{
  const identity=await requireActiveIdentity(request);
  const id=cleanText((request.data as Record<string,unknown>|undefined)?.id,120);
  if(!/^[a-zA-Z0-9_-]{5,120}$/.test(id))
    throw new HttpsError('invalid-argument','Social link identifier is invalid.');
  const pendingCleanup=await changeSocialLink(identity.uid,id,'delete');
  return {deleted:true,pendingCleanup:Boolean(pendingCleanup)};
});

export const retryMySocialPhotoCleanup = onCall({region:REGION},async(request)=>{
  const identity=await requireActiveIdentity(request);
  const id=cleanText((request.data as Record<string,unknown>|undefined)?.id,120);
  if(!/^[a-zA-Z0-9_-]{5,120}$/.test(id))
    throw new HttpsError('invalid-argument','Social link identifier is invalid.');
  return {pendingCleanup:await cleanupOwnedSocialPhotos(identity.uid,id)};
});

// Finishing later must persist across devices and role switches. Store the
// unfinished personal profile privately; it is NOT made public or marked as
// completed until the member deliberately finishes the onboarding flow.
export const pauseProfileOnboarding = onCall({ region: REGION }, async (request) => {
  const identity = await requireActiveIdentity(request);
  if (identity.admin) throw new HttpsError('permission-denied', 'Administrators do not use personal onboarding.');
  const input = (request.data ?? {}) as Record<string, unknown>;
  const provided = input.draft && typeof input.draft === 'object' && !Array.isArray(input.draft)
    ? input.draft as Record<string, unknown>
    : {};
  const stepNumber = Number(input.stepIndex);
  const stepIndex = Number.isFinite(stepNumber) ? Math.max(0, Math.min(2, Math.floor(stepNumber))) : 0;
  const expectedRevision = Number(input.revision ?? 0);
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
    throw new HttpsError('invalid-argument','Profile draft revision is invalid.');
  }
  const draft = {
    displayName:cleanText(provided.displayName,80),
    handle:cleanText(provided.handle,50),
    pronouns:cleanText(provided.pronouns,60),
    headline:cleanText(provided.headline,140),
    bio:cleanText(provided.bio,1200),
    welcomeMessage:cleanText(provided.welcomeMessage,300),
    favouriteTags:cleanStringList(provided.favouriteTags),
    favouriteTropes:cleanStringList(provided.favouriteTropes),
    favouriteCategories:cleanStringList(provided.favouriteCategories),
    publicProfile:provided.publicProfile !== false,
    stepIndex,
  };
  const dismiss = input.dismiss !== false;
  return db.runTransaction(async(transaction)=>{
    const ref=profileRef(identity.uid);
    const prior=await transaction.get(ref);
    const data=prior.data()??{};
    if(data.onboardingComplete===true)return {dismissed:false,completed:true,revision:Number(data.onboardingDraftRevision??0)};
    const currentRevision=Number(data.onboardingDraftRevision??0);
    if(currentRevision!==expectedRevision){
      throw new HttpsError('aborted','A newer version of this profile was saved on another device. Refresh Nightjar to load it before saving.');
    }
    transaction.set(ref,{
      onboardingDismissed:dismiss,
      onboardingDraft:draft,
      onboardingDraftRevision:currentRevision+1,
      onboardingPausedAt:FieldValue.serverTimestamp(),
      // An autosaved draft alone is not permission to publish a profile.
      ...(prior.exists?{}:{
        publicProfile:false,
        onboardingComplete:false,
        createdAt:FieldValue.serverTimestamp(),
      }),
    },{merge:true});
    return {dismissed:dismiss,completed:false,revision:currentRevision+1};
  });
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
  const assignedRole = cleanText(accountData.role, 30) || 'listener';
  // Pending or historic accounts can have a professional primary role before
  // that role is actually approved. They must still be able to edit Listener.
  const fallbackProfileRole = identity.admin || assignedRole === 'listener' || approvedRoles.includes(assignedRole as AccountRole)
    ? assignedRole
    : 'listener';
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
    // Header mode is an explicit member choice; only an approved existing
    // portrait may be used. Never allow arbitrary unmoderated image URLs.
    headerImageMode: ['cinematic','portrait','custom'].includes(String(input.headerImageMode)) ? input.headerImageMode : 'portrait',
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
    // Separate explicit opt-in: historic admin profiles can never become public by accident.
    adminCommunityVisible: identity.admin && input.adminCommunityVisible === true,
    onboardingComplete: input.onboardingComplete === true,
    ...(input.onboardingComplete === true ? { onboardingDeferred: false } : {}),
    onboardingVersion: Math.max(0, Math.floor(Number(input.onboardingVersion ?? 1))),
    updatedAt: FieldValue.serverTimestamp(),
  };

  // The app sends role drafts together, not via one callable per role.
  // Accept only approved role keys and normalise every field using the
  // existing server-side profile sanitizer. Unapproved roles are never stored.
  const suppliedRoleProfiles = input.roleProfiles && typeof input.roleProfiles === 'object' && !Array.isArray(input.roleProfiles)
    ? input.roleProfiles as Record<string, unknown>
    : {};
  const validatedRoleProfiles: Record<string, ReturnType<typeof roleProfileSlice>> = {};
  for (const allowedRole of identity.admin ? [] : ['listener', ...approvedRoles]) {
    const draft = suppliedRoleProfiles[allowedRole];
    if (!draft || typeof draft !== 'object' || Array.isArray(draft)) continue;
    const cleaned = roleProfileSlice({ roleProfiles: { [allowedRole]: draft } }, allowedRole);
    cleaned.featuredPortfolioIds = await validatedPortfolioIdsFor(identity.uid, allowedRole, cleaned.featuredPortfolioIds);
    validatedRoleProfiles[allowedRole] = cleaned;
  }

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

    // Apply the approved, sanitised role drafts to the same atomic write.
    // This preserves the details a member edited before switching tabs.
    Object.assign(roleProfiles, validatedRoleProfiles);

    const onboardingWasComplete = currentProfileData.onboardingComplete === true;
    const onboardingNowComplete = nextProfile.onboardingComplete || onboardingWasComplete;
    transaction.set(targetProfileRef, {
      ...topLevelProfileWrite,
      roleProfiles,
      // A later role/profile edit must never revert an already finished
      // account to onboarding-incomplete and reopen the modal on sign-in.
      onboardingComplete:onboardingNowComplete,
      ...(onboardingNowComplete ? {
        onboardingDismissed:false,
        onboardingDraft:FieldValue.delete(),
      } : {}),
      ...(currentProfile.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
    }, { merge: true });
  });

  // Discovery tag indexing and release-name propagation are secondary tasks.
  // An error there must never tell a member their profile failed after the
  // Firestore transaction has committed successfully.
  if (profileStatus === 'active' && approvedRoles.includes('creator')) {
    try {
      await syncCreatorCustomTagUsage(identity.uid);
    } catch (error) {
      console.error('Profile saved; creator tag indexing failed', { userId: identity.uid, error });
    }
  }

  try {
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
  } catch (error) {
    console.error('Profile saved; release display-name sync failed', { userId: identity.uid, error });
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
  const nightjarTeam = accountData.role === 'admin';
  if (!data || (nightjarTeam ? data.adminCommunityVisible !== true : data.publicProfile === false)) return null;
  const roles = professionalRolesForAccount(accountData);
  const activeRole = cleanText(accountData.role, 30);
  const publicRole = activeRole === 'listener' || roles.includes(activeRole as AccountRole)
    ? activeRole
    : (roles[0] ?? 'listener');
  return {
    userId,
    role: publicRole,
    roles: nightjarTeam ? ['listener'] : ['listener', ...roles],
    nightjarTeam,
    displayName: data.displayName ?? 'Nightjar member',
    name: data.displayName ?? 'Nightjar member',
    handle: data.handle ?? null,
    headline: data.headline ?? null,
    bio: data.bio ?? null,
    welcomeMessage: data.welcomeMessage ?? null,
    pronouns: data.pronouns ?? null,
    avatarUrl: data.avatarStatus === 'approved' ? data.avatarUrl ?? null : null,
      bannerUrl: data.bannerStatus === 'approved' ? data.bannerUrl ?? null : null,
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
  }
  // Only independently approved credit claims contribute to public directory totals.
  const approvedCreditSnapshot = await db.collection('verifiedCreditClaims').where('state', '==', 'approved').limit(1000).get();
  for (const claim of approvedCreditSnapshot.docs) {
    const credit = claim.data();
    const uid = cleanText(credit.claimantUserId, 160);
    if (uid && credit.approvedByAdminUserId && credit.approvedAt) creditCountByUser.set(uid, (creditCountByUser.get(uid) ?? 0) + 1);
  }

  const publishedScriptsByWriter = new Map<string, number>();
  for (const script of scripts.docs) {
    if (!['Approved','Published'].includes(String(script.data().status))) continue;
    const writerUserId = cleanText(script.data().writerUserId, 160);
    if (writerUserId) publishedScriptsByWriter.set(writerUserId, (publishedScriptsByWriter.get(writerUserId) ?? 0) + 1);
  }

  const collaborationCountByUser = verifiedCollaborationEvidence(releases.docs, collaborations.docs).counts;

  const allowedRoles = new Set(['creator','writer','editor','artist','listener']);
  const profiles = (await Promise.all(accounts.docs
    .filter((doc) => doc.data().status === 'active' && (doc.data().role === 'admin' || allowedRoles.has(String(doc.data().role ?? '')) || professionalRolesForAccount(doc.data() ?? {}).length > 0))
    .map(async (doc) => {
      const data = profileByUser.get(doc.id);
      const accountData = doc.data() ?? {};
      const nightjarTeam = accountData.role === 'admin';
      if (!data || (nightjarTeam ? data.adminCommunityVisible !== true : data.publicProfile === false)) return null;
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
        roles: nightjarTeam ? ['listener'] : ['listener', ...professionalRoles],
        approvedProfessionalRoles: nightjarTeam ? [] : professionalRoles,
        nightjarTeam,
        displayName: data.displayName ?? 'Nightjar member',
        name: data.displayName ?? 'Nightjar member',
        handle: data.handle ?? null,
        headline: data.headline ?? null,
        bio: data.bio ?? null,
        welcomeMessage: data.welcomeMessage ?? null,
        pronouns: data.pronouns ?? null,
        avatarUrl: data.avatarStatus === 'approved' ? data.avatarUrl ?? null : null,
      bannerUrl: data.bannerStatus === 'approved' ? data.bannerUrl ?? null : null,
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
  const nightjarTeam = accountData?.role === 'admin';
  if (
    !account.exists
    || !data
    || accountData?.status !== 'active'
    || (nightjarTeam ? data.adminCommunityVisible !== true : data.publicProfile === false)
  ) {
    throw new HttpsError('not-found', 'Public Nightjar profile not found.');
  }

  // Public credit attribution is derived exclusively from independent admin approvals.
  // Never treat contributor.userId in uploader-supplied release metadata as verification.
  const verifiedCreditDocs = await db.collection('verifiedCreditClaims')
    .where('claimantUserId', '==', userId).where('state','==','approved')
    .orderBy('approvedAt','desc').limit(100).get();
  const verifiedCredits = verifiedCreditDocs.docs
    .filter(doc => {
      const credit = doc.data();
      return credit.state === 'approved' && Boolean(credit.approvedByAdminUserId && credit.approvedAt);
    })
    .map(doc => ({ id:doc.id, releaseId:doc.data().releaseId, releaseRole:doc.data().releaseRole }));
  const professionalRoles = professionalRolesForAccount(accountData ?? {});
  const activePublicRole = cleanText(accountData?.role, 30);
  const role = activePublicRole === 'listener' || professionalRoles.includes(activePublicRole as AccountRole)
    ? activePublicRole
    : (professionalRoles[0] ?? 'listener');
  const linksSnapshot = await socialLinkCollection(userId).limit(100).get();
  const publicSocialLinks = linksSnapshot.docs.filter(doc=>!doc.data().deleted).slice(0,12).map((doc)=>{
    const link=socialLinkPayload(doc.id,doc.data());
    return {id:link.id,url:link.url,platform:link.platform,photoUrl:link.photoUrl};
  });
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

  // Public credited releases must have a verified claim, not merely an uploader
  // supplied userId. This also makes listener credits visible without role promotion.
  if (verifiedCredits.length) {
    const approvedReleaseIds = [...new Set(verifiedCredits.map(credit => String(credit.releaseId)))].slice(0,100);
    const creditedDocs = await Promise.all(approvedReleaseIds.map(id => releaseRef(id).get()));
    creditedReleases = creditedDocs
      .filter(doc => doc.exists && doc.data()?.status === 'released')
      .map(doc => decorateReleaseAccess(doc.data() ?? {}, doc.id, identity.uid, { admin:identity.admin, subscription:viewerSubscription }))
      .sort((a,b) => String(b.releaseDate ?? '').localeCompare(String(a.releaseDate ?? '')));
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
    writer: creditedReleases.filter(release => verifiedCredits.some(credit =>
      credit.releaseId === release.id && releaseCreditMatchesProfileRole(credit.releaseRole, 'writer'))),
    editor: creditedReleases.filter(release => verifiedCredits.some(credit =>
      credit.releaseId === release.id && releaseCreditMatchesProfileRole(credit.releaseRole, 'editor'))),
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
      roles: nightjarTeam ? ['listener'] : ['listener', ...professionalRoles],
      nightjarTeam,
      displayName: data.displayName ?? 'Nightjar member',
      name: data.displayName ?? 'Nightjar member',
      handle: data.handle ?? null,
      headline: data.headline ?? null,
      headerImageMode: ['cinematic','portrait','custom'].includes(String(data.headerImageMode)) ? data.headerImageMode : 'portrait',
      // Professional approval originates from account privileges, never
      // release credits or self-authored profile fields. Applies to ALL tabs.
      approvedProfessionalRoles: professionalRoles,
      verifiedCredits,
      bio: data.bio ?? null,
      welcomeMessage: data.welcomeMessage ?? null,
      socialLinks: publicSocialLinks,
      pronouns: data.pronouns ?? null,
      avatarUrl: data.avatarStatus === 'approved' ? data.avatarUrl ?? null : null,
      bannerUrl: data.bannerStatus === 'approved' ? data.bannerUrl ?? null : null,
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
      bannerUrl: data.bannerStatus === 'approved' ? data.bannerUrl ?? null : null,
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
  const [accounts, releases, proposals] = await Promise.all([
    db.collection('accounts').limit(1000).get(),
    db.collection('releases').where('status', '==', 'released').limit(1000).get(),
    db.collection('collaborationProposals').limit(1000).get(),
  ]);
  const completedByWriter = verifiedCollaborationEvidence(releases.docs, proposals.docs).counts;
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
        return { ...base, ...roleProfileSlice(writerData, 'writer'), role:'writer', publishedWorkCount, completedCollaborations: completedByWriter.get(doc.id) ?? 0 };
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

// On-demand social discovery only. Never return email addresses, hidden members,
// inactive accounts or follow documents. Limit fan-out and reads per tap.
export const listPublicProfileConnections = onCall({ region: REGION }, async (request) => {
  const identity = await requireActiveIdentity(request);
  await requireAgeVerified(identity.uid);
  const input = (request.data ?? {}) as { userId?: unknown; kind?: unknown };
  const userId = cleanText(input.userId, 160);
  const kind = String(input.kind ?? '');
  if (!userId || !['followers','following'].includes(kind)) {
    throw new HttpsError('invalid-argument', 'Choose a Nightjar profile and Followers or Following.');
  }
  const [subjectAccount, subjectProfile] = await Promise.all([
    accountRef(userId).get(),
    profileRef(userId).get(),
  ]);
  const subjectData = subjectAccount.data() ?? {};
  const subjectPublic = subjectData.role === 'admin'
    ? subjectProfile.data()?.adminCommunityVisible === true
    : subjectProfile.data()?.publicProfile !== false;
  if (!subjectAccount.exists || subjectData.status !== 'active' || !subjectProfile.exists || (!subjectPublic && userId !== identity.uid)) {
    throw new HttpsError('not-found', 'This Nightjar profile is not publicly available.');
  }

  const limit = 40;
  // The reverse lookup has an explicit collection-group index in firestore.indexes.json.
  // Do not scan accounts: one user tap must never read the whole audience.
  const edges = kind === 'followers'
    ? await db.collectionGroup('follows').where('targetUserId', '==', userId).limit(limit).get()
    : await accountRef(userId).collection('follows').limit(limit).get();
  const ids = Array.from(new Set(edges.docs.map((doc) =>
    kind === 'followers' ? doc.ref.parent.parent?.id ?? '' : doc.id,
  ).filter(Boolean))).filter((id) => id !== userId);

  const people = (await Promise.all(ids.map(async (id) => {
    const [account, memberProfile] = await Promise.all([accountRef(id).get(), profileRef(id).get()]);
    const member = account.data() ?? {};
    const publicData = memberProfile.data() ?? {};
    if (!account.exists || member.status !== 'active' || !memberProfile.exists) return null;
    if (member.role === 'admin' ? publicData.adminCommunityVisible !== true : publicData.publicProfile === false) return null;
    const roles = professionalRolesForAccount(member);
    const activeRole = cleanText(member.role, 30);
    const role = member.role === 'admin' ? 'listener' :
      (['listener','creator','writer','editor','artist'].includes(activeRole) ? activeRole : (roles[0] ?? 'listener'));
    return {
      userId:id,
      name:cleanText(publicData.displayName || 'Nightjar member', 120),
      handle:cleanText(publicData.handle, 60) || null,
      avatarUrl:publicData.avatarStatus === 'approved' ? validPublicUrl(publicData.avatarUrl) : null,
      initials:cleanText(publicData.avatarInitials, 5) || null,
      role,
      official:member.role !== 'admin' && roles.length > 0,
    };
  }))).filter((person): person is NonNullable<typeof person> => person !== null);

  return {
    kind,
    userId,
    people,
    sampled:edges.size,
    hasMore:edges.size === limit,
    // Counts remain aggregate metrics; only public identities can appear here.
    publicOnly:true,
  };
});

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
  if (!target.exists || target.data()?.status !== 'active') {
    throw new HttpsError('not-found', 'Public Nightjar profile not found.');
  }
  if (!profile.exists || (target.data()?.role === 'admin'
    ? profile.data()?.adminCommunityVisible !== true
    : profile.data()?.publicProfile === false)) {
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

type ModeratedImageKind = 'profile_avatar' | 'profile_banner' | 'brand_logo' | 'release_artwork' | 'script_artwork' | 'artist_portfolio' | 'social_avatar';

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
  if (!['profile_avatar', 'profile_banner', 'brand_logo', 'release_artwork', 'script_artwork', 'artist_portfolio', 'social_avatar'].includes(kind)) {
    throw new HttpsError('invalid-argument', 'Unsupported image type.');
  }
  if (kind === 'brand_logo' && !identity.admin) {
    throw new HttpsError('permission-denied', 'Administrator access required for Nightjar branding.');
  }

  const targetId = kind === 'profile_avatar' || kind === 'profile_banner'
    ? identity.uid
    : cleanText(input.targetId, 160);

  if ((kind === 'release_artwork' || kind === 'script_artwork' || kind === 'artist_portfolio') && !targetId) {
    throw new HttpsError('invalid-argument', kind === 'artist_portfolio' ? 'Artist portfolio artwork requires a portfolio item ID.' : 'Release artwork requires a release ID.');
  }

  if (kind === 'social_avatar') {
    if(!targetId)throw new HttpsError('invalid-argument','Save the social link before adding its profile photo.');
    const item=await socialLinkCollection(identity.uid).doc(targetId).get();
    if(!item.exists||item.data()?.deleted)throw new HttpsError('not-found','Social profile link not found.');
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

  if (kind === 'script_artwork') {
    const script = await db.collection('scripts').doc(targetId).get();
    if (!script.exists) throw new HttpsError('not-found', 'Manuscript not found.');
    if (!identity.admin) {
      const account = await accountRef(identity.uid).get();
      if (!professionalRolesForAccount(account.data() ?? {}).includes('writer') || account.data()?.status !== 'active') {
        throw new HttpsError('permission-denied', 'Approved Writer access is required for manuscript artwork.');
      }
      if (script.data()?.writerUserId !== identity.uid) {
        throw new HttpsError('permission-denied', 'Only the manuscript author may change its artwork.');
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
  } else if (kind === 'profile_banner') {
    const profile = await profileRef(identity.uid).get();
    const oldId = cleanText(profile.data()?.pendingBannerAssetId, 160);
    if (oldId && oldId !== assetId) {
      const old = await db.collection('imageAssets').doc(oldId).get();
      if (old.exists && old.data()?.ownerUserId === identity.uid &&
          old.data()?.kind === 'profile_banner' && old.data()?.status === 'pending') {
        await clearAssetFile(old.data() ?? {});
        await old.ref.set({ status:'removed', publicUrl:null, updatedAt:FieldValue.serverTimestamp() }, { merge:true });
      }
    }
    await profileRef(identity.uid).set({
      pendingBannerAssetId:assetId, pendingBannerStatus:'pending',
      updatedAt:FieldValue.serverTimestamp(),
    }, { merge:true });
  } else if (kind === 'social_avatar') {
    const ref=socialLinkCollection(identity.uid).doc(targetId);
    try {
      await db.runTransaction(async tx=>{
        const existing=await tx.get(ref);
        const link=existing.data();
        if(!link||link.deleted)throw new HttpsError('not-found','Social profile link was removed.');
        const prior=cleanText(link.pendingPhotoAssetId,160);
        const oldRef=prior&&prior!==assetId?db.collection('imageAssets').doc(prior):null;
        const old=oldRef?await tx.get(oldRef):null;
        const oldData=old?.data();
        const receipts=socialPhotoReceipts(link);
        if(receipts.length>8)throw new HttpsError('failed-precondition','Social photo cleanup needs investigation.');
        if(oldData && (oldData.ownerUserId!==identity.uid||oldData.kind!=='social_avatar'||oldData.targetId!==targetId))
          throw new HttpsError('failed-precondition','Existing social photo ownership needs investigation.');
        const oldPath=oldData&&oldData.status==='pending'?
          cleanText(oldData.storageRemovalPendingPath||oldData.storagePath,500):'';
        if(oldPath&&!safeSocialPhotoPath(identity.uid,prior,oldPath))
          throw new HttpsError('failed-precondition','Existing social photo path requires investigation.');
        const next=[...receipts.filter(item=>item.id!==prior),
          ...(oldPath?[{id:prior,path:oldPath}]:[])];
        if(next.length>8)throw new HttpsError('failed-precondition','Too many incomplete social picture removals.');
        tx.set(ref,{pendingPhotoAssetId:assetId,pendingPhotoStatus:'pending',
          photoRemovalPending:next,updatedAt:FieldValue.serverTimestamp()},{merge:true});
        if(oldRef&&oldData&&oldData.status==='pending')
          tx.set(oldRef,{status:oldPath?'removing':'removed',publicUrl:null,
            storageRemovalPendingPath:oldPath||null,updatedAt:FieldValue.serverTimestamp()},{merge:true});
      });
    } catch(error) {
      // Uploaded but not linked: retire this new asset before deleting its
      // Storage object. A failed cleanup remains private and auditable.
      await db.collection('imageAssets').doc(assetId).set({
        status:'removing',publicUrl:null,storageRemovalPendingPath:storagePath,
        updatedAt:FieldValue.serverTimestamp(),
      },{merge:true});
      try {
        await getStorage().bucket().file(storagePath).delete({ignoreNotFound:true});
        await db.collection('imageAssets').doc(assetId).set({
          status:'removed',storageRemovalPendingPath:null,
          updatedAt:FieldValue.serverTimestamp(),
        },{merge:true});
      } catch(cleanupError) {
        console.warn('Unattached social photo cleanup pending',assetId,cleanupError instanceof Error?cleanupError.message:'Unknown Storage error');
      }
      throw error;
    }
    // Old pending photo cleanup is best-effort after successful attachment;
    // a cleanup outage must NEVER delete this newly attached upload.
    try { await cleanupOwnedSocialPhotos(identity.uid,targetId); }
    catch(error){console.warn('Prior social photo cleanup needs retry',targetId,error instanceof Error?error.message:'Unknown cleanup error');}
  } else if (kind === 'brand_logo') {
    const brandingRef=db.collection('settings').doc('branding');
    try{
      await db.runTransaction(async tx=>{
        const current=await tx.get(brandingRef);
        const data=current.data()??{};
        const prior=cleanText(data.pendingLogoAssetId,160);
        const oldRef=prior&&prior!==assetId?db.collection('imageAssets').doc(prior):null;
        const old=oldRef?await tx.get(oldRef):null;
        const image=old?.data();
        const receipts=brandLogoReceipts(data);
        if(receipts.length>8)throw new HttpsError('failed-precondition','Old logo cleanup requires investigation.');
        if(image && image.kind!=='brand_logo')
          throw new HttpsError('failed-precondition','Previous branding image is invalid.');
        const oldEntry:BrandLogoRemoval={
          id:prior,owner:cleanText(image?.ownerUserId,160),
          path:cleanText(image?.storageRemovalPendingPath||image?.storagePath,500),
        };
        const replacing=Boolean(image && image.status==='pending');
        if(replacing && oldEntry.path&&!safeBrandLogoPath(oldEntry))
          throw new HttpsError('failed-precondition','Previous logo path requires investigation.');
        const pending=[...receipts.filter(item=>!(replacing&&oldEntry.path&&item.id===prior)),
          ...(replacing&&oldEntry.path?[oldEntry]:[])];
        if(pending.length>8)throw new HttpsError('failed-precondition','Too many incomplete branding image removals.');
        tx.set(brandingRef,{pendingLogoAssetId:assetId,pendingLogoStatus:'pending',
          brandLogoRemovalPending:pending,updatedAt:FieldValue.serverTimestamp()},{merge:true});
        if(oldRef&&replacing)
          tx.set(oldRef,{status:oldEntry.path?'removing':'removed',publicUrl:null,
            storageRemovalPendingPath:oldEntry.path||null,updatedAt:FieldValue.serverTimestamp()},{merge:true});
      });
    }catch(error){
      // Staged upload was never linked: retire metadata before deleting bytes.
      await db.collection('imageAssets').doc(assetId).set({
        status:'removing',publicUrl:null,storageRemovalPendingPath:storagePath,
        updatedAt:FieldValue.serverTimestamp(),
      },{merge:true});
      try{
        await getStorage().bucket().file(storagePath).delete({ignoreNotFound:true});
        await db.collection('imageAssets').doc(assetId).set({
          status:'removed',storageRemovalPendingPath:null,updatedAt:FieldValue.serverTimestamp(),
        },{merge:true});
      }catch(cleanupError){
        console.warn('Unattached brand image cleanup pending',assetId,cleanupError instanceof Error?cleanupError.message:'Unknown Storage error');
      }
      throw error;
    }
    try{await cleanupRetiredBrandLogos();}
    catch(error){console.warn('Prior pending brand logo cleanup needs retry',error instanceof Error?error.message:'Unknown Storage error');}
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

  if (kind === 'script_artwork') {
    const scriptRefForArtwork = db.collection('scripts').doc(targetId);
    const script = await scriptRefForArtwork.get();
    if (!script.exists) {
      await clearAssetFile(record);
      await db.collection('imageAssets').doc(assetId).set({status:'removed',updatedAt:FieldValue.serverTimestamp()},{merge:true});
      throw new HttpsError('not-found', 'Manuscript no longer exists.');
    }
    const previousPendingId = cleanText(script.data()?.pendingArtworkAssetId, 160);
    if (previousPendingId && previousPendingId !== assetId) {
      const previousPending = await db.collection('imageAssets').doc(previousPendingId).get();
      if (previousPending.exists && previousPending.data()?.status === 'pending') {
        await clearAssetFile(previousPending.data() ?? {});
        await previousPending.ref.set({status:'removed',updatedAt:FieldValue.serverTimestamp()},{merge:true});
      }
    }
    await scriptRefForArtwork.set({
      pendingArtworkAssetId: assetId,
      pendingArtworkStatus: 'pending',
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge:true});
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

export const brandInstallManifest = onRequest({region:REGION},async(_r,res)=>{
  try {
    const snap=await db.collection('settings').doc('branding').get();
    const branding=snap.data()??{};
    const ready=branding.logoStatus==='approved'
      && Boolean(branding.icon192Path && branding.icon512Path && branding.maskable512Path);
    const version=ready ? encodeURIComponent(String(branding.iconVersion??'1')) : 'legacy';
    const icons=ready
      ? [
          {src:'/app-icons/nightjar-192.png?v='+version,sizes:'192x192',type:'image/png',purpose:'any'},
          {src:'/app-icons/nightjar-512.png?v='+version,sizes:'512x512',type:'image/png',purpose:'any'},
          {src:'/app-icons/nightjar-maskable-512.png?v='+version,sizes:'512x512',type:'image/png',purpose:'maskable'},
        ]
      : [
          {src:'/nightjar-home-192.png',sizes:'192x192',type:'image/png',purpose:'any'},
          {src:'/nightjar-home-512.png',sizes:'512x512',type:'image/png',purpose:'any'},
        ];
    res.setHeader('Content-Type','application/manifest+json; charset=utf-8');
    res.setHeader('Cache-Control','no-store,max-age=0,must-revalidate');
    res.setHeader('X-Content-Type-Options','nosniff');
    res.status(200).json({
      id:'/',name:'Nightjar',short_name:'Nightjar',
      description:'Premium immersive audio for adults.',
      start_url:'/',scope:'/',display:'standalone',
      background_color:'#0c0b0d',theme_color:'#0c0b0d',
      lang:'en-GB',prefer_related_applications:false,icons,
    });
  } catch {
    res.status(503).send('Install manifest temporarily unavailable.');
  }
});


const safeBrandIconPath = (path:string) =>
  /^brand-icons\/[a-zA-Z0-9_-]{1,160}\/[a-zA-Z0-9_-]+-(192|512|maskable-512)\.png$/.test(path);

// A failed deletion leaves a bounded receipt in Firestore; it never rolls back
// the newly committed live icon pointers or deletes an active image.
const cleanupRetiredBrandIcons = async () => {
  const ref=db.collection('settings').doc('branding');
  const snapshot=await ref.get();
  const initial=snapshot.data()??{};
  const paths=Array.isArray(initial.brandIconRemovalPending)?initial.brandIconRemovalPending:[] as string[];
  if(paths.length>12)return true;
  let pending=false;
  for(const value of paths){
    const path=cleanText(value,500);
    if(!safeBrandIconPath(path)){pending=true;continue;}
    try{
      const current=(await ref.get()).data()??{};
      if([current.icon192Path,current.icon512Path,current.maskable512Path].includes(path)){pending=true;continue;}
      await getStorage().bucket().file(path).delete({ignoreNotFound:true});
      await db.runTransaction(async tx=>{
        const latest=await tx.get(ref);
        const data=latest.data()??{};
        if([data.icon192Path,data.icon512Path,data.maskable512Path].includes(path))
          throw new HttpsError('aborted','Brand icon was reattached; do not clear its receipt.');
        const remaining=Array.isArray(data.brandIconRemovalPending)?data.brandIconRemovalPending.filter((item:unknown)=>item!==path):[];
        tx.set(ref,{brandIconRemovalPending:remaining,updatedAt:FieldValue.serverTimestamp()},{merge:true});
      });
    }catch(error){
      pending=true;
      console.warn('Nightjar retired brand icon cleanup pending',error instanceof Error?error.message:'Unknown Storage error');
    }
  }
  const latest=(await ref.get()).data()??{};
  return pending || (Array.isArray(latest.brandIconRemovalPending)&&latest.brandIconRemovalPending.length>0);
};

export const syncBrandIconVariants = onCall({region:REGION},async(request)=>{
  const admin=requireAdminIdentity(request);
  const input=(request.data??{}) as Record<string,unknown>;
  const icon192=decodeExactBrandPng(input.icon192DataUrl,192,'192px app icon');
  const icon512=decodeExactBrandPng(input.icon512DataUrl,512,'512px app icon');
  const maskable512=decodeExactBrandPng(input.maskable512DataUrl,512,'512px maskable app icon');
  const ref=db.collection('settings').doc('branding');
  const snap=await ref.get();
  const branding=snap.data()??{};
  if(branding.logoStatus!=='approved'||!validPublicUrl(branding.logoUrl))
    throw new HttpsError('failed-precondition','Approve the Nightjar logo before generating install icons.');
  const source=cleanText(branding.logoAssetId,160)||'approved-logo';
  const version=Date.now();
  // Unique filenames mean a concurrent attempt never overwrites or resurrects
  // a previously retired set, even when two requests share one millisecond.
  const revision=String(version)+'-'+randomUUID();
  const icon192Path='brand-icons/'+source+'/'+revision+'-192.png';
  const icon512Path='brand-icons/'+source+'/'+revision+'-512.png';
  const maskable512Path='brand-icons/'+source+'/'+revision+'-maskable-512.png';
  const staging=[icon192Path,icon512Path,maskable512Path];
  const bucket=getStorage().bucket();
  const uploads=await Promise.allSettled([
    bucket.file(icon192Path).save(icon192,{resumable:false,contentType:'image/png',metadata:{cacheControl:'no-store,max-age=0'}}),
    bucket.file(icon512Path).save(icon512,{resumable:false,contentType:'image/png',metadata:{cacheControl:'no-store,max-age=0'}}),
    bucket.file(maskable512Path).save(maskable512,{resumable:false,contentType:'image/png',metadata:{cacheControl:'no-store,max-age=0'}}),
  ]);
  if(uploads.some(result=>result.status==='rejected')){
    await Promise.allSettled(staging.map(path=>bucket.file(path).delete({ignoreNotFound:true})));
    throw new HttpsError('unavailable','Nightjar could not stage all three icons; existing icons are unchanged.');
  }
  try{
    await db.runTransaction(async tx=>{
      const current=await tx.get(ref);
      const data=current.data()??{};
      if(data.logoStatus!=='approved'||!validPublicUrl(data.logoUrl)||
        data.logoAssetId!==branding.logoAssetId||
        ['icon192Path','icon512Path','maskable512Path','iconVersion'].some(field=>data[field]!==branding[field]))
        throw new HttpsError('aborted','Branding changed during generation. Refresh and try again.');
      const earlier=Array.isArray(data.brandIconRemovalPending)?data.brandIconRemovalPending:[];
      const old=[data.icon192Path,data.icon512Path,data.maskable512Path]
        .map(value=>cleanText(value,500)).filter(Boolean);
      const retired=[...new Set([...earlier,...old])];
      if(retired.length>12||retired.some(path=>!safeBrandIconPath(String(path))))
        throw new HttpsError('failed-precondition','Existing brand icon cleanup requires administrator investigation.');
      tx.set(ref,{
        icon192Path,icon512Path,maskable512Path,iconVersion:version,
        iconSourceAssetId:source,brandIconRemovalPending:retired,
        iconsGeneratedBy:admin.uid,iconsGeneratedAt:FieldValue.serverTimestamp(),
        updatedAt:FieldValue.serverTimestamp(),
      },{merge:true});
    });
  }catch(error){
    // New bytes were never made live: only our unique staging paths are safe
    // to remove after a failed transaction.
    await Promise.allSettled(staging.map(path=>bucket.file(path).delete({ignoreNotFound:true})));
    throw error;
  }
  const pendingCleanup=await cleanupRetiredBrandIcons();
  return {updated:true,version,pendingCleanup};
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

export const moderateImageAsset = onCall({region:REGION},async request=>{
  const admin=requireAdminIdentity(request);
  const input=(request.data??{}) as Record<string,unknown>;
  const assetId=cleanText(input.assetId,160);
  const decision=cleanText(input.decision,20);
  const note=cleanText(input.note,600);
  if(!/^[a-zA-Z0-9_-]{1,160}$/.test(assetId) || !['approved','rejected'].includes(decision))
    throw new HttpsError('invalid-argument','Choose a pending image and valid decision.');
  if(decision==='approved' && input.safetyConfirmed!==true)
    throw new HttpsError('failed-precondition','Administrator image-safety review is required.');
  const ref=db.collection('imageAssets').doc(assetId);
  const url=publicImageUrl(assetId);
  // Admin decision, pending pointer and any previous approved-image retirement
  // must share a single transaction. Member removal and a second Admin cannot
  // approve an asset that has been retired while the review page was open.
  const result=await db.runTransaction(async transaction=>{
    const imageSnapshot=await transaction.get(ref);
    const asset=imageSnapshot.data();
    if(!asset || asset.status!=='pending')
      throw new HttpsError('failed-precondition','Image was reviewed, removed or replaced. Refresh the queue.');
    const owner=cleanText(asset.ownerUserId,160);
    const kind=cleanText(asset.kind,40);
    const target=cleanText(asset.targetId,160);
    const targetRef=kind==='profile_avatar'||kind==='profile_banner'?profileRef(owner)
      :kind==='brand_logo'?db.collection('settings').doc('branding')
      :kind==='social_avatar'&&target?socialLinkCollection(owner).doc(target)
      :kind==='artist_portfolio'&&target?db.collection('artistPortfolio').doc(target)
      :kind==='release_artwork'&&target?db.collection('releases').doc(target)
      :kind==='script_artwork'&&target?db.collection('scripts').doc(target):null;
    if(!targetRef)throw new HttpsError('failed-precondition','Image target cannot be verified.');
    const targetSnapshot=await transaction.get(targetRef);
    const parent=targetSnapshot.data()??{};
    const pendingField=kind==='profile_avatar'?'pendingAvatarAssetId'
      :kind==='profile_banner'?'pendingBannerAssetId'
      :kind==='brand_logo'?'pendingLogoAssetId'
      :kind==='social_avatar'?'pendingPhotoAssetId'
      :kind==='artist_portfolio'?'pendingImageAssetId':'pendingArtworkAssetId';
    const current=targetSnapshot.exists && parent[pendingField]===assetId
      && !['removed','removing'].includes(String(parent.status??''));
    if(decision==='approved' && !current)
      throw new HttpsError('failed-precondition','Image is no longer the active pending submission. Refresh before reviewing.');
    if(kind==='artist_portfolio' && current && parent.ownerUserId!==owner)
      throw new HttpsError('permission-denied','Artist portfolio owner mismatch.');
    // A verified Nightjar Admin may submit a replacement for another member.
    // Parent-pending ID identity is authoritative; it was set only through
    // submitImageAsset after role/ownership checks, including the Admin route.
    const oldField=kind==='profile_avatar'?'avatarAssetId'
      :kind==='profile_banner'?'bannerAssetId'
      :kind==='brand_logo'?'logoAssetId'
      :kind==='social_avatar'?'photoAssetId'
      :kind==='artist_portfolio'?'imageAssetId':'artworkAssetId';
    const oldId=decision==='approved'?cleanText(parent[oldField],160):'';
    const oldRef=oldId && oldId!==assetId && /^[a-zA-Z0-9_-]{1,160}$/.test(oldId)
      ? db.collection('imageAssets').doc(oldId):null;
    const oldSnapshot=oldRef?await transaction.get(oldRef):null;
    const old=oldSnapshot?.data();
    const sourcePath=cleanText(asset.storagePath,500);
    const sourceSafe=!sourcePath||['png','jpg','webp'].some(ext=>sourcePath==='pending-images/'+owner+'/'+assetId+'.'+ext);
    if(!sourceSafe)throw new HttpsError('failed-precondition','Image source requires a safety investigation.');
    const moderation={
      status:decision==='approved'?'approved':'rejected',publicUrl:decision==='approved'?url:null,
      moderationNote:note||null,reviewedBy:admin.uid,reviewedAt:FieldValue.serverTimestamp(),
      moderationPolicy:'no-explicit-imagery-v1',safetyConfirmed:decision==='approved',
      ...(decision==='rejected'?{storageRemovalPendingPath:sourcePath||null}:{}),
      updatedAt:FieldValue.serverTimestamp(),
    };
    const parentUpdate:Record<string,unknown>={updatedAt:FieldValue.serverTimestamp()};
    if(current){
      if(decision==='approved'){
        if(kind==='profile_avatar')Object.assign(parentUpdate,{avatarAssetId:assetId,avatarUrl:url,avatarStatus:'approved',pendingAvatarAssetId:null,pendingAvatarStatus:null});
        if(kind==='profile_banner')Object.assign(parentUpdate,{bannerAssetId:assetId,bannerUrl:url,bannerStatus:'approved',pendingBannerAssetId:null,pendingBannerStatus:null});
        if(kind==='brand_logo'){
          const retiredIcons=[...new Set([
            parent.icon192Path,parent.icon512Path,parent.maskable512Path,
            ...(Array.isArray(parent.brandIconRemovalPending)?parent.brandIconRemovalPending:[]),
          ].map(value=>cleanText(value,500)).filter(Boolean))];
          if(retiredIcons.length>12||retiredIcons.some(path=>!safeBrandIconPath(path)))
            throw new HttpsError('failed-precondition','Existing brand icon paths require review.');
          const logoReceipts=brandLogoReceipts(parent);
          const oldLogo=old&&old.ownerUserId&&old.kind==='brand_logo'&&oldId
            ?{id:oldId,owner:cleanText(old.ownerUserId,160),path:cleanText(old.storageRemovalPendingPath||old.storagePath,500)}
            :null;
          if(oldLogo?.path&&!safeBrandLogoPath(oldLogo))
            throw new HttpsError('failed-precondition','Existing logo image requires security review.');
          const retiredLogos=[...logoReceipts.filter(item=>!(oldLogo?.path&&item.id===oldId)),
            ...(oldLogo?.path?[oldLogo]:[])];
          if(retiredLogos.length>8)throw new HttpsError('failed-precondition','Old branding cleanup needs review.');
          Object.assign(parentUpdate,{
            logoAssetId:assetId,logoUrl:url,logoStatus:'approved',
            pendingLogoAssetId:null,pendingLogoStatus:null,
            icon192Path:null,icon512Path:null,maskable512Path:null,
            iconVersion:null,iconSourceAssetId:null,
            brandIconRemovalPending:retiredIcons,brandLogoRemovalPending:retiredLogos,
          });
        }
        if(kind==='social_avatar')Object.assign(parentUpdate,{photoAssetId:assetId,photoUrl:url,photoStatus:'approved',pendingPhotoAssetId:null,pendingPhotoStatus:null});
        if(kind==='artist_portfolio')Object.assign(parentUpdate,{imageAssetId:assetId,imageUrl:url,imageStatus:'approved',pendingImageAssetId:null,pendingImageStatus:null,status:'published',publishedAt:FieldValue.serverTimestamp()});
        if(kind==='release_artwork'||kind==='script_artwork')Object.assign(parentUpdate,{artworkAssetId:assetId,artworkUrl:url,artworkStatus:'approved',pendingArtworkAssetId:null,pendingArtworkStatus:null});
      }else{
        if(kind==='profile_avatar')Object.assign(parentUpdate,{pendingAvatarAssetId:null,pendingAvatarStatus:'rejected'});
        if(kind==='profile_banner')Object.assign(parentUpdate,{pendingBannerAssetId:null,pendingBannerStatus:'rejected'});
        if(kind==='brand_logo')Object.assign(parentUpdate,{pendingLogoAssetId:null,pendingLogoStatus:'rejected'});
        if(kind==='social_avatar')Object.assign(parentUpdate,{pendingPhotoAssetId:null,pendingPhotoStatus:'rejected'});
        if(kind==='artist_portfolio')Object.assign(parentUpdate,{pendingImageAssetId:null,pendingImageStatus:'rejected',status:'draft'});
        if(kind==='release_artwork'||kind==='script_artwork')Object.assign(parentUpdate,{pendingArtworkAssetId:null,pendingArtworkStatus:'rejected'});
      }
    }
    // All Firestore reads above, all writes below. A concurrent member
    // unlink invalidates the review transaction rather than being overwritten.
    transaction.set(ref,moderation,{merge:true});
    if(current)transaction.set(targetRef,parentUpdate,{merge:true});
    const cleanup:Array<{id:string;path:string;finalStatus:'removed'|'rejected'}>=[];
    if(decision==='rejected' && sourcePath)
      cleanup.push({id:assetId,path:sourcePath,finalStatus:'rejected'});
    if(oldRef && old && old.ownerUserId===owner && old.kind===kind){
      const previousPath=cleanText(old.storagePath,500);
      if(!previousPath || ['png','jpg','webp'].some(ext=>previousPath==='pending-images/'+owner+'/'+oldId+'.'+ext)){
        transaction.set(oldRef,{
          status:previousPath?'removing':'removed',publicUrl:null,storageRemovalPendingPath:previousPath||null,
          updatedAt:FieldValue.serverTimestamp(),
        },{merge:true});
        if(previousPath)cleanup.push({id:oldId,path:previousPath,finalStatus:'removed'});
      }
    }
    return {asset:{kind,ownerUserId:owner,targetId:target},cleanup};
  });
  // Deletion follows committed moderation. A Storage/Firestore cleanup error
  // must never undo a decision or pretend privately retained bytes are gone.
  let pendingCleanup=false;
  for(const entry of result.cleanup){
    try{
      await getStorage().bucket().file(entry.path).delete({ignoreNotFound:true});
      const cleanupRef=db.collection('imageAssets').doc(entry.id);
      await db.runTransaction(async transaction=>{
        const snapshot=await transaction.get(cleanupRef);
        if(snapshot.data()?.storageRemovalPendingPath===entry.path)
          transaction.set(cleanupRef,{
            storageRemovalPendingPath:null,status:entry.finalStatus,
            updatedAt:FieldValue.serverTimestamp(),
          },{merge:true});
      });
    }catch(error){
      pendingCleanup=true;
      console.warn('Image moderation media cleanup pending',entry.id,error instanceof Error?error.message:'Unknown Storage error');
    }
  }
  const asset=result.asset;
  if(asset.kind==='brand_logo' && decision==='approved'){
    // Approval has committed: old icon/logo files may now be reclaimed safely.
    // A failed Storage cleanup never undoes the current approved branding.
    await Promise.allSettled([cleanupRetiredBrandLogos(),cleanupRetiredBrandIcons()]);
  }
  if(asset.ownerUserId){
    const artistThankYou=decision==='approved' && asset.kind==='artist_portfolio'
      ?await approvedWorkThankYou(String(asset.ownerUserId),'artwork',null):null;
    await createNotification(String(asset.ownerUserId),{
      type:'image_moderation',subtype:decision,
      title:decision==='approved'
        ?asset.kind==='artist_portfolio'?'Portfolio artwork approved'
          :asset.kind==='script_artwork'?'Manuscript artwork approved'
          :asset.kind==='release_artwork'?'Release artwork approved'
          :asset.kind==='profile_avatar'?'Profile picture approved'
          :asset.kind==='profile_banner'?'Profile cover approved'
          :asset.kind==='social_avatar'?'Social profile picture approved':'Nightjar image approved'
        :asset.kind==='artist_portfolio'?'Portfolio artwork not approved'
          :asset.kind==='script_artwork'?'Manuscript artwork not approved'
          :asset.kind==='release_artwork'?'Release artwork not approved'
          :asset.kind==='profile_avatar'?'Profile picture not approved'
          :asset.kind==='profile_banner'?'Profile cover not approved'
          :asset.kind==='social_avatar'?'Social profile picture not approved':'Nightjar image not approved',
      message:artistThankYou??(decision==='rejected'?(note||'The submitted image did not pass review. You may submit a different image.')
        :asset.kind==='release_artwork'?'Your artwork passed Nightjar image moderation and is now available to the release.'
        :asset.kind==='script_artwork'?'Your manuscript artwork is approved and visible wherever your script is listed.'
        :'Your image passed Nightjar moderation and is now approved for use.'),
      approvedWorkThankYou:Boolean(artistThankYou),assetId,
      imageKind:asset.kind,targetId:asset.targetId||null,
      dedupeKey:'image-moderation:'+assetId+':'+decision,
    }).catch(error=>console.warn('Image moderation notification failed',error));
  }
  return {assetId,status:decision,...(decision==='approved'?{publicUrl:url}:{}),pendingCleanup};
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
  const identity=await requireActiveIdentity(request);
  const assetId=cleanText((request.data as {assetId?:unknown}|undefined)?.assetId,160);
  if(!/^[a-zA-Z0-9_-]{1,160}$/.test(assetId))
    throw new HttpsError('invalid-argument','Choose a valid image asset.');
  const ref=db.collection('imageAssets').doc(assetId);
  // The asset and its current parent reference MUST be retired atomically.
  // No Storage deletion is attempted before this transaction succeeds.
  const retirement=await db.runTransaction(async transaction=>{
    const snap=await transaction.get(ref);
    const asset=snap.data();
    if(!asset)throw new HttpsError('not-found','Image record not found.');
    const owner=cleanText(asset.ownerUserId,160);
    const kind=cleanText(asset.kind,40);
    const target=cleanText(asset.targetId,160);
    if(kind==='brand_logo' && !identity.admin)
      throw new HttpsError('permission-denied','Only a Nightjar Administrator can remove branding.');
    const targetRef = kind==='script_artwork' && target ? db.collection('scripts').doc(target)
      : kind==='release_artwork' && target ? db.collection('releases').doc(target)
      : kind==='artist_portfolio' && target ? db.collection('artistPortfolio').doc(target)
      : kind==='social_avatar' && target ? socialLinkCollection(owner).doc(target)
      : kind==='profile_avatar' || kind==='profile_banner' ? profileRef(owner)
      : kind==='brand_logo' ? db.collection('settings').doc('branding') : null;
    const targetSnapshot=targetRef ? await transaction.get(targetRef) : null;
    const linked=targetSnapshot?.data()??{};
    const scriptAuthor=kind==='script_artwork' && linked.writerUserId===identity.uid
      && [linked.artworkAssetId,linked.pendingArtworkAssetId].includes(assetId);
    if(!identity.admin && owner!==identity.uid && !scriptAuthor)
      throw new HttpsError('permission-denied','You cannot remove this image.');
    // Never delete untrusted or cross-member Storage objects. All user assets
    // are saved by submitImageAsset using this exact owner + assetId prefix.
    const storagePath=cleanText(asset.storageRemovalPendingPath || asset.storagePath,500);
    const allowedPrefix='pending-images/'+owner+'/'+assetId+'.';
    if(storagePath && !['png','jpg','webp'].some(ext=>storagePath===allowedPrefix+ext))
      throw new HttpsError('failed-precondition','Image Storage path requires administrator investigation.');
    if(asset.status==='removed' && !asset.storageRemovalPendingPath)
      return {done:true,path:'',kind};
    const next:Record<string,unknown>={updatedAt:FieldValue.serverTimestamp()};
    if(kind==='profile_avatar'){
      if(linked.avatarAssetId===assetId)Object.assign(next,{avatarAssetId:null,avatarUrl:null,avatarStatus:null});
      if(linked.pendingAvatarAssetId===assetId)Object.assign(next,{pendingAvatarAssetId:null,pendingAvatarStatus:null});
    }else if(kind==='profile_banner'){
      if(linked.bannerAssetId===assetId)Object.assign(next,{bannerAssetId:null,bannerUrl:null,bannerStatus:null});
      if(linked.pendingBannerAssetId===assetId)Object.assign(next,{pendingBannerAssetId:null,pendingBannerStatus:null});
    }else if(kind==='brand_logo'){
      if(linked.logoAssetId===assetId){
        const oldIcons=[linked.icon192Path,linked.icon512Path,linked.maskable512Path,
          ...(Array.isArray(linked.brandIconRemovalPending)?linked.brandIconRemovalPending:[])]
          .map(value=>cleanText(value,500)).filter(Boolean);
        const retiredIcons=[...new Set(oldIcons)];
        if(retiredIcons.length>12||retiredIcons.some(path=>!safeBrandIconPath(path)))
          throw new HttpsError('failed-precondition','Branding icon Storage paths require review.');
        Object.assign(next,{logoAssetId:null,logoUrl:null,logoStatus:null,
          icon192Path:null,icon512Path:null,maskable512Path:null,
          iconVersion:null,iconSourceAssetId:null,brandIconRemovalPending:retiredIcons});
      }
      if(linked.pendingLogoAssetId===assetId)Object.assign(next,{pendingLogoAssetId:null,pendingLogoStatus:null});
    }else if(kind==='social_avatar'){
      if(linked.photoAssetId===assetId)Object.assign(next,{photoAssetId:null,photoUrl:null,photoStatus:null});
      if(linked.pendingPhotoAssetId===assetId)Object.assign(next,{pendingPhotoAssetId:null,pendingPhotoStatus:null});
    }else if(kind==='artist_portfolio'){
      if(linked.imageAssetId===assetId)Object.assign(next,{imageAssetId:null,imageUrl:null,imageStatus:null,status:'draft'});
      if(linked.pendingImageAssetId===assetId)Object.assign(next,{pendingImageAssetId:null,pendingImageStatus:null});
    }else if(kind==='release_artwork'){
      if(linked.artworkAssetId===assetId)Object.assign(next,{artworkAssetId:null,artworkUrl:null,artworkStatus:null});
      if(linked.pendingArtworkAssetId===assetId)Object.assign(next,{pendingArtworkAssetId:null,pendingArtworkStatus:null});
    }else if(kind==='script_artwork'){
      if(linked.artworkAssetId===assetId)Object.assign(next,{artworkAssetId:null,artworkUrl:null,artworkStatus:null});
      if(linked.pendingArtworkAssetId===assetId)Object.assign(next,{pendingArtworkAssetId:null,pendingArtworkStatus:null});
    }
    if(targetRef && targetSnapshot?.exists && Object.keys(next).length>1)
      transaction.set(targetRef,next,{merge:true});
    transaction.set(ref,{
      status:'removing',publicUrl:null,storageRemovalPendingPath:storagePath || null,
      removalStartedAt:asset.removalStartedAt??FieldValue.serverTimestamp(),
      updatedAt:FieldValue.serverTimestamp(),
    },{merge:true});
    return {done:false,path:storagePath,kind};
  });
  if(retirement.done){
    const pendingCleanup=retirement.kind==='brand_logo'?await cleanupRetiredBrandIcons():false;
    return {removed:true,assetId,pendingCleanup};
  }
  if(retirement.path){
    try {await getStorage().bucket().file(retirement.path).delete({ignoreNotFound:true});}
    catch(error){
      console.warn('Private image cleanup pending',assetId,error instanceof Error?error.message:'Unknown Storage error');
      return {removed:false,assetId,pendingCleanup:true};
    }
  }
  try{
    await db.runTransaction(async transaction=>{
      const latest=await transaction.get(ref);
      if(!latest.exists)return;
      const data=latest.data()??{};
      if(data.status==='removed' && !data.storageRemovalPendingPath)return;
      if(data.status!=='removing' || cleanText(data.storageRemovalPendingPath,500)!==retirement.path)
        throw new HttpsError('aborted','Image removal changed. Refresh before retrying.');
      transaction.set(ref,{
        status:'removed',publicUrl:null,storageRemovalPendingPath:null,
        removedAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp(),
      },{merge:true});
    });
    const pendingCleanup=retirement.kind==='brand_logo'?await cleanupRetiredBrandIcons():false;
    return {removed:true,assetId,pendingCleanup};
  }catch(error){
    console.warn('Private image removal record cleanup pending',assetId,error instanceof Error?error.message:'Unknown Firestore error');
    return {removed:false,assetId,pendingCleanup:true};
  }
});
// Profile images are removed through a single account-scoped transaction so
// an Admin approval or upload on a second device cannot reintroduce an image
// after its current pointer was cleared. Bounded receipts survive lost replies.
const removeOwnedProfileVisual = async (userId:string,kind:'profile_avatar'|'profile_banner')=>{
  const ref=profileRef(userId);
  const avatar=kind==='profile_avatar';
  const currentField=avatar?'avatarAssetId':'bannerAssetId';
  const pendingField=avatar?'pendingAvatarAssetId':'pendingBannerAssetId';
  const receiptField=avatar?'avatarRemovalPending':'bannerRemovalPending';
  type Receipt={id:string;path:string};
  const removals=await db.runTransaction(async transaction=>{
    const snapshot=await transaction.get(ref);
    const data=snapshot.data()??{};
    const stored:Receipt[]=Array.isArray(data[receiptField])?data[receiptField].slice(0,8)
      .map((value:any)=>({id:cleanText(value?.id,160),path:cleanText(value?.path,500)})):[];
    if(Array.isArray(data[receiptField])&&data[receiptField].length>8)
      throw new HttpsError('failed-precondition','Too many incomplete image removals require an administrator investigation.');
    const ids=[...new Set([data[currentField],data[pendingField],...stored.map(x=>x.id)]
      .map(value=>cleanText(value,160)).filter(Boolean))];
    if(ids.length>8)throw new HttpsError('failed-precondition','Profile media cleanup limit exceeded.');
    const assetRefs=ids.map(id=>db.collection('imageAssets').doc(id));
    const assetSnaps=await Promise.all(assetRefs.map(item=>transaction.get(item)));
    const files:Receipt[]=[];
    for(let i=0;i<ids.length;i++){
      const item=assetSnaps[i].data();
      const previous=stored.find(x=>x.id===ids[i]);
      if(item && (item.ownerUserId!==userId || item.kind!==kind))
        throw new HttpsError('failed-precondition','Profile image ownership needs a security review.');
      const path=cleanText(previous?.path||item?.storageRemovalPendingPath||item?.storagePath,500);
      if(path && !['png','jpg','webp'].some(ext=>path==='pending-images/'+userId+'/'+ids[i]+'.'+ext))
        throw new HttpsError('failed-precondition','Profile image Storage path requires investigation.');
      if(path)files.push({id:ids[i],path});
    }
    const clear=avatar
      ?{avatarAssetId:null,avatarUrl:null,avatarStatus:null,pendingAvatarAssetId:null,pendingAvatarStatus:null}
      :{bannerAssetId:null,bannerUrl:null,bannerStatus:null,pendingBannerAssetId:null,pendingBannerStatus:null};
    transaction.set(ref,{...clear,[receiptField]:files,updatedAt:FieldValue.serverTimestamp()},{merge:true});
    for(const file of files){
      const child=db.collection('imageAssets').doc(file.id);
      if(assetSnaps[ids.indexOf(file.id)].exists)
        transaction.set(child,{
          status:'removing',publicUrl:null,storageRemovalPendingPath:file.path,
          updatedAt:FieldValue.serverTimestamp(),
        },{merge:true});
    }
    return files;
  });
  let pendingCleanup=false;
  for(const file of removals){
    try{
      await getStorage().bucket().file(file.path).delete({ignoreNotFound:true});
      const assetRef=db.collection('imageAssets').doc(file.id);
      await db.runTransaction(async tx=>{
        const snap=await tx.get(assetRef);
        if(snap.exists && snap.data()?.storageRemovalPendingPath===file.path)
          tx.set(assetRef,{status:'removed',publicUrl:null,storageRemovalPendingPath:null,updatedAt:FieldValue.serverTimestamp()},{merge:true});
      });
    }catch(error){
      pendingCleanup=true;
      console.warn('Private profile media cleanup pending',file.id,error instanceof Error?error.message:'Unknown Storage error');
    }
  }
  if(!pendingCleanup){
    try{
      await db.runTransaction(async tx=>{
        const snap=await tx.get(ref);
        const active:Array<{id:string;path:string}>=Array.isArray(snap.data()?.[receiptField])?snap.data()?.[receiptField]:[];
        if(active.length!==removals.length||active.some((x,i)=>x.id!==removals[i].id||x.path!==removals[i].path))
          throw new HttpsError('aborted','A newer profile cleanup is still pending.');
        tx.set(ref,{[receiptField]:null,updatedAt:FieldValue.serverTimestamp()},{merge:true});
      });
    }catch(error){
      pendingCleanup=true;
      console.warn('Profile image cleanup receipt still pending',userId,error instanceof Error?error.message:'Unknown Firestore error');
    }
  }
  return {removed:true,pendingCleanup};
};

export const removeProfileAvatar = onCall({region:REGION},async request=>{
  const identity=await requireActiveIdentity(request);
  return removeOwnedProfileVisual(identity.uid,'profile_avatar');
});

// Profile covers follow the same exact-record, transaction-first lifecycle.
export const removeProfileBanner = onCall({region:REGION},async request=>{
  const identity=await requireActiveIdentity(request);
  return removeOwnedProfileVisual(identity.uid,'profile_banner');
});


type BrandLogoRemoval={id:string;owner:string;path:string};
const brandLogoReceipts=(data:Record<string,any>):BrandLogoRemoval[] =>
  Array.isArray(data.brandLogoRemovalPending)?data.brandLogoRemovalPending.map((item:any)=>({
    id:cleanText(item?.id,160),owner:cleanText(item?.owner,160),path:cleanText(item?.path,500),
  })):[];
const safeBrandLogoPath=(entry:BrandLogoRemoval) =>
  /^[a-zA-Z0-9_-]{1,160}$/.test(entry.id)&&
  /^[a-zA-Z0-9_-]{1,160}$/.test(entry.owner)&&
  ['png','jpg','webp'].some(ext=>entry.path==='pending-images/'+entry.owner+'/'+entry.id+'.'+ext);

// Durable, private receipts retain the exact files pending deletion after
// logo references have been revoked. Never reclaim an active branding asset.
const cleanupRetiredBrandLogos=async()=>{
  const ref=db.collection('settings').doc('branding');
  const snap=await ref.get();
  const receipts=brandLogoReceipts(snap.data()??{});
  if(receipts.length>8)return true;
  let failed=false;
  for(const receipt of receipts){
    if(!safeBrandLogoPath(receipt)){failed=true;continue;}
    try{
      const current=(await ref.get()).data()??{};
      if([current.logoAssetId,current.pendingLogoAssetId].includes(receipt.id)){failed=true;continue;}
      await getStorage().bucket().file(receipt.path).delete({ignoreNotFound:true});
      const imageRef=db.collection('imageAssets').doc(receipt.id);
      await db.runTransaction(async tx=>{
        const latest=await tx.get(ref);
        const image=await tx.get(imageRef);
        const data=latest.data()??{};
        if([data.logoAssetId,data.pendingLogoAssetId].includes(receipt.id))
          throw new HttpsError('aborted','An active Nightjar logo cannot be deleted.');
        const next=brandLogoReceipts(data).filter(item=>item.id!==receipt.id||item.path!==receipt.path);
        if(image.exists && image.data()?.storageRemovalPendingPath===receipt.path)
          tx.set(imageRef,{status:'removed',publicUrl:null,storageRemovalPendingPath:null,
            updatedAt:FieldValue.serverTimestamp()},{merge:true});
        tx.set(ref,{brandLogoRemovalPending:next,updatedAt:FieldValue.serverTimestamp()},{merge:true});
      });
    }catch(error){
      failed=true;
      console.warn('Nightjar old logo cleanup pending',receipt.id,error instanceof Error?error.message:'Unknown Storage error');
    }
  }
  const latest=(await ref.get()).data()??{};
  return failed || brandLogoReceipts(latest).length>0;
};

export const retryBrandIconCleanup = onCall({region:REGION},async(request)=>{
  requireAdminIdentity(request);
  return {pendingCleanup:await cleanupRetiredBrandIcons()};
});

export const getBranding = onCall({ region: REGION }, async () => {
  const snapshot = await db.collection('settings').doc('branding').get();
  const data = snapshot.data() ?? {};
  return {
    logoUrl: data.logoStatus === 'approved' ? data.logoUrl ?? null : null,
    logoStatus: data.logoStatus ?? null,
    installIconsReady: Boolean(data.icon192Path && data.icon512Path && data.maskable512Path),
    iconVersion: data.iconVersion ?? null,
    iconCleanupPending: Array.isArray(data.brandIconRemovalPending) && data.brandIconRemovalPending.length > 0,
    logoCleanupPending: brandLogoReceipts(data).length > 0,
    pendingLogoAssetId: null,
  };
});

export const removeBrandLogo = onCall({ region: REGION }, async (request) => {
  requireAdminIdentity(request);
  const ref=db.collection('settings').doc('branding');
  await db.runTransaction(async tx=>{
    const snapshot=await tx.get(ref);
    const data=snapshot.data()??{};
    const previous=brandLogoReceipts(data);
    if(previous.length>8)throw new HttpsError('failed-precondition','Too many incomplete logo removals.');
    const ids=[...new Set([data.logoAssetId,data.pendingLogoAssetId,...previous.map(entry=>entry.id)]
      .map(item=>cleanText(item,160)).filter(Boolean))];
    if(ids.length>8||ids.some(id=>!/^[a-zA-Z0-9_-]{1,160}$/.test(id)))
      throw new HttpsError('failed-precondition','Logo references require investigation.');
    const assets=ids.map(id=>db.collection('imageAssets').doc(id));
    const assetSnaps=await Promise.all(assets.map(item=>tx.get(item)));
    const retired:BrandLogoRemoval[]=[];
    for(let i=0;i<ids.length;i++){
      const asset=assetSnaps[i].data();
      if(asset && asset.kind!=='brand_logo')
        throw new HttpsError('failed-precondition','Image is not a Nightjar branding asset.');
      const prior=previous.find(item=>item.id===ids[i]);
      const entry:BrandLogoRemoval={
        id:ids[i],
        owner:cleanText(prior?.owner||asset?.ownerUserId,160),
        path:cleanText(prior?.path||asset?.storageRemovalPendingPath||asset?.storagePath,500),
      };
      if(entry.path&&!safeBrandLogoPath(entry))
        throw new HttpsError('failed-precondition','Logo Storage path requires investigation.');
      if(entry.path)retired.push(entry);
    }
    const oldIcons=[data.icon192Path,data.icon512Path,data.maskable512Path,
      ...(Array.isArray(data.brandIconRemovalPending)?data.brandIconRemovalPending:[])]
      .map(value=>cleanText(value,500)).filter(Boolean);
    const retiredIcons=[...new Set(oldIcons)];
    if(retiredIcons.length>12||retiredIcons.some(path=>!safeBrandIconPath(path)))
      throw new HttpsError('failed-precondition','Brand icon Storage paths require investigation.');
    tx.set(ref,{
      logoAssetId:null,logoUrl:null,logoStatus:null,
      pendingLogoAssetId:null,pendingLogoStatus:null,
      icon192Path:null,icon512Path:null,maskable512Path:null,
      iconVersion:null,iconSourceAssetId:null,
      brandLogoRemovalPending:retired,brandIconRemovalPending:retiredIcons,
      updatedAt:FieldValue.serverTimestamp(),
    },{merge:true});
    for(let i=0;i<ids.length;i++){
      if(assetSnaps[i].exists){
        const path=retired.find(item=>item.id===ids[i])?.path||null;
        tx.set(assets[i],{status:path?'removing':'removed',publicUrl:null,
          storageRemovalPendingPath:path,updatedAt:FieldValue.serverTimestamp()},{merge:true});
      }
    }
  });
  const results=await Promise.allSettled([
    cleanupRetiredBrandLogos(),cleanupRetiredBrandIcons(),
  ]);
  return {removed:true,pendingCleanup:results.some(result=>result.status==='rejected'||result.value)};
});

export const retryBrandLogoCleanup = onCall({region:REGION},async(request)=>{
  requireAdminIdentity(request);
  const results=await Promise.allSettled([
    cleanupRetiredBrandLogos(),cleanupRetiredBrandIcons(),
  ]);
  return {pendingCleanup:results.some(result=>result.status==='rejected'||result.value)};
});

const privateCreateRequestId=(input:Record<string,unknown>):string|null=>{
  if(input.clientRequestId == null || input.clientRequestId === '')return null;
  const value=input.clientRequestId;
  if(typeof value!=='string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)){
    throw new HttpsError('invalid-argument','Private creation request identifier is invalid.');
  }
  return value;
};
const savePrivateRecordOnce=async (
  ref:DocumentReference,
  record:Record<string,unknown>,
  ownerKey:string,
  uid:string,
  requestId:string|null,
  quotaExceeded=false,
) => {
  if(!requestId) {
    if(quotaExceeded)throw new HttpsError('resource-exhausted','Portfolio limit reached.');
    await ref.set(record);
    return false;
  }
  return db.runTransaction(async tx=>{
    const snap=await tx.get(ref);
    if(snap.exists){
      if(snap.data()?.[ownerKey]!==uid)throw new HttpsError('permission-denied','Private draft is owned by another member.');
      return true;
    }
    if(quotaExceeded)throw new HttpsError('resource-exhausted','Portfolio limit reached.');
    tx.set(ref,record);
    return false;
  });
};

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
  const clientRequestId=privateCreateRequestId(input);
  const ref=clientRequestId?db.collection('artistPortfolio').doc(clientRequestId):db.collection('artistPortfolio').doc();
  const quotaExceeded=existing.docs.filter((doc)=>doc.data()?.status!=='removed').length>=24;
  const record={
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
  };
  const reused=await savePrivateRecordOnce(ref,record,'ownerUserId',identity.uid,clientRequestId,quotaExceeded);
  const saved = await ref.get();
  return { item:artistPortfolioPayload(saved.data() ?? {}, ref.id), reused };
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
  const clientRequestId=privateCreateRequestId(input);
  const ref=clientRequestId?db.collection('editorPortfolio').doc(clientRequestId):db.collection('editorPortfolio').doc();
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
  const reused=await savePrivateRecordOnce(ref,record,'ownerUserId',identity.uid,clientRequestId);
  const saved=await ref.get();
  return { item: editorPortfolioPayload(saved.data() ?? record, ref.id), reused };
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
  if (data.status === 'removing') throw new HttpsError('failed-precondition','This showcase is being removed. Its audio cannot be restored.');
  const expectedPrefix = `editor-showcase/${identity.uid}/${itemId}/${slot}/`;
  if (!storagePath.startsWith(expectedPrefix)) throw new HttpsError('permission-denied', 'Editor showcase upload path is invalid.');
  const pathField = slot === 'before' ? 'beforeAudioStoragePath' : 'afterAudioStoragePath';
  const byteField = slot === 'before' ? 'beforeAudioByteSize' : 'afterAudioByteSize';
  const alreadyAttached = data[pathField] === storagePath && Number(data[byteField] ?? 0) > 0;
  if (!alreadyAttached && !['draft','changes','rejected'].includes(String(data.status ?? 'draft'))) {
    throw new HttpsError('failed-precondition', 'This showcase item cannot be edited while moderation is active or after publication.');
  }
  const file = getStorage().bucket().file(storagePath);
  const [exists] = await file.exists();
  if (!exists) throw new HttpsError('not-found', 'Uploaded showcase audio was not found.');
  if (alreadyAttached) return { item: editorPortfolioPayload(data, itemId) };
  const [metadata] = await file.getMetadata();
  const size = Number(metadata.size ?? 0);
  const contentType = String(metadata.contentType ?? '');
  const allowed = ['audio/mpeg','audio/mp3','audio/wav','audio/x-wav','audio/mp4','audio/x-m4a','audio/ogg','audio/webm'];
  if (!allowed.includes(contentType) || !size || size > 20 * 1024 * 1024) {
    await file.delete({ ignoreNotFound:true }).catch(() => undefined);
    throw new HttpsError('invalid-argument', 'Use MP3, WAV, M4A, OGG or WebM showcase audio up to 20 MB.');
  }

  // A concurrent moderation decision or device edit cannot be overridden by
  // a stale finalizer. Re-read owner, slot and status in one transaction.
  await db.runTransaction(async transaction => {
    const fresh = await transaction.get(ref);
    const live = fresh.data();
    if(!live || live.ownerUserId !== identity.uid) throw new HttpsError('not-found','Showcase was not found.');
    if(live.status === 'removing') throw new HttpsError('failed-precondition','Removed showcase audio cannot be restored.');
    if(live[pathField] === storagePath && Number(live[byteField] ?? 0)>0) return;
    if(live[pathField] !== data[pathField]) {
      throw new HttpsError('aborted','This audio slot changed on another device. Refresh before retrying.');
    }
    if(!['draft','changes','rejected'].includes(String(live.status ?? 'draft'))) {
      throw new HttpsError('failed-precondition','This showcase can no longer be edited.');
    }
    transaction.set(ref,{
      [pathField]:storagePath,
      [slot === 'before' ? 'beforeAudioContentType' : 'afterAudioContentType']:contentType,
      [byteField]:size,
      status:['changes','rejected'].includes(String(live.status)) ? 'draft' : live.status ?? 'draft',
      moderationNote:null,
      updatedAt:FieldValue.serverTimestamp(),
    },{merge:true});
  });
  // Keep displaced private bytes until audited cleanup confirms the old
  // path is unreferenced; never delete during an ambiguous finalize.
  const saved = await ref.get();
  return { item: editorPortfolioPayload(saved.data() ?? {}, itemId) };
});

export const submitEditorPortfolioItem = onCall({ region: REGION }, async (request) => {
  const identity = await requireAccountRole(request, ['editor']);
  const itemId = cleanText((request.data as Record<string, unknown> | undefined)?.itemId, 160);
  if (!itemId || !/^[A-Za-z0-9_-]{1,160}$/.test(itemId)) {
    throw new HttpsError('invalid-argument', 'Choose an Editor showcase draft to submit.');
  }
  const ref = db.collection('editorPortfolio').doc(itemId);
  // Submission must consume the exact canonical audio/rights state. A stale
  // browser or concurrent finalizer cannot slip a new attachment between
  // validation and the moderation transition.
  const result = await db.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    const live = snapshot.data();
    if (!live || live.ownerUserId !== identity.uid) {
      throw new HttpsError('not-found', 'Editor showcase draft not found.');
    }
    // When a callable response was lost after Firestore committed, a retry
    // returns the already-submitted item without duplicating the transition.
    if (live.status === 'pending_review') return { reused: true };
    if (!['draft', 'changes', 'rejected'].includes(String(live.status))) {
      throw new HttpsError('failed-precondition', 'This Editor showcase has already been reviewed or cannot be resubmitted.');
    }
    if (!live.afterAudioStoragePath || Number(live.afterAudioByteSize ?? 0) <= 0) {
      throw new HttpsError('failed-precondition', 'Attach a verified finished/after audio sample before submitting.');
    }
    if (live.rightsConfirmed !== true || live.contributorPermissionsConfirmed !== true) {
      throw new HttpsError('failed-precondition', 'Rights and contributor/client permissions must be confirmed.');
    }
    transaction.set(ref, {
      status: 'pending_review',
      submittedAt: FieldValue.serverTimestamp(),
      moderationNote: null,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return { reused: false };
  });
  const saved = await ref.get();
  return { item: editorPortfolioPayload(saved.data() ?? {}, itemId), reused: result.reused };
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
  // Two Administrators may act at once. Only one decision can consume a
  // pending review, so neither the final status nor its reason can race.
  const result=await db.runTransaction(async transaction=>{
    const snapshot=await transaction.get(ref);
    const data=snapshot.data();
    if(!data || data.status!=='pending_review'){
      throw new HttpsError('failed-precondition','Editor showcase has already been reviewed or withdrawn.');
    }
    const status=decision==='approved'?'published':decision==='changes'?'changes':'rejected';
    transaction.set(ref,{
      status,
      moderationNote:note||null,
      moderatedBy:admin.uid,
      moderatedAt:FieldValue.serverTimestamp(),
      publishedAt:decision==='approved'?FieldValue.serverTimestamp():data.publishedAt??null,
      updatedAt:FieldValue.serverTimestamp(),
    },{merge:true});
    return {ownerUserId:String(data.ownerUserId??''),status,workTitle:cleanText(data.title,140)};
  });
  // A failed push/email is not a failed moderation decision. In-app state is
  // canonical, and the stable key prevents a repeated secondary notification.
  if(result.ownerUserId){
    const thankYou = decision === 'approved'
      ? await approvedWorkThankYou(result.ownerUserId, 'editor', result.workTitle) : null;
    await createNotification(result.ownerUserId,{
      type:'content',subtype:'editor_portfolio',
      title:decision==='approved'?'Your Editor showcase is live':decision==='changes'?'Changes requested for your Editor showcase':'Your Editor showcase was not approved',
      message:thankYou ?? (note||'Open Editor Studio to review the moderation result.'),
      approvedWorkThankYou:Boolean(thankYou),
      portfolioItemId:itemId,
      dedupeKey:'editor-portfolio-review:'+itemId+':'+result.status,
    }).catch(error=>console.warn('Editor showcase review notification failed',error));
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
  if(!data || data.status==='removing' || (data.status!=='published' && !identity.admin)) throw new HttpsError('not-found','Published Editor showcase item not found.');
  const path=cleanText(data[slot==='before'?'beforeAudioStoragePath':'afterAudioStoragePath'],600);
  if(!path) throw new HttpsError('not-found','That showcase audio sample is not available.');
  const [url]=await getStorage().bucket().file(path).getSignedUrl({action:'read',expires:Date.now()+10*60*1000});
  return { itemId,slot,url,expiresInSeconds:600 };
});

export const removeEditorPortfolioItem = onCall({ region: REGION }, async (request) => {
  const identity=await requireAccountRole(request,['editor']);
  const itemId=cleanText((request.data as Record<string,unknown>|undefined)?.itemId,160);
  if(!/^[A-Za-z0-9_-]{1,160}$/.test(itemId))throw new HttpsError('invalid-argument','Choose a valid showcase item.');
  const ref=db.collection('editorPortfolio').doc(itemId);
  // Retire the canonical item before touching private Storage. This status
  // makes public discovery, playback, stale finalizers and moderation fail
  // closed while exact object deletion is retried as needed.
  const removal=await db.runTransaction(async transaction=>{
    const snapshot=await transaction.get(ref);
    const data=snapshot.data();
    if(!data)return {missing:true,paths:[] as string[]};
    if(data.ownerUserId!==identity.uid)throw new HttpsError('not-found','Showcase item not found.');
    if(data.status==='pending_review')throw new HttpsError('failed-precondition','Withdraw from moderation before deleting this showcase item.');
    if(data.status!=='removing')transaction.set(ref,{
      status:'removing',removalStartedAt:FieldValue.serverTimestamp(),
      updatedAt:FieldValue.serverTimestamp(),
    },{merge:true});
    const prefix=`editor-showcase/${identity.uid}/${itemId}/`;
    const paths=[data.beforeAudioStoragePath,data.afterAudioStoragePath]
      .map(value=>cleanText(value,600)).filter(path=>Boolean(path)&&path.startsWith(prefix));
    if([data.beforeAudioStoragePath,data.afterAudioStoragePath]
      .some(value=>Boolean(cleanText(value,600))&&!cleanText(value,600).startsWith(prefix)))
      throw new HttpsError('failed-precondition','Showcase audio path requires an administrator security review.');
    return {missing:false,paths:[...new Set(paths)]};
  });
  if(removal.missing)return {removed:true,itemId,pendingCleanup:false};
  // Never swallow a failed deletion then report success. A 'removing' record
  // retains the exact paths for an explicit retry, even after a lost reply.
  for(const path of removal.paths){
    try {await getStorage().bucket().file(path).delete({ignoreNotFound:true});}
    catch(error){
      console.warn('Editor showcase audio cleanup pending',itemId,error instanceof Error?error.message:'Unknown Storage error');
      return {removed:false,itemId,pendingCleanup:true};
    }
  }
  try{
    await db.runTransaction(async transaction=>{
      const latest=await transaction.get(ref);
      if(!latest.exists)return;
      if(latest.data()?.ownerUserId!==identity.uid || latest.data()?.status!=='removing')
        throw new HttpsError('failed-precondition','Showcase removal state changed. Retry only after reviewing its status.');
      transaction.delete(ref);
    });
    return {removed:true,itemId,pendingCleanup:false};
  }catch(error){
    console.warn('Editor showcase record cleanup pending',itemId,error instanceof Error?error.message:'Unknown Firestore error');
    return {removed:false,itemId,pendingCleanup:true};
  }
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

  // Hold the same professional in the spotlight for the full UK day.
  // Without a daily snapshot, approving a new professional midway through
  // the day changes the eligible array length and can silently switch
  // the featured person after their announcement has already gone out.
  const selectionRef = db.collection('spotlightDailySelections').doc(dateKey + '_' + role);
  const stored = await selectionRef.get();
  if (stored.exists) {
    const selectedId = cleanText(stored.data()?.targetId, 160);
    return eligible.find(item => item.targetId === selectedId) ?? null;
  }
  const selected = deterministicDailyPick(eligible, dateKey);
  if (!selected) return null;
  try {
    await selectionRef.create({
      date: dateKey, kind: role, targetId: selected.targetId,
      createdAt: FieldValue.serverTimestamp(),
    });
    return selected;
  } catch (error) {
    const code = (error as {code?: number | string})?.code;
    if (code !== 6 && code !== 'already-exists' && code !== 'ALREADY_EXISTS') throw error;
    const winner = await selectionRef.get();
    return eligible.find(item => item.targetId === cleanText(winner.data()?.targetId, 160)) ?? null;
  }
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

const spotlightNotice = (kind: string) => {
  const roleLabel = kind === 'creator' ? 'VA Creator' : kind === 'writer' ? 'Writer'
    : kind === 'editor' ? 'Audio Editor' : kind === 'artist' ? 'Artist' : 'Listener';
  return {
    title: 'You’re in the Nightjar Spotlight! ✨',
    message: kind === 'listener'
      ? 'Your Nightjar moment is here! We’re celebrating you today. Open Nightjar, enjoy the recognition and let’s make some noise.'
      : 'It’s your ' + roleLabel + ' spotlight day! The stage is yours for 24 hours. Open Nightjar, share your feature and let’s make some noise.',
  };
};

const materializeSpotlightNotification = async (item: any, date: string) => {
  const targetId = cleanText(item?.targetId, 160);
  const kind = cleanText(item?.kind, 40);
  if (!targetId || !['creator','writer','editor','artist','listener'].includes(kind)) return;
  // Privacy: public discovery and promotional push are for public profiles;
  // anonymous/private Listener recognition must not result in promotion.
  if (item.publicProfile === false) return;

  const account = await accountRef(targetId).get();
  const accountData = account.data() ?? {};
  if (!account.exists || accountData.status !== 'active') return;
  const preferences = accountData.notificationPreferences ?? {};
  // Reuse the existing followedProfiles/spotlight preference; do not override
  // a member's previous notification opt-out.
  if (preferences.followedProfiles === false) return;

  const ref = accountRef(targetId).collection('notifications').doc('spotlight_' + date + '_' + kind);
  const { title, message } = spotlightNotice(kind);
  const displayMode = ['full','discreet','minimal'].includes(String(preferences.displayMode ?? ''))
    ? String(preferences.displayMode) : 'discreet';
  const payload = {
    type: 'spotlight',
    subtype: kind,
    spotlightDate: date,
    targetUserId: targetId,
    title,
    message,
    route: '/discover#spotlight-' + kind,
    listenerRank: kind === 'listener' ? item.listenerRank ?? null : null,
  };

  let alreadySeen = false;
  try {
    // Atomic inbox creation survives simultaneous users opening Discover.
    await ref.create({
      ...payload, read: false, createdAt: FieldValue.serverTimestamp(),
    });
  } catch (error) {
    const code = (error as {code?: number | string})?.code;
    if (code !== 6 && code !== 'already-exists' && code !== 'ALREADY_EXISTS') throw error;
    // A member who has already acknowledged the feature should not
    // receive a later surprise push simply because the 9am job ran.
    alreadySeen = (await ref.get()).data()?.read === true;
  }
  if (alreadySeen) return;

  const localHour = Number(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London', hour: '2-digit', hourCycle: 'h23',
  }).format(new Date()));
  // The feature starts at midnight, but phone pushes are daytime only.
  // An early visitor can create the in-app notice; the 09:00 scheduled
  // dispatch will still send its push once the daytime window begins.
  if (localHour < 9 || localHour >= 21) return;

  // Even if one member has two professional roles featured today, send
  // just one celebratory phone push per member/day (inbox retains both roles).
  const dispatchRef = accountRef(targetId).collection('notificationDispatches').doc('spotlight_' + date);
  try {
    await dispatchRef.create({
      kind, date, notificationId: ref.id, createdAt: FieldValue.serverTimestamp(),
    });
  } catch (error) {
    const code = (error as {code?: number | string})?.code;
    if (code === 6 || code === 'already-exists' || code === 'ALREADY_EXISTS') return;
    throw error;
  }

  const mobilePayload = displayMode === 'full'
    ? payload
    : displayMode === 'minimal'
      ? { ...payload, title: 'Nightjar', message: 'Open Nightjar to see your new notification.' }
      : { ...payload, title: 'A Nightjar moment for you', message: 'Something special is waiting inside Nightjar.' };
  try {
    await deliverPushNotification(targetId, mobilePayload, displayMode, ref.id);
  } catch (error) {
    // A failed phone push never removes the one-time inbox notification.
    console.warn('Nightjar Spotlight phone delivery unavailable', {
      kind, date, error: error instanceof Error ? error.message : String(error),
    });
  }
};

const todaySpotlightState = async (date: string) => {
  const [creator, writer, editor, artist, listenerState] = await Promise.all([
    spotlightForRole('creator', date),
    spotlightForRole('writer', date),
    spotlightForRole('editor', date),
    spotlightForRole('artist', date),
    listenerSpotlightForToday(date),
  ]);
  const spotlights = [creator, writer, editor, artist, listenerState.listener].filter(Boolean);
  const notifications = await Promise.allSettled(spotlights.map((item) => materializeSpotlightNotification(item, date)));
  notifications.forEach((result, index) => {
    if (result.status === 'rejected') console.warn('Nightjar Spotlight inbox notice could not be created', {
      kind: (spotlights[index] as { kind?:string }).kind,
      date,
      error: result.reason instanceof Error ? result.reason.message : String(result.reason),
    });
  });
  return {
    date,
    spotlights,
    listenerTopSevenCount: listenerState.listenerTopSevenCount,
    listenerSpotlightDay: listenerState.listenerSpotlightDay,
    listenerWeek: listenerState.listenerWeek,
  };
};

export const spotlightState = onCall({ region: REGION }, async (request) => {
  const identity = await requireActiveIdentity(request);
  await requireAgeVerified(identity.uid);
  return todaySpotlightState(londonDateKey());
});

// A daily UK-morning dispatch does not depend on somebody opening the app.
// The callable above is the same idempotent fallback if scheduling is delayed.
export const notifyDailySpotlights = onSchedule({
  region: REGION, schedule: '0 9 * * *', timeZone: 'Europe/London',
  retryCount: 1,
}, async () => {
  const date = londonDateKey();
  const result = await todaySpotlightState(date);
  console.info('Nightjar daily spotlight dispatch', { date, spotlightCount: result.spotlights.length });
});


// Minute-precision publisher: approval places a release in 'scheduled'. Only
// this server-side job changes it to 'released'; public catalogue requires
// released status, so private content cannot leak before the selected instant.
export const publishScheduledReleases = onSchedule({
  region:REGION,schedule:'every 1 minutes',timeZone:'UTC',retryCount:1,
},async () => {
  const due = await db.collection('releases').where('status','==','scheduled').where('scheduledAt','<=',new Date().toISOString()).orderBy('scheduledAt').limit(250).get();
  const now = Date.now();
  let published = 0;
  for (const doc of due.docs) {
    if (!doc.data().scheduledAt || Date.parse(String(doc.data().scheduledAt)) > now) continue;
    const released = await db.runTransaction(async (tx) => {
      const latest = await tx.get(doc.ref);
      const value = latest.data();
      if (!value || value.status !== 'scheduled' || !value.scheduledAt || Date.parse(String(value.scheduledAt)) > Date.now()) return null;
      tx.update(doc.ref,{status:'released',releaseDate:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});
      return {creatorUserId:String(value.creatorUserId),title:cleanText(value.title,160)};
    }).catch((error)=>{console.warn('Scheduled release publish retry',doc.id,error);return null;});
    if (!released) continue;
    published++;
    await createNotification(released.creatorUserId,{
      type:'content',subtype:'release',title:'Your scheduled recording is live',
      message:'“'+released.title+'” has reached its chosen publication time and is now published.',
      releaseId:doc.id,dedupeKey:'scheduled-live-'+doc.id,oncePerKey:true,
    }).catch((error)=>console.warn('Scheduled release notification failed',error));
  }
  console.info('Nightjar scheduled publication sweep',{considered:due.size,published});
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
      suspensionCaseId: cleanText(account.suspensionCaseId, 80) || null,
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

// Closed-beta Didit cohort: only explicitly selected existing tester accounts can
// start a provider verification. This does NOT revoke their normal beta bypass,
// start a billable session, or confer a verified identity.
export const adminSetDiditPilotAccess = onCall({ region: REGION }, async (request) => {
  const admin = requireAdminIdentity(request);
  const input = (request.data ?? {}) as Record<string, unknown>;
  const email = cleanEmail(input.email);
  const enabled = input.enabled === true;
  if (!validEmailAddress(email) || typeof input.enabled !== 'boolean') {
    throw new HttpsError('invalid-argument', 'Provide one valid beta tester email and an explicit enabled setting.');
  }
  if (ADMIN_EMAILS.has(email)) {
    throw new HttpsError('failed-precondition', 'Administrators already have their own separate Didit pilot.');
  }
  const matching = await db.collection('accounts').where('email', '==', email).limit(3).get();
  if (matching.empty) throw new HttpsError('not-found', 'Ask this tester to register and verify their email first.');
  if (matching.size !== 1) throw new HttpsError('failed-precondition', 'Multiple records matched this email. Resolve the duplicate identity first.');
  const account = matching.docs[0];
  const data = account.data() ?? {};
  if (data.status === 'suspended') {
    throw new HttpsError('failed-precondition', 'Suspended accounts cannot participate in identity verification pilots.');
  }
  if (enabled && (data.emailVerified !== true ||
    !(data.testAccess === true || await testerAccessForEmail(email)))) {
    throw new HttpsError('failed-precondition', 'Only registered, email-verified, allowlisted beta testers can join the Didit pilot.');
  }
  if (data.diditPilotEnabled === enabled) {
    return { email, enabled, unchanged: true };
  }
  await account.ref.set({
    diditPilotEnabled: enabled,
    diditPilotUpdatedBy: admin.uid,
    diditPilotUpdatedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  return { email, enabled, unchanged: false };
});


type MemberSuspensionAction = 'suspend' | 'restore';

// Account lockout is independent of workspace/role changes. Auth is disabled in
// addition to the existing server-side account.status checks. No automatic bans.
const setMemberSuspension = async (userId: string, action: MemberSuspensionAction, reason: string, administratorId: string) => {
  if (!userId || userId.includes('/') || userId === administratorId) {
    throw new HttpsError('invalid-argument', 'Choose a valid non-administrator member.');
  }
  const ref = accountRef(userId);
  const [snapshot, authUser] = await Promise.all([ref.get(), getAuth().getUser(userId)]);
  if (!snapshot.exists) throw new HttpsError('not-found', 'Nightjar member not found.');
  const account = snapshot.data() ?? {};
  if (ADMIN_EMAILS.has(cleanEmail(authUser.email)) || ADMIN_EMAILS.has(cleanEmail(account.email)) || account.role === 'admin') {
    throw new HttpsError('permission-denied', 'Nightjar administrator accounts cannot be suspended here.');
  }

  const previousStatus = cleanText(account.status, 30) || 'active';
  const suspended = action === 'suspend';
  const caseId = suspended
    ? (cleanText(account.suspensionCaseId, 80) || 'NJ-' + randomUUID().slice(0, 8).toUpperCase())
    : cleanText(account.suspensionCaseId, 80);
  if (!suspended && previousStatus !== 'suspended') {
    throw new HttpsError('failed-precondition', 'This account is not suspended.');
  }

  // Deny backend operations immediately, even while an existing Firebase ID
  // token remains valid. A partial Firebase failure remains fail-closed and
  // can be retried safely by the administrator.
  if (suspended) {
    await ref.set({
      status: 'suspended',
      suspendedPriorStatus: previousStatus === 'suspended' ? (account.suspendedPriorStatus || 'active') : previousStatus,
      suspensionReason: reason,
      suspensionCaseId: caseId,
      suspendedBy: administratorId,
      suspendedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  }
  await getAuth().updateUser(userId, { disabled: suspended });
  if (suspended) await getAuth().revokeRefreshTokens(userId);

  const restoredStatus = account.suspendedPriorStatus === 'pending_review' ? 'pending_review' : 'active';
  if (!suspended) {
    await ref.set({
      status: restoredStatus,
      suspensionReason: null,
      suspensionCaseId: null,
      suspendedPriorStatus: null,
      restoredBy: administratorId,
      restoredAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  }
  const revokedReaderSessions = suspended ? await revokeReaderSessions(userId, undefined, 'administrator_suspension') : 0;
  await db.collection('memberSecurityActions').add({
    targetUserId: userId,
    administratorId,
    action,
    reason,
    caseId,
    previousStatus,
    resultingStatus: suspended ? 'suspended' : restoredStatus,
    authDisabled: suspended,
    revokedReaderSessions,
    createdAt: FieldValue.serverTimestamp(),
  });
  return { userId, status: suspended ? 'suspended' : restoredStatus, authDisabled: suspended, caseId, revokedReaderSessions };
};


const deliverMemberSecurityNotice = async (userId: string, action: MemberSuspensionAction, reason: string, caseId: string) => {
  const recordId = action === 'suspend' ? caseId : caseId + '-restored';
  const noticeRef = accountRef(userId).collection('securityNotices').doc(recordId);
  const previous = await noticeRef.get();
  if (previous.data()?.status === 'sent') return 'sent' as const;

  // Persist the intended delivery before attempting mail. A disconnected
  // Gmail integration never prevents immediate protection of the account.
  const authUser = await getAuth().getUser(userId);
  const email = cleanEmail(authUser.email);
  await noticeRef.set({
    type: action, caseId, status: 'pending', emailMasked: maskSecurityEmail(email),
    reason, updatedAt: FieldValue.serverTimestamp(),
    ...(previous.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
  }, { merge: true });
  if (!validEmailAddress(email)) return 'pending' as const;

  const subject = 'Your Nightjar account access has changed';
  const text = action === 'suspend'
    ? 'Your Nightjar account has been suspended after an administrator review.\n\nReason: ' + reason +
      '\n\nReference: ' + caseId + '\n\nYou can dispute this decision or ask for clarification by contacting Nightjar Support. Browser screenshot shortcuts are not conclusive proof of a screenshot or recording.\n\nNightjar Support'
    : 'Your Nightjar account has been restored following an administrator review.\n\nReview note: ' + reason +
      '\n\nReference: ' + caseId + '\n\nYou may now sign in to Nightjar again.\n\nNightjar Support';
  try {
    const accessToken = await gmailAccessToken();
    const sent = await sendGmailApiMessage({
      accessToken, fromEmail: NIGHTJAR_GMAIL_SENDER_EMAIL,
      fromName: 'Nightjar Support', replyTo: NIGHTJAR_GMAIL_SENDER_EMAIL,
      message: { toEmail: email, subject, text,
        html: '<div style="font:15px/1.6 Arial,sans-serif"><h2>Nightjar account update</h2><p>' +
        text.split('\n').map((line) => line.replace(/[&<>"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c] ?? c))).join('<br/>') + '</p></div>',
      },
    });
    await noticeRef.set({ status: 'sent', providerMessageId: sent.id || null, sentAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return 'sent' as const;
  } catch (error) {
    console.warn('Nightjar security notice delivery pending', caseId, String(error));
    await noticeRef.set({ status: 'pending', updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return 'pending' as const;
  }
};

export const adminSetAccountSuspension = onCall({
  region: REGION, secrets: [NIGHTJAR_GMAIL_CLIENT_ID, NIGHTJAR_GMAIL_CLIENT_SECRET],
}, async (request) => {
  const administrator = requireAdminIdentity(request);
  const input = (request.data ?? {}) as Record<string, unknown>;
  const userId = cleanText(input.userId, 160);
  const action = cleanText(input.action, 20);
  const reason = cleanText(input.reason, 500);
  if (action !== 'suspend' && action !== 'restore') throw new HttpsError('invalid-argument', 'Choose suspend or restore.');
  if (reason.length < 12) throw new HttpsError('invalid-argument', 'Provide a specific reviewable reason (at least 12 characters).');
  const result = await setMemberSuspension(userId, action, reason, administrator.uid);
  const notificationDelivery = await deliverMemberSecurityNotice(userId, action, reason, result.caseId);
  return { ...result, notificationDelivery };
});


export const adminRetryMemberSecurityNotice = onCall({
  region: REGION, secrets: [NIGHTJAR_GMAIL_CLIENT_ID, NIGHTJAR_GMAIL_CLIENT_SECRET],
}, async (request) => {
  requireAdminIdentity(request);
  const userId = cleanText((request.data as {userId?:unknown}|undefined)?.userId, 160);
  if (!userId || userId.includes('/')) throw new HttpsError('invalid-argument', 'Choose a valid member.');
  const snapshot = await accountRef(userId).get();
  const account = snapshot.data() ?? {};
  if (account.status !== 'suspended') throw new HttpsError('failed-precondition', 'Only a currently suspended member has a pending suspension notice.');
  const caseId = cleanText(account.suspensionCaseId, 80);
  const reason = cleanText(account.suspensionReason, 500);
  if (!caseId || !reason) throw new HttpsError('failed-precondition', 'No reviewable suspension notice is recorded.');
  const notificationDelivery = await deliverMemberSecurityNotice(userId, 'suspend', reason, caseId);
  return { notificationDelivery, caseId };
});

export const adminMemberSecurityDossier = onCall({ region: REGION }, async (request) => {
  requireAdminIdentity(request);
  const userId = cleanText((request.data as { userId?: unknown } | undefined)?.userId, 160);
  if (!userId || userId.includes('/')) throw new HttpsError('invalid-argument', 'Select a valid member.');
  const [account, profile, events, authUser] = await Promise.all([
    accountRef(userId).get(),
    profileRef(userId).get(),
    db.collection('protectionEvents').where('userId', '==', userId).limit(250).get(),
    getAuth().getUser(userId),
  ]);
  if (!account.exists) throw new HttpsError('not-found', 'Nightjar account not found.');
  const a = account.data() ?? {};
  const p = profile.data() ?? {};
  const noticeId = cleanText(a.suspensionCaseId, 80);
  const noticeSnapshot = noticeId ? await accountRef(userId).collection('securityNotices').doc(noticeId).get() : null;
  const evidence = events.docs.map((doc) => {
    const e = doc.data();
    return {
      id: doc.id, eventType: cleanText(e.eventType, 80),
      relatedType: cleanText(e.relatedType, 80),
      relatedId: cleanText(e.relatedId, 160),
      route: cleanText(e.route, 240), summary: cleanText(e.summary, 800),
      detectionSource: cleanText(e.detectionSource, 120),
      detectionConfidence: cleanText(e.detectionConfidence, 32),
      createdAt: toIso(e.createdAt),
    };
  }).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 50);
  return {
    member: {
      userId, displayName: cleanText(p.displayName, 120) || cleanEmail(authUser.email).split('@')[0],
      handle: cleanText(p.handle, 120) || null,
      email: cleanEmail(authUser.email),
      status: cleanText(a.status, 30) || 'active',
      authDisabled: authUser.disabled === true,
      suspensionReason: cleanText(a.suspensionReason, 500) || null,
      suspensionCaseId: cleanText(a.suspensionCaseId, 80) || null,
      notificationDelivery: cleanText(noticeSnapshot?.data()?.status, 30) || null,
      lastSignIn: authUser.metadata.lastSignInTime ?? null,
    },
    evidence,
    note: 'Capture shortcuts may be incomplete or false-positive signals, not proof of recording. Review context before enforcement.',
  };
});

export const memberAccessStatus = onCall({ region: REGION }, async (request) => {
  const identity = requireVerifiedIdentity(request);
  if (identity.admin) return { status: 'active' };
  const snapshot = await accountRef(identity.uid).get();
  const data = snapshot.data() ?? {};
  return {
    status: cleanText(data.status, 30) || 'active',
    suspensionReason: data.status === 'suspended' ? cleanText(data.suspensionReason, 500) : null,
    suspensionCaseId: data.status === 'suspended' ? cleanText(data.suspensionCaseId, 80) : null,
  };
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
  if (!['active', 'pending_review'].includes(status)) {
    throw new HttpsError('invalid-argument', 'Use the audited suspension control for suspending or restoring a member.');
  }

  const ref = accountRef(userId);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new HttpsError('not-found', 'Nightjar account not found.');
  const accountData = snapshot.data() ?? {};
  if (accountData.status === 'suspended') throw new HttpsError('failed-precondition', 'Use the audited suspension control to restore this member first.');
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

// Workspace selection is not account reinstatement. Never let an Owner's
// role dropdown silently unsuspend or activate a restricted member.
export const adminSetAccountWorkspace = onCall({ region: REGION }, async (request) => {
  const admin = requireAdminIdentity(request);
  const input = (request.data ?? {}) as Record<string, unknown>;
  const userId = cleanText(input.userId, 160);
  const role = cleanText(input.role, 30);
  if (!userId || userId.includes('/') ||
      !['listener', 'creator', 'writer', 'editor', 'artist'].includes(role)) {
    throw new HttpsError('invalid-argument', 'Choose a valid Nightjar member and approved workspace.');
  }
  const ref = accountRef(userId);
  const result = await db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    if (!snapshot.exists) throw new HttpsError('not-found', 'Nightjar member not found.');
    const account = snapshot.data() ?? {};
    if (ADMIN_EMAILS.has(cleanEmail(account.email)) || account.role === 'admin') {
      throw new HttpsError('permission-denied', 'Administrator accounts cannot be reassigned.');
    }
    if (account.status === 'suspended') {
      throw new HttpsError('failed-precondition', 'Resolve the member suspension separately before changing their workspace.');
    }
    const approved = professionalRolesForAccount(account);
    if (role !== 'listener' && !approved.includes(role as AccountRole)) {
      throw new HttpsError('failed-precondition', 'Approve this professional role before making it the active workspace.');
    }
    const status = cleanText(account.status, 30) || 'active';
    if (cleanText(account.role, 30) === role) return { userId, role, status, unchanged: true };
    tx.set(ref, {
      role,
      roleUpdatedBy: admin.uid,
      roleUpdatedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return { userId, role, status, unchanged: false };
  });
  if (!result.unchanged) await syncCreatorCustomTagUsage(userId);
  return result;
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

type ReleaseStatus = 'draft' | 'pending_review' | 'released' | 'scheduled' | 'rejected';

const releaseRef = (releaseId: string) => db.collection('releases').doc(releaseId);

const releaseWorkAccess = (data: Record<string, any>, userId: string) => {
  if (cleanText(data.creatorUserId, 160) === userId) return true;
  return normaliseReleaseContributors(data.contributors).some((credit) => credit.userId === userId);
};

const activeListeningSubscriptionFor = async (userId: string) => {
  const snapshot = await db.collection('subscriptions').where('userId', '==', userId).limit(20).get();
  // Never unlock paid audio from a planning row, unverified trial or a
  // browser redirect. Only the processor-confirmed account-owned active
  // subscription with an unexpired paid period constitutes an entitlement.
  const eligible = snapshot.docs.find((doc) => hasPaidEntitlement(doc.data(), userId));
  return eligible ? { id: eligible.id, status: 'active' as const } : null;
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
  theme: ['nocturne','aubergine','midnight','ember','obsidian','bronze'].includes(String(data.theme)) ? String(data.theme) : 'nocturne',
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
    identity.admin ? readCommercialSettings() : Promise.resolve(null),
    identity.admin ? Promise.resolve(null) : activeListeningSubscriptionFor(identity.uid),
  ]);

  const role = identity.admin ? 'admin' : cleanText(account.data()?.role, 40) || null;
  return {
    role,
    subscribed: identity.admin || Boolean(subscription),
    subscriptionStatus: identity.admin ? 'admin' : subscription?.status ?? null,
    planningMonthlyPricePence: identity.admin ? settings?.planningMonthlyPricePence ?? null : null,
    subscriptionUrl: identity.admin ? settings?.listenerSubscriptionUrl ?? null : null,
    creditedWorkIncluded: true,
    rule: identity.admin ? 'Owner subscription access diagnostics.' : 'Some releases are restricted during testing. Access is checked by Nightjar.',
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

// A creator's verified debut is distinct from a Nightjar-commissioned Original.
// First on Nightjar is a historical release claim, NOT an exclusive licence:
// creators retain the ability to publish their work elsewhere.
const cleanReleaseDistribution = (value: unknown): 'standard' | 'nightjar_first' =>
  value === 'nightjar_first' ? value : 'standard';

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
  releaseDistribution: data.releaseDistributionConfirmed === true ? cleanReleaseDistribution(data.releaseDistribution) : 'standard',
  productionNote: cleanText(data.productionNote, 1800) || null,
  transcriptAvailable: Boolean(cleanReleaseTranscript(data.transcriptText)),
  transcriptLanguage: cleanTranscriptLanguage(data.transcriptLanguage),
  transcriptWordCount: transcriptWordCount(data.transcriptText),
  transcriptAccessibilityReviewed: data.transcriptAccessibilityReviewed === true,
  communityLikeCount: Math.max(0, Number(data.communityLikeCount ?? 0)),
  communityLoveCount: Math.max(0, Number(data.communityLoveCount ?? 0)),
  communityReactionCount: Math.max(0, Number(data.communityReactionCount ?? 0)),
  communityCommentCount: Math.max(0, Number(data.communityCommentCount ?? 0)),
  // Denormalised server-qualified listens. Never count Play-button presses.
  listenCount: Math.max(0, Math.floor(Number(data.listenCount ?? 0))),
  releaseDate: toIso(data.releaseDate),
  scheduledAt: cleanText(data.scheduledAt, 40) || null,
  scheduledTimeZone: cleanText(data.scheduledTimeZone, 100) || null,
  scheduledLocal: cleanText(data.scheduledLocal, 16) || null,
  createdAt: toIso(data.createdAt),
  updatedAt: toIso(data.updatedAt),
});


// Creator-selected publishing time is an exact UTC instant plus the wall-time and
// IANA time zone it was chosen in. No implicit UK time zone or DST adjustment.
const scheduleReleaseInput = (atInput: unknown, zoneInput: unknown, localInput: unknown) => {
  if (atInput == null || atInput === '') return { scheduledAt:null, scheduledTimeZone:null, scheduledLocal:null };
  const at = cleanText(atInput, 40);
  const zone = cleanText(zoneInput, 100);
  const local = cleanText(localInput, 16);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(at) || !Number.isFinite(Date.parse(at))) {
    throw new HttpsError('invalid-argument', 'Choose an exact release date and time.');
  }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) throw new HttpsError('invalid-argument', 'Choose a local date and time.');
  if (!zone) throw new HttpsError('invalid-argument', 'Release time zone is required.');
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-GB', {
      timeZone:zone, hourCycle:'h23', year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',
    }).formatToParts(new Date(at));
  } catch { throw new HttpsError('invalid-argument', 'Unsupported release time zone.'); }
  const field = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  const actual = field('year')+'-'+field('month')+'-'+field('day')+'T'+field('hour')+':'+field('minute');
  if (actual !== local) throw new HttpsError('invalid-argument', 'The selected time is invalid in this time zone (possibly a daylight-saving change).');
  // Autumn clock changes can repeat the same local hour; do not guess which
  // of the two possible instants the creator intended.
  const formatsToLocal = (candidate:number) => {
    const p = new Intl.DateTimeFormat('en-GB',{
      timeZone:zone,hourCycle:'h23',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',
    }).formatToParts(new Date(candidate));
    const part=(kind:string)=>p.find((item)=>item.type===kind)?.value??'';
    return part('year')+'-'+part('month')+'-'+part('day')+'T'+part('hour')+':'+part('minute');
  };
  if ([-90,-60,-30,30,60,90].some((minutes)=>formatsToLocal(Date.parse(at)+minutes*60000)===local)) {
    throw new HttpsError('invalid-argument','That local time occurs twice during a clock change. Choose another time.');
  }
  const offset = Date.parse(at) - Date.now();
  if (offset <= 60000) throw new HttpsError('failed-precondition', 'Choose a release time at least one minute in the future.');
  if (offset > 2 * 365 * 86400000) throw new HttpsError('invalid-argument', 'Schedule up to two years ahead.');
  return { scheduledAt:at, scheduledTimeZone:zone, scheduledLocal:local };
};

const releaseOwnerPayload = (data: Record<string, unknown>, id: string) => ({
  ...releasePayload(data, id),
  releaseDistribution: cleanReleaseDistribution(data.releaseDistribution),
  releaseDistributionConfirmed: data.releaseDistributionConfirmed === true,
  rightsConfirmed: data.rightsConfirmed === true,
  contributorPermissionsConfirmed: data.contributorPermissionsConfirmed === true,
  rightsAttestedAt: toIso(data.rightsAttestedAt),
  transcriptText: cleanReleaseTranscript(data.transcriptText),
  transcriptUpdatedAt: toIso(data.transcriptUpdatedAt),
  metadataRevision: Math.max(0, Math.floor(Number(data.metadataRevision ?? 0))),
  audioCleanupPending: Boolean(data.audioRemovalPendingPath),
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

  const clientRequestId=privateCreateRequestId(input);
  const ref=clientRequestId?db.collection('releases').doc(clientRequestId):db.collection('releases').doc();
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
    contributors: normaliseReleaseContributors(input.contributors, [], true),
    contentRating: cleanReleaseContentRating(input.contentRating),
    seriesTitle: cleanText(input.seriesTitle, 160) || null,
    episodeNumber: cleanEpisodeNumber(input.episodeNumber),
    nightjarOriginal: false,
    releaseDistribution: cleanReleaseDistribution(input.releaseDistribution),
    releaseDistributionConfirmed: cleanReleaseDistribution(input.releaseDistribution) !== 'standard' && input.releaseDistributionConfirmed === true,
    productionNote: cleanText(input.productionNote, 1800) || null,
    rightsConfirmed: input.rightsConfirmed === true,
    contributorPermissionsConfirmed: input.contributorPermissionsConfirmed === true,
    rightsAttestedAt: input.rightsConfirmed === true && input.contributorPermissionsConfirmed === true ? FieldValue.serverTimestamp() : null,
    transcriptText: cleanReleaseTranscript(input.transcriptText),
    transcriptLanguage: cleanTranscriptLanguage(input.transcriptLanguage),
    transcriptAccessibilityReviewed: input.transcriptAccessibilityReviewed === true,
    transcriptUpdatedAt: cleanReleaseTranscript(input.transcriptText) ? FieldValue.serverTimestamp() : null,
    durationMinutes: 0,
    listenCount: 0,
    audioStoragePath: null,
    artworkAssetId: null,
    artworkUrl: null,
    artworkStatus: null,
    pendingArtworkAssetId: null,
    pendingArtworkStatus: null,
    status: 'draft' as ReleaseStatus,
    scheduledAt: null,
    scheduledTimeZone: null,
    scheduledLocal: null,
    moderationNote: null,
    version: 1,
    metadataRevision: 0,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  const reused=await savePrivateRecordOnce(ref,record,'creatorUserId',identity.uid,clientRequestId);
  if(!reused)await syncCreatorCustomTagUsage(identity.uid);
  const saved = await ref.get();
  return { release: releaseOwnerPayload(saved.data() ?? record, ref.id), reused };
});

export const updateRelease = onCall({ region: REGION }, async (request) => {
  const identity = await requireAccountRole(request, ['creator']);
  const input = (request.data ?? {}) as Record<string, unknown>;
  const releaseId = cleanText(input.releaseId, 160);
  if (!releaseId) throw new HttpsError('invalid-argument', 'Release is required.');

  const ref = releaseRef(releaseId);
  let tagsChanged = false;
  const expectedRevision = typeof input.expectedMetadataRevision === 'undefined'
    ? null : Number(input.expectedMetadataRevision);
  if (expectedRevision !== null && (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0)) {
    throw new HttpsError('invalid-argument', 'Expected release metadata revision is invalid.');
  }
  await db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    const current = snapshot.data();
    if (!current || current.creatorUserId !== identity.uid) throw new HttpsError('not-found', 'Release not found.');
    if (['released', 'scheduled', 'removed', 'removing', 'pending_review'].includes(String(current.status))) {
      throw new HttpsError('failed-precondition', 'Submitted or removed releases cannot be edited.');
    }
    const revision = Math.max(0, Math.floor(Number(current.metadataRevision ?? 0)));
    tagsChanged = Array.isArray(input.tags) &&
      JSON.stringify(cleanStringList(input.tags,24)) !== JSON.stringify(cleanStringList(current.tags,24));
    if (expectedRevision !== null && revision !== expectedRevision) {
      throw new HttpsError('aborted', 'Release metadata changed on another device. Review the newer version before saving.', {code:'release_metadata_conflict'});
    }

    const update = {
    title: cleanText(input.title ?? current.title, 160),
    description: cleanText(input.description ?? current.description, 3000),
    category: cleanText(input.category ?? current.category, 80),
    genre: cleanText(input.genre ?? current.genre, 80),
    mood: cleanText(input.mood ?? current.mood, 80),
    tags: Array.isArray(input.tags) ? cleanStringList(input.tags, 24) : (current.tags ?? []),
    tropes: Array.isArray(input.tropes) ? cleanStringList(input.tropes, 24) : (current.tropes ?? []),
    contributors: Array.isArray(input.contributors) ? normaliseReleaseContributors(input.contributors, current.contributors, true) : normaliseReleaseContributors(current.contributors, current.contributors),
    contentRating: typeof input.contentRating !== 'undefined' ? cleanReleaseContentRating(input.contentRating) : cleanReleaseContentRating(current.contentRating),
    seriesTitle: typeof input.seriesTitle !== 'undefined' ? cleanText(input.seriesTitle, 160) || null : current.seriesTitle ?? null,
    episodeNumber: typeof input.episodeNumber !== 'undefined' ? cleanEpisodeNumber(input.episodeNumber) : cleanEpisodeNumber(current.episodeNumber),
    productionNote: typeof input.productionNote !== 'undefined' ? cleanText(input.productionNote, 1800) || null : current.productionNote ?? null,
    releaseDistribution: typeof input.releaseDistribution !== 'undefined' ? cleanReleaseDistribution(input.releaseDistribution) : cleanReleaseDistribution(current.releaseDistribution),
    releaseDistributionConfirmed: (typeof input.releaseDistribution !== 'undefined' ? cleanReleaseDistribution(input.releaseDistribution) : cleanReleaseDistribution(current.releaseDistribution)) !== 'standard'
      && (typeof input.releaseDistributionConfirmed !== 'undefined' ? input.releaseDistributionConfirmed === true : current.releaseDistributionConfirmed === true),
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
    ...(typeof input.scheduledAt !== 'undefined'
      ? scheduleReleaseInput(input.scheduledAt, input.scheduledTimeZone, input.scheduledLocal)
      : { scheduledAt:current.scheduledAt ?? null, scheduledTimeZone:current.scheduledTimeZone ?? null, scheduledLocal:current.scheduledLocal ?? null }),
    durationMinutes: typeof input.durationMinutes === 'number' && Number.isFinite(input.durationMinutes)
      ? Math.max(0, Math.min(1440, input.durationMinutes))
      : current.durationMinutes ?? 0,
    metadataRevision: revision + 1,
    updatedAt: FieldValue.serverTimestamp(),
    };
    tx.set(ref, update, { merge: true });
  });
  // Expensive multi-collection tag census runs only when the selected tags
  // change, never on ordinary title/description/credits autosave edits.
  if (tagsChanged) await syncCreatorCustomTagUsage(identity.uid);
  const saved = await ref.get();
  return { release: releaseOwnerPayload(saved.data() ?? {}, releaseId) };
});

// Removal is available to both the owner and Nightjar administrators.
// Hide the release BEFORE deleting media so failed cleanup cannot expose it.
const removeOwnedRelease = async (releaseId: string, actorUserId: string, administrator: boolean) => {
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(releaseId))
    throw new HttpsError('invalid-argument', 'Choose a valid release.');
  const ref = releaseRef(releaseId);
  // Capture canonical references and revoke playback in ONE transaction.
  // A competing audio finalizer or Admin review cannot change the file list
  // after we decide exactly which objects the member requested to remove.
  const removal=await db.runTransaction(async transaction=>{
    const snapshot=await transaction.get(ref);
    const data=snapshot.data();
    if(!data) throw new HttpsError('not-found','Release not found.');
    if(!administrator && data.creatorUserId!==actorUserId)
      throw new HttpsError('permission-denied','You can only remove your own releases.');
    const ownerUserId=String(data.creatorUserId??'');
    const previousStatus=String(data.removalOriginalStatus??data.status??'draft');
    if(data.status==='removed' && !data.audioStoragePath && !data.artworkAssetId && !data.pendingArtworkAssetId)
      return {alreadyDeleted:true,ownerUserId,previousStatus,audioPaths:[] as string[],assetIds:[] as string[],createdAt:data.createdAt,pendingPath:''};
    const prefix=`release-audio/${ownerUserId}/${releaseId}/`;
    const audioPaths=[data.audioStoragePath,data.audioRemovalPendingPath].map(value=>cleanText(value,500))
      .filter(Boolean);
    if(audioPaths.some(path=>!path.startsWith(prefix)))
      throw new HttpsError('failed-precondition','Release audio path requires a security review before deletion.');
    const assetIds=[...new Set([data.artworkAssetId,data.pendingArtworkAssetId].map(value=>cleanText(value,160)).filter(Boolean))];
    if(data.status!=='removing')
      transaction.set(ref,{
        status:'removing',removalOriginalStatus:previousStatus,updatedAt:FieldValue.serverTimestamp(),
      },{merge:true});
    return {alreadyDeleted:false,ownerUserId,previousStatus,audioPaths:[...new Set(audioPaths)],assetIds,createdAt:data.createdAt,
      pendingPath:cleanText(data.audioRemovalPendingPath,500)};
  });
  if(removal.alreadyDeleted)return {deleted:true};

  // No destructive operation runs before the above transaction commits.
  // On any failure the private 'removing' record retains exact paths for
  // repeat explicit deletion, rather than reporting a false success.
  for(const path of removal.audioPaths){
    await getStorage().bucket().file(path).delete({ignoreNotFound:true});
  }
  for(const assetId of removal.assetIds){
    const assetRef=db.collection('imageAssets').doc(assetId);
    const asset=await assetRef.get();
    if(!asset.exists)continue;
    const image=asset.data()??{};
    if(image.ownerUserId!==removal.ownerUserId || image.kind!=='release_artwork' ||
       String(image.targetId??'')!==releaseId) {
      throw new HttpsError('failed-precondition','Linked artwork ownership requires a security review before deletion.');
    }
    const imagePath=cleanText(image.storagePath,500);
    if(imagePath)await getStorage().bucket().file(imagePath).delete({ignoreNotFound:true});
    await assetRef.set({status:'removed',publicUrl:null,updatedAt:FieldValue.serverTimestamp()},{merge:true});
  }

  // Removal provenance and the final removed state are atomic. If Firestore
  // fails, retrying the same request safely verifies missing files with
  // ignoreNotFound and commits the tombstone without re-exposing anything.
  await db.runTransaction(async transaction=>{
    const snapshot=await transaction.get(ref);
    const data=snapshot.data();
    if(!data || data.creatorUserId!==removal.ownerUserId)
      throw new HttpsError('not-found','Release changed during removal.');
    if(data.status==='removed')return;
    if(data.status!=='removing')
      throw new HttpsError('aborted','The release changed during removal. Review its status before retry.');
    transaction.set(db.collection('releaseRemovalAudits').doc(releaseId),{
      releaseId,creatorUserId:removal.ownerUserId,removedByUserId:actorUserId,
      removedByAdmin:administrator,previousStatus:removal.previousStatus,
      removedAt:FieldValue.serverTimestamp(),
    },{merge:true});
    if(removal.pendingPath)transaction.set(
      ref.collection('retiredAudioPaths').doc(createHash('sha256').update(removal.pendingPath).digest('hex')),
      {cleanupState:'deleted',deletedAt:FieldValue.serverTimestamp()},{merge:true});
    transaction.set(ref,{
      creatorUserId:removal.ownerUserId,status:'removed',
      createdAt:removal.createdAt??FieldValue.serverTimestamp(),
      removedAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp(),
    });
  });
  await syncCreatorCustomTagUsage(removal.ownerUserId)
    .catch(error=>console.warn('Release was removed, but tag usage refresh failed',error));
  return {deleted:true};
};

export const deleteRelease = onCall({ region: REGION }, async (request) => {
  const identity = await requireAccountRole(request, ['creator']);
  const releaseId = cleanText((request.data as { releaseId?: unknown } | undefined)?.releaseId, 160);
  return removeOwnedRelease(releaseId, identity.uid, false);
});

export const adminRemoveRelease = onCall({ region: REGION }, async (request) => {
  const admin = requireAdminIdentity(request);
  const releaseId = cleanText((request.data as { releaseId?: unknown } | undefined)?.releaseId, 160);
  return removeOwnedRelease(releaseId, admin.uid, true);
});

/**
 * Nightjar owner QA: verify a temporary Storage upload using the same bucket
 * and canonical audio metadata, then delete it. No release, catalogue entry,
 * playback link or professional-role impersonation is created.
 */
export const adminVerifyAudioUpload = onCall({ region: REGION }, async (request) => {
  const admin = requireAdminIdentity(request);
  const path = cleanText((request.data as Record<string, unknown> | undefined)?.storagePath, 500);
  const expected = `audio-upload-diagnostics/${admin.uid}/`;
  const id = path.startsWith(expected) ? path.slice(expected.length) : '';
  if (!/^[a-f0-9-]{36}$/i.test(id)) {
    throw new HttpsError('invalid-argument', 'The administrator audio test path is invalid.');
  }
  const file = getStorage().bucket().file(path);
  const [exists] = await file.exists();
  if (!exists) throw new HttpsError('not-found', 'The test recording did not reach Firebase Storage.');
  try {
    const [metadata] = await file.getMetadata();
    const bytes = Number(metadata.size ?? 0);
    const mime = String(metadata.contentType ?? '');
    const allowed = ['audio/mpeg','audio/wav','audio/mp4','audio/ogg','audio/webm'];
    if (!allowed.includes(mime) || bytes <= 0 || bytes > 10 * 1024 * 1024) {
      throw new HttpsError('invalid-argument', 'The uploaded test file does not meet Nightjar audio validation.');
    }
    return { verified: true, bytes, contentType: mime, private: true, retained: false };
  } finally {
    // Never retain temporary creator sample files on the server.
    await file.delete({ ignoreNotFound: true });
  }
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
  // An ambiguous callable timeout can occur AFTER the first attempt attached
  // this same private recording. Repeating that exact path must be harmless,
  // without clearing timed transcripts or deleting other uploaded audio.
  if (current.audioRemovalPendingPath) {
    throw new HttpsError('failed-precondition','Finish the previous audio removal before attaching a new recording.');
  }
  const alreadyAttached = current.audioStoragePath === storagePath
    && Number(current.audioByteSize ?? 0) > 0
    && Boolean(current.audioContentType);
  if (!alreadyAttached && ['released', 'scheduled', 'removed', 'removing', 'pending_review'].includes(String(current.status))) {
    throw new HttpsError('failed-precondition', 'Submitted or removed audio cannot be replaced.');
  }

  const file = getStorage().bucket().file(storagePath);
  const [exists] = await file.exists();
  if (!exists) throw new HttpsError('not-found', 'Uploaded audio was not found.');
  if (alreadyAttached) {
    return { release: releaseOwnerPayload(current, releaseId) };
  }
  const [metadata] = await file.getMetadata();
  const size = Number(metadata.size ?? 0);
  const contentType = String(metadata.contentType ?? '');
  const allowed = ['audio/mpeg','audio/mp3','audio/wav','audio/x-wav','audio/mp4','audio/x-m4a','audio/ogg','audio/webm'];
  if (!allowed.includes(contentType) || !size || size > 25 * 1024 * 1024) {
    try { await file.delete({ ignoreNotFound: true }); } catch { /* validation failure remains authoritative */ }
    throw new HttpsError('invalid-argument', 'Uploaded audio is not a supported Nightjar audio file.');
  }

  // Status and attachment must be compared in the same transaction. A
  // second device may not overwrite a newer file or replace submitted audio.
  await db.runTransaction(async transaction => {
    const live = await transaction.get(ref);
    const retiredRef=ref.collection('retiredAudioPaths').doc(createHash('sha256').update(storagePath).digest('hex'));
    const retired=await transaction.get(retiredRef);
    const latest = live.data();
    if (!latest || latest.creatorUserId !== identity.uid) throw new HttpsError('not-found','Release not found.');
    if (retired.exists || latest.audioRemovalPendingPath)
      throw new HttpsError('failed-precondition','This audio path was removed or is awaiting cleanup and cannot be reattached.');
    if (latest.audioStoragePath === storagePath && Number(latest.audioByteSize ?? 0) > 0) return;
    if (latest.audioStoragePath !== current.audioStoragePath) {
      throw new HttpsError('aborted','Another upload changed the attached recording. Refresh before retrying.');
    }
    if (['released','scheduled','removed','removing','pending_review'].includes(String(latest.status))) {
      throw new HttpsError('failed-precondition','Submitted or removed audio cannot be replaced.');
    }
    transaction.set(ref,{
      audioStoragePath:storagePath,
      audioContentType:contentType,
      audioByteSize:size,
      transcriptText:cleanReleaseTranscript(latest.transcriptText).replace(/^\[(?:\d{1,2}:)?\d{1,3}:\d{2}\]\s*/gm,''),
      transcriptAccessibilityReviewed:false,
      transcriptSyncSource:null,
      durationMinutes:typeof input.durationMinutes === 'number'
        ? Math.max(0,Math.min(1440,input.durationMinutes)) : latest.durationMinutes ?? 0,
      updatedAt:FieldValue.serverTimestamp(),
    },{merge:true});
  });
  // Do not delete displaced private audio during finalization. A response
  // loss or concurrent edit may race deletion. A separate audited cleanup
  // must prove the storage object is no longer referenced.
  const saved = await ref.get();
  return { release: releaseOwnerPayload(saved.data() ?? {}, releaseId) };
});

export const removeReleaseAudio = onCall({ region: REGION }, async (request) => {
  const identity = await requireAccountRole(request, ['creator']);
  const releaseId = cleanText((request.data as { releaseId?: unknown } | undefined)?.releaseId, 160);
  if(!/^[A-Za-z0-9_-]{1,160}$/.test(releaseId))
    throw new HttpsError('invalid-argument','Choose a valid private release.');
  const ref = releaseRef(releaseId);
  // Revoke canonical attachment FIRST, retaining an exact server-side
  // cleanup receipt. Any Firestore failure leaves active Storage untouched.
  const removal=await db.runTransaction(async transaction=>{
    const snapshot=await transaction.get(ref);
    const latest=snapshot.data();
    if(!latest || latest.creatorUserId!==identity.uid)
      throw new HttpsError('not-found','Release not found.');
    if(['released','scheduled','removed','removing','pending_review'].includes(String(latest.status)))
      throw new HttpsError('failed-precondition','Submitted or removed audio cannot be edited.');
    const pending=cleanText(latest.audioRemovalPendingPath,500);
    if(pending)return {path:pending};
    const path=cleanText(latest.audioStoragePath,500);
    if(!path)return {path:''};
    if(!path.startsWith(`release-audio/${identity.uid}/${releaseId}/`))
      throw new HttpsError('failed-precondition','Stored audio path requires an administrator security review.');
    const retiredRef=ref.collection('retiredAudioPaths').doc(createHash('sha256').update(path).digest('hex'));
    transaction.set(ref,{
      audioStoragePath:null,audioContentType:null,audioByteSize:null,
      durationMinutes:0,transcriptAccessibilityReviewed:false,transcriptSyncSource:null,
      audioRemovalPendingPath:path,updatedAt:FieldValue.serverTimestamp(),
    },{merge:true});
    transaction.set(retiredRef,{
      storagePath:path,ownerUserId:identity.uid,cleanupState:'pending',
      retiredAt:FieldValue.serverTimestamp(),
    },{merge:true});
    return {path};
  });
  if(!removal.path)return {removed:true,pendingCleanup:false,storageDeleted:true};
  try {
    await getStorage().bucket().file(removal.path).delete({ignoreNotFound:true});
  } catch(error) {
    console.warn('Creator audio cleanup pending',releaseId,error instanceof Error?error.message:'Unknown Storage error');
    return {removed:true,pendingCleanup:true,storageDeleted:false};
  }
  // A successful delete can still have an ambiguous Firestore acknowledgement.
  // Retain the receipt so retrying can finalise safely without reattaching
  // or deleting a replacement recording.
  try {
    await db.runTransaction(async transaction=>{
      const snapshot=await transaction.get(ref);
      const live=snapshot.data();
      if(!live || live.creatorUserId!==identity.uid)
        throw new HttpsError('not-found','Release not found.');
      if(live.audioRemovalPendingPath!==removal.path)
        throw new HttpsError('aborted','Another operation changed the removal receipt.');
      const retiredRef=ref.collection('retiredAudioPaths').doc(createHash('sha256').update(removal.path).digest('hex'));
      transaction.set(ref,{audioRemovalPendingPath:null,updatedAt:FieldValue.serverTimestamp()},{merge:true});
      transaction.set(retiredRef,{cleanupState:'deleted',deletedAt:FieldValue.serverTimestamp()},{merge:true});
    });
    return {removed:true,pendingCleanup:false,storageDeleted:true};
  }catch(error){
    console.warn('Creator audio removal receipt pending',releaseId,error instanceof Error?error.message:'Unknown Firestore error');
    return {removed:true,pendingCleanup:true,storageDeleted:false};
  }
});

export const submitReleaseForModeration = onCall({ region: REGION }, async (request) => {
  const identity = await requireAccountRole(request, ['creator']);
  await requireProfessionalLegalTerms(identity.uid);
  const releaseId = cleanText((request.data as { releaseId?: unknown } | undefined)?.releaseId, 160);
  const ref = releaseRef(releaseId);
  const snapshot = await ref.get();
  const data = snapshot.data();
  if (!data || data.creatorUserId !== identity.uid) throw new HttpsError('not-found', 'Release not found.');
  if (data.status !== 'draft') throw new HttpsError('failed-precondition', 'Only saved drafts can be submitted for review.');
  if (data.scheduledAt) scheduleReleaseInput(data.scheduledAt, data.scheduledTimeZone, data.scheduledLocal);
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
  if (cleanReleaseDistribution(data.releaseDistribution) !== 'standard' && data.releaseDistributionConfirmed !== true) {
    throw new HttpsError('failed-precondition', 'Confirm the first-release or exclusivity statement, or select Standard release.', { code:'release_distribution_unconfirmed' });
  }
  // A transcript is encouraged, not a publishing prerequisite. When one is
  // supplied, require its creator to verify that it matches the finished audio.
  // The protected transcript endpoint continues to return not-found for audio
  // with no transcript; do not synthesize or expose an original script.
  if (cleanReleaseTranscript(data.transcriptText) && data.transcriptAccessibilityReviewed !== true) {
    throw new HttpsError(
      'failed-precondition',
      'Please confirm that your optional transcript accurately reflects the finished audio, or remove the draft transcript before submitting.',
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
  // A failed push cannot roll back a confirmed moderation submission.
  await createNotification(identity.uid, {
    type: 'release_submission', subtype: 'submitted',
    title: 'Recording submitted for review',
    message: 'Your recording has reached Nightjar moderation. Open to see its status.',
    releaseId, releaseTitle: cleanText(data.title, 160),
    dedupeKey: 'release-submitted-' + releaseId,
  }).catch((error) => console.warn('Release submission notification failed', error));
  return { release: releaseOwnerPayload(saved.data() ?? {}, releaseId) };
});

export const creatorDashboard = onCall({ region: REGION }, async (request) => {
  const identity = await requireAccountRole(request, ['creator','admin']);
  const targetCreatorId = identity.role === 'creator'
    ? identity.uid
    : cleanText((request.data as { creatorUserId?: unknown } | undefined)?.creatorUserId, 160) || identity.uid;

  const releasesSnapshot = await db.collection('releases').where('creatorUserId', '==', targetCreatorId).limit(500).get();
  const releases = releasesSnapshot.docs.filter((doc) => doc.data().status !== 'removed').map((doc) => releaseOwnerPayload(doc.data(), doc.id));
  const listeningSnapshot = await db.collection('listeningEvents').where('creatorUserId', '==', targetCreatorId).limit(5000).get();

  const verified = calculateVerifiedListening(listeningSnapshot.docs.map((doc) => doc.data()));
  const listeningSeconds = verified.byCreator.get(targetCreatorId) ?? 0;
  const listeners = verified.listenersByCreator.get(targetCreatorId) ?? new Set<string>();
  const qualifiedListens = releases.reduce((sum, release) => sum + release.listenCount, 0);

  return {
    releases,
    metrics: {
      released: releases.filter((release) => release.status === 'released').length,
      drafts: releases.filter((release) => release.status !== 'released').length,
      verifiedListeningMinutes: Math.round((listeningSeconds / 60) * 10) / 10,
      uniqueListeners: listeners.size,
      qualifiedListens,
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

export const getReleaseSyncAudioUrl = onCall({ region: REGION }, async (request) => {
  const identity = await requireActiveIdentity(request);
  await requireAgeVerified(identity.uid);
  const releaseId = cleanText((request.data as { releaseId?: unknown } | undefined)?.releaseId, 160);
  if (!releaseId) throw new HttpsError('invalid-argument', 'Release is required.');
  const data = (await releaseRef(releaseId).get()).data();
  if (!data || !data.audioStoragePath || ['removed', 'removing'].includes(String(data.status))) {
    throw new HttpsError('not-found', 'Recording not found.');
  }
  if (!identity.admin) {
    const creator = await requireAccountRole(request, ['creator']);
    await requireAgeVerified(creator.uid);
    if (data.creatorUserId !== creator.uid || !['draft', 'rejected'].includes(String(data.status))) {
      throw new HttpsError('permission-denied', 'Only the owner can synchronise an editable recording.');
    }
  }
  const [url] = await getStorage().bucket().file(String(data.audioStoragePath)).getSignedUrl({
    action: 'read',
    expires: Date.now() + 10 * 60 * 1000,
  });
  return { releaseId, url, expiresInSeconds: 600 };
});

// Human-set timestamps are saved only after reviewing against the recording.
// The original writer script is not processed by a transcription engine.
export const saveSyncedReleaseTranscript = onCall({ region: REGION }, async (request) => {
  const identity = await requireActiveIdentity(request);
  await requireAgeVerified(identity.uid);
  const input = (request.data ?? {}) as Record<string, unknown>;
  const releaseId = cleanText(input.releaseId, 160);
  const rawTranscript = String(input.transcript ?? '');
  const transcript = cleanReleaseTranscript(rawTranscript);
  if (!releaseId) throw new HttpsError('invalid-argument', 'Release is required.');
  if (!transcript || rawTranscript.length > 120000 || input.accuracyConfirmed !== true) {
    throw new HttpsError('invalid-argument', 'Review the complete timed transcript and confirm accuracy before saving.');
  }
  const timedLines = transcript.split('\n').filter((line) => line.trim());
  if (timedLines.length > 6000 || !timedLines.length) {
    throw new HttpsError('invalid-argument', 'The transcript contains too many timed lines.');
  }
  let previous = -1;
  for (const line of timedLines) {
    const match = line.match(/^\[((?:\d{1,2}:)?\d{1,3}:\d{2})\]\s+(.+)$/);
    if (!match) throw new HttpsError('invalid-argument', 'Each nonempty line must start with a timestamp such as [01:23].');
    const segments = match[1].split(':').map(Number);
    if (segments.some((n) => !Number.isFinite(n)) || segments.at(-1)! >= 60 || (segments.length === 3 && segments[1] >= 60)) {
      throw new HttpsError('invalid-argument', 'A transcript timestamp is invalid.');
    }
    const seconds = segments.reduce((acc, n) => acc * 60 + n, 0);
    if (seconds < previous) throw new HttpsError('invalid-argument', 'Transcript timestamps must be chronological.');
    previous = seconds;
  }
  if (!identity.admin) {
    const creator = await requireAccountRole(request, ['creator']);
    await requireAgeVerified(creator.uid);
  }
  const ref = releaseRef(releaseId);
  const snapshot = await ref.get();
  const data = snapshot.data();
  if (!data || !data.audioStoragePath || ['removed', 'removing'].includes(String(data.status))) {
    throw new HttpsError('not-found', 'Attached audio not found.');
  }
  if (!identity.admin && (data.creatorUserId !== identity.uid || !['draft', 'rejected'].includes(String(data.status)))) {
    throw new HttpsError('permission-denied', 'Only the owner can edit a draft transcript. Submitted releases must be reviewed by Nightjar.');
  }
  await ref.set({
    transcriptText: transcript,
    transcriptLanguage: cleanTranscriptLanguage(input.language),
    transcriptAccessibilityReviewed: true,
    transcriptSyncSource: 'manual_timing_reviewed',
    transcriptSyncedBy: identity.uid,
    transcriptSyncedByAdmin: identity.admin === true,
    transcriptSyncedAt: FieldValue.serverTimestamp(),
    transcriptUpdatedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  const saved = await ref.get();
  return { release: releaseOwnerPayload(saved.data() ?? {}, releaseId) };
});

export const getReleaseTranscript = onCall({ region: REGION }, async (request) => {
  const identity = await requireActiveIdentity(request);
  await requireAgeVerified(identity.uid);
  const releaseId = cleanText((request.data as { releaseId?: unknown } | undefined)?.releaseId, 160);
  if (!releaseId) throw new HttpsError('invalid-argument', 'Release is required.');

  const snapshot = await releaseRef(releaseId).get();
  const data = snapshot.data();
  if (!data || ['removed', 'removing'].includes(String(data.status))) throw new HttpsError('not-found', 'Release transcript not found.');

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

// Owner-only attached-audio audit. Unlike releaseModerationQueue, this
// deliberately includes audio connected to drafts and returned-for-changes
// releases, so a creator upload is visible before final submission.
// Only metadata is listed; listening uses the existing admin-signed URL.
// Server-bounded Admin reads: a cursor represents a document ID, never a
// signed URL or a permission token. Sorting by stable ID avoids a composite
// Firestore index and works with pre-existing private audio records.
const adminReleasePageInput=(raw:unknown,size:number)=>{
  const value=cleanText(raw,160);
  if(value && !/^[A-Za-z0-9_-]{1,160}$/.test(value))
    throw new HttpsError('invalid-argument','Invalid release page cursor.');
  return {cursor:value, size};
};
export const adminReleaseAudioLibrary = onCall({ region: REGION }, async (request) => {
  requireAdminIdentity(request);
  const {cursor,size}=adminReleasePageInput((request.data as Record<string,unknown>|undefined)?.cursor,60);
  let query=db.collection('releases').orderBy(FieldPath.documentId()).limit(size+1);
  if(cursor)query=query.startAfter(cursor);
  const snapshot=await query.get();
  const docs=snapshot.docs.slice(0,size);
  const releases=docs.filter(doc=>Boolean(doc.data().audioStoragePath)).map(doc=>{
    const data=doc.data();
    return {...releaseOwnerPayload(data,doc.id),
      audioByteSize:Math.max(0,Number(data.audioByteSize??0)),
      audioContentType:cleanText(data.audioContentType,100)||null,
      submittedAt:toIso(data.submittedAt),
      moderatedAt:toIso(data.moderatedAt),
    };
  });
  return {releases,totalInspected:docs.length,
    nextCursor:snapshot.size>size && docs.length ? docs[docs.length-1].id : null,
    truncated:false};
});

// Explicit, read-only orphan investigation. No scheduled bucket sweeps, no
// automatic deletion and no playable or signed URLs. An unreferenced object is
// ONLY a candidate for independent review, never proof that deletion is safe.
export const adminAuditReleaseAudioStorage = onCall({region:REGION},async request=>{
  requireAdminIdentity(request);
  const releaseId=cleanText((request.data as Record<string,unknown>|undefined)?.releaseId,160);
  const cursor=cleanText((request.data as Record<string,unknown>|undefined)?.cursor,2049);
  if(!/^[A-Za-z0-9_-]{1,160}$/.test(releaseId) || (cursor && (cursor.length>2048 || !/^[A-Za-z0-9+/=_-]+$/.test(cursor))))
    throw new HttpsError('invalid-argument','Choose a valid release and bounded page cursor before auditing private audio.');
  const snap=await releaseRef(releaseId).get();
  const release=snap.data();
  if(!release || !release.creatorUserId)throw new HttpsError('not-found','Release not found.');
  const prefix=`release-audio/${cleanText(release.creatorUserId,160)}/${releaseId}/`;
  // Each explicit Admin request inspects at most 30 scoped objects. The
  // provider's own continuation cursor prevents hiding a 31st object.
  const [files,nextQuery]=await getStorage().bucket().getFiles({
    prefix,maxResults:30,autoPaginate:false,...(cursor?{pageToken:cursor}:{}),
  });
  const items=files.slice(0,30).map(file=>{
    const metadata=file.metadata??{};
    const createdMs=Date.parse(String(metadata.timeCreated??''));
    const ageDays=Number.isFinite(createdMs)?Math.max(0,Math.floor((Date.now()-createdMs)/86400000)):null;
    const attached=release.audioStoragePath===file.name;
    return {
      storagePath:file.name,
      attached,
      byteSize:Math.max(0,Number(metadata.size??0)),
      createdAt:Number.isFinite(createdMs)?new Date(createdMs).toISOString():null,
      ageDays,
      reviewState:attached?'attached':ageDays===null?'needs_manual_check'
        :ageDays>=14?'aged_unattached':'recent_unattached',
    };
  });
  return {releaseId,items,inspected:items.length,
    nextCursor:cleanText(nextQuery?.pageToken,2048)||null,
    moreUninspected:Boolean(nextQuery?.pageToken),
    automaticDeletion:false};
});

export const releaseModerationQueue = onCall({ region: REGION }, async (request) => {
  requireAdminIdentity(request);
  const {cursor,size}=adminReleasePageInput((request.data as Record<string,unknown>|undefined)?.cursor,30);
  let query=db.collection('releases').where('status','==','pending_review').orderBy(FieldPath.documentId()).limit(size+1);
  if(cursor)query=query.startAfter(cursor);
  const snapshot=await query.get();
  const docs=snapshot.docs.slice(0,size);
  return {releases:docs.map(doc=>releaseOwnerPayload(doc.data(),doc.id)),
    nextCursor:snapshot.size>size && docs.length ? docs[docs.length-1].id : null};
});

const notificationRouteFor = (payload: Record<string, unknown>) => {
  const type = cleanText(payload.type, 40);
  const subtype = cleanText(payload.subtype, 60);
  const updateId = cleanText(payload.updateId, 64);
  if (type === 'announcement' && /^[0-9a-f-]{36}$/i.test(updateId)) return '/discover?update=' + encodeURIComponent(updateId);
  if (type === 'admin_action' && subtype === 'release_submitted') return '/admin';
  if (type === 'message' || subtype === 'professional_message' || subtype === 'direct_message') return '/messages';
  if (type === 'collaboration') return '/messages';
  if (type === 'payment' || subtype === 'payment') return '/profile';
  if (type === 'release_submission') return '/creator';
  if (subtype === 'release' || subtype === 'release_comment' || subtype === 'release_reaction') return '/discover';
  return '/discover';
};

const deliverPushNotification = async (
  userId: string,
  payload: Record<string, unknown>,
  displayMode: string,
  notificationId: string,
  targetDeviceId?: string,
) => {
  const devices = await accountRef(userId).collection('pushDevices').where('active', '==', true).limit(100).get();
  // Normal notifications go to every active device. An explicit test can only
  // target a short-id token already registered to the authenticated account.
  const targetDocs = targetDeviceId
    ? devices.docs.filter((doc) => doc.id.slice(0, 16) === targetDeviceId)
    : devices.docs.slice(0, 20);
  if (!targetDocs.length) return { attempted: 0, sent: 0, failed: 0 };

  const title = cleanText(payload.title, 120) || 'Nightjar update';
  const message = cleanText(payload.message, 240) || 'Open Nightjar to view this update.';
  const tokenDocs = targetDocs.filter((doc) => Boolean(cleanText(doc.data()?.token, 4096)));
  const tokens = tokenDocs.map((doc) => cleanText(doc.data()?.token, 4096));

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
    const doc = tokenDocs[index];
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
  const input = (request.data ?? {}) as Record<string, unknown>;
  const token = cleanText(input.token, 4096);
  const shortId = cleanText(input.deviceId, 40);
  const devices = accountRef(identity.uid).collection('pushDevices');
  // Only the authenticated account's own previously registered device can be revoked.
  // This does not request or regenerate an FCM token.
  let ref;
  if (token) {
    ref = devices.doc(createHash('sha256').update(token).digest('hex'));
  } else if (/^[0-9a-f]{16}$/.test(shortId)) {
    const snapshot = await devices.limit(100).get();
    ref = snapshot.docs.find(doc => doc.id.slice(0, 16) === shortId)?.ref;
  }
  if (!ref) return { unregistered:false };
  await ref.set({
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
    // Clients must confirm this feature before invoking a targeted test.
    // Older deployed Functions without this marker may broadcast tests.
    targetedTestsSupported: true,
    devices,
  };
});

export const sendTestPushNotification = onCall({ region: REGION }, async (request) => {
  const identity = await requireActiveIdentity(request);
  const input = (request.data ?? {}) as Record<string, unknown>;
  const targetDeviceId = cleanText(input.deviceId, 40);
  if (targetDeviceId && !/^[0-9a-f]{16}$/.test(targetDeviceId)) {
    throw new HttpsError('invalid-argument', 'Invalid Nightjar push device identifier.');
  }
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

  const result = await deliverPushNotification(identity.uid, payload, displayMode, ref.id, targetDeviceId || undefined);
  if (!result.attempted) {
    throw new HttpsError('failed-precondition', targetDeviceId
      ? 'This device is no longer registered. Refresh your status and re-enable push on this device.'
      : 'No active Nightjar push device is registered for this account.', { code:'no_push_device' });
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
            : type === 'content' && subtype === 'new_audio' ? 'newReleases'
              : type === 'content' && subtype === 'new_script' ? 'newScripts'
              : type === 'content' && subtype === 'new_artwork' ? 'newArtwork'
              : type === 'follow' && subtype === 'new_follower' ? 'newFollowers'
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
  // The lock-screen push stays discreet; the signed-in member can read the
  // full congratulations in their private NightJar notification inbox.
  const persistedPayload = { ...(payload.approvedWorkThankYou === true ? payload : safePayload) } as Record<string, unknown>;
  delete persistedPayload.approvedWorkThankYou;
  delete persistedPayload.dedupeKey;
  delete persistedPayload.oncePerKey;
  const oncePerKey=Boolean(dedupeKey) && payload.oncePerKey===true;
  const fresh = {
    ...persistedPayload,
    read: false,
    createdAt: FieldValue.serverTimestamp(),
  };
  // Retrying the same event must not reset a member's Read status or
  // re-send a push. Competing producers must agree on a single first writer.
  // Only immutable event IDs are once-only. Repeated sign-ins, reactions,
  // moderation cycles and Creator resubmissions must remain able to notify.
  const newlyCreated = oncePerKey
    ? await db.runTransaction(async (tx) => {
      const prior = await tx.get(ref);
      if (prior.exists) return false;
      tx.create(ref, fresh);
      return true;
    })
    : await ref.set(fresh,{merge:Boolean(dedupeKey)}).then(() => true);
  if (!newlyCreated) return;

  // Persistence is the delivery guarantee. Push is an optional best-effort
  // alert; transient FCM failure cannot roll back a recorded inbox item.
  await deliverPushNotification(userId, safePayload, displayMode, ref.id).catch((error) => {
    console.warn('Nightjar push delivery failed', {
      userId,
      notificationId: ref.id,
      error: error instanceof Error ? error.message : String(error),
    });
  });
};


// Personal appreciation is composed only after a successful Admin approval.
// Names come from the member's chosen NightJar profile/account, never from an
// email address, identity documents, an AI service or a guessed legal name.
const approvedWorkThankYou = async (
  userId: string,
  kind: 'audio' | 'manuscript' | 'editor' | 'artwork',
  titleValue: unknown,
  scheduled = false,
) => {
  let chosenName = '';
  try {
    const [profile, account] = await Promise.all([profileRef(userId).get(), accountRef(userId).get()]);
    chosenName = cleanText(profile.data()?.displayName, 80)
      || cleanText(account.data()?.displayName, 80)
      || cleanText(profile.data()?.handle, 40).replace(/^@/, '');
  } catch (error) {
    console.warn('NightJar approval greeting name unavailable', error instanceof Error ? error.message : 'Unknown read error');
  }
  chosenName = chosenName.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
  const title = cleanText(titleValue, 140).replace(/[\r\n\t]+/g, ' ');
  const work = title ? '“' + title + '”' : 'your work';
  const progress = kind === 'audio'
    ? (scheduled
      ? 'Your release has been approved and is scheduled for the date you selected. It will remain private until publication.'
      : 'Your release is approved and is now available to eligible NightJar listeners.')
    : kind === 'manuscript'
      ? 'Your manuscript has been approved. Its protected contents and your chosen Marketplace visibility remain under your control.'
      : kind === 'editor'
        ? 'Your approved Audio Editor showcase is now visible on your professional profile.'
        : 'Your approved artwork is now ready for your Artist portfolio.';
  return [
    chosenName ? 'Hi ' + chosenName + ',' : 'Hello,',
    '',
    'Thank you for trusting NightJar with ' + work + '. We really appreciate the time, care and creativity you put into sharing it with our community.',
    '',
    progress,
    '',
    'We are glad you are helping shape NightJar.',
    '',
    'With appreciation,',
    'The NightJar Team',
  ].join('\n');
};

// Moderation feedback is a genuine administrator-authored message using the same
// conversation collection as Nightjar's Inbox. It can be replied to normally.
const sendModerationInboxMessage = async (adminId: string, creatorId: string, releaseId: string, body: string) => {
  if (adminId === creatorId) return null;
  const id = directConversationId(adminId, creatorId);
  const ref = db.collection('directConversations').doc(id);
  const existing = await ref.get();
  if (!existing.exists) await ref.set({
    participantUserIds:[adminId,creatorId].sort(),
    participantRoles:{[adminId]:'admin',[creatorId]:'creator'},
    unreadCounts:{[adminId]:0,[creatorId]:0},
    collaborationIds:[], collaborationId:null,
    createdAt:FieldValue.serverTimestamp(),
  }, {merge:true});
  const messageRef = ref.collection('messages').doc('release_moderation_'+releaseId+'_'+Date.now());
  await messageRef.set({
    conversationId:id, senderUserId:adminId, senderName:'Nightjar moderation',
    body, releaseId, status:'visible', collaborationId:null, readBy:[adminId],
    readAt:{[adminId]:new Date().toISOString()},
    createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp(),
  });
  const saved = await ref.get();
  const counters = { ...(saved.data()?.unreadCounts ?? {}) };
  counters[creatorId] = Number(counters[creatorId] ?? 0) + 1;
  counters[adminId] = 0;
  await ref.set({
    unreadCounts:counters,lastMessagePreview:body.slice(0,180),
    lastSenderUserId:adminId,lastMessageAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp(),
    resolvedForLastMessageAt:null,resolvedAt:null,resolvedByUserId:null,
  },{merge:true});
  await createNotification(creatorId,{
    type:'message',subtype:'direct_message',
    title:'A message from Nightjar moderation',
    message:'Your release has an update and a message you can reply to.',
    conversationId:id, releaseId,senderUserId:adminId,
  }).catch((error)=>console.warn('Moderation DM notification failed',error));
  return id;
};

export const moderateRelease = onCall({ region: REGION }, async (request) => {
  const admin = requireAdminIdentity(request);
  const input = (request.data ?? {}) as Record<string, unknown>;
  const releaseId = cleanText(input.releaseId, 160);
  const decision = cleanText(input.decision, 30);
  const note = cleanText(input.note, 1200);
  const nightjarOriginal = input.nightjarOriginal === true;
  if (decision === 'approved' && nightjarOriginal && input.originalCommissionConfirmed !== true) {
    throw new HttpsError('failed-precondition', 'Nightjar Original is reserved for work commissioned and paid for by Nightjar. Confirm that funding before applying the label.', {code:'nightjar_original_commission_unconfirmed'});
  }
  if (!['approved','changes','rejected'].includes(decision)) throw new HttpsError('invalid-argument', 'Invalid release moderation decision.');

  const ref = releaseRef(releaseId);
  const snapshot = await ref.get();
  const data = snapshot.data();
  if (!data) throw new HttpsError('not-found', 'Release not found.');
  if (data.status !== 'pending_review') throw new HttpsError('failed-precondition', 'Release is not awaiting moderation.');

  if ((decision === 'changes' || decision === 'rejected') && !note) {
    throw new HttpsError('invalid-argument', 'Provide a reason so the creator understands the decision.');
  }
  const scheduledFor = data.scheduledAt ? Date.parse(String(data.scheduledAt)) : null;
  if (decision === 'approved' && scheduledFor != null && (!Number.isFinite(scheduledFor) || scheduledFor <= Date.now())) {
    throw new HttpsError('failed-precondition', 'The requested release time has passed. Request a new date from the creator before approval.');
  }
  const scheduled = decision === 'approved' && scheduledFor != null;
  const status: ReleaseStatus = decision === 'approved' ? (scheduled ? 'scheduled' : 'released') : decision === 'changes' ? 'draft' : 'rejected';
  await db.runTransaction(async (transaction) => {
    const latest = await transaction.get(ref);
    if (latest.data()?.status !== 'pending_review') throw new HttpsError('failed-precondition', 'This submission has already been reviewed or withdrawn.');
    transaction.set(ref, {
      status,
      moderationNote:note || null,
      moderatedBy:admin.uid,
      moderatedAt:FieldValue.serverTimestamp(),
      releaseDate:decision === 'approved' && !scheduled ? FieldValue.serverTimestamp() : null,
      nightjarOriginal:decision === 'approved' ? nightjarOriginal : data.nightjarOriginal === true,
      updatedAt:FieldValue.serverTimestamp(),
    },{merge:true});
  });

  if (data.creatorUserId) {
    const thankYou = decision === 'approved'
      ? await approvedWorkThankYou(String(data.creatorUserId), 'audio', data.title, scheduled) : null;
    await createNotification(String(data.creatorUserId), {
      // A creator's own moderation decision is an operational alert, never
      // a promotional new-release announcement that can be opted out of.
      // The app's release_submission route opens their Creator workspace.
      type: 'release_submission',
      subtype: 'release_review',
      title: decision === 'approved'
        ? scheduled ? 'Approved · Scheduled for publication' : 'Your release is live on Nightjar'
        : decision === 'changes'
          ? 'Changes requested for your release'
          : 'Your release was not approved',
      message: thankYou ?? (decision === 'approved'
        ? scheduled ? 'Your release is approved and will stay private until the date and time you selected.' : 'Your release has passed Nightjar moderation and is available to age-verified listeners.'
        : decision === 'changes'
          ? 'Nightjar moderation requested changes before this release can be published.'
          : 'Your release was not approved for publication. Open Creator Studio to review the moderation note.'),
      approvedWorkThankYou:Boolean(thankYou),
      releaseId,
      moderationNote: note || null,
    }).catch((error) => console.warn('Moderation notification failed',error));
    const dateLine = scheduled ? 'It is scheduled for '+String(data.scheduledLocal)+' ('+String(data.scheduledTimeZone)+').' : '';
    const body = decision === 'approved'
      ? (thankYou ?? 'Your release has been approved.') + (scheduled ? '\n\n' + dateLine : '') + (note ? '\n\nNote: '+note : '')
      : decision === 'changes'
        ? 'Nightjar has reviewed “'+cleanText(data.title,160)+'” and requested changes:\n\n'+note+'\n\nYou can update your draft and resubmit it for review.'
        : 'Nightjar could not approve “'+cleanText(data.title,160)+'”. Reason:\n\n'+note+'\n\nReply here if you need clarification.';
    await sendModerationInboxMessage(admin.uid,String(data.creatorUserId),releaseId,body)
      .catch((error)=>console.warn('Moderation Inbox message failed',error));
  }

  const saved = await ref.get();
  return { release: releasePayload(saved.data() ?? {}, releaseId) };
});

// A qualified listen is 30 seconds of plausible, forward playback (or half of a
// shorter release, minimum five seconds). One listener/release can contribute
// at most one count per 30 minutes. The server checks elapsed time and a
// playback grant, so pressing Play, seeking, reloading or retrying is not enough.
// The event history remains the source for verified listening MINUTES.
const QUALIFIED_LISTEN_COOLDOWN_MS = 30 * 60 * 1000;
const creditQualifiedListen = async (input: {
  userId: string; releaseId: string; sessionId: string;
  eventType: string; positionSeconds: number; durationSeconds: number;
}) => {
  const now = Date.now();
  const releaseDocument = releaseRef(input.releaseId);
  const sessionDocument = releaseDocument.collection('listenerSessions').doc(input.userId);
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(sessionDocument);
    const previous = snapshot.data() ?? {};
    const lastCountedAtMs = Math.max(0, Number(previous.lastCountedAtMs ?? 0));
    if (previous.sessionId !== input.sessionId) {
      // A progress-only request may not invent a listening session.
      if (input.eventType !== 'start') return false;
      transaction.set(sessionDocument, {
        sessionId: input.sessionId,
        lastPositionSeconds: input.positionSeconds,
        lastEventAtMs: now,
        progressSeconds: 0,
        qualified: false,
        lastCountedAtMs,
      }, { merge: true });
      return false;
    }
    if (input.eventType === 'start' || previous.qualified === true) return false;
    const elapsed = (now - Number(previous.lastEventAtMs ?? now)) / 1000;
    const forward = Math.max(0, input.positionSeconds - Number(previous.lastPositionSeconds ?? 0));
    // 15-second client progress cadence: cap each contribution, reject huge
    // seek jumps, clock reversals and long pauses without a progress signal.
    const increment = elapsed > 0 && elapsed <= 90
      ? Math.min(forward, elapsed + 2, 20)
      : 0;
    const progressSeconds = Math.max(0, Number(previous.progressSeconds ?? 0)) + increment;
    const threshold = input.durationSeconds > 0 && Number.isFinite(input.durationSeconds)
      ? Math.min(30, Math.max(5, input.durationSeconds * 0.5))
      : 30;
    const qualified = progressSeconds >= threshold
      && (lastCountedAtMs === 0 || now - lastCountedAtMs >= QUALIFIED_LISTEN_COOLDOWN_MS);
    transaction.set(sessionDocument, {
      lastPositionSeconds: input.positionSeconds,
      lastEventAtMs: now,
      progressSeconds,
      qualified,
      ...(qualified ? { lastCountedAtMs: now } : {}),
    }, { merge: true });
    if (qualified) transaction.update(releaseDocument, { listenCount: FieldValue.increment(1) });
    return qualified;
  });
};

export const getReleaseListenCounts = onCall({ region: REGION }, async (request) => {
  const identity = await requireActiveIdentity(request);
  await requireAgeVerified(identity.uid);
  const snapshot = await db.collection('releases').where('status', '==', 'released').limit(500).get();
  return {
    counts: snapshot.docs.map((doc) => ({
      releaseId: doc.id,
      listens: Math.max(0, Math.floor(Number(doc.data().listenCount ?? 0))),
    })),
    refreshedAt: new Date().toISOString(),
  };
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
  let qualifiedListen = false;
  const sessionId = cleanText(input.sessionId, 80);
  const isCreditedContributor = normaliseReleaseContributors(releaseData.contributors)
    .some((credit) => credit.userId === identity.uid);
  if (['start', 'progress', 'complete'].includes(eventType)
    && /^[A-Za-z0-9-]{8,80}$/.test(sessionId)
    && !identity.admin && releaseData.creatorUserId !== identity.uid && !isCreditedContributor) {
    qualifiedListen = await creditQualifiedListen({
      userId: identity.uid,
      releaseId,
      sessionId,
      eventType,
      positionSeconds: Number.isFinite(event.positionSeconds) ? event.positionSeconds : 0,
      durationSeconds: Number.isFinite(event.durationSeconds) ? event.durationSeconds : 0,
    });
  }

  await accountRef(identity.uid).collection('tasteEvents').add({
    type: eventType,
    category: event.category,
    tags: event.tags,
    completed: event.completed,
    createdAt: FieldValue.serverTimestamp(),
  });

  return { recorded: true, qualifiedListen };
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
  const [releasesSnapshot, subscription] = await Promise.all([
    db.collection('releases').where('status', '==', 'released').limit(500).get(),
    identity.admin ? Promise.resolve(null) : activeListeningSubscriptionFor(identity.uid),
  ]);
  // Trending and creator statistics must use the same qualified-listen
  // definition. Raw progress telemetry must not make a release "popular".
  const trending = releasesSnapshot.docs
    .map((doc) => decorateReleaseAccess(doc.data(), doc.id, identity.uid, { admin:identity.admin, subscription }))
    .sort((a, b) => (b.listenCount - a.listenCount)
      || String(b.releaseDate ?? '').localeCompare(String(a.releaseDate ?? '')))
    .slice(0, 24);
  return { trending };
});

const adminActionNotifications = async () => {
  const [intake, imageCount, releaseCount, reviewCount, scriptQueue, editorCount, reportCount, securityCount, suggestionCount, billingCount] = await Promise.all([
    db.collection('professionalApplications').where('status', 'in', ['banked','waitlist']).limit(250).get(),
    db.collection('imageAssets').where('status', '==', 'pending').count().get(),
    db.collection('releases').where('status', '==', 'pending_review').count().get(),
    db.collection('releaseReviews').where('status', '==', 'pending').count().get(),
    db.collection('scripts').where('status', 'in', ['Submitted','Under review']).limit(250).get(),
    db.collection('editorPortfolio').where('status', '==', 'pending_review').count().get(),
    db.collection('communityReports').where('status', '==', 'open').count().get(),
    db.collection('securityAlerts').where('status', '==', 'open').count().get(),
    db.collection('creatorSuggestions').where('status', '==', 'new').count().get(),
    db.collection('subscriptions').where('status', 'in', ['past_due','unpaid','failed','incomplete_expired']).count().get(),
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
    { id:'admin_action_editor_portfolio', subtype:'editor_portfolio', count:editorCount.data().count, label:'Editor showcase awaiting review', route:'/admin/editorial' },
    { id:'admin_action_manuscripts', subtype:'script_submission', count:scriptQueue.docs.length, label:'manuscript awaiting admin review', route:'/admin/editorial' },
    { id:'admin_action_reports', subtype:'report_review', count:reportCount.data().count, label:'report awaiting moderation', route:'/admin/reports' },
    { id:'admin_action_security', subtype:'security_alert', count:securityCount.data().count, label:'open security alert', route:'/admin/workspace/security' },
    { id:'admin_action_suggestions', subtype:'creator_suggestion', count:suggestionCount.data().count, label:'creator recommendation', route:'/admin/suggestions' },
    { id:'admin_action_billing', subtype:'payment_attention', count:billingCount.data().count, label:'subscription issue', route:'/admin/subscriptions' },
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

// Personal calendar: dates are all-day civil dates (YYYY-MM-DD). No implicit
// conversion of all-day dates to UTC instants, which would shift across zones.
const personalCalendarDate = (input: unknown) => {
  const date = cleanText(input, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new HttpsError('invalid-argument', 'Choose a valid calendar date.');
  const [year, month, day] = date.split('-').map(Number);
  if (year < 2000 || year > 2100 || !month || month > 12 || day < 1 || day > 31 ||
      new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10) !== date) {
    throw new HttpsError('invalid-argument', 'Choose a real calendar date.');
  }
  return date;
};

const personalCalendarZone = (input: unknown) => {
  const zone = cleanText(input, 100) || 'auto';
  if (zone === 'auto') return zone;
  try { new Intl.DateTimeFormat('en-GB', { timeZone: zone }).format(new Date()); }
  catch { throw new HttpsError('invalid-argument', 'Choose a recognised time zone.'); }
  return zone;
};

export const getMyCalendar = onCall({ region: REGION }, async (request) => {
  const identity = await requireActiveIdentity(request);
  const [account, snapshot] = await Promise.all([
    accountRef(identity.uid).get(),
    accountRef(identity.uid).collection('personalCalendar').limit(251).get(),
  ]);
  return {
    timeZone: personalCalendarZone(account.data()?.personalCalendarTimeZone ?? 'auto'),
    events: snapshot.docs.map((item) => ({
      id: item.id, title: cleanText(item.data().title, 120),
      note: cleanText(item.data().note, 1500),
      date: personalCalendarDate(item.data().date),
    })).sort((a,b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title)),
    limited: snapshot.size > 250,
  };
});

export const saveMyCalendarTimeZone = onCall({ region: REGION }, async (request) => {
  const identity = await requireActiveIdentity(request);
  const timeZone = personalCalendarZone((request.data as Record<string, unknown> | undefined)?.timeZone);
  await accountRef(identity.uid).set({
    personalCalendarTimeZone: timeZone,
    personalCalendarUpdatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  return { timeZone };
});

export const saveMyCalendarEvent = onCall({ region: REGION }, async (request) => {
  const identity = await requireActiveIdentity(request);
  const input = (request.data ?? {}) as Record<string, unknown>;
  const title = cleanText(input.title, 120);
  const date = personalCalendarDate(input.date);
  const note = cleanText(input.note, 1500);
  if (!title) throw new HttpsError('invalid-argument', 'Enter an event title.');
  const rawId = cleanText(input.id, 80);
  if (rawId && !/^[a-zA-Z0-9_-]{5,80}$/.test(rawId)) throw new HttpsError('invalid-argument', 'Calendar event ID is invalid.');
  const collection = accountRef(identity.uid).collection('personalCalendar');
  const target = rawId ? collection.doc(rawId) : collection.doc();
  const prior = await target.get();
  if (!prior.exists) {
    const count = await collection.count().get();
    if (count.data().count >= 250) throw new HttpsError('resource-exhausted', 'You have reached 250 personal calendar dates. Remove one to create another.');
  }
  await target.set({ title, date, note, updatedAt: FieldValue.serverTimestamp(),
    ...(prior.exists ? {} : { createdAt: FieldValue.serverTimestamp() }) }, { merge: true });
  return { event: { id: target.id, title, date, note } };
});

export const deleteMyCalendarEvent = onCall({ region: REGION }, async (request) => {
  const identity = await requireActiveIdentity(request);
  const id = cleanText((request.data as Record<string, unknown> | undefined)?.id, 80);
  if (!/^[a-zA-Z0-9_-]{5,80}$/.test(id)) throw new HttpsError('invalid-argument', 'Calendar event ID is invalid.');
  await accountRef(identity.uid).collection('personalCalendar').doc(id).delete();
  return { deleted: true };
});

// Administrators author updates through Nightjar itself, never direct client
// Firestore writes. Test delivery is owner-only; fanout respects opt-outs.
// This beta callable has a hard 500-account ceiling to avoid silent truncation.
export const adminPublishCommunityUpdate = onCall({
  region:REGION,timeoutSeconds:540,memory:'512MiB',
},async(request)=>{
  const admin=requireAdminIdentity(request);
  const input=(request.data??{}) as Record<string,unknown>;
  const id=cleanText(input.requestId,64);
  const title=cleanText(input.title,120);
  const body=cleanText(input.body,4000);
  const audience=input.audience==='self'?'self':input.audience==='all'?'all':null;
  if(!/^[0-9a-f-]{36}$/i.test(id)||!title||body.length<40||!audience)
    throw new HttpsError('invalid-argument','Invalid update title, text, recipient group or request ID.');
  const contentHash=createHash('sha256').update(JSON.stringify({title,body})).digest('hex');
  if(audience==='all'){
    const privateTestId=cleanText(input.verifiedTestId,64);
    if(input.testVerified!==true||!/^[0-9a-f-]{36}$/i.test(privateTestId))
      throw new HttpsError('failed-precondition','First verify a private announcement test.');
    const privateTest=await db.collection('communityUpdates').doc(privateTestId).get();
    const test=privateTest.data();
    if(!test||test.audience!=='self'||test.authorUid!==admin.uid||
        test.contentHash!==contentHash||test.status!=='completed'||
        Number(test.outcome?.inboxCreated??0)<1||
        Date.now()-Number(test.createdAt?.toMillis?.()??0)>86400000)
      throw new HttpsError('failed-precondition','A completed private test of this exact update from the last 24 hours is required.');
  }
  const ref=db.collection('communityUpdates').doc(id);
  const digest=createHash('sha256').update(JSON.stringify({title,body,audience,authorUid:admin.uid})).digest('hex');
  const existing=await ref.get();
  if(existing.exists){
    if(existing.data()?.digest!==digest)throw new HttpsError('already-exists','Request ID already used for another announcement.');
    return {id,duplicate:true,...(existing.data()?.outcome??{status:'processing',eligible:0,inboxCreated:0,errors:0,optedOut:0})};
  }
  const accounts=audience==='self'
    ? [await accountRef(admin.uid).get()]
    : (await db.collection('accounts').orderBy('__name__').limit(501).get()).docs;
  if(audience==='all'&&accounts.length>500)
    throw new HttpsError('resource-exhausted','Too many accounts for direct beta fanout; queued delivery is required.');
  if(audience==='self'&&accounts[0].data()?.notificationPreferences?.announcements===false)
    throw new HttpsError('failed-precondition','Enable Nightjar announcements in your notification preferences to run a test.');
  try{
    await ref.create({title,body,audience,digest,contentHash,authorUid:admin.uid,
      status:'processing',createdAt:FieldValue.serverTimestamp()});
  }catch(error:any){
    if(error?.code===6||error?.code==='already-exists')
      return {id,duplicate:true,status:'processing',eligible:0,inboxCreated:0,errors:0,optedOut:0};
    throw error;
  }
  let eligible=0,inboxCreated=0,errors=0,optedOut=0;
  for(let i=0;i<accounts.length;i+=20){
    const outcomes=await Promise.allSettled(accounts.slice(i,i+20).map(async(account)=>{
      const data=account.data()??{};
      if(audience==='all'&&(data.status!=='active'||data.disabled===true))
        return 'ineligible';
      if(data.notificationPreferences?.announcements===false)return 'optedOut';
      const uid=account.id;
      const dedupeKey='community-update:'+id;
      const notificationId=createHash('sha256').update(dedupeKey).digest('hex').slice(0,40);
      const notification=accountRef(uid).collection('notifications').doc(notificationId);
      if((await notification.get()).exists)return 'duplicate';
      await createNotification(uid,{
        type:'announcement',subtype:'community_update',updateId:id,
        title,message:body.slice(0,200),route:'/discover?update='+encodeURIComponent(id),dedupeKey,
      });
      return (await notification.get()).exists?'created':'ineligible';
    }));
    for(const outcome of outcomes){
      if(outcome.status==='rejected'){errors++;continue;}
      if(outcome.value==='optedOut'){optedOut++;continue;}
      if(outcome.value==='created'){inboxCreated++;eligible++;}
      if(outcome.value==='duplicate')eligible++;
    }
  }
  const outcome={status:errors?'partial_failure':'completed',eligible,inboxCreated,errors,optedOut};
  await ref.set({status:outcome.status,outcome,finishedAt:FieldValue.serverTimestamp()},{merge:true});
  console.info('NightJar community announcement result',{id,audience,...outcome});
  return {id,duplicate:false,...outcome};
});

export const getCommunityUpdate=onCall({region:REGION},async(request)=>{
  const identity=await requireActiveIdentity(request);
  const id=cleanText((request.data as Record<string,unknown>|undefined)?.id,64);
  if(!/^[0-9a-f-]{36}$/i.test(id))throw new HttpsError('invalid-argument','Invalid update identifier.');
  const snapshot=await db.collection('communityUpdates').doc(id).get();
  if(!snapshot.exists)throw new HttpsError('not-found','This NightJar update is unavailable.');
  const item=snapshot.data()??{};
  if(item.audience==='self'&&(!identity.admin||item.authorUid!==identity.uid))
    throw new HttpsError('permission-denied','Private admin test only.');
  return {id,title:String(item.title??''),body:String(item.body??''),
    createdAt:toIso(item.createdAt),test:item.audience==='self'};
});

export const adminListCommunityUpdates=onCall({region:REGION},async(request)=>{
  requireAdminIdentity(request);
  const page=await db.collection('communityUpdates').orderBy('createdAt','desc').limit(12).get();
  return {updates:page.docs.map(item=>({
    id:item.id,title:item.data().title,audience:item.data().audience,
    createdAt:toIso(item.data().createdAt),status:item.data().status,
    outcome:item.data().outcome??null,
  }))};
});


export const listNotifications = onCall({ region: REGION }, async (request) => {
  const identity = await requireActiveIdentity(request);
  const [snapshot, account] = await Promise.all([
    accountRef(identity.uid).collection('notifications').orderBy('createdAt','desc').limit(100).get(),
    accountRef(identity.uid).get(),
  ]);
  const stored = account.data()?.notificationPreferences ?? {};
  const preferences = {
    displayMode: ['full','discreet','minimal'].includes(String(stored.displayMode ?? '')) ? String(stored.displayMode) : 'discreet',
    newReleases: stored.newReleases !== false,
    newScripts: stored.newScripts !== false,
    newArtwork: stored.newArtwork !== false,
    newFollowers: stored.newFollowers !== false,
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
    if (type === 'content' && subtype === 'new_audio') return preferences.newReleases;
    if (type === 'content' && subtype === 'new_script') return preferences.newScripts;
    if (type === 'content' && subtype === 'new_artwork') return preferences.newArtwork;
    if (type === 'follow' && subtype === 'new_follower') return preferences.newFollowers;
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
    // Admin-only task labels contain no personal or explicit content; keep them
    // actionable inside Nightjar even when device lock screens are discreet.
    if (identity.admin && item.type === 'admin_attention') return item;
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
    // Previously persisted owner-only notifications must not survive a loss of
    // admin entitlement or become visible through a regular member feed.
    .filter((item: any) => identity.admin || item.type !== 'admin_attention')
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
  const pilotAccess = identity.admin || (await accountRef(identity.uid).get()).data()?.diditPilotEnabled === true;
  const controlledAdminTestClaimed = DIDIT_VERIFICATION_PAUSED && identity.admin
    ? (await db.collection('operationalControls').doc('didit-maintenance-one-shot-2026-10-14').get()).exists
    : false;
  return {
    verified: persistentlyVerified || bypass.allowed,
    diditPilotEligible: pilotAccess,
    status: persistentlyVerified || bypass.allowed ? 'COMPLETE' : String(data.status ?? 'NOT_STARTED'),
    // The actual provider decision is separate from temporary test access.
    providerVerified: persistentlyVerified,
    providerStatus: String(data.status ?? 'NOT_STARTED'),
    livePilotAvailable: !DIDIT_VERIFICATION_PAUSED && diditConfigured() && diditMode() === 'live',
    verificationPaused: DIDIT_VERIFICATION_PAUSED,
    controlledAdminTestClaimed,
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

// Closed-beta, ONE-USE normal live KYC: a specific signed-in member may
// voluntarily start one account-bound Didit session while the public kill
// switch stays ON. This exception is NOT the owner maintenance test.
const controlledDiditRef = (uid: string) => db.collection('diditControlledChecks').doc(uid);
// Account-wide, opt-in verification rollout (staged, NOT yet deployed).
// The legacy public age-session starter stays paused; this separate route
// is available to every active, email-verified Nightjar account admitted by
// requireActiveIdentity. It never requires an old standalone Didit enquiry.
const DIDIT_ACCOUNT_SELF_SERVICE_ENABLED = true;
const accountDiditSelfServiceEligible = () =>
  DIDIT_VERIFICATION_PAUSED && DIDIT_ACCOUNT_SELF_SERVICE_ENABLED;

export const adminAuthoriseDiditControlledCheck = onCall({ region: REGION }, async request => {
  const administrator = requireAdminIdentity(request);
  const uid = cleanText((request.data ?? {}).uid, 128);
  const acknowledgedCharge = (request.data ?? {}).acknowledgedCharge === true;
  if (!DIDIT_VERIFICATION_PAUSED || !/^[a-zA-Z0-9_-]{10,128}$/.test(uid) || !acknowledgedCharge) {
    throw new HttpsError('invalid-argument', 'Select one member and explicitly acknowledge the possible real Didit verification charge.');
  }
  // This callable only grants permission; no API keys or provider sessions.
  const [authRecord, ageRecord] = await Promise.all([
    getAuth().getUser(uid),
    db.collection('ageAssurance').doc(uid).get(),
  ]);
  if (!authRecord.emailVerified || authRecord.disabled) {
    throw new HttpsError('failed-precondition','The member must have an active, email-verified Nightjar sign-in.');
  }
  if (diditPass(ageRecord.data())) {
    throw new HttpsError('failed-precondition','This member already has an accepted live 18+ result. No second check is allowed.');
  }
  const ref = controlledDiditRef(uid);
  const reuseRef = diditReuseRef(uid);
  await db.runTransaction(async tx => {
    const [grant, reuse] = await Promise.all([tx.get(ref), tx.get(reuseRef)]);
    if (grant.exists) {
      throw new HttpsError('already-exists','A controlled Didit check has already been authorised or attempted for this member. It cannot be reset by clicking again.');
    }
    if (!reuse.exists || reuse.data()?.status !== 'approved_for_reuse' ||
        reuse.data()?.memberConsent !== true) {
      throw new HttpsError('failed-precondition','An active member-consented, administrator-approved Didit enquiry is required.');
    }
    tx.create(ref, {
      uid, state:'authorised', authorisedAt:FieldValue.serverTimestamp(),
      authorisedBy:administrator.uid, acknowledgedCharge:true, attempts:0,
      source:'approved-standalone-enquiry-normal-id-check', updatedAt:FieldValue.serverTimestamp(),
    });
  });
  return { authorised:true, sessionStarted:false };
});

export const myDiditControlledCheck = onCall({ region: REGION }, async request => {
  const identity = await requireActiveIdentity(request);
  const [grant, age, reuse] = await Promise.all([
    controlledDiditRef(identity.uid).get(),
    db.collection('ageAssurance').doc(identity.uid).get(),
    diditReuseRef(identity.uid).get(),
  ]);
  const data = grant.data() ?? {};
  const selfServiceEnabled = accountDiditSelfServiceEligible();
  const providerVerified = diditPass(age.data());
  const existingAgeStatus = String(age.data()?.status ?? '');
  const existingPending = ['CREATING','PENDING','IN_PROGRESS','RESUBMITTED','PENDING_REVIEW'].includes(existingAgeStatus);
  // Never offer a second chargeable session while an earlier account-bound
  // provider check remains in progress, even if the new grant does not exist.
  let launchUrl: string | null = null;
  if (existingPending && !providerVerified) {
    const sessionId = cleanText(age.data()?.sessionId, 128);
    if (sessionId) {
      const previous = (await db.collection('diditSessions').doc(sessionId).get()).data() ?? {};
      if (previous.uid === identity.uid && previous.environment === 'live' &&
          previous.workflowId && previous.createdAtMs > Date.now() - 6 * 86400_000 &&
          ['PENDING','IN_PROGRESS','RESUBMITTED'].includes(existingAgeStatus)) {
        const candidate = cleanText(previous.url, 2048);
        try {
          const parsed = new URL(candidate);
          if (parsed.protocol === 'https:' && ['verify.didit.me','verification.didit.me'].includes(parsed.hostname)) {
            launchUrl = candidate;
          }
        } catch { /* malformed provider link: support review required */ }
      }
    }
  }
  // Viewing status is read-only: no provider request and no billable claim.
  const status = String(providerVerified && selfServiceEnabled ? 'already_verified'
    : existingPending && selfServiceEnabled ? (launchUrl ? 'session_started' : 'requires_review')
    : data.state ?? (selfServiceEnabled ? 'authorised' : 'none'));
  const authorised = !providerVerified && status === 'authorised' &&
    (selfServiceEnabled || (grant.exists &&
      reuse.data()?.status === 'approved_for_reuse' && reuse.data()?.memberConsent === true));
  return {
    authorised, state: status, providerVerified, selfServiceEnabled,
    launchUrl, publicVerificationPaused: DIDIT_VERIFICATION_PAUSED,
    // NO provider session can be started without explicit member action.
  };
});

export const startMyDiditControlledCheck = onCall({
  region: REGION, secrets: [DIDIT_API_KEY, DIDIT_WORKFLOW_ID, DIDIT_ENVIRONMENT],
  timeoutSeconds: 40, maxInstances: 2,
}, async request => {
  const identity = await requireActiveIdentity(request);
  const selfServiceEnabled = accountDiditSelfServiceEligible();
  if (!DIDIT_VERIFICATION_PAUSED || !diditConfigured() || diditMode() !== 'live' ||
      (request.data ?? {}).explicitConsent !== true) {
    throw new HttpsError('failed-precondition', 'One-use live Didit verification requires explicit member consent and configured live Didit.');
  }
  // Server-stored acceptance, never a client-side checkbox alone.
  await requireCurrentLegalAcceptance(identity.uid, 'age_assurance_notice');
  const ageRef = db.collection('ageAssurance').doc(identity.uid);
  if (diditPass((await ageRef.get()).data())) return { verified:true, provider:'didit' };
  const grantRef = controlledDiditRef(identity.uid);
  const requestRef = diditReuseRef(identity.uid);
  await db.runTransaction(async tx => {
    const [grant, consent, age] = await Promise.all([
      tx.get(grantRef), tx.get(requestRef), tx.get(ageRef),
    ]);
    if (diditPass(age.data())) {
      throw new HttpsError('already-exists','Didit verification is already approved for this account. Refresh status.');
    }
    if (['CREATING','PENDING','IN_PROGRESS','RESUBMITTED','PENDING_REVIEW'].includes(String(age.data()?.status ?? ''))) {
      throw new HttpsError('failed-precondition','An earlier Didit check for this account is already active or awaiting review. Resume it or contact support; no second check was started.');
    }
    // Prior reuse reviews are no longer prerequisites for normal account
    // verification. Existing invitation-based checks retain their fallback
    // consent guard only when self-service is disabled.
    if (!selfServiceEnabled && (consent.data()?.status !== 'approved_for_reuse' ||
        consent.data()?.memberConsent !== true)) {
      throw new HttpsError('failed-precondition','Your approved Didit enquiry is unavailable or consent has been withdrawn. No check was started.');
    }
    if (grant.exists && (grant.data()?.state !== 'authorised' || grant.data()?.attempts !== 0)) {
      throw new HttpsError('failed-precondition','This account already claimed its one live Didit attempt. Contact support; no second check was started.');
    }
    if (!grant.exists && !selfServiceEnabled) {
      throw new HttpsError('failed-precondition','Account self-service Didit verification is currently unavailable.');
    }
    // Durable claim BEFORE contacting Didit. A second tab, timeout or error
    // cannot create another billable attempt for this account.
    if (!grant.exists) {
      tx.create(grantRef, {
        uid:identity.uid, state:'claimed', attempts:1,
        authorisedAt:FieldValue.serverTimestamp(), authorisedBy:'self-service-user',
        source:'direct-account-self-service-normal-id-check', acknowledgedCharge:true,
        claimedAt:FieldValue.serverTimestamp(), updatedAt:FieldValue.serverTimestamp(),
      });
    } else {
      tx.update(grantRef, {
        state:'claimed', attempts:1, claimedAt:FieldValue.serverTimestamp(),
        updatedAt:FieldValue.serverTimestamp(),
      });
    }
  });
  try {
    const result = await startDiditSession(identity.uid);
    const returned = result as Record<string, any>;
    await grantRef.set({
      state: returned.verified === true ? 'already_verified' : 'session_started',
      providerSessionId: cleanText(returned.sessionId, 128) || null,
      updatedAt:FieldValue.serverTimestamp(),
    }, { merge:true });
    return result;
  } catch {
    // Do not release the claim: Didit might have received a chargeable
    // request even if Nightjar timed out before receiving its response.
    await grantRef.set({
      state:'requires_review', updatedAt:FieldValue.serverTimestamp(),
    }, { merge:true });
    throw new HttpsError('unavailable','Nightjar could not confirm whether Didit started the one-use check. Please contact support; do NOT retry or start a second check.');
  }
});

// Reusable KYC preparation: validate the actual historic provider decision
// and a separate published, zero-cost reuse workflow BEFORE allowing members
// to authenticate. These calls never create Didit sessions or grant age access.
// The source session is kept privately in Firestore and never returned to clients.
const DIDIT_REUSE_CONTROL = 'didit-reuse-readiness-2026-10-15';
const diditUuid = (value: unknown) => {
  const valueString = cleanText(value, 48);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(valueString) ? valueString : '';
};

export const adminInspectDiditReuseWorkflow = onCall({
  region: REGION,
  secrets: [DIDIT_API_KEY, DIDIT_ENVIRONMENT],
  timeoutSeconds: 25,
}, async request => {
  const identity = requireAdminIdentity(request);
  const id = diditUuid((request.data ?? {}).workflowId);
  if (!DIDIT_VERIFICATION_PAUSED || diditMode() !== 'live' || !id) {
    throw new HttpsError('failed-precondition','Use a valid live Didit Reusable KYC workflow ID during maintenance.');
  }
  // Only a fixed Didit-hosted HTTPS URL is ever contacted, avoiding SSRF.
  let workflow: Record<string, any>;
  try {
    const response = await fetch('https://verification.didit.me/v3/workflows/' + encodeURIComponent(id) + '/', {
      method: 'GET', headers: { 'x-api-key': DIDIT_API_KEY.value(), Accept: 'application/json' },
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) throw Error('Didit workflow lookup failed');
    workflow = await response.json() as Record<string, any>;
  } catch {
    throw new HttpsError('unavailable','Could not inspect Didit workflow settings. No verification session was created.');
  }
  const kind = cleanText(workflow.workflow_type, 70).toLowerCase();
  const label = cleanText(workflow.workflow_label, 100);
  const isPublished = workflow.status === 'published' && workflow.is_archived !== true;
  const free = typeof workflow.total_price === 'number' && workflow.total_price === 0 &&
    (workflow.min_price === undefined || workflow.min_price === 0) &&
    (workflow.max_price === undefined || workflow.max_price === 0);
  const isReuse = kind.includes('reusable') || kind === 'reusable_kyc';
  const safeShape = isReuse && workflow.is_liveness_enabled === true &&
    workflow.is_face_match_enabled === true && workflow.is_simple_workflow !== true;
  const valid = workflow.uuid === id && isPublished && free && safeShape;
  // A free workflow alone does not prove that its returned result identifies
  // the ORIGINAL standalone session. Keep launches blocked until a documented
  // provider-authenticated source-session binding is implemented and tested.
  const controlRef = db.collection('operationalControls').doc(DIDIT_REUSE_CONTROL);
  await controlRef.set({
    workflowId: id, workflowLabel: label, workflowType: kind,
    published: isPublished, zeroCostConfirmed: free, reusableShapeConfirmed: safeShape,
    inspectedAt: FieldValue.serverTimestamp(), inspectedBy: identity.uid,
    sessionLaunchEnabled: false, providerSourceBindingConfirmed: false,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  return {
    workflowRecognised: valid, published: isPublished, zeroCostConfirmed: free,
    reusableShapeConfirmed: safeShape, workflowLabel: label,
    sessionLaunchEnabled: false,
    nextStep: valid
      ? 'Free workflow recognised. Configure authenticated original-session binding before starting a member selfie check.'
      : 'The workflow is not independently confirmed as a published, free Reusable KYC flow. No session can start.',
  };
});

export const adminBindExistingDiditSource = onCall({
  region: REGION,
  secrets: [DIDIT_API_KEY, DIDIT_ENVIRONMENT],
  timeoutSeconds: 25,
}, async request => {
  const identity = requireAdminIdentity(request);
  const uid = cleanText((request.data ?? {}).uid, 128);
  const sessionId = diditUuid((request.data ?? {}).sessionId);
  if (!DIDIT_VERIFICATION_PAUSED || diditMode() !== 'live' ||
      !/^[a-zA-Z0-9_-]{10,128}$/.test(uid) || !sessionId) {
    throw new HttpsError('invalid-argument','Valid member and existing Didit session IDs are required.');
  }
  const ref = diditReuseRef(uid);
  const current = (await ref.get()).data() ?? {};
  if (current.memberConsent !== true || current.status !== 'approved_for_reuse') {
    throw new HttpsError('failed-precondition','Only an approved and explicitly consented member reuse request can be inspected.');
  }
  const old = (await db.collection('diditSessions').doc(sessionId).get()).data();
  if (old?.uid && old.uid !== uid) {
    throw new HttpsError('failed-precondition','This session is already bound to a different Nightjar account.');
  }

  let decision: Record<string, any>;
  try {
    const response = await fetch('https://verification.didit.me/v3/session/' + encodeURIComponent(sessionId) + '/decision/', {
      method: 'GET', headers: { 'x-api-key': DIDIT_API_KEY.value(), Accept: 'application/json' },
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) throw Error('Didit session lookup failed');
    decision = await response.json() as Record<string, any>;
  } catch {
    throw new HttpsError('unavailable','Nightjar could not read the prior Didit result. No identity status was changed.');
  }
  if (decision.session_id !== sessionId || decision.environment !== 'live' ||
      decision.session_kind !== 'user' || decision.status !== 'Approved' ||
      !verifiedAdultFromDecision(decision) ||
      !Array.isArray(decision.liveness_checks) ||
      !decision.liveness_checks.some((item: any) => item?.status === 'Approved')) {
    throw new HttpsError('failed-precondition','The original provider session does not contain the required live approved 18+ identity evidence.');
  }
  const sourceRef = db.collection('diditReuseSourceClaims').doc(sessionId);
  await db.runTransaction(async tx => {
    const [requestSnap,sourceSnap]=await Promise.all([tx.get(ref),tx.get(sourceRef)]);
    if (requestSnap.data()?.status !== 'approved_for_reuse' ||
        requestSnap.data()?.memberConsent !== true ||
        (sourceSnap.exists && sourceSnap.data()?.uid !== uid)) {
      throw new HttpsError('failed-precondition','This source is already assigned or the member withdrew consent.');
    }
    const previous = cleanText(requestSnap.data()?.sourceSessionId, 128);
    if (previous && previous !== sessionId) {
      throw new HttpsError('failed-precondition','A different source is already associated with this request. Contact support.');
    }
    tx.set(sourceRef, { uid, claimedAt: FieldValue.serverTimestamp(), claimedBy: identity.uid }, { merge: true });
    tx.set(ref, {
      sourceSessionId: sessionId,
      originalAdultEvidenceCheckedAt: FieldValue.serverTimestamp(),
      originalAdultEvidenceConfirmed: true,
      updatedAt: FieldValue.serverTimestamp(),
      publicNote: 'Your prior live Didit 18+ approval has been located. Nightjar is preparing secure provider-confirmed identity reuse. No new identity check is available yet.',
    }, { merge: true });
  });
  return {
    existingApprovalFound: true,
    sourceUniquelyReserved: true,
    memberVerified: false,
    nextStep: 'Provider-confirmed identity reuse is still required. No new Didit check was started.',
  };
});

export const adminDiditReuseReadiness = onCall({
  region: REGION,
}, async request => {
  requireAdminIdentity(request);
  const ref = db.collection('operationalControls').doc(DIDIT_REUSE_CONTROL);
  const data = (await ref.get()).data() ?? {};
  return {
    workflowRecognised: Boolean(data.published && data.zeroCostConfirmed && data.reusableShapeConfirmed),
    workflowLabel: cleanText(data.workflowLabel, 100) || null,
    published: data.published === true,
    zeroCostConfirmed: data.zeroCostConfirmed === true,
    reusableShapeConfirmed: data.reusableShapeConfirmed === true,
    sessionLaunchEnabled: false,
    providerSourceBindingConfirmed: false,
    publicVerificationPaused: DIDIT_VERIFICATION_PAUSED,
  };
});

// Existing Didit KYC reuse coordination during the production verification pause.
// A consented support request is NOT identity proof and cannot grant age access.
// Reuse approval must later come from an authenticated, account-bound Didit flow.
const diditReuseRef = (uid: string) => db.collection('diditReuseRequests').doc(uid);
type DiditReuseState = 'requested' | 'investigating' | 'waiting_for_member' | 'approved_for_reuse' | 'closed';
export const myDiditReuseRequest = onCall({ region: REGION }, async request => {
  const identity = await requireActiveIdentity(request);
  const data = (await diditReuseRef(identity.uid).get()).data() ?? {};
  return {
    status: ['requested','investigating','waiting_for_member','approved_for_reuse','closed'].includes(String(data.status))
      ? data.status as DiditReuseState : 'none',
    requestedAt: toIso(data.requestedAt),
    updatedAt: toIso(data.updatedAt),
    note: cleanText(data.publicNote, 280) || null,
    publicVerificationPaused: DIDIT_VERIFICATION_PAUSED,
  };
});

export const requestDiditReuse = onCall({ region: REGION }, async request => {
  const identity = await requireActiveIdentity(request);
  const input = (request.data ?? {}) as { consent?: unknown; previousCheck?: unknown };
  if (input.consent !== true || input.previousCheck !== 'standalone') {
    throw new HttpsError('invalid-argument', 'You must explicitly consent to request reuse of your earlier Didit identity check.');
  }
  if (!DIDIT_VERIFICATION_PAUSED) {
    throw new HttpsError('failed-precondition', 'Use Nightjar\'s normal account-linked Didit verification when the provider is available.');
  }
  const age = (await db.collection('ageAssurance').doc(identity.uid).get()).data();
  if (diditPass(age)) return { status: 'already_verified' };
  const ref = diditReuseRef(identity.uid);
  const state = await db.runTransaction(async tx => {
    const current = (await tx.get(ref)).data() ?? {};
    if (['requested','investigating','waiting_for_member','approved_for_reuse'].includes(String(current.status))) {
      return current.status as DiditReuseState;
    }
    tx.set(ref, {
      uid: identity.uid,
      emailMasked: maskSecurityEmail(identity.email),
      status: 'requested',
      previousCheck: 'standalone',
      memberConsent: true,
      requestedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      publicNote: 'Our team will review how to connect your previous Didit approval securely. Do not repeat your identity check.',
    });
    return 'requested';
  });
  return { status: state };
});

export const withdrawDiditReuseRequest = onCall({ region: REGION }, async request => {
  const identity = await requireActiveIdentity(request);
  const ref = diditReuseRef(identity.uid);
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.data()?.status === 'closed') return;
    tx.set(ref, {
      status: 'closed', memberConsent: false,
      publicNote: 'You withdrew your request to reuse your previous Didit verification.',
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });
  return { status: 'closed' };
});

export const adminListDiditReuseRequests = onCall({ region: REGION }, async request => {
  requireAdminIdentity(request);
  const snapshot = await db.collection('diditReuseRequests').orderBy('requestedAt', 'desc').limit(80).get();
  return { requests: snapshot.docs.map(doc => {
    const item = doc.data();
    return {
      uid: doc.id,
      emailMasked: cleanText(item.emailMasked, 90),
      status: ['requested','investigating','waiting_for_member','approved_for_reuse','closed'].includes(String(item.status))
        ? item.status as DiditReuseState : 'closed',
      requestedAt: toIso(item.requestedAt),
      updatedAt: toIso(item.updatedAt),
    };
  }) };
});

export const adminReviewDiditReuseRequest = onCall({ region: REGION }, async request => {
  const identity = requireAdminIdentity(request);
  const input = (request.data ?? {}) as { uid?: unknown; status?: unknown };
  const uid = cleanText(input.uid, 128);
  const status = cleanText(input.status, 50);
  if (!/^[a-zA-Z0-9_-]{10,128}$/.test(uid) ||
      !['investigating','waiting_for_member','approved_for_reuse','closed'].includes(status)) {
    throw new HttpsError('invalid-argument','Invalid reuse request or review action.');
  }
  const ref = diditReuseRef(uid);
  await db.runTransaction(async tx => {
    const current = await tx.get(ref);
    if (!current.exists || current.data()?.memberConsent !== true) {
      throw new HttpsError('failed-precondition', 'An active member-consented reuse request is required.');
    }
    if (current.data()?.status === 'closed') {
      throw new HttpsError('failed-precondition', 'This enquiry is closed. The member must submit a fresh consented request.');
    }
    // Approval is permission for the member to proceed with Didit's own
    // reuse/ownership-confirmation process. It never grants verified-adult status.
    tx.set(ref, {
      status,
      updatedAt: FieldValue.serverTimestamp(),
      lastReviewedBy: identity.uid,
      publicNote: status === 'investigating'
        ? 'Nightjar is checking your existing Didit request. No new identity check has started.'
        : status === 'waiting_for_member'
          ? 'Identity confirmation is required before your previous Didit approval can be linked. Nightjar support must provide the secure next steps; no automatic message or check has been sent.'
          : status === 'approved_for_reuse'
            ? 'Nightjar approved your request to proceed with secure Didit reuse. Your account is NOT yet verified 18+; Didit must still confirm ownership and 18+ evidence before access is granted.'
            : 'Your reuse enquiry was closed without changing your account verification. Contact support if you still need assistance.',
      ...(status === 'approved_for_reuse' ? {
        reuseRequestApprovedAt: FieldValue.serverTimestamp(),
        reuseRequestApprovedBy: identity.uid,
      } : {}),
      ...(status === 'closed' ? { memberConsent: false } : {}),
    }, { merge: true });
  });
  return { status };
});

// One-off owner recovery of an already-completed, account-bound live Didit
// verification. This GET-only provider check does not initiate an ID session,
// skip age validation, accept client-supplied session IDs, or trust stale events.
// The existing one-shot maintenance claim restricts use to the test owner.
export const adminReconcileDiditApproval = onCall({
  region: REGION,
  secrets: [DIDIT_API_KEY, DIDIT_WORKFLOW_ID, DIDIT_ENVIRONMENT],
  timeoutSeconds: 30,
  maxInstances: 2,
}, async (request) => {
  const identity = requireAdminIdentity(request);
  if (!DIDIT_VERIFICATION_PAUSED || !diditConfigured() || diditMode() !== 'live') {
    throw new HttpsError('failed-precondition', 'Didit maintenance recovery is not available in this environment.');
  }

  const claimRef = db.collection('operationalControls').doc('didit-maintenance-one-shot-2026-10-14');
  const ageRef = db.collection('ageAssurance').doc(identity.uid);
  const [claimSnap, ageSnap] = await Promise.all([claimRef.get(), ageRef.get()]);
  if (!claimSnap.exists || claimSnap.data()?.initiatedByUid !== identity.uid) {
    throw new HttpsError('permission-denied', 'Only the administrator who claimed the existing maintenance test may reconcile it.');
  }
  const currentAge = ageSnap.data() ?? {};
  if (diditPass(currentAge)) return { verified: true, outcome: 'already_verified' };
  const sessionId = cleanText(currentAge.sessionId, 128);
  if (!sessionId || currentAge.provider !== 'didit' || currentAge.environment !== 'live' ||
      !['PENDING', 'IN_PROGRESS', 'RESUBMITTED'].includes(String(currentAge.status))) {
    throw new HttpsError('failed-precondition', 'No eligible pending live Didit session is linked to your account.');
  }
  const sessionRef = db.collection('diditSessions').doc(sessionId);
  const session = (await sessionRef.get()).data() ?? {};
  if (session.uid !== identity.uid || session.environment !== 'live' ||
      session.workflowId !== DIDIT_WORKFLOW_ID.value()) {
    throw new HttpsError('failed-precondition', 'The stored Didit session does not match the current Nightjar account and live workflow.');
  }
  const claimedAtMs = claimSnap.data()?.createdAt?.toMillis?.();
  if (!Number.isFinite(claimedAtMs) || !Number.isFinite(session.createdAtMs) ||
      session.createdAtMs < claimedAtMs - 60000) {
    throw new HttpsError('failed-precondition', 'The stored session was not created for this controlled maintenance test.');
  }

  // Didit's authenticated read API is the source of truth when a signed
  // historical webhook was rejected and cannot pass the freshness window.
  // Never log the response: it contains DOB, IDs, images and personal data.
  let decision: Record<string, any>;
  try {
    const response = await fetch(
      'https://verification.didit.me/v3/session/' + encodeURIComponent(sessionId) + '/decision/',
      {
        method: 'GET',
        headers: { 'x-api-key': DIDIT_API_KEY.value(), Accept: 'application/json' },
        signal: AbortSignal.timeout(15000),
      },
    );
    if (!response.ok) throw new Error('Didit read API unavailable');
    decision = await response.json() as Record<string, any>;
  } catch {
    throw new HttpsError('unavailable', 'Nightjar could not obtain the existing Didit decision. No new identity check was started.');
  }

  if (!decision || typeof decision !== 'object' || Array.isArray(decision) ||
      decision.session_id !== sessionId || decision.vendor_data !== identity.uid ||
      decision.workflow_id !== session.workflowId || decision.session_kind !== 'user' ||
      decision.environment !== 'live' ||
      (session.applicationId && decision.application_id != null &&
        decision.application_id !== session.applicationId)) {
    throw new HttpsError('failed-precondition', 'The Didit response could not be securely matched to the existing Nightjar session.');
  }
  if (!['Approved', 'APPROVED'].includes(String(decision.status))) {
    return { verified: false, outcome: 'provider_not_approved' };
  }
  if (!verifiedAdultFromDecision(decision)) {
    throw new HttpsError('failed-precondition', 'Didit did not provide sufficient approved 18+ documentary evidence for this session.');
  }

  // Write only an opaque audit marker and verified-age status. Raw Didit
  // decisions, DOB, biometrics, document data and session URLs remain unpersisted.
  const previousEventTime = Number(currentAge.diditEventCreatedAt ?? 0);
  const reconciled = await db.runTransaction(async tx => {
    const [ageNowSnap, sessionNowSnap, claimNowSnap] = await Promise.all([
      tx.get(ageRef), tx.get(sessionRef), tx.get(claimRef),
    ]);
    const ageNow = ageNowSnap.data() ?? {};
    const sessionNow = sessionNowSnap.data() ?? {};
    if (diditPass(ageNow)) return false;
    if (claimNowSnap.data()?.initiatedByUid !== identity.uid ||
        ageNow.sessionId !== sessionId || ageNow.provider !== 'didit' ||
        ageNow.environment !== 'live' || sessionNow.uid !== identity.uid ||
        sessionNow.environment !== 'live' || sessionNow.workflowId !== session.workflowId ||
        Number(ageNow.diditEventCreatedAt ?? 0) !== previousEventTime ||
        !['PENDING', 'IN_PROGRESS', 'RESUBMITTED'].includes(String(ageNow.status))) {
      throw new HttpsError('aborted', 'Nightjar verification changed during reconciliation. Refresh the current status.');
    }
    tx.set(ageRef, {
      provider: 'didit', environment: 'live', status: 'COMPLETE',
      verified: true, reverifyRequired: false, testMode: false,
      verifiedAt: FieldValue.serverTimestamp(),
      diditEventCreatedAt: Math.floor(Date.now() / 1000),
      verificationEvidenceSource: 'didit-authenticated-session-read',
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    tx.set(sessionRef, { status: 'Approved', updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    tx.set(claimRef, {
      reconciledAt: FieldValue.serverTimestamp(),
      reconciliationMethod: 'didit-authenticated-session-read',
    }, { merge: true });
    return true;
  });
  return { verified: true, outcome: reconciled ? 'reconciled' : 'already_verified' };
});

// Member-initiated recovery of the EXISTING Nightjar-linked Didit decision.
// GET-only at Didit: never creates, retries or charges a new ID session.
// Required because a completed provider screen does not guarantee that a signed
// webhook was delivered, accepted and processed by Nightjar.
export const reconcileMyDiditVerification = onCall({
  region: REGION,
  secrets: [DIDIT_API_KEY, DIDIT_WORKFLOW_ID, DIDIT_ENVIRONMENT],
  timeoutSeconds: 30,
  maxInstances: 2,
}, async request => {
  const identity = await requireActiveIdentity(request);
  if (!diditConfigured() || diditMode() !== 'live') {
    throw new HttpsError('failed-precondition', 'Live Didit reconciliation is unavailable.');
  }
  // The caller never provides a session ID, target UID, workflow or URL.
  const ageRef = db.collection('ageAssurance').doc(identity.uid);
  const age = (await ageRef.get()).data() ?? {};
  if (diditPass(age)) return { verified: true, outcome: 'already_verified' };
  const sessionId = cleanText(age.sessionId, 128);
  if (!sessionId || age.provider !== 'didit' || age.environment !== 'live' ||
      !['PENDING','PROCESSING','IN_PROGRESS','RESUBMITTED','PENDING_REVIEW'].includes(String(age.status))) {
    return { verified: false, outcome: 'no_reconcilable_session' };
  }
  const sessionRef = db.collection('diditSessions').doc(sessionId);
  const session = (await sessionRef.get()).data() ?? {};
  if (session.uid !== identity.uid || session.environment !== 'live' ||
      session.workflowId !== DIDIT_WORKFLOW_ID.value() ||
      !Number.isFinite(session.createdAtMs) ||
      session.createdAtMs > Date.now() + 60_000) {
    throw new HttpsError('failed-precondition',
      'Nightjar cannot match this session to your account. Contact support; do not start another check.');
  }

  // Only inspect the existing provider decision; never store or log its ID,
  // birth date, biometric media, full payload or session URL.
  let decision: Record<string, any>;
  try {
    const response = await fetch(
      'https://verification.didit.me/v3/session/' + encodeURIComponent(sessionId) + '/decision/',
      {
        method: 'GET',
        headers: { 'x-api-key': DIDIT_API_KEY.value(), Accept: 'application/json' },
        signal: AbortSignal.timeout(15000),
      },
    );
    if (!response.ok) throw new Error('Could not read current Didit decision');
    decision = await response.json() as Record<string, any>;
  } catch {
    throw new HttpsError('unavailable',
      'Nightjar could not retrieve your existing Didit result. No new ID check was started.');
  }
  if (!decision || typeof decision !== 'object' || Array.isArray(decision) ||
      decision.session_id !== sessionId || decision.vendor_data !== identity.uid ||
      decision.workflow_id !== session.workflowId || decision.session_kind !== 'user' ||
      decision.environment !== 'live' ||
      (session.applicationId && decision.application_id !== session.applicationId)) {
    throw new HttpsError('failed-precondition',
      'The Didit result could not be securely bound to your Nightjar account. Contact support.');
  }
  if (!['Approved','APPROVED'].includes(String(decision.status))) {
    return { verified: false, outcome: 'provider_not_approved' };
  }
  if (!verifiedAdultFromDecision(decision)) {
    return { verified: false, outcome: 'adult_evidence_missing' };
  }

  // Transactional binding and event-version checks prevent stale or replaced
  // sessions overriding a newer or revoked provider state.
  const previousEventTime = Number(age.diditEventCreatedAt ?? 0);
  const reconciled = await db.runTransaction(async tx => {
    const [ageSnap, sessionSnap] = await Promise.all([tx.get(ageRef), tx.get(sessionRef)]);
    const ageNow = ageSnap.data() ?? {};
    const sessionNow = sessionSnap.data() ?? {};
    if (diditPass(ageNow)) return false;
    if (ageNow.sessionId !== sessionId || ageNow.provider !== 'didit' ||
        ageNow.environment !== 'live' || sessionNow.uid !== identity.uid ||
        sessionNow.environment !== 'live' || sessionNow.workflowId !== session.workflowId ||
        sessionNow.applicationId !== session.applicationId ||
        Number(ageNow.diditEventCreatedAt ?? 0) !== previousEventTime ||
        !['PENDING','IN_PROGRESS','RESUBMITTED','PENDING_REVIEW'].includes(String(ageNow.status))) {
      throw new HttpsError('aborted',
        'The linked Didit result changed. Refresh your status; do not start another ID check.');
    }
    tx.set(ageRef, {
      provider:'didit', environment:'live', status:'COMPLETE',
      verified:true, reverifyRequired:false, testMode:false,
      verifiedAt:FieldValue.serverTimestamp(),
      diditEventCreatedAt:Math.floor(Date.now() / 1000),
      verificationEvidenceSource:'didit-authenticated-session-read',
      updatedAt:FieldValue.serverTimestamp(),
    }, { merge:true });
    tx.set(sessionRef, { status:'Approved', updatedAt:FieldValue.serverTimestamp() }, { merge:true });
    return true;
  });
  return { verified: true, outcome: reconciled ? 'reconciled' : 'already_verified' };
});

// Owner-only read-only evidence trail. This never contacts Didit, changes
// verification, creates a chargeable session, or exposes sensitive KYC material.
export const adminDiditDiagnostics = onCall({ region: REGION }, async (request) => {
  const identity = requireAdminIdentity(request);
  const age = (await db.collection('ageAssurance').doc(identity.uid).get()).data() ?? {};
  const sessionId = cleanText(age.sessionId, 128);
  const claimed = await db.collection('operationalControls')
    .doc('didit-maintenance-one-shot-2026-10-14').get();
  const session = sessionId
    ? (await db.collection('diditSessions').doc(sessionId).get()).data() ?? {}
    : {};
  const sessionBound = Boolean(sessionId && session.uid === identity.uid);
  // Only status/data events can grant a verified-adult result. All receipts
  // were already signature-validated by diditWebhook before Firestore storage.
  const receipts = sessionBound
    ? await db.collection('diditWebhookEvents').where('sessionId', '==', sessionId).limit(30).get()
    : null;
  const events = (receipts?.docs ?? [])
    .map((doc) => doc.data())
    .filter((event) => ['status.updated', 'data.updated'].includes(String(event.webhookType)))
    .sort((a, b) => Number(b.receivedAt?.toMillis?.() ?? 0) - Number(a.receivedAt?.toMillis?.() ?? 0));
  const latest = events[0];
  const verified = diditPass(age);
  const receiptAccepted = Boolean(latest);
  const processed = Boolean(latest?.processedAt);
  const ignored = latest?.ignored === true;
  const adultEvidence = latest?.adultEvidence === true;
  const decisionStatus = cleanText(latest?.status, 40) || null;
  const outcome = verified ? 'verified'
    : !sessionId ? 'no_account_session'
    : !sessionBound ? 'session_binding_missing'
    : !receiptAccepted ? 'awaiting_signed_webhook'
    : !processed ? 'webhook_waiting_for_processing'
    : ignored ? 'webhook_ignored_or_superseded'
    : decisionStatus === 'Approved' && !adultEvidence ? 'adult_evidence_missing'
    : 'provider_result_not_verified';
  return {
    outcome,
    providerVerified: verified,
    verificationEvidenceSource: cleanText(age.verificationEvidenceSource, 80) || (verified ? 'signed-didit-webhook' : null),
    oneShotClaimed: claimed.exists,
    accountProviderStatus: cleanText(age.status, 40) || 'NOT_STARTED',
    sessionRecorded: Boolean(sessionId),
    sessionBound,
    sessionProviderStatus: cleanText(session.status, 40) || null,
    signedWebhookReceived: receiptAccepted,
    webhookProcessed: processed,
    webhookIgnored: ignored,
    webhookStatus: decisionStatus,
    // No DOB, ID, selfie, vendor_data, token, session URL or session identifier.
    adultEvidenceConfirmed: adultEvidence,
    lastWebhookReceivedAt: latest?.receivedAt?.toDate?.()?.toISOString?.() ?? null,
    lastWebhookProcessedAt: latest?.processedAt?.toDate?.()?.toISOString?.() ?? null,
    publicVerificationPaused: DIDIT_VERIFICATION_PAUSED,
  };
});

export const startAgeAssurance = onCall({
  region: REGION, secrets: [DIDIT_API_KEY, DIDIT_WORKFLOW_ID, DIDIT_ENVIRONMENT],
}, async request => {
  const identity = await requireActiveIdentity(request);
  // The public shutdown stays ON. During maintenance, only an authenticated
  // administrator explicitly requesting the one-shot test may proceed.
  // Old clients, ordinary members, and tester-pilot accounts all fail closed.
  const requestedControlledAdminTest = (request.data as { controlledAdminTest?: unknown } | undefined)?.controlledAdminTest === true;
  const controlledAdminTest = DIDIT_VERIFICATION_PAUSED && identity.admin && requestedControlledAdminTest;
  if (DIDIT_VERIFICATION_PAUSED && !controlledAdminTest) throw new HttpsError('failed-precondition',
    'Didit age verification is temporarily unavailable while Nightjar resolves a technical issue. Please do not retry. No new check was started.');
  const record = (await db.collection('ageAssurance').doc(identity.uid).get()).data() ?? {};
  if (diditPass(record)) return { verified: true, status: 'COMPLETE', configured: true, provider: 'didit', environment: 'live' };
  if (diditConfigured()) {
    // A versioned, account-owned notice acknowledgement is required even for
    // owner-led live pilots. Do not allow a deployed old starter to skip it.
    await requireCurrentLegalAcceptance(identity.uid, 'age_assurance_notice');
    if (controlledAdminTest) {
      // A single, account-bound live test for the entire outage. Claim the
      // attempt BEFORE provider contact to avoid repeat billable sessions from
      // retries, cached clients, other admins, or multiple browser tabs.
      if (diditMode() !== 'live') throw new HttpsError('failed-precondition', 'Controlled Didit test requires a live provider configuration.');
      const testGuard = db.collection('operationalControls').doc('didit-maintenance-one-shot-2026-10-14');
      await db.runTransaction(async transaction => {
        const existingTest = await transaction.get(testGuard);
        if (existingTest.exists) throw new HttpsError('resource-exhausted',
          'The one-time Didit maintenance test has already been claimed. Contact Nightjar support before another attempt.');
        transaction.create(testGuard, {
          initiatedByUid: identity.uid,
          scope: 'admin-live-didit-single-attempt',
          createdAt: FieldValue.serverTimestamp(),
        });
      });
    }
    const individuallyApprovedPilot = !identity.admin &&
      (await accountRef(identity.uid).get()).data()?.diditPilotEnabled === true;
    if (DIDIT_LIVE_PILOT_ADMINS_ONLY && !identity.admin && !individuallyApprovedPilot) {
      // Regular beta testers keep their bypass and never start billable sessions.
      const bypass = await temporaryAgeBypassFor(identity.uid);
      if (bypass.allowed) return {
        verified: true, status: 'COMPLETE', configured: true,
        provider: 'temporary-test-access', environment: 'development',
        temporaryBypass: true, temporaryBypassReason: bypass.reason,
      };
      throw new HttpsError('permission-denied', 'Live Didit verification is limited to administrators and explicitly enrolled pilot testers.');
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

// One explicitly authorised, user-initiated normal live Didit check for the
// administrator whose earlier standalone setup test did not bind to Nightjar.
// Global/public verification remains paused. This uses the existing standard
// ID + liveness workflow and the existing signed-webhook verification rules.
const MEG_DIDIT_MAINTENANCE_EMAIL = 'megan.wright666@hotmail.com';
const MEG_DIDIT_MAINTENANCE_CONTROL = 'didit-meg-one-live-check-2026-10-15';
const isMegDiditMaintenanceMember = (identity: { admin: boolean; email: string }) =>
  identity.admin && cleanEmail(identity.email) === MEG_DIDIT_MAINTENANCE_EMAIL;

const megMaintenanceSession = async (uid: string, age: Record<string, any>) => {
  const sessionId = cleanText(age.sessionId, 128);
  if (!sessionId || age.provider !== 'didit' || age.environment !== 'live') return null;
  const previous = (await db.collection('diditSessions').doc(sessionId).get()).data() ?? {};
  if (previous.uid !== uid || previous.workflowId !== DIDIT_WORKFLOW_ID.value() ||
      previous.environment !== 'live' || !Number.isFinite(previous.createdAtMs) ||
      previous.createdAtMs < Date.now() - 6 * 86400_000) return null;
  const launchUrl = cleanText(previous.url, 2048);
  try {
    const url = new URL(launchUrl);
    if (url.protocol !== 'https:' || !['verify.didit.me','verification.didit.me'].includes(url.hostname)) return null;
  } catch { return null; }
  return { sessionId, launchUrl, status: String(age.status ?? 'PENDING') };
};

export const singleMemberDiditMaintenanceStatus = onCall({
  region: REGION, secrets: [DIDIT_WORKFLOW_ID, DIDIT_ENVIRONMENT],
}, async request => {
  const identity = await requireActiveIdentity(request);
  if (!isMegDiditMaintenanceMember(identity)) {
    return { eligible: false, checkAvailable: false, alreadyClaimed: false, providerVerified: false,
      existingSession: false, sessionLaunchUrl: null as string | null, reason: 'not_invited' };
  }
  const [reuseSnap, ageSnap, guardSnap] = await Promise.all([
    db.collection('diditReuseRequests').doc(identity.uid).get(),
    db.collection('ageAssurance').doc(identity.uid).get(),
    db.collection('operationalControls').doc(MEG_DIDIT_MAINTENANCE_CONTROL).get(),
  ]);
  const age = ageSnap.data() ?? {};
  const approvedRequest = reuseSnap.data()?.status === 'approved_for_reuse' && reuseSnap.data()?.memberConsent === true;
  const verified = diditPass(age);
  const claimed = guardSnap.exists;
  const ownedSession = claimed && guardSnap.data()?.initiatedByUid === identity.uid
    ? await megMaintenanceSession(identity.uid, age) : null;
  const checkAvailable = DIDIT_VERIFICATION_PAUSED && diditMode() === 'live' &&
    approvedRequest && !verified && !claimed &&
    !(['PENDING','IN_PROGRESS','CREATING','PENDING_REVIEW','RESUBMITTED'].includes(String(age.status)) && age.sessionId);
  return {
    eligible: approvedRequest || verified || claimed,
    checkAvailable: Boolean(checkAvailable),
    alreadyClaimed: claimed,
    providerVerified: verified,
    existingSession: Boolean(ownedSession),
    sessionLaunchUrl: ownedSession?.launchUrl ?? null,
    reason: verified ? 'verified' : !approvedRequest ? 'request_not_approved'
      : claimed ? ownedSession ? 'session_created' : 'one_attempt_claimed'
      : checkAvailable ? 'ready' : 'not_ready',
  };
});

export const startSingleMemberDiditMaintenanceCheck = onCall({
  region: REGION,
  secrets: [DIDIT_API_KEY, DIDIT_WORKFLOW_ID, DIDIT_ENVIRONMENT],
  timeoutSeconds: 30, maxInstances: 2,
}, async request => {
  const identity = await requireActiveIdentity(request);
  if (!isMegDiditMaintenanceMember(identity) ||
      !DIDIT_VERIFICATION_PAUSED || !DIDIT_LIVE_PILOT_ADMINS_ONLY ||
      !diditConfigured() || diditMode() !== 'live') {
    throw new HttpsError('permission-denied', 'This controlled verification is not available for this account.');
  }
  if ((request.data as { consentsToNewPaidCheck?: unknown } | undefined)?.consentsToNewPaidCheck !== true) {
    throw new HttpsError('invalid-argument', 'Explicit consent to the new live ID check is required.');
  }
  await requireCurrentLegalAcceptance(identity.uid, 'age_assurance_notice');
  const ageRef = db.collection('ageAssurance').doc(identity.uid);
  const requestRef = db.collection('diditReuseRequests').doc(identity.uid);
  const guardRef = db.collection('operationalControls').doc(MEG_DIDIT_MAINTENANCE_CONTROL);
  const [ageSnap, requestSnap, guardSnap] = await Promise.all([
    ageRef.get(), requestRef.get(), guardRef.get(),
  ]);
  const age = ageSnap.data() ?? {};
  if (diditPass(age)) return { verified: true, status: 'COMPLETE', provider: 'didit' };
  if (requestSnap.data()?.status !== 'approved_for_reuse' || requestSnap.data()?.memberConsent !== true) {
    throw new HttpsError('failed-precondition', 'A consented, administrator-approved account request is required.');
  }
  if (guardSnap.exists) {
    if (guardSnap.data()?.initiatedByUid !== identity.uid) {
      throw new HttpsError('permission-denied', 'The maintenance attempt belongs to a different account.');
    }
    const linked = await megMaintenanceSession(identity.uid, age);
    if (linked) return { ...linked, provider: 'didit', environment: 'live', resumed: true };
    throw new HttpsError('resource-exhausted',
      'Your single live maintenance check has already been claimed. Contact Nightjar support; do not try another paid check.');
  }
  if (['PENDING','IN_PROGRESS','CREATING','PENDING_REVIEW','RESUBMITTED'].includes(String(age.status)) && age.sessionId) {
    throw new HttpsError('failed-precondition', 'An earlier Nightjar-linked Didit session needs support review before another check.');
  }

  // Durable single-attempt claim precedes ALL calls to Didit. Concurrent tabs,
  // retries, timeouts and failed network responses cannot create a second charge.
  await db.runTransaction(async tx => {
    const [claim, activeRequest, currentAge] = await Promise.all([
      tx.get(guardRef), tx.get(requestRef), tx.get(ageRef),
    ]);
    if (claim.exists) throw new HttpsError('resource-exhausted',
      'This one-use Didit verification has already been claimed. Please refresh the existing status.');
    if (activeRequest.data()?.status !== 'approved_for_reuse' ||
        activeRequest.data()?.memberConsent !== true || diditPass(currentAge.data())) {
      throw new HttpsError('failed-precondition', 'The member request is no longer eligible for a new live verification.');
    }
    if (['PENDING','IN_PROGRESS','CREATING','PENDING_REVIEW','RESUBMITTED'].includes(String(currentAge.data()?.status)) &&
        currentAge.data()?.sessionId) {
      throw new HttpsError('failed-precondition', 'An earlier account-linked verification requires support review.');
    }
    tx.create(guardRef, {
      initiatedByUid: identity.uid,
      scope: 'one-standard-live-didit-check-during-public-pause',
      createdAt: FieldValue.serverTimestamp(),
    });
  });
  // This is the existing normal Nightjar Didit workflow, not a reuse claim.
  // Its vendor_data is the authenticated UID, and adult access still requires
  // an accepted signed live provider event with documentary 18+ evidence.
  return startDiditSession(identity.uid);
});

export const getAdminReleasePreviewUrl = onCall({ region: REGION }, async (request) => {
  requireAdminIdentity(request);
  const releaseId = cleanText((request.data as { releaseId?: unknown } | undefined)?.releaseId, 160);
  const snapshot = await releaseRef(releaseId).get();
  const data = snapshot.data();
  if (!data || ['removed', 'removing'].includes(String(data.status)) || !data.audioStoragePath) throw new HttpsError('not-found', 'Release audio not found.');
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
  // Independent from manuscript snapshot/version history. Every live text edit
  // requires this revision to prevent cross-device lost updates.
  contentRevision: Math.max(0, Number(data.contentRevision ?? 0)),
  writerUserId: data.writerUserId ?? null,
  editorUserId: data.editorUserId ?? null,
  lastEditorialComment: data.lastEditorialComment ?? null,
  sourceFile: writerUploadPublicMeta(data.originalUpload),
  artworkAssetId: data.artworkStatus === 'approved' ? data.artworkAssetId ?? null : null,
  artworkUrl: data.artworkStatus === 'approved' ? data.artworkUrl ?? null : null,
  artworkStatus: data.artworkStatus === 'approved' ? 'approved' : null,
  pendingArtworkAssetId: includeContent ? data.pendingArtworkAssetId ?? null : null,
  pendingArtworkStatus: includeContent ? data.pendingArtworkStatus ?? null : null,
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
  const expectedRevision = Number(input.expectedRevision);
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
    throw new HttpsError('invalid-argument', 'The saved manuscript revision is required.');
  }
  const ref = scriptRef(scriptId);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const data = snapshot.data();
    if (!data || data.writerUserId !== identity.uid) throw new HttpsError('not-found', 'Script not found.');
    if (!['Draft','Revision requested','Rejected'].includes(String(data.status ?? 'Draft'))) {
      throw new HttpsError('failed-precondition', 'This manuscript is currently locked for administrator review.');
    }
    const currentRevision = Math.max(0, Number(data.contentRevision ?? 0));
    if (currentRevision !== expectedRevision) {
      // Return a marker, not the protected contents, in errors and logs.
      // Writers can explicitly fetch their latest private source to compare.
      throw new HttpsError('aborted',
        'This manuscript changed on another device. Your edits have NOT overwritten it. Review the latest version before saving again.',
        { code: 'manuscript_revision_conflict', currentRevision });
    }
    const title = cleanText(input.title ?? data.title, 180) || 'Untitled manuscript';
    const content = cleanText(input.content ?? data.content, 200000);
    // Do not burn revisions for a repeated save of the same content. This also
    // lets a response-loss retry return the previously saved revision.
    if (title === data.title && content === (data.content ?? '')) return;
    transaction.set(ref, {
      title, content,
      contentRevision: currentRevision + 1,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });
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
  const artworkIds = [data.artworkAssetId, data.pendingArtworkAssetId]
    .map((id: unknown) => cleanText(id, 160)).filter(Boolean);
  batch.delete(ref);
  await batch.commit();
  if (originalStoragePath) {
    await getStorage().bucket().file(originalStoragePath).delete({ ignoreNotFound: true }).catch(() => undefined);
  }
  await Promise.all(artworkIds.map(async (assetId) => {
    const asset = await db.collection('imageAssets').doc(assetId).get();
    if (!asset.exists || asset.data()?.kind !== 'script_artwork' || asset.data()?.targetId !== scriptId) return;
    await clearAssetFile(asset.data() ?? {});
    await asset.ref.set({ status:'removed', publicUrl:null, updatedAt:FieldValue.serverTimestamp() },{merge:true});
  }));
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
  await db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    const data = snapshot.data();
    if (!data || data.writerUserId !== identity.uid) throw new HttpsError('not-found', 'Script not found.');
    if (!cleanText(data.content, 200000) && !cleanText(data.originalUpload?.storagePath, 500)) {
      throw new HttpsError('failed-precondition', 'Add manuscript content or upload a source manuscript before submitting.');
    }
    const rights = normaliseScriptRights(data.rights);
    if (rights.ownershipAttested !== true || rights.contributorPermissionsConfirmed !== true) {
      throw new HttpsError('failed-precondition',
        'Confirm manuscript ownership/authority and any contributor permissions in Rights & Licensing before submitting.',
        { code:'content_rights_attestation_required' });
    }
    if (!['Draft','Revision requested','Rejected'].includes(String(data.status ?? 'Draft'))) {
      throw new HttpsError('failed-precondition', 'This manuscript is already in editorial workflow.');
    }
    tx.set(ref, {
      status: 'Submitted',
      submittedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });
  const saved = await ref.get();
  return { script: scriptPayload(saved.data() ?? {}, scriptId, true) };
});

export const listEditorQueue = onCall({ region: REGION }, async (request) => {
  const identity = await requireAccountRole(request, ['editor', 'admin']);
  const snapshot = await db.collection('scripts').limit(1000).get();
  const activeStatuses = new Set(['Submitted','Under review','Revision requested']);
  const queue = snapshot.docs
    .filter((doc) => activeStatuses.has(String(doc.data().status)))
    .filter((doc) => normaliseScriptMarketplace(doc.data().marketplace).visibility !== 'marketplace')
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
  if (!['Submitted','Under review','Revision requested'].includes(String(data.status ?? ''))) {
    throw new HttpsError('failed-precondition', 'This manuscript is no longer open for editorial review.');
  }

  if (normaliseScriptMarketplace(data.marketplace).visibility === 'marketplace') {
    throw new HttpsError('failed-precondition', 'Marketplace manuscript decisions belong to NightJar administrators.');
  }
  const comment = cleanText(input.comment, 4000);
  // Production editorial reviews remain a separate feature and cannot approve marketplace submissions.
  const awaitingAdminApproval = status === 'Approved'
    && normaliseScriptMarketplace(data.marketplace).visibility === 'marketplace';
  const nextStatus = awaitingAdminApproval ? 'Under review' : status;
  await ref.set({
    status: nextStatus,
    lastEditorialComment: comment || null,
    editorRecommendation: awaitingAdminApproval ? 'approved' : null,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  if (data.writerUserId) {
    await createNotification(String(data.writerUserId), {
      type: 'editorial',
      subtype: 'script_review',
      title: awaitingAdminApproval ? 'Editor review complete — awaiting NightJar approval' : status === 'Approved' ? 'Your manuscript was approved' : status === 'Revision requested' ? 'Revision requested' : status === 'Rejected' ? 'Editorial review completed' : 'Your manuscript is under review',
      message: awaitingAdminApproval
        ? 'An Audio Editor recommended approval. The final marketplace listing still requires a NightJar administrator review.'
        : comment || ('Editorial status changed to ' + status + '.'),
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


// Read-only source previews for verified NightJar administrators. Never use these
// extracted strings in script listings, emails, public endpoints or edit paths.
const SCRIPT_REVIEW_PREVIEW_MAX_CHARS = 200000;
const SCRIPT_REVIEW_MAX_EXPANDED_XML = 16 * 1024 * 1024;
const decodeReviewXml = (value: string) => value.replace(/&(#x[0-9a-f]+|#[0-9]+|amp|lt|gt|quot|apos);/gi, (match, entity: string) => {
  switch (entity.toLowerCase()) {
    case 'amp': return '&';
    case 'lt': return '<';
    case 'gt': return '>';
    case 'quot': return '"';
    case 'apos': return "'";
    default: {
      const point = entity.startsWith('#x') ? Number.parseInt(entity.slice(2), 16) : Number.parseInt(entity.slice(1), 10);
      return Number.isInteger(point) && point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : match;
    }
  }
});
const extractDocxReviewText = (bytes: Buffer) => {
  // Parse the ZIP central directory instead of searching compressed bytes for XML:
  // DOCX files commonly use data descriptors and do not expose local file sizes.
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (bytes.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Invalid DOCX archive.');
  const entries = bytes.readUInt16LE(eocd + 10);
  let offset = bytes.readUInt32LE(eocd + 16);
  for (let i = 0; i < entries; i++) {
    if (offset + 46 > bytes.length || bytes.readUInt32LE(offset) !== 0x02014b50) throw new Error('Invalid DOCX central directory.');
    const flags = bytes.readUInt16LE(offset + 8);
    const method = bytes.readUInt16LE(offset + 10);
    const compressedSize = bytes.readUInt32LE(offset + 20);
    const expandedSize = bytes.readUInt32LE(offset + 24);
    const nameLength = bytes.readUInt16LE(offset + 28);
    const extraLength = bytes.readUInt16LE(offset + 30);
    const commentLength = bytes.readUInt16LE(offset + 32);
    const localOffset = bytes.readUInt32LE(offset + 42);
    const end = offset + 46 + nameLength + extraLength + commentLength;
    if (end > bytes.length) throw new Error('Invalid DOCX archive entry.');
    const name = bytes.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');
    if (name === 'word/document.xml') {
      if ((flags & 1) !== 0 || ![0,8].includes(method) || expandedSize > SCRIPT_REVIEW_MAX_EXPANDED_XML)
        throw new Error('Unsupported or oversized DOCX content.');
      if (localOffset + 30 > bytes.length || bytes.readUInt32LE(localOffset) !== 0x04034b50)
        throw new Error('Invalid DOCX document entry.');
      const dataStart = localOffset + 30 + bytes.readUInt16LE(localOffset + 26) + bytes.readUInt16LE(localOffset + 28);
      if (dataStart + compressedSize > bytes.length) throw new Error('Invalid DOCX compressed document.');
      const packed = bytes.subarray(dataStart, dataStart + compressedSize);
      const xmlBytes = method === 8 ? inflateRawSync(packed, { maxOutputLength: SCRIPT_REVIEW_MAX_EXPANDED_XML }) : packed;
      if (xmlBytes.length > SCRIPT_REVIEW_MAX_EXPANDED_XML) throw new Error('DOCX document is too large to preview.');
      const xml = xmlBytes.toString('utf8');
      const main = xml.match(/<w:body\b[^>]*>([\s\S]*?)<\/w:body>/)?.[1] ?? xml;
      const text = main.replace(/<w:tab\b[^>]*\/>/g, '\t')
        .replace(/<w:br\b[^>]*\/>/g, '\n')
        .replace(/<\/w:p>/g, '\n\n')
        .replace(/<\/w:tr>/g, '\n')
        .replace(/<\/w:tc>/g, '\t')
        .replace(/<[^>]*>/g, '');
      return decodeReviewXml(text).trim();
    }
    offset = end;
  }
  throw new Error('No document text was found in this DOCX.');
};
const adminSourcePreview = async (storagePath: string, fileName: string): Promise<{
  format: 'text' | 'pdf' | 'unavailable'; text?: string; truncated?: boolean; message?: string;
}> => {
  const extension = writerUploadExtension(fileName);
  if (extension === 'pdf') return { format:'pdf' };
  if (extension === 'doc') return { format:'unavailable', message:'Legacy .doc files cannot be securely rendered inside NightJar. Request a PDF or DOCX from the Writer.' };
  if (!['txt','md','markdown','rtf','docx'].includes(extension))
    return { format:'unavailable', message:'This document format cannot be previewed securely.' };
  try {
    const [bytes] = await getStorage().bucket().file(storagePath).download();
    let value = extension === 'docx' ? extractDocxReviewText(bytes) : bytes.toString('utf8');
    if (extension === 'rtf') {
      value = value.replace(/\\par[d]?(\s|$)/g, '\n')
        .replace(/\\tab\b/g, '\t')
        .replace(/\\'[0-9a-f]{2}/gi, ' ')
        .replace(/\\[a-z]+-?\d*\s?/gi, '')
        .replace(/[{}]/g, '').trim();
    }
    return { format:'text', text:value.slice(0,SCRIPT_REVIEW_PREVIEW_MAX_CHARS), truncated:value.length > SCRIPT_REVIEW_PREVIEW_MAX_CHARS };
  } catch (error) {
    console.warn('Nightjar administrator source preview failed', error instanceof Error ? error.message : 'Unknown preview error');
    return { format:'unavailable', message:'This file could not be rendered securely in NightJar. Ask the Writer for a new PDF or DOCX.' };
  }
};

// Administrators must be able to read an uploaded manuscript before approving it.
// Never include protected contents in adminListScripts or the public marketplace.
// These signed links expire quickly and every preview is audited.
export const getAdminScriptReview = onCall({ region: REGION }, async (request) => {
  const admin = requireAdminIdentity(request);
  const scriptId = cleanText((request.data as {scriptId?:unknown}|undefined)?.scriptId, 160);
  if (!scriptId) throw new HttpsError('invalid-argument', 'Choose a script to review.');
  const snapshot = await scriptRef(scriptId).get();
  const data = snapshot.data();
  if (!data) throw new HttpsError('not-found', 'Script not found.');
  await db.collection('protectionEvents').add({
    userId:admin.uid,eventType:'script_moderation_preview',relatedType:'script',relatedId:scriptId,
    summary:'Administrator accessed protected source for manuscript moderation.',createdAt:FieldValue.serverTimestamp(),
  });
  const sourcePath = cleanText(data.originalUpload?.storagePath,500);
  let sourceFile:null|{fileName:string;url:string;expiresAt:string} = null;
  // Only PDF rendering needs a temporary signed document URL. Text,
  // Markdown, RTF and DOCX previews are returned as read-only text by the
  // authenticated callable. No direct source download link is issued for them.
  if (sourcePath && writerUploadExtension(cleanText(data.originalUpload?.fileName,180)) === 'pdf') {
    const [exists] = await getStorage().bucket().file(sourcePath).exists();
    if (!exists) throw new HttpsError('not-found', 'The protected PDF is missing. Ask the Writer to upload a replacement.');
    const expiration = new Date(Date.now()+10*60*1000);
    const [url] = await getStorage().bucket().file(sourcePath).getSignedUrl({action:'read',expires:expiration});
    sourceFile={fileName:cleanText(data.originalUpload?.fileName,180)||'Uploaded manuscript',url,expiresAt:expiration.toISOString()};
  }
  const sourcePreview = sourcePath
    ? await adminSourcePreview(sourcePath, cleanText(data.originalUpload?.fileName,180))
    : { format:'text' as const, text:cleanText(data.content,200000), truncated:String(data.content ?? '').length>200000 };
  // A screenshot, queue row or stale Admin tab is NOT a manuscript review.
  // A complete protected preview must have been issued to this exact Admin
  // for this exact source revision, within a bounded review window.
  const previewComplete = sourcePreview.format === 'pdf' ? Boolean(sourceFile?.url)
    : sourcePreview.format === 'text' && sourcePreview.truncated !== true && Boolean(String(sourcePreview.text ?? '').trim());
  if (previewComplete && ['Submitted','Under review'].includes(String(data.status ?? ''))) {
    const ref = scriptRef(scriptId);
    await db.runTransaction(async transaction => {
      const latestSnapshot = await transaction.get(ref);
      const latest = latestSnapshot.data();
      if (!latest || !['Submitted','Under review'].includes(String(latest.status ?? '')) ||
          Number(latest.contentRevision ?? 0) !== Number(data.contentRevision ?? 0) ||
          cleanText(latest.originalUpload?.storagePath,500) !== sourcePath) {
        throw new HttpsError('aborted','Manuscript changed during preview. Refresh and open the latest source before deciding.');
      }
      transaction.set(ref.collection('adminReviewEvidence').doc(admin.uid), {
        reviewerUserId:admin.uid, contentRevision:Number(data.contentRevision ?? 0),
        sourcePath, previewIssuedAt:FieldValue.serverTimestamp(),
      }, {merge:true});
    });
  }
  return { script:scriptPayload(data,scriptId,true),sourceFile,sourcePreview };
});

// Editorial review is optional production assistance, never a prerequisite for
// making a writer-approved manuscript discoverable to Nightjar voice actors.
// The Writer alone controls marketplace visibility and synopsis; admin approval
// cannot change a private manuscript into a public listing.
export const adminReviewWriterScript = onCall({ region: REGION }, async (request) => {
  const admin = requireAdminIdentity(request);
  const input = (request.data ?? {}) as Record<string, unknown>;
  const scriptId = cleanText(input.scriptId, 160);
  const decision = cleanText(input.decision, 30);
  const note = cleanText(input.note, 2000);
  const sourceReviewed = input.sourceReviewed === true;
  if (!scriptId || !['approved','changes','rejected'].includes(decision)) {
    throw new HttpsError('invalid-argument', 'Select a submitted manuscript and a valid moderation decision.');
  }
  if (decision !== 'approved' && !note) {
    throw new HttpsError('invalid-argument', 'Explain the requested changes or rejection to the Writer.');
  }
  const ref = scriptRef(scriptId);
  // The review status AND the Writer-visible reason must either commit
  // together or not at all. No queued fan-out or scheduled billing needed.
  const reviewEventRef = ref.collection('reviewThread').doc();
  const result = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const data = snapshot.data();
    if (!data) throw new HttpsError('not-found', 'Manuscript not found.');
    if (decision === 'approved') {
      if (!sourceReviewed) throw new HttpsError('failed-precondition','Confirm you reviewed the complete protected manuscript before approval.');
      const evidence = await transaction.get(ref.collection('adminReviewEvidence').doc(admin.uid));
      const proof = evidence.data();
      const issued = proof?.previewIssuedAt?.toMillis?.() ?? 0;
      if (!proof || proof.reviewerUserId !== admin.uid ||
          proof.contentRevision !== Number(data.contentRevision ?? 0) ||
          proof.sourcePath !== cleanText(data.originalUpload?.storagePath,500) ||
          issued <= 0 || Date.now()-issued > 30*60*1000 || issued>Date.now()+60*1000) {
        throw new HttpsError('failed-precondition','Open the complete current manuscript in the protected viewer before approving it.');
      }
    }
    if (!['Submitted','Under review'].includes(String(data.status ?? ''))) {
      throw new HttpsError('failed-precondition', 'Only submitted manuscripts awaiting a decision can be reviewed.');
    }
    const rights = normaliseScriptRights(data.rights);
    if (decision === 'approved' && (rights.ownershipAttested !== true || rights.contributorPermissionsConfirmed !== true)) {
      throw new HttpsError('failed-precondition', 'Writer rights and contributor permissions must be confirmed before approval.');
    }
    if (decision === 'approved' && !cleanText(data.content, 200000) && !cleanText(data.originalUpload?.storagePath, 500)) {
      throw new HttpsError('failed-precondition', 'There is no protected manuscript to approve.');
    }
    const nextStatus = decision === 'approved' ? 'Approved' : decision === 'changes' ? 'Revision requested' : 'Rejected';
    const listing = normaliseScriptMarketplace(data.marketplace);
    const marketplaceVisible = decision === 'approved' && listing.visibility === 'marketplace' && Boolean(listing.synopsis.trim());
    transaction.set(ref, {
      status:nextStatus,
      lastEditorialComment:note || null,
      reviewedBy:admin.uid,
      reviewedAt:FieldValue.serverTimestamp(),
      updatedAt:FieldValue.serverTimestamp(),
    }, {merge:true});
    transaction.create(reviewEventRef, {
      kind:'decision', visibility:'writer', authorUserId:admin.uid,
      authorLabel:'NightJar Team',
      body: decision === 'approved' ? (note || 'NightJar approved the submitted manuscript.')
        : note || (decision === 'changes' ? 'NightJar requested changes.' : 'NightJar rejected this manuscript.'),
      decision,createdAt:FieldValue.serverTimestamp(),
    });
    return {writerUserId:String(data.writerUserId ?? ''),title:cleanText(data.title,180),nextStatus,marketplaceVisible};
  });
  // The protected review-thread decision was already written atomically with
  // the script. A notification is supplemental, never its source of truth.
  if (result.writerUserId) {
    const thankYou = decision === 'approved'
      ? await approvedWorkThankYou(result.writerUserId, 'manuscript', result.title) : null;
    await createNotification(result.writerUserId, {
      type:'editorial', subtype:'script_review',
      title:result.nextStatus === 'Approved' ? 'Your manuscript has been approved' : result.nextStatus === 'Revision requested' ? 'Nightjar has requested manuscript changes' : 'Nightjar manuscript review completed',
      message:thankYou ?? (result.nextStatus === 'Approved'
        ? result.marketplaceVisible ? 'Your manuscript synopsis is now listed in the Creator Script Marketplace. The full manuscript remains protected.' : 'Your manuscript is approved. Open Writer Studio to choose Marketplace visibility and add a synopsis when you want creators to discover it.'
        : note),
      approvedWorkThankYou:Boolean(thankYou),
      scriptId,
      dedupeKey:'writer-script-review:'+scriptId+':'+reviewEventRef.id,oncePerKey:true,
    }).catch((error)=>console.warn('Script review notification failed',error));
  }
  const saved = await ref.get();
  return {script:scriptPayload(saved.data() ?? {},scriptId,false),marketplaceVisible:result.marketplaceVisible};
});


// Manuscript-specific review correspondence. Private admin notes are never
// returned to a Writer or the marketplace. Writer-visible entries form an
// append-only, timestamped conversation attached to the protected script.
const scriptReviewEntryPayload = (value: Record<string, any>, id: string) => ({
  id,
  kind: cleanText(value.kind, 20) || 'message',
  visibility: value.visibility === 'internal' ? 'internal' : 'writer',
  authorUserId: cleanText(value.authorUserId, 160) || null,
  authorLabel: cleanText(value.authorLabel, 100) || 'NightJar Team',
  body: cleanText(value.body, 2400),
  createdAt: toIso(value.createdAt),
});
export const listManuscriptReviewThread = onCall({ region: REGION }, async (request) => {
  const identity = await requireAccountRole(request, ['writer','admin']);
  const scriptId = cleanText((request.data as {scriptId?: unknown}|undefined)?.scriptId, 160);
  if (!scriptId) throw new HttpsError('invalid-argument','Select a manuscript.');
  const script = await scriptRef(scriptId).get();
  if (!script.exists) throw new HttpsError('not-found','Manuscript not found.');
  if (identity.role !== 'admin' && script.data()?.writerUserId !== identity.uid) {
    throw new HttpsError('permission-denied','Only the Writer and NightJar administrators can read this review conversation.');
  }
  const entries = await script.ref.collection('reviewThread').orderBy('createdAt', 'asc').limit(300).get();
  return { entries: entries.docs.filter(doc => identity.role === 'admin' || doc.data().visibility !== 'internal')
    .map(doc => scriptReviewEntryPayload(doc.data(), doc.id)), scriptId };
});
export const postManuscriptReviewEntry = onCall({ region: REGION }, async (request) => {
  const identity = await requireAccountRole(request, ['writer','admin']);
  const input = (request.data ?? {}) as Record<string, unknown>;
  const scriptId = cleanText(input.scriptId, 160);
  const body = cleanText(input.body, 2400);
  const visibility = identity.role === 'admin' && input.visibility === 'internal' ? 'internal' : 'writer';
  if (!scriptId || !body) throw new HttpsError('invalid-argument','Write a note or message first.');
  const script = await scriptRef(scriptId).get();
  const scriptData = script.data();
  if (!scriptData) throw new HttpsError('not-found','Manuscript not found.');
  if (identity.role !== 'admin' && scriptData.writerUserId !== identity.uid)
    throw new HttpsError('permission-denied','You may only message NightJar about your own manuscript.');
  if (identity.role !== 'admin' && !['Submitted','Under review','Revision requested','Rejected','Approved','Published'].includes(String(scriptData.status ?? '')))
    throw new HttpsError('failed-precondition','Submit your manuscript before opening a review conversation.');
  const thread = script.ref.collection('reviewThread');
  // Prevent identical bursts without penalising normal ongoing discussions.
  const recent = await thread.orderBy('createdAt', 'desc').limit(1).get();
  const last = recent.docs[0]?.data();
  if (last && last.authorUserId === identity.uid && last.body === body && last.visibility === visibility &&
      Date.now() - (last.createdAt?.toMillis?.() ?? 0) < 15000)
    throw new HttpsError('resource-exhausted','This message was already submitted.');
  const ref = thread.doc();
  const entry = {
    kind: visibility === 'internal' ? 'note' : 'message', visibility,
    body, authorUserId:identity.uid,
    authorLabel: identity.role === 'admin' ? 'NightJar Team' : 'Writer',
    createdAt:FieldValue.serverTimestamp(),
  };
  await ref.set(entry);
  if (identity.role === 'admin' && visibility === 'writer' && scriptData.writerUserId) {
    await createNotification(String(scriptData.writerUserId), {
      type:'editorial',subtype:'script_review_message', title:'NightJar sent a message about your manuscript',
      message:'A NightJar administrator has replied to ' + cleanText(scriptData.title,150) + '.',
      scriptId,
    }).catch(error=>console.warn('Writer script review message notification failed',error));
  } else if (identity.role !== 'admin') {
    // Only verified owner identities receive review correspondence alerts.
    await Promise.all([...ADMIN_EMAILS].map(async email => {
      try {
        const owner = await getAuth().getUserByEmail(email);
        if (owner.uid === identity.uid) return;
        await createNotification(owner.uid,{
          type:'admin_attention',subtype:'script_submission',title:'Writer replied to a manuscript review',
          message:'A submitted manuscript has a new writer message in the admin review queue.',
          scriptId, route:'/admin/editorial',
        });
      } catch(error) { console.warn('Admin manuscript review notification failed',error); }
    }));
  }
  const saved = await ref.get();
  return { entry:scriptReviewEntryPayload(saved.data() ?? entry,ref.id) };
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
  if (normaliseScriptMarketplace(script.data()?.marketplace).visibility === 'marketplace') {
    throw new HttpsError('failed-precondition', 'Marketplace manuscripts are reviewed directly by NightJar administrators, without editorial assignment.');
  }
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
  const reportedEventType = cleanText(input.eventType, 80);
  if (!reportedEventType) throw new HttpsError('invalid-argument', 'Protection event type is required.');
  // A browser can forge our JS bridge callbacks. Until a native shell can
  // provide server-verifiable attestation, never rate one as confirmed OS capture.
  const unverifiedNativeSignal = NATIVE_CAPTURE_EVENTS.has(reportedEventType);
  const eventType = unverifiedNativeSignal ? 'possible_capture_shortcut' : reportedEventType;

  const requestedConfidence = unverifiedNativeSignal ? 'possible' : cleanText(input.detectionConfidence, 32);
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
    detectionSource: unverifiedNativeSignal ? 'unverified_native_js_bridge' : (cleanText(input.detectionSource, 120) || null),
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
        // Hash prefix groups the SAME entered address without exposing the raw
        // email or mistakenly merging different emails with the same mask.
        targetKey: cleanText(data.emailHash, 100).slice(0, 28) || doc.id,
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
    .sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')))
    .slice(0, 80);

  // Only reveal contact details where the registered and verified account
  // actually matches the TARGET email, is currently permitted, and isn't
  // disabled or suspended. This never identifies the attempted sign-in actor.
  const accountOwnerByTarget = new Map<string, { name:string; email:string }>();
  const targets = new Map<string, string>();
  for (const event of events) {
    if (event.targetUserId && !event.adminTarget) targets.set(event.targetKey, event.targetUserId);
  }
  await Promise.all(Array.from(targets.entries()).map(async ([targetKey, uid]) => {
    try {
      const [authUser, accountSnapshot] = await Promise.all([
        getAuth().getUser(uid), accountRef(uid).get(),
      ]);
      if (!accountSnapshot.exists || !authUser.emailVerified || authUser.disabled || accountSnapshot.data()?.status === 'suspended') return;
      const email = cleanEmail(authUser.email);
      if (!validEmailAddress(email) || createHash('sha256').update(email).digest('hex').slice(0, 28) !== targetKey) return;
      const access = await closedBetaAccessFor(email, accountSnapshot.data() ?? {});
      if (!access.allowed || ADMIN_EMAILS.has(email)) return;
      const presenter = await accountPresentation(uid);
      accountOwnerByTarget.set(targetKey, { name: presenter.displayName, email });
    } catch {
      // Missing, stale or ineligible accounts stay masked.
    }
  }));
  return {
    events: events.map(event => ({
      ...event,
      accountOwner: accountOwnerByTarget.get(event.targetKey) ?? null,
    })),
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

  // Contact details refer ONLY to the registered account that was targeted.
  // An attempted email address, client token or browser string never identifies
  // the person who submitted the failed sign-in.
  let authorisedTarget: {
    eligible: boolean;
    status: 'approved' | 'unapproved' | 'unverified' | 'unregistered';
    displayName: string | null;
    email: string | null;
    accessReason: string | null;
  } | null = null;
  if (authenticationAlert) {
    const targetUid = cleanText(alertData.targetUserId, 160);
    authorisedTarget = { eligible: false, status: 'unregistered', displayName: null, email: null, accessReason: null };
    if (targetUid) {
      try {
        const [authUser, accountSnapshot] = await Promise.all([
          getAuth().getUser(targetUid),
          accountRef(targetUid).get(),
        ]);
        const account = accountSnapshot.data() ?? {};
        const email = cleanEmail(authUser.email);
        const matchesTarget = email && createHash('sha256').update(email).digest('hex') === cleanText(alertData.emailHash, 100);
        if (matchesTarget && accountSnapshot.exists) {
          const access = await closedBetaAccessFor(email, account);
          const eligible = authUser.emailVerified === true
            && authUser.disabled !== true
            && account.status !== 'suspended'
            && access.allowed === true;
          const presenter = eligible ? await accountPresentation(targetUid) : null;
          authorisedTarget = {
            eligible,
            status: eligible ? 'approved' : authUser.emailVerified !== true ? 'unverified' : 'unapproved',
            displayName: eligible ? presenter?.displayName ?? 'Nightjar member' : null,
            email: eligible ? email : null,
            accessReason: eligible ? access.reason : null,
          };
        }
      } catch {
        // If account resolution fails, never expose an unverified identity.
      }
    }
  }

  return {
    authorisedTarget,
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

export const suspendFromSecurityAlert = onCall({
  region: REGION, secrets: [NIGHTJAR_GMAIL_CLIENT_ID, NIGHTJAR_GMAIL_CLIENT_SECRET],
}, async (request) => {
  const admin = requireAdminIdentity(request);
  const alertId = cleanText((request.data as { alertId?: unknown } | undefined)?.alertId, 160);
  const alertRef = db.collection('securityAlerts').doc(alertId);
  const alert = await alertRef.get();
  const data = alert.data();
  if (!data) throw new HttpsError('not-found', 'Security alert not found.');
  if (cleanText(data.category, 80) === 'authentication') {
    throw new HttpsError('failed-precondition', 'Failed-login alerts are evidence only and cannot suspend the targeted account.');
  }

  const result = await setMemberSuspension(
    String(data.userId),
    'suspend',
    'Administrator-reviewed security alert ' + alertId,
    admin.uid,
  );
  const revokedCount = result.revokedReaderSessions;
  const notificationDelivery = await deliverMemberSecurityNotice(String(data.userId), 'suspend',
    'Administrator-reviewed security alert ' + alertId, result.caseId);

  await alertRef.set({
    status: 'actioned',
    action: 'suspended',
    actionedBy: admin.uid,
    actionedAt: FieldValue.serverTimestamp(),
    revokedReaderSessions: revokedCount,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  return { suspended: true, revokedReaderSessions: revokedCount, notificationDelivery, caseId: result.caseId };
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

const normaliseReleaseContributors = (value: unknown, existing: unknown = [], assignSlotIds = false) => {
  if (!Array.isArray(value)) return [];
  const allowedRoles = new Set([
    'Voice Actor', 'Writer', 'Audio Editor', 'Producer', 'Director',
    'Sound Designer', 'Cover Artist', 'Composer', 'Other',
  ]);
  const previous = Array.isArray(existing) ? existing : [];
  return value.slice(0, 24).map((item: any, index: number) => {
    const role = cleanText(item?.role, 48);
    return {
      // Server-issued immutable contributor slot reference. Legacy credits use
      // their original zero-based position until a controlled migration.
      slotId: previous[index] && previous[index].name === cleanText(item?.name,100) && previous[index].role === (allowedRoles.has(role) ? role : 'Other') && /^[a-f0-9-]{36}$/i.test(String(previous[index].slotId ?? ''))
        ? previous[index].slotId : assignSlotIds ? randomUUID() : (cleanText(item?.slotId, 80) || String(index)),
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
    // Writer-selected sample: never derived from the protected manuscript automatically.
    previewExcerpt: cleanText(input.previewExcerpt, 3200),
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
    const visible = listing.visibility === 'marketplace' && Boolean(listing.synopsis.trim()) && ['Approved','Published'].includes(status);
    const reasons = [
      ...(!['Approved','Published'].includes(status) ? ['Not approved or published'] : []),
      ...(listing.visibility !== 'marketplace' ? ['Not listed in the marketplace'] : []),
      ...(listing.visibility === 'marketplace' && !listing.synopsis.trim() ? ['Public synopsis is missing'] : []),
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
    rule: 'Approved or Published AND Writer-selected marketplace visibility AND public synopsis. No protected script text is included.',
  };
});

export const listScriptMarketplace = onCall({ region: REGION }, async (request) => {
  const identity = await requireActiveIdentity(request);
  await requireAgeVerified(identity.uid);
  const snapshot = await db.collection('scripts').limit(1000).get();
  const scripts = (await Promise.all(snapshot.docs
    .filter((doc) => {
      const listing = normaliseScriptMarketplace(doc.data().marketplace);
      return listing.visibility === 'marketplace' && Boolean(listing.synopsis.trim()) && ['Approved','Published'].includes(String(doc.data().status ?? ''));
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
        marketplace: (() => { const { previewExcerpt, ...listing } = normaliseScriptMarketplace(data.marketplace); return { ...listing, sampleAvailable:Boolean(previewExcerpt.trim()) }; })(),
        artworkUrl: data.artworkStatus === 'approved' ? data.artworkUrl ?? null : null,
        updatedAt: toIso(data.updatedAt),
      };
    })));
  return { scripts };
});


// Only an explicitly writer-selected excerpt can be previewed by an authorised
// VA. Neither protected script text nor private uploaded source files are returned.
export const getMarketplaceScriptSample = onCall({ region: REGION }, async (request) => {
  const identity = await requireAccountRole(request, ['creator']);
  await requireAgeVerified(identity.uid);
  const scriptId = cleanText((request.data as {scriptId?:unknown}|undefined)?.scriptId, 160);
  if (!scriptId) throw new HttpsError('invalid-argument','Select a marketplace script.');
  const snapshot = await scriptRef(scriptId).get();
  const data = snapshot.data();
  if (!data) throw new HttpsError('not-found','Marketplace script not found.');
  const listing = normaliseScriptMarketplace(data.marketplace);
  if (listing.visibility !== 'marketplace' || !listing.synopsis.trim() || !['Approved','Published'].includes(String(data.status??''))) {
    throw new HttpsError('failed-precondition','This script is not currently available in the marketplace.');
  }
  if (!listing.previewExcerpt.trim()) throw new HttpsError('failed-precondition','The Writer has not enabled a protected sample.');
  await db.collection('protectionEvents').add({
    userId:identity.uid, eventType:'script_sample_view', relatedType:'script', relatedId:scriptId,
    summary:'A verified NightJar Creator opened the Writer-approved sample excerpt.',
    createdAt:FieldValue.serverTimestamp(),
  });
  return { scriptId, title:cleanText(data.title,180),sample:listing.previewExcerpt,writerUserId:data.writerUserId??null };
});


// Rights negotiations are not sales. No money changes hands and no protected
// manuscript/licence rights are granted until a compliant payment provider,
// final signed terms and independent settlement verification are implemented.
const licenceOfferPayload = (value: Record<string, any>, id: string) => ({
  id,
  scriptId: cleanText(value.scriptId,160),
  scriptTitle: cleanText(value.scriptTitle,180),
  writerUserId: cleanText(value.writerUserId,160),
  creatorUserId: cleanText(value.creatorUserId,160),
  amountPence: Math.max(0,Number(value.amountPence??0)),
  currency:'GBP',
  licenceType: value.licenceType === 'exclusive'?'exclusive':'non-exclusive',
  termMonths: Math.max(1,Math.min(120,Number(value.termMonths??12))),
  permittedUse: 'audio_adaptation',
  usageDetails: cleanText(value.usageDetails,1200),
  status: cleanText(value.status,50),
  lastProposerUserId: cleanText(value.lastProposerUserId,160),
  paymentStatus: 'not_collected',
  licenceGranted: false,
  revision: Math.max(1,Number(value.revision??1)),
  createdAt:toIso(value.createdAt), updatedAt:toIso(value.updatedAt),
});
const sanitiseLicenceTerms = (value: Record<string,unknown>) => {
  const amountPence = Number(value.amountPence);
  const termMonths = Number(value.termMonths);
  const licenceType = cleanText(value.licenceType,30);
  const usageDetails = cleanText(value.usageDetails,1200);
  if (!Number.isSafeInteger(amountPence) || amountPence < 100 || amountPence > 10000000)
    throw new HttpsError('invalid-argument','Offer an amount between £1 and £100,000.');
  if (!Number.isSafeInteger(termMonths) || termMonths < 1 || termMonths > 120)
    throw new HttpsError('invalid-argument','Choose an agreement length of 1–120 months.');
  if (!['non-exclusive','exclusive'].includes(licenceType))
    throw new HttpsError('invalid-argument','Choose a non-exclusive or exclusive licence.');
  if (!usageDetails) throw new HttpsError('invalid-argument','Describe the intended audio use of this script.');
  return { amountPence, termMonths, licenceType, usageDetails };
};
export const createScriptLicenceOffer = onCall({region:REGION},async request => {
  const identity = await requireAccountRole(request,['creator']);
  await requireAgeVerified(identity.uid);
  const input = (request.data??{}) as Record<string,unknown>;
  const scriptId = cleanText(input.scriptId,160);
  if (!scriptId) throw new HttpsError('invalid-argument','Select a script.');
  const script = await scriptRef(scriptId).get();
  const data = script.data();
  if (!data) throw new HttpsError('not-found','Manuscript not found.');
  const listing = normaliseScriptMarketplace(data.marketplace);
  if (listing.visibility !== 'marketplace' || !listing.synopsis.trim() || !['Approved','Published'].includes(String(data.status??'')))
    throw new HttpsError('failed-precondition','This manuscript is not available for licence enquiries.');
  if (!data.writerUserId || data.writerUserId === identity.uid) throw new HttpsError('failed-precondition','Invalid licence counterpart.');
  const terms = sanitiseLicenceTerms(input);
  const offerId = createHash('sha256').update('script-license-offer\0'+scriptId+'\0'+identity.uid).digest('hex');
  const ref = db.collection('scriptLicenceOffers').doc(offerId);
  const value = await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const existing = snap.data();
    if (existing && !['declined','withdrawn'].includes(String(existing.status??''))) {
      throw new HttpsError('already-exists','This script already has your active licence offer. Open your rights negotiations to continue.');
    }
    const revision = existing ? Number(existing.revision??0)+1:1;
    const record={
      scriptId,scriptTitle:cleanText(data.title,180),writerUserId:data.writerUserId,creatorUserId:identity.uid,
      ...terms,status:'proposed',lastProposerUserId:identity.uid,
      paymentStatus:'not_collected',licenceGranted:false,revision,
      createdAt:existing?.createdAt??FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp(),
    };
    tx.set(ref,record,{merge:true});
    tx.set(ref.collection('revisions').doc(String(revision)),{
      revision,actorUserId:identity.uid,action:'propose',...terms,status:'proposed',
      createdAt:FieldValue.serverTimestamp(),
    });
    return record;
  });
  await createNotification(String(data.writerUserId),{
    type:'collaboration',subtype:'script_licence_offer',title:'New script licence offer',
    message:'A VA has sent a rights proposal for '+cleanText(data.title,150)+'. No payment or licence transfer has occurred.',
    scriptId,offerId,
  }).catch(error=>console.warn('Licence offer notice failed',error));
  return {offer:licenceOfferPayload(value,offerId)};
});
export const listMyScriptLicenceOffers = onCall({region:REGION},async request=>{
  const identity=await requireAccountRole(request,['creator','writer','admin']);
  const snapshot=await db.collection('scriptLicenceOffers').limit(1000).get();
  return {offers:snapshot.docs
    .filter(doc=>identity.role==='admin'||doc.data().writerUserId===identity.uid||doc.data().creatorUserId===identity.uid)
    .map(doc=>licenceOfferPayload(doc.data(),doc.id))
    .sort((a,b)=>String(b.updatedAt??'').localeCompare(String(a.updatedAt??'')))};
});
export const respondScriptLicenceOffer = onCall({region:REGION},async request=>{
  const identity=await requireAccountRole(request,['creator','writer']);
  const input=(request.data??{}) as Record<string,unknown>;
  const offerId=cleanText(input.offerId,160);
  const action=cleanText(input.action,20);
  if (!offerId||!['accept','counter','decline','withdraw'].includes(action))
    throw new HttpsError('invalid-argument','Select a valid offer action.');
  const terms=action==='counter'?sanitiseLicenceTerms(input):null;
  const ref=db.collection('scriptLicenceOffers').doc(offerId);
  const result=await db.runTransaction(async tx=>{
    const snap=await tx.get(ref);
    const data=snap.data();
    if (!data)throw new HttpsError('not-found','Offer not found.');
    if (![data.writerUserId,data.creatorUserId].includes(identity.uid))
      throw new HttpsError('permission-denied','You do not participate in this negotiation.');
    if (!['proposed','countered'].includes(String(data.status??'')))
      throw new HttpsError('failed-precondition','This negotiation is no longer open.');
    if (action==='withdraw' && data.creatorUserId!==identity.uid)
      throw new HttpsError('permission-denied','Only the VA may withdraw their proposal.');
    if (action!=='withdraw' && data.lastProposerUserId===identity.uid)
      throw new HttpsError('failed-precondition','The other party needs to respond to your latest proposal.');
    const nextStatus=action==='accept'?'terms_agreed_payment_pending':action==='counter'?'countered':action==='decline'?'declined':'withdrawn';
    const revision=Number(data.revision??1)+1;
    const update={
      ...(terms??{}),status:nextStatus,revision,lastProposerUserId:action==='counter'?identity.uid:data.lastProposerUserId,
      paymentStatus:'not_collected',licenceGranted:false,updatedAt:FieldValue.serverTimestamp(),
    };
    tx.set(ref,update,{merge:true});
    tx.set(ref.collection('revisions').doc(String(revision)),{
      revision,actorUserId:identity.uid,action, ...terms,status:nextStatus,
      createdAt:FieldValue.serverTimestamp(),
    });
    return {toUserId:data.writerUserId===identity.uid?data.creatorUserId:data.writerUserId,scriptId:data.scriptId,
      title:data.scriptTitle,nextStatus};
  });
  await createNotification(String(result.toUserId),{
    type:'collaboration',subtype:'script_licence_offer',title:'Script rights offer updated',
    message:'Rights negotiation for '+cleanText(result.title,120)+' is '+result.nextStatus.replaceAll('_',' ')+'. No payment or licence transfer has occurred.',
    scriptId:result.scriptId,offerId,
  }).catch(error=>console.warn('Rights negotiation notification failed',error));
  const saved=await ref.get();
  return {offer:licenceOfferPayload(saved.data()??{},offerId)};
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
  const completedByUser = verifiedCollaborationEvidence(publicReleases.docs, collaborations.docs).counts;

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
      bannerUrl: data.bannerStatus === 'approved' ? data.bannerUrl ?? null : null,
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
    newScripts: input.newScripts !== false,
    newArtwork: input.newArtwork !== false,
    newFollowers: input.newFollowers !== false,
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
  // Commercial assumptions and payout projections are not public beta data.
  const identity = await requireAccountRole(request, ['admin']);
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
  reactionLikeCount: Math.max(0, Number(data.reactionLikeCount ?? 0)),
  reactionLoveCount: Math.max(0, Number(data.reactionLoveCount ?? 0)),
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
  const [legacyLoves, reactionsSnapshot, commentsSnapshot, myCommentReactions] = await Promise.all([
    db.collection('releaseLoves').where('releaseId', '==', releaseId).limit(5000).get(),
    db.collection('releaseReactions').where('releaseId', '==', releaseId).limit(5000).get(),
    db.collection('releaseComments').where('releaseId', '==', releaseId).limit(500).get(),
    viewerUserId
      ? db.collection('releaseCommentReactions').where('userId', '==', viewerUserId).limit(2000).get()
      : Promise.resolve(null),
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

  const myCommentReactionById = new Map<string, string>();
  for (const doc of myCommentReactions?.docs ?? []) {
    const data = doc.data();
    if (data.releaseId !== releaseId) continue;
    const commentId = cleanText(data.commentId, 160);
    const reaction = cleanText(data.reaction, 20);
    if (commentId && (reaction === 'like' || reaction === 'love')) myCommentReactionById.set(commentId, reaction);
  }
  const comments = commentsSnapshot.docs
    .filter((doc) => doc.data().status === 'visible')
    .map((doc) => ({ ...commentPayload(doc.data(), doc.id), myReaction:myCommentReactionById.get(doc.id) ?? null }))
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
  return { ...state, canInteract:Boolean(viewerRole), commentReactionsEnabled:true };
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

/**
 * Reactions are scoped to one comment and one authenticated account.
 * A transaction prevents double-counting across repeated taps or concurrent devices.
 * Comments remain instantly published; reports use the existing admin moderation queue.
 */
export const setReleaseCommentReaction = onCall({ region: REGION }, async (request) => {
  const identity = await requireActiveIdentity(request);
  await requireAgeVerified(identity.uid);
  const input = (request.data ?? {}) as Record<string, unknown>;
  const commentId = cleanText(input.commentId, 160);
  const reaction = cleanText(input.reaction, 20);
  if (!commentId || (reaction && reaction !== 'like' && reaction !== 'love')) {
    throw new HttpsError('invalid-argument', 'Choose Like, Heart or remove your reaction.');
  }
  const commentRef = db.collection('releaseComments').doc(commentId);
  const reactionRef = db.collection('releaseCommentReactions').doc(commentId + '__' + identity.uid);
  const result = await db.runTransaction(async (transaction) => {
    const [commentSnap, previousSnap] = await Promise.all([
      transaction.get(commentRef), transaction.get(reactionRef),
    ]);
    const data = commentSnap.data();
    if (!data || data.status !== 'visible') throw new HttpsError('not-found', 'Comment not found.');
    const releaseId = cleanText(data.releaseId, 160);
    const previous = cleanText(previousSnap.data()?.reaction, 20);
    let likes = Math.max(0, Number(data.reactionLikeCount ?? 0));
    let loves = Math.max(0, Number(data.reactionLoveCount ?? 0));
    if (previous !== reaction) {
      if (previous === 'like') likes = Math.max(0, likes - 1);
      if (previous === 'love') loves = Math.max(0, loves - 1);
      if (reaction === 'like') likes += 1;
      if (reaction === 'love') loves += 1;
      transaction.set(commentRef, {
        reactionLikeCount:likes, reactionLoveCount:loves, updatedAt:FieldValue.serverTimestamp(),
      }, { merge:true });
      if (reaction) {
        transaction.set(reactionRef, {
          commentId, releaseId, userId:identity.uid, reaction,
          updatedAt:FieldValue.serverTimestamp(),
        }, { merge:true });
      } else if (previousSnap.exists) transaction.delete(reactionRef);
    }
    return { commentId, releaseId, likes, loves, myReaction:reaction || null };
  });
  return result;
});

export const postReleaseComment = onCall({ region: REGION }, async (request) => {
  const identity = await requireActiveIdentity(request);
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
  const identity = await requireAccountRole(request, ['creator','writer','editor','artist','admin']);
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
  const targetCreative = targetRoles.some((role) => CREATIVE_MESSAGE_ROLES.has(role)) || target.data()?.role === 'admin';
  if (!target.exists || target.data()?.status !== 'active' || !targetCreative) {
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
  if (!recipientUserId || !recipient?.exists || recipient.data()?.status !== 'active' || !(recipientRoles.some((role) => CREATIVE_MESSAGE_ROLES.has(role)) || recipient.data()?.role === 'admin')) {
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


// Drafts of professional applications are account-owned. These are NOT
// submitted applications and must never appear in the administrator bank.
const applicationDraftRef=(uid:string)=>accountRef(uid).collection('memberDrafts').doc('professionalApplication');

export const getMyProfessionalApplicationDraft = onCall({region:REGION},async(request)=>{
  const identity=await requireActiveIdentity(request);
  if(identity.admin) return {draft:null,revision:0};
  const snapshot=await applicationDraftRef(identity.uid).get();
  return {draft:snapshot.exists ? snapshot.data()?.draft??null : null,revision:Number(snapshot.data()?.revision??0)};
});

export const saveMyProfessionalApplicationDraft = onCall({region:REGION},async(request)=>{
  const identity=await requireActiveIdentity(request);
  if(identity.admin) throw new HttpsError('permission-denied','Administrators cannot submit professional applications.');
  const input=(request.data??{}) as Record<string,unknown>;
  const draftInput=input.draft && typeof input.draft==='object' && !Array.isArray(input.draft)
    ? input.draft as Record<string,unknown>:{};
  const expected=Number(input.revision??0);
  if(!Number.isSafeInteger(expected)||expected<0)throw new HttpsError('invalid-argument','Draft revision is invalid.');
  const draft={
    selectedRoles:cleanProfessionalRoles(draftInput.selectedRoles),
    statement:cleanText(draftInput.statement,2400),
    experience:cleanText(draftInput.experience,1600),
    portfolioUrl:cleanText(draftInput.portfolioUrl,500),
    socialUrl:cleanText(draftInput.socialUrl,500),
  };
  return db.runTransaction(async(tx)=>{
    const ref=applicationDraftRef(identity.uid);
    const prior=await tx.get(ref);
    const revision=Number(prior.data()?.revision??0);
    if(expected!==revision)throw new HttpsError('aborted','Your professional application was edited on another device. Refresh to load the latest saved draft.');
    tx.set(ref,{draft,revision:revision+1,updatedAt:FieldValue.serverTimestamp()},{merge:true});
    return {revision:revision+1};
  });
});

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

  // A successfully submitted application is durable in the bank. Clear only
  // this member's *unsubmitted* draft, never the actual application record.
  await applicationDraftRef(identity.uid).delete();
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

// An owner can add a prospective profession to the approval bank without
// granting a role or recording consent on the member's behalf. The member must
// separately accept current terms and pass authorised age access before approval.
export const adminQueueProfessionalRoles = onCall({ region: REGION }, async (request) => {
  const admin = requireAdminIdentity(request);
  const input = (request.data ?? {}) as Record<string, unknown>;
  const userId = cleanText(input.userId, 160);
  const roles = cleanProfessionalRoles(input.roles);
  if (!userId || userId.includes('/') || !Array.isArray(input.roles)
    || input.roles.some((value) => typeof value !== 'string' || !PROFESSIONAL_ROLE_KEYS.includes(value as ProfessionalRole))
    || !roles.length) {
    throw new HttpsError('invalid-argument', 'Select a member and one or more professional roles to queue.');
  }
  const accountDocument = accountRef(userId);
  const applicationDocument = professionalApplicationRef(userId);
  const eventDocument = applicationDocument.collection('events').doc();

  return db.runTransaction(async (tx) => {
    const [accountSnapshot, applicationSnapshot] = await Promise.all([
      tx.get(accountDocument),
      tx.get(applicationDocument),
    ]);
    if (!accountSnapshot.exists) throw new HttpsError('not-found', 'Nightjar member not found.');
    const account = accountSnapshot.data() ?? {};
    if (ADMIN_EMAILS.has(cleanEmail(account.email)) || cleanText(account.role, 30) === 'admin') {
      throw new HttpsError('permission-denied', 'Administrator accounts cannot enter the professional application bank.');
    }
    if (account.status === 'suspended') {
      throw new HttpsError('failed-precondition', 'Suspended members cannot be queued for professional approval.');
    }
    const application = applicationSnapshot.data() ?? {};
    const approved = professionalRolesForAccount(account) as ProfessionalRole[];
    const priorStatus = cleanText(application.status, 30);
    const previousPending = Array.from(new Set([
      ...cleanProfessionalRoles(account.pendingProfessionalRoles),
      ...(['banked', 'waitlist'].includes(priorStatus) ? cleanProfessionalRoles(application.requestedRoles) : []),
    ])).filter((role) => !approved.includes(role));
    const addedRoles = roles.filter((role) => !approved.includes(role) && !previousPending.includes(role));
    if (!addedRoles.length) return {
      userId, queuedRoles: [] as ProfessionalRole[], approvedProfessionalRoles: approved,
      pendingProfessionalRoles: previousPending, unchanged: true,
    };
    const pending = [...previousPending, ...addedRoles];
    const now = FieldValue.serverTimestamp();
    tx.set(accountDocument, {
      pendingProfessionalRoles: pending,
      professionalAccessUpdatedBy: admin.uid,
      professionalAccessUpdatedAt: now,
      updatedAt: now,
    }, { merge: true });
    tx.set(applicationDocument, {
      userId,
      email: cleanEmail(account.email) || null,
      requestedRoles: pending,
      approvedRoles: approved,
      status: 'banked',
      source: 'administrator_role_queue',
      wave: application.wave || 'Administrator role suggestions',
      updatedAt: now,
      ...(applicationSnapshot.exists ? {} : { createdAt: now }),
    }, { merge: true });
    tx.create(eventDocument, {
      userId,
      decision: 'banked',
      source: 'administrator_role_queue',
      roles: addedRoles,
      approvedRolesAfter: approved,
      pendingRolesAfter: pending,
      reviewedBy: admin.uid,
      createdAt: now,
    });
    return {
      userId, queuedRoles: addedRoles, approvedProfessionalRoles: approved,
      pendingProfessionalRoles: pending, unchanged: false,
    };
  });
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
  | 'all_members'
  | 'selected_members';

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
  'selected_members',
]);

const EMAIL_CATEGORIES = new Set<AdminEmailCategory>([
  'testing_update',
  'creator_operations',
  'account_service',
]);

const MAX_EMAIL_CAMPAIGN_RECIPIENTS = 250;
// Include every resolved candidate in the Owner's interactive selection list.
// Existing account and allowlist reads cap each source at 2,000.
const MAX_EMAIL_AUDIENCE_PREVIEW = 4000;

const adminEmailAudienceLabel = (audience: AdminEmailAudience) => ({
  all_professionals: 'All professional creators',
  creator: 'VA Creators',
  writer: 'Writers',
  editor: 'Audio Editors',
  artist: 'Artists',
  all_testers: 'Founding / private-beta testers',
  all_members: 'All active Nightjar members',
  selected_members: 'Selected Nightjar members',
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

/**
 * The final recipient list is ALWAYS derived from the selected audience on
 * the server. Client-supplied addresses can only select existing, eligible
 * audience members; they can never add an arbitrary recipient.
 * Passing no selection preserves legacy campaign behaviour.
 */
const filterAdminEmailRecipients = (available: AdminEmailRecipient[], rawSelection: unknown) => {
  if (rawSelection === undefined) return available;
  if (!Array.isArray(rawSelection) || !rawSelection.length || rawSelection.length > MAX_EMAIL_CAMPAIGN_RECIPIENTS) {
    throw new HttpsError('invalid-argument', 'Choose between 1 and 250 recipients using the live audience switches.');
  }
  const selected = rawSelection.map(value => {
    if (typeof value !== 'string' || value.length > 320) {
      throw new HttpsError('invalid-argument', 'Recipient selection contains an invalid email address.');
    }
    const email = cleanEmail(value);
    if (!validEmailAddress(email)) {
      throw new HttpsError('invalid-argument', 'Recipient selection contains an invalid email address.');
    }
    return email;
  });
  if (new Set(selected).size !== selected.length) {
    throw new HttpsError('invalid-argument', 'Recipient selection must not contain duplicates.');
  }
  const eligible = new Map(available.map(recipient => [recipient.email, recipient]));
  const resolved = selected.map(email => eligible.get(email));
  if (resolved.some(recipient => !recipient)) {
    throw new HttpsError('failed-precondition', 'Your audience changed since preview. Refresh the list and review recipients before sending.');
  }
  return resolved as AdminEmailRecipient[];
};

const escapeEmailHtml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

type AdminEmailPersonalisationOverrides = Partial<Record<'firstName' | 'displayName' | 'role', string>>;

const parseEmailPersonalisationOverrides = (value: unknown): AdminEmailPersonalisationOverrides => {
  if (value === undefined || value === null) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpsError('invalid-argument', 'Personalisation replacements must be named fields.');
  }
  const input = value as Record<string, unknown>;
  const keys = ['firstName','displayName','role'] as const;
  if (Object.keys(input).some(key=>!keys.includes(key as typeof keys[number]))) {
    throw new HttpsError('invalid-argument', 'Unknown personalisation field.');
  }
  const out: AdminEmailPersonalisationOverrides = {};
  for (const key of keys) {
    if (input[key] == null || input[key] === '') continue;
    if (typeof input[key] !== 'string' || input[key].length > 80 || /[\r\n{}]/.test(input[key])) {
      throw new HttpsError('invalid-argument', 'Personalisation replacements must be single-line text of up to 80 characters.');
    }
    const replacement = input[key].trim();
    if (replacement) out[key] = replacement;
  }
  return out;
};

const applyEmailPersonalisation = (
  template: string, recipient: AdminEmailRecipient, overrides: AdminEmailPersonalisationOverrides = {},
) => template
  .replace(/\{\{\s*firstName\s*\}\}/gi, overrides.firstName || recipient.firstName)
  .replace(/\{\{\s*displayName\s*\}\}/gi, overrides.displayName || recipient.displayName)
  .replace(/\{\{\s*role\s*\}\}/gi, overrides.role || recipient.roleLabel);

const emailFooterText = (category: AdminEmailCategory) => {
  if (category === 'testing_update') {
    return "You are receiving this because you are participating in Nightjar's private testing.";
  }
  if (category === 'creator_operations') {
    return 'This is a Nightjar creator-operations message about the platform or your creator participation.';
  }
  return 'This is a Nightjar account/service communication.';
};

const resolveSelectedMemberEmails = async (rawIds: unknown): Promise<AdminEmailRecipient[]> => {
  if (!Array.isArray(rawIds) || !rawIds.length || rawIds.length > 25) {
    throw new HttpsError('invalid-argument', 'Select between 1 and 25 existing Nightjar members.');
  }
  const ids = rawIds.map((value)=>cleanText(value,160));
  if (ids.some(id=>!/^[-A-Za-z0-9_]{6,160}$/.test(id)) || new Set(ids).size!==ids.length) {
    throw new HttpsError('invalid-argument','Select a valid unique member list.');
  }
  // IDs, not caller-supplied email addresses: every recipient is reverified
  // against Firestore at preview AND send time, without an auth bypass.
  const accounts = await Promise.all(ids.map(id=>accountRef(id).get()));
  const profiles = await db.getAll(...ids.map(id=>profileRef(id)));
  const recipients: AdminEmailRecipient[] = [];
  for (let i=0;i<ids.length;i++) {
    const data = accounts[i].data() ?? {};
    const email = cleanEmail(data.email);
    if (!accounts[i].exists || String(data.status ?? 'active')!=='active' || !validEmailAddress(email)
        || ADMIN_EMAILS.has(email) || data.role==='admin') {
      throw new HttpsError('failed-precondition','A selected account is inactive, an administrator, or has no valid email. Refresh the member selection.');
    }
    const profile = profiles[i].data() ?? {};
    const displayName = cleanText(profile.displayName,80) || cleanText(data.displayName,80) || displayNameFromEmail(email);
    recipients.push({
      email, displayName, firstName:firstNameFromDisplayName(displayName),
      roleLabel:professionalRoleLabel(professionalRolesForAccount(data)),
      userId:ids[i], source:'account',
    });
  }
  if(new Set(recipients.map(item=>item.email)).size!==recipients.length) {
    throw new HttpsError('failed-precondition','Two selected accounts share an email address. Select each recipient only once.');
  }
  return recipients;
};

const renderAdminEmail = (
  subjectTemplate: string,
  bodyTemplate: string,
  category: AdminEmailCategory,
  recipient: AdminEmailRecipient,
  overrides: AdminEmailPersonalisationOverrides = {},
) => {
  const subject = applyEmailPersonalisation(subjectTemplate, recipient, overrides).replace(/[\r\n]+/g, ' ').trim();
  const body = applyEmailPersonalisation(bodyTemplate, recipient, overrides).trim();
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



/* ADMIN ASSISTANCE — account-owner support, never an authentication bypass.
   The only privileged data exposed is an exact-match registered account lookup
   to an authenticated owner, and each email action is rate-limited and audited.
   Firebase credential throttles, disabled identities, age verification and
   moderation suspensions cannot be overridden from this surface. */
const assistanceContactTarget = async (email: string) => {
  let user: Awaited<ReturnType<ReturnType<typeof getAuth>['getUserByEmail']>> | null = null;
  try {
    user = await getAuth().getUserByEmail(email);
  } catch (error) {
    if ((error as { code?: string })?.code !== 'auth/user-not-found') throw error;
  }
  if (!user) return null;
  const accountSnapshot = await accountRef(user.uid).get();
  const account = accountSnapshot.data() ?? {};
  const presenter = accountSnapshot.exists ? await accountPresentation(user.uid) : null;
  const access = await closedBetaAccessFor(email, accountSnapshot.exists ? account : null);
  const administrator = ADMIN_EMAILS.has(email) || account.role === 'admin';
  const active = accountSnapshot.exists && account.status !== 'suspended' && !user.disabled && access.allowed && !administrator;
  return {
    user,
    account,
    presenter,
    access,
    administrator,
    registered: accountSnapshot.exists,
    canReset: active && user.emailVerified === true,
    canVerify: active && user.emailVerified !== true,
  };
};

export const adminAccountAssistanceLookup = onCall({ region: REGION }, async (request) => {
  requireAdminIdentity(request);
  const email = cleanEmail((request.data as { email?: unknown } | undefined)?.email);
  if (!validEmailAddress(email)) throw new HttpsError('invalid-argument', 'Enter a valid account email address.');
  const target = await assistanceContactTarget(email);
  if (!target) return {
    found: false,
    email: maskSecurityEmail(email),
    message: 'No Firebase account exists for this address. Do not treat this as a verified member.',
    attempts: [],
    history: [],
  };

  const hash = createHash('sha256').update(email).digest('hex');
  const [eventsSnapshot, actionsSnapshot] = await Promise.all([
    db.collection('authenticationEvents').where('emailHash', '==', hash).limit(100).get(),
    db.collection('adminAssistanceEvents').where('targetUid', '==', target.user.uid).limit(100).get(),
  ]);
  const attempts = eventsSnapshot.docs.map(doc => {
    const entry = doc.data() ?? {};
    return {
      id: doc.id,
      type: cleanText(entry.eventType, 80),
      reasonCode: cleanText(entry.firebaseCode, 100) || 'auth/unknown',
      createdAt: toIso(entry.createdAt),
    };
  }).sort((a,b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0,20);
  const recentWindow = Date.now() - 15 * 60 * 1000;
  const recentFailures = attempts.filter(entry => Boolean(entry.createdAt) && new Date(entry.createdAt!).getTime() >= recentWindow).length;
  const history = actionsSnapshot.docs.map(doc => {
    const entry = doc.data() ?? {};
    return {
      id: doc.id,
      kind: cleanText(entry.kind, 40),
      status: cleanText(entry.status, 30),
      note: cleanText(entry.note, 360),
      by: cleanEmail(entry.adminEmail),
      createdAt: toIso(entry.createdAt),
    };
  }).sort((a,b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0,12);

  return {
    found: true,
    userId: target.user.uid,
    email: target.user.email ?? email,
    displayName: target.presenter?.displayName ?? 'Nightjar account',
    emailVerified: target.user.emailVerified === true,
    firebaseDisabled: target.user.disabled === true,
    registered: target.registered,
    administrator: target.administrator,
    nightjarStatus: cleanText(target.account.status, 40) || (target.registered ? 'active' : 'not registered in Nightjar'),
    betaAllowed: target.access.allowed,
    betaAccessReason: target.access.reason,
    canReset: target.canReset,
    canVerify: target.canVerify,
    lastSignIn: target.user.metadata.lastSignInTime ?? null,
    recentFailures,
    firebaseRateLimitObserved: attempts.some(entry =>
      entry.reasonCode === 'auth/too-many-requests' &&
      Boolean(entry.createdAt) &&
      new Date(entry.createdAt!).getTime() > Date.now() - 60 * 60 * 1000,
    ),
    cooldown: { source: 'firebase_if_applicable', nightjarCooldownActive: false, providerUnlockAvailable: false, endsAt: null },
    attempts,
    history,
  };
});

export const adminSendAccountAssistanceEmail = onCall({
  region: REGION,
  secrets: [NIGHTJAR_GMAIL_CLIENT_ID, NIGHTJAR_GMAIL_CLIENT_SECRET],
  timeoutSeconds: 120,
}, async (request) => {
  const admin = requireAdminIdentity(request);
  const input = (request.data ?? {}) as Record<string, unknown>;
  const email = cleanEmail(input.email);
  const kind = cleanText(input.kind, 40);
  const note = cleanText(input.note, 360);
  if (!validEmailAddress(email) || !['password_reset', 'email_verification'].includes(kind)) {
    throw new HttpsError('invalid-argument', 'Choose an existing account and a supported recovery action.');
  }
  if (input.memberRequested !== true || note.length < 12) {
    throw new HttpsError('failed-precondition', 'Confirm the user requested assistance and record a brief support reason.');
  }
  const target = await assistanceContactTarget(email);
  if (!target || !target.registered || target.administrator) {
    throw new HttpsError('failed-precondition', 'This account cannot be assisted through the member support workflow.');
  }
  if ((kind === 'password_reset' && !target.canReset) || (kind === 'email_verification' && !target.canVerify)) {
    throw new HttpsError('failed-precondition', 'Account status, verification or access permissions do not allow this action.');
  }
  // Secure one-use links are generated by Firebase and delivered exclusively
  // to the registered account email. They are never returned to the browser.
  const accessToken = await gmailAccessToken();
  const link = kind === 'password_reset'
    ? await getAuth().generatePasswordResetLink(email)
    : await getAuth().generateEmailVerificationLink(email);
  const lockRef = accountRef(target.user.uid).collection('assistance').doc('emailDelivery');
  const now = Date.now();
  const dateKey = new Date(now).toISOString().slice(0, 10);
  await db.runTransaction(async tx => {
    const snap = await tx.get(lockRef);
    const state = snap.data() ?? {};
    const count = state.dateKey === dateKey ? Number(state.sentCount ?? 0) : 0;
    if (count >= 3 || (Number(state.lastSentAtMs ?? 0) > now - 15 * 60_000) ||
      (state.status === 'sending' && Number(state.requestedAtMs ?? 0) > now - 2 * 60_000)) {
      throw new HttpsError('resource-exhausted', 'Recovery email limit reached. Do not repeatedly send reset links.');
    }
    tx.set(lockRef, { status: 'sending', requestedAtMs: now, dateKey, sentCount: count,
      updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  });
  let status: 'sent' | 'failed' = 'failed';
  try {
    const subject = kind === 'password_reset' ? 'Nightjar account assistance — reset your password' : 'Nightjar account assistance — verify your email';
    const intro = kind === 'password_reset'
      ? 'You requested help signing in to Nightjar. Use this Firebase-secured link to choose a new password:'
      : 'You requested help verifying your Nightjar account. Open this secure email verification link:';
    const message = {
      subject,
      text: intro + '\n\n' + link + '\n\nIf you did not request help, you can ignore this email. Never share a password or verification code with any Nightjar administrator.\n\nNightjar Support',
      html: '<div style="font:15px/1.6 Arial,sans-serif;background:#171119;color:#f4eaf5;padding:26px;border-radius:14px"><h2>Nightjar account assistance</h2><p>' +
        escapeEmailHtml(intro) + '</p><p><a href="' + escapeEmailHtml(link) + '" style="color:#f0c9ee">Open secure account link</a></p>' +
        '<p>If you did not request help, ignore this message. Nightjar will never ask for your password or verification code.</p></div>',
    };
    await sendGmailApiMessage({
      accessToken,
      fromEmail: NIGHTJAR_GMAIL_SENDER_EMAIL,
      fromName: 'Nightjar Support',
      replyTo: NIGHTJAR_GMAIL_SENDER_EMAIL,
      message: { toEmail: email, toName: target.presenter?.displayName ?? 'Nightjar member', ...message },
    });
    status = 'sent';
    await lockRef.set({
      status: 'sent', lastSentAtMs: Date.now(), dateKey,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    // Use a transaction for the counter to tolerate concurrent owners.
    await db.runTransaction(async tx => {
      const snap = await tx.get(lockRef);
      const data = snap.data() ?? {};
      tx.set(lockRef, { sentCount: Number(data.sentCount ?? 0) + 1 }, { merge: true });
    });
    return { sent: true, recipient: maskSecurityEmail(email), kind };
  } catch (error) {
    await lockRef.set({ status: 'failed', updatedAt: FieldValue.serverTimestamp() }, { merge:true });
    throw new HttpsError('unavailable', 'Nightjar could not deliver this recovery email. Check Nightjar Mail connection and retry after reviewing the error.');
  } finally {
    await db.collection('adminAssistanceEvents').add({
      targetUid: target.user.uid,
      kind,
      status,
      note,
      adminUid: admin.uid,
      adminEmail: admin.email,
      recipientMasked: maskSecurityEmail(email),
      createdAt: FieldValue.serverTimestamp(),
    });
  }
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
  const selectedUserIds = (request.data as Record<string,unknown> | undefined)?.selectedUserIds;
  const recipients = audience === 'selected_members'
    ? await resolveSelectedMemberEmails(selectedUserIds)
    : await resolveAdminEmailAudience(audience);
  return {
    audience,
    audienceLabel: adminEmailAudienceLabel(audience),
    recipientCount: recipients.length,
    sendLimit: MAX_EMAIL_CAMPAIGN_RECIPIENTS,
    overSendLimit: recipients.length > MAX_EMAIL_CAMPAIGN_RECIPIENTS,
    recipients: recipients.slice(0, MAX_EMAIL_AUDIENCE_PREVIEW).map((recipient) => ({
      email: recipient.email,
      displayName: recipient.displayName,
      roleLabel: recipient.roleLabel,
      source: recipient.source,
    })),
    recipientPreviewTruncated: recipients.length > MAX_EMAIL_AUDIENCE_PREVIEW,
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
  const personalisationOverrides = parseEmailPersonalisationOverrides(input.personalisationOverrides);
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
    const rendered = renderAdminEmail(subjectTemplate, bodyTemplate, category, recipient, personalisationOverrides);
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
  const personalisationOverrides = parseEmailPersonalisationOverrides(input.personalisationOverrides);
  const audience = cleanText(input.audience, 40) as AdminEmailAudience;
  const selectedUserIds = input.selectedUserIds;
  const selectedRecipientEmails = input.selectedRecipientEmails;
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

  const availableRecipients = audience === 'selected_members'
    ? await resolveSelectedMemberEmails(selectedUserIds)
    : await resolveAdminEmailAudience(audience);
  const recipients = filterAdminEmailRecipients(availableRecipients, selectedRecipientEmails);
  if (!recipients.length) throw new HttpsError('failed-precondition', 'Select at least one live audience recipient before sending.');
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
    personalisationOverrides,
    category,
    audience,
    audienceLabel: adminEmailAudienceLabel(audience),
    ...(audience === 'selected_members' ? { selectedUserIds: recipients.map(item=>item.userId) } : {}),
    selectedRecipientEmails: recipients.map(item => item.email),
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
    const rendered = renderAdminEmail(subjectTemplate, bodyTemplate, category, recipient, personalisationOverrides);
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
    const rendered = renderAdminEmail(cleanText(campaign.subject, 180), cleanText(campaign.body, 12000), category, recipient, parseEmailPersonalisationOverrides(campaign.personalisationOverrides));
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


// NIGHTJAR TEAM COMMUNITY — an editorial channel, not an admin-account data surface.
// These endpoints return only explicitly published copy. Member feedback is a
// separate, admin-only inbox; it is never included in public feed responses.
const nightjarTeamUpdates = db.collection('nightjarTeamUpdates');
const nightjarTeamFeedback = db.collection('nightjarTeamFeedback');
type NightjarTeamTopic = 'news' | 'celebration' | 'you_said_we_did';
const nightjarTeamTopics = new Set<NightjarTeamTopic>(['news','celebration','you_said_we_did']);
const teamText = (value:unknown, maxLength:number) => {
  const text = cleanText(value,maxLength + 1);
  if(text.length>maxLength)throw new HttpsError('invalid-argument','Nightjar Team text exceeds the allowed length.');
  return text;
};
const teamPostPublic = (id:string,record:Record<string,any>) => ({
  id,
  topic:nightjarTeamTopics.has(record.topic)?record.topic:'news',
  title:cleanText(record.title,120),
  body:cleanText(record.body,2400),
  creatorName:cleanText(record.creatorName,100),
  status:record.status==='published'?'published':record.status==='archived'?'archived':'draft',
  publishedAt:record.publishedAt?.toDate?.()?.toISOString?.()??null,
  updatedAt:record.updatedAt?.toDate?.()?.toISOString?.()??null,
  revision:Math.max(0,Number(record.revision??0)),
});
export const listNightjarTeamUpdates = onCall({region:REGION},async(request)=>{
  const identity=await requireActiveIdentity(request);
  await requireAgeVerified(identity.uid);
  const [published,adminPosts,feedback]=await Promise.all([
    nightjarTeamUpdates.where('status','==','published').limit(100).get(),
    identity.admin?nightjarTeamUpdates.limit(120).get():Promise.resolve(null),
    identity.admin?nightjarTeamFeedback.limit(120).get():Promise.resolve(null),
  ]);
  const source=adminPosts??published;
  const posts=source.docs.map(doc=>teamPostPublic(doc.id,doc.data()))
    .filter(post=>identity.admin||post.status==='published')
    .sort((a,b)=>String(b.publishedAt??b.updatedAt??'').localeCompare(String(a.publishedAt??a.updatedAt??'')))
    .slice(0,40);
  // No feedback fields are constructed or returned for non-administrators.
  const inbox=identity.admin&&feedback?feedback.docs.map(doc=>{
    const data=doc.data()??{};
    return {
      id:doc.id, topic:cleanText(data.topic,30), message:cleanText(data.message,1400),
      status:data.status==='reviewed'?'reviewed':'new',
      createdAt:data.createdAt?.toDate?.()?.toISOString?.()??null,
      memberName:cleanText(data.memberName,80)||'Nightjar member',
    };
  }).sort((a,b)=>String(b.createdAt??'').localeCompare(String(a.createdAt??''))).slice(0,50):[];
  return {posts,feedback:inbox};
});
export const saveNightjarTeamUpdate = onCall({region:REGION},async(request)=>{
  const identity=requireAdminIdentity(request);
  const input=(request.data??{}) as Record<string,unknown>;
  const id=cleanText(input.id,160);
  if(id && !/^[A-Za-z0-9_-]{8,160}$/.test(id))throw new HttpsError('invalid-argument','Invalid team post ID.');
  const topic=teamText(input.topic,32) as NightjarTeamTopic;
  if(!nightjarTeamTopics.has(topic))throw new HttpsError('invalid-argument','Unknown team update category.');
  const title=teamText(input.title,120);
  const body=teamText(input.body,2400);
  const creatorName=teamText(input.creatorName,100);
  if(title.length<5||body.length<15)throw new HttpsError('invalid-argument','Add a title and a meaningful message.');
  const status=teamText(input.status,24);
  if(!['draft','published','archived'].includes(status))throw new HttpsError('invalid-argument','Invalid team post status.');
  const expectedRevision=Number(input.expectedRevision??0);
  if(!Number.isSafeInteger(expectedRevision)||expectedRevision<0)throw new HttpsError('invalid-argument','Invalid post revision.');
  const ref=id?nightjarTeamUpdates.doc(id):nightjarTeamUpdates.doc();
  const revision=await db.runTransaction(async(tx)=>{
    const prior=await tx.get(ref);
    if(id&&!prior.exists)throw new HttpsError('not-found','Team post no longer exists.');
    const currentRevision=Number(prior.data()?.revision??0);
    if(currentRevision!==expectedRevision)throw new HttpsError('aborted','This post changed on another device. Refresh before saving.');
    const record={
      topic,title,body,creatorName,status,revision:currentRevision+1,
      updatedAt:FieldValue.serverTimestamp(),
      updatedBy:identity.uid,
      ...(!prior.exists?{createdAt:FieldValue.serverTimestamp(),createdBy:identity.uid}:{}),
      ...(status==='published'&&!prior.data()?.publishedAt?{publishedAt:FieldValue.serverTimestamp()}:{}),
    };
    tx.set(ref,record,{merge:true});
    return currentRevision+1;
  });
  return {id:ref.id,revision,status};
});
export const submitNightjarTeamFeedback = onCall({region:REGION},async(request)=>{
  const identity=await requireActiveIdentity(request);
  await requireAgeVerified(identity.uid);
  const input=(request.data??{}) as Record<string,unknown>;
  const topic=teamText(input.topic,24);
  if(!['idea','appreciation','concern'].includes(topic))throw new HttpsError('invalid-argument','Choose a feedback category.');
  const message=teamText(input.message,1400);
  if(message.length<15)throw new HttpsError('invalid-argument','Please provide at least 15 characters of feedback.');
  const member=await profileRef(identity.uid).get();
  const displayName=cleanText(member.data()?.displayName,80)||'Nightjar member';
  const throttle=accountRef(identity.uid).collection('rateLimits').doc('teamFeedback');
  const feedbackRef=nightjarTeamFeedback.doc();
  const now=Date.now();
  const day=new Date(now).toISOString().slice(0,10);
  await db.runTransaction(async(tx)=>{
    const earlier=await tx.get(throttle);
    const prior=earlier.data()??{};
    if(now-Number(prior.lastAtMs??0)<10*60_000)throw new HttpsError('resource-exhausted','Please allow ten minutes between feedback submissions.');
    const count=prior.day===day?Number(prior.count??0):0;
    if(count>=10)throw new HttpsError('resource-exhausted','Your daily feedback limit has been reached.');
    tx.set(throttle,{day,count:count+1,lastAtMs:now,updatedAt:FieldValue.serverTimestamp()});
    tx.create(feedbackRef,{
      topic,message,memberName:displayName,memberUserId:identity.uid,
      status:'new',createdAt:FieldValue.serverTimestamp(),
    });
  });
  return {received:true};
});
export const reviewNightjarTeamFeedback = onCall({region:REGION},async(request)=>{
  const identity=requireAdminIdentity(request);
  const input=(request.data??{}) as Record<string,unknown>;
  const id=cleanText(input.id,160);
  if(!/^[A-Za-z0-9_-]{8,160}$/.test(id))throw new HttpsError('invalid-argument','Invalid feedback ID.');
  const ref=nightjarTeamFeedback.doc(id);
  const existing=await ref.get();
  if(!existing.exists)throw new HttpsError('not-found','Feedback item no longer exists.');
  await ref.update({status:'reviewed',reviewedAt:FieldValue.serverTimestamp(),reviewedBy:identity.uid});
  return {reviewed:true};
});

// User-owned directory shortcuts. The backend is authoritative; the first
// account write may migrate up to eight browser-only shortcuts from older clients.
// Optimistic revisions prevent a stale phone from overwriting edits on desktop.
type SavedDirectoryView = {
  id: string; name: string; query: string;
  role: 'all' | 'creator' | 'writer' | 'editor' | 'artist' | 'listener';
  tag: string; availability: string;
};
const savedDirectoryViewsFor = (uid: string) => accountRef(uid).collection('privateSettings').doc('directoryViews');
const normaliseDirectoryViews = (raw: unknown): SavedDirectoryView[] => {
  if (!Array.isArray(raw) || raw.length > 8) {
    throw new HttpsError('invalid-argument', 'You may save up to eight directory views.');
  }
  const seen = new Set<string>();
  return raw.map((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new HttpsError('invalid-argument', 'Invalid saved directory view.');
    }
    const item = entry as Record<string, unknown>;
    const id = cleanText(item.id, 80);
    const name = cleanText(item.name, 160);
    const query = cleanText(item.query, 120);
    const role = cleanText(item.role, 16) || 'all';
    const tag = cleanText(item.tag, 100) || 'all';
    const availability = cleanText(item.availability, 100) || 'all';
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(id) || !name || seen.has(id)
      || !['all','creator','writer','editor','artist','listener'].includes(role)) {
      throw new HttpsError('invalid-argument', 'Invalid or duplicate saved directory view.');
    }
    seen.add(id);
    return { id, name, query, role: role as SavedDirectoryView['role'], tag, availability };
  });
};
const directoryViewsSnapshot = (data: Record<string, any> | undefined) => ({
  revision: Math.max(0, Number(data?.revision ?? 0)),
  views: Array.isArray(data?.views) ? data.views as SavedDirectoryView[] : [],
});
export const getMyDirectoryViews = onCall({ region: REGION }, async (request) => {
  const identity = await requireActiveIdentity(request);
  await requireAgeVerified(identity.uid);
  const document = await savedDirectoryViewsFor(identity.uid).get();
  return directoryViewsSnapshot(document.data());
});
export const saveMyDirectoryViews = onCall({ region: REGION }, async (request) => {
  const identity = await requireActiveIdentity(request);
  await requireAgeVerified(identity.uid);
  const input = (request.data ?? {}) as Record<string, unknown>;
  const expectedRevision = Number(input.expectedRevision);
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
    throw new HttpsError('invalid-argument', 'Invalid saved-view version.');
  }
  const views = normaliseDirectoryViews(input.views);
  const reference = savedDirectoryViewsFor(identity.uid);
  return db.runTransaction(async (tx) => {
    const current = directoryViewsSnapshot((await tx.get(reference)).data());
    if (current.revision !== expectedRevision) return { saved: false, ...current };
    const revision = expectedRevision + 1;
    tx.set(reference, {
      ownerUserId: identity.uid, views, revision, updatedAt: FieldValue.serverTimestamp(),
    });
    return { saved: true, revision, views };
  });
});

// Low-cost listener experience additions. Reads are on demand; no scheduled
// fan-out, external API, or extra queue infrastructure is involved.
const momentMarksFor = (uid: string) => accountRef(uid).collection('momentMarks');
// All saves and removals lock this private per-account quota document in a
// transaction. A query-only count cannot prevent two simultaneous inserts.
const momentMarksQuotaFor = (uid: string) => accountRef(uid).collection('privateSettings').doc('momentMarksQuota');
const safeListeningBoundaries = (input: Record<string, unknown>) => ({
  excludedRatings: cleanStringList(input.excludedRatings, 4).filter((value) =>
    ['sfw','suggestive','adult','explicit'].includes(value)),
  hiddenTerms: cleanStringList(input.hiddenTerms, 12).map((term) => term.toLowerCase()),
});

export const getMyListeningBoundaries = onCall({ region: REGION }, async (request) => {
  const identity = await requireActiveIdentity(request);
  await requireAgeVerified(identity.uid);
  const doc = await accountRef(identity.uid).collection('privateSettings').doc('listening').get();
  return { preferences: safeListeningBoundaries(doc.data() ?? {}) };
});

export const saveMyListeningBoundaries = onCall({ region: REGION }, async (request) => {
  const identity = await requireActiveIdentity(request);
  await requireAgeVerified(identity.uid);
  const preferences = safeListeningBoundaries((request.data ?? {}) as Record<string, unknown>);
  await accountRef(identity.uid).collection('privateSettings').doc('listening').set({
    ...preferences, updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  return { preferences };
});

export const listMomentMarks = onCall({ region: REGION }, async (request) => {
  const identity = await requireActiveIdentity(request);
  await requireAgeVerified(identity.uid);
  const snapshot = await momentMarksFor(identity.uid).limit(60).get();
  const marks = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as Array<{ id: string; releaseId?: string; label?: string; positionSeconds?: number; createdAt?: unknown }>;
  // A saved moment must never expose artwork, titles or a playback URL for
  // a release that is no longer published.
  const releaseIds = [...new Set(marks.map((m) => cleanText(m.releaseId, 160)).filter(Boolean))];
  const releaseSnapshots = releaseIds.length ? await db.getAll(...releaseIds.map((id) => releaseRef(id))) : [];
  const released = new Map(releaseSnapshots.filter((doc) => doc.data()?.status === 'released')
    .map((doc) => [doc.id, releasePayload(doc.data() ?? {}, doc.id)]));
  return { marks: marks.filter((m) => released.has(String(m.releaseId))).map((m) => ({
    id: m.id, releaseId: m.releaseId, label: cleanText(m.label, 80),
    positionSeconds: Math.max(0, Number(m.positionSeconds ?? 0)),
    createdAt: toIso(m.createdAt), release: released.get(String(m.releaseId)),
  })).sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? ''))) };
});

export const saveMomentMark = onCall({ region: REGION }, async (request) => {
  const identity = await requireActiveIdentity(request);
  await requireAgeVerified(identity.uid);
  const input = (request.data ?? {}) as Record<string, unknown>;
  const releaseId = cleanText(input.releaseId, 160);
  const seconds = Number(input.positionSeconds);
  if (!releaseId || !Number.isFinite(seconds) || seconds < 0 || seconds > 24 * 60 * 60) {
    throw new HttpsError('invalid-argument','Choose a valid playback moment.');
  }
  const release = await releaseRef(releaseId).get();
  if (!release.exists || release.data()?.status !== 'released') {
    throw new HttpsError('not-found','This release is no longer available.');
  }
  const collection = momentMarksFor(identity.uid);
  const quotaRef = momentMarksQuotaFor(identity.uid);
  const doc = collection.doc();
  // Two simultaneous devices must compete on the same quota reference.
  // Bootstrap from existing marks for accounts created before this fix.
  return db.runTransaction(async (tx) => {
    const quota = await tx.get(quotaRef);
    const count = quota.exists
      ? quota.data()?.count
      : (await tx.get(collection.limit(61))).size;
    if (!Number.isSafeInteger(count) || count < 0) {
      throw new HttpsError('failed-precondition','Saved moment quota needs review.');
    }
    if (count >= 60) throw new HttpsError('resource-exhausted','You can save up to 60 moments. Remove one to add another.');
    tx.create(doc, {
      releaseId, positionSeconds: Math.round(seconds * 10) / 10,
      label: cleanText(input.label, 80) || 'Saved moment',
      createdAt: FieldValue.serverTimestamp(),
    });
    tx.set(quotaRef, { count: count + 1, updatedAt: FieldValue.serverTimestamp() });
    return { saved: true, markId: doc.id };
  });
});

export const deleteMomentMark = onCall({ region: REGION }, async (request) => {
  const identity = await requireActiveIdentity(request);
  await requireAgeVerified(identity.uid);
  const markId = cleanText((request.data as { markId?: unknown } | undefined)?.markId, 160);
  if (!markId || markId.includes('/')) throw new HttpsError('invalid-argument','Moment identifier is required.');
  const collection = momentMarksFor(identity.uid);
  const quotaRef = momentMarksQuotaFor(identity.uid);
  return db.runTransaction(async (tx) => {
    const doc = collection.doc(markId);
    const existing = await tx.get(doc);
    if (!existing.exists) return { deleted: true };
    const quota = await tx.get(quotaRef);
    const count = quota.exists
      ? quota.data()?.count
      : (await tx.get(collection.limit(61))).size;
    if (!Number.isSafeInteger(count) || count < 1) {
      throw new HttpsError('failed-precondition','Saved moment quota needs review.');
    }
    tx.delete(doc);
    tx.set(quotaRef, { count: count - 1, updatedAt: FieldValue.serverTimestamp() });
    return { deleted: true };
  });
});

// VA Calling Cards deliberately feature an already moderated and published
// recording. New unmoderated audio-upload paths are not added.
export const saveVoiceCallingCard = onCall({ region: REGION }, async (request) => {
  const identity = await requireAccountRole(request, ['creator']);
  await requireAgeVerified(identity.uid);
  const releaseId = cleanText((request.data as { releaseId?: unknown } | undefined)?.releaseId, 160);
  if (!releaseId) {
    await profileRef(identity.uid).set({ voiceCallingCardReleaseId: null }, { merge: true });
    return { releaseId: null };
  }
  const release = await releaseRef(releaseId).get();
  if (!release.exists || release.data()?.creatorUserId !== identity.uid || release.data()?.status !== 'released') {
    throw new HttpsError('failed-precondition','Choose one of your published, moderated recordings.');
  }
  await profileRef(identity.uid).set({ voiceCallingCardReleaseId: releaseId }, { merge: true });
  return { releaseId };
});

export const getVoiceCallingCard = onCall({ region: REGION }, async (request) => {
  const identity = await requireActiveIdentity(request);
  await requireAgeVerified(identity.uid);
  const creatorId = cleanText((request.data as { creatorUserId?: unknown } | undefined)?.creatorUserId, 160);
  if (!creatorId) throw new HttpsError('invalid-argument','Creator required.');
  const [account, profile] = await Promise.all([accountRef(creatorId).get(), profileRef(creatorId).get()]);
  if (account.data()?.status !== 'active' || !professionalRolesForAccount(account.data() ?? {}).includes('creator')
    || !profile.exists || (profile.data()?.publicProfile === false && identity.uid !== creatorId)) return { release: null, releaseId: null };
  const releaseId = cleanText(profile.data()?.voiceCallingCardReleaseId, 160);
  if (!releaseId) return { release: null, releaseId: null };
  const doc = await releaseRef(releaseId).get();
  if (!doc.exists || doc.data()?.creatorUserId !== creatorId || doc.data()?.status !== 'released') {
    return { release: null, releaseId: null };
  }
  const subscription = identity.admin ? null : await activeListeningSubscriptionFor(identity.uid);
  return { releaseId, release: decorateReleaseAccess(doc.data() ?? {}, releaseId, identity.uid, {
    admin: identity.admin, subscription,
  }) };
});

export const myProductionTimeline = onCall({ region: REGION }, async (request) => {
  const identity = await requireActiveIdentity(request);
  await requireAgeVerified(identity.uid);
  const uid = identity.uid;
  const [releases, scripts, editors, artworks] = await Promise.all([
    db.collection('releases').where('creatorUserId','==',uid).limit(100).get(),
    db.collection('scripts').where('writerUserId','==',uid).limit(100).get(),
    db.collection('editorPortfolio').where('ownerUserId','==',uid).limit(80).get(),
    db.collection('artistPortfolio').where('ownerUserId','==',uid).limit(80).get(),
  ]);
  const entries = [
    ...releases.docs.map((doc) => ({ id: doc.id, role:'creator', kind:'audio',
      title: cleanText(doc.data().title, 160), status: cleanText(doc.data().status, 60),
      updatedAt: toIso(doc.data().updatedAt), createdAt: toIso(doc.data().createdAt) })),
    ...scripts.docs.map((doc) => ({ id: doc.id, role:'writer', kind:'script',
      title: cleanText(doc.data().title, 160), status: cleanText(doc.data().status, 60),
      updatedAt: toIso(doc.data().updatedAt), createdAt: toIso(doc.data().createdAt) })),
    ...editors.docs.map((doc) => ({ id: doc.id, role:'editor', kind:'showcase',
      title: cleanText(doc.data().title, 160), status: cleanText(doc.data().status, 60),
      updatedAt: toIso(doc.data().updatedAt), createdAt: toIso(doc.data().createdAt) })),
    ...artworks.docs.map((doc) => ({ id: doc.id, role:'artist', kind:'artwork',
      title: cleanText(doc.data().title, 160), status: cleanText(doc.data().status, 60),
      updatedAt: toIso(doc.data().updatedAt), createdAt: toIso(doc.data().createdAt) })),
  ].sort((a,b) => String(b.updatedAt ?? b.createdAt ?? '').localeCompare(String(a.updatedAt ?? a.createdAt ?? '')));
  return { entries: entries.slice(0,200) };});

// Verified credit workflow uses the same account and administrator identity gates.
export const {
  claimMyReleaseCredit, inviteCreditedContributor, respondToCreditInvitation, respondToCreditClaim, adminReviewCreditClaim, appealCreditClaim,
  getCreditClaim, listMyCreditClaims, adminListCreditClaims,
} = buildVerifiedCreditCallables(
  requireActiveIdentity, requireAdminIdentity, requireAgeVerified,
  createNotification,
  async () => {
    // Official administrators only: the contributor or uploader can never
    // independently approve their own claim through this notification queue.
    const accounts = await db.collection('accounts').where('role','==','admin').limit(50).get();
    return accounts.docs.filter(doc => {
      const account = doc.data();
      return ADMIN_EMAILS.has(cleanEmail(account.email)) && account.status === 'active';
    }).map(doc => doc.id);
  },
);

// NightJar Quality Centre: authenticated feedback and independently observed
// release acceptance. These records never grant professional roles, allow
// commerce, disable Didit or override the closed-beta gate.
export const {
  submitTesterFeedback,adminListTesterFeedback,adminReviewTesterFeedback,
  adminGetQualityAcceptance,adminRecordQualityCheck,
} = buildNightjarQualityCallables(requireActiveIdentity,requireAdminIdentity,requireAgeVerified);
