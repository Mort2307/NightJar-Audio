import { useEffect, useMemo, useState, type ReactNode, type ClipboardEvent as ReactClipboardEvent, type MouseEvent as ReactMouseEvent, type DragEvent as ReactDragEvent } from 'react';
import { api, auth } from '@appdeploy/client';
import {
  ArrowRight,
  BarChart3,
  Check,
  ChevronRight,
  Heart,
  Headphones,
  LockKeyhole,
  LogOut,
  Menu,
  Mic2,
  Moon,
  Pause,
  Play,
  Settings2,
  ShieldCheck,
  Sparkles,
  Upload,
  UserCircle2,
  Users,
  X,
  FileText,
  ShieldAlert,
  ClipboardX,
  Ban,
  Bell,
  Download,
  FileCheck2,
  Share2,
  Coins,
  WalletCards,
} from 'lucide-react';
import CreatorAudioPipeline from './components/CreatorAudioPipeline';
import CreatorProfile from './components/CreatorProfile';
import ContentModeration from './components/ContentModeration';
import NightjarOnboarding from './components/NightjarOnboarding';
import NightjarPlayer from './components/NightjarPlayer';
import WriterDiscovery from './components/WriterDiscovery';
import ProfileDiscovery from './components/ProfileDiscovery';
import RecommendationFeedback from './components/RecommendationFeedback';
import FollowingList from './components/FollowingList';
import CatalogueSearch from './components/CatalogueSearch';
import WriterStudio from './components/WriterStudio';
import SecurityReviewPanel from './components/SecurityReviewPanel';

type View = 'discover' | 'creators' | 'creator' | 'writer' | 'editor' | 'admin' | 'protection' | 'profile';
type AgeStage = 'gate' | 'assurance' | 'app';
type AccountRole = 'admin' | 'creator' | 'listener' | 'writer' | 'editor';
type PreviewRole = 'creator' | 'listener' | 'writer' | 'editor';

type AuthenticatedUser = {
  userId: string;
  email?: string;
  name?: string;
  picture?: string;
};

type Track = {
  id: string;
  title: string;
  creator: string;
  duration: string;
  category: string;
  listeners?: string;
  descriptor: string;
  featured?: boolean;
  audioUrl?: string | null;
  artworkUrl?: string | null;
  creatorUserId?: string;
};

type CreatorSummary = {
  userId: string;
  name: string;
  handle?: string | null;
  followers?: number;
  releases?: number;
  share?: string | number;
  initials?: string;
  note?: string;
};

type Spotlight = {
  kind: 'creator' | 'writer' | 'listener';
  name: string;
  handle?: string | null;
  title?: string;
  edition?: string;
  detail?: string;
  initials?: string;
  targetId?: string;
  releaseId?: string | null;
  listenerRank?: number;
  weeklyTrackedMinutes?: number;
  weeklyTopSevenCount?: number;
  publicProfile?: boolean;
};

const preferredScrollBehavior = (): ScrollBehavior => window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
const getNightjarDeviceId = () => {
  const key = 'nightjar.protected-device.v1';
  const current = window.localStorage.getItem(key);
  if (current) return current;
  const next = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'nj-device-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
  window.localStorage.setItem(key, next);
  return next;
};
let nightjarEnvironmentIdPromise: Promise<string | null> | null = null;
const getNightjarEnvironmentId = () => {
  if (nightjarEnvironmentIdPromise) return nightjarEnvironmentIdPromise;
  nightjarEnvironmentIdPromise = (async () => {
    try {
      const browserCrypto = globalThis.crypto;
      if (!browserCrypto?.subtle) return null;
      const memory = Number((navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 0);
      const traits = [
        navigator.userAgent,
        navigator.platform,
        navigator.language,
        (navigator.languages ?? []).join(','),
        Intl.DateTimeFormat().resolvedOptions().timeZone,
        String(screen.width) + 'x' + String(screen.height) + 'x' + String(screen.colorDepth),
        String(navigator.hardwareConcurrency ?? 0),
        String(memory),
      ].join('|');
      const digest = await browserCrypto.subtle.digest('SHA-256', new TextEncoder().encode(traits));
      return Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, '0')).join('');
    } catch {
      return null;
    }
  })();
  return nightjarEnvironmentIdPromise;
};
const getNightjarSecurityDeviceContext = async () => ({
  deviceId: getNightjarDeviceId(),
  environmentId: await getNightjarEnvironmentId(),
});

const roleMeta: Record<AccountRole, { label: string; description: string }> = {
  admin: {
    label: 'Administrator',
    description: 'Platform operations, moderation, creator approvals and commercial controls.',
  },
  creator: {
    label: 'Creator',
    description: 'Your catalogue, releases, audience and verified listening attribution.',
  },
  listener: {
    label: 'Listener',
    description: 'Discover, follow and listen to Nightjar’s adult catalogue.',
  },
  writer: {
    label: 'Writer',
    description: 'Write, protect and license scripts with controlled collaboration access.',
  },
  editor: {
    label: 'Editor',
    description: 'Review assigned scripts, revisions and editorial workflow.',
  },
};

