// Administrator-only operational alerts. Status changes are observed on the server,
// not through browser polling, and only the verified owner allowlist may receive them.
import { createHash } from 'node:crypto';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';

const REGION = 'europe-west2';
const ADMIN_EMAILS = [
  'mike.owen230792@gmail.com',
  'megan.wright666@hotmail.com',
  'nightjar.audio.app@gmail.com',
] as const;

// Only non-sensitive category labels are used in device push payloads.
const CATEGORIES = {
  professionalApplications: { title: 'Professional application awaiting approval', route: '/admin/approvals', subtype: 'professional_approval' },
  releases: { title: 'Recording awaiting moderation', route: '/admin?work=release-moderation', subtype: 'release_verification' },
  scripts: { title: 'Manuscript awaiting editorial attention', route: '/admin/editorial', subtype: 'script_submission' },
  images: { title: 'Image awaiting moderation', route: '/admin/images', subtype: 'image_verification' },
  reviews: { title: 'Review awaiting moderation', route: '/admin/reviews', subtype: 'review_verification' },
  editorPortfolio: { title: 'Editor showcase awaiting review', route: '/admin/editorial', subtype: 'editor_portfolio' },
  reports: { title: 'Reported content needs review', route: '/admin/reports', subtype: 'report_review' },
  security: { title: 'Security alert needs review', route: '/admin/workspace/security', subtype: 'security_alert' },
  suggestions: { title: 'Creator recommendation received', route: '/admin/suggestions', subtype: 'creator_suggestion' },
  billing: { title: 'Subscription requires attention', route: '/admin/subscriptions', subtype: 'payment_attention' },
} as const;
type Category = keyof typeof CATEGORIES;
const KEYS = Object.keys(CATEGORIES) as Category[];
const clean = (value: unknown) => String(value ?? '').trim().toLowerCase();
const defaultPreferences = () => Object.fromEntries(KEYS.map(k => [k, true])) as Record<Category, boolean>;
const normalisePreferences = (raw: Record<string, unknown> | undefined) =>
  Object.fromEntries(KEYS.map(k => [k, raw?.[k] !== false])) as Record<Category, boolean>;

const adminIdentity = (request: { auth?: { uid: string; token: Record<string, unknown> } | null }) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in to Nightjar.');
  const email = clean(request.auth.token.email);
  if (request.auth.token.email_verified !== true || !ADMIN_EMAILS.includes(email as typeof ADMIN_EMAILS[number])) {
    throw new HttpsError('permission-denied', 'Nightjar administrator account required.');
  }
  return { uid: request.auth.uid, email };
};

export const getAdminAttentionPreferences = onCall({ region: REGION }, async request => {
  const admin = adminIdentity(request);
  const account = await getFirestore().collection('accounts').doc(admin.uid).get();
  return { preferences: normalisePreferences(account.data()?.adminAttentionPreferences) };
});

