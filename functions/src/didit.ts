import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { HttpsError, onRequest } from 'firebase-functions/v2/https';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { defineSecret } from 'firebase-functions/params';

export const DIDIT_API_KEY = defineSecret('DIDIT_API_KEY');
export const DIDIT_WORKFLOW_ID = defineSecret('DIDIT_WORKFLOW_ID');
export const DIDIT_WEBHOOK_SECRET = defineSecret('DIDIT_WEBHOOK_SECRET');
export const DIDIT_ENVIRONMENT = defineSecret('DIDIT_ENVIRONMENT');

const db = () => getFirestore();
const ageRef = (uid: string) => db().collection('ageAssurance').doc(uid);
const sessionRef = (sessionId: string) => db().collection('diditSessions').doc(sessionId);
const text = (value: unknown, max = 256) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const env = () => DIDIT_ENVIRONMENT.value() === 'live' ? 'live' : 'sandbox';
const validMode = () => ['live', 'sandbox'].includes(DIDIT_ENVIRONMENT.value());
export const diditConfigured = () => Boolean(DIDIT_API_KEY.value() && DIDIT_WORKFLOW_ID.value() && validMode());
export const diditMode = () => validMode() ? env() : 'unconfigured';
export const diditPass = (data: Record<string, any> | undefined) =>
  data?.provider === 'didit' && data?.verified === true && data?.status === 'COMPLETE'
  && data?.environment === 'live' && data?.testMode !== true && data?.reverifyRequired !== true;

