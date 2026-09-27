import { createHash, createPublicKey, randomUUID, verify as verifySignature } from 'node:crypto';
import { router, json, error, requireAuth, requireAdminEmailAllowlist, withScopes } from '@appdeploy/sdk';
import { db, storage } from '@appdeploy/sdk';

const accountTable = (userId: string) => `nightjar_account_${userId}`;
const ADMIN_EMAILS = ['mike.owen230792@gmail.com', 'megan.wright666@hotmail.com', 'nightjar.audio.app@gmail.com'];
const accountIndexTable = 'nightjar_account_index';
const subscriptionTable = 'nightjar_subscriptions';
const releaseTable = 'nightjar_releases';
const moderationHistoryTable = 'nightjar_moderation_history';
const followTable = (userId: string) => `nightjar_follows_${userId}`;
const followIndexTable = 'nightjar_follow_index';
const favouriteTable = (userId: string) => `nightjar_favourites_${userId}`;
const listeningTable = 'nightjar_listening';
const normalizeEmail = (email?: string) => email?.trim().toLowerCase() ?? '';
const isAdmin = (email?: string) => Boolean(normalizeEmail(email) && ADMIN_EMAILS.includes(normalizeEmail(email)));
const profileTable = (userId: string) => `nightjar_profile_${userId}`;
const tasteTable = (userId: string) => `nightjar_taste_${userId}`;
const readerSessionTable = (userId: string) => `nightjar_reader_sessions_${userId}`;
const securityAlertTable = 'nightjar_security_alerts';
const securityEventTable = 'nightjar_security_events';
const securityCaseTable = 'nightjar_security_cases';
const securityDeviceTable = 'nightjar_security_devices';
const ownerNotificationTable = (email: string) => `nightjar_owner_notifications_${normalizeEmail(email).replace(/[^a-z0-9]/g, '_')}`;
const userNotificationTable = (userId: string) => `nightjar_notifications_${userId}`;

type NightjarProfile = { displayName?: string|null; handle?: string|null; headline?: string|null; bio?: string|null; pronouns?: string|null; avatarInitials?: string|null; avatarTone?: string|null; favouriteTags?: string[]; favouriteTropes?: string[]; favouriteCategories?: string[]; roleFocus?: string[]; publicProfile?: boolean; onboardingComplete?: boolean; onboardingVersion?: number; createdAt?: string; updatedAt?: string; };
const cleanList = (value: unknown, max = 16) => Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean).slice(0, max) : [];
const cleanHandle = (value?: unknown) => String(value ?? '').trim().toLowerCase().replace(/^@+/, '').replace(/[^a-z0-9_\.\-]/g, '').slice(0, 30);
const scriptContentHash = (content: unknown) => createHash('sha256').update(String(content ?? ''), 'utf8').digest('hex');
const publicScriptMetadata = (script: any) => ({
  id: script.id,
  title: script.title,
  synopsis: script.synopsis ?? null,
  excerpt: script.excerpt ?? null,
  genre: script.genre ?? null,
  runtimeTarget: script.runtimeTarget ?? null,
  characters: script.characters ?? [],
  ageClassification: script.ageClassification ?? null,
  writerUserId: script.writerUserId,
  writerName: script.writerName ?? null,
  version: script.version ?? 1,
  status: script.status ?? null,
  contentHash: script.contentHash ?? null,
  updatedAt: script.updatedAt ?? null,
});
const chunkProtectedContent = (content: unknown, maxChars = 3600) => {
  const paragraphs = String(content ?? '').split(/\n{2,}/).map((value) => value.trim()).filter(Boolean);
  const pages: string[] = [];
  let page = '';
  for (const paragraph of paragraphs) {
    if (!page) {
      if (paragraph.length <= maxChars) page = paragraph;
      else {
        for (let offset = 0; offset < paragraph.length; offset += maxChars) pages.push(paragraph.slice(offset, offset + maxChars));
      }
      continue;
    }
    const candidate = page + '\n\n' + paragraph;
    if (candidate.length <= maxChars) page = candidate;
    else {
      pages.push(page);
      if (paragraph.length <= maxChars) page = paragraph;
      else {
        for (let offset = 0; offset < paragraph.length; offset += maxChars) pages.push(paragraph.slice(offset, offset + maxChars));
        page = '';
      }
    }
  }
  if (page) pages.push(page);
  return pages.length ? pages : [''];
};
const tasteSignalWeight = (type: unknown, completed = false) => {
  const signal = String(type ?? '');
  if (signal === 'not_for_me') return -12;
  if (signal === 'hide') return -10;
  if (signal === 'less_like_this') return -5;
  if (signal === 'more_like_this') return 4;
  if (signal === 'complete' || completed) return 2;
  if (signal === 'skip') return -1;
  if (signal === 'save' || signal === 'follow' || signal === 'replay') return 1;
  return 0.5;
};
const diversifyReleases = (items: any[], limit = 24, maxPerCreator = 3) => {
  const selected: any[] = [];
  const selectedIds = new Set<string>();
  const creatorCounts: Record<string, number> = {};
  for (let pass = 1; pass <= maxPerCreator && selected.length < limit; pass += 1) {
    for (const item of items) {
      if (selected.length >= limit) break;
      const id = String(item.id ?? '');
      const creatorId = String(item.creatorUserId ?? 'unknown');
      if (!id || selectedIds.has(id) || (creatorCounts[creatorId] ?? 0) >= pass) continue;
      selected.push(item);
      selectedIds.add(id);
      creatorCounts[creatorId] = (creatorCounts[creatorId] ?? 0) + 1;
    }
  }
  if (selected.length < limit) {
    for (const item of items) {
      if (selected.length >= limit) break;
      const id = String(item.id ?? '');
      if (!id || selectedIds.has(id)) continue;
      selected.push(item);
      selectedIds.add(id);
    }
  }
  return selected;
};
const getProfile = async (userId: string) => { const { items } = await db.list<NightjarProfile>(profileTable(userId), { limit: 1 }); return items[0] ?? null; };
const ensureFollowIndexForUser = async (userId: string) => {
  const { items: follows } = await db.list(followTable(userId), { limit: 2000 });
  if (!follows.length) return follows;
  const { items: indexed } = await db.list(followIndexTable, { limit: 5000 });
  const indexedTargets = new Set(indexed.filter((item) => String(item.followerUserId) === userId).map((item) => String(item.profileUserId)));
  const missing = follows
    .map((item) => ({
      profileUserId: String(item.profileUserId ?? item.creatorUserId ?? ''),
      profileRole: item.profileRole ?? (item.creatorUserId ? 'creator' : null),
      createdAt: item.createdAt ?? new Date().toISOString(),
    }))
    .filter((item) => item.profileUserId && !indexedTargets.has(item.profileUserId))
    .map((item) => ({ followerUserId: userId, ...item }));
  if (missing.length) await db.add(followIndexTable, missing);
  return follows;
};
const isSuspended = async (userId: string) => { const { items } = await db.list(accountTable(userId), { limit: 1 }); return items[0]?.status === 'suspended' || items[0]?.removed === true; };
const securityTokenHash = (prefix: string, value: unknown) => createHash('sha256').update(prefix + ':' + String(value ?? ''), 'utf8').digest('hex');
const pageForensicToken = (userId: string, scriptId: string, sessionId: string, page: number, issuedAt: unknown) =>
  securityTokenHash('nightjar-forensic', [userId, scriptId, sessionId, page, String(issuedAt ?? '')].join('|')).slice(0, 16).toUpperCase();
const normalizeDeviceToken = (value: unknown) => String(value ?? '').trim().slice(0, 160);
const normalizeEnvironmentToken = (value: unknown) => String(value ?? '').trim().toLowerCase().replace(/[^a-f0-9]/g, '').slice(0, 128);

const revokeReaderSessions = async (userId: string, reason: string) => { const { items } = await db.list(readerSessionTable(userId), { limit: 500 }); const now = new Date().toISOString(); const updates = items.filter((item) => item.status === 'active').map((item) => ({ id: item.id, record: { ...item, status: 'revoked', revokedAt: now, revokedReason: reason } })); if (updates.length) await db.update(readerSessionTable(userId), updates); };
const revokeReaderSessionsForScript = async (userId: string, scriptId: string, reason: string) => {
  const { items } = await db.list(readerSessionTable(userId), { limit: 500 });
  const now = new Date().toISOString();
  const updates = items
    .filter((item) => item.status === 'active' && String(item.scriptId) === scriptId)
    .map((item) => ({ id: item.id, record: { ...item, status: 'revoked', revokedAt: now, revokedReason: reason } }));
  if (updates.length) await db.update(readerSessionTable(userId), updates);
};
const readerSessionStillAuthorized = async (userId: string, script: any, session: any) => {
  if (String(script.writerUserId) === userId && String(session.accessGrantId) === 'owner') return true;
  const accessGrantId = String(session.accessGrantId ?? '');
  if (accessGrantId.startsWith('editor:')) {
    const { items: assignments } = await db.list('nightjar_editor_assignments', { limit: 500 });
    return assignments.some((item) => item.scriptId === script.id && item.editorUserId === userId && item.status !== 'closed');
  }
  const { items: accessItems } = await db.list('nightjar_script_access_' + userId, { limit: 100 });
  return accessItems.some((item) =>
    String(item.id) === accessGrantId &&
    item.scriptId === script.id &&
    !item.revokedAt &&
    (!item.expiresAt || new Date(String(item.expiresAt)).getTime() > Date.now())
  );
};
const createOwnerSecurityNotifications = async (alert: Record<string, unknown>) => { for (const email of ADMIN_EMAILS) await db.add(ownerNotificationTable(email), [{ type:'security_alert', alertId:alert.id??null, severity:alert.severity??'high', title:'Nightjar security alert', message:alert.reason??'Suspicious protected-content activity detected.', createdAt:new Date().toISOString(), read:false, recipientEmail:normalizeEmail(email) }]); };
const createSecurityAlert = async (userId: string, details: Record<string, unknown>) => {
  const now = new Date().toISOString();
  const recipients = ADMIN_EMAILS.map(normalizeEmail);
  const record = { userId, ...details, recipients, createdAt: now, status: 'open', automaticAccountFreeze: false };
  const [id] = await db.add(securityAlertTable, [record]);
  const alert = { id: id ?? null, ...record };
  await createOwnerSecurityNotifications(alert);
  await db.add(securityCaseTable, [{
    alertId: id ?? null,
    userId,
    state: 'detection',
    history: [{ state: 'detection', at: now, note: 'Suspicious activity detected; alert sent to all approved Nightjar administrators. No automatic account freeze was applied.' }],
    createdAt: now,
    updatedAt: now,
  }]);
  return alert;
};
const registerProtectedDevice = async (userId: string, deviceToken: unknown, relatedId?: string | null, environmentToken?: unknown) => {
  const token = normalizeDeviceToken(deviceToken);
  const environmentTokenValue = normalizeEnvironmentToken(environmentToken);
  if (!token && !environmentTokenValue) return {
    deviceHash: null as string | null,
    environmentHash: null as string | null,
    blocked: false,
    environmentBlocked: false,
    linkedSuspendedUserIds: [] as string[],
    linkedSuspendedEnvironmentUserIds: [] as string[],
  };
  const deviceHash = token ? securityTokenHash('nightjar-device', token) : null;
  const environmentHash = environmentTokenValue ? securityTokenHash('nightjar-environment', environmentTokenValue) : null;
  const now = new Date().toISOString();
  const { items: devices } = await db.list(securityDeviceTable, { limit: 5000 });
  const sameDevice = deviceHash ? devices.filter((item) => String(item.deviceHash ?? '') === deviceHash) : [];
  const sameEnvironment = environmentHash ? devices.filter((item) => String(item.environmentHash ?? '') === environmentHash) : [];
  const blocked = sameDevice.some((item) => item.blocked === true);
  const environmentBlocked = sameEnvironment.some((item) => item.environmentBlocked === true);
  const linkedUserIds = Array.from(new Set(sameDevice.map((item) => String(item.userId ?? '')).filter(Boolean)));
  const linkedEnvironmentUserIds = Array.from(new Set(sameEnvironment.map((item) => String(item.userId ?? '')).filter(Boolean)));
  const { items: accounts } = await db.list(accountIndexTable, { limit: 2000 });
  const isRestricted = (id: string) => accounts.some((account) => String(account.userId) === id && (account.status === 'suspended' || account.removed === true));
  const linkedSuspendedUserIds = linkedUserIds.filter(isRestricted);
  const linkedSuspendedEnvironmentUserIds = linkedEnvironmentUserIds.filter(isRestricted);
  const current = devices.find((item) =>
    String(item.userId) === userId &&
    ((deviceHash && String(item.deviceHash ?? '') === deviceHash) || (!deviceHash && environmentHash && String(item.environmentHash ?? '') === environmentHash))
  );
  const record = {
    deviceHash,
    environmentHash,
    userId,
    firstSeenAt: current?.firstSeenAt ?? now,
    lastSeenAt: now,
    blocked: current?.blocked === true || blocked,
    environmentBlocked: current?.environmentBlocked === true || environmentBlocked,
    relatedId: relatedId ?? current?.relatedId ?? null,
  };
  if (current?.id) await db.update(securityDeviceTable, [{ id: current.id, record: { ...current, ...record } }]);
  else await db.add(securityDeviceTable, [record]);
  return { deviceHash, environmentHash, blocked, environmentBlocked, linkedSuspendedUserIds, linkedSuspendedEnvironmentUserIds };
};

const assessProtectedActivity = async (userId: string, signal: Record<string, unknown>) => {
  const now = Date.now();
  const { items } = await db.list(securityEventTable, { limit: 500 });
  const recent = items.filter((item) => item.userId === userId && now - new Date(item.createdAt ?? 0).getTime() < 60000);
  const scriptId = String(signal.relatedId ?? '');
  const sameScriptRecent = recent.filter((item) => String(item.relatedId ?? '') === scriptId);
  const score = (recent.length >= 40 ? 35 : recent.length >= 20 ? 20 : 0)
    + (sameScriptRecent.length >= 25 ? 40 : sameScriptRecent.length >= 12 ? 25 : 0)
    + (signal.eventType === 'script_view' && sameScriptRecent.length >= 8 ? 20 : 0)
    + (signal.eventType === 'blocked_interaction' ? 8 : 0);
  if (score < 50) return null;
  const existing = await db.list(securityAlertTable, { limit: 100 });
  if (existing.items.some((item) => item.userId === userId && item.status === 'open' && now - new Date(item.createdAt ?? 0).getTime() < 600000)) return null;
  return createSecurityAlert(userId, {
    severity: score >= 75 ? 'critical' : 'high',
    riskScore: score,
    reason: `Unusually dense protected-content activity detected (${sameScriptRecent.length} related events in under a minute).`,
    relatedId: scriptId || null,
    deviceHash: signal.deviceHash ?? null,
    signal: { eventType: signal.eventType, recentEvents: recent.length, relatedEvents: sameScriptRecent.length },
  });
};
const enforceProtectedPageRate = async (userId: string, scriptId: string, sessionId: string) => {
  const now = Date.now();
  const { items } = await db.list(securityEventTable, { limit: 1000 });
  const recentPages = items.filter((item) =>
    item.userId === userId &&
    item.eventType === 'script_page_view' &&
    now - new Date(String(item.createdAt ?? 0)).getTime() < 60_000
  );
  const sameScript = recentPages.filter((item) => String(item.relatedId ?? '') === scriptId);
  const sameSession = sameScript.filter((item) => String(item.sessionId ?? '') === sessionId);
  if (sameSession.length < 18 && sameScript.length < 24) return true;
  await revokeReaderSessionsForScript(userId, scriptId, 'Protected reader rate limit exceeded.');
  await createSecurityAlert(userId, {
    severity: 'high',
    riskScore: 85,
    reason: 'Protected manuscript paging exceeded the human-reading threshold and the active session was revoked.',
    relatedId: scriptId,
    deviceHash: sameSession[sameSession.length - 1]?.deviceHash ?? sameScript[sameScript.length - 1]?.deviceHash ?? null,
    signal: { eventType: 'script_page_rate_limit', recentPages: recentPages.length, scriptPages: sameScript.length, sessionPages: sameSession.length },
  });
  return false;
};

const createUserNotificationOnce = async (userId: string, notification: Record<string, unknown>) => {
  const table = userNotificationTable(userId);
  const { items } = await db.list(table, { limit: 100 });
  const key = String(notification.dedupeKey ?? '');
  if (key && items.some((item) => String(item.dedupeKey ?? '') === key)) return;
  await db.add(table, [{ ...notification, userId, read: false, createdAt: notification.createdAt ?? new Date().toISOString() }]);
};

const decodeDataUrl = (value: string) => {
  const match = /^data:([^;]+);base64,(.+)$/s.exec(value);
  if (!match) return null;
  const [, contentType, base64] = match;
  try {
    return { contentType, base64, bytes: Buffer.byteLength(base64, 'base64') };
  } catch {
    return null;
  }
};