export const saveAdminAttentionPreferences = onCall({ region: REGION }, async request => {
  const admin = adminIdentity(request);
  const input = request.data;
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new HttpsError('invalid-argument', 'Provide administrator notification preferences.');
  }
  const preferences = normalisePreferences(input as Record<string, unknown>);
  await getFirestore().collection('accounts').doc(admin.uid).set({
    adminAttentionPreferences: preferences,
    adminAttentionPreferencesUpdatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  return { preferences };
});

const isPending = (category: Category, data: Record<string, any> | undefined) => {
  if (!data) return false;
  const status = String(data.status ?? '');
  switch (category) {
    case 'professionalApplications':
      return ['banked','waitlist'].includes(status)
        && Array.isArray(data.requestedRoles)
        && data.requestedRoles.some((role: unknown) => !Array.isArray(data.approvedRoles) || !data.approvedRoles.includes(role));
    case 'releases': case 'editorPortfolio': return status === 'pending_review';
    case 'scripts': return status === 'Submitted' && !data.editorUserId;
    case 'images': case 'reviews': return status === 'pending';
    case 'reports': case 'security': return status === 'open';
    case 'suggestions': return status === 'new';
    case 'billing': return ['past_due','unpaid','incomplete_expired','failed'].includes(status);
  }
};

const newAttention = (category: Category, before: Record<string, any> | undefined, after: Record<string, any> | undefined) => {
  if (!isPending(category, after)) return false;
  if (!isPending(category, before)) return true;
  if (category === 'professionalApplications') {
    const outstanding = (item: Record<string, any>) =>
      (Array.isArray(item.requestedRoles) ? item.requestedRoles : [])
        .filter((role: string) => !Array.isArray(item.approvedRoles) || !item.approvedRoles.includes(role))
        .sort().join(',');
    return outstanding(before ?? {}) !== outstanding(after ?? {});
  }
  return false;
};

const notifyAdmin = async (uid: string, category: Category, recordId: string, key: string) => {
  const db = getFirestore();
  const accountRef = db.collection('accounts').doc(uid);
  const account = await accountRef.get();
  const email = clean(account.data()?.email);
  // An owner must also possess the exact Firebase Auth identity; role text in
  // an account document is never sufficient to qualify as an Administrator.
  if (email && !ADMIN_EMAILS.includes(email as typeof ADMIN_EMAILS[number])) return;
  const choice = CATEGORIES[category];
  const notificationId = 'owner-' + createHash('sha256').update(key).digest('hex').slice(0, 40);
  const notificationRef = accountRef.collection('notifications').doc(notificationId);
  try {
    await notificationRef.create({
      type: 'admin_attention',
      subtype: choice.subtype,
      category,
      title: choice.title,
      message: 'Administrator input is required. Open the relevant Nightjar review queue.',
      route: choice.route,
      itemId: recordId,
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (error: any) {
    if (Number(error?.code) === 6 || error?.code === 'already-exists') return;
    throw error;
  }

  const preferences = normalisePreferences(account.data()?.adminAttentionPreferences);
  if (!preferences[category]) return; // In-app record remains available.
  const devices = await accountRef.collection('pushDevices').where('active','==',true).limit(20).get();
  const targets = devices.docs.filter(d => typeof d.data().token === 'string' && d.data().token.length > 31);
  if (!targets.length) return;
  // No adult content, identity details, complaint evidence or security findings
  // appear in the Android lock-screen payload.
  const response = await getMessaging().sendEachForMulticast({
    tokens: targets.map(d => String(d.data().token)),
    data: {
      type: 'admin_attention',
      subtype: choice.subtype,
      title: 'Nightjar Administrator',
      body: 'A new task needs your attention in Nightjar.',
      route: choice.route,
      notificationId,
    },
    webpush: { headers: { Urgency: category === 'security' || category === 'reports' ? 'high' : 'normal' } },
  });
  await Promise.allSettled(response.responses.map(async (result, index) => {
    const target = targets[index];
    if (!target) return;
    const code = result.error?.code ?? 'messaging/unknown-error';
    await target.ref.set(result.success ? {
      lastDeliveredAt: FieldValue.serverTimestamp(),
      lastError: null,
    } : {
      lastFailedAt: FieldValue.serverTimestamp(),
      lastError: code,
      active: !['messaging/registration-token-not-registered','messaging/invalid-registration-token'].includes(code),
    }, { merge: true });
  }));
};

const onAttentionWrite = (category: Category, collection: string) =>
  onDocumentWritten({ document: collection + '/{itemId}', region: REGION }, async event => {
    const before = event.data?.before.data() as Record<string, any> | undefined;
    const after = event.data?.after.data() as Record<string, any> | undefined;
    if (!newAttention(category, before, after)) return;
    const recordId = String(event.params.itemId);
    // Outstanding-role signature allows another notification if an applicant
    // explicitly requests additional roles without making routine edits noisy.
    const extra = category === 'professionalApplications'
      ? (Array.isArray(after?.requestedRoles) ? after.requestedRoles : []).filter(
          (role: string) => !Array.isArray(after?.approvedRoles) || !after?.approvedRoles.includes(role),
        ).sort().join(',')
      : '';
    // Re-submissions after a completed review must produce a fresh alert.
    // Stable event timestamps keep retries of the same write deduplicated.
    const stamp = after?.submittedAt ?? after?.bankedAt ?? after?.updatedAt ?? after?.createdAt;
    const revision = typeof stamp?.toMillis === 'function' ? String(stamp.toMillis()) : '';
    const key = category + ':' + recordId + ':' + extra + ':' + revision;
    await Promise.all(ADMIN_EMAILS.map(async email => {
      try {
        const owner = await getAuth().getUserByEmail(email);
        if (!owner.emailVerified || clean(owner.email) !== email) return;
        await notifyAdmin(owner.uid, category, recordId, key);
      } catch (error) {
        // One invalid owner account must not block notifications to other owners.
        console.error('Nightjar administrator attention delivery failed', { category, error: error instanceof Error ? error.message : String(error) });
      }
    }));
  });

export const adminAttentionProfessionalApplications = onAttentionWrite('professionalApplications', 'professionalApplications');
export const adminAttentionReleases = onAttentionWrite('releases', 'releases');
export const adminAttentionScripts = onAttentionWrite('scripts', 'scripts');
export const adminAttentionImages = onAttentionWrite('images', 'imageAssets');
export const adminAttentionReviews = onAttentionWrite('reviews', 'releaseReviews');
export const adminAttentionEditorPortfolio = onAttentionWrite('editorPortfolio', 'editorPortfolio');
export const adminAttentionReports = onAttentionWrite('reports', 'communityReports');
export const adminAttentionSecurity = onAttentionWrite('security', 'securityAlerts');
export const adminAttentionSuggestions = onAttentionWrite('suggestions', 'creatorSuggestions');
export const adminAttentionBilling = onAttentionWrite('billing', 'subscriptions');

export const adminAttentionCategoryDefaults = defaultPreferences;
