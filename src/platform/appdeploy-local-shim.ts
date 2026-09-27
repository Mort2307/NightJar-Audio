type LocalUser = {
  userId: string;
  email: string;
  name: string;
  role: 'admin' | 'creator' | 'listener' | 'writer' | 'editor' | null;
  status: 'active' | 'pending_review';
  createdAt: string;
};

type LocalState = {
  users: LocalUser[];
  profiles: Record<string, Record<string, unknown>>;
  age: Record<string, Record<string, unknown>>;
  releases: Record<string, any>[];
  scripts: Record<string, any>[];
  scriptVersions: Record<string, any[]>;
  follows: Record<string, string[]>;
  favourites: Record<string, string[]>;
  listening: any[];
  taste: Record<string, any[]>;
  reports: any[];
  evidence: any[];
  applications: any[];
  subscriptions: any[];
  securityAlerts: any[];
  securityNotifications: Record<string, any[]>;
  notifications: Record<string, any[]>;
  readerSessions: Record<string, any[]>;
  brandingUrl: string | null;
  spotlights: any[];
};

type Response<T = unknown> = { data: T };

const ADMIN_EMAILS = [
  'mike.owen230792@gmail.com',
  'megan.wright666@hotmail.com',
  'nightjar.audio.app@gmail.com',
];

const STATE_KEY = 'nightjar.local.state.v1';
const SESSION_KEY = 'nightjar.local.session.v1';

const now = () => new Date().toISOString();
const cleanEmail = (value: unknown) => String(value ?? '').trim().toLowerCase();
const isAdminEmail = (email: string) => ADMIN_EMAILS.includes(cleanEmail(email));
const id = (prefix: string) => prefix + '-' + Math.random().toString(36).slice(2, 11);

const emptyState = (): LocalState => ({
  users: [],
  profiles: {},
  age: {},
  releases: [],
  scripts: [],
  scriptVersions: {},
  follows: {},
  favourites: {},
  listening: [],
  taste: {},
  reports: [],
  evidence: [],
  applications: [],
  subscriptions: [],
  securityAlerts: [],
  securityNotifications: {},
  notifications: {},
  readerSessions: {},
  brandingUrl: null,
  spotlights: [],
});

