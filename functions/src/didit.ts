/**
 * Nightjar's Didit V3 integration.
 * No raw webhook body, facial media, date of birth or ID document is stored.
 * The verification PASS is bound server-side to the Firebase Auth UID.
 */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { defineSecret } from 'firebase-functions/params';
import { onRequest } from 'firebase-functions/v2/https';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';

export const DIDIT_API_KEY = defineSecret('DIDIT_API_KEY');
export const DIDIT_WEBHOOK_SECRET = defineSecret('DIDIT_WEBHOOK_SECRET');
const REGION = 'europe-west2';
const db = () => getFirestore();
const config = {
  workflow: () => (process.env.DIDIT_WORKFLOW_ID ?? '').trim(),
  application: () => (process.env.DIDIT_APPLICATION_ID ?? '').trim(),
  environment: (): 'live' | 'sandbox' => process.env.DIDIT_ENVIRONMENT === 'live' ? 'live' : 'sandbox',
  returnUrl: () => (process.env.DIDIT_RETURN_URL ?? 'https://nightjar-audio.web.app/').trim(),
};
const ages = () => db().collection('ageAssurance');
const sessions = () => db().collection('diditAgeSessions');
const events = () => db().collection('diditWebhookEvents');
const seen = () => db().collection('diditAncillaryEvents');
const isProductionApproved = () => config.environment() === 'live'
  && process.env.DIDIT_PRODUCTION_APPROVED === 'true'
  && process.env.DIDIT_ADULT_WORKFLOW_CONFIRMED === 'true';
export const diditConfigured = () => Boolean(config.workflow() && DIDIT_API_KEY.value());
export const diditEnvironment = () => config.environment() === 'live' ? 'production' : 'sandbox';

const safeSessionId = (value: unknown) => typeof value === 'string'
  && /^[A-Za-z0-9_-]{8,100}$/.test(value);
const safeUid = (value: unknown): value is string => typeof value === 'string'
  && /^[A-Za-z0-9_-]{1,128}$/.test(value);

const launchUrlAllowed = (value: unknown): value is string => {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    const customHost = String(process.env.DIDIT_VERIFICATION_HOST ?? '').trim().toLowerCase();
    return url.protocol === 'https:' && (url.hostname === 'didit.me'
      || url.hostname.endsWith('.didit.me')
      || (customHost.length > 3 && url.hostname.toLowerCase() === customHost));
  } catch { return false; }
};