const assetSignatureMatches = (base64: string, contentType: string) => {
  try {
    const bytes = Buffer.from(base64, 'base64');
    const ascii = (start: number, end: number) => bytes.subarray(start, end).toString('ascii');
    if (contentType === 'image/png') return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]));
    if (contentType === 'image/jpeg') return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    if (contentType === 'image/webp') return bytes.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP';
    if (contentType === 'audio/wav' || contentType === 'audio/x-wav') return bytes.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WAVE';
    if (contentType === 'audio/ogg') return bytes.length >= 4 && ascii(0, 4) === 'OggS';
    if (contentType === 'audio/webm') return bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
    if (contentType === 'audio/mp4' || contentType === 'audio/x-m4a') return bytes.length >= 12 && ascii(4, 8) === 'ftyp';
    if (contentType === 'audio/mpeg' || contentType === 'audio/mp3') return bytes.length >= 3 && (ascii(0, 3) === 'ID3' || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0));
    return false;
  } catch {
    return false;
  }
};

const safeOriginalFileName = (value: unknown) => String(value ?? '')
  .split(/[\\/]/)
  .pop()!
  .replace(/[^a-zA-Z0-9._ -]/g, '_')
  .slice(0, 120);

const extensionForContentType = (contentType: string, kind: 'audio' | 'artwork') => {
  const map: Record<string, string> = {
    'audio/mpeg': 'mp3',
    'audio/mp3': 'mp3',
    'audio/wav': 'wav',
    'audio/x-wav': 'wav',
    'audio/mp4': 'm4a',
    'audio/x-m4a': 'm4a',
    'audio/ogg': 'ogg',
    'audio/webm': 'webm',
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
  };
  return map[contentType] ?? (kind === 'audio' ? 'bin' : 'img');
};

const brandingTable = 'nightjar_branding';
const ageTable = (userId: string) => `nightjar_age_${userId}`;
const AGE_THRESHOLD = 18;

type AgeRecord = {
  verified: boolean;
  ageThreshold: number;
  provider: string;
  verifiedAt?: string;
  verificationReference?: string;
  verificationMethod?: string;
  sessionId?: string;
  sessionExpiresAt?: string | null;
  status?: string;
  testMode?: boolean;
  reverifyRequired?: boolean;
};

const appUrl = process.env.NIGHTJAR_APP_URL || 'https://nightjar-42eeag.v2.appdeploy.ai/';
const ageEnvironment = () => process.env.NIGHTJAR_AGE_ENV === 'production' ? 'production' : 'sandbox';
const yotiCredential = () => ageEnvironment() === 'production' ? process.env.YOTI_API_KEY : process.env.YOTI_ACCESS_TOKEN;
const yotiConfigured = () => Boolean(process.env.YOTI_SDK_ID && yotiCredential());
const yotiApiBase = () => ageEnvironment() === 'production' ? 'https://age.yoti.com/api/v1' : 'https://age.yoti.com/sandbox/api/v1';
const yotiProviderName = () => ageEnvironment() === 'production' ? 'yoti' : 'yoti-sandbox';

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

async function isAgeVerified(userId: string) {
  if (await isSuspended(userId)) return false;
  const record = await getAgeRecord(userId);
  return record?.verified === true && record.ageThreshold === AGE_THRESHOLD && record.reverifyRequired !== true;
}

const opaqueVerificationReference = () => `nj-${randomUUID()}`;

async function refreshYotiResult(userId: string, record: AgeRecord) {
  if (!record.sessionId || !yotiConfigured()) return record;
  const credential = yotiCredential();
  if (!credential) return record;
  const response = await fetch(`${yotiApiBase()}/sessions/${record.sessionId}/result`, {
    headers: {
      Authorization: `Bearer ${credential}`,
      'Content-Type': 'application/json',
      'Yoti-Sdk-Id': process.env.YOTI_SDK_ID!,
    },
  });
  if (!response.ok) throw new Error(`Yoti age result request failed (${response.status}).`);
  const result = await response.json() as { status?: string; age?: number; method?: string };
  if (result.status === 'COMPLETE' && typeof result.age === 'number' && result.age >= AGE_THRESHOLD) {
    const verifiedRecord: AgeRecord = {
      ...record,
      verified: true,
      ageThreshold: AGE_THRESHOLD,
      provider: yotiProviderName(),
      verifiedAt: record.verifiedAt ?? new Date().toISOString(),
      verificationMethod: result.method ?? record.verificationMethod,
      status: 'COMPLETE',
      sessionId: record.sessionId,
      sessionExpiresAt: record.sessionExpiresAt ?? null,
      reverifyRequired: false,
    };
    await saveAgeRecord(userId, verifiedRecord);
    return verifiedRecord;
  }
  if (['FAIL', 'ERROR', 'CANCELLED'].includes(result.status ?? '')) {
    const failedRecord: AgeRecord = { ...record, verified: false, status: result.status, reverifyRequired: false };
    await saveAgeRecord(userId, failedRecord);
    return failedRecord;
  }
  return { ...record, status: result.status ?? 'PENDING' };
}

type Role = 'admin' | 'creator' | 'listener' | 'writer' | 'editor';

type AccountRecord = {
  role: Role;
  status: 'active' | 'pending_review' | 'suspended';
  createdAt: string;
  removed?: boolean;
  securityPreviousStatus?: 'active' | 'pending_review';
  suspendedAt?: string | null;
  suspendedBy?: string | null;
  removedAt?: string | null;
  removedBy?: string | null;
};

const getAccountRecord = async (userId: string) => {
  const { items } = await db.list<AccountRecord>(accountTable(userId), { limit: 1 });
  return items[0] ?? null;
};

const requireRole = async (userId: string, roles: Role[]) => {
  const account = await getAccountRecord(userId);
  return Boolean(account && account.status !== 'suspended' && account.removed !== true && roles.includes(account.role));
};


const getLondonDateContext = (date: Date) => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  const local = {
    weekday: value('weekday'),
    year: Number(value('year')),
    month: Number(value('month')),
    day: Number(value('day')),
  };
  const weekdayIndex = ({ Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 } as Record<string, number>)[local.weekday] ?? 0;
  const localDate = new Date(Date.UTC(local.year, local.month - 1, local.day));
  const daysSinceEpoch = Math.floor(localDate.getTime() / 86400000);
  return {
    ...local,
    weekdayIndex,
    localDate,
    daysSinceEpoch,
    spotlightDate: local.year + '-' + String(local.month).padStart(2, '0') + '-' + String(local.day).padStart(2, '0'),
  };
};

async function buildDailySpotlightState(now = new Date()) {
  const local = getLondonDateContext(now);

  const { items: accounts } = await db.list(accountIndexTable, { limit: 1000 });
  const eligibleAccounts = accounts.filter((account) => account.status !== 'suspended' && ['creator', 'writer', 'listener'].includes(account.role));
  const sortAccounts = (items: any[]) => items.slice().sort((a, b) => {
    const created = String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? ''));
    return created || String(a.userId ?? '').localeCompare(String(b.userId ?? ''));
  });
  const creators = sortAccounts(eligibleAccounts.filter((account) => account.role === 'creator'));
  const writers = sortAccounts(eligibleAccounts.filter((account) => account.role === 'writer'));

  const { items: releases } = await db.list(releaseTable, { limit: 500 });
  const { items: scripts } = await db.list('nightjar_scripts', { limit: 500 });

  const toProfileSpotlight = async (account: any, kind: 'creator' | 'writer') => {
    if (!account) return null;
    const profile = await getProfile(String(account.userId));
    const isPublic = profile?.publicProfile !== false;
    const publicName = profile?.displayName ?? account.name ?? (kind === 'creator' ? 'Nightjar creator' : 'Nightjar writer');
    const name = isPublic ? publicName : (kind === 'creator' ? 'A Nightjar creator' : 'A Nightjar writer');
    const initials = isPublic ? (profile?.avatarInitials ?? String(publicName).split(/\\s+/).map((part: string) => part[0]).join('').slice(0, 2).toUpperCase()) : 'NJ';
    let title = kind === 'creator' ? 'Creator profile' : 'Writer profile';
    let edition = kind === 'creator' ? 'Creator Spotlight' : 'Writer Spotlight';
    let detail = profile?.headline ?? profile?.bio ?? (kind === 'creator' ? 'A Nightjar creator in today’s full-day spotlight.' : 'A Nightjar writer in today’s full-day spotlight.');
    let releaseId: string | null = null;
    if (isPublic && kind === 'creator') {
      const latest = releases
        .filter((release) => release.creatorUserId === account.userId && release.status === 'released')
        .sort((a, b) => String(b.publishedAt ?? b.createdAt ?? '').localeCompare(String(a.publishedAt ?? a.createdAt ?? '')))[0];
      if (latest) {
        title = String(latest.title ?? title);
        edition = 'Latest release';
        detail = String(latest.description ?? detail);
        releaseId = String(latest.id);
      }
    } else if (isPublic && kind === 'writer') {
      const latest = scripts
        .filter((script) => script.writerUserId === account.userId)
        .sort((a, b) => String(b.updatedAt ?? b.createdAt ?? '').localeCompare(String(a.updatedAt ?? a.createdAt ?? '')))[0];
      if (latest) {
        title = String(latest.title ?? title);
        edition = 'Latest manuscript';
        detail = String(latest.synopsis ?? latest.excerpt ?? detail);
      }
    }
    return {
      kind,
      name: String(name),
      handle: isPublic ? (profile?.handle ?? account.handle ?? null) : null,
      title,
      edition,
      detail: String(detail).slice(0, 320),
      initials,
      targetId: String(account.userId),
      releaseId,
      publicProfile: isPublic,
      date: local.spotlightDate,
    };
  };

  // Creator + Writer: every active member gets a deterministic full-day slot.
  // The absolute calendar day is the clock; weekdays never cap the roster at seven.
  const creatorIndex = creators.length ? ((local.daysSinceEpoch % creators.length) + creators.length) % creators.length : -1;
  const writerIndex = writers.length ? ((local.daysSinceEpoch % writers.length) + writers.length) % writers.length : -1;
  const creator = creatorIndex >= 0 ? await toProfileSpotlight(creators[creatorIndex], 'creator') : null;
  const writer = writerIndex >= 0 ? await toProfileSpotlight(writers[writerIndex], 'writer') : null;

  // Listener Spotlight: freeze the top seven from the previous completed Monday-Sunday period.
  const weekStart = new Date(local.localDate);
  weekStart.setUTCDate(weekStart.getUTCDate() - local.weekdayIndex);
  const previousWeekStart = new Date(weekStart);
  previousWeekStart.setUTCDate(previousWeekStart.getUTCDate() - 7);
  const previousWeekEnd = new Date(weekStart);

  const { items: listeningEvents } = await db.list(listeningTable, { limit: 10000 });
  const weeklyEvents = listeningEvents.filter((event) => {
    const at = new Date(String(event.createdAt ?? '')).getTime();
    return Number.isFinite(at) && at >= previousWeekStart.getTime() && at < previousWeekEnd.getTime();
  });

  const listenerAccounts = new Map(
    eligibleAccounts.filter((account) => account.role === 'listener').map((account) => [String(account.userId), account])
  );
  const scores = new Map<string, number>();
  for (const userId of listenerAccounts.keys()) {
    const userEvents = weeklyEvents.filter((event) => String(event.userId ?? '') === userId);
    const seconds = verifiedListeningSeconds(userEvents);
    if (seconds > 0) scores.set(userId, seconds);
  }

  const rankedListeners = [...scores.entries()]
    .map(([userId, seconds]) => ({ account: listenerAccounts.get(userId)!, seconds }))
    .filter((item) => item.account)
    .sort((a, b) => b.seconds - a.seconds || String(a.account.userId).localeCompare(String(b.account.userId)));

  const topSeven = rankedListeners.slice(0, 7);
  const listenerRankIndex = topSeven.length ? local.weekdayIndex % topSeven.length : -1;
  let listener: any = null;
  if (listenerRankIndex >= 0) {
    const selected = topSeven[listenerRankIndex];
    const profile = await getProfile(String(selected.account.userId));
    const isPublic = profile?.publicProfile !== false;
    const displayName = profile?.displayName ?? selected.account.name ?? 'Nightjar listener';
    const name = isPublic ? String(displayName) : 'A Nightjar listener';
    const initials = isPublic
      ? (profile?.avatarInitials ?? String(displayName).split(/\\s+/).map((part: string) => part[0]).join('').slice(0, 2).toUpperCase())
      : 'NJ';
    listener = {
      kind: 'listener',
      name,
      handle: isPublic ? (profile?.handle ?? selected.account.handle ?? null) : null,
      title: 'Community listener',
      edition: 'WEEKLY TOP 7 · #' + String(listenerRankIndex + 1),
      detail: 'Recognised for the most tracked listening activity in the previous completed week.',
      initials,
      targetId: String(selected.account.userId),
      releaseId: null,
      publicProfile: isPublic,
      date: local.spotlightDate,
      listenerRank: listenerRankIndex + 1,
      weeklyTrackedMinutes: Math.round(selected.seconds / 60),
      weeklyTopSevenCount: topSeven.length,
    };
  }

  return {
    date: local.spotlightDate,
    weekdayIndex: local.weekdayIndex,
    listenerWeek: previousWeekStart.toISOString().slice(0, 10),
    spotlights: [creator, writer, listener].filter(Boolean),
    listenerTopSevenCount: topSeven.length,
    listenerSpotlightDay: listener ? listenerRankIndex + 1 : null,
    rotation: {
      creator: 'all active public Creators, one full day each, deterministic full-roster rotation',
      writer: 'all active public Writers, one full day each, deterministic full-roster rotation',
      listener: 'previous completed week top seven Listeners, one full day each, then refreshed next week',
    },
  };
}

const buildSpotlightNotification = (item: any, spotlightDate: string, createdAt: string) => {
  const targetId = String(item.targetId ?? '');
  const kind = String(item.kind);
  const dedupeKey = 'spotlight:' + spotlightDate + ':' + kind + ':' + targetId;
  return {
    type: 'spotlight',
    subtype: kind,
    dedupeKey,
    spotlightDate,
    targetUserId: targetId,
    title: kind === 'creator' ? 'You are today’s Creator Spotlight' : kind === 'writer' ? 'You are today’s Writer Spotlight' : 'Thank you — you’re today’s Listener Spotlight',
    message: kind === 'creator'
      ? 'Your Nightjar creator profile is featured for the full day. Your latest release is highlighted so listeners can discover your work naturally.'
      : kind === 'writer'
        ? 'Your Nightjar writer profile is featured for the full day. Your work is highlighted so the community can discover what you create.'
        : 'Thank you for being part of the Nightjar listening community. You are being recognised today from the previous week’s Top 7 listeners.',
    read: false,
    createdAt,
    promotionEnabled: kind === 'creator' || kind === 'writer',
    listenerRank: kind === 'listener' ? item.listenerRank ?? null : null,
  };
};

const materializeSpotlightNotifications = async (state: any, createdAt = new Date().toISOString()) => {
  let created = 0;
  for (const item of state.spotlights ?? []) {
    const targetId = String(item.targetId ?? '');
    if (!targetId) continue;
    const before = await db.list(userNotificationTable(targetId), { limit: 100 });
    const key = String(buildSpotlightNotification(item, state.date, createdAt).dedupeKey);
    if (!before.items.some((notification) => String(notification.dedupeKey ?? '') === key)) created += 1;
    await createUserNotificationOnce(targetId, buildSpotlightNotification(item, state.date, createdAt));
  }
  return { created, attempted: Number(state.spotlights?.length ?? 0) };
};

const githubOidcKeysUrl = 'https://token.actions.githubusercontent.com/.well-known/jwks';
const githubOidcIssuer = 'https://token.actions.githubusercontent.com';
const githubOidcAudience = 'nightjar';
const githubOidcRepository = 'Mort2307/NightJar-Audio';
let githubOidcKeysCache: { fetchedAt: number; keys: Record<string, any> } | null = null;

const base64UrlDecode = (value: string) => Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4), 'base64');
const readGithubOidcToken = (body: unknown) => {
  if (!body || typeof body !== 'object') return '';
  const token = (body as Record<string, unknown>).token;
  return typeof token === 'string' ? token : '';
};