function loadState(): LocalState {
  if (typeof window === 'undefined') return emptyState();
  try {
    const raw = window.localStorage.getItem(STATE_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as Partial<LocalState>;
    return { ...emptyState(), ...parsed };
  } catch {
    return emptyState();
  }
}

function saveState(state: LocalState) {
  if (typeof window !== 'undefined') window.localStorage.setItem(STATE_KEY, JSON.stringify(state));
}

function currentUser(state: LocalState): LocalUser | null {
  if (typeof window === 'undefined') return null;
  const userId = window.localStorage.getItem(SESSION_KEY);
  return userId ? state.users.find((user) => user.userId === userId) ?? null : null;
}

function requireUser(state: LocalState): LocalUser {
  const user = currentUser(state);
  if (!user) throw new Error('Authentication required.');
  return user;
}

function requireAdmin(state: LocalState): LocalUser {
  const user = requireUser(state);
  if (!isAdminEmail(user.email)) throw new Error('Administrator access required.');
  return user;
}

function ensureProfile(state: LocalState, user: LocalUser) {
  if (!state.profiles[user.userId]) {
    state.profiles[user.userId] = {
      displayName: user.name,
      handle: user.email.split('@')[0].replace(/[^a-z0-9_-]/gi, '').slice(0, 24),
      headline: '',
      bio: '',
      pronouns: '',
      avatarInitials: user.name.slice(0, 2).toUpperCase(),
      avatarTone: 'plum',
      favouriteTags: [],
      favouriteTropes: [],
      favouriteCategories: [],
      roleFocus: [],
      publicProfile: true,
      createdAt: now(),
      updatedAt: now(),
    };
  }
  return state.profiles[user.userId];
}

function addLocalNotification(state: LocalState, userId: string, notification: Record<string, any>) {
  state.notifications[userId] = [...(state.notifications[userId] ?? []), { id: id('notification'), userId, read: false, createdAt: notification.createdAt ?? now(), ...notification }];
}

function addLocalNotificationOnce(state: LocalState, userId: string, notification: Record<string, any>) {
  const existing = state.notifications[userId] ?? [];
  if (notification.dedupeKey && existing.some((item) => item.dedupeKey === notification.dedupeKey)) return;
  addLocalNotification(state, userId, notification);
}

function bodyObject(body: unknown) {
  return (body && typeof body === 'object') ? body as Record<string, any> : {};
}

async function request(path: string, method: string, body?: unknown): Promise<Response<any>> {
  const state = loadState();
  const send = (data: unknown) => {
    saveState(state);
    return Promise.resolve({ data });
  };

  const user = currentUser(state);
  const parts = path.split('?')[0].split('/').filter(Boolean);
  const q = new URLSearchParams(path.includes('?') ? path.slice(path.indexOf('?') + 1) : '');
  const input = bodyObject(body);

  if (path === '/api/branding' && method === 'GET') return send({ logoUrl: state.brandingUrl });

  if (path === '/api/account/identity' && method === 'GET') {
    const account = requireUser(state);
    return send({ email: account.email, normalizedEmail: account.email, userId: account.userId, scope: ['openid', 'email', 'profile'], admin: isAdminEmail(account.email), adminEmailsConfigured: ADMIN_EMAILS });
  }

  if (path === '/api/account' && method === 'GET') {
    const account = requireUser(state);
    return send({ userId: account.userId, email: account.email, role: account.role, status: account.status });
  }

  if (path === '/api/account/role' && method === 'POST') {
    const account = requireUser(state);
    const requested = String(input.role ?? '');
    if (!['listener', 'creator', 'writer'].includes(requested)) throw new Error('That role is not available for self-service creation.');
    account.role = requested as LocalUser['role'];
    account.status = requested === 'creator' ? 'pending_review' : 'active';
    ensureProfile(state, account);
    if (requested === 'creator' && !state.applications.some((application) => application.userId === account.userId && application.status === 'pending')) {
      state.applications.push({
        id: id('creator-app'),
        userId: account.userId,
        email: account.email,
        creatorName: account.name,
        displayName: state.profiles[account.userId]?.displayName ?? account.name,
        status: 'pending',
        createdAt: now(),
      });
    }
    return send({ role: account.role, status: account.status });
  }

  if (path === '/api/age/status' && method === 'GET') {
    const account = requireUser(state);
    const record = state.age[account.userId] ?? { verified: false, status: 'NOT_STARTED', provider: 'local-development', testMode: true };
    return send({ ...record, ageThreshold: 18, configured: true, provider: 'local-development', testAvailable: isAdminEmail(account.email) });
  }

  if (path === '/api/age/session' && method === 'POST') {
    const account = requireUser(state);
    const record = { verified: true, ageThreshold: 18, provider: 'local-development', status: 'COMPLETE', verifiedAt: now() };
    state.age[account.userId] = record;
    return send({ ...record, configured: true });
  }

  if (path === '/api/age/test-pass' && method === 'POST') {
    const account = requireAdmin(state);
    state.age[account.userId] = { verified: true, ageThreshold: 18, provider: 'local-development', status: 'COMPLETE', verifiedAt: now(), testMode: true };
    return send({ verified: true, status: 'COMPLETE', provider: 'local-development' });
  }

  if (path === '/api/catalogue' && method === 'GET') {
    const query = String(q.get('q') ?? '').trim().toLowerCase();
    const category = String(q.get('category') ?? '').trim().toLowerCase();
    const catalogue = state.releases
      .filter((release) => release.status === 'released')
      .filter((release) => !category || String(release.category ?? '').toLowerCase() === category)
      .filter((release) => !query || [release.title, release.description, release.category, release.genre, release.mood, ...(release.tags ?? []), ...(release.tropes ?? [])].join(' ').toLowerCase().includes(query))
      .map((release) => ({
        ...release,
        creatorName: state.profiles[release.creatorUserId]?.displayName ?? release.creatorName,
        creatorHandle: state.profiles[release.creatorUserId]?.handle ?? release.creatorHandle,
      }));
    return send({ catalogue });
  }

  if (parts[0] === 'api' && parts[1] === 'creators' && parts.length === 3 && method === 'GET') {
    const account = requireUser(state);
    const creator = state.users.find((item) => item.userId === parts[2] && item.role === 'creator' && item.status !== 'pending_review');
    if (!creator) throw new Error('Creator profile not found.');
    const profile = ensureProfile(state, creator);
    if (profile.publicProfile === false) throw new Error('Creator profile not found.');
    const releases = state.releases
      .filter((release) => release.creatorUserId === creator.userId && release.status === 'released')
      .map((release) => ({ id: release.id, title: release.title, description: release.description, category: release.category, genre: release.genre, mood: release.mood, tags: release.tags ?? [], tropes: release.tropes ?? [], durationMinutes: release.durationMinutes ?? 0, audioUrl: release.audioUrl ?? null, artworkUrl: release.artworkUrl ?? null, releaseDate: release.releaseDate ?? release.createdAt ?? null }));
    return send({ creator: { userId: creator.userId, name: profile.displayName ?? creator.name, handle: profile.handle ?? null, headline: profile.headline ?? null, bio: profile.bio ?? null, pronouns: profile.pronouns ?? null, initials: profile.avatarInitials ?? null, favouriteTags: profile.favouriteTags ?? [], releases } });
  }

  if (path === '/api/writers' && method === 'GET') {
    requireUser(state);
    const writers = state.users.filter((account) => account.role === 'writer' && account.status !== 'pending_review').map((account) => {
      const profile = ensureProfile(state, account);
      if (profile.publicProfile === false) return null;
      return {
        userId: account.userId,
        name: profile.displayName ?? account.name,
        handle: profile.handle ?? null,
        headline: profile.headline ?? null,
        bio: profile.bio ?? null,
        initials: profile.avatarInitials ?? null,
        pronouns: profile.pronouns ?? null,
        roleFocus: profile.roleFocus ?? [],
        publishedWorkCount: state.scripts.filter((script) => script.writerUserId === account.userId && ['Approved', 'Published'].includes(String(script.status))).length,
      };
    }).filter(Boolean);
    return send({ writers });
  }

  if (parts[0] === 'api' && parts[1] === 'listening' && parts[2] === 'resume' && parts.length === 4 && method === 'GET') {
    const account = requireUser(state);
    const releaseId = parts[3];
    const events = state.listening.filter((event) => event.userId === account.userId && event.releaseId === releaseId).sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')));
    const latest = events[0];
    const duration = events.find((event) => typeof event.durationSeconds !== 'undefined')?.durationSeconds ?? 0;
    const position = latest?.eventType === 'complete' ? 0 : events.find((event) => typeof event.positionSeconds !== 'undefined')?.positionSeconds ?? 0;
    return send({ releaseId, positionSeconds: Math.max(0, Number(position)), durationSeconds: Math.max(0, Number(duration)) });
  }

  if (path === '/api/creators' && method === 'GET') {
    const creators = state.users.filter((account) => account.role === 'creator' && account.status !== 'pending_review').map((account) => {
      const profile = ensureProfile(state, account);
      return { userId: account.userId, displayName: profile.displayName ?? account.name, handle: profile.handle ?? null, headline: profile.headline ?? null, bio: profile.bio ?? null, avatarInitials: profile.avatarInitials ?? null, avatarTone: profile.avatarTone ?? 'plum', releaseCount: state.releases.filter((release) => release.creatorUserId === account.userId && release.status === 'released').length };
    });
    return send({ creators });
  }

  if (path === '/api/spotlights' && method === 'GET') return send({ date: new Date().toISOString().slice(0, 10), spotlights: state.spotlights });

  if (path.startsWith('/api/recommendations') && method === 'GET') {
    const account = requireUser(state);
    const profile = ensureProfile(state, account);
    const liked = new Map<string, number>();
    const suppressed = new Set<string>();
    const add = (value: unknown, amount: number) => { const key = String(value ?? '').trim().toLowerCase(); if (key) liked.set(key, (liked.get(key) ?? 0) + amount); };
    for (const tag of [...(profile.favouriteTags ?? []), ...(profile.favouriteTropes ?? []), ...(profile.favouriteCategories ?? [])]) add(tag, 5);
    for (const event of state.taste[account.userId] ?? []) {
      if (event.type === 'declared_preferences') continue;
      const factor = event.type === 'recommendation_more' ? 4 : event.type === 'complete' ? 3 : event.type === 'replay' ? 2 : event.type === 'start' ? 0.5 : event.type === 'skip' || event.type === 'hide' || event.type === 'recommendation_less' ? -2 : 0;
      if (event.type === 'recommendation_not_for_me' && event.contentId) suppressed.add(String(event.contentId));
      if (!factor) continue;
      for (const tag of [...(event.tags ?? []), ...(event.category ? [event.category] : []), ...(event.genre ? [event.genre] : []), ...(event.mood ? [event.mood] : [])]) add(tag, factor);
    }
    const intent = q.get('intent') ?? '';
    const following = new Set(state.follows[account.userId] ?? []);
    const candidates = state.releases.filter((release) => release.status === 'released' && !suppressed.has(String(release.id))).map((release) => {
      const values = [release.category, release.genre, release.mood, ...(release.tags ?? []), ...(release.tropes ?? [])].filter(Boolean).map(String);
      let score = 0;
      values.forEach((value) => { score += liked.get(value.toLowerCase()) ?? 0; });
      if (release.creatorUserId && following.has(release.creatorUserId)) score += 8;
      if (intent && values.some((value) => value.toLowerCase().includes(intent.toLowerCase()))) score += 4;
      const matches = values.filter((value) => (liked.get(value.toLowerCase()) ?? 0) > 0).slice(0, 3);
      return { ...release, score, reason: matches.length ? 'Because you explicitly expressed interest in ' + matches.join(', ') + '.' : following.has(release.creatorUserId) ? 'From a creator you follow.' : 'A release matching your current discovery context.' };
    }).sort((a, b) => b.score - a.score);
    const recommendations: any[] = [];
    const creatorCounts = new Map<string, number>();
    for (const release of candidates) {
      const creatorId = String(release.creatorUserId ?? 'unknown');
      const count = creatorCounts.get(creatorId) ?? 0;
      if (count >= 2) continue;
      recommendations.push(release);
      creatorCounts.set(creatorId, count + 1);
      if (recommendations.length >= 24) break;
    }
    if (recommendations.length < 24) {
      for (const release of candidates) {
        if (recommendations.some((item) => item.id === release.id)) continue;
        recommendations.push(release);
        if (recommendations.length >= 24) break;
      }
    }
    return send({ recommendations, model: { declaredWeight: 5, observedWeight: 3, socialWeight: 8, intentWeight: 4, creatorDiversityCap: 2 } });
  }

  if (path === '/api/taste/feedback' && method === 'POST') {
    const account = requireUser(state);
    const feedback = String(input.feedback ?? '');
    const releaseId = String(input.releaseId ?? '');
    if (!['more_like_this', 'less_like_this', 'not_for_me'].includes(feedback) || !releaseId) throw new Error('Valid recommendation feedback and release are required.');
    const release = state.releases.find((item) => String(item.id) === releaseId && item.status === 'released');
    if (!release) throw new Error('Release not found.');
    const type = feedback === 'more_like_this' ? 'recommendation_more' : feedback === 'less_like_this' ? 'recommendation_less' : 'recommendation_not_for_me';
    state.taste[account.userId] = [...(state.taste[account.userId] ?? []), { type, contentId: releaseId, category: release.category ?? null, genre: release.genre ?? null, mood: release.mood ?? null, tags: release.tags ?? [], tropes: release.tropes ?? [], createdAt: now() }];
    return send({ recorded: true, feedback });
  }

  if (path === '/api/trending' && method === 'GET') {
    const counts: Record<string, number> = {};
    state.listening.forEach((event) => { counts[event.releaseId] = (counts[event.releaseId] ?? 0) + 1; });
    const trending = state.releases.filter((release) => release.status === 'released').map((release) => ({ ...release, listeningEvents: counts[release.id] ?? 0 })).sort((a, b) => b.listeningEvents - a.listeningEvents).slice(0, 24);
    return send({ trending });
  }

  if (parts[0] === 'api' && parts[1] === 'favourites') {
    const account = requireUser(state);
    const list = state.favourites[account.userId] ?? [];
    if (parts.length === 2 && method === 'GET') return send({ favourites: list.map((releaseId) => ({ releaseId })) });
    if (parts.length === 3) {
      const releaseId = parts[2];
      if (method === 'POST' && !list.includes(releaseId)) list.push(releaseId);
      if (method === 'DELETE') state.favourites[account.userId] = list.filter((item) => item !== releaseId);
      else state.favourites[account.userId] = list;
      return send({ favourite: method === 'POST' });
    }
  }

  if (parts[0] === 'api' && parts[1] === 'follows' && parts[2] === 'creators') {
    const account = requireUser(state);
    const list = state.follows[account.userId] ?? [];
    if (parts.length === 3 && method === 'GET') return send({ follows: list.map((creatorUserId) => ({ creatorUserId })) });
    if (parts.length === 4) {
      const creatorId = parts[3];
      if (method === 'POST' && !list.includes(creatorId)) list.push(creatorId);
      if (method === 'DELETE') state.follows[account.userId] = list.filter((item) => item !== creatorId);
      else state.follows[account.userId] = list;
      return send({ following: method === 'POST' });
    }
  }

  if (path === '/api/listening/event' && method === 'POST') {
    const account = requireUser(state);
    const releaseId = String(input.releaseId ?? '');
    const release = state.releases.find((item) => String(item.id) === releaseId && item.status === 'released');
    if (!releaseId || !release) throw new Error('Release not found.');
    const type = String(input.eventType ?? '');
    if (!['start','pause','seek','progress','complete','replay','skip'].includes(type)) throw new Error('Unsupported listening event.');
    const record = { ...input, id: id('listen'), releaseId, eventType: type, userId: account.userId, createdAt: now() };
    state.listening.push(record);
    if (['start','complete','replay','skip'].includes(type)) state.taste[account.userId] = [...(state.taste[account.userId] ?? []), { type, contentId: releaseId, category: release.category ?? null, genre: release.genre ?? null, mood: release.mood ?? null, tags: release.tags ?? [], tropes: release.tropes ?? [], completed: type === 'complete', createdAt: record.createdAt }];
    return send({ recorded: true });
  }

  if (path === '/api/notifications' && method === 'GET') {
    const account = requireUser(state);
    const list = (state.notifications[account.userId] ?? []).slice().sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')));
    return send({ notifications: list.slice(0, 30), unreadCount: list.filter((item) => item.read !== true).length });
  }

  if (parts[0] === 'api' && parts[1] === 'notifications' && parts.length === 4 && parts[3] === 'read' && method === 'POST') {
    const account = requireUser(state);
    const list = state.notifications[account.userId] ?? [];
    const item = list.find((candidate) => candidate.id === parts[2]);
    if (!item) throw new Error('Notification not found.');
    item.read = true;
    item.readAt = now();
    return send({ read: true });
  }

  if (path === '/api/listening/history' && method === 'GET') {
    const account = requireUser(state);
    return send({ history: state.listening.filter((event) => event.userId === account.userId).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 100) });
  }

  if (parts[0] === 'api' && parts[1] === 'creator' && parts[2] === 'assets' && method === 'POST') {
    const account = requireUser(state);
    if (account.role !== 'creator') throw new Error('Active Creator access required.');
    const releaseId = String(input.releaseId ?? '');
    const kind = String(input.kind ?? '');
    const release = state.releases.find((item) => item.id === releaseId && item.creatorUserId === account.userId);
    if (!release) throw new Error('Release not found.');
    if (!['audio', 'artwork'].includes(kind)) throw new Error('Unsupported asset kind.');
    const dataUrl = typeof input.dataUrl === 'string' ? input.dataUrl : '';
    if (!dataUrl.startsWith('data:') || !dataUrl.includes(',')) throw new Error('Invalid uploaded file.');
    const field = kind === 'audio' ? 'audioUrl' : 'artworkUrl';
    release[field] = dataUrl;
    release.updatedAt = now();
    if (kind === 'audio') {
      const minutes = Number(input.durationMinutes ?? 0);
      if (minutes > 0) release.durationMinutes = minutes;
    }
    return send({ url: dataUrl, path: 'local/' + account.userId + '/' + kind + '/' + releaseId, release });
  }

  if (path === '/api/creator/dashboard' && method === 'GET') {
    const account = requireUser(state);
    if (!['creator', 'admin'].includes(account.role ?? '')) throw new Error('Creator access required.');
    const mine = state.releases.filter((release) => release.creatorUserId === account.userId);
    const events = state.listening.filter((event) => mine.some((release) => release.id === event.releaseId));
    const listeningSeconds = events.reduce((sum, event) => sum + Math.min(Number(event.positionSeconds ?? 0), Number(event.durationSeconds ?? 0)), 0);
    return send({ releases: mine, metrics: { released: mine.filter((release) => release.status === 'released').length, drafts: mine.filter((release) => release.status !== 'released').length, verifiedListeningMinutes: Math.round((listeningSeconds / 60) * 10) / 10, uniqueListeners: new Set(events.map((event) => event.userId)).size } });
  }

  if (path === '/api/creator/releases' && method === 'GET') {
    const account = requireUser(state);
    if (!['creator', 'admin'].includes(account.role ?? '')) throw new Error('Creator access required.');
    return send({ releases: state.releases.filter((release) => release.creatorUserId === account.userId) });
  }

  if (path === '/api/creator/releases' && method === 'POST') {
    const account = requireUser(state);
    if (account.role !== 'creator') throw new Error('Active Creator access required.');
    const release = { ...input, id: id('release'), creatorUserId: account.userId, creatorName: ensureProfile(state, account).displayName ?? account.name, status: 'draft', version: 1, createdAt: now(), updatedAt: now() };
    release.tags = Array.isArray(release.tags) ? release.tags : [];
    release.tropes = Array.isArray(release.tropes) ? release.tropes : [];
    state.releases.push(release);
    return send({ release });
  }

  if (parts[0] === 'api' && parts[1] === 'creator' && parts[2] === 'releases' && parts.length === 4) {
    const account = requireUser(state);
    if (account.role !== 'creator') throw new Error('Active Creator access required.');
    const release = state.releases.find((item) => item.id === parts[3] && item.creatorUserId === account.userId);
    if (!release) throw new Error('Release not found.');
    if (method === 'PUT') {
      Object.assign(release, input, { id: release.id, creatorUserId: release.creatorUserId, updatedAt: now() });
      return send({ release });
    }
    if (method === 'DELETE') {
      state.releases = state.releases.filter((item) => item.id !== release.id);
      return send({ deleted: true });
    }
  }

  if (parts[0] === 'api' && parts[1] === 'creator' && parts[2] === 'releases' && parts.length === 5 && parts[4] === 'publish' && method === 'POST') {
    const account = requireUser(state);
    if (account.role !== 'creator') throw new Error('Active Creator access required.');
    const release = state.releases.find((item) => item.id === parts[3] && item.creatorUserId === account.userId);
    if (!release) throw new Error('Release not found.');
    if (!release.audioUrl) throw new Error('An audio URL is required before submitting.');
    if (!release.title || !release.description || !release.category) throw new Error('Complete the release title, description and category before submitting.');
    if (release.status === 'pending_review' || release.status === 'released') return send({ release });
    release.status = 'pending_review';
    release.submittedAt = now();
    release.moderationNote = null;
    release.updatedAt = now();
    return send({ release });
  }

  if (path === '/api/writer/scripts' && method === 'GET') {
    const account = requireUser(state);
    if (account.role !== 'writer' && account.role !== 'admin') throw new Error('Writer access required.');
    return send({ scripts: state.scripts.filter((script) => script.writerUserId === account.userId) });
  }

  if (path === '/api/writer/scripts' && method === 'POST') {
    const account = requireUser(state);
    if (account.role !== 'writer') throw new Error('Active Writer access required.');
    const script = { id: id('script'), title: String(input.title ?? 'Untitled manuscript'), content: String(input.content ?? ''), status: 'Draft', access: 'Private', version: 1, writerUserId: account.userId, createdAt: now(), updatedAt: now() };
    state.scripts.push(script);
    return send({ script });
  }

  if (parts[0] === 'api' && parts[1] === 'writer' && parts[2] === 'scripts' && parts.length === 4) {
    const account = requireUser(state);
    if (account.role !== 'writer') throw new Error('Active Writer access required.');
    const script = state.scripts.find((item) => item.id === parts[3] && item.writerUserId === account.userId);
    if (!script) throw new Error('Script not found.');
    if (method === 'PUT') {
      Object.assign(script, input, { id: script.id, writerUserId: script.writerUserId, updatedAt: now() });
      return send({ script });
    }
  }

  if (parts[0] === 'api' && parts[1] === 'writer' && parts[2] === 'scripts' && parts.length === 5 && parts[4] === 'versions' && method === 'POST') {
    const account = requireUser(state);
    const script = state.scripts.find((item) => item.id === parts[3] && item.writerUserId === account.userId);
    if (!script) throw new Error('Script not found.');
    const version = Number(script.version ?? 1) + 1;
    state.scriptVersions[script.id] = [...(state.scriptVersions[script.id] ?? []), { scriptId: script.id, version, content: script.content ?? '', createdAt: now() }];
    script.version = version;
    script.updatedAt = now();
    return send({ script, version });
  }

  if (parts[0] === 'api' && parts[1] === 'writer' && parts[2] === 'scripts' && parts.length === 5 && parts[4] === 'submit' && method === 'POST') {
    const account = requireUser(state);
    const script = state.scripts.find((item) => item.id === parts[3] && item.writerUserId === account.userId);
    if (!script) throw new Error('Script not found.');
    script.status = 'Submitted';
    script.submittedAt = now();
    script.updatedAt = now();
    return send({ script });
  }

  if (path === '/api/editor/queue' && method === 'GET') {
    const account = requireUser(state);
    if (account.role !== 'editor' && account.role !== 'admin') throw new Error('Editor access required.');
    const assignments = state.scripts.filter((script) => ['Submitted', 'Under review', 'Revision requested'].includes(script.status));
    return send({ queue: account.role === 'admin' ? assignments : assignments.filter((script) => script.editorUserId === account.userId) });
  }

  if (path === '/api/editor/accounts' && method === 'GET') {
    requireAdmin(state);
    return send({ editors: state.users.filter((account) => account.role === 'editor' && account.status === 'active').map((account) => ({ userId: account.userId, email: account.email, name: account.name })) });
  }

  if (parts[0] === 'api' && parts[1] === 'editor' && parts[2] === 'scripts' && parts.length === 4 && method === 'POST') {
    const account = requireUser(state);
    if (account.role !== 'editor') throw new Error('Active Editor access required.');
    const script = state.scripts.find((item) => item.id === parts[3] && item.editorUserId === account.userId);
    if (!script) throw new Error('This manuscript is not assigned to you.');
    const status = String(input.status ?? '');
    if (!['Under review', 'Revision requested', 'Approved', 'Rejected'].includes(status)) throw new Error('Invalid editorial state.');
    Object.assign(script, { status, lastEditorialComment: String(input.comment ?? ''), updatedAt: now() });
    return send({ script });
  }

  if (path === '/api/scripts/catalogue' && method === 'GET') {
    const account = requireUser(state);
    if (!['creator', 'writer', 'editor', 'admin'].includes(account.role ?? '')) throw new Error('Protected script access required.');
    const scripts = state.scripts.filter((script) => script.writerUserId === account.userId || script.status !== 'Draft').map(({ id: scriptId, title, status, version, writerUserId }) => ({ id: scriptId, title, status, version, writerUserId }));
    return send({ scripts });
  }

  if (parts[0] === 'api' && parts[1] === 'scripts' && parts.length === 3 && method === 'GET') {
    const account = requireUser(state);
    const script = state.scripts.find((item) => item.id === parts[2]);
    if (!script) throw new Error('Script not found.');
    const permitted = script.writerUserId === account.userId || script.accessUsers?.includes(account.userId);
    if (!permitted) throw new Error('You do not have an active access grant for this manuscript.');
    const session = { sessionId: id('reader'), expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(), status: 'active' };
    state.readerSessions[account.userId] = [...(state.readerSessions[account.userId] ?? []), { ...session, scriptId: script.id }];
    return send({ script, readerSession: session, copyAllowed: false, exportAllowed: false, canReadFull: true });
  }

  if (parts[0] === 'api' && parts[1] === 'scripts' && parts.length === 4 && parts[3] === 'request-access' && method === 'POST') {
    const account = requireUser(state);
    const script = state.scripts.find((item) => item.id === parts[2]);
    if (!script) throw new Error('Script not found.');
    script.accessRequests = Array.isArray(script.accessRequests) ? script.accessRequests : [];
    script.accessRequests.push({ userId: account.userId, createdAt: now() });
    return send({ requested: true });
  }

  if (parts[0] === 'api' && parts[1] === 'scripts' && parts.length === 4 && parts[3] === 'permissions' && method === 'POST') {
    const account = requireUser(state);
    if (account.role !== 'writer') throw new Error('Writer access required.');
    const script = state.scripts.find((item) => item.id === parts[2] && item.writerUserId === account.userId);
    if (!script) throw new Error('Script not found.');
    const users = Array.isArray(input.userIds) ? input.userIds.map(String) : [];
    script.accessUsers = users;
    script.copyAllowed = Boolean(input.copyAllowed);
    script.exportAllowed = Boolean(input.exportAllowed);
    return send({ script });
  }

  if (path === '/api/profile/me' && method === 'GET') {
    const account = requireUser(state);
    return send({ profile: ensureProfile(state, account) });
  }

  if (path === '/api/profile/me' && method === 'PUT') {
    const account = requireUser(state);
    const profile = ensureProfile(state, account);
    const nextHandle = String(input.handle ?? profile.handle ?? '').replace(/^@+/, '').trim().toLowerCase();
    if (!/^[a-z0-9_-]{3,30}$/.test(nextHandle)) throw new Error('Handle must be 3–30 characters and use letters, numbers, underscores or hyphens.');
    const taken = Object.entries(state.profiles).some(([userId, candidate]) => userId !== account.userId && String((candidate as any).handle ?? '').toLowerCase() === nextHandle);
    if (taken) throw new Error('That @handle is already in use.');
    Object.assign(profile, input, { handle: nextHandle, updatedAt: now() });
    return send({ profile });
  }

  if (parts[0] === 'api' && parts[1] === 'profile' && parts.length === 3 && method === 'GET') {
    const handle = parts[2].replace(/^@/, '').toLowerCase();
    const found = Object.entries(state.profiles).find(([, profile]) => String((profile as any).handle ?? '').toLowerCase() === handle);
    if (!found) throw new Error('Profile not found.');
    const account = state.users.find((item) => item.userId === found[0]);
    return send({ profile: account ? ensureProfile(state, account) : null });
  }

  if (path === '/api/taste/profile' && method === 'GET') {
    const account = requireUser(state);
    const profile = ensureProfile(state, account);
    const events = state.taste[account.userId] ?? [];
    const weights: Record<string, number> = {};
    const add = (value: unknown, amount: number) => { const key = String(value ?? '').trim().toLowerCase(); if (key) weights[key] = (weights[key] ?? 0) + amount; };
    for (const value of [...(profile.favouriteTags ?? []), ...(profile.favouriteTropes ?? []), ...(profile.favouriteCategories ?? [])]) add(value, 5);
    events.forEach((event) => {
      if (event.type === 'declared_preferences') return;
      const factor = event.type === 'recommendation_more' ? 4 : event.type === 'complete' ? 3 : event.type === 'replay' ? 2 : event.type === 'start' ? 0.5 : event.type === 'skip' || event.type === 'hide' || event.type === 'recommendation_less' ? -2 : 0;
      if (!factor) return;
      [...(event.tags ?? []), ...(event.category ? [event.category] : []), ...(event.genre ? [event.genre] : []), ...(event.mood ? [event.mood] : [])].forEach((value) => add(value, factor));
    });
    const vector = Object.entries(weights).map(([label, weight]) => ({ label, weight: Number(weight.toFixed(2)) })).sort((a, b) => Number(b.weight) - Number(a.weight)).slice(0, 24);
    return send({ vector });
  }

  if (path === '/api/taste/event' && method === 'POST') {
    const account = requireUser(state);
    state.taste[account.userId] = [...(state.taste[account.userId] ?? []), { ...input, createdAt: now() }];
    return send({ recorded: true });
  }

  if (path === '/api/protection/evidence' && method === 'GET') {
    const account = requireUser(state);
    return send({ evidence: state.evidence.filter((item) => item.userId === account.userId) });
  }

  if (path === '/api/protection/reports' && method === 'GET') {
    const account = requireUser(state);
    return send({ reports: state.reports.filter((item) => item.userId === account.userId) });
  }

  if (path === '/api/protection/report' && method === 'POST') {
    const account = requireUser(state);
    const report = { id: id('report'), caseId: 'NJ-' + String(new Date().getFullYear()) + '-' + String(state.reports.length + 1).padStart(6, '0'), userId: account.userId, ...input, status: 'New', createdAt: now() };
    state.reports.push(report);
    return send({ report });
  }

  if (path === '/api/protection/event' && method === 'POST') {
    const account = requireUser(state);
    state.evidence.push({ id: id('evidence'), userId: account.userId, ...input, createdAt: now() });
    return send({ recorded: true });
  }

  if (path === '/api/security/reader-session' && method === 'POST') {
    const account = requireUser(state);
    const session = { sessionId: id('reader'), scriptId: input.scriptId ?? null, status: 'active', expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(), createdAt: now() };
    state.readerSessions[account.userId] = [...(state.readerSessions[account.userId] ?? []), session];
    return send({ session });
  }

  if (path === '/api/admin/release-queue' && method === 'GET') {
    requireAdmin(state);
    return send({ releases: state.releases.filter((release) => release.status === 'pending_review').slice(0, 100) });
  }

  if (parts[0] === 'api' && parts[1] === 'admin' && parts[2] === 'releases' && parts.length === 5 && parts[4] === 'moderate' && method === 'POST') {
    const admin = requireAdmin(state);
    const release = state.releases.find((item) => item.id === parts[3]);
    if (!release) throw new Error('Release not found.');
    const decision = String(input.decision ?? '');
    if (!['approved', 'changes', 'rejected'].includes(decision)) throw new Error('Invalid moderation decision.');
    const note = String(input.note ?? '').trim();
    release.status = decision === 'approved' ? 'released' : decision === 'changes' ? 'draft' : 'rejected';
    release.moderationNote = note || null;
    release.moderatedAt = now();
    release.moderatedBy = admin.userId;
    release.releaseDate = decision === 'approved' ? now() : release.releaseDate ?? null;
    release.updatedAt = now();
    if (release.creatorUserId) addLocalNotification(state, release.creatorUserId, {
      type: 'content',
      subtype: 'release',
      title: decision === 'approved' ? 'Your release is live on Nightjar' : decision === 'changes' ? 'Changes requested for your release' : 'Your release was not approved',
      message: decision === 'approved' ? 'Your release has passed Nightjar moderation and is now available to age-verified listeners.' : decision === 'changes' ? 'Nightjar moderation has requested changes before this release can be published.' : 'Your release was not approved for publication. Open Creator Studio to review the moderation note.',
      releaseId: release.id,
      moderationNote: release.moderationNote,
    });
    return send({ release });
  }

  if (path === '/api/admin/scripts' && method === 'GET') {
    requireAdmin(state);
    return send({ scripts: state.scripts.map((script) => ({ id: script.id, title: script.title, status: script.status, version: script.version, writerUserId: script.writerUserId, editorUserId: script.editorUserId ?? null, updatedAt: script.updatedAt ?? null })) });
  }

  if (path === '/api/editor/accounts' && method === 'GET') {
    requireAdmin(state);
    return send({ editors: state.users.filter((account) => account.role === 'editor' && account.status === 'active').map((account) => ({ userId: account.userId, email: account.email, name: account.name })) });
  }

  if (parts[0] === 'api' && parts[1] === 'admin' && parts[2] === 'scripts' && parts.length === 4 && parts[3] && method === 'POST' && parts[2] === 'scripts') {
    requireAdmin(state);
    const scriptId = parts[3];
    const editorUserId = String(input.editorUserId ?? '').trim();
    if (!editorUserId) throw new Error('Editor account is required.');
    const editor = state.users.find((account) => account.userId === editorUserId && account.role === 'editor' && account.status === 'active');
    if (!editor) throw new Error('The selected account is not an active Editor.');
    const script = state.scripts.find((item) => item.id === scriptId);
    if (!script) throw new Error('Script not found.');
    script.editorUserId = editorUserId;
    script.updatedAt = now();
    return send({ script });
  }

  if (path === '/api/admin/overview' && method === 'GET') {
    requireAdmin(state);
    const counts = { listener: state.users.filter((item) => item.role === 'listener').length, creator: state.users.filter((item) => item.role === 'creator').length, writer: state.users.filter((item) => item.role === 'writer').length, editor: state.users.filter((item) => item.role === 'editor').length, admin: ADMIN_EMAILS.length };
    return send({ people: { counts, accounts: state.users.map((account) => ({ userId: account.userId, name: account.name, email: account.email, role: account.role, status: account.status })), administrators: ADMIN_EMAILS.map((email) => ({ email, name: email.split('@')[0], role: 'admin', status: 'active' })) }, subscriptions: { active: state.subscriptions.filter((item) => item.status === 'active').length, trialing: state.subscriptions.filter((item) => item.status === 'trialing').length, pastDue: state.subscriptions.filter((item) => item.status === 'past_due').length } });
  }

  if (path === '/api/admin/creator-applications' && method === 'GET') {
    requireAdmin(state);
    return send({ applications: state.applications });
  }

  if (path === '/api/admin/subscriptions' && method === 'GET') {
    requireAdmin(state);
    return send({ subscriptions: state.subscriptions });
  }

  if (parts[0] === 'api' && parts[1] === 'admin' && parts[2] === 'creator-applications' && parts.length === 5 && parts[4] === 'decision' && method === 'POST') {
    requireAdmin(state);
    const application = state.applications.find((item) => item.id === parts[3]);
    if (!application) throw new Error('Application not found.');
    const decision = String(input.decision ?? '');
    application.status = decision;
    const userRecord = state.users.find((item) => item.userId === application.userId);
    if (decision === 'approved' && userRecord) userRecord.status = 'active';
    return send({ application });
  }

  if (path === '/api/admin/security-alerts' && method === 'GET') {
    requireAdmin(state);
    return send({ alerts: state.securityAlerts });
  }

  if (parts[0] === 'api' && parts[1] === 'admin' && parts[2] === 'security-alerts' && parts.length === 5 && parts[4] === 'suspend' && method === 'POST') {
    requireAdmin(state);
    const alert = state.securityAlerts.find((item) => item.id === parts[3]);
    if (!alert) throw new Error('Alert not found.');
    const account = state.users.find((item) => item.userId === alert.userId);
    if (account) account.status = 'suspended';
    return send({ suspended: true });
  }

  if (path === '/api/admin/branding/logo' && method === 'POST') {
    requireAdmin(state);
    state.brandingUrl = typeof input.dataUrl === 'string' ? input.dataUrl : null;
    return send({ logoUrl: state.brandingUrl });
  }

  if (path === '/api/_healthcheck' && method === 'GET') return send({ message: 'Success' });

  throw new Error('Local Nightjar API route not implemented: ' + method + ' ' + path);
}

