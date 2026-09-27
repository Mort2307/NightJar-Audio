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
  moderationHistory: any[];
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
  moderationHistory: [],
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

function requireVerifiedAdult(state: LocalState, account: LocalUser) {
  if (state.age[account.userId]?.verified !== true) throw new Error('Age verification required.');
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

function tasteSignalWeight(type: unknown, completed = false) {
  const signal = String(type ?? '');
  if (signal === 'not_for_me') return -12;
  if (signal === 'hide') return -10;
  if (signal === 'less_like_this') return -5;
  if (signal === 'more_like_this') return 4;
  if (signal === 'complete' || completed) return 2;
  if (signal === 'skip') return -1;
  if (signal === 'save' || signal === 'follow' || signal === 'replay') return 1;
  return 0.5;
}

function diversifyReleases(items: any[], limit = 24, maxPerCreator = 3) {
  const selected: any[] = [];
  const selectedIds = new Set<string>();
  const creatorCounts: Record<string, number> = {};
  for (let pass = 1; pass <= maxPerCreator && selected.length < limit; pass += 1) {
    for (const item of items) {
      if (selected.length >= limit) break;
      const releaseId = String(item.id ?? '');
      const creatorId = String(item.creatorUserId ?? 'unknown');
      if (!releaseId || selectedIds.has(releaseId) || (creatorCounts[creatorId] ?? 0) >= pass) continue;
      selected.push(item);
      selectedIds.add(releaseId);
      creatorCounts[creatorId] = (creatorCounts[creatorId] ?? 0) + 1;
    }
  }
  if (selected.length < limit) {
    for (const item of items) {
      if (selected.length >= limit) break;
      const releaseId = String(item.id ?? '');
      if (!releaseId || selectedIds.has(releaseId)) continue;
      selected.push(item);
      selectedIds.add(releaseId);
    }
  }
  return selected;
}

function verifiedListeningSeconds(events: any[]) {
  const sessions = new Map<string, any[]>();
  for (const event of events) {
    const userId = String(event.userId ?? '');
    const releaseId = String(event.releaseId ?? '');
    const createdAt = String(event.createdAt ?? '');
    const legacyHour = createdAt.slice(0, 13);
    const key = String(event.sessionId ?? '') || [userId, releaseId, legacyHour].join(':');
    if (!sessions.has(key)) sessions.set(key, []);
    sessions.get(key)!.push(event);
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

  if (parts[0] === 'api' && parts[1] === 'catalogue' && parts.length === 2 && method === 'GET') {
    const account = requireUser(state);
    requireVerifiedAdult(state, account);
    const query = String(q.get('q') ?? '').trim().toLowerCase();
    const category = String(q.get('category') ?? '').trim().toLowerCase();
    const released = state.releases.filter((release) => release.status === 'released');
    const categories = Array.from(new Set(released.map((release) => String(release.category ?? '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
    const catalogue = released
      .filter((release) => !category || String(release.category ?? '').toLowerCase() === category)
      .filter((release) => !query || [release.title, release.description, release.category, release.genre, release.mood, ...(release.tags ?? []), ...(release.tropes ?? [])].join(' ').toLowerCase().includes(query))
      .map((release) => ({
        ...release,
        creatorName: state.profiles[release.creatorUserId]?.displayName ?? release.creatorName,
        creatorHandle: state.profiles[release.creatorUserId]?.handle ?? release.creatorHandle,
      }));
    return send({ catalogue, categories });
  }

  if (parts[0] === 'api' && parts[1] === 'creators' && parts.length === 3 && method === 'GET') {
    const account = requireUser(state);
    requireVerifiedAdult(state, account);
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
    const account = requireUser(state);
    requireVerifiedAdult(state, account);
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
    requireVerifiedAdult(state, account);
    const releaseId = parts[3];
    const events = state.listening.filter((event) => event.userId === account.userId && event.releaseId === releaseId).sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')));
    const latest = events[0];
    const duration = events.find((event) => typeof event.durationSeconds !== 'undefined')?.durationSeconds ?? 0;
    const position = latest?.eventType === 'complete' ? 0 : events.find((event) => typeof event.positionSeconds !== 'undefined')?.positionSeconds ?? 0;
    return send({ releaseId, positionSeconds: Math.max(0, Number(position)), durationSeconds: Math.max(0, Number(duration)) });
  }

  if (path === '/api/creators' && method === 'GET') {
    const account = requireUser(state);
    requireVerifiedAdult(state, account);
    const creators = state.users.filter((account) => account.role === 'creator' && account.status !== 'pending_review').map((account) => {
      const profile = ensureProfile(state, account);
      if (profile.publicProfile === false) return null;
      return { userId: account.userId, displayName: profile.displayName ?? account.name, handle: profile.handle ?? null, headline: profile.headline ?? null, bio: profile.bio ?? null, avatarInitials: profile.avatarInitials ?? null, avatarTone: profile.avatarTone ?? 'plum', followerCount: Object.values(state.follows).filter((items) => items.includes(account.userId)).length, releaseCount: state.releases.filter((release) => release.creatorUserId === account.userId && release.status === 'released').length };
    }).filter(Boolean);
    return send({ creators });
  }

  if (path === '/api/spotlights' && method === 'GET') {
    const account = requireUser(state);
    requireVerifiedAdult(state, account);
    return send({ date: new Date().toISOString().slice(0, 10), spotlights: state.spotlights });
  }

  if (path.startsWith('/api/recommendations') && method === 'GET') {
    const account = requireUser(state);
    requireVerifiedAdult(state, account);
    const profile = ensureProfile(state, account);
    const liked = new Map<string, number>();
    for (const tag of [...(profile.favouriteTags ?? []), ...(profile.favouriteTropes ?? []), ...(profile.favouriteCategories ?? [])]) {
      const key = String(tag).toLowerCase();
      liked.set(key, (liked.get(key) ?? 0) + 5);
    }
    for (const event of state.taste[account.userId] ?? []) {
      const factor = tasteSignalWeight(event.type, event.completed === true);
      for (const tag of [...(event.tags ?? []), ...(event.category ? [event.category] : [])]) {
        const key = String(tag).toLowerCase();
        liked.set(key, (liked.get(key) ?? 0) + factor);
      }
    }
    const intent = q.get('intent') ?? '';
    const following = new Set(state.follows[account.userId] ?? []);
    const ranked = state.releases.filter((release) => release.status === 'released').map((release) => {
      const values = [release.category, release.genre, release.mood, ...(release.tags ?? []), ...(release.tropes ?? [])].filter(Boolean).map(String);
      let score = 0;
      values.forEach((value) => { score += liked.get(value.toLowerCase()) ?? 0; });
      if (release.creatorUserId && following.has(release.creatorUserId)) score += 8;
      if (intent && values.some((value) => value.toLowerCase().includes(intent.toLowerCase()))) score += 4;
      const matches = values.filter((value) => (liked.get(value.toLowerCase()) ?? 0) > 0).slice(0, 3);
      return { ...release, score, reason: matches.length ? 'Because you chose ' + matches.join(', ') + '.' : following.has(release.creatorUserId) ? 'From a creator you follow.' : 'A new release for your current discovery context.' };
    }).sort((a, b) => b.score - a.score);
    const recommendations = diversifyReleases(ranked, 24, 3);
    return send({ recommendations, model: { declaredWeight: 5, socialWeight: 8, intentWeight: 4, maxInitialReleasesPerCreator: 3 } });
  }

  if (path === '/api/trending' && method === 'GET') {
    const account = requireUser(state);
    requireVerifiedAdult(state, account);
    const counts: Record<string, number> = {};
    state.listening.forEach((event) => { counts[event.releaseId] = (counts[event.releaseId] ?? 0) + 1; });
    const trending = state.releases.filter((release) => release.status === 'released').map((release) => ({ ...release, listeningEvents: counts[release.id] ?? 0 })).sort((a, b) => b.listeningEvents - a.listeningEvents).slice(0, 24);
    return send({ trending });
  }

  if (path === '/api/profiles' && method === 'GET') {
    const account = requireUser(state);
    requireVerifiedAdult(state, account);
    const following = new Set(state.follows[account.userId] ?? []);
    const profiles = state.users
      .filter((candidate) => candidate.userId !== account.userId)
      .map((candidate) => {
        const profile = ensureProfile(state, candidate);
        if (profile.publicProfile === false) return null;
        return {
          userId: candidate.userId,
          role: candidate.role,
          name: profile.displayName ?? candidate.name,
          handle: profile.handle ?? null,
          headline: profile.headline ?? null,
          bio: profile.bio ?? null,
          pronouns: profile.pronouns ?? null,
          initials: profile.avatarInitials ?? null,
          roleFocus: profile.roleFocus ?? [],
          followers: Object.values(state.follows).filter((items) => items.includes(candidate.userId)).length,
          following: following.has(candidate.userId),
        };
      })
      .filter(Boolean);
    return send({ profiles });
  }

  if (path === '/api/following' && method === 'GET') {
    const account = requireUser(state);
    const profiles = (state.follows[account.userId] ?? []).map((userId) => {
      const target = state.users.find((candidate) => candidate.userId === userId);
      if (!target) return { userId, role: null, name: 'Unavailable Nightjar profile', handle: null, headline: null, publicProfile: false };
      const targetProfile = ensureProfile(state, target);
      if (targetProfile.publicProfile === false) return { userId, role: target.role, name: 'Private Nightjar profile', handle: null, headline: null, publicProfile: false };
      return { userId, role: target.role, name: targetProfile.displayName ?? target.name, handle: targetProfile.handle ?? null, headline: targetProfile.headline ?? null, publicProfile: true };
    });
    return send({ profiles });
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

  if (parts[0] === 'api' && parts[1] === 'follows') {
    const account = requireUser(state);
    const list = state.follows[account.userId] ?? [];
    if (parts.length === 2 && method === 'GET') return send({ follows: list.map((profileUserId) => ({ profileUserId, creatorUserId: profileUserId })) });
    const legacyCreatorRoute = parts[2] === 'creators' && parts.length === 4;
    const universalRoute = parts.length === 3 && parts[2] !== 'creators';
    if (legacyCreatorRoute || universalRoute) {
      const profileUserId = legacyCreatorRoute ? parts[3] : parts[2];
      if (profileUserId === account.userId) throw new Error('Choose another Nightjar profile to follow.');
      const target = state.users.find((candidate) => candidate.userId === profileUserId);
      const targetProfile = target ? ensureProfile(state, target) : null;
      if (!target || targetProfile?.publicProfile === false) throw new Error('Profile not found.');
      if (method === 'POST' && !list.includes(profileUserId)) list.push(profileUserId);
      if (method === 'DELETE') state.follows[account.userId] = list.filter((item) => item !== profileUserId);
      else state.follows[account.userId] = list;
      return send({ following: method === 'POST', profileUserId });
    }
  }

  if (path === '/api/listening/event' && method === 'POST') {
    const account = requireUser(state);
    requireVerifiedAdult(state, account);
    const eventType = String(input.eventType ?? '');
    if (!['start', 'progress', 'seek', 'complete', 'pause'].includes(eventType)) throw new Error('Unsupported listening event.');
    const releaseId = String(input.releaseId ?? '');
    const release = state.releases.find((item) => item.id === releaseId && item.status === 'released');
    if (!release) throw new Error('Release not found.');
    const durationSeconds = Math.max(0, Math.min(Number(input.durationSeconds ?? 0), 24 * 60 * 60));
    const positionSeconds = Math.max(0, Math.min(Number(input.positionSeconds ?? 0), durationSeconds || 24 * 60 * 60));
    const record = { releaseId, eventType, sessionId: String(input.sessionId ?? '').slice(0, 100) || null, positionSeconds, durationSeconds, fromSeconds: input.fromSeconds == null ? null : Math.max(0, Math.min(Number(input.fromSeconds), durationSeconds || 24 * 60 * 60)), intent: String(input.intent ?? '').slice(0, 80), completed: eventType === 'complete' || input.completed === true, id: id('listen'), userId: account.userId, createdAt: now() };
    state.listening.push(record);
    if (eventType !== 'seek' && eventType !== 'pause') {
      state.taste[account.userId] = [...(state.taste[account.userId] ?? []), { type: eventType, contentId: releaseId, category: release.category ?? null, tags: [...(release.tags ?? []), ...(release.tropes ?? [])].slice(0, 16), completed: record.completed, createdAt: record.createdAt }];
    }
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
    const listeningSeconds = verifiedListeningSeconds(events);
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
    const declaredTags = Array.isArray(profile.favouriteTags) ? profile.favouriteTags : [];
    const declaredTropes = Array.isArray(profile.favouriteTropes) ? profile.favouriteTropes : [];
    const declaredCategories = Array.isArray(profile.favouriteCategories) ? profile.favouriteCategories : [];
    for (const value of [...declaredTags, ...declaredTropes, ...declaredCategories]) {
      const key = String(value).toLowerCase();
      weights[key] = (weights[key] ?? 0) + 5;
    }
    events.forEach((event) => {
      const factor = tasteSignalWeight(event.type ?? event.eventType, event.completed === true);
      [...(event.tags ?? []), ...(event.category ? [event.category] : [])].forEach((value) => {
        const key = String(value).toLowerCase();
        weights[key] = (weights[key] ?? 0) + factor;
      });
    });
    const vector = Object.entries(weights).map(([label, weight]) => ({ label, weight: Number(weight.toFixed(2)) })).sort((a, b) => Number(b.weight) - Number(a.weight)).slice(0, 24);
    return send({ declared: { tags: profile.favouriteTags ?? [], tropes: profile.favouriteTropes ?? [], categories: profile.favouriteCategories ?? [] }, vector });
  }

  if (path === '/api/taste/event' && method === 'POST') {
    const account = requireUser(state);
    const eventType = String(input.eventType ?? '');
    const allowed = ['more_like_this', 'less_like_this', 'not_for_me', 'hide', 'skip', 'save', 'follow', 'complete', 'replay'];
    if (!allowed.includes(eventType)) throw new Error('Unsupported taste signal.');
    state.taste[account.userId] = [...(state.taste[account.userId] ?? []), {
      type: eventType,
      contentId: String(input.contentId ?? '').slice(0, 100) || null,
      category: String(input.category ?? '').slice(0, 80) || null,
      tags: Array.isArray(input.tags) ? input.tags.map(String).map((item) => item.trim()).filter(Boolean).slice(0, 12) : [],
      durationSeconds: Math.max(0, Math.min(Number(input.durationSeconds ?? 0), 86400)),
      completed: input.completed === true,
      createdAt: now(),
    }];
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

  if (path === '/api/admin/release-library' && method === 'GET') {
    requireAdmin(state);
    const statuses = new Set(['pending_review', 'released', 'held', 'taken_down', 'rejected']);
    return send({ releases: state.releases.filter((release) => statuses.has(String(release.status ?? ''))).slice().sort((a, b) => String(b.updatedAt ?? b.createdAt ?? '').localeCompare(String(a.updatedAt ?? a.createdAt ?? ''))) });
  }

  if (path === '/api/admin/release-queue' && method === 'GET') {
    requireAdmin(state);
    return send({ releases: state.releases.filter((release) => release.status === 'pending_review').slice(0, 100) });
  }

  if (parts[0] === 'api' && parts[1] === 'admin' && parts[2] === 'releases' && parts.length === 5 && parts[4] === 'lifecycle' && method === 'POST') {
    const admin = requireAdmin(state);
    const release = state.releases.find((item) => item.id === parts[3]);
    if (!release) throw new Error('Release not found.');
    const action = String(input.action ?? '');
    const fromStatus = String(release.status ?? '');
    let toStatus = fromStatus;
    if (action === 'hold' && fromStatus === 'released') toStatus = 'held';
    else if (action === 'takedown' && ['released', 'held'].includes(fromStatus)) toStatus = 'taken_down';
    else if (action === 'restore' && ['held', 'taken_down'].includes(fromStatus)) toStatus = 'released';
    else throw new Error('That lifecycle action is not valid for the release’s current status.');
    const at = now();
    const note = String(input.note ?? '').trim().slice(0, 1000) || null;
    const reasonCode = String(input.reasonCode ?? 'other').trim().slice(0, 80) || 'other';
    release.status = toStatus;
    release.lifecycleNote = note;
    release.lifecycleReasonCode = reasonCode;
    release.lifecycleUpdatedAt = at;
    release.lifecycleUpdatedBy = admin.userId;
    release.updatedAt = at;
    state.moderationHistory.push({ id: id('moderation'), releaseId: release.id, creatorUserId: release.creatorUserId ?? null, decision: action, reasonCode, note, fromStatus, toStatus, moderatorUserId: admin.userId, createdAt: at });
    if (release.creatorUserId) addLocalNotification(state, release.creatorUserId, {
      type: 'content',
      subtype: 'release',
      title: action === 'hold' ? 'Your release has been placed on hold' : action === 'takedown' ? 'Your release has been taken down' : 'Your release has been restored',
      message: action === 'hold' ? 'Nightjar has temporarily removed this release from the public catalogue while it is reviewed.' : action === 'takedown' ? 'Nightjar has removed this release from the public catalogue.' : 'Nightjar has restored this release to the public catalogue.',
      releaseId: release.id,
      moderationNote: note,
      reasonCode,
    });
    return send({ release });
  }

  if (parts[0] === 'api' && parts[1] === 'admin' && parts[2] === 'releases' && parts.length === 5 && parts[4] === 'moderation-history' && method === 'GET') {
    requireAdmin(state);
    const history = state.moderationHistory.filter((item) => item.releaseId === parts[3]).slice().sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? ''))).slice(0, 100);
    return send({ history });
  }


  if (parts[0] === 'api' && parts[1] === 'admin' && parts[2] === 'releases' && parts.length === 5 && parts[4] === 'moderate' && method === 'POST') {
    const admin = requireAdmin(state);
    const release = state.releases.find((item) => item.id === parts[3]);
    if (!release) throw new Error('Release not found.');
    const decision = String(input.decision ?? '');
    if (!['approved', 'changes', 'rejected'].includes(decision)) throw new Error('Invalid moderation decision.');
    const note = String(input.note ?? '').trim();
    const fromStatus = release.status;
    release.status = decision === 'approved' ? 'released' : decision === 'changes' ? 'draft' : 'rejected';
    release.moderationNote = note || null;
    release.moderatedAt = now();
    release.moderatedBy = admin.userId;
    release.releaseDate = decision === 'approved' ? now() : release.releaseDate ?? null;
    release.updatedAt = now();
    state.moderationHistory.push({
      id: id('moderation'),
      releaseId: release.id,
      creatorUserId: release.creatorUserId ?? null,
      decision,
      reasonCode: String(input.reasonCode ?? (decision === 'approved' ? 'approved' : 'other')).slice(0, 80),
      note: release.moderationNote,
      fromStatus,
      toStatus: release.status,
      moderatorUserId: admin.userId,
      createdAt: release.moderatedAt,
    });
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

  if (parts[0] === 'api' && parts[1] === 'admin' && parts[2] === 'scripts' && parts.length === 5 && parts[4] === 'assign-editor' && method === 'POST') {
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