const verifyGithubActionsOidc = async (token: string) => {
  const [headerPart, payloadPart, signaturePart] = token.split('.');
  if (!headerPart || !payloadPart || !signaturePart) return false;

  let header: any;
  let payload: any;
  try {
    header = JSON.parse(base64UrlDecode(headerPart).toString('utf8'));
    payload = JSON.parse(base64UrlDecode(payloadPart).toString('utf8'));
  } catch {
    return false;
  }

  if (header.alg !== 'RS256' || !header.kid) return false;
  if (payload.iss !== githubOidcIssuer || payload.aud !== githubOidcAudience) return false;
  if (payload.repository !== githubOidcRepository || payload.ref !== 'refs/heads/main') return false;
  if (!['schedule', 'workflow_dispatch'].includes(String(payload.event_name))) return false;
  const exp = Number(payload.exp ?? 0);
  const nbf = Number(payload.nbf ?? 0);
  const now = Math.floor(Date.now() / 1000);
  if (!exp || exp <= now || (nbf && nbf > now + 60)) return false;

  if (!githubOidcKeysCache || Date.now() - githubOidcKeysCache.fetchedAt > 60 * 60_000) {
    const response = await fetch(githubOidcKeysUrl);
    if (!response.ok) return false;
    const body = await response.json() as { keys?: Array<Record<string, unknown>> };
    const keys: Record<string, any> = {};
    for (const key of body.keys ?? []) {
      if (typeof key.kid === 'string') keys[key.kid] = key;
    }
    githubOidcKeysCache = { fetchedAt: Date.now(), keys };
  }

  const jwk = githubOidcKeysCache.keys[String(header.kid)];
  if (!jwk) return false;

  try {
    const publicKey = createPublicKey({ key: jwk, format: 'jwk' });
    return verifySignature(
      'RSA-SHA256',
      Buffer.from(headerPart + '.' + payloadPart),
      publicKey,
      base64UrlDecode(signaturePart),
    );
  } catch {
    return false;
  }
};

const verifiedListeningSeconds = (events: any[]) => {
  const sessions = new Map<string, any[]>();
  for (const event of events) {
    const key = String(event.sessionId || [event.userId, event.releaseId, String(event.createdAt || '').slice(0, 13)].join(':'));
    sessions.set(key, [...(sessions.get(key) ?? []), event]);
  }
  let total = 0;
  for (const session of sessions.values()) {
    session.sort((a, b) => String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? '')));
    let previous: number | null = null;
    for (const event of session) {
      const position = Math.max(0, Number(event.positionSeconds ?? 0));
      if (event.eventType === 'start' || event.eventType === 'seek') {
        previous = position;
        continue;
      }
      if (event.eventType !== 'progress' && event.eventType !== 'complete') continue;
      if (previous !== null) {
        const delta = position - previous;
        if (delta > 0 && delta <= 45) total += delta;
      }
      previous = position;
    }
  }
  return total;
};