export const api = {
  get: <T = unknown>(path: string): Promise<Response<T>> => request(path, 'GET'),
  post: <T = unknown>(path: string, body?: unknown): Promise<Response<T>> => request(path, 'POST', body),
  put: <T = unknown>(path: string, body?: unknown): Promise<Response<T>> => request(path, 'PUT', body),
  delete: <T = unknown>(path: string): Promise<Response<T>> => request(path, 'DELETE'),
};

export const auth = {
  isSignedIn: (): boolean => Boolean(typeof window !== 'undefined' && window.localStorage.getItem(SESSION_KEY)),
  getUser: async (): Promise<LocalUser | null> => currentUser(loadState()),
  signIn: async (options?: { email?: string }): Promise<{ user: LocalUser }> => {
    const state = loadState();
    let email = cleanEmail(options?.email);
    if (!email && typeof window !== 'undefined') email = cleanEmail(window.prompt('Nightjar email address') ?? '');
    if (!email || !email.includes('@')) throw new Error('A valid email address is required.');
    let user = state.users.find((candidate) => candidate.email === email);
    if (!user) {
      const admin = isAdminEmail(email);
      user = {
        userId: id('user'),
        email,
        name: admin ? email.split('@')[0] : email.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()),
        role: admin ? 'admin' : null,
        status: 'active',
        createdAt: now(),
      };
      state.users.push(user);
      ensureProfile(state, user);
    }
    if (typeof window !== 'undefined') window.localStorage.setItem(SESSION_KEY, user.userId);
    saveState(state);
    return { user };
  },
  signOut: async (): Promise<void> => {
    if (typeof window !== 'undefined') window.localStorage.removeItem(SESSION_KEY);
  },
};