async function apiJson(path: string, init: RequestInit): Promise<Record<string, any>> {
  const key = DIDIT_API_KEY.value();
  if (!key) throw new Error('Missing DIDIT_API_KEY.');
  const response = await fetch('https://verification.didit.me/v3/session/' + path, {
    ...init,
    headers: { 'x-api-key': key, 'Accept': 'application/json', ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error('Didit API error HTTP ' + response.status);
  const data: unknown = await response.json();
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Unexpected Didit response.');
  return data as Record<string, any>;
}

export async function startDiditAgeAssurance(uid: string) {
  if (!diditConfigured()) throw new Error('Didit API key and 18+ workflow must be configured.');
  const ref = ages().doc(uid);
  const old = (await ref.get()).data() ?? {};
  if (old.provider === 'didit' && old.verified === true && old.environment === 'production' && old.reverifyRequired !== true) {
    return { verified: true, status: 'COMPLETE', provider: 'didit', configured: true, environment: 'production' };
  }
  if (old.provider === 'didit' && old.status === 'SANDBOX_APPROVED'
      && config.environment() === 'sandbox') {
    return { verified: false, status: 'SANDBOX_APPROVED', provider: 'didit',
      configured: true, environment: 'sandbox' };
  }
  // A live, active session is reused across devices: no new paid session is created on refresh.
  if (old.provider === 'didit' && old.status === 'PENDING' && old.sessionEnvironment === config.environment()
      && typeof old.launchUrl === 'string' && launchUrlAllowed(old.launchUrl)
      && Number(old.sessionCreatedMs) > Date.now() - 6 * 60 * 60 * 1000) {
    return { verified: false, status: 'PENDING', sessionId: old.sessionId, launchUrl: old.launchUrl,
      provider: 'didit', configured: true, environment: diditEnvironment() };
  }

  // Reserve the account while the outbound API call runs to prevent double-billing from double clicks/devices.
  const reserved = await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const state = snap.data() ?? {};
    if (state.provider === 'didit' && state.verified === true && state.environment === 'production' && state.reverifyRequired !== true) {
      return 'verified';
    }
    if (Number(state.creatingUntilMs) > Date.now()) return 'busy';
    if (state.provider === 'didit' && state.status === 'PENDING'
      && state.sessionEnvironment === config.environment()
      && launchUrlAllowed(state.launchUrl) && Number(state.sessionCreatedMs) > Date.now() - 6 * 60 * 60 * 1000) return 'pending';
    tx.set(ref, { creatingUntilMs: Date.now() + 30000, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return 'create';
  });
  if (reserved === 'verified') return { verified: true, status: 'COMPLETE', provider: 'didit', environment: 'production', configured: true };
  if (reserved === 'busy') return { verified: false, status: 'PROCESSING', provider: 'didit', configured: true, environment: diditEnvironment() };
  if (reserved === 'pending') {
    const current = (await ref.get()).data() ?? {};
    return { verified: false, status: 'PENDING', provider: 'didit', configured: true,
      sessionId: current.sessionId, launchUrl: current.launchUrl, environment: diditEnvironment() };
  }

  try {
    const result = await apiJson('', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workflow_id: config.workflow(), vendor_data: uid,
        callback: config.returnUrl(), callback_method: 'both',
        metadata: { purpose: 'nightjar_age_18' },
      }),
    });
    if (!safeSessionId(result.session_id) || !launchUrlAllowed(result.url)
      || (result.workflow_id && result.workflow_id !== config.workflow())
      || (result.session_kind && result.session_kind !== 'user')) {
      throw new Error('Didit returned an unexpected session configuration.');
    }
    const sessionDoc = sessions().doc(result.session_id);
    await db().runTransaction(async (tx) => {
      const prior = await tx.get(sessionDoc);
      if (prior.exists && prior.data()?.userId !== uid) {
        throw new Error('Didit attempted to reuse a session for another account.');
      }
      tx.set(sessionDoc, {
        userId: uid, workflowId: config.workflow(), environment: config.environment(),
        status: 'Not Started', updatedAt: FieldValue.serverTimestamp(),
        ...(prior.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
      }, { merge: true });
    });
    await ref.set({
      provider: 'didit', sessionId: result.session_id, sessionEnvironment: config.environment(),
      launchUrl: result.url, sessionCreatedMs: Date.now(), status: 'PENDING',
      verified: false, reverifyRequired: false, creatingUntilMs: 0,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return { verified: false, status: 'PENDING', sessionId: result.session_id, launchUrl: result.url,
      configured: true, provider: 'didit', environment: diditEnvironment() };
  } catch (error) {
    await ref.set({ creatingUntilMs: 0, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    throw error;
  }
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    // Explicit key sorting: JS property enumeration reorders integer-looking keys.
    return '{' + Object.keys(obj).sort().map((key) => JSON.stringify(key) + ':' + canonical(obj[key])).join(',') + '}';
  }
  return JSON.stringify(value) ?? 'null';
}
function compareHex(signature: string | undefined, computed: string): boolean {
  if (!signature || !/^[0-9a-f]{64}$/i.test(signature)) return false;
  const a = Buffer.from(signature.toLowerCase(), 'hex');
  const b = Buffer.from(computed, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}
const TYPES = new Set([
  'status.updated', 'data.updated', 'user.status.updated', 'user.data.updated',
  'business.status.updated', 'business.data.updated', 'activity.created',
  'transaction.created', 'transaction.status.updated', 'travel_rule.status.updated',
]);

/** Public HTTPS entrypoint: /api/webhooks/didit via Hosting rewrite or its Cloud Function URL. */
export const diditWebhook = onRequest({
  region: REGION, secrets: [DIDIT_WEBHOOK_SECRET],
  timeoutSeconds: 30, memory: '256MiB', maxInstances: 20,
}, async (request, response) => {
  if (request.method !== 'POST') { response.set('Allow', 'POST').status(405).end(); return; }
  const raw = request.rawBody;
  if (!Buffer.isBuffer(raw) || !raw.length || raw.length > 1024 * 1024) {
    response.status(413).end(); return;
  }
  const tsHeader = String(request.get('X-Timestamp') ?? '');
  const timestamp = Number(tsHeader);
  if (!/^\d{10}$/.test(tsHeader) || !Number.isSafeInteger(timestamp)
    || Math.abs(Math.floor(Date.now() / 1000) - timestamp) > 300) {
    response.status(401).end(); return;
  }
  const secret = DIDIT_WEBHOOK_SECRET.value();
  if (!secret) { response.status(503).end(); return; }
  let payload: Record<string, any>;
  try {
    const body: unknown = JSON.parse(raw.toString('utf8'));
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Bad JSON');
    payload = body as Record<string, any>;
  } catch {
    response.status(400).end(); return;
  }
  // Parsing above is ONLY for V2 canonical signature verification. Never act on unsigned data.
  const v2 = createHmac('sha256', secret).update(canonical(payload), 'utf8').digest('hex');
  const rawHmac = createHmac('sha256', secret).update(raw).digest('hex');
  if (!compareHex(request.get('X-Signature-V2'), v2)
    && !compareHex(request.get('X-Signature'), rawHmac)) {
    // Never log or store raw identity/biometric payloads, even on signature failure.
    console.warn('Didit bad signature', { sha256: createHash('sha256').update(raw).digest('hex') });
    response.status(401).end(); return;
  }
  if (payload.timestamp !== timestamp || !TYPES.has(String(payload.webhook_type))
    || typeof payload.event_id !== 'string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(payload.event_id)
    || payload.environment !== config.environment()
    || (config.application() && payload.application_id !== config.application())) {
    response.status(422).end(); return;
  }
  if (!config.application() && config.environment() === 'live') {
    response.status(503).end(); return; // live destination must be pinned to its application ID
  }
  const type = String(payload.webhook_type);
  const sessionId = String(payload.session_id ?? '');
  if ((type === 'status.updated' || type === 'data.updated') && !safeSessionId(sessionId)) {
    response.status(422).end(); return;
  }
  const record = {
    eventType: type, status: String(payload.status ?? '').slice(0, 40),
    environment: payload.environment, applicationId: String(payload.application_id ?? '').slice(0, 100),
    sessionId: safeSessionId(sessionId) ? sessionId : null,
    workflowId: String(payload.workflow_id ?? '').slice(0, 100),
    vendorData: safeUid(payload.vendor_data) ? payload.vendor_data : null,
    entityIdHash: createHash('sha256').update(String(payload.vendor_user_id ?? payload.vendor_business_id ?? payload.transaction_id ?? '')).digest('hex'),
    createdAt: FieldValue.serverTimestamp(), processed: false,
  };
  try {
    await events().doc(payload.event_id).create(record);
    response.status(202).json({ accepted: true });
  } catch (err: any) {
    if (err?.code === 6 || err?.code === 'already-exists') {
      response.status(200).json({ duplicate: true }); return;
    }
    console.error('Didit webhook queue failure', { code: err?.code ?? 'unknown' });
    response.status(503).end(); // ask Didit to retry; never acknowledge an unpersisted event
  }
});

async function readCurrentDecision(sessionId: string): Promise<Record<string, any>> {
  if (!safeSessionId(sessionId)) throw new Error('Invalid Didit session identifier.');
  return apiJson(encodeURIComponent(sessionId) + '/decision/', { method: 'GET' });
}

/** Firestore event queue keeps the HTTP handler fast; this worker is retryable and idempotent. */
export const processDiditWebhookEvent = onDocumentCreated({
  document: 'diditWebhookEvents/{eventId}', region: REGION, retry: true,
  secrets: [DIDIT_API_KEY], timeoutSeconds: 60, maxInstances: 10,
}, async (event) => {
  const snap = event.data;
  if (!snap) return;
  const data = snap.data();
  if (data.processed === true) return;
  const type = String(data.eventType);
  const sessionId = String(data.sessionId ?? '');

  // Non-KYC event families are explicitly segregated and do not confer age access.
  if (type !== 'status.updated' && type !== 'data.updated') {
    await seen().doc(event.params.eventId).set({
      eventType: type, status: data.status, referenceHash: data.entityIdHash,
      environment: data.environment, receivedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    if (type === 'user.status.updated' && data.status === 'BLOCKED'
      && safeUid(data.vendorData) && data.environment === 'live') {
      const ref = ages().doc(data.vendorData);
      await db().runTransaction(async (tx) => {
        const prev = await tx.get(ref);
        if (prev.data()?.provider === 'didit' && prev.data()?.environment === 'production') {
          tx.set(ref, { reverifyRequired: true, verified: false, status: 'BLOCKED',
            updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        }
      });
    }
    await snap.ref.set({ processed: true, processedAt: FieldValue.serverTimestamp() }, { merge: true });
    return;
  }
  const stored = (await sessions().doc(sessionId).get()).data();
  // Console Try Webhook fixtures or someone else's sessions cannot create account verification.
  if (!stored || stored.workflowId !== config.workflow() || stored.environment !== data.environment
    || (data.workflowId && data.workflowId !== stored.workflowId)
    || (data.vendorData && data.vendorData !== stored.userId)) {
    await snap.ref.set({ processed: true, ignored: 'unrecognised-session', processedAt: FieldValue.serverTimestamp() }, { merge: true });
    return;
  }
  const decision = await readCurrentDecision(sessionId); // never trust a webhook's claimed approval alone
  if (decision.session_id && decision.session_id !== sessionId) throw new Error('Didit decision session mismatch.');
  if (decision.workflow_id && decision.workflow_id !== stored.workflowId) throw new Error('Didit decision workflow mismatch.');
  if (decision.vendor_data && decision.vendor_data !== stored.userId) throw new Error('Didit decision account mismatch.');
  const status = String(decision.status ?? '');
  const ref = ages().doc(stored.userId);
  await db().runTransaction(async (tx) => {
    const [ageSnap, sessionSnap] = await Promise.all([tx.get(ref), tx.get(sessions().doc(sessionId))]);
    const age = ageSnap.data() ?? {};
    const currentSession = sessionSnap.data() ?? {};
    // Do not overwrite an account with a superseded session's delayed callback.
    if (age.provider !== 'didit' || age.sessionId !== sessionId) return;
    const approved = status === 'Approved' && currentSession.environment === 'live' && isProductionApproved();
    const expired = ['Expired', 'Kyc Expired'].includes(status);
    const blocked = ['Declined', 'Abandoned'].includes(status);
    const previouslyApproved = age.verified === true && age.reverifyRequired !== true;
    const update: Record<string, unknown> = {
      provider: 'didit', status: approved ? 'COMPLETE' : (
        status === 'Declined' ? 'FAIL' : expired ? 'EXPIRED' : status === 'In Review' ? 'PENDING_REVIEW' : 'PENDING'),
      updatedAt: FieldValue.serverTimestamp(),
      // A stored production pass may be revoked by a negative later provider decision.
      verified: approved ? true : (expired || blocked ? false : previouslyApproved),
      reverifyRequired: expired || blocked ? true : (approved ? false : age.reverifyRequired === true),
    };
    if (approved) {
      update.environment = 'production';
      update.verifiedAt = age.verifiedSessionId === sessionId && age.verifiedAt
        ? age.verifiedAt : FieldValue.serverTimestamp();
      update.verifiedSessionId = sessionId;
      update.ageThreshold = 18;
      update.testMode = false;
      update.launchUrl = FieldValue.delete();
      update.creatingUntilMs = 0;
    }
    if (currentSession.environment === 'sandbox') {
      update.verified = false;
      update.sandboxResult = status; // sandbox is NEVER proof of age
      update.status = status === 'Approved' ? 'SANDBOX_APPROVED' : String(update.status);
      update.reverifyRequired = false;
    }
    tx.set(ref, update, { merge: true });
    tx.set(sessions().doc(sessionId), { status, processedAt: FieldValue.serverTimestamp() }, { merge: true });
  });
  await snap.ref.set({ processed: true, processedAt: FieldValue.serverTimestamp() }, { merge: true });
});