function App() {
  const [view, setView] = useState<View>(() => { const value = window.location.pathname.replace(/^\/+|\/+$/g, ''); return (['discover','creators','creator','writer','editor','admin','protection','profile'].includes(value) ? value : 'discover') as View; });
  const [playing, setPlaying] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [ageStage, setAgeStage] = useState<AgeStage>('gate');
  const [ageVerified, setAgeVerified] = useState(false);
  const [ageStatus, setAgeStatus] = useState<'NOT_STARTED' | 'PENDING' | 'COMPLETE' | 'FAIL'>('NOT_STARTED');
  const [ageConfigured, setAgeConfigured] = useState(false);
  const [ageProvider, setAgeProvider] = useState('yoti-sandbox');
  const [ageEnvironment, setAgeEnvironment] = useState<'sandbox' | 'production'>('sandbox');
  const [ageVerifiedAt, setAgeVerifiedAt] = useState<string | null>(null);
  const [ageReverifyRequired, setAgeReverifyRequired] = useState(false);
  const [ageSessionActive, setAgeSessionActive] = useState(false);
  const [ageLoading, setAgeLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [favouriteReleaseIds, setFavouriteReleaseIds] = useState<string[]>([]);
  const [followingProfileIds, setFollowingProfileIds] = useState<string[]>([]);
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [role, setRole] = useState<AccountRole | null>(null);
  const [accountStatus, setAccountStatus] = useState<'active' | 'pending_review'>('active');
  const [accountLoading, setAccountLoading] = useState(false);
  const [rolePicker, setRolePicker] = useState(false);
  const [previewRole, setPreviewRole] = useState<PreviewRole | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [identityEmail, setIdentityEmail] = useState<string | null>(null);
  const [identityAdmin, setIdentityAdmin] = useState(false);
  const [protectedReaderOpen, setProtectedReaderOpen] = useState(false);
  const [protectionEvidence, setProtectionEvidence] = useState<any[]>([]);
  const [protectionReports, setProtectionReports] = useState<any[]>([]);
  const [reportCategory, setReportCategory] = useState('Something else');
  const [reportSummary, setReportSummary] = useState('');
  const [adminOverview, setAdminOverview] = useState<any | null>(null);
  const [adminOverviewLoading, setAdminOverviewLoading] = useState(false);
  const [adminPeopleRole, setAdminPeopleRole] = useState<'listener' | 'creator' | 'writer' | 'editor' | 'admin' | null>(null);
  const [profile, setProfile] = useState<any>({ displayName: '', handle: '', headline: '', bio: '', pronouns: '', avatarInitials: '', avatarTone: 'plum', favouriteTags: [], favouriteTropes: [], favouriteCategories: [], roleFocus: [], publicProfile: true });
  const [profileLoading, setProfileLoading] = useState(false);
  const [tasteVector, setTasteVector] = useState<any[]>([]);
  const [adminPanel, setAdminPanel] = useState<'approvals' | 'revenue' | 'subscriptions' | 'economics' | 'editorial' | null>(null);
  const [adminApplications, setAdminApplications] = useState<any[]>([]);
  const [adminSubscriptions, setAdminSubscriptions] = useState<any[]>([]);
  const [adminScripts, setAdminScripts] = useState<any[]>([]);
  const [adminEditors, setAdminEditors] = useState<any[]>([]);
  const [adminPanelLoading, setAdminPanelLoading] = useState(false);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [catalogueResults, setCatalogueResults] = useState<Track[] | null>(null);
  const [catalogueCategories, setCatalogueCategories] = useState<string[]>([]);
  const [catalogueSearch, setCatalogueSearch] = useState({ query: '', category: '' });
  const [creatorDirectory, setCreatorDirectory] = useState<CreatorSummary[]>([]);
  const [creatorSpotlightList, setCreatorSpotlightList] = useState<Spotlight[]>([]);
  const [writerSpotlightList, setWriterSpotlightList] = useState<Spotlight[]>([]);
  const [listenerSpotlight, setListenerSpotlight] = useState<Spotlight | null>(null);
  const [spotlightMeta, setSpotlightMeta] = useState<{ listenerTopSevenCount: number; listenerSpotlightDay: number | null; listenerWeek: string | null }>({ listenerTopSevenCount: 0, listenerSpotlightDay: null, listenerWeek: null });
  const [creatorDashboard, setCreatorDashboard] = useState<{ metrics: any; releases: any[] }>({ metrics: {}, releases: [] });
  const [creatorDashboardLoading, setCreatorDashboardLoading] = useState(false);
  const [liveRecommendations, setLiveRecommendations] = useState<any[]>([]);
  const [liveTrending, setLiveTrending] = useState<any[]>([]);
  const [currentIntent, setCurrentIntent] = useState('');
  const [notifications, setNotifications] = useState<any[]>([]);
  const [notificationUnreadCount, setNotificationUnreadCount] = useState(0);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [creatorProfileUserId, setCreatorProfileUserId] = useState<string | null>(null);
  const [moderationOpen, setModerationOpen] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

  const [writerDraftTitle, setWriterDraftTitle] = useState('');
  const [writerScripts, setWriterScripts] = useState<any[]>([]);
  const [writerSelected, setWriterSelected] = useState<any | null>(null);
  const [editorQueue, setEditorQueue] = useState<any[]>([]);
  const [editorSelected, setEditorSelected] = useState<any | null>(null);
  const [protectedScripts, setProtectedScripts] = useState<any[]>([]);
  const [protectedReaderScript, setProtectedReaderScript] = useState<any | null>(null);

  const featured = useMemo(() => tracks.find((track) => track.featured) ?? tracks[0] ?? null, [tracks]);
  const creatorSpotlight = creatorSpotlightList[0] ?? null;
  const writerSpotlight = writerSpotlightList[0] ?? null;
  const creators = creatorDirectory;
  const studioMetrics = [
    ['Published releases', String(creatorDashboard.metrics?.released ?? 0)],
    ['Draft releases', String(creatorDashboard.metrics?.drafts ?? 0)],
    ['Verified listening', String(creatorDashboard.metrics?.verifiedListeningMinutes ?? 0) + ' min'],
    ['Unique listeners', String(creatorDashboard.metrics?.uniqueListeners ?? 0)],
  ];

  useEffect(() => {
    const onPop = () => {
      const value = window.location.pathname.replace(/^\/+|\/+$/g, '');
      setView((['discover','creators','creator','writer','editor','admin','protection','profile'].includes(value) ? value : 'discover') as View);
    };
    window.addEventListener('popstate', onPop);
    void (async () => {
      try {
        const { data } = await api.get('/api/branding');
        if (data?.logoUrl) setLogoUrl(data.logoUrl);
      } catch { /* branded wordmark remains available */ }
    })();
    let cancelled = false;
    const restore = async () => {
      if (!auth.isSignedIn()) return;
      const current = await auth.getUser();
      if (cancelled || !current) return;
      setUser(current);
      await registerCurrentSecurityDevice();
      await loadAccount();
      const verified = await refreshAgeStatus();
      if (!verified) setAgeStage('assurance');
    };
    void restore();
    return () => { cancelled = true; window.removeEventListener('popstate', onPop); };
  }, []);

  useEffect(() => {
    if (!user || !ageVerified || !role || role === 'admin' || role === 'editor') return;
    let cancelled = false;
    void api.get('/api/profile/me').then(({ data }) => {
      if (cancelled) return;
      const nextProfile = data?.profile;
      if (nextProfile) {
        setProfile((current: any) => ({ ...current, ...nextProfile }));
        setShowOnboarding(nextProfile.onboardingComplete !== true);
      } else {
        setShowOnboarding(true);
      }
    }).catch(() => { /* onboarding remains optional if the profile endpoint is unavailable */ });
    return () => { cancelled = true; };
  }, [user, ageVerified, role]);

  useEffect(() => {
    if (!user || !ageVerified) return;
    void loadLiveProductData();
    if (role === 'creator' || canAdmin) { void loadCreatorDashboard(); void loadProtectedScripts(); }
    if (role === 'writer' || (canAdmin && previewRole === 'writer')) void loadWriterScripts();
    if (role === 'editor' || (canAdmin && previewRole === 'editor')) void loadEditorQueue();
  }, [user, ageVerified, role, currentIntent, previewRole]);

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2800);
  };

  const registerCurrentSecurityDevice = async () => {
    try {
      await api.post('/api/security/device/register', await getNightjarSecurityDeviceContext());
    } catch {
      /* Device/environment correlation is a non-blocking security signal. */
    }
  };


  const navigate = (nextView: View) => {
    const path = nextView === 'discover' ? '/discover' : '/' + nextView;
    if (window.location.pathname !== path) window.history.pushState({}, '', path);
    setView(nextView);
    setMenuOpen(false);
    window.scrollTo({ top: 0, behavior: preferredScrollBehavior() });
  };

  const loadLiveProductData = async () => {
    const [catalogueResult, creatorsResult, spotlightResult] = await Promise.allSettled([
      api.get('/api/catalogue'),
      api.get('/api/creators'),
      api.get('/api/spotlights'),
    ]);

    if (catalogueResult.status === 'fulfilled') {
      const liveTracks = mapCatalogueTracks(catalogueResult.value.data?.catalogue ?? []);
      setTracks(liveTracks);
      setCatalogueCategories((catalogueResult.value.data?.categories ?? []).map(String));
    }

    if (creatorsResult.status === 'fulfilled') {
      setCreatorDirectory((creatorsResult.value.data?.creators ?? []).map((creator: any) => ({
        userId: String(creator.userId),
        name: creator.displayName ?? 'Nightjar creator',
        handle: creator.handle ?? null,
        initials: creator.avatarInitials ?? undefined,
        note: creator.headline ?? creator.bio ?? undefined,
        followers: Number(creator.followerCount ?? 0),
        releases: creator.releaseCount ?? 0,
        share: creator.listeningShare ?? '—',
      })));
    }

    if (spotlightResult.status === 'fulfilled') {
      const spotlights = spotlightResult.value.data?.spotlights ?? [];
      const mapSpotlight = (item: any): Spotlight => ({
        kind: item.kind,
        name: item.name,
        handle: item.handle,
        title: item.title,
        edition: item.edition,
        detail: item.detail,
        initials: item.initials,
        targetId: item.targetId,
        releaseId: item.releaseId ?? null,
        listenerRank: item.listenerRank,
        weeklyTrackedMinutes: item.weeklyTrackedMinutes,
        weeklyTopSevenCount: item.weeklyTopSevenCount,
        publicProfile: item.publicProfile !== false,
      });
      setCreatorSpotlightList(spotlights.filter((item: any) => item.kind === 'creator' && item.name).map(mapSpotlight));
      setWriterSpotlightList(spotlights.filter((item: any) => item.kind === 'writer' && item.name).map(mapSpotlight));
      const listener = spotlights.find((item: any) => item.kind === 'listener' && item.name);
      setListenerSpotlight(listener ? mapSpotlight(listener) : null);
      setSpotlightMeta({
        listenerTopSevenCount: Number(spotlightResult.value.data?.listenerTopSevenCount ?? 0),
        listenerSpotlightDay: spotlightResult.value.data?.listenerSpotlightDay == null ? null : Number(spotlightResult.value.data.listenerSpotlightDay),
        listenerWeek: spotlightResult.value.data?.listenerWeek ?? null,
      });
    }

    await loadNotifications();

    if (user) {
      const [recommendationsResult, trendingResult, favouritesResult, followsResult] = await Promise.allSettled([
        api.get('/api/recommendations' + (currentIntent ? '?intent=' + encodeURIComponent(currentIntent) : '')),
        api.get('/api/trending'),
        api.get('/api/favourites'),
        api.get('/api/follows'),
      ]);
      if (recommendationsResult.status === 'fulfilled') setLiveRecommendations(recommendationsResult.value.data?.recommendations ?? []);
      if (trendingResult.status === 'fulfilled') setLiveTrending(trendingResult.value.data?.trending ?? []);
      if (favouritesResult.status === 'fulfilled') setFavouriteReleaseIds((favouritesResult.value.data?.favourites ?? []).map((item: any) => String(item.releaseId)));
      if (followsResult.status === 'fulfilled') setFollowingProfileIds((followsResult.value.data?.follows ?? []).map((item: any) => String(item.profileUserId ?? item.creatorUserId)).filter(Boolean));
    }
  };

  const searchCatalogue = async (query: string, category: string) => {
    const next = { query: query.trim(), category: category.trim() };
    if (!next.query && !next.category) {
      setCatalogueSearch(next);
      setCatalogueResults(null);
      return;
    }
    const params = new URLSearchParams();
    if (next.query) params.set('q', next.query);
    if (next.category) params.set('category', next.category);
    try {
      const { data } = await api.get('/api/catalogue?' + params.toString());
      setCatalogueSearch(next);
      setCatalogueResults(mapCatalogueTracks(data?.catalogue ?? []));
      if (Array.isArray(data?.categories)) setCatalogueCategories(data.categories.map(String));
    } catch {
      notify('Catalogue search could not be loaded.');
    }
  };

  const loadNotifications = async () => {
    if (!auth.isSignedIn()) return;
    try {
      const communityRequest = api.get('/api/notifications');
      const securityRequest = role === 'admin'
        ? api.get('/api/security/notifications')
        : Promise.resolve({ data: { notifications: [], unreadCount: 0 } });
      const [communityResult, securityResult] = await Promise.allSettled([communityRequest, securityRequest]);

      const communityData = communityResult.status === 'fulfilled' ? communityResult.value.data : {};
      const securityData = securityResult.status === 'fulfilled' ? securityResult.value.data : {};
      const communityNotifications = communityData?.notifications ?? [];
      const securityNotifications = (securityData?.notifications ?? []).map((item: any) => ({ ...item, securityOwnerNotification: true }));
      const nextNotifications = [...securityNotifications, ...communityNotifications]
        .sort((a: any, b: any) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')));

      setNotifications(nextNotifications);
      setNotificationUnreadCount(nextNotifications.filter((item: any) => item.read !== true).length);

      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
      const personalSpotlight = communityNotifications.find((item: any) => item.type === 'spotlight' && item.spotlightDate === today && item.read !== true);
      if (personalSpotlight && window.sessionStorage.getItem('nightjar_spotlight_notice:' + today) !== 'shown') {
        window.sessionStorage.setItem('nightjar_spotlight_notice:' + today, 'shown');
        notify(personalSpotlight.title + ' — ' + personalSpotlight.message);
      }

      const securityAlert = securityNotifications.find((item: any) => item.type === 'security_alert' && item.read !== true);
      if (securityAlert) {
        const key = 'nightjar_security_notice:' + String(securityAlert.alertId ?? securityAlert.id);
        if (window.sessionStorage.getItem(key) !== 'shown') {
          window.sessionStorage.setItem(key, 'shown');
          notify((securityAlert.title ?? 'Nightjar security alert') + ' — ' + (securityAlert.message ?? 'Protected-content activity requires review.'));
        }
      }
    } catch { /* notifications remain non-blocking */ }
  };

  const markNotificationRead = async (notification: any) => {
    if (notification?.read === true) return;
    try {
      const route = notification.securityOwnerNotification === true
        ? '/api/security/notifications/' + encodeURIComponent(String(notification.id)) + '/read'
        : '/api/notifications/' + encodeURIComponent(String(notification.id)) + '/read';
      await api.post(route);
      setNotifications((items) => items.map((item) => item.id === notification.id ? { ...item, read: true } : item));
      setNotificationUnreadCount((count) => Math.max(0, count - 1));
    } catch { /* notification read state is non-critical */ }
  };

  const shareSpotlight = async (spotlight: Spotlight) => {
    const kindLabel = spotlight.kind === 'creator' ? 'Creator' : 'Writer';
    const text = spotlight.kind === 'listener'
      ? `Nightjar is recognising ${spotlight.name} today as a Listener Spotlight. Thank you for being part of the listening community.`
      : `Today on Nightjar: ${spotlight.name} is our ${kindLabel} Spotlight. Discover their work and support independent creators.`;
    const url = window.location.origin + '/discover';
    try {
      if (navigator.share) await navigator.share({ title: 'Nightjar Spotlight', text, url });
      else if (navigator.clipboard) {
        await navigator.clipboard.writeText(text + ' ' + url);
        notify('Spotlight message copied — ready to share.');
      } else notify('Spotlight sharing is available from a compatible device/browser.');
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) notify('Spotlight sharing could not be opened.');
    }
  };

  const loadCreatorDashboard = async () => {
    if (!user || (role !== 'creator' && !canAdmin)) return;
    setCreatorDashboardLoading(true);
    try {
      const { data } = await api.get('/api/creator/dashboard');
      setCreatorDashboard({ metrics: data?.metrics ?? {}, releases: data?.releases ?? [] });
    } catch {
      setCreatorDashboard({ metrics: {}, releases: [] });
    } finally {
      setCreatorDashboardLoading(false);
    }
  };

  const openWriterScript = async (scriptId: string) => {
    if (!user || !scriptId) return;
    try {
      const { data } = await api.get('/api/writer/scripts/' + encodeURIComponent(scriptId));
      setWriterSelected(data?.script ?? null);
    } catch {
      notify('That manuscript could not be opened.');
    }
  };

  const loadWriterScripts = async () => {
    if (!user) return;
    try {
      const { data } = await api.get('/api/writer/scripts');
      const items = data?.scripts ?? [];
      setWriterScripts(items);
      const currentId = writerSelected?.id && items.some((item: any) => item.id === writerSelected.id) ? String(writerSelected.id) : String(items[0]?.id ?? '');
      if (!currentId) {
        setWriterSelected(null);
        return;
      }
      if (writerSelected?.id === currentId && typeof writerSelected?.content === 'string') {
        const metadata = items.find((item: any) => String(item.id) === currentId);
        if (metadata) setWriterSelected((current: any) => current?.id === currentId ? { ...current, ...metadata } : current);
        return;
      }
      await openWriterScript(currentId);
    } catch {
      setWriterScripts([]);
      setWriterSelected(null);
    }
  };

  const loadEditorQueue = async () => {
    if (!user) return;
    try {
      const { data } = await api.get('/api/editor/queue');
      const items = data?.queue ?? [];
      setEditorQueue(items);
      setEditorSelected((current: any) => current && items.some((item: any) => item.id === current.id) ? current : items[0] ?? null);
    } catch {
      setEditorQueue([]);
      setEditorSelected(null);
    }
  };

  const loadProtectedScripts = async () => {
    if (!user) return;
    try {
      const { data } = await api.get('/api/scripts/catalogue');
      setProtectedScripts(data?.scripts ?? []);
    } catch {
      setProtectedScripts([]);
    }
  };

  const loadAccount = async () => {
    setAccountLoading(true);
    try {
      const identity = await api.get('/api/account/identity');
      setIdentityEmail(identity.data?.email ?? null);
      setIdentityAdmin(identity.data?.admin === true);
      if (identity.data?.admin === true) {
        setRole('admin');
        setAccountStatus('active');
        setRolePicker(false);
        navigate('admin');
        void loadAdminOverview();
        return;
      }
    } catch { /* account endpoint remains authoritative */ }
    try {
      const { data } = await api.get('/api/account');
      if (data?.status === 'suspended' || data?.removed === true) {
        notify(data?.removed === true ? 'This account has been removed from Nightjar after administrator review.' : 'This account is frozen while a Nightjar security review is active.');
        await auth.signOut();
        setUser(null);
        setRole(null);
        setAgeVerified(false);
        setAgeStage('gate');
        return;
      }
      if (data?.role === 'admin' || data?.role === 'creator' || data?.role === 'listener' || data?.role === 'writer' || data?.role === 'editor') {
        setRole(data.role);
        setAccountStatus(data.status === 'pending_review' ? 'pending_review' : 'active');
        navigate(data.role === 'admin' ? 'admin' : data.role === 'creator' ? 'creator' : data.role === 'writer' ? 'writer' : data.role === 'editor' ? 'editor' : 'discover');
      } else {
        setRole(null);
        setRolePicker(true);
      }
    } catch {
      notify('We could not load this account profile. Please try again.');
    } finally {
      setAccountLoading(false);
    }
  };

  const refreshAgeStatus = async () => {
    if (!auth.isSignedIn()) {
      setAgeStage('gate');
      return true;
    }
    try {
      const { data } = await api.get('/api/age/status');
      const verified = data?.verified === true;
      setAgeVerified(verified);
      setAgeConfigured(data?.configured === true);
      setAgeProvider(String(data?.provider ?? 'yoti-sandbox'));
      setAgeEnvironment(data?.environment === 'production' ? 'production' : 'sandbox');
      setAgeVerifiedAt(data?.verifiedAt ?? null);
      setAgeReverifyRequired(data?.reverifyRequired === true);
      setAgeSessionActive(data?.sessionActive === true);
      setAgeStatus(data?.status === 'COMPLETE' ? 'COMPLETE' : data?.status === 'PENDING' || data?.status === 'PROCESSING' || data?.status === 'IN_PROGRESS' ? 'PENDING' : data?.status === 'FAIL' || data?.status === 'ERROR' || data?.status === 'CANCELLED' ? 'FAIL' : 'NOT_STARTED');
      if (verified) setAgeStage('app');
      return verified;
    } catch {
      return false;
    }
  };

  const runAdminSandboxTest = async () => {
    setAgeLoading(true);
    try {
      const { data } = await api.post('/api/age/test-pass');
      if (data?.verified) {
        setAgeVerified(true);
        setAgeStatus('COMPLETE');
        setAgeProvider('nightjar-sandbox-test');
        setAgeEnvironment('sandbox');
        setAgeVerifiedAt(new Date().toISOString());
        setAgeReverifyRequired(false);
        setAgeSessionActive(false);
        setAgeStage('app');
        notify('Age verification is now stored on this Nightjar account; future logins will not repeat the check.');
      }
    } catch {
      notify('Sandbox test could not be completed.');
    } finally {
      setAgeLoading(false);
    }
  };

  const openAgeCheck = async () => {
    setAgeLoading(true);
    try {
      if (!auth.isSignedIn()) {
        const result = await auth.signIn({ scope: 'openid email profile offline_access' });
        setUser(result.user);
        await loadAccount();
      }
      const alreadyVerified = await refreshAgeStatus();
      if (alreadyVerified) {
        notify('Your Nightjar account is already age verified. No new check is needed.');
        return;
      }
      const { data } = await api.post('/api/age/session');
      setAgeConfigured(data?.configured === true);
      setAgeProvider(String(data?.provider ?? 'yoti-sandbox'));
      setAgeEnvironment(data?.environment === 'production' ? 'production' : 'sandbox');
      setAgeSessionActive(Boolean(data?.sessionId && !data?.verified));
      if (data?.verified === true) {
        setAgeVerified(true);
        setAgeStatus('COMPLETE');
        setAgeVerifiedAt(data?.verifiedAt ?? new Date().toISOString());
        setAgeReverifyRequired(false);
        setAgeSessionActive(false);
        setAgeStage('app');
        notify('Your Nightjar account is already age verified. No new check was required.');
      } else if (data?.launchUrl) {
        setAgeStatus('PENDING');
        window.open(data.launchUrl, '_blank', 'noopener,noreferrer');
        notify(data?.environment === 'production' ? 'Secure age verification opened. Complete it, then return to Nightjar.' : 'Secure Yoti sandbox opened. Complete the test, then return to Nightjar.');
      } else if (data?.testAvailable) {
        notify('Yoti sandbox is not configured yet. The administrator sandbox test is available below.');
      } else {
        notify('Secure age verification is not configured yet. Please try again once the provider is connected.');
      }
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      if (!code.includes('popup_closed')) notify('Nightjar could not start age verification. Please try again.');
    } finally {
      setAgeLoading(false);
    }
  };

  useEffect(() => {
    if (!user || ageStatus !== 'PENDING') return;
    const timer = window.setInterval(() => { void refreshAgeStatus(); }, 5000);
    return () => window.clearInterval(timer);
  }, [ageStatus, user]);

  const signIn = async () => {
    setAccountLoading(true);
    try {
      const result = await auth.signIn({ scope: 'openid email profile offline_access' });
      setUser(result.user);
      await registerCurrentSecurityDevice();
      await loadAccount();
      const verified = await refreshAgeStatus();
      if (!verified) setAgeStage('assurance');
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      if (code.includes('popup_blocked')) notify('Please allow the Nightjar sign-in window.');
      else if (!code.includes('popup_closed')) notify('Nightjar sign-in could not be completed.');
    } finally {
      setAccountLoading(false);
    }
  };

  const signOut = async () => {
    await auth.signOut();
    setUser(null);
    setRole(null);
    setAgeVerified(false);
    setAgeStatus('NOT_STARTED');
    setAgeConfigured(false);
    setAgeProvider('yoti-sandbox');
    setAgeEnvironment('sandbox');
    setAgeVerifiedAt(null);
    setAgeReverifyRequired(false);
    setAgeSessionActive(false);
    setView('discover');
    setRolePicker(false);
    notify('Signed out of Nightjar.');
  };

  const chooseRole = async (nextRole: Exclude<AccountRole, 'admin' | 'editor'>) => {
    setAccountLoading(true);
    try {
      const { data } = await api.post('/api/account/role', { role: nextRole });
      if (data?.role === 'creator' || data?.role === 'listener' || data?.role === 'writer') {
        setRole(data.role);
        setAccountStatus(data.status === 'pending_review' ? 'pending_review' : 'active');
        setRolePicker(false);
        navigate(data.role === 'creator' ? 'creator' : data.role === 'writer' ? 'writer' : 'discover');
        notify(data.role === 'creator'
          ? 'Creator account created. Creator approval and publishing controls can be completed in the production onboarding flow.'
          : 'Listener account created. Welcome to Nightjar.');
      }
    } catch {
      notify('We could not create this account type. Please try again.');
    } finally {
      setAccountLoading(false);
    }
  };

  const recordProtectionEvent = async (eventType: string, relatedId = 'protected-script', sessionId?: string) => {
    if (!user) return;
    try {
      const deviceContext = await getNightjarSecurityDeviceContext();
      await api.post('/api/protection/event', {
        eventType,
        relatedType: 'script',
        relatedId,
        sessionId: sessionId ?? null,
        ...deviceContext,
        summary: eventType === 'copy_blocked'
          ? 'Protected copy interaction blocked; no clipboard contents were captured.'
          : 'Protected interaction recorded by Nightjar.',
      });
    } catch { }
  };

  const openProtectedReader = async (scriptId: string) => {
    try {
      const deviceContext = await getNightjarSecurityDeviceContext();
      const params = new URLSearchParams({ deviceId: deviceContext.deviceId });
      if (deviceContext.environmentId) params.set('environmentId', deviceContext.environmentId);
      const { data } = await api.get('/api/scripts/' + encodeURIComponent(scriptId) + '?' + params.toString());
      if (data?.canReadFull === false) {
        notify('This manuscript has not been granted for full reading by the writer.');
        return;
      }
      setProtectedReaderScript(data);
      setProtectedReaderOpen(true);
      void recordProtectionEvent('script_view', scriptId, data?.readerSession?.sessionId);
    } catch {
      notify('Protected script access could not be opened. If Nightjar paused access for security review, an administrator has been notified.');
    }
  };

  const toggleFavouriteRelease = async (releaseId: string) => {
    try {
      if (favouriteReleaseIds.includes(releaseId)) {
        await api.delete('/api/favourites/' + releaseId);
        setFavouriteReleaseIds((items) => items.filter((id) => id !== releaseId));
      } else {
        await api.post('/api/favourites/' + releaseId);
        setFavouriteReleaseIds((items) => [...items, releaseId]);
      }
    } catch {
      notify('Favourite could not be updated.');
    }
  };

  const toggleProfileFollow = async (profileUserId: string) => {
    try {
      if (followingProfileIds.includes(profileUserId)) {
        await api.delete('/api/follows/' + encodeURIComponent(profileUserId));
        setFollowingProfileIds((items) => items.filter((id) => id !== profileUserId));
      } else {
        await api.post('/api/follows/' + encodeURIComponent(profileUserId));
        setFollowingProfileIds((items) => items.includes(profileUserId) ? items : [...items, profileUserId]);
      }
    } catch {
      notify('Follow could not be updated.');
    }
  };

  const toggleCreatorFollow = toggleProfileFollow;

  const playReleaseFromCreatorProfile = (release: any) => {
    const track = releaseToTrack(release);
    setTracks((items) => items.some((item) => item.id === track.id) ? items : [...items, track]);
    setCreatorProfileUserId(null);
    setPlaying(track.id);
  };

  const togglePlayback = (track: Track) => {
    if (!track.audioUrl) {
      notify('This release has no playable audio attached yet.');
      return;
    }
    setPlaying(playing === track.id ? null : track.id);
  };

  const loadAdminOverview = async () => {
    if (!canAdmin) return;
    setAdminOverviewLoading(true);
    try {
      const { data } = await api.get('/api/admin/overview');
      setAdminOverview(data ?? null);
    } catch {
      notify('Administrator overview could not be loaded right now.');
    } finally {
      setAdminOverviewLoading(false);
    }
  };

  const loadProfile = async () => {
    if (!user) return;
    setProfileLoading(true);
    try {
      const [{ data: profileData }, { data: tasteData }] = await Promise.all([api.get('/api/profile/me'), api.get('/api/taste/profile')]);
      if (profileData?.profile) setProfile((current: any) => ({ ...current, ...profileData.profile }));
      setTasteVector(tasteData?.vector ?? []);
    } catch { notify('Profile could not be loaded right now.'); }
    finally { setProfileLoading(false); }
  };

  const reviewEditorScript = async (status: string) => {
    if (!editorSelected) return;
    const comment = window.prompt('Editorial note (optional)') ?? '';
    try {
      const { data } = await api.post('/api/editor/scripts/' + editorSelected.id + '/review', { status, comment });
      setEditorSelected(data?.script ?? editorSelected);
      await loadEditorQueue();
      notify('Editorial decision recorded.');
    } catch {
      notify('Editorial decision could not be recorded.');
    }
  };

  const saveProfile = async () => {
    if (!user) return;
    setProfileLoading(true);
    try {
      const { data } = await api.put('/api/profile/me', profile);
      if (data?.profile) setProfile(data.profile);
      await loadProfile();
      notify('Your Nightjar profile has been saved.');
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      notify(message.includes('409') ? 'That @handle is already in use.' : 'Profile could not be saved.');
    } finally { setProfileLoading(false); }
  };

  const updateProfileList = (key: 'favouriteTags'|'favouriteTropes'|'favouriteCategories', value: string) => {
    setProfile((current: any) => ({ ...current, [key]: value.split(',').map((item) => item.trim()).filter(Boolean).slice(0, 16) }));
  };

  const loadProtection = async () => {
    if (!user) return;
    try {
      const [evidence, reports] = await Promise.all([api.get('/api/protection/evidence'), api.get('/api/protection/reports')]);
      setProtectionEvidence(evidence.data?.evidence ?? []);
      setProtectionReports(reports.data?.reports ?? []);
    } catch { notify('Protection records could not be loaded right now.'); }
  };

  const submitProtectionReport = async () => {
    if (!reportSummary.trim()) return notify('Please describe what happened.');
    try {
      const { data } = await api.post('/api/protection/report', { category: reportCategory, summary: reportSummary });
      setReportSummary('');
      await loadProtection();
      notify(`Report ${data?.report?.caseId ?? ''} submitted.`);
    } catch { notify('We could not submit the report. Please try again.'); }
  };

  const accountLabel = role ? roleMeta[role].label : 'Signed out';
  const effectiveRole: AccountRole | null = role === 'admin' ? (previewRole ?? 'admin') : role;
  const canAdmin = role === 'admin';
  const canProtection = Boolean(user);

  const uploadLogo = async (file: File) => {
    if (!canAdmin) return;
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'].includes(file.type)) {
      notify('Use PNG, JPG, WebP or SVG for the Nightjar logo.');
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      notify('Logo must be 3 MB or smaller.');
      return;
    }
    setLogoUploading(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const { data } = await api.post('/api/admin/branding/logo', { dataUrl, contentType: file.type });
      if (data?.logoUrl) setLogoUrl(data.logoUrl);
      notify('Nightjar logo updated.');
    } catch {
      notify('Logo upload failed.');
    } finally {
      setLogoUploading(false);
    }
  };

  const openAdminPeople = (nextRole: 'listener' | 'creator' | 'writer' | 'editor' | 'admin') => {
    if (!canAdmin) return;
    setAdminPanel(null);
    setAdminPeopleRole(nextRole);
  };

  const loadAdminApplications = async () => {
    if (!canAdmin) return;
    setAdminPanelLoading(true);
    try {
      const { data } = await api.get('/api/admin/creator-applications');
      setAdminApplications(data?.applications ?? []);
    } catch {
      notify('Creator approval queue could not be loaded.');
    } finally {
      setAdminPanelLoading(false);
    }
  };

  const loadAdminSubscriptions = async () => {
    if (!canAdmin) return;
    setAdminPanelLoading(true);
    try {
      const { data } = await api.get('/api/admin/subscriptions');
      setAdminSubscriptions(data?.subscriptions ?? []);
    } catch {
      notify('Subscription ledger could not be loaded.');
    } finally {
      setAdminPanelLoading(false);
    }
  };

  const loadAdminEditorial = async () => {
    if (!canAdmin) return;
    setAdminPanelLoading(true);
    try {
      const [{ data: scriptsData }, { data: editorsData }] = await Promise.all([
        api.get('/api/admin/scripts'),
        api.get('/api/editor/accounts'),
      ]);
      setAdminScripts(scriptsData?.scripts ?? []);
      setAdminEditors(editorsData?.editors ?? []);
    } catch {
      notify('Editorial controls could not be loaded.');
    } finally {
      setAdminPanelLoading(false);
    }
  };

  const assignEditor = async (scriptId: string, editorUserId: string) => {
    if (!canAdmin || !scriptId || !editorUserId) return;
    try {
      await api.post('/api/admin/scripts/' + scriptId + '/assign-editor', { editorUserId });
      await loadAdminEditorial();
      notify('Editor assignment saved.');
    } catch {
      notify('Editor assignment could not be saved.');
    }
  };

  const openAdminPanel = (panel: 'approvals' | 'revenue' | 'subscriptions' | 'economics' | 'editorial') => {
    if (!canAdmin) return;
    setAdminPeopleRole(null);
    setAdminPanel(panel);
    if (panel === 'approvals') void loadAdminApplications();
    if (panel === 'subscriptions') void loadAdminSubscriptions();
    if (panel === 'editorial') void loadAdminEditorial();
  };

  const decideCreatorApplication = async (application: any, decision: 'approved' | 'waitlist' | 'rejected') => {
    if (!canAdmin || !application?.id) return;
    try {
      await api.post(`/api/admin/creator-applications/${application.id}/decision`, { decision });
      await loadAdminApplications();
      await loadAdminOverview();
      notify(`Creator application ${decision}.`);
    } catch {
      notify('Creator application decision could not be saved.');
    }
  };

  const createWriterDraft = async () => {
    const title = writerDraftTitle.trim();
    if (!title) return notify('Give the script a working title first.');
    try {
      const { data } = await api.post('/api/writer/scripts', { title, content: '' });
      setWriterDraftTitle('');
      await loadWriterScripts();
      setWriterSelected(data?.script ?? null);
      notify('Draft created.');
    } catch {
      notify('The script could not be created.');
    }
  };

  const saveWriterScript = async () => {
    if (!writerSelected) return;
    try {
      const { data } = await api.put('/api/writer/scripts/' + writerSelected.id, writerSelected);
      setWriterSelected(data?.script ?? writerSelected);
      await loadWriterScripts();
      notify('Script saved.');
    } catch {
      notify('Script could not be saved.');
    }
  };

  const createWriterVersion = async () => {
    if (!writerSelected) return;
    try {
      const { data } = await api.post('/api/writer/scripts/' + writerSelected.id + '/versions');
      setWriterSelected(data?.script ?? writerSelected);
      await loadWriterScripts();
      notify('Version recorded.');
    } catch {
      notify('Version could not be recorded.');
    }
  };

  const submitWriterScript = async () => {
    if (!writerSelected) return;
    try {
      const { data } = await api.post('/api/writer/scripts/' + writerSelected.id + '/submit');
      setWriterSelected(data?.script ?? writerSelected);
      await loadWriterScripts();
      notify('Script submitted to editorial.');
    } catch {
      notify('Script could not be submitted.');
    }
  };

  const selectPreviewRole = (next: PreviewRole) => {
    if (!canAdmin) return;
    setPreviewRole(next);
    setRolePicker(false);
    if (next === 'creator') navigate('creator');
    else if (next === 'listener') navigate('discover');
    else if (next === 'writer') navigate('writer');
    else navigate('editor');
    notify(`Admin preview: ${roleMeta[next].label} experience. Your Administrator role remains active.`);
  };

  const clearAdminPreview = () => {
    if (!canAdmin) return;
    setPreviewRole(null);
    navigate('admin');
    void loadAdminOverview();
    notify('Returned to Administrator view.');
  };

  if (ageStage === 'gate') {
    return (
      <main className="access-shell">
        <div className="access-glow access-glow-one" />
        <div className="access-glow access-glow-two" />
        <section className="access-card" aria-labelledby="nightjar-access-title">
          <div className="access-topline">
            <span className="brand-lockup"><span className="nightjar-mark"><Moon size={17} /></span><span>NIGHTJAR</span></span>
            <span className="access-label">18+ ONLY</span>
          </div>
          <div className="access-symbol"><Moon size={22} /></div>
          <p className="eyebrow">PREMIUM IMMERSIVE AUDIO</p>
          <h1 id="nightjar-access-title">A darker kind of listening.</h1>
          <p className="access-lede">
            Nightjar is an 18+ audio platform for original stories, intimate performances,
            character work and immersive soundscapes.
          </p>
          <div className="access-points">
            <div><ShieldCheck size={18} /><div><strong>Adults only</strong><span>Age assurance protects access to the adult catalogue.</span></div></div>
            <div><Headphones size={18} /><div><strong>Audio first</strong><span>Built around voice, atmosphere and headphone immersion.</span></div></div>
          </div>
          <button className="primary-button wide-button" disabled={accountLoading} onClick={() => void signIn()}>
            {accountLoading ? 'Opening secure sign-in…' : 'Sign in to Nightjar'} <ArrowRight size={17} />
          </button>
          <p className="access-fine">Production access will require a completed age-assurance result before adult catalogue access is granted.</p>
        </section>
      </main>
    );
  }

  if (ageStage === 'assurance') {
    return (
      <main className="access-shell">
        <div className="access-card assurance-card">
          <button className="back-button" onClick={() => setAgeStage('gate')}><ChevronRight size={15} className="rotate-back" /> Back</button>
          <div className="verification-badge"><LockKeyhole size={17} /> AGE ASSURANCE</div>
          <p className="eyebrow">SECURE ACCESS</p>
          <h1>Verify once. Then listen.</h1>
          <p className="access-lede">
            Nightjar uses an independent age-assurance provider to confirm that an account meets the 18+ threshold before adult catalogue access is granted.
          </p>
          <div className="verification-panel">
            <div className="verification-icon"><ShieldCheck size={23} /></div>
            <div>
              <strong>{ageProvider === 'yoti' ? 'Yoti Age Verification' : 'Yoti Age Verification · Sandbox'}</strong>
              <span>
                {ageVerified
                  ? `Verified on this Nightjar account${ageVerifiedAt ? ' · ' + new Date(ageVerifiedAt).toLocaleDateString('en-GB') : ''}. Future logins use this stored verification state.`
                  : ageSessionActive
                    ? 'A verification session is in progress. Finish it and return to Nightjar; the account state will update automatically.'
                    : ageConfigured
                      ? `Secure ${ageEnvironment} provider connected and ready for a verification session.`
                      : 'Verification integration is ready; provider credentials still need to be added.'}
              </span>
            </div>
            <span className="status-pill">{ageVerified ? 'VERIFIED' : ageStatus === 'PENDING' ? 'PENDING' : ageConfigured ? 'READY' : 'SETUP REQUIRED'}</span>
          </div>
          <div className="verification-list">
            <div><Check size={16} /><span>Adult access is checked before the catalogue is released.</span></div>
            <div><Check size={16} /><span>Verification is stored against your Nightjar account, not repeated on each login or device.</span></div>
            <div><Check size={16} /><span>Nightjar stores verification state and an opaque reference rather than raw identity documents.</span></div>
            {ageReverifyRequired && <div><ShieldCheck size={16} /><span>A fresh verification is currently required before adult access can continue.</span></div>}
          </div>
          <button className="primary-button wide-button" disabled={ageLoading || (ageVerified && !ageReverifyRequired)} onClick={() => void openAgeCheck()}>
            {ageLoading ? 'Opening secure check…' : ageVerified && !ageReverifyRequired ? 'Age verified — continue' : ageReverifyRequired ? 'Repeat age verification' : 'Open secure age check'} <LockKeyhole size={16} />
          </button>
          {!ageConfigured && user && role === 'admin' && <button className="secondary-button wide-button" disabled={ageLoading} onClick={() => void runAdminSandboxTest()}>
            Run administrator sandbox test <ShieldCheck size={16} />
          </button>}
          <p className="access-fine">Adult catalogue access is granted only after a verified age-assurance result.</p>
        </div>
      </main>
    );
  }

  if (rolePicker) {
    return (
      <main className="account-shell">
        <section className="account-card">
          <div className="account-header">
            <span className="brand-lockup"><span className="nightjar-mark"><Moon size={17} /></span><span>NIGHTJAR</span></span>
            <button className="text-button" onClick={signOut}><LogOut size={15} /> Sign out</button>
          </div>
          <p className="eyebrow">ACCOUNT SETUP</p>
          <h1>Choose your Nightjar identity.</h1>
          <p className="account-lede">
            Nightjar uses separate account roles. Your role determines what you can see,
            edit and publish; there is no shared “account mode” switch.
          </p>
          {identityEmail && <div className="demo-warning"><ShieldCheck size={17} /><div><strong>SIGNED IN AS</strong><span>{identityEmail}</span><small>{identityAdmin ? 'Administrator identity detected by Nightjar.' : 'Administrator identity not detected for this signed-in account.'}</small></div></div>}

          <div className="role-grid">
            {canAdmin ? (
              <>
                <article className="role-card">
                  <span className="role-icon"><Headphones size={20} /></span>
                  <div><span className="role-kicker">PREVIEW AS</span><h2>Listener</h2><p>Preview the exact listener-facing navigation and presentation without changing your administrator role.</p></div>
                  <button className="secondary-button" onClick={() => selectPreviewRole('listener')}>Preview listener <ArrowRight size={15} /></button>
                </article>
                <article className="role-card creator-role-card">
                  <span className="role-icon"><Mic2 size={20} /></span>
                  <div><span className="role-kicker">PREVIEW AS</span><h2>Creator</h2><p>Preview Creator Studio, creator onboarding states and the creator-facing presentation.</p></div>
                  <button className="primary-button" onClick={() => selectPreviewRole('creator')}>Preview creator <ArrowRight size={15} /></button>
                </article>
                <article className="role-card locked-role">
                  <span className="role-icon"><ShieldCheck size={20} /></span>
                  <div><span className="role-kicker">YOUR REAL ROLE</span><h2>Administrator</h2><p>Your administrator permissions remain active while previewing either public account experience.</p></div>
                  <div className="locked-note"><ShieldCheck size={14} /> Protected owner account</div>
                </article>
              </>
            ) : (
              <>
                <article className="role-card">
                  <span className="role-icon"><Headphones size={20} /></span>
                  <div><span className="role-kicker">LISTENER</span><h2>Listener account</h2><p>Discover, follow and listen to the adult catalogue.</p></div>
                  <button className="secondary-button" disabled={accountLoading} onClick={() => void chooseRole('listener')}>Create listener account <ArrowRight size={15} /></button>
                </article>
                <article className="role-card creator-role-card">
                  <span className="role-icon"><Mic2 size={20} /></span>
                  <div><span className="role-kicker">CREATOR</span><h2>Creator account</h2><p>Build a catalogue, publish releases and see your verified listening attribution.</p></div>
                  <button className="primary-button" disabled={accountLoading} onClick={() => void chooseRole('creator')}>Create creator account <ArrowRight size={15} /></button>
                </article>
                <article className="role-card">
                  <span className="role-icon"><FileText size={20} /></span>
                  <div><span className="role-kicker">WRITER</span><h2>Writer account</h2><p>Write original scripts and control exactly what collaborators can copy or export.</p></div>
                  <button className="secondary-button" disabled={accountLoading} onClick={() => void chooseRole('writer')}>Create writer account <ArrowRight size={15} /></button>
                </article>
                <article className="role-card locked-role">
                  <span className="role-icon"><ShieldCheck size={20} /></span>
                  <div><span className="role-kicker">EDITOR / ADMINISTRATOR</span><h2>Controlled roles</h2><p>Editors are assigned to production work. Administrators are restricted to the owner allowlist.</p></div>
                  <div className="locked-note"><LockKeyhole size={14} /> Controlled access only</div>
                </article>
              </>
            )}
          </div>

          <div className="account-identity">
            <UserCircle2 size={17} />
            <span>Signed in as <strong>{user?.name ?? user?.email ?? 'Nightjar account'}</strong></span>
          </div>
        </section>
      </main>
    );
  }

  const creatorOnly = effectiveRole === 'creator';
  const adminOnly = effectiveRole === 'admin';

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand-button" onClick={() => navigate('discover')} aria-label="Nightjar home">
          {logoUrl ? <img className="brand-logo" src={logoUrl} alt="Nightjar" /> : <span className="nightjar-mark"><Moon size={16} /></span>}<span>NIGHTJAR</span>
        </button>

        <nav className={menuOpen ? 'nav open' : 'nav'}>
          {(effectiveRole === 'listener' || effectiveRole === 'admin' || !role) && <button className={view === 'discover' ? 'nav-link active' : 'nav-link'} onClick={() => navigate('discover')}>Discover</button>}
          {canProtection && <button className={view === 'creators' ? 'nav-link active' : 'nav-link'} onClick={() => navigate('creators')}>Community</button>}
          {(creatorOnly || adminOnly) && <button className={view === 'creator' ? 'nav-link active' : 'nav-link'} onClick={() => { navigate('creator'); void loadCreatorDashboard(); }}>Creator Studio</button>}
          {effectiveRole === 'writer' && <button className={view === 'writer' ? 'nav-link active' : 'nav-link'} onClick={() => { navigate('writer'); void loadWriterScripts(); }}>Writer Studio</button>}
          {effectiveRole === 'editor' && <button className={view === 'editor' ? 'nav-link active' : 'nav-link'} onClick={() => { navigate('editor'); void loadEditorQueue(); }}>Editorial</button>}
          {canProtection && <button className={view === 'profile' ? 'nav-link active' : 'nav-link'} onClick={() => { navigate('profile'); void loadProfile(); }}>Profile</button>}
          {canProtection && <button className={view === 'protection' ? 'nav-link active' : 'nav-link'} onClick={() => { navigate('protection'); void loadProtection(); }}>Protection</button>}
          {canAdmin && <button className={view === 'admin' ? 'nav-link active' : 'nav-link'} onClick={() => { navigate('admin'); void loadAdminOverview(); void loadNotifications(); }}>Admin</button>}
          {canAdmin && <div className="admin-preview-strip"><span><ShieldCheck size={14} /> ADMIN PREVIEW · REAL ROLE: ADMINISTRATOR</span><button className={previewRole === 'listener' ? 'active' : ''} onClick={() => selectPreviewRole('listener')}>Listener</button><button className={previewRole === 'creator' ? 'active' : ''} onClick={() => selectPreviewRole('creator')}>Creator</button><button className={previewRole === 'writer' ? 'active' : ''} onClick={() => selectPreviewRole('writer')}>Writer</button><button className={previewRole === 'editor' ? 'active' : ''} onClick={() => selectPreviewRole('editor')}>Editor</button><button className={!previewRole ? 'active' : ''} onClick={clearAdminPreview}>Admin</button></div>}
        </nav>

        <div className="top-actions">
          {user && <div className="notification-wrap">
            <button className="ghost-button notification-button" onClick={() => setNotificationsOpen((open) => !open)} aria-label={notificationUnreadCount ? String(notificationUnreadCount) + ' unread notifications' : 'Notifications'}>
              <Bell size={17} />
              {notificationUnreadCount > 0 && <span className="notification-badge">{notificationUnreadCount > 9 ? '9+' : notificationUnreadCount}</span>}
            </button>
            {notificationsOpen && <section className="notification-popover" aria-label="Nightjar notifications">
              <div className="notification-popover-head"><div><span className="mini-label">NIGHTJAR NOTIFICATIONS</span><strong>{canAdmin ? 'Community & security updates' : 'Community updates'}</strong></div><button className="icon-button" onClick={() => setNotificationsOpen(false)} aria-label="Close notifications"><X size={15} /></button></div>
              {notifications.length ? <div className="notification-list">{notifications.slice(0, 8).map((item) => <button className={item.read ? 'notification-row' : 'notification-row unread'} key={item.id} onClick={() => { void markNotificationRead(item); if (item.securityOwnerNotification === true) { setNotificationsOpen(false); navigate('admin'); } }}>
                <span className="notification-row-icon">{item.type === 'security_alert' ? <ShieldAlert size={15} /> : item.subtype === 'creator' ? <Mic2 size={15} /> : item.subtype === 'writer' ? <FileText size={15} /> : <Headphones size={15} />}</span>
                <span><strong>{item.title}</strong><small>{item.message}</small></span>
              </button>)}</div> : <div className="notification-empty"><Bell size={17} /><span>No new community notifications.</span></div>}
            </section>}
          </div>}
          {!user ? (
            <button className="primary-button" disabled={accountLoading} onClick={() => void signIn()}>Sign in <ArrowRight size={15} /></button>
          ) : (
            <>
              <button className="account-chip" onClick={() => setRolePicker(true)}>
                <span className="account-chip-avatar">{(user.name ?? user.email ?? 'N').slice(0, 1).toUpperCase()}</span>
                <span><strong>{user.name ?? 'Nightjar account'}</strong><em>{canAdmin && previewRole ? `Administrator · previewing ${roleMeta[previewRole].label}` : accountLabel}</em></span>
              </button>
              <button className="ghost-button desktop-only" onClick={() => void signOut()}><LogOut size={15} /></button>
            </>
          )}
          <button className="menu-button" onClick={() => setMenuOpen((open) => !open)} aria-label="Open navigation menu">{menuOpen ? <X size={20} /> : <Menu size={20} />}</button>
        </div>
      </header>

      <main>
        {view === 'discover' && (
          <section className="page-wrap nj-animate">
            <section className="hero-section">
              <div className="hero-copy">
                <div className="hero-kicker">
                  <span className="eyebrow"><Sparkles size={14} /> 18+ / AUDIO FIRST</span>
                  <span className="kicker-line" />
                  <span className="kicker-note">Personalised from your explicit taste and current session intent</span>
                </div>
                <h1>Premium immersive<span> audio for adults.</span></h1>
                <p className="hero-lede">Original stories, performances and atmospheres built around voice, space and the feeling of a story happening close by.</p>
                <div className="hero-actions">
                  <button className="primary-button" onClick={() => document.getElementById('catalogue')?.scrollIntoView({ behavior: preferredScrollBehavior() })}>Enter the listening room <ArrowRight size={16} /></button>
                  <button className="text-button with-icon" onClick={() => creatorOnly || adminOnly ? navigate('creator') : notify('Create or apply for a Creator account to open Creator Studio.')}><Mic2 size={15}/> For creators <ChevronRight size={16} /></button>
                </div>
                <div className="hero-signals">
                  <span><Headphones size={15} /> Headphone-first</span>
                  <span><Mic2 size={15} /> Creator-led</span>
                  <span><ShieldCheck size={15} /> 18+ access</span>
                </div>
              </div>
              <div className="hero-art" aria-label="Nightjar featured release">
                <div className="orbit orbit-a" /><div className="orbit orbit-b" />
                <div className="featured-card">
                  {featured ? <>
                    <div className="featured-top"><span className="mini-label">NIGHTJAR / FEATURED</span><span className="status-dot"><span /> LIVE RELEASE</span></div>
                    <div className="cover-art" style={featured.artworkUrl ? { backgroundImage: 'url("' + featured.artworkUrl + '")', backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}>
                      {!featured.artworkUrl && <div className="cover-crescent"><Moon size={54} /></div>}
                      <span>{featured.title.toUpperCase()}</span>
                      <small>{featured.creator}</small>
                    </div>
                    <div className="feature-meta">
                      <div><span className="mini-label">{featured.category}</span><strong>{featured.title}</strong></div>
                      <button className="round-play" disabled={!featured.audioUrl} onClick={() => togglePlayback(featured)} aria-label={playing === featured.id ? 'Pause release' : 'Play release'}>{playing === featured.id ? <Pause size={19} /> : <Play size={19} fill="currentColor" />}</button>
                    </div>
                    <div className="player-meta"><span>{featured.duration}</span><span>{featured.audioUrl ? 'Audio connected' : 'Audio not connected'}</span></div>
                  </> : <div className="empty-feature"><Moon size={40}/><strong>No featured release yet.</strong><span>Published catalogue records will appear here as creators release audio.</span></div>}
                </div>
              </div>
            </section>

            <section className="editorial-strip"><span>VOICE</span><span>STORY</span><span>ATMOSPHERE</span><span>CHARACTER</span><span>SOUND DESIGN</span><span>AFTER DARK</span></section>

            <section className="spotlight-section section-wrap" aria-labelledby="daily-spotlights-title">
              <div className="section-head spotlight-heading"><div><p className="eyebrow"><Sparkles size={14} /> INCLUSION ROTATION</p><h2 id="daily-spotlights-title">Today in the spotlight.</h2></div><span className="spotlight-cycle">03 LANES · 01 DAY EACH · FAIR ROTATION</span></div>
              <div className="spotlight-grid">
                {creatorSpotlight ? <article className="spotlight-tile creator-spotlight-tile">
                  <div className="spotlight-art"><span className="spotlight-initials">{creatorSpotlight.initials || 'NJ'}</span><span className="spotlight-art-mark"><Mic2 size={20} /></span></div>
                  <div className="spotlight-copy"><div className="spotlight-topline"><span className="mini-label">CREATOR SPOTLIGHT</span><span className="spotlight-day">TODAY · 24 HOURS</span></div><h3>{creatorSpotlight.name}</h3><p className="spotlight-handle">{creatorSpotlight.handle ? '@' + creatorSpotlight.handle.replace(/^@/,'') : 'Handle not set'}</p><div className="spotlight-edition"><span>{creatorSpotlight.edition || 'Creator Spotlight'}</span><strong>{creatorSpotlight.title || 'Creator profile'}</strong><p>{creatorSpotlight.detail || 'A full day of discovery for this Nightjar creator.'}</p></div><div className="spotlight-actions">{creatorSpotlight.releaseId && tracks.some((track) => track.id === String(creatorSpotlight.releaseId)) ? <button className="secondary-button" onClick={() => { const track = tracks.find((item) => item.id === String(creatorSpotlight.releaseId)); if (track) togglePlayback(track); }}>Listen to highlighted release <Play size={14} /></button> : <button className="secondary-button" onClick={() => setCreatorProfileUserId(creatorSpotlight.targetId ?? null)}>Meet {creatorSpotlight.name} <ArrowRight size={14} /></button>}{creatorSpotlight.publicProfile !== false && <button className="ghost-button" onClick={() => void shareSpotlight(creatorSpotlight)} aria-label={`Share ${creatorSpotlight.name}'s creator spotlight`}><Share2 size={15} /> Share spotlight</button>}</div></div>
                </article> : <div className="spotlight-tile"><div className="spotlight-copy"><span className="mini-label">CREATOR SPOTLIGHT</span><h3>Awaiting creators</h3><p className="spotlight-handle">Every active Creator joins the daily rotation automatically.</p></div></div>}
                {writerSpotlight ? <article className="spotlight-tile writer-spotlight-tile">
                  <div className="spotlight-art"><span className="spotlight-initials">{writerSpotlight.initials || 'NJ'}</span><span className="spotlight-art-mark"><FileText size={20} /></span></div>
                  <div className="spotlight-copy"><div className="spotlight-topline"><span className="mini-label">WRITER SPOTLIGHT</span><span className="spotlight-day">TODAY · 24 HOURS</span></div><h3>{writerSpotlight.name}</h3><p className="spotlight-handle">{writerSpotlight.handle ? '@' + writerSpotlight.handle.replace(/^@/,'') : 'Handle not set'}</p><div className="spotlight-edition"><span>{writerSpotlight.edition || 'Writer Spotlight'}</span><strong>{writerSpotlight.title || 'Writer profile'}</strong><p>{writerSpotlight.detail || 'A full day of discovery for this Nightjar writer.'}</p></div><div className="spotlight-actions"><button className="secondary-button" onClick={() => document.getElementById('writer-discovery-title')?.scrollIntoView({ behavior: preferredScrollBehavior() })}>Explore writer <ArrowRight size={14} /></button>{writerSpotlight.publicProfile !== false && <button className="ghost-button" onClick={() => void shareSpotlight(writerSpotlight)} aria-label={`Share ${writerSpotlight.name}'s writer spotlight`}><Share2 size={15} /> Share spotlight</button>}</div></div>
                </article> : <div className="spotlight-tile"><div className="spotlight-copy"><span className="mini-label">WRITER SPOTLIGHT</span><h3>Awaiting writers</h3><p className="spotlight-handle">Every active Writer joins the daily rotation automatically.</p></div></div>}
                {listenerSpotlight ? <article className="spotlight-tile listener-spotlight-tile">
                  <div className="spotlight-art"><span className="spotlight-initials">{listenerSpotlight.initials || 'NJ'}</span><span className="spotlight-art-mark"><Headphones size={20} /></span></div>
                  <div className="spotlight-copy"><div className="spotlight-topline"><span className="mini-label">LISTENER SPOTLIGHT</span><span className="spotlight-day">TODAY · 24 HOURS</span></div><h3>{listenerSpotlight.name}</h3><p className="spotlight-handle">{listenerSpotlight.handle ? '@' + listenerSpotlight.handle.replace(/^@/,'') : 'Handle not set'}</p><div className="spotlight-edition"><span>{listenerSpotlight.edition || 'WEEKLY TOP 7'}</span><strong>{listenerSpotlight.title || 'Community listener'}</strong><p>{listenerSpotlight.detail || 'Recognised for the most tracked listening activity in the previous completed week.'}</p></div><div className="spotlight-listener-meta"><span>TOP {spotlightMeta.listenerTopSevenCount || 0}</span><span>DAY {spotlightMeta.listenerSpotlightDay || 1} / 7</span></div><div className="spotlight-thanks"><Headphones size={14} /><span>Thank you for helping make Nightjar’s listening community what it is.</span></div></div>
                </article> : <div className="spotlight-tile listener-spotlight-tile"><div className="spotlight-copy"><span className="mini-label">LISTENER SPOTLIGHT</span><h3>Weekly listener recognition</h3><p className="spotlight-handle">The previous completed week’s top seven tracked Listeners rotate one per day. The seven refresh together when the new week begins.</p></div></div>}
              </div>
              <p className="spotlight-note">Every active Creator and Writer receives a full day in deterministic rotation, with a shareable spotlight to help the community naturally discover their work. Listener Spotlight recognises the previous completed week’s top seven Listeners, one per day, and thanks them for helping Nightjar thrive.</p>
            </section>

            <WriterDiscovery followingIds={followingProfileIds} onToggleFollow={toggleProfileFollow} notify={notify} />

            <section id="catalogue" className="section-wrap">
              <div className="section-head"><div><p className="eyebrow">THE LISTENING ROOM</p><h2>Published releases.</h2></div><button className="text-button with-icon" onClick={() => document.getElementById('for-you')?.scrollIntoView({behavior:preferredScrollBehavior()})}>Personalise <Sparkles size={14}/></button></div>
              <CatalogueSearch categories={catalogueCategories} activeQuery={catalogueSearch.query} activeCategory={catalogueSearch.category} resultCount={(catalogueResults ?? tracks).length} onSearch={searchCatalogue} />
              <div className="track-grid">
                {(catalogueResults ?? tracks.slice(0, 6)).map((track) => <LiveTrackCard key={track.id} track={track} playing={playing === track.id} favourite={favouriteReleaseIds.includes(track.id)} onPlay={togglePlayback} onFavourite={() => void toggleFavouriteRelease(track.id)} />)}
                {catalogueResults !== null && !catalogueResults.length && <div className="people-empty"><Headphones size={18}/><strong>No releases match that search.</strong><span>Try another title, mood, genre, trope, tag or category.</span></div>}
                {catalogueResults === null && !tracks.length && <div className="people-empty"><Headphones size={18}/><strong>No published releases yet.</strong><span>The listening room will populate from real creator releases once audio is published.</span></div>}
              </div>
            </section>

            <section id="for-you" className="section-wrap">
              <div className="section-head"><div><p className="eyebrow"><Sparkles size={14}/> FOR YOU</p><h2>What fits right now.</h2></div><select className="mood-select" value={currentIntent} onChange={(event) => setCurrentIntent(event.target.value)} aria-label="Current listening intent"><option value="">Open to anything</option><option value="wind">Wind down</option><option value="story">A story</option><option value="quiet">Something quiet</option><option value="focus">Focus</option><option value="discover">Discover something new</option></select></div>
              <p className="section-copy">Declared preferences carry more weight than observed behaviour. The current session intent only changes the present recommendation context.</p>
              <div className="track-grid">
                {liveRecommendations.map((release: any) => { const track = releaseToTrack(release); return <LiveTrackCard key={track.id} track={track} playing={playing === track.id} favourite={favouriteReleaseIds.includes(track.id)} onPlay={togglePlayback} onFavourite={() => void toggleFavouriteRelease(track.id)} reason={release.reason} feedback={<RecommendationFeedback release={release} notify={notify} onFeedback={(signal) => { if (signal !== 'more_like_this') setLiveRecommendations((items) => items.filter((item: any) => String(item.id) !== String(release.id))); }} />} />; })}
                {!liveRecommendations.length && <div className="people-empty"><Sparkles size={18}/><strong>Your recommendation graph is still forming.</strong><span>Save work, finish releases, follow creators and set explicit preferences to create meaningful personalised recommendations.</span></div>}
              </div>
            </section>

            <section className="section-wrap">
              <div className="section-head"><div><p className="eyebrow">TRENDING</p><h2>Popular right now.</h2></div><span className="section-copy">General popularity is kept separate from personalisation.</span></div>
              <div className="track-grid">
                {liveTrending.map((release: any) => { const track = releaseToTrack(release); return <LiveTrackCard key={track.id} track={track} playing={playing === track.id} favourite={favouriteReleaseIds.includes(track.id)} onPlay={togglePlayback} onFavourite={() => void toggleFavouriteRelease(track.id)} />; })}
                {!liveTrending.length && <div className="people-empty"><BarChart3 size={18}/><strong>No live trending data.</strong><span>Trending appears only after real listening events exist.</span></div>}
              </div>
            </section>

            <section className="creator-band section-wrap">
              <div className="section-head"><div><p className="eyebrow">THE CREATOR NETWORK</p><h2>Voices worth following.</h2></div><button className="text-button with-icon" onClick={() => navigate('creators')}>Meet the creators <ArrowRight size={15} /></button></div>
              <div className="creator-grid">{creators.slice(0, 5).map((creator) => <button className="creator-card" key={creator.userId} onClick={() => navigate('creators')}><span className="avatar-large">{creator.initials || creator.name.slice(0,2).toUpperCase()}</span><span className="creator-card-copy"><strong>{creator.name}</strong><span>{creator.handle ? '@' + creator.handle.replace(/^@/,'') : 'Handle not set'}</span><em>{creator.note || 'Nightjar creator profile.'}</em><small>{creator.releases ?? 0} published releases</small></span><ChevronRight size={17} /></button>)}</div>
              {!creators.length && <div className="people-empty"><Users size={18}/><strong>No approved creator profiles yet.</strong><span>Creator discovery will populate from approved public accounts.</span></div>}
            </section>

            <section className="studio-feature section-wrap">
              <div className="studio-feature-copy"><p className="eyebrow"><BarChart3 size={14} /> CREATOR STUDIO</p><h2>The catalogue earns with real listening.</h2><p>Creator economics are based on verified listening and live commercial records. Nightjar does not fabricate listeners, earnings or payouts.</p><button className="primary-button" onClick={() => creatorOnly || adminOnly ? navigate('creator') : notify('Apply as a Creator to access Creator Studio.')}>Open Creator Studio <ArrowRight size={16} /></button></div>
              <div className="studio-preview-card"><div className="studio-card-head"><div><span className="mini-label">LIVE CREATOR DATA</span><strong>{creatorOnly ? 'Your account' : 'Connected data'}</strong></div><span className="studio-period">{creatorDashboardLoading ? 'LOADING' : 'LIVE RECORDS'}</span></div><div className="studio-metrics">{studioMetrics.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div><div className="formula-line"><span>NET SUBSCRIPTION REVENUE</span><ChevronRight size={12}/><span>CREATOR POOL</span><ChevronRight size={12}/><span>VERIFIED LISTENING</span></div></div>
            </section>
          </section>
        )}

        {view === 'creators' && (
          <section className="page-wrap">
            <div className="page-heading"><div><p className="eyebrow">THE NIGHTJAR COMMUNITY</p><h1>Support the people behind Nightjar.</h1><p>Discover public profiles across the community and follow as many people as you choose.</p></div></div>
            <ProfileDiscovery followingIds={followingProfileIds} onToggleFollow={toggleProfileFollow} onOpenCreator={setCreatorProfileUserId} notify={notify} />
          </section>
        )}

        {view === 'creator' && (
          <section className="page-wrap studio-page">
            <div className="page-heading studio-page-heading">
              <div>
                <p className="eyebrow"><BarChart3 size={14} /> CREATOR STUDIO</p>
                <h1>Your audience. Your catalogue. Your listening revenue.</h1>
                <p>{accountStatus === 'pending_review' ? 'Your Creator application is awaiting approval.' : 'Your real release pipeline, from upload through moderation to live catalogue.'}</p>
              </div>
              <button className="primary-button with-icon" disabled={!creatorOnly} onClick={() => document.getElementById('creator-pipeline')?.scrollIntoView({ behavior: preferredScrollBehavior() })}>
                <Upload size={16} /> New release
              </button>
            </div>
            {accountStatus === 'pending_review' && creatorOnly && <div className="admin-note"><Sparkles size={17} /><div><strong>CREATOR ACCOUNT / PENDING REVIEW</strong><span>Your account is created, but publishing stays locked until an administrator approves the application.</span></div></div>}
            <div className="dashboard-metric-grid">
              {studioMetrics.map(([label, value]) => <div className="dashboard-metric" key={label}><span>{label}</span><strong>{creatorDashboardLoading ? '…' : value}</strong><em>Live record</em></div>)}
            </div>
            <div id="creator-pipeline">
              {creatorOnly ? <CreatorAudioPipeline releases={creatorDashboard.releases} accountStatus={accountStatus} canPublish={creatorOnly && accountStatus !== 'pending_review'} onRefresh={loadCreatorDashboard} notify={notify} /> : <div className="admin-note"><Mic2 size={17}/><div><strong>CREATOR STUDIO PREVIEW</strong><span>Administrator preview can inspect the interface; only an active Creator can upload, submit or publish real releases.</span></div></div>}
            </div>
            <article className="panel-card"><div className="panel-title"><div><span className="mini-label">ECONOMICS</span><h2>Verified listening allocation</h2></div><ShieldCheck size={18}/></div><div className="formula-stack"><div><span>01</span><strong>Net subscription revenue</strong></div><ChevronRight size={15}/><div><span>02</span><strong>Creator pool</strong></div><ChevronRight size={15}/><div><span>03</span><strong>Eligible verified listening</strong></div></div><p className="panel-note">Commercial outputs remain empty until real billing records and payout rules are connected.</p></article>
          </section>
        )}

        {view === 'profile' && (
          <section className="page-section profile-page">
            <div className="page-heading"><div><span className="eyebrow"><UserCircle2 size={14}/> YOUR NIGHTJAR</span><h1>Make Nightjar yours.</h1><p>Every account gets a personal identity and taste profile. Your role controls permissions; your profile controls how you present yourself.</p></div></div>
            <div className="profile-editor-grid">
              <article className="panel profile-editor-card">
                <span className="mini-label">IDENTITY</span>
                <div className="profile-avatar-preview" data-tone={profile.avatarTone || 'plum'}><strong>{profile.avatarInitials || (profile.displayName || user?.name || 'N').slice(0,2).toUpperCase()}</strong></div>
                <h2>{profile.displayName || user?.name || 'Choose your name'}</h2>
                <label>Chosen name<input value={profile.displayName} onChange={(e)=>setProfile((p:any)=>({...p,displayName:e.target.value}))} placeholder="How Nightjar should call you"/></label>
                <label>@handle<input value={profile.handle} onChange={(e)=>setProfile((p:any)=>({...p,handle:e.target.value}))} placeholder="youruniquehandle"/></label>
                <div className="profile-inline-fields"><label>Avatar initials<input maxLength={4} value={profile.avatarInitials} onChange={(e)=>setProfile((p:any)=>({...p,avatarInitials:e.target.value.toUpperCase()}))} placeholder="NJ"/></label><label>Profile tone<select value={profile.avatarTone || 'plum'} onChange={(e)=>setProfile((p:any)=>({...p,avatarTone:e.target.value}))}><option value="plum">Plum</option><option value="wine">Wine</option><option value="mauve">Mauve</option><option value="ivory">Ivory</option></select></label></div>
                <label>Headline<input value={profile.headline} onChange={(e)=>setProfile((p:any)=>({...p,headline:e.target.value}))} placeholder="A short line that feels like you"/></label>
                <label>Pronouns <span className="optional-label">optional</span><input value={profile.pronouns} onChange={(e)=>setProfile((p:any)=>({...p,pronouns:e.target.value}))} placeholder="e.g. she/her"/></label>
                <label>Bio<textarea value={profile.bio} onChange={(e)=>setProfile((p:any)=>({...p,bio:e.target.value}))} placeholder="Tell people a little about you"/></label>
              </article>
              <article className="panel profile-editor-card">
                <span className="mini-label">TASTE & ROLE</span>
                <h2>What you love</h2>
                <p className="panel-note">Declared preferences are yours to choose. Nightjar keeps them separate from identity and uses them to refine recommendations.</p>
                <label>Favourite tags <input value={(profile.favouriteTags??[]).join(', ')} onChange={(e)=>updateProfileList('favouriteTags',e.target.value)} placeholder="Atmospheric, Whisper, Cinematic"/></label>
                <label>Favourite tropes <input value={(profile.favouriteTropes??[]).join(', ')} onChange={(e)=>updateProfileList('favouriteTropes',e.target.value)} placeholder="Slow burn, suspense, character-led"/></label>
                <label>Favourite categories <input value={(profile.favouriteCategories??[]).join(', ')} onChange={(e)=>updateProfileList('favouriteCategories',e.target.value)} placeholder="Story, Atmospheric, Performance"/></label>
                <label>Role focus <input value={(profile.roleFocus??[]).join(', ')} onChange={(e)=>setProfile((p:any)=>({...p,roleFocus:e.target.value.split(',').map((x:string)=>x.trim()).filter(Boolean).slice(0,16)}))} placeholder="Performance, writing, editing"/></label>
                <label className="profile-toggle"><input type="checkbox" checked={profile.publicProfile !== false} onChange={(e)=>setProfile((p:any)=>({...p,publicProfile:e.target.checked}))}/> Public profile</label>
                <button className="primary-button" disabled={profileLoading} onClick={()=>void saveProfile()}>{profileLoading ? 'Saving…' : 'Save my profile'} <Check size={15}/></button>
              </article>
            </div>
            <div className="profile-public-preview panel"><div><span className="mini-label">PUBLIC PROFILE</span><h3>{profile.displayName || 'Your chosen name'} <span>{profile.handle ? '@'+profile.handle.replace(/^@/,'') : '@yourhandle'}</span></h3><p>{profile.headline || 'Your Nightjar headline appears here.'}</p><div className="profile-preview-chips">{[...(profile.favouriteTags??[]),...(profile.favouriteTropes??[])].slice(0,6).map((item:string)=><span key={item}>{item}</span>)}</div></div><em>{profile.publicProfile === false ? 'Private' : 'Visible to your Nightjar community'}</em></div>
            <article className="panel taste-panel"><div><span className="mini-label">TASTE ENGINE</span><h2>What Nightjar is learning</h2><p>Declared taste is kept separate from identity. Listening signals can refine recommendations without trying to infer who you are.</p></div><div className="taste-vector">{tasteVector.length===0 ? <span className="taste-empty">Your taste graph will grow as you save, finish, replay and explore.</span> : tasteVector.slice(0,10).map((item:any)=><div className="taste-chip" key={item.label}><strong>{item.label}</strong><span>{item.weight}</span></div>)}</div></article>
            <FollowingList followingIds={followingProfileIds} onToggleFollow={toggleProfileFollow} notify={notify} />
          </section>
        )}

        {view === 'protection' && (
          <section className="page-wrap protection-page">
            <div className="page-heading">
              <div><p className="eyebrow"><ShieldAlert size={14} /> PROTECTION CENTRE</p><h1>Your account. Your work. Your safety.</h1><p>You are not expected to deal with harassment, abuse, fraud, theft, threats or other wrongdoing alone. Nightjar gives you a direct reporting path and keeps a supporting record of relevant platform events.</p></div>
            </div>
            <div className="protection-banner"><ShieldCheck size={20} /><div><strong>PROTECTED BY DESIGN</strong><span>Security signals are supporting evidence, not an automatic finding of wrongdoing or intent. Nightjar does not capture clipboard contents.</span></div></div>
            <div className="admin-grid">
              <div className="admin-panel"><span className="admin-icon"><ShieldAlert size={19} /></span><span className="mini-label">REPORT SOMETHING</span><h2>Tell Nightjar what happened</h2><select value={reportCategory} onChange={(event) => setReportCategory(event.target.value)}><option>Harassment or abuse</option><option>Fraud or scam</option><option>Impersonation</option><option>Copyright / script theft</option><option>Unauthorised sharing</option><option>Threats or coercion</option><option>Suspected illegal activity</option><option>Account security</option><option>Something else</option></select><textarea value={reportSummary} onChange={(event) => setReportSummary(event.target.value)} placeholder="Describe what happened. Include dates, account names, content references or other useful detail." /><button className="primary-button" onClick={() => void submitProtectionReport()}>Submit protected report <ArrowRight size={15} /></button></div>
              <div className="admin-panel"><span className="admin-icon"><ClipboardX size={19} /></span><span className="mini-label">EVIDENCE LOG</span><h2>Quiet security record</h2><p>Blocked copy, cut, print, selection and other protected interactions can be recorded against your account. This helps establish a timeline if a concern is later reported.</p><strong>{protectionEvidence.length} recorded signal{protectionEvidence.length === 1 ? '' : 's'}</strong><button className="secondary-button" onClick={() => void loadProtection()}>Refresh evidence</button></div>
              <div className="admin-panel"><span className="admin-icon"><FileText size={19} /></span><span className="mini-label">MY CASES</span><h2>Reports and support</h2><p>{protectionReports.length ? `${protectionReports.length} case${protectionReports.length === 1 ? '' : 's'} recorded on this account.` : 'No protection reports have been submitted from this account yet.'}</p><div className="evidence-list">{protectionReports.slice(0, 6).map((report) => <div key={report.caseId}><strong>{report.caseId}</strong><span>{report.category} · {report.status}</span></div>)}</div></div>
              <div className="admin-panel"><span className="admin-icon"><Ban size={19} /></span><span className="mini-label">ACCOUNT CONTROL</span><h2>Block and disengage</h2><p>If a user is causing a problem, blocking is available from supported account surfaces. For serious incidents, block and report rather than relying on either action alone.</p><button className="secondary-button" onClick={() => notify('Open the relevant user profile to block that account.')}>How blocking works</button></div>
            </div>
            <div className="protection-footnote"><strong>Immediate danger?</strong><span>Nightjar is not emergency services. In the UK, call 999 for immediate danger. For platform incidents, use this report path so relevant Nightjar records can be reviewed.</span></div>
          </section>
        )}

        {view === 'writer' && effectiveRole === 'writer' && (
          <WriterStudio
            draftTitle={writerDraftTitle}
            scripts={writerScripts}
            selected={writerSelected}
            onDraftTitleChange={setWriterDraftTitle}
            onSelect={(script: any) => void openWriterScript(String(script.id))}
            onCreate={createWriterDraft}
            onSave={saveWriterScript}
            onVersion={createWriterVersion}
            onSubmit={submitWriterScript}
            onOpenProtected={openProtectedReader}
            notify={notify}
          />
        )}

        {view === 'editor' && effectiveRole === 'editor' && (
          <section className="page-wrap role-studio-page">
            <div className="page-heading">
              <div><p className="eyebrow"><FileCheck2 size={14} /> EDITORIAL QUEUE</p><h1>Review work professionally.</h1><p>Only manuscripts assigned to your editor account appear here.</p></div>
            </div>
            <div className="editor-queue-grid">
              {editorQueue.map((script: any) => (
                <button key={script.id} className={editorSelected?.id === script.id ? 'editor-queue-card active' : 'editor-queue-card'} onClick={() => setEditorSelected(script)}>
                  <div className="editor-status-line"><span>{script.status ?? 'Submitted'}</span><strong>v{script.version ?? 1}</strong></div>
                  <h2>{script.title}</h2>
                  <p>{script.lastEditorialComment || 'No editorial note recorded yet.'}</p>
                </button>
              ))}
            </div>
            {!editorQueue.length && <div className="people-empty"><FileCheck2 size={18} /><strong>No editorial assignments.</strong><span>An administrator must assign a live manuscript to you before review work can begin.</span></div>}
            {editorSelected && (
              <article className="panel-card editorial-review-panel">
                <div className="panel-title"><div><span className="mini-label">CURRENT REVIEW</span><h2>{editorSelected.title}</h2></div><span className="status-pill">{editorSelected.status}</span></div>
                <p className="panel-note">{editorSelected.lastEditorialComment || 'No previous editorial note.'}</p>
                <div className="script-card-actions">
                  <button className="secondary-button with-icon" onClick={() => void openProtectedReader(editorSelected.id)}><LockKeyhole size={14}/> Open protected manuscript</button>
                  <button className="secondary-button" onClick={() => void reviewEditorScript('Under review')}>Mark under review</button>
                  <button className="secondary-button" onClick={() => void reviewEditorScript('Revision requested')}>Request revision</button>
                  <button className="primary-button" onClick={() => void reviewEditorScript('Approved')}>Approve</button>
                  <button className="ghost-button" onClick={() => void reviewEditorScript('Rejected')}>Reject</button>
                </div>
              </article>
            )}
            <div className="protection-banner"><FileCheck2 size={19} /><div><strong>EDITOR BOUNDARY</strong><span>Editorial decisions are recorded against the assigned manuscript. Administrator authority remains separate.</span></div></div>
          </section>
        )}

        {view === 'admin' && effectiveRole === 'admin' && (
          <section className="page-wrap admin-page">
            <div className="page-heading"><div><p className="eyebrow"><Settings2 size={14} /> ADMINISTRATION</p><h1>Nightjar, from the inside.</h1><p>Administrator accounts are isolated from listener, creator and controlled production roles.</p></div></div>
            <div className="admin-preview-control"><div><span className="mini-label">SAFE ROLE PREVIEW</span><strong>Inspect every product surface without changing your account.</strong><p>Preview state is local UI only. Your authenticated role remains Administrator and backend admin permissions are unchanged.</p></div><div className="admin-preview-buttons"><button onClick={() => selectPreviewRole('listener')}>Listener</button><button onClick={() => selectPreviewRole('creator')}>Creator</button><button onClick={() => selectPreviewRole('writer')}>Writer</button><button onClick={() => selectPreviewRole('editor')}>Editor</button><button onClick={clearAdminPreview}>Return to Admin</button></div></div>
            <div className="admin-grid">
              <button className="admin-panel admin-tile" onClick={() => openAdminPeople('listener')}><span className="admin-icon"><Headphones size={19} /></span><span className="mini-label">PEOPLE · LISTENERS</span><h2>{adminOverviewLoading ? '…' : adminOverview?.people?.counts?.listener ?? 0}</h2><p>Listener accounts with access to the catalogue and listening surfaces.</p><strong>Open listener profiles <ArrowRight size={13} /></strong></button>
              <button className="admin-panel admin-tile" onClick={() => openAdminPeople('creator')}><span className="admin-icon"><Mic2 size={19} /></span><span className="mini-label">PEOPLE · CREATORS</span><h2>{adminOverviewLoading ? '…' : adminOverview?.people?.counts?.creator ?? 0}</h2><p>Creator accounts and their current onboarding status.</p><strong>Open creator profiles <ArrowRight size={13} /></strong></button>
              <button className="admin-panel admin-tile" onClick={() => openAdminPeople('admin')}><span className="admin-icon"><ShieldCheck size={19} /></span><span className="mini-label">PEOPLE · ADMINISTRATORS</span><h2>{adminOverviewLoading ? '…' : adminOverview?.people?.counts?.admin ?? 2}</h2><p>Owner accounts with administrator permissions enforced by the backend allowlist.</p><strong>Open administrator profiles <ArrowRight size={13} /></strong></button>
              <button className="admin-panel admin-tile" onClick={() => openAdminPeople('writer')}><span className="admin-icon"><FileText size={19} /></span><span className="mini-label">PEOPLE · WRITERS</span><h2>{adminOverviewLoading ? '…' : adminOverview?.people?.counts?.writer ?? 0}</h2><p>Writers with protected manuscript and script-marketplace access.</p><strong>Open writer profiles <ArrowRight size={13} /></strong></button>
              <button className="admin-panel admin-tile" onClick={() => openAdminPeople('editor')}><span className="admin-icon"><FileCheck2 size={19} /></span><span className="mini-label">PEOPLE · EDITORS</span><h2>{adminOverviewLoading ? '…' : adminOverview?.people?.counts?.editor ?? 0}</h2><p>Editors assigned to controlled editorial workflows.</p><strong>Open editor profiles <ArrowRight size={13} /></strong></button>
              <button className="admin-panel admin-tile" onClick={() => openAdminPanel('approvals')}><span className="admin-icon"><Sparkles size={19} /></span><span className="mini-label">CREATOR APPROVALS</span><h2>{adminApplications.filter((application) => application.status === 'pending' || application.status === 'submitted').length || 'Review'}</h2><p>Open the live creator application queue and make an explicit approve, waitlist or reject decision.</p><strong>Open approval workflow <ArrowRight size={13} /></strong></button>
              <button className="admin-panel admin-tile" onClick={() => setModerationOpen(true)}><span className="admin-icon"><Headphones size={19} /></span><span className="mini-label">CONTENT MODERATION</span><h2>Review</h2><p>Preview submitted release audio and metadata before anything enters the public adult catalogue.</p><strong>Open release moderation <ArrowRight size={13} /></strong></button>

              <button className="admin-panel admin-tile" onClick={() => openAdminPanel('revenue')}><span className="admin-icon"><BarChart3 size={19} /></span><span className="mini-label">REVENUE</span><h2>Commercial controls</h2><p>Open the operating view for subscription revenue, creator-pool assumptions and payout readiness.</p><strong>Open commercial controls <ArrowRight size={13} /></strong></button>
              <button className="admin-panel admin-tile" onClick={() => openAdminPanel('editorial')}><span className="admin-icon"><FileCheck2 size={19} /></span><span className="mini-label">EDITORIAL</span><h2>{adminScripts.length}</h2><p>Assign live manuscripts to controlled editors and review production workflow.</p><strong>Open editorial controls <ArrowRight size={13} /></strong></button>
              <button className="admin-panel admin-tile" onClick={() => navigate('protection')}><span className="admin-icon"><ShieldCheck size={19} /></span><span className="mini-label">SAFETY</span><h2>Access & moderation</h2><p>Review reports, protection signals and age-assurance boundaries.</p><strong>Open Protection Centre <ArrowRight size={13} /></strong></button>
              <button className="admin-panel admin-tile subscription-tile" onClick={() => openAdminPanel('subscriptions')}><span className="admin-icon"><WalletCards size={19} /></span><span className="mini-label">SUBSCRIPTIONS</span><h2>{adminOverviewLoading ? '…' : adminOverview?.subscriptions?.active ?? 0}</h2><p>Active paid subscriptions tracked by the Nightjar billing ledger.</p><strong>{adminOverview?.subscriptions?.trialing ?? 0} trial · {adminOverview?.subscriptions?.pastDue ?? 0} past due <ArrowRight size={13} /></strong></button>
              <button className="admin-panel admin-tile admin-economics" onClick={() => openAdminPanel('economics')}><span className="admin-icon"><Coins size={19} /></span><span className="mini-label">LISTENING ECONOMICS</span><h2>£5 / month</h2><p>Launch-price planning reference and the transparent verified-listening allocation model.</p><strong>Open economics assumptions <ArrowRight size={13} /></strong></button>
              <div className="admin-panel branding-admin-panel"><span className="admin-icon"><Upload size={19} /></span><span className="mini-label">BRANDING</span><h2>Nightjar logo</h2><p>Upload or replace the logo used across the Nightjar shell. Only administrators can change it.</p><div className="logo-editor"><div className="logo-preview-box">{logoUrl ? <img src={logoUrl} alt="Current Nightjar logo" /> : <span><Moon size={28} /> No logo uploaded</span>}</div><label className="secondary-button upload-label"><Upload size={15} /> {logoUploading ? 'Uploading…' : 'Choose logo'}<input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden disabled={logoUploading} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadLogo(file); event.currentTarget.value = ''; }} /></label></div><strong>Admin editable · max 3 MB</strong></div>
            </div>
            <div className="demo-warning admin-note"><ShieldCheck size={17} /><div><strong>ADMIN ACCESS MODEL</strong><span>Only the three approved Nightjar owner emails receive this role. Administrator access is enforced by the backend allowlist.</span></div></div>
            {canAdmin && <SecurityReviewPanel notify={notify} onAccountStateChange={loadAdminOverview} />}
            {adminPeopleRole && <div className="people-drawer" role="dialog" aria-modal="true" aria-label={`${roleMeta[adminPeopleRole].label} accounts`}><div className="people-drawer-head"><div><span className="mini-label">PEOPLE / ACCOUNT DIRECTORY</span><h2>{roleMeta[adminPeopleRole].label}s</h2><p>{adminPeopleRole === 'admin' ? 'Administrator access is limited to the owner allowlist.' : `Current ${roleMeta[adminPeopleRole].label.toLowerCase()} accounts recorded by Nightjar.`}</p></div><button className="icon-button" onClick={() => setAdminPeopleRole(null)} aria-label="Close account directory"><X size={18} /></button></div><div className="people-drawer-summary"><strong>{adminOverview?.people?.counts?.[adminPeopleRole] ?? 0}</strong><span>accounts in this role</span></div><div className="people-list">{(adminPeopleRole === 'admin' ? (adminOverview?.people?.administrators ?? []) : (adminOverview?.people?.accounts ?? []).filter((account: any) => account.role === adminPeopleRole)).map((account: any) => <article className="people-row" key={account.userId ?? account.email}><span className="account-chip-avatar">{(account.name ?? account.email ?? 'N').slice(0, 1).toUpperCase()}</span><div><strong>{account.name ?? 'Nightjar account'}</strong><span>{account.email ?? 'Owner allowlist account'}</span></div><em>{account.status === 'pending_review' ? 'Pending review' : 'Active'}</em></article>)}{(adminPeopleRole === 'admin' ? (adminOverview?.people?.administrators ?? []) : (adminOverview?.people?.accounts ?? []).filter((account: any) => account.role === adminPeopleRole)).length === 0 && <div className="people-empty"><Users size={18} /><strong>No accounts in this role yet</strong><span>The live directory will populate as accounts are created or approved.</span></div>}</div></div>}
            {adminPanel && <div className="admin-panel-modal" role="dialog" aria-modal="true"><section><div className="admin-modal-head"><div><span className="mini-label">ADMINISTRATION / {adminPanel.toUpperCase()}</span><h2>{adminPanel === 'approvals' ? 'Creator approval queue' : adminPanel === 'subscriptions' ? 'Subscription ledger' : adminPanel === 'revenue' ? 'Commercial controls' : adminPanel === 'editorial' ? 'Editorial assignments' : 'Listening economics'}</h2><p>{adminPanel === 'approvals' ? 'Review creator applications and record an explicit decision.' : adminPanel === 'subscriptions' ? 'Live subscription records only. Empty means billing data is not connected yet.' : adminPanel === 'revenue' ? 'Operational assumptions are separated from confirmed billing data.' : adminPanel === 'editorial' ? 'Assign live manuscripts to active Editor accounts.' : 'Planning assumptions for the verified-listening creator model.'}</p></div><button className="icon-button" onClick={() => setAdminPanel(null)} aria-label="Close administrator panel"><X size={18} /></button></div>{adminPanel === 'approvals' && <div className="admin-data-list">{adminPanelLoading ? <div className="people-empty">Loading approval queue…</div> : adminApplications.length === 0 ? <div className="people-empty"><Sparkles size={18} /><strong>No creator applications</strong><span>The queue is empty. New creator applications will appear here.</span></div> : adminApplications.map((application) => <article className="admin-data-row" key={application.id}><div><strong>{application.creatorName ?? application.displayName ?? application.email ?? 'Creator applicant'}</strong><span>{application.email ?? 'No email supplied'} · {application.status ?? 'pending'}</span></div><div className="admin-data-actions"><button className="secondary-button" onClick={() => void decideCreatorApplication(application, 'waitlist')}>Waitlist</button><button className="secondary-button" onClick={() => void decideCreatorApplication(application, 'rejected')}>Reject</button><button className="primary-button" onClick={() => void decideCreatorApplication(application, 'approved')}>Approve</button></div></article>)}</div>}{adminPanel === 'editorial' && <div>{adminPanelLoading ? <div className="people-empty">Loading editorial controls…</div> : <div className="admin-data-list">{adminScripts.map((script) => <article className="admin-data-row" key={script.id}><div><strong>{script.title}</strong><span>{script.status ?? 'Draft'} · v{script.version ?? 1}</span></div><select className="admin-select" defaultValue={script.editorUserId ?? ''} onChange={(event) => { if (event.target.value) void assignEditor(script.id, event.target.value); }}><option value="" disabled>{script.editorUserId ? 'Reassign editor' : 'Assign editor'}</option>{adminEditors.map((editor) => <option key={editor.userId} value={editor.userId}>{editor.name ?? editor.email ?? editor.userId}</option>)}</select></article>)}{!adminScripts.length && <div className="people-empty"><FileText size={18} /><strong>No manuscripts available.</strong><span>Submitted live scripts will appear here for assignment.</span></div>}</div>}</div>}{adminPanel === 'subscriptions' && <div>{adminPanelLoading ? <div className="people-empty">Loading subscription ledger…</div> : <><div className="admin-modal-grid"><div className="admin-modal-stat"><span>Active</span><strong>{adminOverview?.subscriptions?.active ?? 0}</strong></div><div className="admin-modal-stat"><span>Trial</span><strong>{adminOverview?.subscriptions?.trialing ?? 0}</strong></div><div className="admin-modal-stat"><span>Past due</span><strong>{adminOverview?.subscriptions?.pastDue ?? 0}</strong></div></div><div className="admin-data-list">{adminSubscriptions.length === 0 ? <div className="people-empty"><WalletCards size={18} /><strong>No live subscription records</strong><span>Billing is not connected yet; no subscription data is being fabricated.</span></div> : adminSubscriptions.map((subscription) => <article className="admin-data-row" key={subscription.id}><div><strong>{subscription.email ?? subscription.userId ?? 'Subscriber'}</strong><span>{subscription.plan ?? 'Nightjar · £5 monthly'} · {subscription.status ?? 'unknown'}</span></div><span>{subscription.currentPeriodEnd ?? '—'}</span></article>)}</div></>}</div>}{adminPanel === 'revenue' && <div><div className="admin-modal-grid"><div className="admin-modal-stat"><span>Planning price</span><strong>£5</strong></div><div className="admin-modal-stat"><span>Live subscriptions</span><strong>{adminOverview?.subscriptions?.active ?? 0}</strong></div><div className="admin-modal-stat"><span>Confirmed gross MRR</span><strong>{adminOverview?.subscriptions?.active ? `£${(adminOverview.subscriptions.active * 5).toLocaleString('en-GB')}` : '£0'}</strong></div></div><div className="admin-formula"><div><b>01</b><strong>Subscription revenue after applicable deductions becomes the commercial base.</strong></div><div><b>02</b><strong>A defined creator pool is allocated from the eligible net revenue.</strong></div><div><b>03</b><strong>Creator shares are attributed using verified listening rather than fixed per-drop promises.</strong></div></div><div className="demo-warning admin-note"><ShieldCheck size={17} /><div><strong>CONFIRMED VS PLANNING</strong><span>£5 is a planning reference. The dashboard does not present illustrative creator earnings as confirmed payouts.</span></div></div></div>}{adminPanel === 'economics' && <div><div className="admin-modal-grid"><div className="admin-modal-stat"><span>Launch reference</span><strong>£5</strong></div><div className="admin-modal-stat"><span>Creator pool</span><strong>Defined before launch</strong></div><div className="admin-modal-stat"><span>Allocation</span><strong>Verified listening</strong></div></div><div className="admin-formula"><div><b>01</b><strong>Net subscription revenue</strong></div><div><b>02</b><strong>Creator pool</strong></div><div><b>03</b><strong>Eligible verified listening determines each creator share</strong></div></div><p className="panel-note">The final pool percentage, eligible-listening definition, exclusions, payout timing and any reserve policy should be published before creators enter the commercial program.</p></div>}</section></div>}
          </section>
        )}
      </main>

      <footer className="site-footer"><div className="footer-brand">{logoUrl ? <img className="brand-logo footer-logo" src={logoUrl} alt="Nightjar" /> : <span className="nightjar-mark"><Moon size={15} /></span>}<strong>NIGHTJAR</strong></div><span>Premium immersive audio for adults.</span><span>{user ? accountLabel + ' account' : 'Adult access required'}</span></footer>

      {protectedReaderOpen && protectedReaderScript && <ProtectedReader data={protectedReaderScript} close={() => setProtectedReaderOpen(false)} record={(eventType) => void recordProtectionEvent(eventType, protectedReaderScript.script?.id, protectedReaderScript.readerSession?.sessionId)} notify={notify} />}
      {playing && <NightjarPlayer track={tracks.find((track) => track.id === playing) ?? null} queue={tracks} onSelectTrack={(next) => setPlaying(next.id)} intent={currentIntent} onClose={() => setPlaying(null)} notify={notify} />}
      {creatorProfileUserId && <CreatorProfile creatorUserId={creatorProfileUserId} followingIds={followingProfileIds} onToggleFollow={toggleCreatorFollow} onPlayRelease={playReleaseFromCreatorProfile} onClose={() => setCreatorProfileUserId(null)} notify={notify} />}
      <ContentModeration open={moderationOpen} onClose={() => setModerationOpen(false)} notify={notify} />
      {showOnboarding && user && role !== 'admin' && role !== 'editor' && <NightjarOnboarding initialProfile={profile} role={role} onComplete={(nextProfile) => { setProfile((current: any) => ({ ...current, ...nextProfile })); setShowOnboarding(false); }} onSkip={() => setShowOnboarding(false)} notify={notify} />}
      {toast && <div className="toast">{toast}</div>}

      {user && !rolePicker && (
        <button className="floating-account" onClick={() => setRolePicker(true)} aria-label="Open account information">
          <UserCircle2 size={16} /><span>{roleMeta[role ?? 'listener'].label}</span>
        </button>
      )}
    </div>
  );
}

