import { useEffect, useMemo, useState } from 'react';
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
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Upload,
  UserCircle2,
  Users,
  Volume2,
  X,
  Eye,
  FileText,
  ShieldAlert,
  ClipboardX,
  Ban,
  Download,
  FileCheck2,
  Coins,
  WalletCards,
} from 'lucide-react';

type View = 'discover' | 'creators' | 'creator' | 'writer' | 'editor' | 'admin' | 'protection' | 'profile';
type AgeStage = 'gate' | 'assurance' | 'preview';
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
  initials?: string;
  note?: string;
};

type Spotlight = {
  kind: 'creator' | 'writer';
  name: string;
  handle?: string | null;
  title?: string;
  edition?: string;
  detail?: string;
  initials?: string;
  targetId?: string;
  releaseId?: string | null;
};

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
  const [ageLoading, setAgeLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [favouriteReleaseIds, setFavouriteReleaseIds] = useState<string[]>([]);
  const [followingCreatorIds, setFollowingCreatorIds] = useState<string[]>([]);
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
  const [securityAlerts, setSecurityAlerts] = useState<any[]>([]);
  const [securityAlertsLoading, setSecurityAlertsLoading] = useState(false);
  const [adminPanel, setAdminPanel] = useState<'approvals' | 'revenue' | 'subscriptions' | 'economics' | null>(null);
  const [adminApplications, setAdminApplications] = useState<any[]>([]);
  const [adminSubscriptions, setAdminSubscriptions] = useState<any[]>([]);
  const [adminPanelLoading, setAdminPanelLoading] = useState(false);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [creatorDirectory, setCreatorDirectory] = useState<CreatorSummary[]>([]);
  const [creatorSpotlightList, setCreatorSpotlightList] = useState<Spotlight[]>([]);
  const [writerSpotlightList, setWriterSpotlightList] = useState<Spotlight[]>([]);
  const [creatorDashboard, setCreatorDashboard] = useState<{ metrics: any; releases: any[] }>({ metrics: {}, releases: [] });
  const [creatorDashboardLoading, setCreatorDashboardLoading] = useState(false);
  const [creatorDraft, setCreatorDraft] = useState({
    title: '', description: '', category: '', genre: '', mood: '', tags: '', tropes: '',
    durationMinutes: '', audioUrl: '', artworkUrl: '',
  });
  const [liveRecommendations, setLiveRecommendations] = useState<any[]>([]);
  const [liveTrending, setLiveTrending] = useState<any[]>([]);
  const [currentIntent, setCurrentIntent] = useState('');

  const [writerDraftTitle, setWriterDraftTitle] = useState('');
  const [writerScripts, setWriterScripts] = useState<any[]>([]);
  const [writerSelected, setWriterSelected] = useState<any | null>(null);
  const [editorQueue, setEditorQueue] = useState<any[]>([]);
  const [editorSelected, setEditorSelected] = useState<any | null>(null);
  const [protectedScripts, setProtectedScripts] = useState<any[]>([]);
  const [protectedReaderScript, setProtectedReaderScript] = useState<any | null>(null);

  const featured = useMemo(() => tracks.find((track) => track.featured) ?? tracks[0] ?? null, [tracks]);
  const spotlightIndex = Math.floor(Date.now() / 86400000) % Math.max(creatorSpotlightList.length, 1);
  const creatorSpotlight = creatorSpotlightList[spotlightIndex] ?? null;
  const writerSpotlight = writerSpotlightList[spotlightIndex] ?? null;
  const creators = creatorDirectory;
  const creatorSpotlights = creatorSpotlightList;
  const writerSpotlights = writerSpotlightList;
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
      await loadAccount();
      await refreshAgeStatus();
    };
    void restore();
    return () => { cancelled = true; window.removeEventListener('popstate', onPop); };
  }, []);

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

  const navigate = (nextView: View) => {
    const path = nextView === 'discover' ? '/discover' : '/' + nextView;
    if (window.location.pathname !== path) window.history.pushState({}, '', path);
    setView(nextView);
    setMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const loadLiveProductData = async () => {
    try {
      const [catalogueResponse, creatorsResponse, spotlightResponse] = await Promise.all([
        api.get('/api/catalogue'),
        api.get('/api/creators'),
        api.get('/api/spotlights'),
      ]);
      const liveTracks = (catalogueResponse.data?.catalogue ?? []).map((release: any, index: number) => ({
        id: String(release.id),
        title: release.title,
        creator: release.creatorName ?? 'Nightjar creator',
        duration: release.durationMinutes ? String(release.durationMinutes) + ' min' : '—',
        category: release.category ?? 'Audio',
        descriptor: release.description ?? 'No description supplied.',
        featured: release.featured === true || index === 0,
        audioUrl: release.audioUrl ?? null,
        artworkUrl: release.artworkUrl ?? null,
        creatorUserId: release.creatorUserId,
      })) as Track[];
      setTracks(liveTracks);
      setCreatorDirectory((creatorsResponse.data?.creators ?? []).map((creator: any) => ({
        userId: String(creator.userId),
        name: creator.displayName ?? 'Nightjar creator',
        handle: creator.handle ?? null,
        initials: creator.avatarInitials ?? undefined,
        note: creator.headline ?? creator.bio ?? undefined,
        releases: creator.releaseCount ?? 0,
      })));
      const spotlights = spotlightResponse.data?.spotlights ?? [];
      setCreatorSpotlightList(spotlights.filter((item: any) => item.kind === 'creator' && item.name).map((item: any) => ({
        kind: 'creator',
        name: item.name,
        handle: item.handle,
        title: item.title,
        edition: item.edition,
        detail: item.detail,
        initials: item.initials,
        targetId: item.targetId,
        releaseId: item.releaseId,
      })));
      setWriterSpotlightList(spotlights.filter((item: any) => item.kind === 'writer' && item.name).map((item: any) => ({
        kind: 'writer',
        name: item.name,
        handle: item.handle,
        title: item.title,
        edition: item.edition,
        detail: item.detail,
        initials: item.initials,
        targetId: item.targetId,
        releaseId: item.releaseId,
      })));
      if (user) {
        const [recommendationsResponse, trendingResponse, favouritesResponse, followsResponse] = await Promise.all([
          api.get('/api/recommendations' + (currentIntent ? '?intent=' + encodeURIComponent(currentIntent) : '')),
          api.get('/api/trending'),
          api.get('/api/favourites'),
          api.get('/api/follows'),
        ]);
        setLiveRecommendations(recommendationsResponse.data?.recommendations ?? []);
        setLiveTrending(trendingResponse.data?.trending ?? []);
        setFavouriteReleaseIds((favouritesResponse.data?.favourites ?? []).map((item: any) => String(item.releaseId)));
        setFollowingCreatorIds((followsResponse.data?.follows ?? []).map((item: any) => String(item.creatorUserId)));
      }
    } catch {
      setTracks([]);
      setCreatorDirectory([]);
      setCreatorSpotlightList([]);
      setWriterSpotlightList([]);
      setLiveRecommendations([]);
      setLiveTrending([]);
    }
  };

  const createCreatorRelease = async () => {
    if (!creatorDraft.title.trim()) return notify('Release title is required.');
    try {
      const { data } = await api.post('/api/creator/releases', {
        ...creatorDraft,
        tags: creatorDraft.tags.split(',').map((item) => item.trim()).filter(Boolean),
        tropes: creatorDraft.tropes.split(',').map((item) => item.trim()).filter(Boolean),
        durationMinutes: Number(creatorDraft.durationMinutes || 0),
      });
      if (data?.release) setCreatorDraft({ title:'', description:'', category:'', genre:'', mood:'', tags:'', tropes:'', durationMinutes:'', audioUrl:'', artworkUrl:'' });
      await loadCreatorDashboard();
      notify('Release draft created.');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Release could not be created.');
    }
  };

  const updateCreatorRelease = async (release: any) => {
    try {
      await api.put('/api/creator/releases/' + release.id, release);
      await loadCreatorDashboard();
      notify('Release updated.');
    } catch {
      notify('Release could not be updated.');
    }
  };

  const publishCreatorRelease = async (releaseId: string) => {
    try {
      await api.post('/api/creator/releases/' + releaseId + '/publish');
      await loadCreatorDashboard();
      await loadLiveProductData();
      notify('Release published.');
    } catch {
      notify('Release could not be published. Attach a real audio URL first.');
    }
  };

  const deleteCreatorRelease = async (releaseId: string) => {
    if (!window.confirm('Delete this release draft?')) return;
    try {
      await api.delete('/api/creator/releases/' + releaseId);
      await loadCreatorDashboard();
      notify('Release draft deleted.');
    } catch {
      notify('Release could not be deleted.');
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

  const loadWriterScripts = async () => {
    if (!user) return;
    try {
      const { data } = await api.get('/api/writer/scripts');
      const items = data?.scripts ?? [];
      setWriterScripts(items);
      setWriterSelected((current: any) => current && items.some((item: any) => item.id === current.id) ? current : items[0] ?? null);
    } catch {
      setWriterScripts([]);
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
        void loadSecurityAlerts();
        return;
      }
    } catch { /* account endpoint remains authoritative */ }
    try {
      const { data } = await api.get('/api/account');
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
    if (!auth.isSignedIn()) return false;
    try {
      const { data } = await api.get('/api/age/status');
      setAgeVerified(data?.verified === true);
      setAgeConfigured(data?.configured === true);
      setAgeStatus(data?.status === 'COMPLETE' ? 'COMPLETE' : data?.status === 'PENDING' ? 'PENDING' : data?.status === 'FAIL' ? 'FAIL' : 'NOT_STARTED');
      if (data?.verified === true) setAgeStage('assurance');
      return data?.verified === true;
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
        setAgeStage('assurance');
        notify('Sandbox age verification marked complete for this administrator test account.');
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
      if (alreadyVerified) return;
      const { data } = await api.post('/api/age/session');
      setAgeConfigured(data?.configured === true);
      if (data?.verified === true) {
        setAgeVerified(true);
        setAgeStatus('COMPLETE');
        setAgeStage('assurance');
        notify('Age verification already completed.');
      } else if (data?.launchUrl) {
        setAgeStatus('PENDING');
        window.open(data.launchUrl, '_blank', 'noopener,noreferrer');
        notify('Secure Yoti sandbox opened. Complete the check, then return to Nightjar.');
      } else if (data?.testAvailable) {
        notify('Yoti sandbox is not configured yet. The administrator sandbox test is available below.');
      } else {
        notify('Secure age verification is being connected. Please try again once the provider is configured.');
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
      await loadAccount();
      await refreshAgeStatus();
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

  const recordProtectionEvent = async (eventType: string, relatedId = 'protected-script') => {
    if (!user) return;
    try {
      await api.post('/api/protection/event', { eventType, relatedType: 'script', relatedId, summary: eventType === 'copy_blocked' ? 'Protected copy interaction blocked; no clipboard contents were captured.' : 'Protected interaction recorded by Nightjar.' });
    } catch { }
  };

  const openProtectedReader = async (scriptId: string) => {
    try {
      const { data } = await api.get('/api/scripts/' + scriptId);
      if (data?.canReadFull === false) {
        notify('This manuscript has not been granted for full reading by the writer.');
        return;
      }
      setProtectedReaderScript(data);
      setProtectedReaderOpen(true);
      void recordProtectionEvent('script_view', scriptId);
    } catch {
      notify('Protected script access could not be opened.');
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

  const toggleCreatorFollow = async (creatorUserId: string) => {
    try {
      if (followingCreatorIds.includes(creatorUserId)) {
        await api.delete('/api/follows/creators/' + creatorUserId);
        setFollowingCreatorIds((items) => items.filter((id) => id !== creatorUserId));
      } else {
        await api.post('/api/follows/creators/' + creatorUserId);
        setFollowingCreatorIds((items) => [...items, creatorUserId]);
      }
    } catch {
      notify('Follow could not be updated.');
    }
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

  const requestScriptAccess = async (script: any) => {
    if (!user || !script?.id) return;
    try {
      await api.post('/api/scripts/' + script.id + '/request-access', { writerUserId: script.writerUserId ?? null });
      notify('Access request recorded. The writer can review it from their workflow.');
    } catch {
      notify('The access request could not be recorded.');
    }
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

  const loadSecurityAlerts = async () => {
    if (!canAdmin) return;
    setSecurityAlertsLoading(true);
    try {
      const { data } = await api.get('/api/admin/security-alerts');
      setSecurityAlerts(data?.alerts ?? []);
    } catch { notify('Security alerts could not be loaded.'); }
    finally { setSecurityAlertsLoading(false); }
  };

  const suspendFromSecurityAlert = async (alert: any) => {
    if (!canAdmin || !alert?.id) return;
    try {
      await api.post('/api/admin/security-alerts/' + alert.id + '/suspend', {});
      await loadSecurityAlerts();
      await loadAdminOverview();
      notify('Account suspended and active protected-reader sessions revoked.');
    } catch { notify('The security action could not be completed.'); }
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
      notify(`Report ${data?.report?.caseId ?? 'submitted'} submitted.`);
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

  const openAdminPanel = (panel: 'approvals' | 'revenue' | 'subscriptions' | 'economics') => {
    if (!canAdmin) return;
    setAdminPeopleRole(null);
    setAdminPanel(panel);
    if (panel === 'approvals') void loadAdminApplications();
    if (panel === 'subscriptions') void loadAdminSubscriptions();
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
          <button className="primary-button wide-button" onClick={() => setAgeStage('assurance')}>
            Continue to age assurance <ArrowRight size={17} />
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
            <div><strong>Yoti Age Verification</strong><span>{ageConfigured ? 'Sandbox provider connected and ready for a verification session.' : 'Sandbox integration is ready; provider credentials still need to be added.'}</span></div>
            <span className="status-pill">{ageStatus === 'COMPLETE' ? 'VERIFIED' : ageStatus === 'PENDING' ? 'PENDING' : ageConfigured ? 'READY' : 'SETUP REQUIRED'}</span>
          </div>
          <div className="verification-list">
            <div><Check size={16} /><span>Adult access is checked before the catalogue is released.</span></div>
            <div><Check size={16} /><span>Verification can be designed around data minimisation.</span></div>
            <div><Check size={16} /><span>Raw identity documents do not belong in the Nightjar content database.</span></div>
          </div>
          <button className="primary-button wide-button" disabled={ageLoading} onClick={() => void openAgeCheck()}>
            {ageLoading ? 'Opening secure check…' : ageVerified ? 'Age verified — continue' : 'Open secure age check'} <LockKeyhole size={16} />
          </button>
          {!ageConfigured && user && role === 'admin' && <button className="secondary-button wide-button" disabled={ageLoading} onClick={() => void runAdminSandboxTest()}>
            Run administrator sandbox test <ShieldCheck size={16} />
          </button>}
          <button className="secondary-button wide-button" onClick={() => setAgeStage('assurance')}>
            Enter product preview <ArrowRight size={16} />
          </button>
          <p className="access-fine">Product preview remains clearly labelled as preview access. Production adult access should only be granted after a real provider result is complete.</p>
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
          {(effectiveRole === 'listener' || effectiveRole === 'admin' || !role) && <button className={view === 'creators' ? 'nav-link active' : 'nav-link'} onClick={() => navigate('creators')}>Creators</button>}
          {(creatorOnly || adminOnly) && <button className={view === 'creator' ? 'nav-link active' : 'nav-link'} onClick={() => { navigate('creator'); void loadCreatorDashboard(); }}>Creator Studio</button>}
          {effectiveRole === 'writer' && <button className={view === 'writer' ? 'nav-link active' : 'nav-link'} onClick={() => { navigate('writer'); void loadWriterScripts(); }}>Writer Studio</button>}
          {effectiveRole === 'editor' && <button className={view === 'editor' ? 'nav-link active' : 'nav-link'} onClick={() => { navigate('editor'); void loadEditorQueue(); }}>Editorial</button>}
          {canProtection && <button className={view === 'profile' ? 'nav-link active' : 'nav-link'} onClick={() => { navigate('profile'); void loadProfile(); }}>Profile</button>}
          {canProtection && <button className={view === 'protection' ? 'nav-link active' : 'nav-link'} onClick={() => { navigate('protection'); void loadProtection(); }}>Protection</button>}
          {canAdmin && <button className={view === 'admin' ? 'nav-link active' : 'nav-link'} onClick={() => { navigate('admin'); void loadAdminOverview(); void loadSecurityAlerts(); }}>Admin</button>}
          {canAdmin && <div className="admin-preview-strip"><span><ShieldCheck size={14} /> ADMIN PREVIEW · REAL ROLE: ADMINISTRATOR</span><button className={previewRole === 'listener' ? 'active' : ''} onClick={() => selectPreviewRole('listener')}>Listener</button><button className={previewRole === 'creator' ? 'active' : ''} onClick={() => selectPreviewRole('creator')}>Creator</button><button className={previewRole === 'writer' ? 'active' : ''} onClick={() => selectPreviewRole('writer')}>Writer</button><button className={previewRole === 'editor' ? 'active' : ''} onClick={() => selectPreviewRole('editor')}>Editor</button><button className={!previewRole ? 'active' : ''} onClick={clearAdminPreview}>Admin</button></div>}
        </nav>

        <div className="top-actions">
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
                <div className="hero-kicker"><span className="eyebrow"><Sparkles size={14}/> 18+ / AUDIO FIRST</span><span className="kicker-line"/><span className="kicker-note">Personalised from explicit taste and current listening intent</span></div>
                <h1>Premium immersive<span> audio for adults.</span></h1>
                <p className="hero-lede">Original stories, performances and atmospheres built around voice, space and the feeling of a story happening close by.</p>
                <div className="hero-actions"><button className="primary-button" onClick={()=>document.getElementById('catalogue')?.scrollIntoView({behavior:'smooth'})}>Enter the listening room <ArrowRight size={16}/></button><button className="text-button with-icon" onClick={()=>creatorOnly||adminOnly?navigate('creator'):notify('Apply as a Creator to access Creator Studio.')}><Mic2 size={15}/> For creators <ChevronRight size={16}/></button></div>
                <div className="hero-signals"><span><Headphones size={15}/> Headphone-first</span><span><Mic2 size={15}/> Creator-led</span><span><ShieldCheck size={15}/> 18+ access</span></div>
              </div>
              <div className="hero-art"><div className="orbit orbit-a"/><div className="orbit orbit-b"/><div className="featured-card">
                {featured?<><div className="featured-top"><span className="mini-label">NIGHTJAR / FEATURED</span><span className="status-dot"><span/> LIVE RELEASE</span></div><div className="cover-art" style={featured.artworkUrl?{backgroundImage:'url("'+featured.artworkUrl+'")',backgroundSize:'cover',backgroundPosition:'center'}:undefined}>{!featured.artworkUrl&&<div className="cover-crescent"><Moon size={54}/></div>}<span>{featured.title.toUpperCase()}</span><small>{featured.creator}</small></div><div className="feature-meta"><div><span className="mini-label">{featured.category}</span><strong>{featured.title}</strong></div><button className="round-play" disabled={!featured.audioUrl} onClick={()=>togglePlayback(featured)} aria-label={playing===featured.id?'Pause release':'Play release'}>{playing===featured.id?<Pause size={19}/>:<Play size={19} fill="currentColor"/>}</button></div><div className="player-meta"><span>{featured.duration}</span><span>{featured.audioUrl?'Audio connected':'Audio not connected'}</span></div></>:<div className="empty-feature"><Moon size={40}/><strong>No featured release yet.</strong><span>Published catalogue records will appear here as creators release audio.</span></div>}
              </div></div>
            </section>
            <section className="editorial-strip"><span>VOICE</span><span>STORY</span><span>ATMOSPHERE</span><span>CHARACTER</span><span>SOUND DESIGN</span><span>AFTER DARK</span></section>
            <section className="spotlight-section section-wrap"><div className="section-head spotlight-heading"><div><p className="eyebrow"><Sparkles size={14}/> DAILY ROTATION</p><h2>Today in the spotlight.</h2></div><span className="spotlight-cycle">01 DAY · 05 PLACES · FIXED ROTATION</span></div><div className="spotlight-grid">
              {creatorSpotlight?<article className="spotlight-tile creator-spotlight-tile"><div className="spotlight-art"><span className="spotlight-initials">{creatorSpotlight.initials||'NJ'}</span><span className="spotlight-art-mark"><Mic2 size={20}/></span></div><div className="spotlight-copy"><div className="spotlight-topline"><span className="mini-label">CREATOR SPOTLIGHT</span><span className="spotlight-day">TODAY · 24 HOURS</span></div><h3>{creatorSpotlight.name}</h3><p className="spotlight-handle">{creatorSpotlight.handle?'@'+creatorSpotlight.handle.replace(/^@/,''):'Handle not set'}</p><div className="spotlight-edition"><span>{creatorSpotlight.edition||'Spotlight'}</span><strong>{creatorSpotlight.title||'Creator profile'}</strong><p>{creatorSpotlight.detail||'Live creator spotlight.'}</p></div><button className="secondary-button" onClick={()=>navigate('creators')}>Meet {creatorSpotlight.name} <ArrowRight size={14}/></button></div></article>:<div className="spotlight-tile"><div className="spotlight-copy"><span className="mini-label">CREATOR SPOTLIGHT</span><h3>No live slot</h3><p className="spotlight-handle">No scheduled creator spotlight is published for today.</p></div></div>}
              {writerSpotlight?<article className="spotlight-tile writer-spotlight-tile"><div className="spotlight-art"><span className="spotlight-initials">{writerSpotlight.initials||'NJ'}</span><span className="spotlight-art-mark"><FileText size={20}/></span></div><div className="spotlight-copy"><div className="spotlight-topline"><span className="mini-label">WRITER SPOTLIGHT</span><span className="spotlight-day">TODAY · 24 HOURS</span></div><h3>{writerSpotlight.name}</h3><p className="spotlight-handle">{writerSpotlight.handle?'@'+writerSpotlight.handle.replace(/^@/,''):'Handle not set'}</p><div className="spotlight-edition"><span>{writerSpotlight.edition||'Spotlight'}</span><strong>{writerSpotlight.title||'Writer profile'}</strong><p>{writerSpotlight.detail||'Live writer spotlight.'}</p></div><button className="secondary-button" onClick={()=>writerSpotlight.releaseId?document.getElementById('catalogue')?.scrollIntoView({behavior:'smooth'}):notify('This spotlight has no public release attached yet.')}>Explore work <ArrowRight size={14}/></button></div></article>:<div className="spotlight-tile"><div className="spotlight-copy"><span className="mini-label">WRITER SPOTLIGHT</span><h3>No live slot</h3><p className="spotlight-handle">No scheduled writer spotlight is published for today.</p></div></div>}
            </div><p className="spotlight-note">Every place receives one complete day before the same fixed order begins again. No random reshuffling, paid priority or hidden rotation boost.</p></section>
            <section id="catalogue" className="section-wrap"><div className="section-head"><div><p className="eyebrow">THE LISTENING ROOM</p><h2>Published releases.</h2></div><button className="text-button with-icon" onClick={()=>document.getElementById('for-you')?.scrollIntoView({behavior:'smooth'})}>Personalise <Sparkles size={14}/></button></div><div className="track-grid">
              {tracks.map(track=><LiveTrackCard key={track.id} track={track} playing={playing===track.id} favourite={favouriteReleaseIds.includes(track.id)} onPlay={togglePlayback} onFavourite={()=>void toggleFavouriteRelease(track.id)}/>)}{!tracks.length&&<div className="people-empty"><Headphones size={18}/><strong>No published releases yet.</strong><span>The listening room will populate from real creator releases.</span></div>}
            </div></section>
            <section id="for-you" className="section-wrap"><div className="section-head"><div><p className="eyebrow"><Sparkles size={14}/> FOR YOU</p><h2>What fits right now.</h2></div><select className="mood-select" value={currentIntent} onChange={e=>setCurrentIntent(e.target.value)} aria-label="Current listening intent"><option value="">Open to anything</option><option value="wind">Wind down</option><option value="story">A story</option><option value="quiet">Something quiet</option><option value="focus">Focus</option><option value="discover">Discover something new</option></select></div><p className="section-copy">Nightjar keeps declared preferences stronger than weak observed behaviour. Current intent changes only this discovery context.</p><div className="track-grid">{liveRecommendations.map((release:any)=><LiveReleaseCard key={release.id} release={release} playing={playing===String(release.id)} favourite={favouriteReleaseIds.includes(String(release.id))} onPlay={()=>togglePlayback(releaseToTrack(release))} onFavourite={()=>void toggleFavouriteRelease(String(release.id))}/>)}
              {!liveRecommendations.length&&<div className="people-empty"><Sparkles size={18}/><strong>Your recommendation graph is still forming.</strong><span>Save, finish and explore real releases, follow creators and set explicit preferences to build meaningful recommendations.</span></div>}</div></section>
            <section className="section-wrap"><div className="section-head"><div><p className="eyebrow">TRENDING</p><h2>Popular right now.</h2></div><span className="section-copy">General popularity is separate from personalisation.</span></div><div className="track-grid">{liveTrending.map((release:any)=><LiveReleaseCard key={release.id} release={release} playing={playing===String(release.id)} favourite={favouriteReleaseIds.includes(String(release.id))} onPlay={()=>togglePlayback(releaseToTrack(release))} onFavourite={()=>void toggleFavouriteRelease(String(release.id))}/>)}{!liveTrending.length&&<div className="people-empty"><BarChart3 size={18}/><strong>No live trending data.</strong><span>Trending appears only after real listening events exist.</span></div>}</div></section>
            <section className="creator-band section-wrap"><div className="section-head"><div><p className="eyebrow">THE CREATOR NETWORK</p><h2>Voices worth following.</h2></div><button className="text-button with-icon" onClick={()=>navigate('creators')}>Meet the creators <ArrowRight size={15}/></button></div><div className="creator-grid">{creators.slice(0,5).map((creator:any)=><button className="creator-card" key={creator.userId} onClick={()=>navigate('creators')}><span className="avatar-large">{creator.initials||creator.name.slice(0,2).toUpperCase()}</span><span className="creator-card-copy"><strong>{creator.name}</strong><span>{creator.handle?'@'+creator.handle.replace(/^@/,''):'Handle not set'}</span><em>{creator.note||'No public creator bio yet.'}</em><small>{creator.releases??0} published releases</small></span><ChevronRight size={17}/></button>)}</div>{!creators.length&&<div className="people-empty"><Users size={18}/><strong>No approved public creators yet.</strong><span>Creator discovery uses real approved accounts only.</span></div>}</section>
            <section className="manifesto section-wrap"><div className="manifesto-quote"><span className="quote-mark">“</span><h2>Good audio does not sit in the background. It changes the room.</h2></div><div className="manifesto-copy"><p className="eyebrow">WHY NIGHTJAR</p><p>Nightjar is built around the things that make spoken audio powerful: the intimacy of a human voice, the space between words, and the feeling that a story is happening very close to you.</p><div className="manifesto-stats"><div><strong>18+</strong><span>Adult audience</span></div><div><strong>Audio</strong><span>Core medium</span></div><div><strong>Creators</strong><span>At the centre</span></div></div></div></section>
            <section className="studio-feature section-wrap"><div className="studio-feature-copy"><p className="eyebrow"><BarChart3 size={14}/> CREATOR STUDIO</p><h2>The catalogue earns with real listening.</h2><p>Creator economics are tied to verified listening and actual commercial records. No fabricated listeners, earnings or payouts.</p><button className="primary-button" onClick={()=>creatorOnly||adminOnly?navigate('creator'):notify('Apply as a Creator to access Creator Studio.')}>Open Creator Studio <ArrowRight size={16}/></button></div><div className="studio-preview-card"><div className="studio-card-head"><div><span className="mini-label">LIVE ACCOUNT DATA</span><strong>{creatorOnly?'Your Creator account':'Creator programme'}</strong></div><span className="studio-period">{creatorDashboardLoading?'LOADING':'LIVE RECORDS'}</span></div><div className="studio-metrics">{studioMetrics.map(([label,value])=><div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div><div className="formula-line"><span>NET SUBSCRIPTION REVENUE</span><ChevronRight size={12}/><span>CREATOR POOL</span><ChevronRight size={12}/><span>VERIFIED LISTENING</span></div></div></section>
          </section>
        )}

        {view === 'creators' && (
          <section className="page-wrap">
            <div className="page-heading"><div><p className="eyebrow"><Mic2 size={14}/> THE CREATOR NETWORK</p><h1>Voices worth following.</h1><p>Discover public creator identities and the work they have actually released to Nightjar.</p></div></div>
            <div className="creator-directory">{creators.map((creator:any,index:number)=><article className="creator-profile" key={creator.userId}><div className="profile-number">{String(index+1).padStart(2,'0')}</div><span className="avatar-xl">{creator.initials||creator.name.slice(0,2).toUpperCase()}</span><div className="profile-main"><div className="profile-heading"><div><h2>{creator.name}</h2><span>{creator.handle?'@'+creator.handle.replace(/^@/,''):'Handle not set'}</span></div><button className="icon-button" onClick={()=>void toggleCreatorFollow(creator.userId)} aria-label={followingCreatorIds.includes(creator.userId)?'Unfollow creator':'Follow creator'}><Heart size={17} fill={followingCreatorIds.includes(creator.userId)?'currentColor':'none'}/></button></div><p>{creator.note||'No public creator biography has been published yet.'}</p><div className="profile-stats"><span><strong>{creator.releases??0}</strong> published releases</span><span><strong>{followingCreatorIds.includes(creator.userId)?'Following':'Not following'}</strong> status</span></div></div><button className="round-arrow" onClick={()=>void toggleCreatorFollow(creator.userId)} aria-label={followingCreatorIds.includes(creator.userId)?'Unfollow creator':'Follow creator'}>{followingCreatorIds.includes(creator.userId)?<Check size={18}/>:<ArrowRight size={18}/>}</button></article>)}</div>{!creators.length&&<div className="people-empty"><Users size={18}/><strong>No approved public creators yet.</strong><span>Creator profiles appear here from real accounts.</span></div>}
          </section>
        )}

        {view === 'creator' && (effectiveRole === 'creator' || (canAdmin && effectiveRole === 'admin')) && (
          <section className="page-wrap studio-page">
            <div className="page-heading studio-page-heading"><div><p className="eyebrow"><BarChart3 size={14}/> CREATOR STUDIO</p><h1>Your audience. Your catalogue. Your listening revenue.</h1><p>{canAdmin?'Administrator inspection mode.':'Your live creator records and verified listening activity.'}</p></div>{!canAdmin&&<button className="primary-button with-icon" onClick={()=>document.getElementById('new-release')?.scrollIntoView({behavior:'smooth'})}><Upload size={16}/> New release</button>}</div>
            {canAdmin&&<div className="admin-preview-control"><div><span className="mini-label">SAFE PREVIEW</span><strong>Creator surface inspection</strong><p>Your real Administrator privileges remain unchanged. Creator actions are unavailable in preview.</p></div><button className="secondary-button" onClick={clearAdminPreview}>Return to Admin</button></div>}
            <div className="dashboard-metric-grid"><div className="dashboard-metric"><span>Published releases</span><strong>{creatorDashboardLoading?'…':creatorDashboard.metrics?.released??0}</strong></div><div className="dashboard-metric"><span>Draft releases</span><strong>{creatorDashboardLoading?'…':creatorDashboard.metrics?.drafts??0}</strong></div><div className="dashboard-metric"><span>Verified listening</span><strong>{creatorDashboardLoading?'…':creatorDashboard.metrics?.verifiedListeningMinutes??0}</strong><em>minutes</em></div><div className="dashboard-metric"><span>Unique listeners</span><strong>{creatorDashboardLoading?'…':creatorDashboard.metrics?.uniqueListeners??0}</strong></div></div>
            {creatorOnly&&<article className="creator-create-card" id="new-release"><div><span className="mini-label">NEW RELEASE</span><h2>Create a release draft</h2><p>Nothing becomes public until you attach real audio and explicitly publish it.</p></div><div className="form-grid">{(['title','description','category','genre','mood','tags','tropes','durationMinutes','audioUrl','artworkUrl'] as const).map(field=><label key={field}>{labelize(field)}<input value={creatorDraft[field]} onChange={e=>setCreatorDraft({...creatorDraft,[field]:e.target.value})} placeholder={field==='tags'||field==='tropes'?'Comma-separated values':''}/></label>)}<button className="primary-button" onClick={()=>void createCreatorRelease()}>Save draft <ArrowRight size={15}/></button></div></article>}
            <section className="section-wrap compact"><div className="section-head"><div><p className="eyebrow">CATALOGUE CONTROL</p><h2>Your release records</h2></div></div><div className="data-list">{creatorDashboard.releases.map((release:any)=><article className="data-row" key={release.id}><div><strong>{release.title}</strong><span>{release.status??'draft'} · v{release.version??1} · {release.durationMinutes?release.durationMinutes+' min':'duration not set'}</span><em>{release.audioUrl?'Audio attached':'Audio not attached'}</em></div><div className="data-actions">{creatorOnly&&release.status!=='released'&&<button className="secondary-button" disabled={!release.audioUrl} onClick={()=>void publishCreatorRelease(release.id)}>Publish</button>}{creatorOnly&&<button className="ghost-button" onClick={()=>{const description=window.prompt('Release description',release.description??'');if(description!==null)void updateCreatorRelease({...release,description})}}>Edit description</button>}{creatorOnly&&release.status!=='released'&&<button className="ghost-button" onClick={()=>void deleteCreatorRelease(release.id)}><Trash2 size={14}/></button>}</div></article>)}{!creatorDashboard.releases.length&&<div className="people-empty"><Headphones size={18}/><strong>No release records yet.</strong><span>Create a draft above and attach real audio before publishing.</span></div>}</div></section>
            <section className="section-wrap compact"><div className="section-head"><div><p className="eyebrow"><LockKeyhole size={14}/> PROTECTED MANUSCRIPTS</p><h2>Collaboration reading</h2></div></div><div className="data-list">{protectedScripts.map((script:any)=><article className="data-row" key={script.id}><div><strong>{script.title}</strong><span>{script.status??'Protected manuscript'} · v{script.version??1}</span><em>Backend authorisation controls full reading access.</em></div><div className="data-actions">{creatorOnly&&<button className="secondary-button" onClick={()=>void requestScriptAccess(script)}>Request access</button>}<button className="ghost-button" onClick={()=>void openProtectedReader(script.id)}><Eye size={14}/> Read</button></div></article>)}{!protectedScripts.length&&<div className="people-empty"><LockKeyhole size={18}/><strong>No accessible manuscript records.</strong><span>Protected scripts appear when real writer records exist.</span></div>}</div></section>
            <article className="panel-card"><div className="panel-title"><div><span className="mini-label">ECONOMICS</span><h2>Verified listening allocation</h2></div><ShieldCheck size={18}/></div><div className="formula-stack"><div><span>01</span><strong>Net subscription revenue</strong></div><ChevronRight size={15}/><div><span>02</span><strong>Creator Pool</strong></div><ChevronRight size={15}/><div><span>03</span><strong>Eligible verified listening</strong></div></div><p className="panel-note">Planning values remain labelled until live billing and payout records are connected.</p></article>
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
                <label className="profile-toggle"><input type="checkbox" checked={profile.publicProfile !== false} onChange={(e)=>setProfile((p:any)=>({...p,publicProfile:e.target.checked}))}/> Public profile preview</label>
                <button className="primary-button" disabled={profileLoading} onClick={()=>void saveProfile()}>{profileLoading ? 'Saving…' : 'Save my profile'} <Check size={15}/></button>
              </article>
            </div>
            <div className="profile-public-preview panel"><div><span className="mini-label">PUBLIC PROFILE</span><h3>{profile.displayName || 'Your chosen name'} <span>{profile.handle ? '@'+profile.handle.replace(/^@/,'') : '@yourhandle'}</span></h3><p>{profile.headline || 'Your Nightjar headline appears here.'}</p><div className="profile-preview-chips">{[...(profile.favouriteTags??[]),...(profile.favouriteTropes??[])].slice(0,6).map((item:string)=><span key={item}>{item}</span>)}</div></div><em>{profile.publicProfile === false ? 'Private' : 'Visible to your Nightjar community'}</em></div>
            <article className="panel taste-panel"><div><span className="mini-label">TASTE ENGINE</span><h2>What Nightjar is learning</h2><p>Declared taste is kept separate from identity. Listening signals can refine recommendations without trying to infer who you are.</p></div><div className="taste-vector">{tasteVector.length===0 ? <span className="taste-empty">Your taste graph will grow as you save, finish, replay and explore.</span> : tasteVector.slice(0,10).map((item:any)=><div className="taste-chip" key={item.label}><strong>{item.label}</strong><span>{item.weight}</span></div>)}</div></article>
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

        {(view === 'writer' || (view === 'admin' && effectiveRole === 'writer')) && (
          <section className="page-wrap role-studio-page">
            <div className="page-heading"><div><p className="eyebrow"><FileText size={14}/> WRITER STUDIO</p><h1>Write it. Protect it.</h1><p>Build manuscripts, record versions, submit work for editorial review and control collaborator access.</p></div>{canAdmin&&<span className="preview-chip">ADMIN PREVIEW · WRITER</span>}</div>
            {canAdmin&&<div className="admin-preview-control"><div><span className="mini-label">SAFE ROLE PREVIEW</span><strong>Your real role remains Administrator.</strong><p>Previewing this surface does not grant Writer permissions or write access to another account.</p></div><div className="admin-preview-buttons"><button onClick={()=>selectPreviewRole('listener')}>Listener</button><button onClick={()=>selectPreviewRole('creator')}>Creator</button><button className="active" onClick={()=>selectPreviewRole('writer')}>Writer</button><button onClick={()=>selectPreviewRole('editor')}>Editor</button><button onClick={clearAdminPreview}>Return to Admin</button></div></div>}
            {!canAdmin&&<div className="writer-create-card"><div><span className="mini-label">NEW SCRIPT</span><h2>Start a manuscript</h2><p>New scripts begin private and can later be versioned and submitted to editorial.</p></div><div className="writer-create-form"><input value={writerDraftTitle} onChange={e=>setWriterDraftTitle(e.target.value)} placeholder="Working title" aria-label="Working title"/><button className="primary-button" disabled={!writerDraftTitle.trim()} onClick={()=>void createWriterDraft()}>Create draft <FileText size={15}/></button></div></div>}
            <div className="writer-layout">
              <aside className="writer-library">{writerScripts.map((script:any)=><button key={script.id} onClick={()=>setWriterSelected(script)} className={writerSelected?.id===script.id?'library-item active':'library-item'}><span>{script.status??'Draft'}</span><strong>{script.title}</strong><em>v{script.version??1}</em></button>)}{!writerScripts.length&&<div className="people-empty"><FileText size={18}/><strong>No manuscripts yet.</strong><span>Create a script to begin the writing workflow.</span></div>}</aside>
              {writerSelected?<article className="writer-editor-card"><div className="editor-toolbar"><div><span className="mini-label">MANUSCRIPT</span><input value={writerSelected.title??''} disabled={canAdmin} onChange={e=>setWriterSelected({...writerSelected,title:e.target.value})}/></div><span className="status-pill">{writerSelected.status??'Draft'} · v{writerSelected.version??1}</span></div><textarea className="script-editor" value={writerSelected.content??''} disabled={canAdmin} onChange={e=>setWriterSelected({...writerSelected,content:e.target.value})} placeholder="Begin writing…"/><div className="editor-actions">{!canAdmin&&<><button className="secondary-button" onClick={()=>void saveWriterScript()}>Save</button><button className="secondary-button" onClick={()=>void createWriterVersion()}>Record version</button><button className="primary-button" onClick={()=>void submitWriterScript()}>Submit to editorial</button></>}{writerSelected.content&&<button className="ghost-button" onClick={()=>void openProtectedReader(writerSelected.id)}><LockKeyhole size={14}/> Read protected</button>}</div><div className="protection-banner"><ShieldCheck size={17}/><div><strong>PROTECTED MANUSCRIPT</strong><span>Copy, export and reader access are permission-controlled. Browser deterrents are not the security boundary.</span></div></div></article>:<div className="writer-editor-card"><div className="people-empty"><FileText size={18}/><strong>Select a manuscript.</strong><span>Your live script library is the source of truth.</span></div></div>}
            </div>
          </section>
        )}

        {(view === 'editor' || (view === 'admin' && effectiveRole === 'editor')) && (
          <section className="page-wrap role-studio-page">
            <div className="page-heading"><div><p className="eyebrow"><FileCheck2 size={14}/> EDITORIAL WORKSPACE</p><h1>Review work professionally.</h1><p>Assignments, editorial decisions and revision requests are tracked against real manuscripts.</p></div>{canAdmin&&<span className="preview-chip">ADMIN PREVIEW · EDITOR</span>}</div>
            {canAdmin&&<div className="admin-preview-control"><div><span className="mini-label">SAFE ROLE PREVIEW</span><strong>Your real role remains Administrator.</strong><p>Editorial actions are unavailable while you preview this role.</p></div><div className="admin-preview-buttons"><button onClick={()=>selectPreviewRole('listener')}>Listener</button><button onClick={()=>selectPreviewRole('creator')}>Creator</button><button onClick={()=>selectPreviewRole('writer')}>Writer</button><button className="active" onClick={()=>selectPreviewRole('editor')}>Editor</button><button onClick={clearAdminPreview}>Return to Admin</button></div></div>}
            <div className="editor-queue-grid">{editorQueue.map((script:any)=><button key={script.id} onClick={()=>setEditorSelected(script)} className={editorSelected?.id===script.id?'editor-queue-card active':'editor-queue-card'}><div className="editor-status-line"><span>{script.status??'Submitted'}</span><strong>v{script.version??1}</strong></div><h2>{script.title}</h2><p>{script.lastEditorialComment||'No editorial note recorded yet.'}</p></button>)}</div>
            {!editorQueue.length&&<div className="people-empty"><FileCheck2 size={18}/><strong>No editorial assignments.</strong><span>Editors see only manuscripts assigned to their account. Administrators can assign manuscripts from Admin.</span></div>}
            {editorSelected&&<article className="panel-card editorial-review-panel"><div className="panel-title"><div><span className="mini-label">CURRENT REVIEW</span><h2>{editorSelected.title}</h2></div><span className="status-pill">{editorSelected.status}</span></div><p className="panel-note">{editorSelected.lastEditorialComment||'No previous editorial note.'}</p>{!canAdmin&&<div className="script-card-actions"><button className="secondary-button" onClick={()=>void reviewEditorScript('Under review')}>Mark under review</button><button className="secondary-button" onClick={()=>void reviewEditorScript('Revision requested')}>Request revision</button><button className="primary-button" onClick={()=>void reviewEditorScript('Approved')}>Approve</button><button className="ghost-button" onClick={()=>void reviewEditorScript('Rejected')}>Reject</button></div>}</article>}
            <div className="protection-banner"><FileCheck2 size={19}/><div><strong>EDITOR BOUNDARY</strong><span>Editors can change editorial state and comments on assigned manuscripts. Administrator access remains separate.</span></div></div>
          </section>
        )}

People('admin')}><span className="admin-icon"><ShieldCheck size={19} /></span><span className="mini-label">PEOPLE · ADMINISTRATORS</span><h2>{adminOverviewLoading ? '…' : adminOverview?.people?.counts?.admin ?? 3}</h2><p>Owner accounts with administrator permissions enforced by the backend allowlist.</p><strong>Open administrator profiles <ArrowRight size={13} /></strong></button>
              <button className="admin-panel admin-tile" onClick={() => openAdminPeople('writer')}><span className="admin-icon"><FileText size={19} /></span><span className="mini-label">PEOPLE · WRITERS</span><h2>{adminOverviewLoading ? '…' : adminOverview?.people?.counts?.writer ?? 0}</h2><p>Writers with protected manuscript and script-marketplace access.</p><strong>Open writer profiles <ArrowRight size={13} /></strong></button>
              <button className="admin-panel admin-tile" onClick={() => openAdminPeople('editor')}><span className="admin-icon"><FileCheck2 size={19} /></span><span className="mini-label">PEOPLE · EDITORS</span><h2>{adminOverviewLoading ? '…' : adminOverview?.people?.counts?.editor ?? 0}</h2><p>Editors assigned to controlled editorial workflows.</p><strong>Open editor profiles <ArrowRight size={13} /></strong></button>
              <button className="admin-panel admin-tile" onClick={() => openAdminPanel('approvals')}><span className="admin-icon"><Sparkles size={19} /></span><span className="mini-label">CREATOR APPROVALS</span><h2>{adminApplications.filter((application) => application.status === 'pending' || application.status === 'submitted').length}</h2><p>Open the live creator application queue and make an explicit approve, waitlist or reject decision.</p><strong>Open approval workflow <ArrowRight size={13} /></strong></button>
              <button className="admin-panel admin-tile" onClick={() => openAdminPanel('revenue')}><span className="admin-icon"><BarChart3 size={19} /></span><span className="mini-label">REVENUE</span><h2>Commercial controls</h2><p>Open the operating view for subscription revenue, creator-pool assumptions and payout readiness.</p><strong>Open commercial controls <ArrowRight size={13} /></strong></button>
              <button className="admin-panel admin-tile" onClick={() => navigate('protection')}><span className="admin-icon"><ShieldCheck size={19} /></span><span className="mini-label">SAFETY</span><h2>Access & moderation</h2><p>Review reports, protection signals and age-assurance boundaries.</p><strong>Open Protection Centre <ArrowRight size={13} /></strong></button>
              <button className="admin-panel admin-tile subscription-tile" onClick={() => openAdminPanel('subscriptions')}><span className="admin-icon"><WalletCards size={19} /></span><span className="mini-label">SUBSCRIPTIONS</span><h2>{adminOverviewLoading ? '…' : adminOverview?.subscriptions?.active ?? 0}</h2><p>Active paid subscriptions tracked by the Nightjar billing ledger.</p><strong>{adminOverview?.subscriptions?.trialing ?? 0} trial · {adminOverview?.subscriptions?.pastDue ?? 0} past due <ArrowRight size={13} /></strong></button>
              <button className="admin-panel admin-tile admin-economics" onClick={() => openAdminPanel('economics')}><span className="admin-icon"><Coins size={19} /></span><span className="mini-label">LISTENING ECONOMICS</span><h2>£5 / month</h2><p>Launch-price planning reference and the transparent verified-listening allocation model.</p><strong>Open economics assumptions <ArrowRight size={13} /></strong></button>
              <div className="admin-panel branding-admin-panel"><span className="admin-icon"><Upload size={19} /></span><span className="mini-label">BRANDING</span><h2>Nightjar logo</h2><p>Upload or replace the logo used across the Nightjar shell. Only administrators can change it.</p><div className="logo-editor"><div className="logo-preview-box">{logoUrl ? <img src={logoUrl} alt="Current Nightjar logo" /> : <span><Moon size={28} /> No logo uploaded</span>}</div><label className="secondary-button upload-label"><Upload size={15} /> {logoUploading ? 'Uploading…' : 'Choose logo'}<input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden disabled={logoUploading} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadLogo(file); event.currentTarget.value = ''; }} /></label></div><strong>Admin editable · max 3 MB</strong></div>
            </div>
            <div className="demo-warning admin-note"><ShieldCheck size={17} /><div><strong>ADMIN ACCESS MODEL</strong><span>Only the three approved Nightjar owner emails receive this role. Administrator access is enforced by the backend allowlist.</span></div></div>
            {canAdmin && <section className="security-alert-panel"><div><span className="mini-label">SECURITY / OWNER ALERTS</span><h2>Suspicious activity</h2><p>Every qualifying alert is addressed to all three Nightjar owners and retained in the audit trail.</p></div><button className="secondary-button" onClick={() => void loadSecurityAlerts()}>{securityAlertsLoading ? 'Refreshing…' : 'Refresh alerts'}</button><div className="security-alert-list">{securityAlerts.length === 0 ? <div className="people-empty"><ShieldCheck size={18}/><strong>No open security alerts</strong><span>Signals remain evidence, not accusations. Alerts are retained for review.</span></div> : securityAlerts.map((alert:any) => <article className="security-alert-row" key={alert.id}><div><strong>{alert.severity?.toUpperCase() ?? 'HIGH'} · {alert.reason ?? 'Suspicious protected-content activity'}</strong><span>User: {alert.userId} · Script: {alert.relatedId ?? '—'} · {new Date(alert.createdAt).toLocaleString('en-GB')}</span><em>All three owners</em></div><button className="secondary-button" disabled={alert.status === 'actioned'} onClick={() => void suspendFromSecurityAlert(alert)}>{alert.status === 'actioned' ? 'Account suspended' : 'Suspend account'}</button></article>)}</div></section>}
            {adminPeopleRole && <div className="people-drawer" role="dialog" aria-modal="true" aria-label={`${roleMeta[adminPeopleRole].label} accounts`}><div className="people-drawer-head"><div><span className="mini-label">PEOPLE / ACCOUNT DIRECTORY</span><h2>{roleMeta[adminPeopleRole].label}s</h2><p>{adminPeopleRole === 'admin' ? 'Administrator access is limited to the owner allowlist.' : `Current ${roleMeta[adminPeopleRole].label.toLowerCase()} accounts recorded by Nightjar.`}</p></div><button className="icon-button" onClick={() => setAdminPeopleRole(null)} aria-label="Close account directory"><X size={18} /></button></div><div className="people-drawer-summary"><strong>{adminOverview?.people?.counts?.[adminPeopleRole] ?? 0}</strong><span>accounts in this role</span></div><div className="people-list">{(adminPeopleRole === 'admin' ? (adminOverview?.people?.administrators ?? []) : (adminOverview?.people?.accounts ?? []).filter((account: any) => account.role === adminPeopleRole)).map((account: any) => <article className="people-row" key={account.userId ?? account.email}><span className="account-chip-avatar">{(account.name ?? account.email ?? 'N').slice(0, 1).toUpperCase()}</span><div><strong>{account.name ?? 'Nightjar account'}</strong><span>{account.email ?? 'Owner allowlist account'}</span></div><em>{account.status === 'pending_review' ? 'Pending review' : 'Active'}</em></article>)}{(adminPeopleRole === 'admin' ? (adminOverview?.people?.administrators ?? []) : (adminOverview?.people?.accounts ?? []).filter((account: any) => account.role === adminPeopleRole)).length === 0 && <div className="people-empty"><Users size={18} /><strong>No accounts in this role yet</strong><span>The live directory will populate as accounts are created or approved.</span></div>}</div></div>}
            {adminPanel && <div className="admin-panel-modal" role="dialog" aria-modal="true"><section><div className="admin-modal-head"><div><span className="mini-label">ADMINISTRATION / {adminPanel.toUpperCase()}</span><h2>{adminPanel === 'approvals' ? 'Creator approval queue' : adminPanel === 'subscriptions' ? 'Subscription ledger' : adminPanel === 'revenue' ? 'Commercial controls' : 'Listening economics'}</h2><p>{adminPanel === 'approvals' ? 'Review creator applications and record an explicit decision.' : adminPanel === 'subscriptions' ? 'Live subscription records only. Empty means billing data is not connected yet.' : adminPanel === 'revenue' ? 'Operational assumptions are separated from confirmed billing data.' : 'Planning assumptions for the verified-listening creator model.'}</p></div><button className="icon-button" onClick={() => setAdminPanel(null)} aria-label="Close administrator panel"><X size={18} /></button></div>{adminPanel === 'approvals' && <div className="admin-data-list">{adminPanelLoading ? <div className="people-empty">Loading approval queue…</div> : adminApplications.length === 0 ? <div className="people-empty"><Sparkles size={18} /><strong>No creator applications</strong><span>The queue is empty. New creator applications will appear here.</span></div> : adminApplications.map((application) => <article className="admin-data-row" key={application.id}><div><strong>{application.creatorName ?? application.displayName ?? application.email ?? 'Creator applicant'}</strong><span>{application.email ?? 'No email supplied'} · {application.status ?? 'pending'}</span></div><div className="admin-data-actions"><button className="secondary-button" onClick={() => void decideCreatorApplication(application, 'waitlist')}>Waitlist</button><button className="secondary-button" onClick={() => void decideCreatorApplication(application, 'rejected')}>Reject</button><button className="primary-button" onClick={() => void decideCreatorApplication(application, 'approved')}>Approve</button></div></article>)}</div>}{adminPanel === 'subscriptions' && <div>{adminPanelLoading ? <div className="people-empty">Loading subscription ledger…</div> : <><div className="admin-modal-grid"><div className="admin-modal-stat"><span>Active</span><strong>{adminOverview?.subscriptions?.active ?? 0}</strong></div><div className="admin-modal-stat"><span>Trial</span><strong>{adminOverview?.subscriptions?.trialing ?? 0}</strong></div><div className="admin-modal-stat"><span>Past due</span><strong>{adminOverview?.subscriptions?.pastDue ?? 0}</strong></div></div><div className="admin-data-list">{adminSubscriptions.length === 0 ? <div className="people-empty"><WalletCards size={18} /><strong>No live subscription records</strong><span>Billing is not connected yet; no subscription data is being fabricated.</span></div> : adminSubscriptions.map((subscription) => <article className="admin-data-row" key={subscription.id}><div><strong>{subscription.email ?? subscription.userId ?? 'Subscriber'}</strong><span>{subscription.plan ?? 'Nightjar · £5 monthly'} · {subscription.status ?? 'unknown'}</span></div><span>{subscription.currentPeriodEnd ?? '—'}</span></article>)}</div></>}</div>}{adminPanel === 'revenue' && <div><div className="admin-modal-grid"><div className="admin-modal-stat"><span>Planning price</span><strong>£5</strong></div><div className="admin-modal-stat"><span>Live subscriptions</span><strong>{adminOverview?.subscriptions?.active ?? 0}</strong></div><div className="admin-modal-stat"><span>Confirmed gross MRR</span><strong>{adminOverview?.subscriptions?.active ? `£${(adminOverview.subscriptions.active * 5).toLocaleString('en-GB')}` : '£0'}</strong></div></div><div className="admin-formula"><div><b>01</b><strong>Subscription revenue after applicable deductions becomes the commercial base.</strong></div><div><b>02</b><strong>A defined creator pool is allocated from the eligible net revenue.</strong></div><div><b>03</b><strong>Creator shares are attributed using verified listening rather than fixed per-drop promises.</strong></div></div><div className="demo-warning admin-note"><ShieldCheck size={17} /><div><strong>CONFIRMED VS PLANNING</strong><span>£5 is a planning reference. The dashboard does not present illustrative creator earnings as confirmed payouts.</span></div></div></div>}{adminPanel === 'economics' && <div><div className="admin-modal-grid"><div className="admin-modal-stat"><span>Launch reference</span><strong>£5</strong></div><div className="admin-modal-stat"><span>Creator pool</span><strong>Defined before launch</strong></div><div className="admin-modal-stat"><span>Allocation</span><strong>Verified listening</strong></div></div><div className="admin-formula"><div><b>01</b><strong>Net subscription revenue</strong></div><div><b>02</b><strong>Creator pool</strong></div><div><b>03</b><strong>Eligible verified listening determines each creator share</strong></div></div><p className="panel-note">The final pool percentage, eligible-listening definition, exclusions, payout timing and any reserve policy should be published before creators enter the commercial program.</p></div>}</section></div>}
          </section>
        )}
      </main>

      <footer className="site-footer"><div className="footer-brand">{logoUrl ? <img className="brand-logo footer-logo" src={logoUrl} alt="Nightjar" /> : <span className="nightjar-mark"><Moon size={15} /></span>}<strong>NIGHTJAR</strong></div><span>Premium immersive audio for adults.</span><span>{user ? `${accountLabel} account` : 'Preview access'} · Live account state</span></footer>

      {protectedReaderOpen && protectedReaderScript && <ProtectedReader data={protectedReaderScript} close={()=>setProtectedReaderOpen(false)} record={(eventType)=>void recordProtectionEvent(eventType,protectedReaderScript.script?.id)} notify={notify} />}
      {playing && <AudioDock track={tracks.find((track)=>track.id===playing) ?? null} intent={currentIntent} onClose={()=>setPlaying(null)} notify={notify} />}
      {toast && <div className="toast">{toast}</div>}

      {user && !rolePicker && (
        <button className="floating-account" onClick={() => setRolePicker(true)} aria-label="Open account information">
          <UserCircle2 size={16} /><span>{roleMeta[role ?? 'listener'].label}</span>
        </button>
      )}
    </div>
  );
}

function releaseToTrack(release:any):Track{
  return {id:String(release.id),title:String(release.title??'Untitled release'),creator:String(release.creatorName??'Nightjar creator'),duration:release.durationMinutes?String(release.durationMinutes)+' min':'—',category:String(release.category??'Audio'),descriptor:String(release.description??'No description supplied.'),audioUrl:release.audioUrl??null,artworkUrl:release.artworkUrl??null,creatorUserId:release.creatorUserId};
}

function LiveTrackCard({track,playing,favourite,onPlay,onFavourite,reason}:{track:Track;playing:boolean;favourite:boolean;onPlay:(track:Track)=>void;onFavourite:()=>void;reason?:string}){
  return <article className="track-card">
    <div className="track-cover" style={track.artworkUrl?{backgroundImage:'url("' + track.artworkUrl + '")',backgroundSize:'cover',backgroundPosition:'center'}:undefined}>
      <span className="track-index">{track.category}</span>{!track.artworkUrl&&<div className="track-cover-mark"><Moon size={22}/></div>}
      <button className="cover-play" disabled={!track.audioUrl} onClick={()=>onPlay(track)} aria-label={!track.audioUrl?'Audio not connected':playing?'Pause '+track.title:'Play '+track.title}>{playing?<Pause size={18}/>:<Play size={18} fill="currentColor"/>}</button>
    </div>
    <div className="track-body"><div className="track-type"><span>{track.creator}</span><span>{track.duration}</span></div><h3>{track.title}</h3><p>{track.descriptor}</p><div className="track-footer"><span className="creator-link">{track.audioUrl?'Playable audio':'Audio not connected'}</span><button className="icon-button" onClick={onFavourite} aria-label={favourite?'Remove favourite':'Add favourite'}><Heart size={16} fill={favourite?'currentColor':'none'} className={favourite?'nj-gold':''}/></button></div>{reason&&<p className="recommendation-reason"><Sparkles size={12}/>{reason}</p>}</div>
  </article>;
}

function LiveReleaseCard({release,playing,favourite,onPlay,onFavourite}:{release:any;playing:boolean;favourite:boolean;onPlay:()=>void;onFavourite:()=>void}){
  return <LiveTrackCard track={releaseToTrack(release)} playing={playing} favourite={favourite} onPlay={()=>onPlay()} onFavourite={onFavourite} reason={release.reason}/>;
}

function ProtectedReader({data,close,record,notify}:{data:any;close:()=>void;record:(eventType:string)=>void;notify:(message:string)=>void}){
  const script=data.script??{};
  const content=String(script.content??'');
  useEffect(()=>{const original=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{document.body.style.overflow=original;}},[]);
  return <div className="protected-reader-backdrop" role="dialog" aria-modal="true" aria-label="Protected script reader">
    <section className="protected-reader" onCopy={event=>{event.preventDefault();record('copy_blocked');notify('Copy is disabled for this protected script.')}} onCut={event=>{event.preventDefault();record('cut_blocked')}} onPaste={event=>{event.preventDefault();record('paste_blocked')}} onContextMenu={event=>{event.preventDefault();record('contextmenu_blocked')}} onDragStart={event=>{event.preventDefault();record('drag_blocked')}}>
      <header><div><span className="mini-label">NIGHTJAR / PROTECTED SCRIPT</span><h2>{script.title??'Protected manuscript'}</h2><p>Reader session {data.readerSession?.sessionId??'authorised'} · expires {data.readerSession?.expiresAt?new Date(data.readerSession.expiresAt).toLocaleTimeString('en-GB'):'soon'}</p></div><button className="icon-button" onClick={close} aria-label="Close protected script"><X size={18}/></button></header>
      <div className="reader-notice"><ShieldCheck size={15}/><span>Protected reading is authorised by the backend. Client-side controls are deterrents, not the security boundary.</span></div>
      <article className="reader-body"><p className="reader-watermark">NIGHTJAR · AUTHORISED READER SESSION · {data.readerSession?.sessionId??''}</p>{content?content.split(/\n+/).filter(Boolean).map((paragraph:string,index:number)=><p key={index}>{paragraph}</p>):<p>No manuscript content has been supplied.</p>}</article>
      <footer><span><LockKeyhole size={14}/> Copy {data.copyAllowed?'allowed by writer':'off'}</span><span><Download size={14}/> Export {data.exportAllowed?'allowed by writer':'off'}</span><span>Access is logged</span></footer>
    </section>
  </div>;
}

function AudioDock({track,intent,onClose,notify}:{track:Track|null;intent:string;onClose:()=>void;notify:(message:string)=>void}){
  const audioRef=useRef<HTMLAudioElement|null>(null);
  const lastEvent=useRef(0);
  const [playing,setPlaying]=useState(false);
  const [position,setPosition]=useState(0);
  const [duration,setDuration]=useState(1);
  const [volume,setVolume]=useState(1);
  useEffect(()=>{const node=audioRef.current;if(!node||!track?.audioUrl)return;lastEvent.current=0;void node.play().catch(()=>notify('Press play to start this release.'));void api.post('/api/listening/event',{releaseId:track.id,eventType:'start',positionSeconds:0,durationSeconds:0,intent}).catch(()=>{});return()=>{node.pause();}},[track?.id,track?.audioUrl,intent,notify]);
  useEffect(()=>{if(audioRef.current)audioRef.current.volume=volume},[volume]);
  const fmt=(v:number)=>{if(!Number.isFinite(v)||v<0)return'0:00';return Math.floor(v/60)+':'+String(Math.floor(v%60)).padStart(2,'0')};
  if(!track?.audioUrl)return null;
  return <div className="player-dock">
    <audio ref={audioRef} src={track.audioUrl} preload="metadata" onLoadedMetadata={event=>setDuration(event.currentTarget.duration||1)} onPlay={()=>setPlaying(true)} onPause={()=>setPlaying(false)} onTimeUpdate={event=>{const node=event.currentTarget;setPosition(node.currentTime);if(node.currentTime-lastEvent.current>=15){lastEvent.current=node.currentTime;void api.post('/api/listening/event',{releaseId:track.id,eventType:'progress',positionSeconds:node.currentTime,durationSeconds:node.duration||duration,intent}).catch(()=>{})}}} onEnded={()=>{setPlaying(false);setPosition(duration);void api.post('/api/listening/event',{releaseId:track.id,eventType:'complete',positionSeconds:duration,durationSeconds:duration,completed:true,intent}).catch(()=>{})}}/>
    <div className="dock-art">{track.artworkUrl?<img src={track.artworkUrl} alt=""/>:<Moon size={16}/>}</div><div className="dock-copy"><span>{track.category}</span><strong>{track.title}</strong><small>{track.creator}</small></div><div className="dock-time">{fmt(position)} / {fmt(duration)}</div><input className="dock-progress" type="range" min="0" max={duration} step="0.1" value={Math.min(position,duration)} onChange={e=>{const value=Number(e.target.value);setPosition(value);if(audioRef.current)audioRef.current.currentTime=value}} aria-label="Playback position"/><button className="dock-play" onClick={()=>{const node=audioRef.current;if(!node)return;if(node.paused)void node.play();else node.pause()}} aria-label={playing?'Pause':'Play'}>{playing?<Pause size={17}/>:<Play size={17} fill="currentColor"/>}</button><div className="dock-volume"><Volume2 size={15}/><input type="range" min="0" max="1" step="0.05" value={volume} onChange={e=>setVolume(Number(e.target.value))} aria-label="Volume"/></div><button className="dock-close" onClick={onClose} aria-label="Close player"><X size={15}/></button>
  </div>;
}


export default App;
