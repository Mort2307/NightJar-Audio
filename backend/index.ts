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
      const body = (ctx.body ?? {}) as { eventType?: string; relatedType?: string; relatedId?: string; severity?: string; summary?: string };
      const allowed = new Set(['script_view', 'copy_blocked', 'cut_blocked', 'paste_blocked', 'contextmenu_blocked', 'selection_blocked', 'drag_blocked', 'print_blocked', 'export_requested', 'export_completed', 'permission_changed', 'script_access_requested', 'report_submitted']);
      if (!body.eventType || !allowed.has(body.eventType)) return error('Unsupported protection event.', 400);
      const [id] = await db.add('nightjar_evidence_' + ctx.user!.userId, [{
        eventType: body.eventType,
        severity: body.severity === 'high' || body.severity === 'medium' ? body.severity : 'low',
        relatedType: body.relatedType ?? null,
        relatedId: body.relatedId ?? null,
        summary: (body.summary ?? 'Protected interaction recorded.').slice(0, 300),
        actorUserId: ctx.user!.userId,
        createdAt: new Date().toISOString(),
      }]);
      return json({ recorded: Boolean(id), eventId: id ?? null });
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
  'GET /api/admin/overview':
    requireAuth(),
  'GET /api/admin/overview': [
    requireAdminEmailAllowlist(ADMIN_EMAILS),
    async () => {
      const { items: accounts } = await db.list(accountIndexTable, { limit: 500 });
      const { items: subscriptions } = await db.list(subscriptionTable, { limit: 500 });
      const counts = { listener: 0, creator: 0, admin: ADMIN_EMAILS.length };
      accounts.forEach((account) => {
        if (account.role === 'listener') counts.listener += 1;
        if (account.role === 'creator') counts.creator += 1;
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
          total: counts.listener + counts.creator + counts.admin,
          accounts: accounts.filter((account) => account.role === 'listener' || account.role === 'creator').slice(0, 100),
          administrators: ADMIN_EMAILS.map((email) => ({ email, role: 'admin', status: 'active' })),
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