function mapCatalogueTracks(releases: any[]): Track[] {
  return releases.map((release, index) => ({ ...releaseToTrack(release), featured: release.featured === true || index === 0 }));
}

function releaseToTrack(release: any): Track {
  return {
    id: String(release.id),
    title: String(release.title ?? 'Untitled release'),
    creator: String(release.creatorName ?? 'Nightjar creator'),
    duration: release.durationMinutes ? String(release.durationMinutes) + ' min' : '—',
    category: String(release.category ?? 'Audio'),
    descriptor: String(release.description ?? 'No description supplied.'),
    audioUrl: release.audioUrl ?? null,
    artworkUrl: release.artworkUrl ?? null,
    creatorUserId: release.creatorUserId,
  };
}

function LiveTrackCard({ track, playing, favourite, onPlay, onFavourite, reason, feedback }: { track: Track; playing: boolean; favourite: boolean; onPlay: (track: Track) => void; onFavourite: () => void; reason?: string; feedback?: ReactNode }) {
  return <article className="track-card">
    <div className="track-cover" style={track.artworkUrl ? { backgroundImage: 'url("' + track.artworkUrl + '")', backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}>
      <span className="track-index">{track.category}</span>
      {!track.artworkUrl && <div className="track-cover-mark"><Moon size={22} /></div>}
      <button className="cover-play" disabled={!track.audioUrl} onClick={() => onPlay(track)} aria-label={!track.audioUrl ? 'Audio not connected' : playing ? 'Pause ' + track.title : 'Play ' + track.title}>
        {playing ? <Pause size={18} /> : <Play size={18} fill="currentColor" />}
      </button>
    </div>
    <div className="track-body">
      <div className="track-type"><span>{track.creator}</span><span>{track.duration}</span></div>
      <h3>{track.title}</h3>
      <p>{track.descriptor}</p>
      <div className="track-footer"><span className="creator-link">{track.audioUrl ? 'Playable audio' : 'Audio not connected'}</span><button className="icon-button" onClick={onFavourite} aria-label={favourite ? 'Remove favourite' : 'Add favourite'}><Heart size={16} fill={favourite ? 'currentColor' : 'none'} /></button></div>
      {reason && <p className="recommendation-reason"><Sparkles size={12} />{reason}</p>}
      {feedback}
    </div>
  </article>;
}

function ProtectedReader({ data, close, record, notify }: { data: any; close: () => void; record: (eventType: string) => void; notify: (message: string) => void }) {
  const script = data.script ?? {};
  const sessionId = String(data.readerSession?.sessionId ?? '');
  const [pageData, setPageData] = useState<any | null>(null);
  const [pageLoading, setPageLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  const loadPage = async (page: number) => {
    if (!script.id || !sessionId || pageLoading) return;
    setPageLoading(true);
    try {
      const { data: next } = await api.get('/api/scripts/' + encodeURIComponent(String(script.id)) + '/content?sessionId=' + encodeURIComponent(sessionId) + '&page=' + String(page));
      setPageData(next ?? null);
    } catch {
      notify('This protected page could not be loaded. The reader session may have expired or been revoked.');
    } finally {
      setPageLoading(false);
    }
  };

  const exportFullScript = async () => {
    if (!script.id || !sessionId || exporting || data.exportAllowed !== true) return;
    setExporting(true);
    try {
      const { data: exported } = await api.get('/api/scripts/' + encodeURIComponent(String(script.id)) + '/export?sessionId=' + encodeURIComponent(sessionId));
      const blob = new Blob([String(exported?.content ?? '')], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = String(exported?.fileName ?? 'nightjar-script.txt');
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      notify('Full script exported under the writer’s explicit permission' + (exported?.forensicToken ? ' · FP ' + String(exported.forensicToken) : '') + '.');
    } catch {
      notify('Full script export is not available for this reader session.');
    } finally {
      setExporting(false);
    }
  };

  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'p') {
        event.preventDefault();
        record('print_blocked');
        notify('Printing is disabled in the protected reader. Use writer-authorised Export full script when full handoff is permitted.');
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        record('blocked_interaction');
        notify('Saving the protected reader page is disabled. Writer-authorised exports remain available when granted.');
      }
    };
    const onBeforePrint = () => {
      record('print_blocked');
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('beforeprint', onBeforePrint);
    void loadPage(0);
    return () => {
      document.body.style.overflow = original;
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('beforeprint', onBeforePrint);
    };
  }, [script.id, sessionId]);

  const content = String(pageData?.content ?? '');
  const copyAllowed = data.copyAllowed === true;
  const blockUnlessAllowed = (event: ReactClipboardEvent | ReactMouseEvent | ReactDragEvent, type: string) => {
    if (copyAllowed) return;
    event.preventDefault();
    record(type);
    if (type === 'copy_blocked') notify('Copy is disabled unless the writer explicitly grants it.');
  };

  return <div className="protected-reader-backdrop" role="dialog" aria-modal="true" aria-labelledby="protected-reader-title">
    <section className="protected-reader"
      onCopy={(event) => blockUnlessAllowed(event, 'copy_blocked')}
      onCut={(event) => blockUnlessAllowed(event, 'cut_blocked')}
      onPaste={(event) => blockUnlessAllowed(event, 'paste_blocked')}
      onContextMenu={(event) => blockUnlessAllowed(event, 'contextmenu_blocked')}
      onDragStart={(event) => blockUnlessAllowed(event, 'drag_blocked')}>
      <header>
        <div><span className="mini-label">NIGHTJAR / PROTECTED SCRIPT</span><h2 id="protected-reader-title">{script.title ?? 'Protected manuscript'}</h2><p>Reader session {sessionId || 'authorised'} · expires {data.readerSession?.expiresAt ? new Date(data.readerSession.expiresAt).toLocaleTimeString('en-GB') : 'soon'}</p></div>
        <button className="icon-button" onClick={close} aria-label="Close protected manuscript"><X size={18} /></button>
      </header>
      <div className="reader-notice"><ShieldCheck size={15} /><span>The browser only receives the page you are reading. Access, page views and permitted exports are recorded against this short-lived session.</span></div>
      <article className={copyAllowed ? 'reader-body copy-enabled' : 'reader-body'} data-nosnippet>
        <div className="reader-watermark-layer" aria-hidden="true">{Array.from({ length: 30 }).map((_, index) => <span key={index}>{pageData?.watermark ?? data.readerSession?.watermark ?? 'NIGHTJAR · AUTHORISED READER SESSION'}</span>)}</div>
        <p className="reader-watermark">{pageData?.watermark ?? data.readerSession?.watermark ?? 'NIGHTJAR · AUTHORISED READER SESSION'}</p>
        {pageLoading && !pageData ? <p>Loading protected page…</p> : content ? content.split(/\n+/).filter(Boolean).map((paragraph: string, index: number) => <p key={index}>{paragraph}</p>) : <p>No manuscript text is available on this page.</p>}
        {(pageData?.forensicToken || pageData?.contentHash) && <p className="reader-fingerprint">{pageData?.forensicToken ? 'FORENSIC FP ' + String(pageData.forensicToken) + ' · ' : ''}{pageData?.contentHash ? 'SHA-256 ' + String(pageData.contentHash).slice(0, 20) + '…' : ''}</p>}
      </article>
      <div className="reader-pagination">
        <button className="secondary-button" disabled={pageLoading || !pageData?.hasPrevious} onClick={() => void loadPage(Math.max(0, Number(pageData?.page ?? 0) - 1))}>Previous page</button>
        <span>Page {Number(pageData?.page ?? 0) + 1} of {Number(pageData?.totalPages ?? 1)}</span>
        <button className="secondary-button" disabled={pageLoading || !pageData?.hasNext} onClick={() => void loadPage(Number(pageData?.page ?? 0) + 1)}>Next page</button>
      </div>
      <footer>
        <span><LockKeyhole size={14} /> Copy {copyAllowed ? 'allowed by writer' : 'blocked'}</span>
        <span><Download size={14} /> Export {data.exportAllowed ? 'allowed by writer' : 'blocked'}</span>
        <span>Page access logged</span>
        {data.exportAllowed && <button className="ghost-button with-icon reader-export-button" disabled={exporting} onClick={() => void exportFullScript()}><Download size={13}/>{exporting ? 'Preparing…' : 'Export full script'}</button>}
      </footer>
    </section>
  </div>;
}


export default App;