export const handler = router({
  'GET /api/_healthcheck': [async () => json({ message: 'Success' })],
  'GET /api/catalogue': [
    requireAuth(),
    async (ctx) => {
      if (!(await isAgeVerified(ctx.user!.userId))) return error('Age verification required before accessing the adult catalogue.', 403);
      const query = String(ctx.query.q ?? '').trim().toLowerCase();
      const category = String(ctx.query.category ?? '').trim().toLowerCase();
      const { items } = await db.list(releaseTable, { limit: 500 });
      const released = items.filter((release) => release.status === 'released');
      const categories = Array.from(new Set(released.map((release) => String(release.category ?? '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
      const catalogue = await Promise.all(released.filter((release) => {
        if (category && String(release.category ?? '').toLowerCase() !== category) return false;
        if (!query) return true;
        return [release.title, release.description, release.category, release.genre, release.mood, ...(Array.isArray(release.tags) ? release.tags : []), ...(Array.isArray(release.tropes) ? release.tropes : [])].join(' ').toLowerCase().includes(query);
      }).map(async (release) => {
        const profile = release.creatorUserId ? await getProfile(String(release.creatorUserId)) : null;
        return { ...release, creatorName: profile?.displayName ?? release.creatorName ?? 'Nightjar creator', creatorHandle: profile?.handle ?? release.creatorHandle ?? null };
      }));
      return json({ catalogue, categories });
    },
  ],
  'GET /api/creators': [
    requireAuth(),
    async (ctx) => {
      if (!(await isAgeVerified(ctx.user!.userId))) return error('Age verification required before discovering creators.', 403);
      const { items: accounts } = await db.list(accountIndexTable, { limit: 1000 });
      const { items: releases } = await db.list(releaseTable, { limit: 500 });
      const { items: followIndex } = await db.list(followIndexTable, { limit: 5000 });
      const followerCounts = followIndex.reduce<Record<string, number>>((counts, follow) => {
        const key = String(follow.profileUserId ?? '');
        if (key) counts[key] = (counts[key] ?? 0) + 1;
        return counts;
      }, {});
      const creators = await Promise.all(accounts.filter((account) => account.role === 'creator' && account.status !== 'suspended').map(async (account) => {
        const profile = await getProfile(account.userId);
        if (!profile?.publicProfile) return null;
        return { userId: account.userId, displayName: profile.displayName ?? account.name ?? 'Nightjar creator', handle: profile.handle ?? account.handle ?? null, headline: profile.headline ?? null, bio: profile.bio ?? null, avatarInitials: profile.avatarInitials ?? null, avatarTone: profile.avatarTone ?? 'plum', followerCount: followerCounts[String(account.userId)] ?? 0, releaseCount: releases.filter((release) => release.creatorUserId === account.userId && release.status === 'released').length };
      }));
      return json({ creators: creators.filter(Boolean) });
    },
  ],
  'GET /api/spotlights': [
    requireAuth(),
    async (ctx) => {
      if (!(await isAgeVerified(ctx.user!.userId))) return error('Age verification required before viewing community spotlights.', 403);
      const state = await buildDailySpotlightState();
      await materializeSpotlightNotifications(state);
      return json(state);
    },
  ],
  'POST /api/internal/cron/spotlights': [
    async (ctx) => {
      const token = readGithubOidcToken(ctx.body);
      if (!token || !(await verifyGithubActionsOidc(token))) return error('Unauthorized scheduled spotlight job.', 401);
      const state = await buildDailySpotlightState();
      const result = await materializeSpotlightNotifications(state);
      return json({ ok: true, date: state.date, attempted: result.attempted, created: result.created });
    },
  ],
  'GET /api/creators/:creatorUserId': [
    requireAuth(),
    async (ctx) => {
      if (!(await isAgeVerified(ctx.user!.userId))) return error('Age verification required before viewing creator profiles.', 403);
      const creatorUserId = String(ctx.params.creatorUserId ?? '');
      const { items: accounts } = await db.list(accountIndexTable, { limit: 1000 });
      const account = accounts.find((item) => String(item.userId) === creatorUserId && item.role === 'creator' && item.status !== 'suspended');
      const profile = account ? await getProfile(creatorUserId) : null;
      if (!account || !profile?.publicProfile) return error('Creator profile not found.', 404);
      const { items: releases } = await db.list(releaseTable, { limit: 500 });
      const publicReleases = releases
        .filter((release) => release.creatorUserId === creatorUserId && release.status === 'released')
        .map((release) => ({
          id: release.id,
          title: release.title,
          description: release.description,
          category: release.category,
          genre: release.genre,
          mood: release.mood,
          tags: release.tags ?? [],
          tropes: release.tropes ?? [],
          durationMinutes: release.durationMinutes ?? 0,
          audioUrl: release.audioUrl ?? null,
          artworkUrl: release.artworkUrl ?? null,
          releaseDate: release.releaseDate ?? release.createdAt ?? null,
        }));
      const { items: follows } = await db.list(followTable(ctx.user!.userId), { limit: 500 });
      const { items: followIndex } = await db.list(followIndexTable, { limit: 5000 });
      const followers = followIndex.filter((follow) => String(follow.profileUserId ?? '') === creatorUserId).length;
      return json({ creator: { userId: creatorUserId, name: profile.displayName ?? account.name ?? 'Nightjar creator', handle: profile.handle ?? account.handle ?? null, headline: profile.headline ?? null, bio: profile.bio ?? null, pronouns: profile.pronouns ?? null, initials: profile.avatarInitials ?? null, favouriteTags: profile.favouriteTags ?? [], followers, following: follows.some((follow) => String(follow.profileUserId ?? follow.creatorUserId) === creatorUserId), releases: publicReleases } });
    },
  ],
  'GET /api/recommendations': [
    requireAuth(),
    async (ctx) => {
      if (!(await isAgeVerified(ctx.user!.userId))) return error('Age verification required before accessing adult recommendations.', 403);
      const profile = await getProfile(ctx.user!.userId);
      const { items: events } = await db.list(tasteTable(ctx.user!.userId), { limit: 500 });
      const { items: follows } = await db.list(followTable(ctx.user!.userId), { limit: 500 });
      const followed = new Set(follows.map((item) => String(item.profileUserId ?? item.creatorUserId)).filter(Boolean));
      const weights: Record<string, number> = {};
      for (const value of [...(profile?.favouriteTags ?? []), ...(profile?.favouriteTropes ?? []), ...(profile?.favouriteCategories ?? [])]) {
        const key = String(value).toLowerCase();
        weights[key] = (weights[key] ?? 0) + 5;
      }
      for (const event of events) {
        const factor = tasteSignalWeight(event.type, event.completed === true);
        for (const value of [...(Array.isArray(event.tags) ? event.tags : []), ...(event.category ? [event.category] : [])]) {
          const key = String(value).toLowerCase();
          weights[key] = (weights[key] ?? 0) + factor;
        }
      }
      const intent = String(ctx.query.intent ?? '').trim().toLowerCase();
      const { items: releases } = await db.list(releaseTable, { limit: 500 });
      const ranked = releases.filter((release) => release.status === 'released').map((release) => {
        const values = [release.category, release.genre, release.mood, ...(release.tags ?? []), ...(release.tropes ?? [])].filter(Boolean).map(String);
        let score = 0;
        values.forEach((value) => { score += weights[value.toLowerCase()] ?? 0; });
        if (followed.has(String(release.creatorUserId))) score += 8;
        if (intent && values.some((value) => value.toLowerCase().includes(intent))) score += 4;
        const matched = values.filter((value) => (weights[value.toLowerCase()] ?? 0) > 0).slice(0, 3);
        return { ...release, score, reason: matched.length ? 'Because you have expressed interest in ' + matched.join(', ') + '.' : followed.has(String(release.creatorUserId)) ? 'From a creator you follow.' : 'A new release matching your current discovery context.' };
      }).sort((a,b) => b.score-a.score);
      const recommendations = diversifyReleases(ranked, 24, 3);
      return json({ recommendations, diversity: { maxInitialReleasesPerCreator: 3 } });
    },
  ],
  'GET /api/listening/resume/:releaseId': [
    requireAuth(),
    async (ctx) => {
      if (!(await isAgeVerified(ctx.user!.userId))) return error('Age verification required before retrieving listening progress.', 403);
      const releaseId = String(ctx.params.releaseId ?? '');
      const { items } = await db.list(listeningTable, { limit: 1000 });
      const relevant = items
        .filter((event) => String(event.userId) === ctx.user!.userId && String(event.releaseId) === releaseId)
        .sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')));
      const latest = relevant[0];
      const duration = relevant.find((event) => typeof event.durationSeconds !== 'undefined')?.durationSeconds;
      const position = latest?.eventType === 'complete' ? 0 : relevant.find((event) => typeof event.positionSeconds !== 'undefined')?.positionSeconds;
      return json({ releaseId, positionSeconds: Math.max(0, Number(position ?? 0)), durationSeconds: Math.max(0, Number(duration ?? 0)) });
    },
  ],
  'GET /api/trending': [
    requireAuth(),
    async (ctx) => {
      if (!(await isAgeVerified(ctx.user!.userId))) return error('Age verification required before accessing adult trending content.', 403);
      const { items: releases } = await db.list(releaseTable, { limit: 500 });
      const { items: events } = await db.list(listeningTable, { limit: 5000 });
      const counts: Record<string, number> = {};
      for (const event of events) counts[String(event.releaseId)] = (counts[String(event.releaseId)] ?? 0) + 1;
      return json({ trending: releases.filter((release) => release.status === 'released').map((release) => ({ ...release, listeningEvents: counts[String(release.id)] ?? 0 })).sort((a,b) => b.listeningEvents-a.listeningEvents).slice(0,24) });
    },
  ],
  'GET /api/profiles': [requireAuth(), async (ctx) => {
    if (!(await isAgeVerified(ctx.user!.userId))) return error('Age verification required before discovering profiles.', 403);
    const { items: accounts } = await db.list(accountIndexTable, { limit: 2000 });
    const follows = await ensureFollowIndexForUser(ctx.user!.userId);
    const { items: followIndex } = await db.list(followIndexTable, { limit: 5000 });
    const followed = new Set(follows.map((item) => String(item.profileUserId ?? item.creatorUserId)).filter(Boolean));
    const followerCounts = followIndex.reduce<Record<string, number>>((counts, follow) => {
      const key = String(follow.profileUserId ?? '');
      if (key) counts[key] = (counts[key] ?? 0) + 1;
      return counts;
    }, {});
    const profiles = (await Promise.all(accounts
      .filter((account) => String(account.userId) !== ctx.user!.userId && account.status !== 'suspended')
      .map(async (account) => {
        const profile = await getProfile(String(account.userId));
        if (!profile?.publicProfile) return null;
        return {
          userId: String(account.userId),
          role: account.role,
          name: profile.displayName ?? account.name ?? 'Nightjar member',
          handle: profile.handle ?? account.handle ?? null,
          headline: profile.headline ?? null,
          bio: profile.bio ?? null,
          pronouns: profile.pronouns ?? null,
          initials: profile.avatarInitials ?? null,
          roleFocus: profile.roleFocus ?? [],
          followers: followerCounts[String(account.userId)] ?? 0,
          following: followed.has(String(account.userId)),
        };
      }))).filter(Boolean);
    return json({ profiles });
  }],
  'GET /api/favourites': [requireAuth(), async (ctx) => { const { items } = await db.list(favouriteTable(ctx.user!.userId), { limit: 500 }); return json({ favourites: items }); }],
  'POST /api/favourites/:releaseId': [requireAuth(), async (ctx) => { const { items } = await db.list(favouriteTable(ctx.user!.userId), { limit: 500 }); if (!items.some((item) => item.releaseId === ctx.params.releaseId)) await db.add(favouriteTable(ctx.user!.userId), [{ releaseId: ctx.params.releaseId, createdAt: new Date().toISOString() }]); return json({ favourite: true }); }],
  'DELETE /api/favourites/:releaseId': [requireAuth(), async (ctx) => { const { items } = await db.list(favouriteTable(ctx.user!.userId), { limit: 500 }); const ids = items.filter((item) => item.releaseId === ctx.params.releaseId).map((item) => item.id); if (ids.length) await db.delete(favouriteTable(ctx.user!.userId), ids); return json({ favourite: false }); }],
  'GET /api/follows': [requireAuth(), async (ctx) => { const follows = await ensureFollowIndexForUser(ctx.user!.userId); return json({ follows }); }],
  'GET /api/following': [requireAuth(), async (ctx) => {
    if (!(await isAgeVerified(ctx.user!.userId))) return error('Age verification required before viewing community follows.', 403);
    const follows = await ensureFollowIndexForUser(ctx.user!.userId);
    const targetIds = Array.from(new Set(follows.map((item) => String(item.profileUserId ?? item.creatorUserId ?? '')).filter(Boolean)));
    const { items: accounts } = await db.list(accountIndexTable, { limit: 2000 });
    const profiles = await Promise.all(targetIds.map(async (userId) => {
      const account = accounts.find((item) => String(item.userId) === userId);
      if (!account || account.status === 'suspended') return { userId, role: account?.role ?? null, name: 'Unavailable Nightjar profile', handle: null, headline: null, publicProfile: false };
      const profile = await getProfile(userId);
      if (!profile || profile.publicProfile === false) return { userId, role: account.role, name: 'Private Nightjar profile', handle: null, headline: null, publicProfile: false };
      return { userId, role: account.role, name: profile.displayName ?? account.name ?? 'Nightjar member', handle: profile.handle ?? account.handle ?? null, headline: profile.headline ?? null, publicProfile: true };
    }));
    return json({ profiles });
  }],
  'POST /api/follows/:profileUserId': [requireAuth(), async (ctx) => {
    const profileUserId = String(ctx.params.profileUserId ?? '');
    if (!profileUserId || profileUserId === ctx.user!.userId) return error('Choose another Nightjar profile to follow.', 400);
    const { items: accounts } = await db.list(accountIndexTable, { limit: 2000 });
    const target = accounts.find((item) => String(item.userId) === profileUserId);
    if (!target || target.status === 'suspended') return error('Profile not found.', 404);
    const profile = await getProfile(profileUserId);
    if (!profile?.publicProfile) return error('Profile not found.', 404);
    const { items } = await db.list(followTable(ctx.user!.userId), { limit: 2000 });
    const createdAt = new Date().toISOString();
    if (!items.some((item) => String(item.profileUserId ?? item.creatorUserId) === profileUserId)) {
      await db.add(followTable(ctx.user!.userId), [{ profileUserId, profileRole: target.role, createdAt }]);
    }
    const { items: indexed } = await db.list(followIndexTable, { limit: 5000 });
    if (!indexed.some((item) => String(item.followerUserId) === ctx.user!.userId && String(item.profileUserId) === profileUserId)) {
      await db.add(followIndexTable, [{ followerUserId: ctx.user!.userId, profileUserId, profileRole: target.role, createdAt }]);
    }
    return json({ following: true, profileUserId });
  }],
  'DELETE /api/follows/:profileUserId': [requireAuth(), async (ctx) => {
    const profileUserId = String(ctx.params.profileUserId ?? '');
    const { items } = await db.list(followTable(ctx.user!.userId), { limit: 2000 });
    const ids = items.filter((item) => String(item.profileUserId ?? item.creatorUserId) === profileUserId).map((item) => item.id);
    if (ids.length) await db.delete(followTable(ctx.user!.userId), ids);
    const { items: indexed } = await db.list(followIndexTable, { limit: 5000 });
    const indexedIds = indexed.filter((item) => String(item.followerUserId) === ctx.user!.userId && String(item.profileUserId) === profileUserId).map((item) => item.id);
    if (indexedIds.length) await db.delete(followIndexTable, indexedIds);
    return json({ following: false, profileUserId });
  }],
  'POST /api/follows/creators/:creatorUserId': [requireAuth(), async (ctx) => {
    const profileUserId = String(ctx.params.creatorUserId ?? '');
    const { items } = await db.list(followTable(ctx.user!.userId), { limit: 2000 });
    const createdAt = new Date().toISOString();
    if (!items.some((item) => String(item.profileUserId ?? item.creatorUserId) === profileUserId)) await db.add(followTable(ctx.user!.userId), [{ profileUserId, creatorUserId: profileUserId, profileRole: 'creator', createdAt }]);
    const { items: indexed } = await db.list(followIndexTable, { limit: 5000 });
    if (!indexed.some((item) => String(item.followerUserId) === ctx.user!.userId && String(item.profileUserId) === profileUserId)) await db.add(followIndexTable, [{ followerUserId: ctx.user!.userId, profileUserId, profileRole: 'creator', createdAt }]);
    return json({ following: true, profileUserId });
  }],
  'DELETE /api/follows/creators/:creatorUserId': [requireAuth(), async (ctx) => {
    const profileUserId = String(ctx.params.creatorUserId ?? '');
    const { items } = await db.list(followTable(ctx.user!.userId), { limit: 2000 });
    const ids = items.filter((item) => String(item.profileUserId ?? item.creatorUserId) === profileUserId).map((item) => item.id);
    if (ids.length) await db.delete(followTable(ctx.user!.userId), ids);
    const { items: indexed } = await db.list(followIndexTable, { limit: 5000 });
    const indexedIds = indexed.filter((item) => String(item.followerUserId) === ctx.user!.userId && String(item.profileUserId) === profileUserId).map((item) => item.id);
    if (indexedIds.length) await db.delete(followIndexTable, indexedIds);
    return json({ following: false, profileUserId });
  }],
  'POST /api/listening/event': [requireAuth(), async (ctx) => {
    if (!(await isAgeVerified(ctx.user!.userId))) return error('Age verification required before recording listening activity.', 403);
    const body = (ctx.body ?? {}) as Record<string, unknown>;
    const eventType = String(body.eventType ?? '');
    if (!['start', 'progress', 'seek', 'complete', 'pause'].includes(eventType)) return error('Unsupported listening event.', 400);
    const releaseId = String(body.releaseId ?? '');
    const { items: releases } = await db.list(releaseTable, { limit: 500 });
    const release = releases.find((item) => String(item.id) === releaseId && item.status === 'released');
    if (!release) return error('Release not found.', 404);
    const durationSeconds = Math.max(0, Math.min(Number(body.durationSeconds ?? 0), 24 * 60 * 60));
    const positionSeconds = Math.max(0, Math.min(Number(body.positionSeconds ?? 0), durationSeconds || 24 * 60 * 60));
    const fromSeconds = body.fromSeconds == null ? null : Math.max(0, Math.min(Number(body.fromSeconds), durationSeconds || 24 * 60 * 60));
    const record = {
      releaseId,
      eventType,
      sessionId: String(body.sessionId ?? '').slice(0, 100) || null,
      positionSeconds,
      durationSeconds,
      fromSeconds,
      intent: String(body.intent ?? '').slice(0, 80),
      completed: eventType === 'complete' || body.completed === true,
      userId: ctx.user!.userId,
      createdAt: new Date().toISOString(),
    };
    await db.add(listeningTable, [record]);
    if (eventType !== 'seek' && eventType !== 'pause') {
      await db.add(tasteTable(ctx.user!.userId), [{
        type: eventType,
        contentId: releaseId,
        category: release.category ?? null,
        tags: cleanList([...(release.tags ?? []), ...(release.tropes ?? [])], 16),
        completed: record.completed,
        createdAt: record.createdAt,
      }]);
    }
    return json({ recorded: true });
  }],
  'GET /api/creator/dashboard': [
    requireAuth(),
    async (ctx) => {
      if (!(await requireRole(ctx.user!.userId, ['creator', 'admin']))) return error('Creator access required.', 403);
      const { items: releases } = await db.list(releaseTable, { limit: 500 });
      const mine = releases.filter((release) => release.creatorUserId === ctx.user!.userId);
      const { items: events } = await db.list(listeningTable, { limit: 5000 });
      const listening = events.filter((event) => mine.some((release) => release.id === event.releaseId));
      const seconds = verifiedListeningSeconds(listening);
      return json({ releases: mine, metrics: { released: mine.filter((release) => release.status === 'released').length, drafts: mine.filter((release) => release.status !== 'released').length, verifiedListeningMinutes: Number((seconds / 60).toFixed(1)), uniqueListeners: new Set(listening.map((event) => event.userId)).size } });
    },
  ],
  'GET /api/creator/releases': [
    requireAuth(),
    async (ctx) => {
      if (!(await requireRole(ctx.user!.userId, ['creator', 'admin']))) return error('Creator access required.', 403);
      const { items } = await db.list(releaseTable, { limit: 500 });
      return json({ releases: items.filter((release) => release.creatorUserId === ctx.user!.userId) });
    },
  ],
  'POST /api/creator/assets': [
    requireAuth(),
    async (ctx) => {
      if (!(await requireRole(ctx.user!.userId, ['creator']))) return error('Active Creator access required.', 403);
      const body = (ctx.body ?? {}) as { releaseId?: string; kind?: 'audio'|'artwork'; dataUrl?: string; contentType?: string; fileName?: string; durationMinutes?: number };
      if (!body.releaseId || !body.kind || !body.dataUrl) return error('Release, asset kind and file are required.', 400);
      if (!['audio', 'artwork'].includes(body.kind)) return error('Unsupported asset kind.', 400);
      const decoded = decodeDataUrl(body.dataUrl);
      if (!decoded) return error('Invalid uploaded file.', 400);
      const maxBytes = body.kind === 'audio' ? 25 * 1024 * 1024 : 5 * 1024 * 1024;
      if (decoded.bytes > maxBytes) return error(body.kind === 'audio' ? 'Audio must be 25 MB or smaller.' : 'Artwork must be 5 MB or smaller.', 413);
      const allowed = body.kind === 'audio'
        ? ['audio/mpeg','audio/mp3','audio/wav','audio/x-wav','audio/mp4','audio/x-m4a','audio/ogg','audio/webm']
        : ['image/png','image/jpeg','image/webp'];
      const contentType = body.contentType || decoded.contentType;
      if (!allowed.includes(contentType)) return error('Unsupported asset format.', 400);
      if (!assetSignatureMatches(decoded.base64, contentType)) return error('The uploaded file contents do not match the declared file format.', 400);
      const assetSha256 = createHash('sha256').update(Buffer.from(decoded.base64, 'base64')).digest('hex');
      const originalFileName = safeOriginalFileName(body.fileName);
      const { items } = await db.list(releaseTable, { limit: 500 });
      const release = items.find((item) => String(item.id) === String(body.releaseId) && item.creatorUserId === ctx.user!.userId);
      if (!release) return error('Release not found.', 404);
      if (!['draft', 'rejected'].includes(String(release.status ?? 'draft'))) return error('Submitted or live releases cannot have assets replaced. Wait for moderation or create an editable revision.', 409);
      const path = 'creators/' + ctx.user!.userId + '/' + body.kind + '/' + randomUUID() + '.' + extensionForContentType(contentType, body.kind);
      const [ok] = await storage.write([{ path, content: decoded.base64, contentType }]);
      if (!ok) return error('Asset upload failed.', 500);
      const [{ url }] = await storage.url([path]);
      const assetMeta = body.kind === 'audio'
        ? { audioBytes: decoded.bytes, audioSha256: assetSha256, audioOriginalFileName: originalFileName || null }
        : { artworkBytes: decoded.bytes, artworkSha256: assetSha256, artworkOriginalFileName: originalFileName || null };
      const next = { ...release, [body.kind === 'audio' ? 'audioUrl' : 'artworkUrl']: url ?? null, [body.kind === 'audio' ? 'audioPath' : 'artworkPath']: path, ...assetMeta, ...(body.kind === 'audio' && Number(body.durationMinutes) > 0 ? { durationMinutes: Math.min(Number(body.durationMinutes), 24 * 60) } : {}), assetUpdatedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      await db.update(releaseTable, [{ id: release.id, record: next }]);
      return json({ url: url ?? null, path, release: next });
    },
  ],
  'POST /api/creator/releases': [
    requireAuth(),
    async (ctx) => {
      if (!(await requireRole(ctx.user!.userId, ['creator']))) return error('Active Creator access required.', 403);
      const body = (ctx.body ?? {}) as Record<string, unknown>;
      const title = String(body.title ?? '').trim();
      if (!title) return error('Release title is required.', 400);
      const profile = await getProfile(ctx.user!.userId);
      const release = { id: 'release-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7), title, description: String(body.description ?? '').trim().slice(0, 1200), category: String(body.category ?? '').trim().slice(0, 80), genre: String(body.genre ?? '').trim().slice(0, 80), mood: String(body.mood ?? '').trim().slice(0, 80), tags: cleanList(body.tags), tropes: cleanList(body.tropes), durationMinutes: 0, audioUrl: null, artworkUrl: null, creatorUserId: ctx.user!.userId, creatorName: profile?.displayName ?? ctx.user!.name ?? 'Nightjar creator', creatorHandle: profile?.handle ?? null, status: 'draft', version: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      await db.add(releaseTable, [release]);
      return json({ release }, 201);
    },
  ],
  'PUT /api/creator/releases/:releaseId': [
    requireAuth(),
    async (ctx) => {
      if (!(await requireRole(ctx.user!.userId, ['creator']))) return error('Active Creator access required.', 403);
      const { items } = await db.list(releaseTable, { limit: 500 });
      const release = items.find((item) => item.id === ctx.params.releaseId && item.creatorUserId === ctx.user!.userId);
      if (!release) return error('Release not found.', 404);
      if (!['draft', 'rejected'].includes(String(release.status ?? 'draft'))) return error('Submitted or live releases cannot be edited directly. Wait for moderation or use the release lifecycle workflow.', 409);
      const body = (ctx.body ?? {}) as Record<string, unknown>;
      const next = {
        ...release,
        title: String(body.title ?? release.title ?? '').trim().slice(0, 160),
        description: String(body.description ?? release.description ?? '').trim().slice(0, 1200),
        category: String(body.category ?? release.category ?? '').trim().slice(0, 80),
        genre: String(body.genre ?? release.genre ?? '').trim().slice(0, 80),
        mood: String(body.mood ?? release.mood ?? '').trim().slice(0, 80),
        tags: body.tags === undefined ? (release.tags ?? []) : cleanList(body.tags),
        tropes: body.tropes === undefined ? (release.tropes ?? []) : cleanList(body.tropes),
        id: release.id,
        creatorUserId: release.creatorUserId,
        status: release.status,
        version: Number(release.version ?? 1) + 1,
        updatedAt: new Date().toISOString(),
      };
      if (!next.title) return error('Release title is required.', 400);
      await db.update(releaseTable, [{ id: release.id, record: next }]);
      return json({ release: next });
    },
  ],
  'DELETE /api/creator/releases/:releaseId': [
    requireAuth(),
    async (ctx) => {
      if (!(await requireRole(ctx.user!.userId, ['creator']))) return error('Active Creator access required.', 403);
      const { items } = await db.list(releaseTable, { limit: 500 });
      const release = items.find((item) => item.id === ctx.params.releaseId && item.creatorUserId === ctx.user!.userId);
      if (!release) return error('Release not found.', 404);
      if (!['draft', 'rejected'].includes(String(release.status ?? 'draft'))) return error('Submitted or live releases cannot be deleted directly.', 409);
      await db.delete(releaseTable, [release.id]);
      return json({ deleted: true });
    },
  ],
  'POST /api/creator/releases/:releaseId/publish': [
    requireAuth(),
    async (ctx) => {
      if (!(await requireRole(ctx.user!.userId, ['creator']))) return error('Active Creator access required.', 403);
      const { items } = await db.list(releaseTable, { limit: 500 });
      const release = items.find((item) => item.id === ctx.params.releaseId && item.creatorUserId === ctx.user!.userId);
      if (!release) return error('Release not found.', 404);
      if (!release.audioUrl) return error('An audio URL is required before submitting.', 400);
      if (!release.title || !release.description || !release.category) return error('Complete the release title, description and category before submitting.', 400);
      if (release.status === 'pending_review') return json({ release });
      if (release.status === 'released') return json({ release });
      const next = { ...release, status: 'pending_review', submittedAt: new Date().toISOString(), moderationNote: null, updatedAt: new Date().toISOString() };
      await db.update(releaseTable, [{ id: release.id, record: next }]);
      await db.add('nightjar_evidence_' + ctx.user!.userId, [{ eventType: 'release_submitted', severity: 'low', relatedType: 'release', relatedId: release.id, summary: 'Creator submitted a release for Nightjar moderation.', createdAt: new Date().toISOString() }]);
      return json({ release: next });
    },
  ],
  'GET /api/writer/scripts': [
    requireAuth(),
    async (ctx) => {
      if (!(await isAgeVerified(ctx.user!.userId))) return error('Age verification required before accessing adult manuscript tools.', 403);
      if (!(await requireRole(ctx.user!.userId, ['writer', 'admin']))) return error('Writer access required.', 403);
      const { items } = await db.list('nightjar_scripts', { limit: 500 });
      return json({ scripts: items.filter((script) => script.writerUserId === ctx.user!.userId) });
    },
  ],
  'POST /api/writer/scripts': [
    requireAuth(),
    async (ctx) => {
      if (!(await isAgeVerified(ctx.user!.userId))) return error('Age verification required before accessing adult manuscript tools.', 403);
      if (!(await requireRole(ctx.user!.userId, ['writer']))) return error('Active Writer access required.', 403);
      const body = (ctx.body ?? {}) as Record<string, unknown>;
      const title = String(body.title ?? '').trim();
      if (!title) return error('Script title is required.', 400);
      const content = String(body.content ?? '');
      const createdAt = new Date().toISOString();
      const script = { id: 'script-' + randomUUID(), title: title.slice(0, 200), content, contentHash: scriptContentHash(content), status: 'Draft', access: 'Private', version: 1, writerUserId: ctx.user!.userId, createdAt, updatedAt: createdAt };
      await db.add('nightjar_scripts', [script]);
      return json({ script }, 201);
    },
  ],
  'PUT /api/writer/scripts/:scriptId': [
    requireAuth(),
    async (ctx) => {
      if (!(await isAgeVerified(ctx.user!.userId))) return error('Age verification required before accessing adult manuscript tools.', 403);
      if (!(await requireRole(ctx.user!.userId, ['writer']))) return error('Active Writer access required.', 403);
      const { items } = await db.list('nightjar_scripts', { limit: 500 });
      const script = items.find((item) => item.id === ctx.params.scriptId && item.writerUserId === ctx.user!.userId);
      if (!script) return error('Script not found.', 404);
      if (!['Draft', 'Revision requested', 'Rejected'].includes(String(script.status ?? 'Draft'))) return error('Submitted or approved manuscripts are locked from direct editing.', 409);
      const body = (ctx.body ?? {}) as Record<string, unknown>;
      const next = {
        ...script,
        title: String(body.title ?? script.title ?? '').trim().slice(0, 200),
        content: String(body.content ?? script.content ?? ''),
        contentHash: scriptContentHash(String(body.content ?? script.content ?? '')),
        synopsis: String(body.synopsis ?? script.synopsis ?? '').trim().slice(0, 1600),
        excerpt: String(body.excerpt ?? script.excerpt ?? '').trim().slice(0, 2000),
        genre: String(body.genre ?? script.genre ?? '').trim().slice(0, 100),
        runtimeTarget: String(body.runtimeTarget ?? script.runtimeTarget ?? '').trim().slice(0, 100),
        characters: body.characters === undefined ? (script.characters ?? []) : cleanList(body.characters, 50),
        ageClassification: String(body.ageClassification ?? script.ageClassification ?? '').trim().slice(0, 80),
        id: script.id,
        writerUserId: script.writerUserId,
        status: script.status,
        version: script.version,
        editorUserId: script.editorUserId ?? null,
        access: script.access ?? 'Private',
        updatedAt: new Date().toISOString(),
      };
      if (!next.title) return error('Script title is required.', 400);
      await db.update('nightjar_scripts', [{ id: script.id, record: next }]);
      return json({ script: next });
    },
  ],
  'POST /api/writer/scripts/:scriptId/versions': [
    requireAuth(),
    async (ctx) => {
      if (!(await isAgeVerified(ctx.user!.userId))) return error('Age verification required before accessing adult manuscript tools.', 403);
      if (!(await requireRole(ctx.user!.userId, ['writer']))) return error('Active Writer access required.', 403);
      const { items } = await db.list('nightjar_scripts', { limit: 500 });
      const script = items.find((item) => item.id === ctx.params.scriptId && item.writerUserId === ctx.user!.userId);
      if (!script) return error('Script not found.', 404);
      if (!['Draft', 'Revision requested', 'Rejected'].includes(String(script.status ?? 'Draft'))) return error('Submitted or approved manuscripts are locked from version changes.', 409);
      const version = Number(script.version ?? 1) + 1;
      const versionCreatedAt = new Date().toISOString();
      await db.add('nightjar_script_versions_' + script.id, [{ scriptId: script.id, version, content: script.content ?? '', contentHash: script.contentHash ?? scriptContentHash(script.content ?? ''), writerUserId: ctx.user!.userId, createdAt: versionCreatedAt }]);
      const next = { ...script, version, updatedAt: new Date().toISOString() };
      await db.update('nightjar_scripts', [{ id: script.id, record: next }]);
      return json({ script: next, version });
    },
  ],
  'POST /api/writer/scripts/:scriptId/submit': [
    requireAuth(),
    async (ctx) => {
      if (!(await isAgeVerified(ctx.user!.userId))) return error('Age verification required before accessing adult manuscript tools.', 403);
      if (!(await requireRole(ctx.user!.userId, ['writer']))) return error('Active Writer access required.', 403);
      const { items } = await db.list('nightjar_scripts', { limit: 500 });
      const script = items.find((item) => item.id === ctx.params.scriptId && item.writerUserId === ctx.user!.userId);
      if (!script) return error('Script not found.', 404);
      if (!['Draft', 'Revision requested', 'Rejected'].includes(String(script.status ?? 'Draft'))) return error('This manuscript is already in editorial workflow or approved.', 409);
      if (!String(script.title ?? '').trim() || !String(script.content ?? '').trim()) return error('Add a title and manuscript content before submitting.', 400);
      const next = { ...script, status: 'Submitted', submittedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      await db.update('nightjar_scripts', [{ id: script.id, record: next }]);
      return json({ script: next });
    },
  ],
  'GET /api/editor/queue': [
    requireAuth(),
    async (ctx) => {
      if (!(await isAgeVerified(ctx.user!.userId))) return error('Age verification required before accessing adult manuscript tools.', 403);
      if (!(await requireRole(ctx.user!.userId, ['editor', 'admin']))) return error('Editor access required.', 403);
      const { items: scripts } = await db.list('nightjar_scripts', { limit: 500 });
      const { items: assignments } = await db.list('nightjar_editor_assignments', { limit: 500 });
      const openAssignments = assignments.filter((item) => item.status !== 'closed');
      const ids = (isAdmin(ctx.user!.email) ? openAssignments : openAssignments.filter((item) => item.editorUserId === ctx.user!.userId)).map((item) => item.scriptId);
      return json({ queue: scripts.filter((script) => ids.includes(script.id)).map((script) => ({ ...publicScriptMetadata(script), lastEditorialComment: script.lastEditorialComment ?? null, editorUserId: script.editorUserId ?? null })) });
    },
  ],
  'GET /api/editor/accounts': [
    requireAuth(),
    requireAdminEmailAllowlist(ADMIN_EMAILS),
    async () => {
      const { items: accounts } = await db.list(accountIndexTable, { limit: 1000 });
      return json({ editors: accounts.filter((account) => account.role === 'editor' && account.status !== 'suspended') });
    },
  ],
  'POST /api/editor/scripts/:scriptId/review': [
    requireAuth(),
    async (ctx) => {
      if (!(await isAgeVerified(ctx.user!.userId))) return error('Age verification required before accessing adult manuscript tools.', 403);
      if (!(await requireRole(ctx.user!.userId, ['editor']))) return error('Active Editor access required.', 403);
      const { items: scripts } = await db.list('nightjar_scripts', { limit: 500 });
      const script = scripts.find((item) => item.id === ctx.params.scriptId);
      if (!script) return error('Script not found.', 404);
      const { items: assignments } = await db.list('nightjar_editor_assignments', { limit: 500 });
      if (!assignments.some((item) => item.editorUserId === ctx.user!.userId && item.scriptId === script.id && item.status !== 'closed')) return error('This manuscript is not assigned to you.', 403);
      const body = (ctx.body ?? {}) as { status?: string; comment?: string };
      if (!['Under review', 'Revision requested', 'Approved', 'Rejected'].includes(body.status ?? '')) return error('Invalid editorial state.', 400);
      const now = new Date().toISOString();
      const next = { ...script, status: body.status, lastEditorialComment: String(body.comment ?? '').slice(0, 1200), updatedAt: now };
      await db.update('nightjar_scripts', [{ id: script.id, record: next }]);
      if (body.status === 'Approved' || body.status === 'Rejected') {
        const mine = assignments.filter((item) => item.editorUserId === ctx.user!.userId && item.scriptId === script.id && item.status !== 'closed');
        if (mine.length) await db.update('nightjar_editor_assignments', mine.map((item) => ({ id: item.id, record: { ...item, status: 'closed', closedAt: now, closedReason: body.status } })));
        await revokeReaderSessionsForScript(ctx.user!.userId, script.id, 'Editorial assignment closed.');
      }
      return json({ script: { ...publicScriptMetadata(next), lastEditorialComment: next.lastEditorialComment ?? null, editorUserId: next.editorUserId ?? null } });
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
          record = await refreshYotiResult(ctx.user!.userId, record);
        } catch {
          // Preserve the pending state if the provider is temporarily unavailable.
        }
      }
      return json({
        verified: record?.verified === true && record.ageThreshold === AGE_THRESHOLD && record.reverifyRequired !== true,
        verifiedOnce: record?.verified === true,
        ageThreshold: AGE_THRESHOLD,
        provider: record?.provider ?? yotiProviderName(),
        status: record?.status ?? 'NOT_STARTED',
        configured: yotiConfigured(),
        environment: ageEnvironment(),
        verifiedAt: record?.verifiedAt ?? null,
        verificationMethod: record?.verificationMethod ?? null,
        sessionActive: Boolean(record?.sessionId && !record?.verified),
        reverifyRequired: record?.reverifyRequired === true,
        testAvailable: isAdmin(ctx.user!.email),
      });
    },
  ],
  'POST /api/age/session': [
    requireAuth(),
    async (ctx) => {
      const existing = await getAgeRecord(ctx.user!.userId);
      if (existing?.verified && existing.ageThreshold === AGE_THRESHOLD && existing.reverifyRequired !== true) {
        return json({
          verified: true,
          verifiedOnce: true,
          status: 'COMPLETE',
          provider: existing.provider,
          verifiedAt: existing.verifiedAt ?? null,
          verificationMethod: existing.verificationMethod ?? null,
        });
      }
      if (!yotiConfigured()) return json({ verified: false, configured: false, provider: yotiProviderName(), environment: ageEnvironment(), testAvailable: isAdmin(ctx.user!.email) });

      const credential = yotiCredential();
      if (!credential) return error('Age verification provider credentials are not configured.', 503);
      const verificationReference = opaqueVerificationReference();
      const response = await fetch(`${yotiApiBase()}/sessions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${credential}`,
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
          reference_id: verificationReference,
          callback: { auto: true, url: appUrl },
          cancel_url: appUrl,
          retry_enabled: true,
          resume_enabled: true,
          synchronous_checks: true,
        }),
      });
      if (!response.ok) return error(`Yoti ${ageEnvironment()} could not create a verification session (${response.status}).`, 502);
      const session = await response.json() as { id?: string; status?: string; expires_at?: string };
      if (!session.id) return error(`Yoti ${ageEnvironment()} did not return a session ID.`, 502);
      const record: AgeRecord = {
        verified: false,
        ageThreshold: AGE_THRESHOLD,
        provider: yotiProviderName(),
        verificationReference,
        sessionId: session.id,
        sessionExpiresAt: session.expires_at ?? null,
        status: session.status ?? 'PENDING',
        reverifyRequired: false,
      };
      await saveAgeRecord(ctx.user!.userId, record);
      const launchBase = ageEnvironment() === 'production' ? 'https://age.yoti.com' : 'https://age.yoti.com/sandbox';
      return json({
        verified: false,
        configured: true,
        provider: yotiProviderName(),
        environment: ageEnvironment(),
        status: record.status,
        sessionId: session.id,
        expiresAt: session.expires_at ?? null,
        launchUrl: `${launchBase}?sessionId=${encodeURIComponent(session.id)}&sdkId=${encodeURIComponent(process.env.YOTI_SDK_ID!)}`,
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
        verificationMethod: 'administrator-test',
        status: 'COMPLETE',
        reverifyRequired: false,
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
      const age = await getAgeRecord(ctx.user!.userId);
      const ageVerified = age?.verified === true && age.ageThreshold === AGE_THRESHOLD && age.reverifyRequired !== true;
      if (isAdmin(ctx.user!.email)) {
        const table = accountTable(ctx.user!.userId);
        const existing = await db.list<AccountRecord>(table, { limit: 1 });
        if (existing.items.length > 0) await db.delete(table, [existing.items[0].id]);
        return json({ role: 'admin', status: 'active', owner: true, ageVerified, ageVerifiedAt: age?.verifiedAt ?? null });
      }
      const { items } = await db.list<AccountRecord>(accountTable(ctx.user!.userId), { limit: 1 });
      return json({
        role: items[0]?.role ?? null,
        status: items[0]?.status ?? null,
        removed: items[0]?.removed === true,
        owner: false,
        ageVerified,
        ageVerifiedAt: age?.verifiedAt ?? null,
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
      const body = (ctx.body ?? {}) as { eventType?: string; relatedType?: string; relatedId?: string; severity?: string; summary?: string; sessionId?: string; deviceId?: string };
      const allowed = new Set(['script_view','copy_blocked','cut_blocked','paste_blocked','contextmenu_blocked','selection_blocked','drag_blocked','print_blocked','export_requested','export_completed','permission_changed','script_access_requested','report_submitted','blocked_interaction','repeated_protected_interaction']);
      if (!body.eventType || !allowed.has(body.eventType)) return error('Unsupported protection event.',400);
      const device = await registerProtectedDevice(ctx.user!.userId, body.deviceId, body.relatedId ?? null);
      const record={eventType:body.eventType,severity:body.severity==='high'||body.severity==='medium'?body.severity:'low',relatedType:body.relatedType??null,relatedId:body.relatedId??null,sessionId:body.sessionId??null,deviceHash:device.deviceHash,summary:(body.summary??'Protected interaction recorded.').slice(0,300),actorUserId:ctx.user!.userId,createdAt:new Date().toISOString()};
      const [id]=await db.add('nightjar_evidence_'+ctx.user!.userId,[record]);
      await db.add(securityEventTable,[{userId:ctx.user!.userId,...record}]);
      const alert=await assessProtectedActivity(ctx.user!.userId,{eventType:body.eventType,relatedId:body.relatedId,sessionId:body.sessionId,deviceHash:device.deviceHash});
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
    async (ctx) => {
      if (!(await isAgeVerified(ctx.user!.userId))) return error('Age verification required before accessing protected scripts.', 403);
      if (await isSuspended(ctx.user!.userId)) return error('This account is suspended.', 403);
      const { items } = await db.list('nightjar_scripts', { limit: 500 });
      const { items: accessItems } = await db.list('nightjar_script_access_' + ctx.user!.userId, { limit: 500 });
      const now = Date.now();
      const activeAccess = new Set(accessItems
        .filter((grant) => !grant.revokedAt && (!grant.expiresAt || new Date(String(grant.expiresAt)).getTime() > now))
        .map((grant) => String(grant.scriptId)));
      const scripts = items
        .filter((script) => script.writerUserId === ctx.user!.userId || activeAccess.has(String(script.id)))
        .map((script) => ({
          id: script.id,
          title: script.title,
          status: script.status,
          version: script.version,
          writerUserId: script.writerUserId,
          writerName: script.writerName ?? null,
          synopsis: script.synopsis ?? null,
          excerpt: script.excerpt ?? null,
          genre: script.genre ?? null,
          runtimeTarget: script.runtimeTarget ?? null,
          characters: script.characters ?? [],
          ageClassification: script.ageClassification ?? null,
          updatedAt: script.updatedAt ?? null,
          protected: true,
          canReadFull: script.writerUserId === ctx.user!.userId || activeAccess.has(String(script.id)),
        }));
      return json({ scripts });
    },
  ],
  'GET /api/scripts/:scriptId': [
    requireAuth(),
    async (ctx) => {
      if (!(await isAgeVerified(ctx.user!.userId))) return error('Age verification required before accessing protected scripts.', 403);
      if (await isSuspended(ctx.user!.userId)) return error('This account is suspended.', 403);
      const { items: scripts } = await db.list('nightjar_scripts', { limit: 500 });
      const script = scripts.find((item) => item.id === ctx.params.scriptId);
      if (!script) return error('Script not found.', 404);

      const owner = script.writerUserId === ctx.user!.userId;
      const { items: accessItems } = await db.list('nightjar_script_access_' + ctx.user!.userId, { limit: 100 });
      const access = accessItems.find((item) =>
        item.scriptId === ctx.params.scriptId &&
        !item.revokedAt &&
        (!item.expiresAt || new Date(String(item.expiresAt)).getTime() > Date.now())
      );
      const { items: assignments } = await db.list('nightjar_editor_assignments', { limit: 500 });
      const editorAssignment = assignments.find((item) =>
        item.scriptId === ctx.params.scriptId &&
        item.editorUserId === ctx.user!.userId &&
        item.status !== 'closed'
      );

      if (!owner && !access && !editorAssignment) return error('Script not found.', 404);

      await revokeReaderSessionsForScript(ctx.user!.userId, ctx.params.scriptId, 'Superseded by a new protected reader session.');
      const sessionId = 'NJ-RD-' + randomUUID().replace(/-/g, '').slice(0, 18).toUpperCase();
      const issuedAt = new Date().toISOString();
      const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
      const profile = await getProfile(ctx.user!.userId);
      const viewerLabel = String(profile?.displayName ?? ctx.user!.name ?? 'Nightjar account').slice(0, 80);
      const device = await registerProtectedDevice(ctx.user!.userId, ctx.query.deviceId, ctx.params.scriptId);
      if (device.blocked || device.linkedSuspendedUserIds.length) {
        const alert = await createSecurityAlert(ctx.user!.userId, {
          severity: 'critical',
          riskScore: 95,
          reason: device.blocked
            ? 'Protected-script access attempted from a device token blocked by an administrator.'
            : 'Protected-script access attempted from a device token previously linked to a suspended account.',
          relatedId: ctx.params.scriptId,
          deviceHash: device.deviceHash,
          linkedSuspendedUserIds: device.linkedSuspendedUserIds,
          signal: { eventType: 'blocked_device_reader_attempt' },
        });
        return error('Protected-script access is paused for security review. Security alert ' + String(alert.id ?? '') + ' was created.', 403);
      }
      const watermark = 'NIGHTJAR · ' + viewerLabel + ' · ' + sessionId.slice(-8) + ' · ' + issuedAt.slice(0, 16).replace('T', ' ');
      const session = {
        sessionId,
        scriptId: ctx.params.scriptId,
        accountId: ctx.user!.userId,
        accessGrantId: owner ? 'owner' : access?.id ?? ('editor:' + String(editorAssignment?.id ?? 'assignment')),
        issuedAt,
        expiresAt,
        status: 'active',
        canReadFull: true,
        allowCopy: owner || access?.allowCopy === true,
        allowExport: owner || access?.allowExport === true,
        watermark,
        deviceHash: device.deviceHash,
      };
      await db.add(readerSessionTable(ctx.user!.userId), [session]);
      const signal = { userId: ctx.user!.userId, eventType: 'reader_session_issued', relatedId: ctx.params.scriptId, sessionId, deviceHash: device.deviceHash, createdAt: issuedAt };
      await db.add(securityEventTable, [signal]);
      await assessProtectedActivity(ctx.user!.userId, signal);
      await db.add('nightjar_evidence_' + ctx.user!.userId, [{
        eventType: 'reader_session_issued',
        severity: 'low',
        relatedType: 'script',
        relatedId: ctx.params.scriptId,
        sessionId,
        summary: 'Protected reader session issued without returning the manuscript body in the metadata response.',
        actorUserId: ctx.user!.userId,
        createdAt: issuedAt,
      }]);

      return json({
        script: publicScriptMetadata({ ...script, contentHash: script.contentHash ?? scriptContentHash(script.content ?? '') }),
        canReadFull: true,
        copyAllowed: session.allowCopy,
        exportAllowed: session.allowExport,
        readerSession: { sessionId, expiresAt, watermark },
      });
    },
  ],

  'GET /api/scripts/:scriptId/content': [
    requireAuth(),
    async (ctx) => {
      if (!(await isAgeVerified(ctx.user!.userId))) return error('Age verification required before accessing protected scripts.', 403);
      if (await isSuspended(ctx.user!.userId)) return error('This account is suspended.', 403);
      const sessionId = String(ctx.query.sessionId ?? '').trim();
      const page = Math.max(0, Math.floor(Number(ctx.query.page ?? 0)));
      if (!sessionId) return error('Reader session is required.', 400);

      const { items: sessions } = await db.list(readerSessionTable(ctx.user!.userId), { limit: 500 });
      const session = sessions.find((item) =>
        String(item.sessionId) === sessionId &&
        String(item.scriptId) === ctx.params.scriptId &&
        item.status === 'active'
      );
      if (!session) return error('Reader session is not active.', 403);
      if (new Date(String(session.expiresAt ?? 0)).getTime() <= Date.now()) return error('Reader session has expired.', 403);

      const { items: scripts } = await db.list('nightjar_scripts', { limit: 500 });
      const script = scripts.find((item) => item.id === ctx.params.scriptId);
      if (!script) return error('Script not found.', 404);
      if (!(await readerSessionStillAuthorized(ctx.user!.userId, script, session))) {
        await revokeReaderSessionsForScript(ctx.user!.userId, ctx.params.scriptId, 'Underlying script permission expired or was revoked.');
        return error('Script access is no longer authorised.', 403);
      }

      if (String(script.writerUserId) !== ctx.user!.userId && !(await enforceProtectedPageRate(ctx.user!.userId, ctx.params.scriptId, sessionId))) return error('Protected reader rate limit reached. Reopen the manuscript after review.', 429);
      const pages = chunkProtectedContent(script.content ?? '');
      if (page >= pages.length) return error('Protected page not found.', 404);
      const createdAt = new Date().toISOString();
      const forensicToken = pageForensicToken(ctx.user!.userId, ctx.params.scriptId, sessionId, page, session.issuedAt);
      const signal = {
        userId: ctx.user!.userId,
        eventType: 'script_page_view',
        relatedId: ctx.params.scriptId,
        sessionId,
        deviceHash: session.deviceHash ?? null,
        forensicToken,
        page,
        totalPages: pages.length,
        createdAt,
      };
      await db.add(securityEventTable, [signal]);
      await assessProtectedActivity(ctx.user!.userId, signal);

      return json({
        scriptId: ctx.params.scriptId,
        content: pages[page],
        page,
        totalPages: pages.length,
        hasPrevious: page > 0,
        hasNext: page + 1 < pages.length,
        watermark: (session.watermark ?? ('NIGHTJAR · ' + sessionId.slice(-8))) + ' · FP ' + forensicToken + ' · P' + String(page + 1),
        forensicToken,
        contentHash: script.contentHash ?? scriptContentHash(script.content ?? ''),
        sessionExpiresAt: session.expiresAt,
      });
    },
  ],

  'GET /api/scripts/:scriptId/export': [
    requireAuth(),
    async (ctx) => {
      if (!(await isAgeVerified(ctx.user!.userId))) return error('Age verification required before exporting protected scripts.', 403);
      if (await isSuspended(ctx.user!.userId)) return error('This account is suspended.', 403);
      const sessionId = String(ctx.query.sessionId ?? '').trim();
      if (!sessionId) return error('Reader session is required.', 400);
      const { items: sessions } = await db.list(readerSessionTable(ctx.user!.userId), { limit: 500 });
      const session = sessions.find((item) =>
        String(item.sessionId) === sessionId &&
        String(item.scriptId) === ctx.params.scriptId &&
        item.status === 'active'
      );
      if (!session || new Date(String(session.expiresAt ?? 0)).getTime() <= Date.now()) return error('Reader session is not active.', 403);
      if (session.allowExport !== true) return error('The writer has not granted full-script export permission.', 403);

      const { items: scripts } = await db.list('nightjar_scripts', { limit: 500 });
      const script = scripts.find((item) => item.id === ctx.params.scriptId);
      if (!script) return error('Script not found.', 404);
      if (!(await readerSessionStillAuthorized(ctx.user!.userId, script, session))) {
        await revokeReaderSessionsForScript(ctx.user!.userId, ctx.params.scriptId, 'Underlying script permission expired or was revoked.');
        return error('Script access is no longer authorised.', 403);
      }
      const profile = await getProfile(ctx.user!.userId);
      const recipient = String(profile?.displayName ?? ctx.user!.name ?? 'Nightjar recipient').slice(0, 80);
      const hash = script.contentHash ?? scriptContentHash(script.content ?? '');
      const exportText = [
        String(script.title ?? 'Untitled manuscript'),
        'Nightjar protected export',
        'Recipient: ' + recipient,
        'Session: ' + sessionId,
        'Version: ' + String(script.version ?? 1),
        'SHA-256: ' + hash,
        '',
        String(script.content ?? ''),
        '',
        '---',
        'This copy was explicitly exported under writer-controlled permission. Nightjar access and export events are logged.',
        'No AI training, dataset ingestion, automated extraction or redistribution is authorised by this export unless the writer separately grants that permission in writing.',
      ].join('\n');

      const createdAt = new Date().toISOString();
      const signal = { userId: ctx.user!.userId, eventType: 'script_export', relatedId: ctx.params.scriptId, sessionId, createdAt };
      await db.add(securityEventTable, [signal]);
      await assessProtectedActivity(ctx.user!.userId, signal);
      await db.add('nightjar_evidence_' + ctx.user!.userId, [{
        eventType: 'script_export',
        severity: 'medium',
        relatedType: 'script',
        relatedId: ctx.params.scriptId,
        sessionId,
        summary: 'Full manuscript exported under explicit writer-granted export permission.',
        actorUserId: ctx.user!.userId,
        createdAt,
      }]);
      if (script.writerUserId && String(script.writerUserId) !== ctx.user!.userId) {
        await db.add('nightjar_evidence_' + script.writerUserId, [{
          eventType: 'script_export_by_recipient',
          severity: 'medium',
          relatedType: 'script',
          relatedId: ctx.params.scriptId,
          sessionId,
          summary: recipient + ' exported the full manuscript under the writer’s explicit handoff permission.',
          actorUserId: ctx.user!.userId,
          createdAt,
        }]);
        await createUserNotificationOnce(String(script.writerUserId), {
          type: 'script_access',
          dedupeKey: 'script-export:' + ctx.params.scriptId + ':' + sessionId,
          title: 'Your script was exported',
          message: recipient + ' exported the full manuscript using the Full handoff permission you granted.',
          scriptId: ctx.params.scriptId,
          recipientUserId: ctx.user!.userId,
          createdAt,
        });
      }
      return json({
        fileName: String(script.title ?? 'nightjar-script').replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 80) + '.txt',
        content: exportText,
        contentHash: hash,
        watermark: session.watermark ?? null,
      });
    },
  ],

  'POST /api/scripts/:scriptId/request-access': [
    requireAuth(),
    async (ctx) => {
      if (!(await isAgeVerified(ctx.user!.userId))) return error('Age verification required before requesting protected script access.', 403);
      if (!(await requireRole(ctx.user!.userId, ['creator']))) return error('Active Creator access required.', 403);
      const { items: scripts } = await db.list('nightjar_scripts', { limit: 500 });
      const script = scripts.find((item) => item.id === ctx.params.scriptId);
      if (!script) return error('Script not found.', 404);
      if (script.writerUserId === ctx.user!.userId) return json({ requested: false, alreadyGranted: true });
      const { items } = await db.list('nightjar_script_access_' + ctx.user!.userId, { limit: 100 });
      const activeGrant = items.find((item) => item.scriptId === ctx.params.scriptId && !item.revokedAt && (!item.expiresAt || new Date(String(item.expiresAt)).getTime() > Date.now()));
      if (activeGrant) return json({ requested: false, alreadyGranted: true });
      const table = 'nightjar_script_access_requests_' + script.writerUserId;
      const { items: requests } = await db.list(table, { limit: 200 });
      const pending = requests.find((item) => item.scriptId === ctx.params.scriptId && item.requesterUserId === ctx.user!.userId && item.status === 'pending');
      if (!pending) await db.add(table, [{ scriptId: ctx.params.scriptId, requesterUserId: ctx.user!.userId, status: 'pending', createdAt: new Date().toISOString() }]);
      await db.add('nightjar_evidence_' + ctx.user!.userId, [{
        eventType: 'script_access_requested',
        severity: 'low',
        relatedType: 'script',
        relatedId: ctx.params.scriptId,
        summary: 'Creator requested full read access to a script.',
        actorUserId: ctx.user!.userId,
        createdAt: new Date().toISOString(),
      }]);
      return json({ requested: !pending, pending: true });
    },
  ],
  'GET /api/scripts/:scriptId/access': [
    requireAuth(),
    async (ctx) => {
      if (!(await isAgeVerified(ctx.user!.userId))) return error('Age verification required before accessing adult manuscript tools.', 403);
      const { items: scripts } = await db.list('nightjar_scripts', { limit: 500 });
      const script = scripts.find((item) => item.id === ctx.params.scriptId);
      if (!script || script.writerUserId !== ctx.user!.userId) return error('Writer ownership is required.', 403);

      const { items: accounts } = await db.list(accountIndexTable, { limit: 2000 });
      const eligibleRecipients = await Promise.all(accounts
        .filter((account) => String(account.userId) !== ctx.user!.userId && account.status !== 'suspended')
        .map(async (account) => {
          const profile = await getProfile(String(account.userId));
          return {
            userId: String(account.userId),
            role: account.role,
            name: profile?.displayName ?? account.name ?? 'Nightjar account',
            handle: profile?.handle ?? account.handle ?? null,
          };
        }));

      const grantRows: any[] = [];
      for (const recipient of eligibleRecipients) {
        const { items } = await db.list('nightjar_script_access_' + recipient.userId, { limit: 100 });
        const grant = items.find((item) => item.scriptId === ctx.params.scriptId);
        if (grant) grantRows.push({
          id: grant.id,
          recipientUserId: recipient.userId,
          recipientName: recipient.name,
          recipientHandle: recipient.handle,
          recipientRole: recipient.role,
          allowCopy: grant.allowCopy === true,
          allowExport: grant.allowExport === true,
          grantedAt: grant.grantedAt ?? null,
          expiresAt: grant.expiresAt ?? null,
          revokedAt: grant.revokedAt ?? null,
        });
      }

      const { items: requests } = await db.list('nightjar_script_access_requests_' + ctx.user!.userId, { limit: 200 });
      const pendingRequests = requests
        .filter((item) => item.scriptId === ctx.params.scriptId && item.status === 'pending')
        .map((item) => {
          const account = accounts.find((candidate) => String(candidate.userId) === String(item.requesterUserId));
          return {
            id: item.id,
            requesterUserId: String(item.requesterUserId),
            requesterName: account?.name ?? 'Nightjar account',
            requesterRole: account?.role ?? null,
            createdAt: item.createdAt ?? null,
          };
        });

      const { items: securityEvents } = await db.list(securityEventTable, { limit: 1000 });
      const recentActivity = securityEvents
        .filter((item) => String(item.relatedId ?? '') === ctx.params.scriptId && ['reader_session_issued', 'script_page_view', 'script_export'].includes(String(item.eventType ?? '')))
        .sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')))
        .slice(0, 50)
        .map((item) => {
          const account = accounts.find((candidate) => String(candidate.userId) === String(item.userId));
          return {
            id: item.id,
            eventType: item.eventType,
            actorUserId: item.userId,
            actorName: account?.name ?? (String(item.userId) === ctx.user!.userId ? 'You' : 'Nightjar account'),
            sessionId: item.sessionId ?? null,
            page: item.page ?? null,
            totalPages: item.totalPages ?? null,
            createdAt: item.createdAt ?? null,
          };
        });

      return json({ grants: grantRows, pendingRequests, eligibleRecipients, recentActivity });
    },
  ],

  'POST /api/scripts/:scriptId/permissions': [
    requireAuth(),
    async (ctx) => {
      if (!(await isAgeVerified(ctx.user!.userId))) return error('Age verification required before accessing adult manuscript tools.', 403);
      const body = (ctx.body ?? {}) as {
        recipientUserId?: string;
        creatorUserId?: string;
        allowCopy?: boolean;
        allowExport?: boolean;
        expiresAt?: string | null;
        revoke?: boolean;
        purpose?: string;
      };
      const recipientUserId = String(body.recipientUserId ?? body.creatorUserId ?? '').trim();
      if (!recipientUserId) return error('Recipient account is required.', 400);
      if (recipientUserId === ctx.user!.userId) return error('Writers already control their own manuscript.', 400);

      const { items: scripts } = await db.list('nightjar_scripts', { limit: 500 });
      const script = scripts.find((item) => item.id === ctx.params.scriptId);
      if (!script || script.writerUserId !== ctx.user!.userId) return error('Writer ownership is required.', 403);

      const table = 'nightjar_script_access_' + recipientUserId;
      const existing = await db.list(table, { limit: 100 });
      const match = existing.items.find((item) => item.scriptId === ctx.params.scriptId);

      let target: any = null;
      if (!body.revoke) {
        const { items: accounts } = await db.list(accountIndexTable, { limit: 2000 });
        target = accounts.find((item) => String(item.userId) === recipientUserId && item.status !== 'suspended');
        if (!target) return error('The selected recipient is not an active Nightjar account.', 400);
      } else if (!match) {
        return error('No existing script access grant was found to revoke.', 404);
      }

      const expiry = body.expiresAt ? new Date(body.expiresAt) : null;
      if (!body.revoke && expiry && (!Number.isFinite(expiry.getTime()) || expiry.getTime() <= Date.now())) return error('Access expiry must be a future date.', 400);

      const now = new Date().toISOString();
      const record = {
        scriptId: ctx.params.scriptId,
        writerUserId: ctx.user!.userId,
        collaborationId: recipientUserId + ':' + ctx.params.scriptId,
        recipientRole: target?.role ?? match?.recipientRole ?? null,
        purpose: String(body.purpose ?? match?.purpose ?? '').trim().slice(0, 160) || null,
        allowCopy: body.revoke ? false : body.allowCopy === true,
        allowExport: body.revoke ? false : body.allowExport === true,
        grantedAt: match?.grantedAt ?? now,
        expiresAt: body.revoke ? (match?.expiresAt ?? null) : (expiry ? expiry.toISOString() : null),
        revokedAt: body.revoke ? now : null,
        updatedAt: now,
      };
      if (match) await db.update(table, [{ id: match.id, record }]);
      else await db.add(table, [record]);

      const { items: requests } = await db.list('nightjar_script_access_requests_' + ctx.user!.userId, { limit: 200 });
      const relatedRequests = requests.filter((item) => item.scriptId === ctx.params.scriptId && String(item.requesterUserId) === recipientUserId && item.status === 'pending');
      if (relatedRequests.length) {
        await db.update('nightjar_script_access_requests_' + ctx.user!.userId, relatedRequests.map((item) => ({
          id: item.id,
          record: { ...item, status: body.revoke ? 'revoked' : 'granted', resolvedAt: now },
        })));
      }

      await revokeReaderSessionsForScript(recipientUserId, ctx.params.scriptId, body.revoke ? 'Writer revoked protected script access.' : 'Writer changed protected script permissions.');
      await db.add('nightjar_evidence_' + ctx.user!.userId, [{
        eventType: body.revoke ? 'script_access_revoked' : 'script_access_granted',
        severity: body.allowExport ? 'medium' : 'low',
        relatedType: 'script',
        relatedId: ctx.params.scriptId,
        summary: body.revoke
          ? 'Writer revoked recipient access to a protected manuscript.'
          : body.allowExport
            ? 'Writer explicitly granted full-script export permission to a recipient.'
            : body.allowCopy
              ? 'Writer granted protected reading with copy permission.'
              : 'Writer granted protected read-only manuscript access.',
        actorUserId: ctx.user!.userId,
        recipientUserId,
        createdAt: now,
      }]);
      await createUserNotificationOnce(recipientUserId, {
        type: 'script_access',
        dedupeKey: 'script-access:' + ctx.params.scriptId + ':' + recipientUserId + ':' + now,
        title: body.revoke ? 'Script access revoked' : body.allowExport ? 'Full script handoff granted' : 'Protected script access granted',
        message: body.revoke
          ? 'The writer has revoked your access to this manuscript.'
          : body.allowExport
            ? 'The writer has explicitly allowed you to read and export the full manuscript.'
            : body.allowCopy
              ? 'The writer has allowed protected reading and copying for this manuscript.'
              : 'The writer has granted protected read-only access to this manuscript.',
        scriptId: ctx.params.scriptId,
        allowCopy: record.allowCopy,
        allowExport: record.allowExport,
        expiresAt: record.expiresAt,
      });

      return json({
        recipientUserId,
        allowCopy: record.allowCopy,
        allowExport: record.allowExport,
        expiresAt: record.expiresAt,
        revoked: body.revoke === true,
      });
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
      const current=await getProfile(ctx.user!.userId); const profile:NightjarProfile={displayName:String(body.displayName??ctx.user!.name??'Nightjar account').trim().slice(0,80),handle:handle||null,headline:String(body.headline??'').trim().slice(0,120),bio:String(body.bio??'').trim().slice(0,500),pronouns:String(body.pronouns??'').trim().slice(0,60),avatarInitials:String(body.avatarInitials??'').trim().slice(0,4).toUpperCase(),avatarTone:String(body.avatarTone??'plum').trim().slice(0,24),favouriteTags:cleanList(body.favouriteTags),favouriteTropes:cleanList(body.favouriteTropes),favouriteCategories:cleanList(body.favouriteCategories),roleFocus:cleanList(body.roleFocus),publicProfile:body.publicProfile!==false,onboardingComplete:body.onboardingComplete===true,onboardingVersion:Number(body.onboardingVersion??0)||undefined,createdAt:current?.createdAt??new Date().toISOString(),updatedAt:new Date().toISOString()};
      if(current){const {items}=await db.list(profileTable(ctx.user!.userId),{limit:1}); if(items[0]) await db.update(profileTable(ctx.user!.userId),[{id:items[0].id,record:profile}]);} else await db.add(profileTable(ctx.user!.userId),[profile]);
      const {items:indexes}=await db.list(accountIndexTable,{limit:1000}); const indexed=indexes.find((item)=>item.userId===ctx.user!.userId); if(indexed) await db.update(accountIndexTable,[{id:indexed.id,record:{...indexed,name:profile.displayName,handle:profile.handle}}]); else if(isAdmin(ctx.user!.email)) await db.add(accountIndexTable,[{userId:ctx.user!.userId,email:normalizeEmail(ctx.user!.email),name:profile.displayName,handle:profile.handle,role:'admin',status:'active',createdAt:profile.createdAt}]);
      await db.add(tasteTable(ctx.user!.userId),[{type:'declared_preferences',tags:profile.favouriteTags,tropes:profile.favouriteTropes,categories:profile.favouriteCategories,updatedAt:profile.updatedAt}]);
      return json({profile});
    },
  ],
  'GET /api/profile/:handle': [requireAuth(), async (ctx) => { if(!(await isAgeVerified(ctx.user!.userId)))return error('Age verification required before viewing public profiles.',403); const handle=cleanHandle(ctx.params.handle); const {items:indexes}=await db.list(accountIndexTable,{limit:1000}); const account=indexes.find((item)=>cleanHandle(item.handle)===handle&&item.status!=='suspended'); if(!account)return error('Profile not found.',404); const profile=await getProfile(account.userId); if(!profile?.publicProfile)return error('Profile not found.',404); return json({profile:{...profile,role:account.role}}); }],
  'POST /api/taste/event': [requireAuth(), async (ctx) => { if(!(await isAgeVerified(ctx.user!.userId)))return error('Age verification required before recording adult taste signals.',403); const body=(ctx.body??{}) as {eventType?:string;contentId?:string;category?:string;tags?:string[];durationSeconds?:number;completed?:boolean}; const eventType=String(body.eventType??''); if(!['more_like_this','less_like_this','not_for_me','hide','skip','save','follow','complete','replay'].includes(eventType))return error('Unsupported taste signal.',400); await db.add(tasteTable(ctx.user!.userId),[{type:eventType,contentId:String(body.contentId??'').slice(0,100)||null,category:String(body.category??'').slice(0,80)||null,tags:cleanList(body.tags,12),durationSeconds:Math.max(0,Math.min(Number(body.durationSeconds??0),86400)),completed:body.completed===true,createdAt:new Date().toISOString()}]); return json({recorded:true}); }],
  'GET /api/taste/profile': [requireAuth(), async (ctx) => { if(!(await isAgeVerified(ctx.user!.userId)))return error('Age verification required before viewing the adult taste profile.',403); const profile=await getProfile(ctx.user!.userId); const {items}=await db.list(tasteTable(ctx.user!.userId),{limit:500}); const weights:Record<string,number>={}; for(const value of [...(profile?.favouriteTags??[]),...(profile?.favouriteTropes??[]),...(profile?.favouriteCategories??[])]){const key=String(value).toLowerCase();weights[key]=(weights[key]??0)+5;} for(const item of items){const factor=tasteSignalWeight(item.type,item.completed===true);for(const value of [...(item.tags??[]),...(item.category?[item.category]:[])]){const key=String(value).toLowerCase();weights[key]=(weights[key]??0)+factor;}} return json({declared:{tags:profile?.favouriteTags??[],tropes:profile?.favouriteTropes??[],categories:profile?.favouriteCategories??[]},vector:Object.entries(weights).sort((a,b)=>b[1]-a[1]).slice(0,24).map(([label,value])=>({label,weight:Number(value.toFixed(2))}))}); }],
  'POST /api/security/device/register': [
    requireAuth(),
    async (ctx) => {
      const body = (ctx.body ?? {}) as { deviceId?: string };
      const device = await registerProtectedDevice(ctx.user!.userId, body.deviceId, null);
      const linkedRestrictedUserIds = device.linkedSuspendedUserIds.filter((userId) => userId !== ctx.user!.userId);
      const suspicious = device.blocked || linkedRestrictedUserIds.length > 0;
      let alertId: string | null = null;
      if (suspicious) {
        const { items: existing } = await db.list(securityAlertTable, { limit: 250 });
        const recent = existing.find((item) =>
          String(item.userId ?? '') === ctx.user!.userId &&
          String(item.deviceHash ?? '') === String(device.deviceHash ?? '') &&
          item.status === 'open' &&
          Date.now() - new Date(String(item.createdAt ?? 0)).getTime() < 24 * 60 * 60_000
        );
        if (recent?.id) {
          alertId = String(recent.id);
        } else {
          const alert = await createSecurityAlert(ctx.user!.userId, {
            severity: device.blocked ? 'critical' : 'high',
            riskScore: device.blocked ? 95 : 78,
            reason: device.blocked
              ? 'A Nightjar session was opened from a device token previously blocked by an administrator.'
              : 'A Nightjar session was opened from a device token previously linked to a suspended or removed account.',
            relatedId: null,
            deviceHash: device.deviceHash,
            linkedSuspendedUserIds: linkedRestrictedUserIds,
            signal: { eventType: 'device_linked_to_restricted_account', accountSessionOnly: true },
          });
          alertId = alert.id ? String(alert.id) : null;
        }
      }
      return json({
        registered: Boolean(device.deviceHash),
        protectedAccessPaused: device.blocked,
        linkedRestrictedAccountCount: linkedRestrictedUserIds.length,
        securityReviewRequired: suspicious,
        alertId,
      });
    },
  ],
  'POST /api/security/reader-session': [
    requireAuth(),
    async (ctx) => {
      if (!(await isAgeVerified(ctx.user!.userId))) return error('Age verification required before opening protected content.', 403);
      if (await isSuspended(ctx.user!.userId)) return error('This account is suspended.', 403);
      const body = (ctx.body ?? {}) as { scriptId?: string; deviceId?: string };
      const scriptId = String(body.scriptId ?? '');
      if (!scriptId) return error('Script ID is required.', 400);

      const { items: scripts } = await db.list('nightjar_scripts', { limit: 500 });
      const script = scripts.find((item) => item.id === scriptId);
      if (!script) return error('Script not found.', 404);

      const owner = script.writerUserId === ctx.user!.userId;
      const { items: accessItems } = await db.list('nightjar_script_access_' + ctx.user!.userId, { limit: 100 });
      const grant = accessItems.find((item) =>
        item.scriptId === scriptId &&
        !item.revokedAt &&
        (!item.expiresAt || new Date(String(item.expiresAt)).getTime() > Date.now())
      );
      const { items: assignments } = await db.list('nightjar_editor_assignments', { limit: 500 });
      const editorAssignment = assignments.find((item) =>
        item.scriptId === scriptId &&
        item.editorUserId === ctx.user!.userId &&
        item.status !== 'closed'
      );
      if (!owner && !grant && !editorAssignment) return error('Protected script access has not been granted.', 403);

      await revokeReaderSessionsForScript(ctx.user!.userId, scriptId, 'Superseded by a new protected reader session.');
      const issuedAt = new Date().toISOString();
      const sessionId = 'NJ-RD-' + randomUUID().replace(/-/g, '').slice(0, 18).toUpperCase();
      const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
      const profile = await getProfile(ctx.user!.userId);
      const viewerLabel = String(profile?.displayName ?? ctx.user!.name ?? 'Nightjar account').slice(0, 80);
      const device = await registerProtectedDevice(ctx.user!.userId, body.deviceId, scriptId);
      if (device.blocked || device.linkedSuspendedUserIds.length) {
        const alert = await createSecurityAlert(ctx.user!.userId, {
          severity: 'critical',
          riskScore: 95,
          reason: device.blocked
            ? 'Protected-script access attempted from a device token blocked by an administrator.'
            : 'Protected-script access attempted from a device token previously linked to a suspended account.',
          relatedId: scriptId,
          deviceHash: device.deviceHash,
          linkedSuspendedUserIds: device.linkedSuspendedUserIds,
          signal: { eventType: 'blocked_device_reader_attempt' },
        });
        return error('Protected-script access is paused for security review. Security alert ' + String(alert.id ?? '') + ' was created.', 403);
      }
      const session = {
        sessionId,
        scriptId,
        accountId: ctx.user!.userId,
        accessGrantId: owner ? 'owner' : grant?.id ?? ('editor:' + String(editorAssignment?.id ?? 'assignment')),
        issuedAt,
        expiresAt,
        status: 'active',
        canReadFull: true,
        allowCopy: owner || grant?.allowCopy === true,
        allowExport: owner || grant?.allowExport === true,
        watermark: 'NIGHTJAR · ' + viewerLabel + ' · ' + sessionId.slice(-8) + ' · ' + issuedAt.slice(0, 16).replace('T', ' '),
        deviceHash: device.deviceHash,
      };
      await db.add(readerSessionTable(ctx.user!.userId), [session]);
      const signal = { userId: ctx.user!.userId, eventType: 'reader_session_issued', relatedId: scriptId, sessionId, deviceHash: device.deviceHash, createdAt: issuedAt };
      await db.add(securityEventTable, [signal]);
      await assessProtectedActivity(ctx.user!.userId, signal);
      return json({ session });
    },
  ],
  'GET /api/writers': [
    requireAuth(),
    async (ctx) => {
      if (!(await isAgeVerified(ctx.user!.userId))) return error('Age verification required before discovering writers.', 403);
      const { items: accounts } = await db.list(accountIndexTable, { limit: 1000 });
      const { items: scripts } = await db.list('nightjar_scripts', { limit: 500 });
      const writers = await Promise.all(accounts
        .filter((account) => account.role === 'writer' && account.status !== 'suspended')
        .map(async (account) => {
          const profile = await getProfile(String(account.userId));
          if (!profile?.publicProfile) return null;
          return {
            userId: String(account.userId),
            name: profile.displayName ?? account.name ?? 'Nightjar writer',
            handle: profile.handle ?? account.handle ?? null,
            headline: profile.headline ?? null,
            bio: profile.bio ?? null,
            initials: profile.avatarInitials ?? null,
            pronouns: profile.pronouns ?? null,
            roleFocus: profile.roleFocus ?? [],
            publishedWorkCount: scripts.filter((script) => script.writerUserId === account.userId && ['Approved', 'Published'].includes(String(script.status))).length,
          };
        }));
      return json({ writers: writers.filter(Boolean) });
    },
  ],
  'GET /api/notifications': [
    requireAuth(),
    async (ctx) => {
      if (!(await isAgeVerified(ctx.user!.userId))) return error('Age verification required before viewing notifications.', 403);
      const { items } = await db.list(userNotificationTable(ctx.user!.userId), { limit: 50 });
      const sorted = items.slice().sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')));
      return json({
        notifications: sorted.slice(0, 30),
        unreadCount: sorted.filter((item) => item.read !== true).length,
      });
    },
  ],
  'POST /api/notifications/:notificationId/read': [
    requireAuth(),
    async (ctx) => {
      const { items } = await db.list(userNotificationTable(ctx.user!.userId), { limit: 100 });
      const notification = items.find((item) => item.id === ctx.params.notificationId);
      if (!notification) return error('Notification not found.', 404);
      await db.update(userNotificationTable(ctx.user!.userId), [{ id: notification.id, record: { ...notification, read: true, readAt: new Date().toISOString() } }]);
      return json({ read: true });
    },
  ],
  'GET /api/security/notifications': [
    requireAuth(),
    withScopes('email'),
    async (ctx) => {
      if (!isAdmin(ctx.user!.email)) return json({ notifications: [], unreadCount: 0 });
      const { items } = await db.list(ownerNotificationTable(ctx.user!.email), { limit: 100 });
      const sorted = items.slice().sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')));
      return json({ notifications: sorted, unreadCount: sorted.filter((item) => item.read !== true).length });
    },
  ],
  'POST /api/security/notifications/:notificationId/read': [
    requireAuth(),
    withScopes('email'),
    async (ctx) => {
      if (!isAdmin(ctx.user!.email)) return error('Administrator access required.', 403);
      const table = ownerNotificationTable(ctx.user!.email);
      const { items } = await db.list(table, { limit: 100 });
      const notification = items.find((item) => item.id === ctx.params.notificationId);
      if (!notification) return error('Security notification not found.', 404);
      await db.update(table, [{ id: notification.id, record: { ...notification, read: true, readAt: new Date().toISOString() } }]);
      return json({ read: true });
    },
  ],
  'GET /api/admin/security-alerts': [
    requireAdminEmailAllowlist(ADMIN_EMAILS),
    async () => {
      const [{ items: items }, { items: accounts }, { items: events }, { items: cases }, { items: devices }] = await Promise.all([
        db.list(securityAlertTable, { limit: 250 }),
        db.list(accountIndexTable, { limit: 2000 }),
        db.list(securityEventTable, { limit: 5000 }),
        db.list(securityCaseTable, { limit: 1000 }),
        db.list(securityDeviceTable, { limit: 5000 }),
      ]);
      const alerts = await Promise.all(items.map(async (alert) => {
        const userId = String(alert.userId ?? '');
        const account = accounts.find((candidate) => String(candidate.userId) === userId);
        const profile = userId ? await getProfile(userId) : null;
        const createdMs = new Date(String(alert.createdAt ?? 0)).getTime();
        const recentEvents = events
          .filter((item) => String(item.userId ?? '') === userId && Math.abs(new Date(String(item.createdAt ?? 0)).getTime() - createdMs) <= 15 * 60_000)
          .sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')))
          .slice(0, 30)
          .map((item) => ({
            id: item.id,
            eventType: item.eventType,
            relatedId: item.relatedId ?? null,
            sessionId: item.sessionId ?? null,
            deviceHash: item.deviceHash ?? null,
            forensicToken: item.forensicToken ?? null,
            page: item.page ?? null,
            totalPages: item.totalPages ?? null,
            action: item.action ?? null,
            createdAt: item.createdAt ?? null,
          }));
        const evidenceSummary = {
          pageViews: recentEvents.filter((item) => item.eventType === 'script_page_view').length,
          blockedInteractions: recentEvents.filter((item) => String(item.eventType ?? '').includes('blocked')).length,
          exports: recentEvents.filter((item) => item.eventType === 'script_export').length,
          distinctScripts: new Set(recentEvents.map((item) => String(item.relatedId ?? '')).filter(Boolean)).size,
          forensicTokens: recentEvents.map((item) => String(item.forensicToken ?? '')).filter(Boolean).slice(0, 12),
        };
        const deviceHash = String(alert.deviceHash ?? '');
        const linkedDevices = deviceHash ? devices.filter((item) => String(item.deviceHash ?? '') === deviceHash) : [];
        const linkedAccountIds = Array.from(new Set(linkedDevices.map((item) => String(item.userId ?? '')).filter(Boolean)));
        const linkedAccounts = linkedAccountIds.map((linkedUserId) => {
          const linked = accounts.find((candidate) => String(candidate.userId) === linkedUserId);
          return {
            userId: linkedUserId,
            status: linked?.status ?? null,
            removed: linked?.removed === true,
            sameAsSubject: linkedUserId === userId,
          };
        });
        const securityCase = cases.find((item) => String(item.alertId ?? '') === String(alert.id ?? ''));
        return {
          ...alert,
          subjectDisplayName: profile?.displayName ?? account?.name ?? null,
          subjectEmail: account?.email ?? null,
          subjectAccountStatus: account?.status ?? null,
          subjectRemoved: account?.removed === true,
          recentEvents,
          evidenceSummary,
          linkedAccounts,
          caseHistory: Array.isArray(securityCase?.history) ? securityCase.history : [],
          deviceBlocked: linkedDevices.some((item) => item.blocked === true),
          networkCorrelationAvailable: false,
          networkCorrelationNote: 'The current AppDeploy request context does not expose a trusted client-network address. Nightjar therefore uses device and forensic correlation rather than storing or trusting a client-supplied IP address.',
        };
      }));
      alerts.sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')));
      return json({ alerts });
    },
  ],
  'GET /api/admin/security/trace/:forensicToken': [
    requireAdminEmailAllowlist(ADMIN_EMAILS),
    async (ctx) => {
      const token = String(ctx.params.forensicToken ?? '').trim().toUpperCase().replace(/[^A-F0-9]/g, '').slice(0, 32);
      if (token.length < 8) return error('Enter at least eight characters from the forensic token.', 400);
      const { items: events } = await db.list(securityEventTable, { limit: 5000 });
      const matches = events.filter((item) => String(item.forensicToken ?? '').toUpperCase().startsWith(token));
      const { items: accounts } = await db.list(accountIndexTable, { limit: 2000 });
      const traces = await Promise.all(matches.map(async (item) => {
        const account = accounts.find((candidate) => String(candidate.userId) === String(item.userId));
        const profile = item.userId ? await getProfile(String(item.userId)) : null;
        return {
          forensicToken: item.forensicToken,
          userId: item.userId,
          accountStatus: account?.status ?? null,
          accountEmail: account?.email ?? null,
          displayName: profile?.displayName ?? account?.name ?? null,
          scriptId: item.relatedId ?? null,
          sessionId: item.sessionId ?? null,
          deviceHash: item.deviceHash ?? null,
          page: item.page ?? null,
          totalPages: item.totalPages ?? null,
          createdAt: item.createdAt ?? null,
        };
      }));
      return json({ traces });
    },
  ],
  'POST /api/admin/security-alerts/:alertId/action': [
    requireAdminEmailAllowlist(ADMIN_EMAILS),
    async (ctx) => {
      const body = (ctx.body ?? {}) as { action?: string; note?: string };
      const action = String(body.action ?? '');
      const allowed = new Set(['benign', 'revoke_sessions', 'freeze_account', 'restore_account', 'remove_account', 'block_device']);
      if (!allowed.has(action)) return error('Choose a valid security action.', 400);
      const { items } = await db.list(securityAlertTable, { limit: 250 });
      const alert = items.find((item) => item.id === ctx.params.alertId);
      if (!alert) return error('Security alert not found.', 404);
      const userId = String(alert.userId ?? '');
      if (!userId) return error('Alert has no subject account.', 400);
      const at = new Date().toISOString();
      const actor = ctx.user!.email ?? null;
      const note = String(body.note ?? '').trim().slice(0, 1000) || null;
      if (['freeze_account', 'remove_account', 'block_device'].includes(action) && !note) {
        return error('Add a review note before taking a destructive security action.', 400);
      }

      const { items: accounts } = await db.list(accountTable(userId), { limit: 1 });
      const account = accounts[0] ?? null;
      const { items: indexes } = await db.list(accountIndexTable, { limit: 2000 });
      const indexed = indexes.find((item) => String(item.userId) === userId) ?? null;

      if (action === 'revoke_sessions') {
        await revokeReaderSessions(userId, 'Protected-reader sessions revoked by an administrator during security review.');
      }

      if (action === 'freeze_account' || action === 'remove_account') {
        const previousStatus = account?.securityPreviousStatus ?? account?.status ?? indexed?.status ?? 'active';
        if (account?.id) await db.update(accountTable(userId), [{
          id: account.id,
          record: {
            ...account,
            status: 'suspended',
            securityPreviousStatus: previousStatus === 'suspended' ? 'active' : previousStatus,
            suspendedAt: at,
            suspendedBy: actor,
            removed: action === 'remove_account',
            removedAt: action === 'remove_account' ? at : account.removedAt ?? null,
            removedBy: action === 'remove_account' ? actor : account.removedBy ?? null,
          },
        }]);
        if (indexed?.id) await db.update(accountIndexTable, [{
          id: indexed.id,
          record: { ...indexed, status: 'suspended', removed: action === 'remove_account', securityPreviousStatus: previousStatus === 'suspended' ? 'active' : previousStatus },
        }]);
        if (action === 'remove_account') {
          const { items: profileRows } = await db.list(profileTable(userId), { limit: 1 });
          const profileRow = profileRows[0];
          if (profileRow?.id) await db.update(profileTable(userId), [{ id: profileRow.id, record: { ...profileRow, publicProfile: false, removedAt: at } }]);
        }
        await revokeReaderSessions(userId, action === 'remove_account' ? 'Account removed from Nightjar after administrator review.' : 'Account frozen after administrator security review.');
      }

      if (action === 'restore_account') {
        const nextStatus = String(account?.securityPreviousStatus ?? indexed?.securityPreviousStatus ?? 'active');
        if (account?.id) await db.update(accountTable(userId), [{ id: account.id, record: { ...account, status: nextStatus, removed: false, restoredAt: at, restoredBy: actor } }]);
        if (indexed?.id) await db.update(accountIndexTable, [{ id: indexed.id, record: { ...indexed, status: nextStatus, removed: false, restoredAt: at, restoredBy: actor } }]);
      }

      if (action === 'block_device') {
        const deviceHash = String(alert.deviceHash ?? '');
        if (!deviceHash) return error('This alert does not contain a device correlation token.', 409);
        const { items: devices } = await db.list(securityDeviceTable, { limit: 5000 });
        const updates = devices.filter((item) => String(item.deviceHash ?? '') === deviceHash).map((item) => ({
          id: item.id,
          record: { ...item, blocked: true, blockedAt: at, blockedBy: actor, blockReason: note ?? 'Blocked from a Nightjar security alert.' },
        }));
        if (updates.length) await db.update(securityDeviceTable, updates);
        await revokeReaderSessions(userId, 'Protected-reader device blocked by an administrator.');
      }

      const alertStatus = action === 'benign' ? 'benign' : 'actioned';
      await db.update(securityAlertTable, [{
        id: alert.id,
        record: { ...alert, status: alertStatus, action, actionedAt: at, actionedBy: actor, actionNote: note },
      }]);
      const { items: cases } = await db.list(securityCaseTable, { limit: 500 });
      const securityCase = cases.find((item) => String(item.alertId ?? '') === String(alert.id));
      if (securityCase?.id) {
        const history = Array.isArray(securityCase.history) ? securityCase.history : [];
        await db.update(securityCaseTable, [{
          id: securityCase.id,
          record: { ...securityCase, state: action, history: [...history, { state: action, at, note: note ?? 'Administrator action recorded.' }], updatedAt: at },
        }]);
      }
      await db.add(securityEventTable, [{
        userId,
        eventType: 'admin_security_action',
        action,
        actorEmail: actor,
        relatedId: alert.id,
        deviceHash: alert.deviceHash ?? null,
        note,
        createdAt: at,
      }]);
      return json({ ok: true, action, userId, status: alertStatus });
    },
  ],
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
          administrators: await Promise.all(ADMIN_EMAILS.map(async (email) => { const indexed=accounts.find((account)=>normalizeEmail(account.email)===normalizeEmail(email)&&account.role==='admin'); const profile=indexed?.userId ? await getProfile(indexed.userId) : null; return { email, userId:indexed?.userId??null, name:profile?.displayName??indexed?.name??null, handle:profile?.handle??indexed?.handle??null, role:'admin', status:'active', designation:'Owner / Administrator' }; })),
        },
        subscriptions: { ...subscriptionCounts, totalTracked: subscriptions.length, billingConnected: subscriptions.length > 0 },
      });
    },
  ],
  'GET /api/admin/release-library': [
    requireAuth(),
    requireAdminEmailAllowlist(ADMIN_EMAILS),
    async () => {
      const { items: releases } = await db.list(releaseTable, { limit: 500 });
      const moderationStatuses = new Set(['pending_review', 'released', 'held', 'taken_down', 'rejected']);
      return json({
        releases: releases
          .filter((release) => moderationStatuses.has(String(release.status ?? '')))
          .sort((a, b) => String(b.updatedAt ?? b.createdAt ?? '').localeCompare(String(a.updatedAt ?? a.createdAt ?? ''))),
      });
    },
  ],
  'GET /api/admin/release-queue': [
    requireAuth(),
    requireAdminEmailAllowlist(ADMIN_EMAILS),
    async () => {
      const { items: releases } = await db.list(releaseTable, { limit: 500 });
      return json({ releases: releases.filter((release) => release.status === 'pending_review').slice(0, 100) });
    },
  ],
  'POST /api/admin/releases/:releaseId/lifecycle': [
    requireAuth(),
    requireAdminEmailAllowlist(ADMIN_EMAILS),
    async (ctx) => {
      const body = (ctx.body ?? {}) as { action?: 'hold'|'restore'|'takedown'; note?: string; reasonCode?: string };
      const action = String(body.action ?? '');
      if (!['hold', 'restore', 'takedown'].includes(action)) return error('Choose a valid release lifecycle action.', 400);
      const { items } = await db.list(releaseTable, { limit: 500 });
      const release = items.find((item) => item.id === ctx.params.releaseId);
      if (!release) return error('Release not found.', 404);
      const fromStatus = String(release.status ?? '');
      let toStatus = fromStatus;
      if (action === 'hold' && fromStatus === 'released') toStatus = 'held';
      else if (action === 'takedown' && ['released', 'held'].includes(fromStatus)) toStatus = 'taken_down';
      else if (action === 'restore' && ['held', 'taken_down'].includes(fromStatus)) toStatus = 'released';
      else return error('That lifecycle action is not valid for the release’s current status.', 409);
      const now = new Date().toISOString();
      const note = String(body.note ?? '').trim().slice(0, 1000) || null;
      const reasonCode = String(body.reasonCode ?? 'other').trim().slice(0, 80) || 'other';
      const next = {
        ...release,
        status: toStatus,
        lifecycleNote: note,
        lifecycleReasonCode: reasonCode,
        lifecycleUpdatedAt: now,
        lifecycleUpdatedBy: ctx.user!.userId,
        releaseDate: action === 'restore' ? (release.releaseDate ?? now) : release.releaseDate ?? null,
        updatedAt: now,
      };
      await db.update(releaseTable, [{ id: release.id, record: next }]);
      await db.add(moderationHistoryTable, [{
        releaseId: release.id,
        creatorUserId: release.creatorUserId ?? null,
        decision: action,
        reasonCode,
        note,
        fromStatus,
        toStatus,
        moderatorUserId: ctx.user!.userId,
        createdAt: now,
      }]);
      if (release.creatorUserId) {
        await createUserNotificationOnce(String(release.creatorUserId), {
          type: 'content',
          subtype: 'release',
          dedupeKey: 'release-lifecycle:' + release.id + ':' + action + ':' + now,
          title: action === 'hold' ? 'Your release has been placed on hold' : action === 'takedown' ? 'Your release has been taken down' : 'Your release has been restored',
          message: action === 'hold'
            ? 'Nightjar has temporarily removed this release from the public catalogue while it is reviewed.'
            : action === 'takedown'
              ? 'Nightjar has removed this release from the public catalogue. Open Creator Studio for the recorded moderation reason.'
              : 'Nightjar has restored this release to the public catalogue.',
          releaseId: release.id,
          moderationNote: note,
          reasonCode,
        });
      }
      return json({ release: next });
    },
  ],
  'GET /api/admin/releases/:releaseId/moderation-history': [
    requireAuth(),
    requireAdminEmailAllowlist(ADMIN_EMAILS),
    async (ctx) => {
      const releaseId = String(ctx.params.releaseId ?? '');
      const { items } = await db.list(moderationHistoryTable, { limit: 2000 });
      const history = items
        .filter((item) => String(item.releaseId) === releaseId)
        .sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')))
        .slice(0, 100);
      return json({ history });
    },
  ],
  'POST /api/admin/releases/:releaseId/moderate': [
    requireAuth(),
    requireAdminEmailAllowlist(ADMIN_EMAILS),
    async (ctx) => {
      const body = (ctx.body ?? {}) as { decision?: 'approved'|'changes'|'rejected'; note?: string; reasonCode?: string };
      if (!['approved', 'changes', 'rejected'].includes(body.decision ?? '')) return error('Choose a moderation decision.', 400);
      const { items } = await db.list(releaseTable, { limit: 500 });
      const release = items.find((item) => item.id === ctx.params.releaseId);
      if (!release) return error('Release not found.', 404);
      if (release.status !== 'pending_review') return error('Only pending releases can receive a pre-publication moderation decision.', 409);
      const now = new Date().toISOString();
      const status = body.decision === 'approved' ? 'released' : body.decision === 'changes' ? 'draft' : 'rejected';
      const next = { ...release, status, moderationNote: String(body.note ?? '').trim().slice(0, 1000) || null, moderatedAt: now, moderatedBy: ctx.user!.userId, releaseDate: body.decision === 'approved' ? now : release.releaseDate ?? null, updatedAt: now };
      await db.update(releaseTable, [{ id: release.id, record: next }]);
      await db.add(moderationHistoryTable, [{
        releaseId: release.id,
        creatorUserId: release.creatorUserId ?? null,
        decision: body.decision,
        reasonCode: String(body.reasonCode ?? (body.decision === 'approved' ? 'approved' : 'other')).trim().slice(0, 80),
        note: next.moderationNote,
        fromStatus: release.status ?? null,
        toStatus: status,
        moderatorUserId: ctx.user!.userId,
        createdAt: now,
      }]);
      if (release.creatorUserId) {
        await createUserNotificationOnce(String(release.creatorUserId), {
          type: 'content',
          subtype: 'release',
          dedupeKey: 'release-moderation:' + release.id + ':' + now,
          title: body.decision === 'approved' ? 'Your release is live on Nightjar' : body.decision === 'changes' ? 'Changes requested for your release' : 'Your release was not approved',
          message: body.decision === 'approved'
            ? 'Your release has passed Nightjar moderation and is now available to age-verified listeners.'
            : body.decision === 'changes'
              ? 'Nightjar moderation has requested changes before this release can be published. Open Creator Studio to review the note.'
              : 'Your release was not approved for publication. Open Creator Studio to review the moderation note.',
          releaseId: release.id,
          moderationNote: next.moderationNote,
        });
      }
      return json({ release: next });
    },
  ],
  'GET /api/admin/scripts': [
    requireAuth(),
    requireAdminEmailAllowlist(ADMIN_EMAILS),
    async () => {
      const { items } = await db.list('nightjar_scripts', { limit: 500 });
      return json({ scripts: items.map((script) => ({ id: script.id, title: script.title, status: script.status, version: script.version, writerUserId: script.writerUserId, editorUserId: script.editorUserId ?? null, updatedAt: script.updatedAt ?? null })) });
    },
  ],
  'POST /api/admin/scripts/:scriptId/assign-editor': [
    requireAuth(),
    requireAdminEmailAllowlist(ADMIN_EMAILS),
    async (ctx) => {
      const body = (ctx.body ?? {}) as { editorUserId?: string };
      const editorUserId = String(body.editorUserId ?? '').trim();
      if (!editorUserId) return error('Editor account is required.', 400);
      const { items: editors } = await db.list(accountIndexTable, { limit: 1000 });
      if (!editors.some((account) => account.userId === editorUserId && account.role === 'editor' && account.status !== 'suspended')) return error('The selected account is not an active Editor.', 400);
      const { items: scripts } = await db.list('nightjar_scripts', { limit: 500 });
      const script = scripts.find((item) => item.id === ctx.params.scriptId);
      if (!script) return error('Script not found.', 404);
      const next = { ...script, editorUserId, updatedAt: new Date().toISOString() };
      await db.update('nightjar_scripts', [{ id: script.id, record: next }]);
      const { items: existing } = await db.list('nightjar_editor_assignments', { limit: 500 });
      const now = new Date().toISOString();
      const stale = existing.filter((item) => item.scriptId === script.id && item.editorUserId !== editorUserId && item.status !== 'closed');
      if (stale.length) {
        await db.update('nightjar_editor_assignments', stale.map((item) => ({ id: item.id, record: { ...item, status: 'closed', closedAt: now, closedReason: 'reassigned' } })));
        for (const assignment of stale) await revokeReaderSessionsForScript(String(assignment.editorUserId), script.id, 'Editorial assignment was reassigned.');
      }
      const current = existing.find((item) => item.scriptId === script.id && item.editorUserId === editorUserId && item.status !== 'closed');
      if (!current) {
        await db.add('nightjar_editor_assignments', [{ scriptId: script.id, editorUserId, assignedBy: ctx.user!.userId, status: 'open', assignedAt: now }]);
      }
      return json({ script: { ...publicScriptMetadata(next), editorUserId: next.editorUserId ?? null } });
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
