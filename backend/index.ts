import { router, json, error, requireAuth, requireAdminEmailAllowlist, withScopes } from '@appdeploy/sdk';
import { db, storage } from '@appdeploy/sdk';

const catalogue = [
  { title: 'After Midnight', creator: 'Mara Vale', category: 'Atmospheric', durationMinutes: 18, listeners: 12400 },
  { title: 'Velvet Static', creator: 'Rae Hollow', category: 'Story', durationMinutes: 24, listeners: 9800 },
  { title: 'Slow Burn', creator: 'Noor', category: 'Whisper', durationMinutes: 16, listeners: 7100 },
  { title: 'The Last Train Home', creator: 'Mara Vale', category: 'Story', durationMinutes: 31, listeners: 6600 },
];

const accountTable = (userId: string) => `nightjar_account_${userId}`;
const ADMIN_EMAILS = ['mike.owen230792@gmail.com', 'megan.wright666@hotmail.com'];
const accountIndexTable = 'nightjar_account_index';
const subscriptionTable = 'nightjar_subscriptions';
const normalizeEmail = (email?: string) => email?.trim().toLowerCase() ?? '';
const isAdmin = (email?: string) => Boolean(normalizeEmail(email) && ADMIN_EMAILS.includes(normalizeEmail(email)));
const profileTable = (userId: string) => `nightjar_profile_${userId}`;
const tasteTable = (userId: string) => `nightjar_taste_${userId}`;
const readerSessionTable = (userId: string) => `nightjar_reader_sessions_${userId}`;
const securityAlertTable = 'nightjar_security_alerts';
const securityEventTable = 'nightjar_security_events';
const securityCaseTable = 'nightjar_security_cases';
const ownerNotificationTable = (email: string) => `nightjar_owner_notifications_${normalizeEmail(email).replace(/[^a-z0-9]/g, '_')}`;
type NightjarProfile = { displayName?: string|null; handle?: string|null; headline?: string|null; bio?: string|null; pronouns?: string|null; avatarInitials?: string|null; avatarTone?: string|null; favouriteTags?: string[]; favouriteTropes?: string[]; favouriteCategories?: string[]; roleFocus?: string[]; publicProfile?: boolean; createdAt?: string; updatedAt?: string; };
const cleanList = (value: unknown, max = 16) => Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean).slice(0, max) : [];
const cleanHandle = (value?: unknown) => String(value ?? '').trim().toLowerCase().replace(/^@+/, '').replace(/[^a-z0-9_\.\-]/g, '').slice(0, 30);
const getProfile = async (userId: string) => { const { items } = await db.list<NightjarProfile>(profileTable(userId), { limit: 1 }); return items[0] ?? null; };
const isSuspended = async (userId: string) => { const { items } = await db.list(accountTable(userId), { limit: 1 }); return items[0]?.status === 'suspended'; };
const revokeReaderSessions = async (userId: string, reason: string) => { const { items } = await db.list(readerSessionTable(userId), { limit: 500 }); const now = new Date().toISOString(); const updates = items.filter((item) => item.status === 'active').map((item) => ({ id: item.id, record: { ...item, status: 'revoked', revokedAt: now, revokedReason: reason } })); if (updates.length) await db.update(readerSessionTable(userId), updates); };
const createOwnerSecurityNotifications = async (alert: Record<string, unknown>) => { for (const email of ADMIN_EMAILS) await db.add(ownerNotificationTable(email), [{ type:'security_alert', alertId:alert.id??null, severity:alert.severity??'high', title:'Nightjar security alert', message:alert.reason??'Suspicious protected-content activity detected.', createdAt:new Date().toISOString(), read:false, recipientEmail:normalizeEmail(email) }]); };
const createSecurityAlert = async (userId: string, details: Record<string, unknown>) => { const now=new Date().toISOString(); const recipients=ADMIN_EMAILS.map(normalizeEmail); const [id]=await db.add(securityAlertTable,[{userId,...details,recipients,createdAt:now,status:'open'}]); const alert={id:id??null,userId,...details,recipients,createdAt:now,status:'open'}; await createOwnerSecurityNotifications(alert); await db.add(securityCaseTable,[{alertId:id??null,userId,state:'detection',history:[{state:'detection',at:now,note:'Suspicious activity detected; alert sent to both Nightjar owners.'}],createdAt:now,updatedAt:now}]); return alert; };
const assessProtectedActivity = async (userId: string, signal: Record<string, unknown>) => { const now=Date.now(); const {items}=await db.list(securityEventTable,{limit:500}); const recent=items.filter((item)=>item.userId===userId && now-new Date(item.createdAt??0).getTime()<60000); const scriptId=String(signal.relatedId??''); const sameScriptRecent=recent.filter((item)=>String(item.relatedId??'')===scriptId); const score=(recent.length>=40?35:recent.length>=20?20:0)+(sameScriptRecent.length>=25?40:sameScriptRecent.length>=12?25:0)+(signal.eventType==='script_view'&&sameScriptRecent.length>=8?20:0)+(signal.eventType==='blocked_interaction'?8:0); if(score<50)return null; const existing=await db.list(securityAlertTable,{limit:100}); if(existing.items.some((item)=>item.userId===userId&&item.status==='open'&&now-new Date(item.createdAt??0).getTime()<600000))return null; return createSecurityAlert(userId,{severity:score>=75?'critical':'high',riskScore:score,reason:`Unusually dense protected-content activity detected (${sameScriptRecent.length} related events in under a minute).`,relatedId:scriptId||null,signal:{eventType:signal.eventType,recentEvents:recent.length,relatedEvents:sameScriptRecent.length}}); };

