import { createHash } from 'node:crypto';
import { diditWebhookSignatureValid } from './didit-webhook-security.js';
import { verifiedAdultFromDecision } from './didit-adult-evidence.js';
export { diditDocumentBirthDateReturned, verifiedAdultFromDecision } from './didit-adult-evidence.js';
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

type RecoverableDiditSession = {
  session_id?: unknown; session_kind?: unknown; session_url?: unknown;
  status?: unknown; vendor_data?: unknown; workflow_id?: unknown; created_at?: unknown;
};

// A provider POST can succeed while its response is lost. Search Didit's
// account-bound session list before ever considering another create request.
const recoverExistingDiditSession = async (uid: string) => {
  // Include terminal/review states in the lookup as well: finding an old
  // abandoned/expired/approved session must never silently trigger a new paid POST.
  const query = new URLSearchParams({
    session_kind: 'user',
    vendor_data: uid,
    workflow_id: DIDIT_WORKFLOW_ID.value(),
    // Deliberately omit status: inspect every lifecycle state returned for this account.
    limit: '100',
    offset: '0',
  });
  const response = await fetch('https://verification.didit.me/v3/sessions/?' + query.toString(), {
    method: 'GET',
    headers: { 'x-api-key': DIDIT_API_KEY.value(), Accept: 'application/json' },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error('Could not inspect existing Didit sessions');
  const payload = await response.json() as { results?: unknown; next?: unknown };
  if (!Array.isArray(payload?.results)) throw new Error('Invalid Didit session-list response');
  if (payload.next) throw new HttpsError('unavailable',
    'Nightjar could not inspect every existing Didit session. No new verification was started. Please contact support.');
  const matching = (payload.results as RecoverableDiditSession[]).filter(item => {
    const status = text(item.status, 40);
    // Match the account-bound session regardless of its status. Unknown or newly
    // introduced provider statuses must fail closed below, never fall through to a new POST.
    return item.session_kind === 'user' && item.vendor_data === uid &&
      (!item.workflow_id || item.workflow_id === DIDIT_WORKFLOW_ID.value()) &&
      Boolean(status) && Boolean(text(item.session_id, 128));
  });
  if (matching.length > 1) {
    throw new HttpsError('failed-precondition',
      'Nightjar found multiple existing Didit sessions linked to this account. No new check was started; support must review them.');
  }
  if (matching.length === 0) return null;
  const item = matching[0];
  const status = text(item.status, 40);
  const sessionId = text(item.session_id, 128);
  const url = text(item.session_url, 2048);
  let parsedUrl: URL;
  try { parsedUrl = new URL(url); } catch {
    throw new HttpsError('unavailable', 'Nightjar found your existing Didit session but could not safely restore its link. No new verification was started; please contact support.');
  }
  if (parsedUrl.protocol !== 'https:' || !['verify.didit.me', 'verification.didit.me'].includes(parsedUrl.hostname)) {
    throw new HttpsError('unavailable', 'Nightjar found your existing Didit session but could not safely restore its link. No new verification was started; please contact support.');
  }
  const createdAtMs = Date.parse(text(item.created_at, 64));
  if (!Number.isFinite(createdAtMs)) throw new Error('Didit session has no valid creation timestamp');

  // Only sessions that are genuinely awaiting member action can be resumed.
  // In Review is a human-review state; Abandoned/Expired/Declined/Approved
  // need reconciliation or an explicit controlled decision, not a blind restart.
  if (!['Not Started', 'In Progress', 'Resubmitted', 'Awaiting User'].includes(status)) {
    throw new HttpsError('failed-precondition',
      status === 'In Review'
        ? 'Your existing Didit verification is awaiting review. You do not need to start another check.'
        : status === 'Approved'
          ? 'Didit has already recorded a decision for your existing session. Nightjar must synchronise that result before another check can be considered.'
          : 'Your previous Didit session is ' + status + '. Nightjar has preserved it and blocked a duplicate check. Please contact support for the correct next step.');
  }

  await db().runTransaction(async tx => {
    const ageDocument = ageRef(uid);
    const current = (await tx.get(ageDocument)).data() ?? {};
    if (diditPass(current)) return;
    const currentSessionId = text(current.sessionId, 128);
    if (currentSessionId && currentSessionId !== sessionId &&
        ['PENDING', 'IN_PROGRESS', 'NOT_STARTED', 'RESUBMITTED', 'PENDING_REVIEW'].includes(String(current.status))) {
      throw new HttpsError('failed-precondition',
        'Nightjar found a different existing verification session. Contact support; no new check was started.');
    }
    tx.set(sessionRef(sessionId), {
      uid, environment: env(), workflowId: DIDIT_WORKFLOW_ID.value(),
      url, status, createdAtMs,
      recoveredFromProviderList: true, updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    tx.set(ageDocument, {
      provider: 'didit', environment: env(), sessionId, status: 'PENDING',
      verified: false, testMode: env() !== 'live', reverifyRequired: false,
      creatingSinceMs: 0, memberIssueCodes: [], updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });
  return { sessionId, launchUrl: url, status: 'PENDING', provider: 'didit', environment: env(), configured: true };
};

// Approval from a correctly configured 18+ Didit workflow is the age assurance.
// No raw ID images, biometrics or complete Didit decisions are stored in Nightjar.
export const startDiditSession = async (uid: string) => {
  if (!diditConfigured()) throw new HttpsError('failed-precondition', 'Didit verification is not configured.');
  const existing = (await ageRef(uid).get()).data() ?? {};
  if (diditPass(existing)) return { verified: true, status: 'COMPLETE', provider: 'didit', environment: 'live', configured: true };
  const oldId = text(existing.sessionId);
  if (oldId && ['PENDING', 'IN_PROGRESS', 'NOT_STARTED', 'RESUBMITTED', 'PENDING_REVIEW'].includes(String(existing.status))) {
    const old = (await sessionRef(oldId).get()).data() ?? {};
    if (old.uid === uid && old.environment === env() && old.workflowId === DIDIT_WORKFLOW_ID.value() &&
        old.createdAtMs > Date.now() - 6 * 86400_000 && text(old.url, 2048)) {
      return { sessionId: oldId, launchUrl: old.url, status: 'PENDING', provider: 'didit', environment: env(), configured: true };
    }
  }
  // This GET-only lookup also repairs legacy accounts whose uncertain provider
  // creation was incorrectly reset to NOT_STARTED by an older backend release.
  // It is safe to run before every new session POST: vendor_data + workflow_id
  // are exact provider-side filters, and only one unfinished session is adopted.
  const recovered = await recoverExistingDiditSession(uid);
  if (recovered) return recovered;
  if (existing.creationOutcomeUncertain === true || existing.status === 'CREATION_UNCERTAIN' ||
      (existing.status === 'CREATING' && Number(existing.creatingSinceMs ?? 0) <= Date.now() - 45000)) {
    throw new HttpsError('unavailable',
      'Nightjar could not locate the earlier Didit session yet. No new verification was started. Please try the existing-session recovery again or contact support.');
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
      creatingSinceMs: Date.now(), memberIssueCodes: [], updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return 'claimed';
  });
  if (claimed === 'verified') return { verified: true, status: 'COMPLETE', provider: 'didit', environment: 'live', configured: true };
  if (claimed === 'busy') throw new HttpsError('aborted', 'A verification session is starting. Try again shortly.');
  let failurePhase: 'provider-request' | 'provider-http' | 'provider-json' | 'provider-response' | 'account-binding' = 'provider-request';
  let providerHttpStatus: number | null = null;
  let providerErrorCategory: 'credits' | 'workflow' | 'request-validation' | 'rate-limit' | 'authentication' | 'other' = 'other';
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
    if (!result.ok) {
      // Interpret only a small set of non-sensitive error categories.
      // Never log raw provider bodies/messages: these might contain account
      // identifiers or other private verification details.
      if (result.status === 429) providerErrorCategory = 'rate-limit';
      else if ([401,403].includes(result.status)) providerErrorCategory = 'authentication';
      try {
        const payload = await result.json() as Record<string, any>;
        const descriptor = [payload?.code, payload?.message, payload?.detail,
          payload?.error?.code, payload?.error?.message, payload?.error_description]
          .filter((value): value is string => typeof value === 'string')
          .join(' ').toLowerCase().slice(0, 600);
        if (/credit|balance|insufficient|funds/.test(descriptor)) providerErrorCategory = 'credits';
        else if (/workflow|unpublished|archived/.test(descriptor)) providerErrorCategory = 'workflow';
        else if (/invalid|missing|required|validation|parameter|field/.test(descriptor)) providerErrorCategory = 'request-validation';
      } catch { /* No parseable error response; retain HTTP category only. */ }
      throw new Error('Didit session request was not accepted');
    }
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
        diditEventCreatedAt: 0, creatingSinceMs: 0, memberIssueCodes: [],
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    });
    return { sessionId, launchUrl: url, status: 'PENDING', provider: 'didit', environment: env(), configured: true };
  } catch (error) {
    // A 5xx, timeout, malformed success payload or post-success binding error
    // is ambiguous: Didit may already own a live session. Preserve that fact
    // and require provider-list recovery; never silently reset to NOT_STARTED.
    const outcomeUncertain = providerHttpStatus === null || providerHttpStatus >= 500 ||
      failurePhase === 'provider-response' || failurePhase === 'account-binding';
    await db().runTransaction(async tx => {
      const ref = ageRef(uid);
      const snap = await tx.get(ref);
      if (snap.data()?.status === 'CREATING') tx.set(ref, {
        status: outcomeUncertain ? 'CREATION_UNCERTAIN' : 'NOT_STARTED',
        creationOutcomeUncertain: outcomeUncertain,
        creatingSinceMs: 0, updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    });
    // Safe diagnostics only: never log provider response bodies, keys, IDs,
    // session URLs, identity details, or biometric/document data.
    console.error('Didit session creation failed', {
      phase: failurePhase, providerHttpStatus, providerErrorCategory,
      category: error instanceof Error ? error.name : 'unknown',
    });
    throw new HttpsError('unavailable',
      'Nightjar could not start Didit. Please contact Nightjar support before retrying; a provider session may already have been created.');
  }
};

// Only mundane, user-actionable warnings from HMAC-verified Didit events
// can be stored. Fraud/risk signals, biometrics, identity data and free text
// must never enter this member-facing feedback channel.
const DIDIT_MEMBER_SAFE_WARNINGS = new Set([
  'DOCUMENT_EXPIRED', 'COULD_NOT_RECOGNIZE_DOCUMENT',
  'DOCUMENT_TYPE_NOT_SUPPORTED', 'DOCUMENT_NOT_SUPPORTED_FOR_APPLICATION', 'NO_FACE_DETECTED',
  'LOW_FACE_MATCH_SIMILARITY',
]);
export const diditSafeMemberWarningCodes = (value: unknown): string[] =>
  Array.isArray(value) ? [...new Set(value.filter((code): code is string =>
    typeof code === 'string' && DIDIT_MEMBER_SAFE_WARNINGS.has(code)))].slice(0, 4) : [];

export const diditMemberWarningCodesFromDecision = (value: unknown): string[] => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  const decision = value as Record<string, unknown>;
  const codes: unknown[] = [];
  for (const field of ['id_verifications', 'liveness_checks', 'face_matches']) {
    const checks = decision[field];
    if (!Array.isArray(checks)) continue;
    for (const check of checks.slice(0, 8)) {
      if (!check || typeof check !== 'object' || Array.isArray(check)) continue;
      const feature = check as Record<string, unknown>;
      const warnings = Array.isArray(feature.warnings) ? feature.warnings
        : Array.isArray(feature.warning_codes) ? feature.warning_codes : [];
      for (const warning of warnings.slice(0, 8)) {
        if (typeof warning === 'string') codes.push(warning);
        else if (warning && typeof warning === 'object' && !Array.isArray(warning)) {
          const obj=warning as Record<string, unknown>;
          codes.push(obj.log_type ?? obj.code ?? obj.name);
        }
      }
    }
  }
  return diditSafeMemberWarningCodes(codes);
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
  const verified = diditWebhookSignatureValid(
    raw,
    text(request.get('X-Signature-V2')),
    text(request.get('X-Signature')),
    secret,
  );
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
    // Only safe categorical reasons, not identity data or freeform warnings.
    adultEvidence: value.status === 'Approved' && verifiedAdultFromDecision(value.decision),
    memberIssueCodes: value.decision && typeof value.decision === 'object'
      ? diditMemberWarningCodesFromDecision(value.decision) : null,
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
      (session.applicationId && payload.applicationId && session.applicationId !== payload.applicationId) ||
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
      ...(approved ? {memberIssueCodes: []} :
        Array.isArray(payload.memberIssueCodes)
          ? {memberIssueCodes: diditSafeMemberWarningCodes(payload.memberIssueCodes)} : {}),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    tx.set(doc.ref, { processedAt: FieldValue.serverTimestamp(), accountId: uid }, { merge: true });
    tx.set(sessionRef(sessionId), { status, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  });
});