// Approval from a correctly configured 18+ Didit workflow is the age assurance.
// No raw ID images, biometrics or complete Didit decisions are stored in Nightjar.
export const startDiditSession = async (uid: string) => {
  if (!diditConfigured()) throw new HttpsError('failed-precondition', 'Didit verification is not configured.');
  const existing = (await ageRef(uid).get()).data() ?? {};
  if (diditPass(existing)) return { verified: true, status: 'COMPLETE', provider: 'didit', environment: 'live', configured: true };
  const oldId = text(existing.sessionId);
  if (oldId && ['PENDING', 'IN_PROGRESS', 'NOT_STARTED'].includes(String(existing.status))) {
    const old = (await sessionRef(oldId).get()).data() ?? {};
    if (old.uid === uid && old.environment === env() && old.workflowId === DIDIT_WORKFLOW_ID.value() &&
        old.createdAtMs > Date.now() - 6 * 86400_000 && text(old.url, 2048)) {
      return { sessionId: oldId, launchUrl: old.url, status: 'PENDING', provider: 'didit', environment: env(), configured: true };
    }
  }
  // Transactional claim ensures concurrent devices cannot start duplicate paid checks.
  const claimed = await db().runTransaction(async (tx) => {
    const ref = ageRef(uid);
    const snap = await tx.get(ref);
    const data = snap.data() ?? {};
    if (diditPass(data)) return 'verified';
    if (data.status === 'CREATING' && Number(data.creatingSinceMs ?? 0) > Date.now() - 45000) return 'busy';
    tx.set(ref, {
      provider: 'didit', status: 'CREATING', environment: env(), verified: false,
      reverifyRequired: true, testMode: env() !== 'live',
      creatingSinceMs: Date.now(), updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return 'claimed';
  });
  if (claimed === 'verified') return { verified: true, status: 'COMPLETE', provider: 'didit', environment: 'live', configured: true };
  if (claimed === 'busy') throw new HttpsError('aborted', 'A verification session is starting. Try again shortly.');
  let failurePhase: 'provider-request' | 'provider-http' | 'provider-json' | 'provider-response' | 'account-binding' = 'provider-request';
  let providerHttpStatus: number | null = null;
  try {
    const result = await fetch('https://verification.didit.me/v3/session/', {
      method: 'POST',
      headers: { 'x-api-key': DIDIT_API_KEY.value(), 'content-type': 'application/json' },
      // Didit rejects sandbox_scenario when the API key belongs to a live application.
      // Always send this in sandbox mode so an accidentally configured live key
      // cannot start billable real-world verification during Nightjar QA.
      body: JSON.stringify({
        workflow_id: DIDIT_WORKFLOW_ID.value(), vendor_data: uid,
        ...(env() === 'sandbox' ? { sandbox_scenario: 'approve' } : {}),
      }),
      signal: AbortSignal.timeout(15000),
    });
    providerHttpStatus = result.status;
    failurePhase = 'provider-http';
    if (!result.ok) throw new Error('Didit session request was not accepted');
    failurePhase = 'provider-json';
    const session = await result.json() as Record<string, unknown>;
    failurePhase = 'provider-response';
    if (!session || typeof session !== 'object' || Array.isArray(session)) throw new Error('Invalid Didit session payload');
    const sessionId = text(session.session_id);
    const url = text(session.url, 2048);
    let hostname = '';
    try { hostname = new URL(url).hostname; } catch { /* invalid */ }
    // Didit's published v3 response guarantees session_id and url, but does not
    // promise to echo vendor_data or workflow_id on every session creation.
    // Verify echoed values strictly when present, and bind the session ourselves
    // to the authenticated UID and server-configured workflow below.
    const hasVendorEcho = session.vendor_data !== undefined && session.vendor_data !== null;
    const hasWorkflowEcho = session.workflow_id !== undefined && session.workflow_id !== null;
    if (!sessionId || !['verify.didit.me','verification.didit.me'].includes(hostname) ||
        !url.startsWith('https://') || (session.session_kind && session.session_kind !== 'user') ||
        (hasVendorEcho && text(session.vendor_data) !== uid) ||
        (hasWorkflowEcho && text(session.workflow_id) !== DIDIT_WORKFLOW_ID.value())) {
      console.warn('Rejected Didit response shape', {
        hasSessionId: Boolean(sessionId), allowedHost: ['verify.didit.me','verification.didit.me'].includes(hostname),
        httpsUrl: url.startsWith('https://'), hasVendorEcho, hasWorkflowEcho,
        vendorEchoMatched: !hasVendorEcho || text(session.vendor_data) === uid,
        workflowEchoMatched: !hasWorkflowEcho || text(session.workflow_id) === DIDIT_WORKFLOW_ID.value(),
      });
      throw new Error('Invalid Didit session response');
    }
    failurePhase = 'account-binding';
    await db().runTransaction(async tx => {
      const ref = ageRef(uid);
      const snap = await tx.get(ref);
      if (diditPass(snap.data())) return;
      tx.create(sessionRef(sessionId), {
        uid, environment: env(), workflowId: DIDIT_WORKFLOW_ID.value(),
        applicationId: text(session.application_id) || null,
        url, status: 'Not Started', createdAtMs: Date.now(), updatedAt: FieldValue.serverTimestamp(),
      });
      tx.set(ref, {
        provider: 'didit', environment: env(), sessionId, status: 'PENDING',
        verified: false, testMode: env() !== 'live', reverifyRequired: false,
        diditEventCreatedAt: 0, creatingSinceMs: 0,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    });
    return { sessionId, launchUrl: url, status: 'PENDING', provider: 'didit', environment: env(), configured: true };
  } catch (error) {
    await db().runTransaction(async tx => {
      const ref = ageRef(uid);
      const snap = await tx.get(ref);
      if (snap.data()?.status === 'CREATING') tx.set(ref, {
        status: 'NOT_STARTED', creatingSinceMs: 0, updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    });
    // Safe diagnostics only: never log provider response bodies, keys, IDs,
    // session URLs, identity details, or biometric/document data.
    console.error('Didit session creation failed', {
      phase: failurePhase, providerHttpStatus,
      category: error instanceof Error ? error.name : 'unknown',
    });
    throw new HttpsError('unavailable',
      'Nightjar could not start Didit. Please contact Nightjar support before retrying; a provider session may already have been created.');
  }
};

const canonicalJson = (value: any): string => {
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort()
    .map(key => JSON.stringify(key) + ':' + canonicalJson(value[key])).join(',') + '}';
  return JSON.stringify(value);
};
// Confirm adulthood from approved documentary KYC evidence without storing a birth date.
// A generic Approved identity decision MUST NOT, on its own, unlock 18+ content.
// Adaptive age-estimation workflows need a separate evidence adapter before use.
const verifiedAdultFromDecision = (decision: unknown, at = new Date()) => {
  const obj = decision && typeof decision === 'object' ? decision as Record<string, any> : {};
  const checks = Array.isArray(obj.id_verifications) ? obj.id_verifications : [];
  return checks.some((item: unknown) => {
    if (!item || typeof item !== 'object') return false;
    const id = item as Record<string, unknown>;
    if (id.status !== 'Approved' || typeof id.date_of_birth !== 'string') return false;
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(id.date_of_birth);
    if (!match) return false;
    const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
    const dob = new Date(Date.UTC(year, month - 1, day));
    if (dob.getUTCFullYear() !== year || dob.getUTCMonth() !== month - 1 ||
        dob.getUTCDate() !== day || dob.getTime() > at.getTime()) return false;
    const min = new Date(Date.UTC(at.getUTCFullYear() - 18, at.getUTCMonth(), at.getUTCDate()));
    return dob.getTime() <= min.getTime();
  });
};

const equalHmac = (message: string | Buffer, signature: string, secret: string) => {
  if (!/^[a-f\d]{64}$/i.test(signature)) return false;
  const expected = createHmac('sha256', secret).update(message).digest();
  return timingSafeEqual(expected, Buffer.from(signature, 'hex'));
};
export const diditWebhook = onRequest({
  region: 'europe-west2', secrets: [DIDIT_WEBHOOK_SECRET, DIDIT_ENVIRONMENT],
  timeoutSeconds: 30, maxInstances: 8,
}, async (request, response) => {
  if (request.method !== 'POST') { response.set('Allow','POST').status(405).end(); return; }
  if (!DIDIT_WEBHOOK_SECRET.value() || !validMode()) { response.status(503).end(); return; }
  const raw = request.rawBody;
  if (!raw || raw.length === 0 || raw.length > 1_000_000) { response.status(413).end(); return; }
  let value: Record<string, any>;
  try { value = JSON.parse(raw.toString('utf8')); }
  catch { response.status(400).end(); return; }
  if (!value || typeof value !== 'object' || Array.isArray(value)) { response.status(400).end(); return; }
  const secret = DIDIT_WEBHOOK_SECRET.value();
  const verified = equalHmac(canonicalJson(value), text(request.get('X-Signature-V2')), secret) ||
    equalHmac(raw, text(request.get('X-Signature')), secret);
  // Do not trust deprecated X-Signature-Simple (it does not cover decision body).
  if (!verified) {
    console.warn('Rejected Didit signature', { bodySha256: createHash('sha256').update(raw).digest('hex') });
    response.status(401).end(); return;
  }
  // Authenticated provider test deliveries must never mutate a real account.
  if (request.get('X-Didit-Test-Webhook')?.toLowerCase() === 'true') {
    response.status(200).json({ accepted: true, test: true }); return;
  }
  // Freshness must be taken from the HMAC-authenticated body, NOT the unsigned
  // X-Timestamp header: otherwise a captured payload could be replayed with a
  // forged fresh header while retaining its valid original signature.
  const dispatched = Number(value.timestamp);
  const headerTimestamp = Number(request.get('X-Timestamp'));
  if (!Number.isSafeInteger(value.timestamp) || !Number.isSafeInteger(dispatched) ||
      !Number.isSafeInteger(headerTimestamp) || headerTimestamp !== dispatched ||
      Math.abs(Date.now()/1000 - dispatched) > 300) {
    response.status(401).end(); return;
  }
  const allowed = new Set(['status.updated','data.updated','user.status.updated','user.data.updated',
    'business.status.updated','business.data.updated','activity.created','transaction.created',
    'transaction.status.updated','travel_rule.status.updated']);
  const type = text(value.webhook_type, 80);
  const eventId = text(value.event_id, 128);
  const sessionId = text(value.session_id, 128);
  if (value.timestamp !== dispatched || !eventId || !allowed.has(type) ||
    value.environment !== env() || !Number.isSafeInteger(value.created_at) ||
    (['status.updated','data.updated'].includes(type) && !sessionId)) {
    response.status(400).end(); return;
  }
  const hash = createHash('sha256').update(eventId).digest('hex');
  const record = {
    eventId, webhookType: type, status: text(value.status, 50),
    // Derived boolean only: birth date, document data and biometric material are never stored.
    adultEvidence: value.status === 'Approved' && verifiedAdultFromDecision(value.decision),
    applicationId: text(value.application_id, 128) || null,
    sessionId: sessionId || null, vendorData: text(value.vendor_data, 256) || null,
    workflowId: text(value.workflow_id, 128) || null,
    sessionKind: text(value.session_kind, 50) || null,
    entityId: text(value.vendor_user_id || value.vendor_business_id || value.transaction_id, 128) || null,
    createdAt: value.created_at, environment: value.environment,
    receivedAt: FieldValue.serverTimestamp(),
  };
  // Durable queue, then acknowledge quickly. The Firestore trigger updates account state.
  try {
    await db().collection('diditWebhookEvents').doc(hash).create(record);
    response.status(202).json({ accepted: true });
  } catch (error: any) {
    if (error?.code === 6 || error?.code === 'already-exists') {
      response.status(200).json({ duplicate: true });
      return;
    }
    console.error('Didit event durable receipt failed', { eventId, error: String(error) });
    response.status(503).end();
  }
});

const statuses: Record<string, string> = {
  Approved: 'COMPLETE', Declined: 'FAIL', 'In Review': 'PENDING_REVIEW',
  'In Progress': 'IN_PROGRESS', 'Not Started': 'NOT_STARTED',
  Abandoned: 'ABANDONED', Expired: 'EXPIRED', 'Kyc Expired': 'EXPIRED',
  Resubmitted: 'RESUBMITTED', 'Awaiting User': 'AWAITING_USER',
};
export const processDiditWebhook = onDocumentCreated({
  document: 'diditWebhookEvents/{eventId}', region: 'europe-west2', retry: true,
}, async event => {
  const doc = event.data;
  if (!doc) return;
  const payload = doc.data() ?? {};
  const kind = text(payload.webhookType);
  const sessionId = text(payload.sessionId);
  const status = text(payload.status);
  if (!['status.updated','data.updated'].includes(kind)) {
    // Entity/business/transaction events are durably recorded without granting adult access.
    // A blocked user entity can revoke an existing Didit age pass.
    if (kind === 'user.status.updated' && payload.environment === 'live' && ['BLOCKED','FLAGGED'].includes(status)) {
      const uid = text(payload.vendorData);
      if (uid) await db().runTransaction(async tx => {
        const ref = ageRef(uid);
        const snap = await tx.get(ref);
        if (snap.data()?.provider === 'didit' && snap.data()?.environment === 'live') tx.set(ref, {
          verified: false, reverifyRequired: true, status: 'PENDING_REVIEW',
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
      });
    }
    await doc.ref.set({ processedAt: FieldValue.serverTimestamp() }, { merge: true });
    return;
  }
  if (payload.sessionKind === 'business' || !(status in statuses) || !sessionId) {
    await doc.ref.set({ ignored: true, processedAt: FieldValue.serverTimestamp() }, { merge: true });
    return;
  }
  const sessionSnapshot = await sessionRef(sessionId).get();
  const session = sessionSnapshot.data() ?? {};
  const uid = text(session.uid);
  if (!uid || session.environment !== payload.environment || session.workflowId !== payload.workflowId ||
      (session.applicationId && session.applicationId !== payload.applicationId) ||
      uid !== payload.vendorData) {
    await doc.ref.set({ ignored: true, processedAt: FieldValue.serverTimestamp() }, { merge: true });
    return;
  }
  await db().runTransaction(async tx => {
    const ref = ageRef(uid);
    const [current, processed] = await Promise.all([tx.get(ref), tx.get(doc.ref)]);
    if (processed.data()?.processedAt) return;
    const data = current.data() ?? {};
    const lastTime = Number(data.diditEventCreatedAt ?? 0);
    // Older or superseded sessions cannot override the account's newest verification.
    if (data.sessionId !== sessionId || Number(payload.createdAt) < lastTime ||
        (Number(payload.createdAt) === lastTime && status === 'Approved')) {
      tx.set(doc.ref, { ignored: true, processedAt: FieldValue.serverTimestamp() }, { merge: true });
      return;
    }
    const approved = status === 'Approved' && payload.environment === 'live' && payload.adultEvidence === true;
    tx.set(ref, {
      provider: 'didit', environment: payload.environment,
      status: approved ? 'COMPLETE' : status === 'Approved' ? 'PENDING_REVIEW' : statuses[status],
      verified: approved,
      testMode: payload.environment !== 'live', reverifyRequired: !approved,
      verifiedAt: approved ? FieldValue.serverTimestamp() : (data.verifiedAt ?? null),
      diditEventCreatedAt: payload.createdAt, diditEventId: payload.eventId,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    tx.set(doc.ref, { processedAt: FieldValue.serverTimestamp(), accountId: uid }, { merge: true });
    tx.set(sessionRef(sessionId), { status, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  });
});