const brandingTable = 'nightjar_branding';
const ageTable = (userId: string) => `nightjar_age_${userId}`;
const AGE_THRESHOLD = 18;

type AgeRecord = {
  verified: boolean;
  ageThreshold: number;
  provider: string;
  verifiedAt?: string;
  verificationReference?: string;
  sessionId?: string;
  status?: string;
  testMode?: boolean;
};

const appUrl = 'https://nightjar-42eeag.v2.appdeploy.ai/';
const yotiConfigured = () => Boolean(process.env.YOTI_SDK_ID && process.env.YOTI_ACCESS_TOKEN);

async function getAgeRecord(userId: string) {
  const { items } = await db.list<AgeRecord>(ageTable(userId), { limit: 1 });
  return items[0] ?? null;
}

async function saveAgeRecord(userId: string, record: AgeRecord) {
  const table = ageTable(userId);
  const existing = await db.list<AgeRecord>(table, { limit: 1 });
  if (existing.items[0]) {
    const [ok] = await db.update(table, [{ id: existing.items[0].id, record }]);
    if (!ok) throw new Error('Unable to update age verification state.');
  } else {
    const [id] = await db.add(table, [record]);
    if (!id) throw new Error('Unable to create age verification state.');
  }
}

async function refreshYotiSandboxResult(userId: string, record: AgeRecord) {
  if (!record.sessionId || !yotiConfigured()) return record;
  const response = await fetch(`https://age.yoti.com/sandbox/api/v1/sessions/${record.sessionId}/result`, {
    headers: {
      Authorization: `Bearer ${process.env.YOTI_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
      'Yoti-Sdk-Id': process.env.YOTI_SDK_ID!,
    },
  });
  if (!response.ok) throw new Error(`Yoti sandbox result request failed (${response.status}).`);
  const result = await response.json() as { status?: string; age?: number; method?: string };
  if (result.status === 'COMPLETE' && typeof result.age === 'number' && result.age >= AGE_THRESHOLD) {
    const verifiedRecord: AgeRecord = {
      verified: true,
      ageThreshold: AGE_THRESHOLD,
      provider: 'yoti-sandbox',
      verifiedAt: new Date().toISOString(),
      verificationReference: result.method ?? 'sandbox',
      sessionId: record.sessionId,
      status: 'COMPLETE',
    };
    await saveAgeRecord(userId, verifiedRecord);
    return verifiedRecord;
  }
  if (['FAIL', 'ERROR', 'CANCELLED'].includes(result.status ?? '')) {
    const failedRecord = { ...record, verified: false, status: result.status };
    await saveAgeRecord(userId, failedRecord);
    return failedRecord;
  }
  return { ...record, status: result.status ?? 'PENDING' };
}

type Role = 'admin' | 'creator' | 'listener' | 'writer' | 'editor';

type AccountRecord = {
  role: Role;
  status: 'active' | 'pending_review';
  createdAt: string;
};

export const handler = router({
  'GET /api/_healthcheck': [async () => json({ message: 'Success' })],
  'GET /api/catalogue': [async () => json({ catalogue })],
  'GET /api/creator-demo': [
    async () => {
      const { items } = await db.list('creator_demo_metrics', { limit: 1 });
      return json({
        metrics: items[0] ?? { listeners: 1842, eligibleMinutes: 73421, creatorPool: 6742, estimatedShare: 1247 },
        formula: 'Net subscription revenue → creator pool → allocated by verified listening',
      });
    },
  ],
  'GET /api/account/identity': [
    requireAuth(),
    withScopes('email'),
    async (ctx) => json({
      email: ctx.user!.email ?? null,
      normalizedEmail: normalizeEmail(ctx.user!.email),
      userId: ctx.user!.userId,
      scope: ctx.user!.scope,
      admin: isAdmin(ctx.user!.email),
      adminEmailsConfigured: ADMIN_EMAILS,
    }),
  ],
  'GET /api/age/status': [
    requireAuth(),
    async (ctx) => {
      let record = await getAgeRecord(ctx.user!.userId);
      if (record?.sessionId && yotiConfigured() && !record.verified) {
        try {
          record = await refreshYotiSandboxResult(ctx.user!.userId, record);
        } catch {
          // Preserve the pending state if the provider is temporarily unavailable.
        }
      }
      return json({
        verified: record?.verified === true,
        ageThreshold: AGE_THRESHOLD,
        provider: record?.provider ?? 'yoti-sandbox',
        status: record?.status ?? 'NOT_STARTED',
        configured: yotiConfigured(),
        testAvailable: isAdmin(ctx.user!.email),
      });
    },
  ],
  'POST /api/age/session': [
    requireAuth(),
    async (ctx) => {
      const existing = await getAgeRecord(ctx.user!.userId);
      if (existing?.verified) return json({ verified: true, status: 'COMPLETE', provider: existing.provider });
      if (!yotiConfigured()) return json({ verified: false, configured: false, provider: 'yoti-sandbox', testAvailable: isAdmin(ctx.user!.email) });

      const response = await fetch('https://age.yoti.com/sandbox/api/v1/sessions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.YOTI_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
          'Yoti-Sdk-Id': process.env.YOTI_SDK_ID!,
        },
        body: JSON.stringify({
          type: 'OVER',
          ttl: 900,
          age_estimation: { allowed: true, threshold: AGE_THRESHOLD, level: 'PASSIVE', retry_limit: 2 },
          digital_id: { allowed: true, threshold: AGE_THRESHOLD, retry_limit: 2 },
          doc_scan: { allowed: true, threshold: AGE_THRESHOLD, authenticity: 'AUTO', level: 'PASSIVE', preset_issuing_country: 'GBR', retry_limit: 2 },
          credit_card: { allowed: false, retry_limit: 1 },
          mobile: { allowed: false, retry_limit: 1 },
          reference_id: ctx.user!.userId,
          callback: { auto: true, url: appUrl },
          cancel_url: appUrl,
          retry_enabled: true,
          resume_enabled: true,
          synchronous_checks: true,
        }),
      });
      if (!response.ok) return error(`Yoti sandbox could not create a verification session (${response.status}).`, 502);
      const session = await response.json() as { id?: string; status?: string; expires_at?: string };
      if (!session.id) return error('Yoti sandbox did not return a session ID.', 502);
      const record: AgeRecord = {
        verified: false,
        ageThreshold: AGE_THRESHOLD,
        provider: 'yoti-sandbox',
        verificationReference: ctx.user!.userId,
        sessionId: session.id,
        status: session.status ?? 'PENDING',
      };
      await saveAgeRecord(ctx.user!.userId, record);
      return json({
        verified: false,
        configured: true,
        provider: 'yoti-sandbox',
        status: record.status,
        sessionId: session.id,
        expiresAt: session.expires_at ?? null,
        launchUrl: `https://age.yoti.com/sandbox?sessionId=${encodeURIComponent(session.id)}&sdkId=${encodeURIComponent(process.env.YOTI_SDK_ID!)}`,
      });
    },
  ],
  'POST /api/age/test-pass': [
    requireAuth(),
    requireAdminEmailAllowlist(ADMIN_EMAILS),
    async (ctx) => {
      const verifiedRecord: AgeRecord = {
        verified: true,
        ageThreshold: AGE_THRESHOLD,
        provider: 'nightjar-sandbox-test',
        verifiedAt: new Date().toISOString(),
        verificationReference: 'admin-test',
        status: 'COMPLETE',
        testMode: true,
      };
      await saveAgeRecord(ctx.user!.userId, verifiedRecord);
      return json({ verified: true, provider: verifiedRecord.provider, testMode: true });
    },
  ],
  'GET /api/account': [
    requireAuth(),
    withScopes('email'),
    async (ctx) => {
      if (isAdmin(ctx.user!.email)) {
        const table = accountTable(ctx.user!.userId);
        const existing = await db.list<AccountRecord>(table, { limit: 1 });
        if (existing.items.length > 0) await db.delete(table, [existing.items[0].id]);
        return json({ role: 'admin', status: 'active', owner: true });
      }
      const { items } = await db.list<AccountRecord>(accountTable(ctx.user!.userId), { limit: 1 });
      return json({
        role: items[0]?.role ?? null,
        status: items[0]?.status ?? null,
        owner: false,
      });
    },
  ],
  'POST /api/account/role': [
    requireAuth(),
    async (ctx) => {
      const body = (ctx.body ?? {}) as { role?: string };
      if (!['listener', 'creator', 'writer'].includes(body.role ?? '')) {
        return error('Only Listener, Creator and Writer roles can be self-selected. Editor and Administrator are controlled roles.', 400);
      }
      if (isAdmin(ctx.user!.email)) {
        return error('Administrator accounts do not self-select another real role.', 403);
      }

      const table = accountTable(ctx.user!.userId);
      const existing = await db.list<AccountRecord>(table, { limit: 1 });
      if (existing.items.length > 0) {
        return error('This account already has a role. Roles are intentionally not switchable.', 409);
      }

      const status = body.role === 'creator' ? 'pending_review' : 'active';
      const [id] = await db.add(table, [{
        role: body.role,
        status,
        createdAt: new Date().toISOString(),
      }]);

      if (!id) {
        return error('Unable to create the Nightjar account profile.', 500);
      }
      await db.add(accountIndexTable, [{
        userId: ctx.user!.userId,
        email: normalizeEmail(ctx.user!.email),
        name: ctx.user!.name ?? null,
        role: body.role,
        status,
        createdAt: new Date().toISOString(),
      }]);

      return json({ role: body.role, status });
    },
  ],
  'GET /api/protection/evidence': [
    requireAuth(),
    async (ctx) => {
      const { items } = await db.list('nightjar_evidence_' + ctx.user!.userId, { limit: 100 });
      return json({ evidence: items });
    },
  ],
  'POST /api/protection/event': [
    requireAuth(),
    async (ctx) => {
      if (await isSuspended(ctx.user!.userId)) return error('This account is suspended.', 403);
      const body = (ctx.body ?? {}) as { eventType?: string; relatedType?: string; relatedId?: string; severity?: string; summary?: string; sessionId?: string };
      const allowed = new Set(['script_view','copy_blocked','cut_blocked','paste_blocked','contextmenu_blocked','selection_blocked','drag_blocked','print_blocked','export_requested','export_completed','permission_changed','script_access_requested','report_submitted','blocked_interaction','repeated_protected_interaction']);
      if (!body.eventType || !allowed.has(body.eventType)) return error('Unsupported protection event.',400);
      const record={eventType:body.eventType,severity:body.severity==='high'||body.severity==='medium'?body.severity:'low',relatedType:body.relatedType??null,relatedId:body.relatedId??null,sessionId:body.sessionId??null,summary:(body.summary??'Protected interaction recorded.').slice(0,300),actorUserId:ctx.user!.userId,createdAt:new Date().toISOString()};
      const [id]=await db.add('nightjar_evidence_'+ctx.user!.userId,[record]);
      await db.add(securityEventTable,[{userId:ctx.user!.userId,...record}]);
      const alert=await assessProtectedActivity(ctx.user!.userId,{eventType:body.eventType,relatedId:body.relatedId,sessionId:body.sessionId});
      return json({recorded:Boolean(id),eventId:id??null,suspicious:Boolean(alert),alertId:alert?.id??null});
    },
  ],
  'POST /api/protection/report': [
    requireAuth(),
    async (ctx) => {
      const body = (ctx.body ?? {}) as { category?: string; summary?: string; subjectUserId?: string; relatedType?: string; relatedId?: string };
      if (!body.category || !body.summary) return error('Choose a report type and describe what happened.', 400);
      const caseId = 'NJ-' + Date.now().toString(36).toUpperCase();
      const report = {
        caseId,
        reporterUserId: ctx.user!.userId,
        subjectUserId: body.subjectUserId ?? null,
        category: body.category.slice(0, 80),
        summary: body.summary.slice(0, 1800),
        relatedType: body.relatedType ?? null,
        relatedId: body.relatedId ?? null,
        status: 'new',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const [id] = await db.add('nightjar_reports_' + ctx.user!.userId, [report]);
      if (!id) return error('Unable to create the protection case.', 500);
      await db.add('nightjar_reports_index', [{ ...report, id }]);
      await db.add('nightjar_evidence_' + ctx.user!.userId, [{
        eventType: 'report_submitted',
        severity: 'medium',
        relatedType: 'report',
        relatedId: caseId,
        summary: 'Protection report ' + caseId + ' submitted.',
        actorUserId: ctx.user!.userId,
        createdAt: new Date().toISOString(),
      }]);
      return json({ report });
    },
  ],
  'GET /api/protection/reports': [
    requireAuth(),
    async (ctx) => {
      const { items } = await db.list('nightjar_reports_' + ctx.user!.userId, { limit: 50 });
      return json({ reports: items });
    },
  ],
  'POST /api/protection/block': [
    requireAuth(),
    async (ctx) => {
      const body = (ctx.body ?? {}) as { userId?: string };
      if (!body.userId || body.userId === ctx.user!.userId) return error('A different user account is required.', 400);
      const [id] = await db.add('nightjar_blocks_' + ctx.user!.userId, [{ blockedUserId: body.userId, createdAt: new Date().toISOString() }]);
      return json({ blocked: Boolean(id) });
    },
  ],
  'GET /api/scripts/catalogue': [
    requireAuth(),
    async () => {
      const { items } = await db.list('nightjar_scripts', { limit: 50 });
      return json({ scripts: items.map(({ body, ...script }) => ({ ...script, protected: true })) });
    },
  ],
  'GET /api/scripts/:scriptId': [
    requireAuth(),
    async (ctx) => {
      const { items } = await db.list('nightjar_scripts', { limit: 50 });
      const script = items.find((item) => item.id === ctx.params.scriptId);
      if (!script) return error('Script not found.', 404);
      const { items: accessItems } = await db.list('nightjar_script_access_' + ctx.user!.userId, { limit: 100 });
      const access = accessItems.find((item) => item.scriptId === ctx.params.scriptId);
      const owner = script.writerUserId === ctx.user!.userId;
      if (!owner && !access) {
        return json({ script: { id: script.id, title: script.title, synopsis: script.synopsis, excerpt: script.excerpt, genre: script.genre, runtimeTarget: script.runtimeTarget, characters: script.characters, ageClassification: script.ageClassification, writerUserId: script.writerUserId, writerName: script.writerName, version: script.version }, canReadFull: false, copyAllowed: false, exportAllowed: false });
      }
      await db.add('nightjar_evidence_' + ctx.user!.userId, [{
        eventType: 'script_view',
        severity: 'low',
        relatedType: 'script',
        relatedId: ctx.params.scriptId,
        summary: 'Authorised full script view opened.',
        actorUserId: ctx.user!.userId,
        createdAt: new Date().toISOString(),
      }]);
      return json({ script, canReadFull: true, copyAllowed: owner || access.allowCopy === true, exportAllowed: owner || access.allowExport === true });
    },
  ],
  'POST /api/scripts/:scriptId/request-access': [
    requireAuth(),
    async (ctx) => {
      const body = (ctx.body ?? {}) as { writerUserId?: string };
      const { items } = await db.list('nightjar_script_access_' + ctx.user!.userId, { limit: 100 });
      if (items.some((item) => item.scriptId === ctx.params.scriptId)) return json({ requested: false, alreadyGranted: true });
      await db.add('nightjar_evidence_' + ctx.user!.userId, [{
        eventType: 'script_access_requested',
        severity: 'low',
        relatedType: 'script',
        relatedId: ctx.params.scriptId,
        summary: 'Creator requested full read access to a script.',
        actorUserId: ctx.user!.userId,
        createdAt: new Date().toISOString(),
      }]);
      if (body.writerUserId) await db.add('nightjar_script_access_requests_' + body.writerUserId, [{ scriptId: ctx.params.scriptId, requesterUserId: ctx.user!.userId, status: 'pending', createdAt: new Date().toISOString() }]);
      return json({ requested: true });
    },
  ],
  'POST /api/scripts/:scriptId/permissions': [
    requireAuth(),
    async (ctx) => {
      const body = (ctx.body ?? {}) as { creatorUserId?: string; allowCopy?: boolean; allowExport?: boolean };
      if (!body.creatorUserId) return error('Creator account is required.', 400);
      const { items } = await db.list('nightjar_scripts', { limit: 50 });
      const script = items.find((item) => item.id === ctx.params.scriptId);
      if (!script || script.writerUserId !== ctx.user!.userId) return error('Writer ownership is required.', 403);
      const table = 'nightjar_script_access_' + body.creatorUserId;
      const existing = await db.list(table, { limit: 100 });
      const record = { scriptId: ctx.params.scriptId, writerUserId: ctx.user!.userId, collaborationId: body.creatorUserId + ':' + ctx.params.scriptId, allowCopy: body.allowCopy === true, allowExport: body.allowExport === true, grantedAt: new Date().toISOString() };
      const match = existing.items.find((item) => item.scriptId === ctx.params.scriptId);
      if (match) await db.update(table, [{ id: match.id, record }]);
      else await db.add(table, [record]);
      await db.add('nightjar_evidence_' + ctx.user!.userId, [{ eventType: 'permission_changed', severity: 'low', relatedType: 'script', relatedId: ctx.params.scriptId, summary: 'Writer changed script copy/export permissions.', actorUserId: ctx.user!.userId, createdAt: new Date().toISOString() }]);
      return json({ allowCopy: record.allowCopy, allowExport: record.allowExport });
    },
  ],
  'POST /api/admin/creator-applications/:applicationId/decision': [
    requireAuth(),
    requireAdminEmailAllowlist(ADMIN_EMAILS),
    async (ctx) => {
      const body = (ctx.body ?? {}) as { decision?: string };
      if (!['approved', 'waitlist', 'rejected'].includes(body.decision ?? '')) return error('Choose an approval decision.', 400);
      const { items } = await db.list('nightjar_creator_applications', { limit: 100 });
      const application = items.find((item) => item.id === ctx.params.applicationId);
      if (!application) return error('Creator application not found.', 404);
      const nextApplication = { ...application, status: body.decision, reviewedBy: ctx.user!.userId, reviewedAt: new Date().toISOString() };
      const [updated] = await db.update('nightjar_creator_applications', [{ id: application.id, record: nextApplication }]);
      if (!updated) return error('Creator application could not be updated.', 500);
      if (body.decision === 'approved' && application.userId) {
        const accountIndex = await db.list(accountIndexTable, { limit: 500 });
        const indexed = accountIndex.items.find((account) => account.userId === application.userId);
        if (indexed) await db.update(accountIndexTable, [{ id: indexed.id, record: { ...indexed, role: 'creator', status: 'active' } }]);
        const account = await db.list<AccountRecord>(accountTable(application.userId), { limit: 1 });
        if (account.items[0]) await db.update(accountTable(application.userId), [{ id: account.items[0].id, record: { ...account.items[0], role: 'creator', status: 'active' } }]);
      }
      return json({ application: nextApplication });
    },
  ],
  'GET /api/profile/me': [requireAuth(), async (ctx) => json({ profile: await getProfile(ctx.user!.userId) })],
  'PUT /api/profile/me': [
    requireAuth(),
    async (ctx) => {
      const body=(ctx.body??{}) as NightjarProfile; const handle=cleanHandle(body.handle);
      if(handle){ const {items}=await db.list(accountIndexTable,{limit:1000}); if(items.some((item)=>item.userId!==ctx.user!.userId&&cleanHandle(item.handle)===handle)) return error('That @handle is already in use.',409); }
      const current=await getProfile(ctx.user!.userId); const profile:NightjarProfile={displayName:String(body.displayName??ctx.user!.name??'Nightjar account').trim().slice(0,80),handle:handle||null,headline:String(body.headline??'').trim().slice(0,120),bio:String(body.bio??'').trim().slice(0,500),pronouns:String(body.pronouns??'').trim().slice(0,60),avatarInitials:String(body.avatarInitials??'').trim().slice(0,4).toUpperCase(),avatarTone:String(body.avatarTone??'plum').trim().slice(0,24),favouriteTags:cleanList(body.favouriteTags),favouriteTropes:cleanList(body.favouriteTropes),favouriteCategories:cleanList(body.favouriteCategories),roleFocus:cleanList(body.roleFocus),publicProfile:body.publicProfile!==false,createdAt:current?.createdAt??new Date().toISOString(),updatedAt:new Date().toISOString()};
      if(current){const {items}=await db.list(profileTable(ctx.user!.userId),{limit:1}); if(items[0]) await db.update(profileTable(ctx.user!.userId),[{id:items[0].id,record:profile}]);} else await db.add(profileTable(ctx.user!.userId),[profile]);
      const {items:indexes}=await db.list(accountIndexTable,{limit:1000}); const indexed=indexes.find((item)=>item.userId===ctx.user!.userId); if(indexed) await db.update(accountIndexTable,[{id:indexed.id,record:{...indexed,name:profile.displayName,handle:profile.handle}}]);
      await db.add(tasteTable(ctx.user!.userId),[{type:'declared_preferences',tags:profile.favouriteTags,tropes:profile.favouriteTropes,categories:profile.favouriteCategories,updatedAt:profile.updatedAt}]);
      return json({profile});
    },
  ],
  'GET /api/profile/:handle': [async (ctx) => { const handle=cleanHandle(ctx.params.handle); const {items:indexes}=await db.list(accountIndexTable,{limit:1000}); const account=indexes.find((item)=>cleanHandle(item.handle)===handle); if(!account)return error('Profile not found.',404); const profile=await getProfile(account.userId); if(!profile?.publicProfile)return error('Profile not found.',404); return json({profile:{...profile,role:account.role}}); }],
  'POST /api/taste/event': [requireAuth(), async (ctx) => { const body=(ctx.body??{}) as {eventType?:string;contentId?:string;category?:string;tags?:string[];durationSeconds?:number;completed?:boolean}; if(!body.eventType)return error('Taste event type is required.',400); await db.add(tasteTable(ctx.user!.userId),[{type:body.eventType,contentId:body.contentId??null,category:body.category??null,tags:cleanList(body.tags,12),durationSeconds:Math.max(0,Number(body.durationSeconds??0)),completed:body.completed===true,createdAt:new Date().toISOString()}]); return json({recorded:true}); }],
  'GET /api/taste/profile': [requireAuth(), async (ctx) => { const profile=await getProfile(ctx.user!.userId); const {items}=await db.list(tasteTable(ctx.user!.userId),{limit:500}); const weights:Record<string,number>={}; for(const value of [...(profile?.favouriteTags??[]),...(profile?.favouriteTropes??[]),...(profile?.favouriteCategories??[])])weights[value]=(weights[value]??0)+3; for(const item of items)for(const value of [...(item.tags??[]),...(item.category?[item.category]:[])])weights[value]=(weights[value]??0)+(item.type==='skip'||item.type==='hide'?-0.5:item.completed?2:1); return json({declared:{tags:profile?.favouriteTags??[],tropes:profile?.favouriteTropes??[],categories:profile?.favouriteCategories??[]},vector:Object.entries(weights).sort((a,b)=>b[1]-a[1]).slice(0,24).map(([label,value])=>({label,weight:Number(value.toFixed(2))}))}); }],
  'POST /api/security/reader-session': [requireAuth(), async (ctx) => { if(await isSuspended(ctx.user!.userId))return error('This account is suspended.',403); const body=(ctx.body??{}) as {scriptId?:string}; if(!body.scriptId)return error('Script ID is required.',400); const {items}=await db.list('nightjar_script_access_'+ctx.user!.userId,{limit:100}); const grant=items.find((item)=>item.scriptId===body.scriptId); const {items:scripts}=await db.list('nightjar_scripts',{limit:100}); const script=scripts.find((item)=>item.id===body.scriptId); if(!script||(!grant&&script.writerUserId!==ctx.user!.userId))return error('Protected script access has not been granted.',403); const sessionId='NJ-RD-'+Math.random().toString(36).slice(2,12).toUpperCase(); const expiresAt=new Date(Date.now()+900000).toISOString(); const session={sessionId,scriptId:body.scriptId,accountId:ctx.user!.userId,accessGrantId:grant?.id??'owner',issuedAt:new Date().toISOString(),expiresAt,status:'active',canReadFull:true,allowCopy:grant?.allowCopy===true||script.writerUserId===ctx.user!.userId,allowExport:grant?.allowExport===true||script.writerUserId===ctx.user!.userId}; await db.add(readerSessionTable(ctx.user!.userId),[session]); await db.add(securityEventTable,[{userId:ctx.user!.userId,eventType:'reader_session_issued',relatedId:body.scriptId,sessionId,createdAt:new Date().toISOString()}]); return json({session}); }],
  'GET /api/security/notifications': [requireAuth(), withScopes('email'), async (ctx) => { if(!isAdmin(ctx.user!.email))return json({notifications:[]}); const {items}=await db.list(ownerNotificationTable(ctx.user!.email),{limit:100}); return json({notifications:items}); }],
  'GET /api/admin/security-alerts': [requireAdminEmailAllowlist(ADMIN_EMAILS), async () => { const {items}=await db.list(securityAlertTable,{limit:100}); return json({alerts:items}); }],
  'POST /api/admin/security-alerts/:alertId/suspend': [requireAdminEmailAllowlist(ADMIN_EMAILS), async (ctx) => { const {items}=await db.list(securityAlertTable,{limit:100}); const alert=items.find((item)=>item.id===ctx.params.alertId); if(!alert)return error('Security alert not found.',404); const userId=String(alert.userId); const {items:accounts}=await db.list(accountTable(userId),{limit:1}); if(accounts[0])await db.update(accountTable(userId),[{id:accounts[0].id,record:{...accounts[0],status:'suspended',suspendedAt:new Date().toISOString(),suspendedBy:ctx.user!.email??null}}]); const {items:indexes}=await db.list(accountIndexTable,{limit:1000}); const indexed=indexes.find((item)=>item.userId===userId); if(indexed)await db.update(accountIndexTable,[{id:indexed.id,record:{...indexed,status:'suspended'}}]); await revokeReaderSessions(userId,'Account suspended after security review.'); await db.update(securityAlertTable,[{id:alert.id,record:{...alert,status:'actioned',action:'suspended',actionedAt:new Date().toISOString(),actionedBy:ctx.user!.email??null}}]); await db.add(securityEventTable,[{userId,eventType:'account_suspended',actorEmail:ctx.user!.email??null,relatedId:alert.id,createdAt:new Date().toISOString()}]); return json({suspended:true,userId}); }],

  'GET /api/admin/overview':
    requireAuth(),
  'GET /api/admin/overview': [
    requireAdminEmailAllowlist(ADMIN_EMAILS),
    async () => {
      const { items: accounts } = await db.list(accountIndexTable, { limit: 500 });
      const { items: subscriptions } = await db.list(subscriptionTable, { limit: 500 });
      const counts = { listener: 0, creator: 0, writer: 0, editor: 0, admin: ADMIN_EMAILS.length };
      accounts.forEach((account) => {
        if (account.role === 'listener') counts.listener += 1;
        if (account.role === 'creator') counts.creator += 1;
        if (account.role === 'writer') counts.writer += 1;
        if (account.role === 'editor') counts.editor += 1;
      });
      const subscriptionCounts = { active: 0, trialing: 0, pastDue: 0, cancelled: 0 };
      subscriptions.forEach((subscription) => {
        if (subscription.status === 'active') subscriptionCounts.active += 1;
        else if (subscription.status === 'trialing') subscriptionCounts.trialing += 1;
        else if (subscription.status === 'past_due') subscriptionCounts.pastDue += 1;
        else if (subscription.status === 'cancelled') subscriptionCounts.cancelled += 1;
      });
      return json({
        people: {
          counts,
          total: counts.listener + counts.creator + counts.writer + counts.editor + counts.admin,
          accounts: accounts.filter((account) => ['listener','creator','writer','editor'].includes(account.role)).slice(0, 100),
          administrators: ADMIN_EMAILS.map((email) => ({ email, role: 'admin', status: 'active', designation: 'Owner / Administrator' })),
        },
        subscriptions: { ...subscriptionCounts, totalTracked: subscriptions.length, billingConnected: subscriptions.length > 0 },
      });
    },
  ],
  'GET /api/admin/creator-applications': [
    requireAuth(),
    requireAdminEmailAllowlist(ADMIN_EMAILS),
    async () => {
      const { items } = await db.list('nightjar_creator_applications', { limit: 50 });
      return json({ applications: items });
    },
  ],
  'GET /api/admin/subscriptions': [
    requireAuth(),
    requireAdminEmailAllowlist(ADMIN_EMAILS),
    async () => {
      const { items } = await db.list(subscriptionTable, { limit: 100 });
      return json({ subscriptions: items });
    },
  ],
  'GET /api/admin/settings': [
    requireAuth(),
    requireAdminEmailAllowlist(ADMIN_EMAILS),
    async () => {
      const { items } = await db.list('nightjar_settings', { limit: 50 });
      return json({ monthlyReleaseCap: items.find((item) => item.key === 'monthlyReleaseCap')?.value ?? 4 });
    },
  ],
  'POST /api/admin/settings': [
    requireAuth(),
    requireAdminEmailAllowlist(ADMIN_EMAILS),
    async (ctx) => {
      const body = (ctx.body ?? {}) as { monthlyReleaseCap?: number };
      const cap = Math.max(1, Math.min(50, Math.floor(Number(body.monthlyReleaseCap ?? 4))));
      const { items } = await db.list('nightjar_settings', { limit: 50 });
      const existing = items.find((item) => item.key === 'monthlyReleaseCap');
      const record = { key: 'monthlyReleaseCap', value: cap };
      if (existing) await db.update('nightjar_settings', [{ id: existing.id, record }]);
      else await db.add('nightjar_settings', [record]);
      return json({ monthlyReleaseCap: cap });
    },
  ],
  'GET /api/branding': [
    async () => {
      const { items } = await db.list<{ logoPath?: string }>(brandingTable, { limit: 1 });
      const logoPath = items[0]?.logoPath;
      if (!logoPath) return json({ logoUrl: null });
      const [{ url }] = await storage.url([logoPath]);
      return json({ logoUrl: url ?? null });
    },
  ],
  'POST /api/admin/branding/logo': [
    requireAuth(),
    requireAdminEmailAllowlist(ADMIN_EMAILS),
    async (ctx) => {
      const body = (ctx.body ?? {}) as { dataUrl?: string; contentType?: string };
      if (!body.dataUrl || !body.dataUrl.includes(',')) return error('A logo image is required.', 400);
      const contentType = body.contentType || 'image/png';
      if (!['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'].includes(contentType)) return error('Unsupported logo format.', 400);
      const base64 = body.dataUrl.split(',')[1];
      if (!base64) return error('Invalid logo image.', 400);
      const path = `branding/nightjar-logo-${Date.now()}`;
      const [ok] = await storage.write([{ path, content: base64, contentType }]);
      if (!ok) return error('Logo upload failed.', 500);
      const existing = await db.list<{ logoPath?: string }>(brandingTable, { limit: 1 });
      if (existing.items[0]) {
        await db.update(brandingTable, existing.items[0].id, { logoPath: path, updatedAt: new Date().toISOString() });
      } else {
        await db.add(brandingTable, [{ logoPath: path, updatedAt: new Date().toISOString() }]);
      }
      const [{ url }] = await storage.url([path]);
      return json({ logoUrl: url ?? null });
    },
  ],
});
