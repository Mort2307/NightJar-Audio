import { useEffect, useMemo, useState } from 'react';
import { nightjarAuth } from './platform/firebase-auth';
import { nightjarAccount } from './platform/firebase-account';
import { nightjarCommunity } from './platform/firebase-community';
import { nightjarMedia } from './platform/firebase-media';
import { nightjarCommercial, type CommercialOverview, type CommercialSettings } from './platform/firebase-commercial';
import { nightjarAdministration } from './platform/firebase-administration';
import { nightjarCatalogue } from './platform/firebase-catalogue';
import { nightjarListening } from './platform/firebase-listening';
import { nightjarNotifications } from './platform/firebase-notifications';
import { nightjarAge } from './platform/firebase-age';
import { nightjarScripts } from './platform/firebase-scripts';
import { nightjarProtection } from './platform/firebase-protection';
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
  ImagePlus,
} from 'lucide-react';
import CreatorAudioPipeline from './components/CreatorAudioPipeline';
import CreatorProfile from './components/CreatorProfile';
import ContentModeration from './components/ContentModeration';
import NightjarOnboarding from './components/NightjarOnboarding';
import NightjarPlayer from './components/NightjarPlayer';
import WriterDiscovery from './components/WriterDiscovery';
import PublicProfile from './components/PublicProfile';
import CollaborationHub from './components/CollaborationHub';
import WriterRightsPanel from './components/WriterRightsPanel';
import ListenerLibrary from './components/ListenerLibrary';
import NotificationPreferences from './components/NotificationPreferences';
import CreatorCompensationCard from './components/CreatorCompensationCard';
import TransparencyPanel from './components/TransparencyPanel';

type View = 'discover' | 'library' | 'creators' | 'creator' | 'writer' | 'editor' | 'admin' | 'protection' | 'profile';
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
  audioAvailable?: boolean;
  audioUrl?: string | null;
  artworkUrl?: string | null;
  creatorUserId?: string;
  genre?: string;
  tags?: string[];
  tropes?: string[];
  contributors?: { userId?: string | null; name: string; role: string }[];
  contentRating?: string;
  seriesTitle?: string | null;
  episodeNumber?: number | null;
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
  imageUrl?: string | null;
};

type Spotlight = {
  kind: 'creator' | 'writer' | 'editor' | 'listener';
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
  imageUrl?: string | null;
};

const getProtectionDeviceToken = () => {
  const key = 'nightjar.protection.device.v1';
  let token = window.localStorage.getItem(key);
  if (!token) {
    token = 'NJ-DV-' + crypto.randomUUID();
    window.localStorage.setItem(key, token);
  }
  return token;
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
    label: 'Audio Editor',
    description: 'Shape productions, review assigned scripts, revisions and controlled editorial workflow.',
  },
};


const PROFILE_TAG_OPTIONS = [
  'Atmospheric',
  'ASMR',
  'Binaural',
  'Cinematic',
  'Conversational',
  'Dialogue-heavy',
  'Gentle',
  'Immersive',
  'Intimate',
  'Playful',
  'Romantic',
  'Slow-paced',
  'Story-led',
  'Voice-led',
  'Whispered',
  'Sound-rich',
] as const;

const PROFILE_TROPE_OPTIONS = [
  'Slow burn',
  'Friends to lovers',
  'Enemies to lovers',
  'Forbidden attraction',
  'Second chance',
  'Strangers to lovers',
  'Secret relationship',
  'Workplace romance',
  'Neighbours',
  'Roommates',
  'Meet-cute',
  'Reunion',
  'Mutual pining',
  'Protective partner',
  'Praise',
  'Teasing',
  'Comfort & reassurance',
  'Aftercare',
  'Power exchange',
  'Jealousy',
  'Possessive romance',
  'Fantasy romance',
  'Sci-fi romance',
  'Supernatural romance',
] as const;

const PROFILE_CATEGORY_OPTIONS = [
  'Erotic romance',
  'Romantic story',
  'Audio roleplay',
  'Audio drama',
  'Guided fantasy',
  'ASMR / whisper',
  'Sleep / wind-down',
  'Character performance',
  'Fantasy',
  'Sci-fi',
  'Paranormal / supernatural',
  'Thriller / suspense',
  'Dark romance',
  'Comedy / playful',
  'Contemporary romance',
  'Historical romance',
] as const;

const ROLE_FOCUS_OPTIONS: Record<AccountRole, readonly string[]> = {
  admin: [
    'Platform operations',
    'Community safety',
    'Content moderation',
    'Creator support',
    'Editorial oversight',
    'Commercial operations',
  ],
  creator: [
    'Voice performance',
    'Character acting',
    'Narration',
    'Audio roleplay',
    'Performance direction',
    'Audio production',
    'Sound design',
    'Creator collaboration',
  ],
  listener: [
    'Discovery',
    'Following creators',
    'Community participation',
    'Supporting creators',
    'Curating favourites',
    'Exploring new genres',
  ],
  writer: [
    'Script writing',
    'Story development',
    'Dialogue writing',
    'Character development',
    'Romance writing',
    'Worldbuilding',
    'Script collaboration',
    'Editorial revisions',
  ],
  editor: [
    'Audio editing',
    'Dialogue editing',
    'Sound design',
    'Mixing',
    'Mastering',
    'Noise cleanup',
    'Production polish',
    'Editorial collaboration',
  ],
};

function MultiSelectField({
  label,
  options,
  values,
  onChange,
}: {
  label: string;
  options: readonly string[];
  values: string[];
  onChange: (values: string[]) => void;
}) {
  const selected = Array.isArray(values) ? values : [];
  const allOptions = Array.from(new Set([...options, ...selected]));

  const toggle = (option: string) => {
    if (selected.includes(option)) {
      onChange(selected.filter((value) => value !== option));
      return;
    }
    if (selected.length >= 16) return;
    onChange([...selected, option]);
  };

  return <div className="profile-multi-field">
    <span className="profile-multi-label">{label}</span>
    <details className="profile-multi-select">
      <summary>
        <span>{selected.length ? `${selected.length} selected` : 'Choose options'}</span>
        <small>{selected.length}/16</small>
      </summary>
      <div className="profile-multi-options">
        {allOptions.map((option) => {
          const checked = selected.includes(option);
          return <label className="profile-multi-option" key={option}>
            <input
              type="checkbox"
              checked={checked}
              disabled={!checked && selected.length >= 16}
              onChange={() => toggle(option)}
            />
            <span>{option}</span>
          </label>;
        })}
      </div>
    </details>
    {selected.length > 0 && <div className="profile-multi-chips" aria-label={`${label} selections`}>
      {selected.map((item) => <button type="button" key={item} onClick={() => toggle(item)} title={`Remove ${item}`}>
        {item} <span aria-hidden="true">×</span>
      </button>)}
    </div>}
  </div>;
}

const formatMoneyPence = (pence: number | null | undefined) => {
  if (pence == null || !Number.isFinite(Number(pence))) return 'Not set';
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(Number(pence) / 100);
};

const readFileDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = reject;
  reader.readAsDataURL(file);
});

function App() {
  const [view, setView] = useState<View>(() => { const value = window.location.pathname.replace(/^\/+|\/+$/g, ''); return (['discover','library','creators','creator','writer','editor','admin','protection','profile'].includes(value) ? value : 'discover') as View; });
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
  const [adminReports, setAdminReports] = useState<any[]>([]);
  const [reportCategory, setReportCategory] = useState('Something else');
  const [reportSummary, setReportSummary] = useState('');
  const [adminOverview, setAdminOverview] = useState<any | null>(null);
  const [adminOverviewLoading, setAdminOverviewLoading] = useState(false);
  const [adminPeopleRole, setAdminPeopleRole] = useState<'listener' | 'creator' | 'writer' | 'editor' | 'admin' | null>(null);
  const [profile, setProfile] = useState<any>({ displayName: '', handle: '', headline: '', bio: '', welcomeMessage: '', pronouns: '', avatarInitials: '', avatarTone: 'plum', avatarUrl: null, avatarStatus: null, pendingAvatarAssetId: null, pendingAvatarStatus: null, favouriteTags: [], favouriteTropes: [], favouriteCategories: [], roleFocus: [], publicProfile: true });
  const [profileLoading, setProfileLoading] = useState(false);
  const [tasteVector, setTasteVector] = useState<any[]>([]);
  const [securityAlerts, setSecurityAlerts] = useState<any[]>([]);
  const [securityAlertsLoading, setSecurityAlertsLoading] = useState(false);
  const [adminPanel, setAdminPanel] = useState<'approvals' | 'reports' | 'revenue' | 'subscriptions' | 'economics' | 'editorial' | 'images' | null>(null);
  const [adminApplications, setAdminApplications] = useState<any[]>([]);
  const [adminSubscriptions, setAdminSubscriptions] = useState<any[]>([]);
  const [adminScripts, setAdminScripts] = useState<any[]>([]);
  const [adminEditors, setAdminEditors] = useState<any[]>([]);
  const [adminPanelLoading, setAdminPanelLoading] = useState(false);
  const [imageModeration, setImageModeration] = useState<any[]>([]);
  const [profileImageBusy, setProfileImageBusy] = useState(false);
  const [commercialOverview, setCommercialOverview] = useState<CommercialOverview | null>(null);
  const [commercialSettings, setCommercialSettings] = useState<CommercialSettings>({
    planningMonthlyPricePence: 500,
    creatorPoolPercent: null,
    reservePercent: null,
    payoutCadence: 'Monthly',
    eligibleListeningDefinition: null,
    compensationModel: 'capped_equal_rate',
    creatorMonthlyCapPence: null,
    creatorRateBands: [],
    creatorEligibilityDefinition: null,
    popularityAffectsBaseRate: false,
    tipsEnabled: false,
    individualPurchasesEnabled: false,
  });
  const [commercialSaving, setCommercialSaving] = useState(false);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [catalogueQuery, setCatalogueQuery] = useState('');
  const [catalogueRating, setCatalogueRating] = useState('all');
  const [catalogueDuration, setCatalogueDuration] = useState('all');
  const [creatorQuery, setCreatorQuery] = useState('');
  const [creatorDirectory, setCreatorDirectory] = useState<CreatorSummary[]>([]);
  const [creatorSpotlightList, setCreatorSpotlightList] = useState<Spotlight[]>([]);
  const [writerSpotlightList, setWriterSpotlightList] = useState<Spotlight[]>([]);
  const [editorSpotlightList, setEditorSpotlightList] = useState<Spotlight[]>([]);
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
  const [publicProfileUserId, setPublicProfileUserId] = useState<string | null>(null);
  const [moderationOpen, setModerationOpen] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

  const [writerDraftTitle, setWriterDraftTitle] = useState('');
  const [writerScripts, setWriterScripts] = useState<any[]>([]);
  const [writerSelected, setWriterSelected] = useState<any | null>(null);
  const [editorQueue, setEditorQueue] = useState<any[]>([]);
  const [editorSelected, setEditorSelected] = useState<any | null>(null);
  const [, setProtectedScripts] = useState<any[]>([]);
  const [protectedReaderScript, setProtectedReaderScript] = useState<any | null>(null);
  const [writerPermissions, setWriterPermissions] = useState<any[]>([]);
  const [writerPermissionsLoading, setWriterPermissionsLoading] = useState(false);

  const featured = useMemo(() => tracks.find((track) => track.featured) ?? tracks[0] ?? null, [tracks]);
  const creatorSpotlight = creatorSpotlightList[0] ?? null;
  const writerSpotlight = writerSpotlightList[0] ?? null;
  const editorSpotlight = editorSpotlightList[0] ?? null;
  const creators = creatorDirectory;
  const filteredCreators = useMemo(() => {
    const query = creatorQuery.trim().toLowerCase();
    if (!query) return creatorDirectory;
    return creatorDirectory.filter((creator) => [creator.name, creator.handle, creator.note].filter(Boolean).join(' ').toLowerCase().includes(query));
  }, [creatorDirectory, creatorQuery]);
  const filteredTracks = useMemo(() => {
    const query = catalogueQuery.trim().toLowerCase();
    return tracks.filter((track) => {
      const haystack = [
        track.title, track.creator, track.category, track.genre, track.descriptor, track.seriesTitle,
        ...(track.tags ?? []), ...(track.tropes ?? []),
        ...(track.contributors ?? []).flatMap((item) => [item.name, item.role]),
      ].filter(Boolean).join(' ').toLowerCase();
      if (query && !haystack.includes(query)) return false;
      if (catalogueRating !== 'all' && track.contentRating !== catalogueRating) return false;
      if (catalogueDuration !== 'all') {
        const minutes = Number.parseFloat(track.duration);
        if (catalogueDuration === 'short' && !(minutes > 0 && minutes < 10)) return false;
        if (catalogueDuration === 'medium' && !(minutes >= 10 && minutes < 25)) return false;
        if (catalogueDuration === 'full' && !(minutes >= 25 && minutes < 45)) return false;
        if (catalogueDuration === 'long' && !(minutes >= 45)) return false;
      }
      return true;
    });
  }, [tracks, catalogueQuery, catalogueRating, catalogueDuration]);
  const studioMetrics = [
    ['Published releases', String(creatorDashboard.metrics?.released ?? 0)],
    ['Draft releases', String(creatorDashboard.metrics?.drafts ?? 0)],
    ['Verified listening', String(creatorDashboard.metrics?.verifiedListeningMinutes ?? 0) + ' min'],
    ['Unique listeners', String(creatorDashboard.metrics?.uniqueListeners ?? 0)],
  ];

  useEffect(() => {
    const onPop = () => {
      const value = window.location.pathname.replace(/^\/+|\/+$/g, '');
      setView((['discover','library','creators','creator','writer','editor','admin','protection','profile'].includes(value) ? value : 'discover') as View);
    };
    window.addEventListener('popstate', onPop);
    void (async () => {
      try {
        const data = await nightjarMedia.getBranding();
        setLogoUrl(data.logoUrl ?? null);
      } catch { /* branded wordmark remains available */ }
    })();
    let cancelled = false;
    const unsubscribe = nightjarAuth.observe((identity) => {
      if (cancelled) return;
      if (!identity) {
        setUser(null);
        setRole(null);
        return;
      }

      setUser({
        userId: identity.userId,
        email: identity.email ?? undefined,
        name: identity.name ?? undefined,
      });

      if (!identity.emailVerified) {
        setAgeStage('gate');
        return;
      }

      void (async () => {
        await loadAccount();
        const verified = await refreshAgeStatus();
        if (!verified) setAgeStage('assurance');
      })();
    });

    return () => {
      cancelled = true;
      unsubscribe();
      window.removeEventListener('popstate', onPop);
    };
  }, []);

  useEffect(() => {
    if (!user || !ageVerified || !role || role === 'admin') return;
    let cancelled = false;
    void nightjarCommunity.getMyProfile().then((data) => {
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

  const navigate = (nextView: View) => {
    const path = nextView === 'discover' ? '/discover' : '/' + nextView;
    if (window.location.pathname !== path) window.history.pushState({}, '', path);
    setView(nextView);
    setMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const loadLiveProductData = async () => {
    try {
      const [catalogueResponse, creatorsResponse, firebaseSpotlightResponse] = await Promise.all([
        nightjarCatalogue.list(),
        nightjarCommunity.listCreators(),
        nightjarCommunity.spotlightState(),
      ]);
      const liveTracks = (catalogueResponse.catalogue ?? []).map((release: any, index: number) => ({
        id: String(release.id),
        title: release.title,
        creator: release.creatorName ?? 'Nightjar creator',
        duration: release.durationMinutes ? String(release.durationMinutes) + ' min' : '—',
        category: release.category ?? 'Audio',
        descriptor: release.description ?? 'No description supplied.',
        featured: release.featured === true || index === 0,
        audioAvailable: release.audioAvailable === true,
        audioUrl: null,
        artworkUrl: release.artworkUrl ?? null,
        creatorUserId: release.creatorUserId,
        genre: release.genre ?? '',
        tags: release.tags ?? [],
        tropes: release.tropes ?? [],
        contributors: release.contributors ?? [],
        contentRating: release.contentRating ?? 'adult',
        seriesTitle: release.seriesTitle ?? null,
        episodeNumber: release.episodeNumber ?? null,
      })) as Track[];
      setTracks(liveTracks);
      setCreatorDirectory((creatorsResponse.creators ?? []).map((creator: any) => ({
        userId: String(creator.userId),
        name: creator.displayName ?? 'Nightjar creator',
        handle: creator.handle ?? null,
        initials: creator.avatarInitials ?? undefined,
        note: creator.headline ?? creator.bio ?? undefined,
        followers: creator.followerCount ?? 0,
        releases: creator.releaseCount ?? 0,
        share: (creator.listeningSharePercent ?? 0) + '%',
        imageUrl: creator.avatarUrl ?? null,
      })));
      const spotlights = firebaseSpotlightResponse.spotlights ?? [];
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
        imageUrl: item.imageUrl ?? null,
      });
      setCreatorSpotlightList(spotlights.filter((item: any) => item.kind === 'creator' && item.name).map(mapSpotlight));
      setWriterSpotlightList(spotlights.filter((item: any) => item.kind === 'writer' && item.name).map(mapSpotlight));
      setEditorSpotlightList(spotlights.filter((item: any) => item.kind === 'editor' && item.name).map(mapSpotlight));
      const listener = spotlights.find((item: any) => item.kind === 'listener' && item.name);
      setListenerSpotlight(listener ? mapSpotlight(listener) : null);
      setSpotlightMeta({
        listenerTopSevenCount: Number(firebaseSpotlightResponse.listenerTopSevenCount ?? 0),
        listenerSpotlightDay: firebaseSpotlightResponse.listenerSpotlightDay == null ? null : Number(firebaseSpotlightResponse.listenerSpotlightDay),
        listenerWeek: firebaseSpotlightResponse.listenerWeek ?? null,
      });
      await loadNotifications();
      if (user) {
        const [recommendationsResponse, trendingResponse, communityState] = await Promise.all([
          nightjarCatalogue.recommendations(currentIntent),
          nightjarCatalogue.trending(),
          nightjarCommunity.state(),
        ]);
        setLiveRecommendations(recommendationsResponse.recommendations ?? []);
        setLiveTrending(trendingResponse.trending ?? []);
        setFavouriteReleaseIds((communityState.favourites ?? []).map((item: any) => String(item.releaseId)));
        setFollowingProfileIds((communityState.follows ?? []).map((item: any) => String(item.targetUserId ?? item.creatorUserId)).filter(Boolean));
      }
    } catch {
      setTracks([]);
      setCreatorDirectory([]);
      setCreatorSpotlightList([]);
      setWriterSpotlightList([]);
      setEditorSpotlightList([]);
      setListenerSpotlight(null);
      setSpotlightMeta({ listenerTopSevenCount: 0, listenerSpotlightDay: null, listenerWeek: null });
      setNotifications([]);
      setNotificationUnreadCount(0);
      setNotificationsOpen(false);
      setLiveRecommendations([]);
      setLiveTrending([]);
    }
  };

  const loadNotifications = async () => {
    if (!nightjarAuth.current()) return;
    try {
      const data = await nightjarNotifications.list();
      const nextNotifications = data.notifications ?? [];
      setNotifications(nextNotifications);
      setNotificationUnreadCount(Number(data.unreadCount ?? 0));
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
      const personalSpotlight = nextNotifications.find((item: any) => item.type === 'spotlight' && item.spotlightDate === today && item.read !== true);
      if (personalSpotlight && window.sessionStorage.getItem('nightjar_spotlight_notice:' + today) !== 'shown') {
        window.sessionStorage.setItem('nightjar_spotlight_notice:' + today, 'shown');
        notify(personalSpotlight.title + ' — ' + personalSpotlight.message);
      }
    } catch { /* notifications remain non-blocking */ }
  };

  const markNotificationRead = async (notification: any) => {
    if (notification?.read === true) return;
    try {
      await nightjarNotifications.markRead(String(notification.id));
      setNotifications((items) => items.map((item) => item.id === notification.id ? { ...item, read: true } : item));
      setNotificationUnreadCount((count) => Math.max(0, count - 1));
    } catch { /* notification read state is non-critical */ }
  };

  const shareSpotlight = async (spotlight: Spotlight) => {
    const kindLabel = spotlight.kind === 'creator' ? 'Creator' : spotlight.kind === 'editor' ? 'Audio Editor' : 'Writer';
    const text = spotlight.kind === 'listener'
      ? `Nightjar is recognising ${spotlight.name} today as a Listener Spotlight. Thank you for being part of the listening community.`
      : `Today on Nightjar: ${spotlight.name} is our ${kindLabel} Spotlight. Discover the people shaping Nightjar's independent productions.`;
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
      const data = await nightjarCatalogue.dashboard();
      setCreatorDashboard({ metrics: data.metrics ?? {}, releases: data.releases ?? [] });
    } catch {
      setCreatorDashboard({ metrics: {}, releases: [] });
    } finally {
      setCreatorDashboardLoading(false);
    }
  };

  const loadWriterScripts = async () => {
    if (!user) return;
    try {
      const data = await nightjarScripts.writerScripts();
      const items = data.scripts ?? [];
      setWriterScripts(items);
      setWriterSelected((current: any) => current && items.some((item: any) => item.id === current.id) ? current : items[0] ?? null);
    } catch {
      setWriterScripts([]);
    }
  };

  const loadEditorQueue = async () => {
    if (!user) return;
    try {
      const data = await nightjarScripts.editorQueue();
      const items = data.queue ?? [];
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
      const data = await nightjarScripts.protectedCatalogue();
      setProtectedScripts(data.scripts ?? []);
    } catch {
      setProtectedScripts([]);
    }
  };

  const loadAccount = async () => {
    setAccountLoading(true);
    try {
      const data = await nightjarAccount.identity();
      setIdentityEmail(data.email ?? null);
      setIdentityAdmin(data.admin === true);

      if (data.status === 'suspended') {
        setRole(null);
        setRolePicker(false);
        setAgeStage('gate');
        notify('This Nightjar account is suspended. Contact Nightjar support if you believe this needs review.');
        return;
      }

      const nextStatus = data.status === 'pending_review' ? 'pending_review' : 'active';

      if (data.admin === true || data.role === 'admin') {
        setRole('admin');
        setAccountStatus('active');
        setRolePicker(false);
        navigate('admin');
        void loadAdminOverview();
        void loadSecurityAlerts();
        return;
      }

      if (data.role === 'creator' || data.role === 'listener' || data.role === 'writer' || data.role === 'editor') {
        setRole(data.role);
        setAccountStatus(nextStatus);
        setRolePicker(false);
        navigate(data.role === 'creator' ? 'creator' : data.role === 'writer' ? 'writer' : data.role === 'editor' ? 'editor' : 'discover');
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
    if (!nightjarAuth.current()) return false;
    try {
      const data = await nightjarAge.status();
      const verified = data.verified === true;
      setAgeVerified(verified);
      setAgeConfigured(data.configured === true);
      setAgeProvider(String(data.provider ?? 'not-configured'));
      setAgeEnvironment(data.environment === 'production' ? 'production' : 'sandbox');
      setAgeVerifiedAt(data.verifiedAt ?? null);
      setAgeReverifyRequired(data.reverifyRequired === true);
      setAgeSessionActive(false);
      setAgeStatus(data.status === 'COMPLETE' ? 'COMPLETE' : data.status === 'PENDING' || data.status === 'PROCESSING' || data.status === 'IN_PROGRESS' ? 'PENDING' : data.status === 'FAIL' || data.status === 'ERROR' || data.status === 'CANCELLED' ? 'FAIL' : 'NOT_STARTED');
      if (verified) setAgeStage('app');
      return verified;
    } catch {
      return false;
    }
  };

  const runAdminSandboxTest = async () => {
    setAgeLoading(true);
    try {
      const data = await nightjarAge.adminTestPass();
      if (data.verified) {
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
      if (!nightjarAuth.current()) {
        window.location.assign('/account');
        return;
      }
      const alreadyVerified = await refreshAgeStatus();
      if (alreadyVerified) {
        notify('Your Nightjar account is already age verified. No new check is needed.');
        return;
      }
      const data = await nightjarAge.start();
      setAgeConfigured(Boolean(data.configured));
      setAgeProvider(String(data.provider ?? 'not-configured'));
      setAgeEnvironment(data.environment === 'production' ? 'production' : 'sandbox');
      setAgeSessionActive(Boolean(data.sessionId && !data.verified));
      if (data.verified === true) {
        setAgeVerified(true);
        setAgeStatus('COMPLETE');
        setAgeVerifiedAt(typeof data.verifiedAt === 'string' ? data.verifiedAt : new Date().toISOString());
        setAgeReverifyRequired(false);
        setAgeSessionActive(false);
        setAgeStage('app');
        notify('Your Nightjar account is already age verified. No new check was required.');
      } else if (data.launchUrl) {
        setAgeStatus('PENDING');
        window.open(String(data.launchUrl), '_blank', 'noopener,noreferrer');
        notify('Secure age verification opened. Complete it, then return to Nightjar.');
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
    window.location.assign('/account');
  };

  const signOut = async () => {
    await nightjarAuth.signOut();
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
      const data = await nightjarAccount.chooseRole(nextRole);
      if (data.role === 'creator' || data.role === 'listener' || data.role === 'writer') {
        const nextStatus = data.status === 'pending_review' ? 'pending_review' : 'active';
        setRole(data.role);
        setAccountStatus(nextStatus);
        setRolePicker(false);
        navigate(data.role === 'creator' ? 'creator' : data.role === 'writer' ? 'writer' : 'discover');
        notify(data.role === 'creator'
          ? 'Creator account created. Creator approval and publishing controls can be completed in the production onboarding flow.'
          : data.role === 'writer'
            ? 'Writer account created. Welcome to Nightjar.'
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
      await nightjarProtection.record({
        eventType,
        relatedType: 'script',
        relatedId,
        deviceId: getProtectionDeviceToken(),
        summary: eventType === 'copy_blocked' ? 'Protected copy interaction blocked; no clipboard contents were captured.' : 'Protected interaction recorded by Nightjar.',
      });
    } catch { }
  };

  const openProtectedReader = async (scriptId: string) => {
    try {
      const data = await nightjarScripts.openProtected(scriptId);
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
      const next = !favouriteReleaseIds.includes(releaseId);
      await nightjarCommunity.setFavouriteRelease(releaseId, next);
      setFavouriteReleaseIds((items) => next ? Array.from(new Set([...items, releaseId])) : items.filter((id) => id !== releaseId));
    } catch {
      notify('Favourite could not be updated.');
    }
  };

  const toggleProfileFollow = async (targetUserId: string) => {
    if (!targetUserId || targetUserId === user?.userId) return;
    try {
      const next = !followingProfileIds.includes(targetUserId);
      await nightjarCommunity.setProfileFollow(targetUserId, next);
      setFollowingProfileIds((items) => next ? Array.from(new Set([...items, targetUserId])) : items.filter((id) => id !== targetUserId));
    } catch {
      notify('Follow could not be updated.');
    }
  };

  const playReleaseFromCreatorProfile = (release: any) => {
    const track = releaseToTrack(release);
    setTracks((items) => items.some((item) => item.id === track.id) ? items : [...items, track]);
    setCreatorProfileUserId(null);
    setPlaying(track.id);
  };

  const togglePlayback = (track: Track) => {
    if (!track.audioAvailable && !track.audioUrl) {
      notify('This release has no playable audio attached yet.');
      return;
    }
    setPlaying(playing === track.id ? null : track.id);
  };

  const loadAdminOverview = async () => {
    if (!canAdmin) return;
    setAdminOverviewLoading(true);
    try {
      const [people, commercial] = await Promise.all([
        nightjarAdministration.overview(),
        nightjarCommercial.overview(),
      ]);
      setCommercialOverview(commercial);
      setCommercialSettings(commercial.settings);
      setAdminOverview({
        ...people,
        subscriptions: commercial.subscriptions,
      });
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
      const [profileData, tasteData] = await Promise.all([
        nightjarCommunity.getMyProfile(),
        nightjarListening.taste(),
      ]);
      if (profileData?.profile) setProfile((current: any) => ({ ...current, ...profileData.profile }));
      setTasteVector(tasteData.vector ?? []);
    } catch { notify('Profile could not be loaded right now.'); }
    finally { setProfileLoading(false); }
  };

  const reviewEditorScript = async (status: string) => {
    if (!editorSelected) return;
    const comment = window.prompt('Editorial note (optional)') ?? '';
    try {
      const data = await nightjarScripts.review(editorSelected.id, status, comment);
      setEditorSelected(data.script ?? editorSelected);
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
      const data = await nightjarCommunity.saveMyProfile(profile);
      if (data?.profile) setProfile((current: any) => ({ ...current, ...data.profile }));
      notify('Your Nightjar profile has been saved.');
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      notify(message.includes('already-exists') ? 'That @handle is already in use.' : 'Profile could not be saved.');
    } finally { setProfileLoading(false); }
  };

  const loadSecurityAlerts = async () => {
    if (!canAdmin) return;
    setSecurityAlertsLoading(true);
    try {
      const data = await nightjarProtection.alerts();
      setSecurityAlerts(data.alerts ?? []);
    } catch { notify('Security alerts could not be loaded.'); }
    finally { setSecurityAlertsLoading(false); }
  };

  const loadAdminReports = async () => {
    if (!canAdmin) return;
    setAdminPanelLoading(true);
    try {
      const data = await nightjarProtection.adminReports();
      setAdminReports(data.reports ?? []);
    } catch { notify('Reports and feedback could not be loaded.'); }
    finally { setAdminPanelLoading(false); }
  };

  const suspendFromSecurityAlert = async (alert: any) => {
    if (!canAdmin || !alert?.id) return;
    try {
      await nightjarProtection.suspend(alert.id);
      await loadSecurityAlerts();
      await loadAdminOverview();
      notify('Account suspended and active protected-reader sessions revoked.');
    } catch { notify('The security action could not be completed.'); }
  };

  const revokeSessionsFromSecurityAlert = async (alert: any) => {
    if (!canAdmin || !alert?.id) return;
    try {
      await nightjarProtection.revokeSessions(alert.id);
      await loadSecurityAlerts();
      notify('Protected-reader sessions revoked. The account itself remains active pending review.');
    } catch { notify('Reader sessions could not be revoked.'); }
  };

  const closeSecurityAlertBenign = async (alert: any) => {
    if (!canAdmin || !alert?.id) return;
    const note = window.prompt('Optional review note — why is this activity considered benign?') ?? '';
    try {
      await nightjarProtection.closeBenign(alert.id, note);
      await loadSecurityAlerts();
      notify('Security alert closed as benign. Evidence remains retained.');
    } catch { notify('Security alert could not be closed.'); }
  };

  const loadWriterPermissions = async (scriptId?: string) => {
    const targetId = scriptId ?? writerSelected?.id;
    if (!targetId) {
      setWriterPermissions([]);
      return;
    }
    setWriterPermissionsLoading(true);
    try {
      const data = await nightjarScripts.permissions(targetId);
      setWriterPermissions(data.permissions ?? []);
    } catch {
      setWriterPermissions([]);
    } finally {
      setWriterPermissionsLoading(false);
    }
  };

  const shareWriterScript = async () => {
    if (!writerSelected?.id) return;
    const recipientUserId = window.prompt('Nightjar recipient account ID (VA, creator, Audio Editor or collaborator)');
    if (!recipientUserId?.trim()) return;
    const allowCopy = window.confirm('Allow this recipient to copy text from the manuscript?');
    const allowExport = window.confirm('Allow this recipient to export/download the full manuscript?');
    const expiry = window.prompt('Optional expiry date/time (ISO format), or leave blank for no expiry') ?? '';
    try {
      await nightjarScripts.setPermission(writerSelected.id, {
        recipientUserId: recipientUserId.trim(),
        allowCopy,
        allowExport,
        expiresAt: expiry.trim() || null,
      });
      await loadWriterPermissions(writerSelected.id);
      notify('Full-script access granted. The recipient permissions are explicit, logged and revocable.');
    } catch { notify('Script access could not be granted. Check the recipient account ID.'); }
  };

  const revokeWriterPermission = async (permission: any) => {
    if (!writerSelected?.id || !permission?.recipientUserId) return;
    if (!window.confirm('Revoke this recipient\'s full-script access and active reader sessions?')) return;
    try {
      await nightjarScripts.setPermission(writerSelected.id, {
        recipientUserId: permission.recipientUserId,
        revoke: true,
      });
      await loadWriterPermissions(writerSelected.id);
      notify('Full-script access revoked and active reader sessions closed.');
    } catch {
      notify('Script access could not be revoked.');
    }
  };

  const loadProtection = async () => {
    if (!user) return;
    try {
      const [evidence, reports] = await Promise.all([nightjarProtection.evidence(), nightjarProtection.reports()]);
      setProtectionEvidence(evidence.evidence ?? []);
      setProtectionReports(reports.reports ?? []);
    } catch { notify('Protection records could not be loaded right now.'); }
  };

  const submitProtectionReport = async () => {
    if (!reportSummary.trim()) return notify('Please describe what happened.');
    try {
      const data = await nightjarProtection.submitReport(reportCategory, reportSummary);
      setReportSummary('');
      await loadProtection();
      notify(`Report ${data.report?.caseId ?? ''} submitted.`);
    } catch { notify('We could not submit the report. Please try again.'); }
  };

  const accountLabel = role ? roleMeta[role].label : 'Signed out';
  const effectiveRole: AccountRole | null = role === 'admin' ? (previewRole ?? 'admin') : role;
  const canAdmin = role === 'admin';
  const canProtection = Boolean(user);

  const loadBranding = async () => {
    try {
      const data = await nightjarMedia.getBranding();
      setLogoUrl(data.logoUrl ?? null);
    } catch { /* wordmark fallback remains available */ }
  };

  const uploadLogo = async (file: File) => {
    if (!canAdmin) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      notify('Use PNG, JPG or WebP for the Nightjar logo.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      notify('Logo must be 5 MB or smaller.');
      return;
    }
    setLogoUploading(true);
    try {
      const dataUrl = await readFileDataUrl(file);
      await nightjarMedia.submitImage({ kind: 'brand_logo', dataUrl, contentType: file.type, fileName: file.name });
      notify('Logo submitted for image moderation. It will not appear publicly until an administrator approves it.');
      void loadPendingImages();
    } catch {
      notify('Logo upload failed.');
    } finally {
      setLogoUploading(false);
    }
  };

  const removeLogo = async () => {
    if (!canAdmin) return;
    try {
      await nightjarMedia.removeBrandLogo();
      setLogoUrl(null);
      notify('Nightjar logo removed.');
    } catch { notify('Logo could not be removed.'); }
  };

  const uploadProfileAvatar = async (file: File) => {
    if (!user) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      notify('Use PNG, JPG or WebP for profile images.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      notify('Profile image must be 5 MB or smaller.');
      return;
    }
    setProfileImageBusy(true);
    try {
      const dataUrl = await readFileDataUrl(file);
      const result = await nightjarMedia.submitImage({ kind: 'profile_avatar', dataUrl, contentType: file.type, fileName: file.name });
      setProfile((current: any) => ({ ...current, pendingAvatarStatus: result.status, pendingAvatarAssetId: result.assetId }));
      notify('Profile image submitted for administrator approval. Your current approved image stays live until the replacement is approved.');
    } catch { notify('Profile image could not be uploaded.'); }
    finally { setProfileImageBusy(false); }
  };

  const removeProfileImage = async () => {
    setProfileImageBusy(true);
    try {
      await nightjarMedia.removeProfileAvatar();
      setProfile((current: any) => ({ ...current, avatarUrl: null, avatarAssetId: null, avatarStatus: null, pendingAvatarAssetId: null, pendingAvatarStatus: null }));
      notify('Profile image removed.');
    } catch { notify('Profile image could not be removed.'); }
    finally { setProfileImageBusy(false); }
  };

  const loadPendingImages = async () => {
    if (!canAdmin) return;
    setAdminPanelLoading(true);
    try {
      const data = await nightjarMedia.listPending();
      setImageModeration(data.assets ?? []);
    } catch { notify('Pending image moderation could not be loaded.'); }
    finally { setAdminPanelLoading(false); }
  };

  const moderateImage = async (asset: any, decision: 'approved' | 'rejected') => {
    if (!canAdmin || !asset?.id) return;
    if (decision === 'approved') {
      const confirmed = window.confirm('Confirm you have reviewed this image and it contains no nudity, explicit sexual imagery or other imagery unsuitable for Nightjar.');
      if (!confirmed) return;
    }
    const note = decision === 'rejected' ? (window.prompt('Reason for rejecting this image (optional)') ?? '') : '';
    try {
      await nightjarMedia.moderate(asset.id, decision, note, decision === 'approved');
      await loadPendingImages();
      await loadBranding();
      await loadProfile();
      notify(decision === 'approved' ? 'Image approved for public use.' : 'Image rejected and its stored image bytes removed.');
    } catch { notify('Image moderation action could not be completed.'); }
  };

  const loadCommercialControls = async () => {
    if (!canAdmin) return;
    setAdminPanelLoading(true);
    try {
      const data = await nightjarCommercial.overview();
      setCommercialOverview(data);
      setCommercialSettings(data.settings);
      setAdminOverview((current: any) => ({ ...(current ?? {}), subscriptions: data.subscriptions }));
    } catch { notify('Commercial controls could not be loaded.'); }
    finally { setAdminPanelLoading(false); }
  };

  const saveCommercialControls = async () => {
    if (!canAdmin) return;
    setCommercialSaving(true);
    try {
      const data = await nightjarCommercial.save(commercialSettings);
      setCommercialSettings(data.settings);
      await loadCommercialControls();
      notify('Commercial assumptions saved.');
    } catch { notify('Commercial assumptions could not be saved.'); }
    finally { setCommercialSaving(false); }
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
      const data = await nightjarAdministration.creatorApplications();
      setAdminApplications(data.applications ?? []);
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
      const [ledger, commercial] = await Promise.all([
        nightjarCommercial.subscriptions(),
        nightjarCommercial.overview(),
      ]);
      setAdminSubscriptions(ledger.subscriptions ?? []);
      setCommercialOverview(commercial);
      setCommercialSettings(commercial.settings);
      setAdminOverview((current: any) => ({ ...(current ?? {}), subscriptions: commercial.subscriptions }));
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
      const [scriptsData, editorsData] = await Promise.all([
        nightjarScripts.adminScripts(),
        nightjarScripts.editorAccounts(),
      ]);
      setAdminScripts(scriptsData.scripts ?? []);
      setAdminEditors(editorsData.editors ?? []);
    } catch {
      notify('Editorial controls could not be loaded.');
    } finally {
      setAdminPanelLoading(false);
    }
  };

  const assignEditor = async (scriptId: string, editorUserId: string) => {
    if (!canAdmin || !scriptId || !editorUserId) return;
    try {
      await nightjarScripts.assignEditor(scriptId, editorUserId);
      await loadAdminEditorial();
      notify('Audio Editor assignment saved.');
    } catch {
      notify('Audio Editor assignment could not be saved.');
    }
  };

  const openAdminPanel = (panel: 'approvals' | 'reports' | 'revenue' | 'subscriptions' | 'economics' | 'editorial' | 'images') => {
    if (!canAdmin) return;
    setAdminPeopleRole(null);
    setAdminPanel(panel);
    if (panel === 'approvals') void loadAdminApplications();
    if (panel === 'reports') void loadAdminReports();
    if (panel === 'subscriptions') void loadAdminSubscriptions();
    if (panel === 'editorial') void loadAdminEditorial();
    if (panel === 'images') void loadPendingImages();
    if (panel === 'revenue' || panel === 'economics') void loadCommercialControls();
  };

  const decideCreatorApplication = async (application: any, decision: 'approved' | 'waitlist' | 'rejected') => {
    if (!canAdmin || !application?.id) return;
    try {
      await nightjarAdministration.decideCreatorApplication(application.id, decision);
      await loadAdminApplications();
      await loadAdminOverview();
      notify(`Creator application ${decision}.`);
    } catch {
      notify('Creator application decision could not be saved.');
    }
  };

  const changeAccountRole = async (account: any, nextRole: 'listener' | 'creator' | 'writer' | 'editor') => {
    if (!canAdmin || !account?.userId) return;
    try {
      await nightjarAdministration.setAccountRole(account.userId, nextRole, 'active');
      await loadAdminOverview();
      if (nextRole === 'editor') {
        notify('Account saved as Audio Editor and is now eligible for the public Audio Editor Spotlight when its profile is public.');
      } else {
        notify(`Account role changed to ${roleMeta[nextRole].label}.`);
      }
    } catch {
      notify('Account role could not be changed.');
    }
  };

  const changeAccountStatus = async (account: any, nextStatus: 'active' | 'pending_review' | 'suspended') => {
    if (!canAdmin || !account?.userId || !account?.role || account.role === 'admin') return;
    try {
      await nightjarAdministration.setAccountRole(account.userId, account.role, nextStatus);
      await loadAdminOverview();
      notify(`Account status changed to ${nextStatus.replace('_', ' ')}.`);
    } catch {
      notify('Account status could not be changed.');
    }
  };

  const changeTestAccess = async (account: any, enabled: boolean) => {
    if (!canAdmin || !account?.userId || account.role === 'admin') return;
    try {
      await nightjarAdministration.setTestAccess(account.userId, enabled);
      await loadAdminOverview();
      notify(enabled
        ? 'Temporary tester access enabled. This account can use Nightjar while age assurance is not configured.'
        : 'Temporary tester access removed. Normal age assurance requirements apply again.');
    } catch {
      notify('Tester access could not be changed.');
    }
  };

  const createWriterDraft = async () => {
    const title = writerDraftTitle.trim();
    if (!title) return notify('Give the script a working title first.');
    try {
      const data = await nightjarScripts.create(title, '');
      setWriterDraftTitle('');
      await loadWriterScripts();
      setWriterSelected(data.script ?? null);
      if (data.script?.id) await loadWriterPermissions(data.script.id);
      notify('Draft created.');
    } catch {
      notify('The script could not be created.');
    }
  };

  const saveWriterScript = async () => {
    if (!writerSelected) return;
    try {
      const data = await nightjarScripts.update(writerSelected.id, writerSelected);
      setWriterSelected(data.script ?? writerSelected);
      await loadWriterScripts();
      notify('Script saved.');
    } catch {
      notify('Script could not be saved.');
    }
  };

  const createWriterVersion = async () => {
    if (!writerSelected) return;
    try {
      const data = await nightjarScripts.createVersion(writerSelected.id);
      setWriterSelected(data.script ?? writerSelected);
      await loadWriterScripts();
      notify('Version recorded.');
    } catch {
      notify('Version could not be recorded.');
    }
  };

  const deleteWriterScript = async () => {
    if (!writerSelected?.id) return;
    if (!['Draft','Rejected'].includes(String(writerSelected.status ?? 'Draft'))) {
      notify('Only Draft or Rejected manuscripts can be deleted.');
      return;
    }
    if (!window.confirm('Delete this manuscript and its saved versions? This cannot be undone.')) return;
    try {
      await nightjarScripts.remove(writerSelected.id);
      setWriterSelected(null);
      setWriterPermissions([]);
      await loadWriterScripts();
      notify('Manuscript deleted.');
    } catch {
      notify('Manuscript could not be deleted.');
    }
  };

  const submitWriterScript = async () => {
    if (!writerSelected) return;
    try {
      const data = await nightjarScripts.submit(writerSelected.id);
      setWriterSelected(data.script ?? writerSelected);
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

  if (ageStage === 'assurance' && !rolePicker) {
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
                  <div><span className="role-kicker">AUDIO EDITOR / ADMINISTRATOR</span><h2>Controlled roles</h2><p>Audio Editors are assigned to controlled production work. Administrators are restricted to the owner allowlist.</p></div>
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
          {logoUrl ? <img className="brand-logo" src={logoUrl} alt="Nightjar" /> : <img className="brand-logo" src="/favicon.svg" alt="Nightjar" />}<span>NIGHTJAR</span>
        </button>

        <nav className={menuOpen ? 'nav open' : 'nav'}>
          {(effectiveRole === 'listener' || effectiveRole === 'admin' || !role) && <button className={view === 'discover' ? 'nav-link active' : 'nav-link'} onClick={() => navigate('discover')}>Discover</button>}
          {(effectiveRole === 'listener' || effectiveRole === 'admin' || !role) && <button className={view === 'creators' ? 'nav-link active' : 'nav-link'} onClick={() => navigate('creators')}>Creators</button>}
          {(effectiveRole === 'listener' || (role === 'admin' && previewRole === 'listener')) && <button className={view === 'library' ? 'nav-link active' : 'nav-link'} onClick={() => navigate('library')}>Library</button>}
          {(creatorOnly || adminOnly) && <button className={view === 'creator' ? 'nav-link active' : 'nav-link'} onClick={() => { navigate('creator'); void loadCreatorDashboard(); }}>Creator Studio</button>}
          {effectiveRole === 'writer' && <button className={view === 'writer' ? 'nav-link active' : 'nav-link'} onClick={() => { navigate('writer'); void loadWriterScripts(); }}>Writer Studio</button>}
          {effectiveRole === 'editor' && <button className={view === 'editor' ? 'nav-link active' : 'nav-link'} onClick={() => { navigate('editor'); void loadEditorQueue(); }}>Editorial</button>}
          {canProtection && <button className={view === 'profile' ? 'nav-link active' : 'nav-link'} onClick={() => { navigate('profile'); void loadProfile(); }}>Profile</button>}
          {canProtection && <button className={view === 'protection' ? 'nav-link active' : 'nav-link'} onClick={() => { navigate('protection'); void loadProtection(); }}>Protection</button>}
          {canAdmin && <button className={view === 'admin' ? 'nav-link active' : 'nav-link'} onClick={() => { navigate('admin'); void loadAdminOverview(); void loadSecurityAlerts(); }}>Admin</button>}
          {canAdmin && <div className="admin-preview-strip"><span><ShieldCheck size={14} /> ADMIN PREVIEW · REAL ROLE: ADMINISTRATOR</span><button className={previewRole === 'listener' ? 'active' : ''} onClick={() => selectPreviewRole('listener')}>Listener</button><button className={previewRole === 'creator' ? 'active' : ''} onClick={() => selectPreviewRole('creator')}>Creator</button><button className={previewRole === 'writer' ? 'active' : ''} onClick={() => selectPreviewRole('writer')}>Writer</button><button className={previewRole === 'editor' ? 'active' : ''} onClick={() => selectPreviewRole('editor')}>Audio Editor</button><button className={!previewRole ? 'active' : ''} onClick={clearAdminPreview}>Admin</button></div>}
        </nav>

        <div className="top-actions">
          {user && <div className="notification-wrap">
            <button className="ghost-button notification-button" onClick={() => setNotificationsOpen((open) => !open)} aria-label={notificationUnreadCount ? String(notificationUnreadCount) + ' unread notifications' : 'Notifications'}>
              <Bell size={17} />
              {notificationUnreadCount > 0 && <span className="notification-badge">{notificationUnreadCount > 9 ? '9+' : notificationUnreadCount}</span>}
            </button>
            {notificationsOpen && <section className="notification-popover" aria-label="Nightjar notifications">
              <div className="notification-popover-head"><div><span className="mini-label">NIGHTJAR NOTIFICATIONS</span><strong>Community updates</strong></div><button className="icon-button" onClick={() => setNotificationsOpen(false)} aria-label="Close notifications"><X size={15} /></button></div>
              {notifications.length ? <div className="notification-list">{notifications.slice(0, 8).map((item) => <button className={item.read ? 'notification-row' : 'notification-row unread'} key={item.id} onClick={() => void markNotificationRead(item)}>
                <span className="notification-row-icon">{item.subtype === 'creator' ? <Mic2 size={15} /> : item.subtype === 'writer' ? <FileText size={15} /> : <Headphones size={15} />}</span>
                <span><strong>{item.title}</strong><small>{item.message}</small></span>
              </button>)}</div> : <div className="notification-empty"><Bell size={17} /><span>No new community notifications.</span></div>}
            </section>}
          </div>}
          {!user ? (
            <button className="primary-button" disabled={accountLoading} onClick={() => void signIn()}>Sign in <ArrowRight size={15} /></button>
          ) : (
            <>
              <button className="account-chip" onClick={() => setRolePicker(true)}>
                <span className="account-chip-avatar">{profile.avatarUrl ? <img className="avatar-approved-image" src={profile.avatarUrl} alt="" /> : (user.name ?? user.email ?? 'N').slice(0, 1).toUpperCase()}</span>
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
                  <button className="primary-button" onClick={() => document.getElementById('catalogue')?.scrollIntoView({ behavior: 'smooth' })}>Enter the listening room <ArrowRight size={16} /></button>
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
                      <button className="round-play" disabled={!featured.audioAvailable && !featured.audioUrl} onClick={() => togglePlayback(featured)} aria-label={playing === featured.id ? 'Pause release' : 'Play release'}>{playing === featured.id ? <Pause size={19} /> : <Play size={19} fill="currentColor" />}</button>
                    </div>
                    <div className="player-meta"><span>{featured.duration}</span><span>{featured.audioAvailable || featured.audioUrl ? 'Private audio connected' : 'Audio not connected'}</span></div>
                  </> : <div className="empty-feature"><Moon size={40}/><strong>No featured release yet.</strong><span>Published catalogue records will appear here as creators release audio.</span></div>}
                </div>
              </div>
            </section>

            <section className="editorial-strip"><span>VOICE</span><span>STORY</span><span>ATMOSPHERE</span><span>CHARACTER</span><span>SOUND DESIGN</span><span>AFTER DARK</span></section>

            <section className="spotlight-section section-wrap" aria-labelledby="daily-spotlights-title">
              <div className="section-head spotlight-heading"><div><p className="eyebrow"><Sparkles size={14} /> INCLUSION ROTATION</p><h2 id="daily-spotlights-title">Today in the spotlight.</h2></div><span className="spotlight-cycle">04 LANES · 01 DAY EACH · FAIR ROTATION</span></div>
              <div className="spotlight-grid">
                {creatorSpotlight ? <article className="spotlight-tile creator-spotlight-tile">
                  <div className="spotlight-art">{creatorSpotlight.imageUrl ? <img className="spotlight-profile-image" src={creatorSpotlight.imageUrl} alt="" /> : <span className="spotlight-initials">{creatorSpotlight.initials || 'NJ'}</span>}<span className="spotlight-art-mark"><Mic2 size={20} /></span></div>
                  <div className="spotlight-copy"><div className="spotlight-topline"><span className="mini-label">CREATOR SPOTLIGHT</span><span className="spotlight-day">TODAY · 24 HOURS</span></div><h3>{creatorSpotlight.name}</h3><p className="spotlight-handle">{creatorSpotlight.handle ? '@' + creatorSpotlight.handle.replace(/^@/,'') : 'Handle not set'}</p><div className="spotlight-edition"><span>{creatorSpotlight.edition || 'Creator Spotlight'}</span><strong>{creatorSpotlight.title || 'Creator profile'}</strong><p>{creatorSpotlight.detail || 'A full day of discovery for this Nightjar creator.'}</p></div><div className="spotlight-actions">{creatorSpotlight.releaseId && tracks.some((track) => track.id === String(creatorSpotlight.releaseId)) ? <button className="secondary-button" onClick={() => { const track = tracks.find((item) => item.id === String(creatorSpotlight.releaseId)); if (track) togglePlayback(track); }}>Listen to highlighted release <Play size={14} /></button> : <button className="secondary-button" onClick={() => setCreatorProfileUserId(creatorSpotlight.targetId ?? null)}>Meet {creatorSpotlight.name} <ArrowRight size={14} /></button>}{creatorSpotlight.publicProfile !== false && creatorSpotlight.targetId && creatorSpotlight.targetId !== user?.userId && <button className="ghost-button" onClick={() => void toggleProfileFollow(creatorSpotlight.targetId!)}><Heart size={15} fill={followingProfileIds.includes(creatorSpotlight.targetId) ? 'currentColor' : 'none'} /> {followingProfileIds.includes(creatorSpotlight.targetId) ? 'Following' : 'Follow creator'}</button>}{creatorSpotlight.publicProfile !== false && <button className="ghost-button" onClick={() => void shareSpotlight(creatorSpotlight)} aria-label={`Share ${creatorSpotlight.name}'s creator spotlight`}><Share2 size={15} /> Share spotlight</button>}</div></div>
                </article> : <div className="spotlight-tile"><div className="spotlight-copy"><span className="mini-label">CREATOR SPOTLIGHT</span><h3>Awaiting creators</h3><p className="spotlight-handle">Every active Creator joins the daily rotation automatically.</p></div></div>}
                {writerSpotlight ? <article className="spotlight-tile writer-spotlight-tile">
                  <div className="spotlight-art">{writerSpotlight.imageUrl ? <img className="spotlight-profile-image" src={writerSpotlight.imageUrl} alt="" /> : <span className="spotlight-initials">{writerSpotlight.initials || 'NJ'}</span>}<span className="spotlight-art-mark"><FileText size={20} /></span></div>
                  <div className="spotlight-copy"><div className="spotlight-topline"><span className="mini-label">WRITER SPOTLIGHT</span><span className="spotlight-day">TODAY · 24 HOURS</span></div><h3>{writerSpotlight.name}</h3><p className="spotlight-handle">{writerSpotlight.handle ? '@' + writerSpotlight.handle.replace(/^@/,'') : 'Handle not set'}</p><div className="spotlight-edition"><span>{writerSpotlight.edition || 'Writer Spotlight'}</span><strong>{writerSpotlight.title || 'Writer profile'}</strong><p>{writerSpotlight.detail || 'A full day of discovery for this Nightjar writer.'}</p></div><div className="spotlight-actions"><button className="secondary-button" onClick={() => document.getElementById('writer-discovery-title')?.scrollIntoView({ behavior: 'smooth' })}>Explore writer <ArrowRight size={14} /></button>{writerSpotlight.publicProfile !== false && writerSpotlight.targetId && writerSpotlight.targetId !== user?.userId && <button className="ghost-button" onClick={() => void toggleProfileFollow(writerSpotlight.targetId!)}><Heart size={15} fill={followingProfileIds.includes(writerSpotlight.targetId) ? 'currentColor' : 'none'} /> {followingProfileIds.includes(writerSpotlight.targetId) ? 'Following' : 'Follow writer'}</button>}{writerSpotlight.publicProfile !== false && <button className="ghost-button" onClick={() => void shareSpotlight(writerSpotlight)} aria-label={`Share ${writerSpotlight.name}'s writer spotlight`}><Share2 size={15} /> Share spotlight</button>}</div></div>
                </article> : <div className="spotlight-tile"><div className="spotlight-copy"><span className="mini-label">WRITER SPOTLIGHT</span><h3>Awaiting writers</h3><p className="spotlight-handle">Every active Writer joins the daily rotation automatically.</p></div></div>}
                {editorSpotlight ? <article className="spotlight-tile editor-spotlight-tile">
                  <div className="spotlight-art">{editorSpotlight.imageUrl ? <img className="spotlight-profile-image" src={editorSpotlight.imageUrl} alt="" /> : <span className="spotlight-initials">{editorSpotlight.initials || 'NJ'}</span>}<span className="spotlight-art-mark"><FileCheck2 size={20} /></span></div>
                  <div className="spotlight-copy"><div className="spotlight-topline"><span className="mini-label">AUDIO EDITOR SPOTLIGHT</span><span className="spotlight-day">TODAY · 24 HOURS</span></div><h3>{editorSpotlight.name}</h3><p className="spotlight-handle">{editorSpotlight.handle ? '@' + editorSpotlight.handle.replace(/^@/,'') : 'Handle not set'}</p><div className="spotlight-edition"><span>{editorSpotlight.edition || 'Audio Editor Spotlight'}</span><strong>{editorSpotlight.title || 'Audio Editor profile'}</strong><p>{editorSpotlight.detail || 'A full day of recognition for an Audio Editor shaping Nightjar productions.'}</p></div><div className="spotlight-actions">{editorSpotlight.publicProfile !== false && editorSpotlight.targetId && <button className="secondary-button" onClick={() => setPublicProfileUserId(editorSpotlight.targetId!)}>View Audio Editor profile <ArrowRight size={14}/></button>}{editorSpotlight.publicProfile !== false && editorSpotlight.targetId && editorSpotlight.targetId !== user?.userId && <button className="ghost-button" onClick={() => void toggleProfileFollow(editorSpotlight.targetId!)}><Heart size={15} fill={followingProfileIds.includes(editorSpotlight.targetId) ? 'currentColor' : 'none'} /> {followingProfileIds.includes(editorSpotlight.targetId) ? 'Following' : 'Follow Audio Editor'}</button>}{editorSpotlight.publicProfile !== false && <button className="ghost-button" onClick={() => void shareSpotlight(editorSpotlight)} aria-label={`Share ${editorSpotlight.name}'s Audio Editor spotlight`}><Share2 size={15} /> Share spotlight</button>}</div></div>
                </article> : <div className="spotlight-tile editor-spotlight-tile"><div className="spotlight-copy"><span className="mini-label">AUDIO EDITOR SPOTLIGHT</span><h3>Awaiting Audio Editors</h3><p className="spotlight-handle">Every active public Audio Editor joins the daily rotation automatically.</p></div></div>}
                {listenerSpotlight ? <article className="spotlight-tile listener-spotlight-tile">
                  <div className="spotlight-art"><span className="spotlight-initials">{listenerSpotlight.initials || 'NJ'}</span><span className="spotlight-art-mark"><Headphones size={20} /></span></div>
                  <div className="spotlight-copy"><div className="spotlight-topline"><span className="mini-label">LISTENER SPOTLIGHT</span><span className="spotlight-day">TODAY · 24 HOURS</span></div><h3>{listenerSpotlight.name}</h3><p className="spotlight-handle">{listenerSpotlight.handle ? '@' + listenerSpotlight.handle.replace(/^@/,'') : 'Handle not set'}</p><div className="spotlight-edition"><span>{listenerSpotlight.edition || 'WEEKLY TOP 7'}</span><strong>{listenerSpotlight.title || 'Community listener'}</strong><p>{listenerSpotlight.detail || 'Recognised for the most tracked listening activity in the previous completed week.'}</p></div><div className="spotlight-listener-meta"><span>TOP {spotlightMeta.listenerTopSevenCount || 0}</span><span>DAY {spotlightMeta.listenerSpotlightDay || 1} / 7</span></div><div className="spotlight-thanks"><Headphones size={14} /><span>Thank you for helping make Nightjar’s listening community what it is.</span></div>{listenerSpotlight.publicProfile !== false && listenerSpotlight.targetId && <div className="spotlight-actions"><button className="secondary-button" onClick={() => setPublicProfileUserId(listenerSpotlight.targetId!)}>View listener profile <ArrowRight size={14}/></button>{listenerSpotlight.targetId !== user?.userId && <button className="ghost-button" onClick={() => void toggleProfileFollow(listenerSpotlight.targetId!)}><Heart size={15} fill={followingProfileIds.includes(listenerSpotlight.targetId) ? 'currentColor' : 'none'} /> {followingProfileIds.includes(listenerSpotlight.targetId) ? 'Following' : 'Follow listener'}</button>}</div>}</div>
                </article> : <div className="spotlight-tile listener-spotlight-tile"><div className="spotlight-copy"><span className="mini-label">LISTENER SPOTLIGHT</span><h3>Weekly listener recognition</h3><p className="spotlight-handle">The previous completed week’s top seven tracked Listeners rotate one per day. The seven refresh together when the new week begins.</p></div></div>}
              </div>
              <p className="spotlight-note">Every active Creator, Writer and public Audio Editor receives a full day in deterministic rotation, with a shareable spotlight to help the community naturally discover the people shaping Nightjar. Listener Spotlight recognises the previous completed week’s top seven Listeners, one per day, and thanks them for helping Nightjar thrive.</p>
            </section>

            <WriterDiscovery followingIds={followingProfileIds} onToggleFollow={toggleProfileFollow} notify={notify} />

            <section id="catalogue" className="section-wrap">
              <div className="section-head"><div><p className="eyebrow">THE LISTENING ROOM</p><h2>Published releases.</h2></div><button className="text-button with-icon" onClick={() => document.getElementById('for-you')?.scrollIntoView({behavior:'smooth'})}>Personalise <Sparkles size={14}/></button></div>
              <div className="catalogue-filter-bar">
                <label className="catalogue-search"><Search size={15}/><input value={catalogueQuery} onChange={(event)=>setCatalogueQuery(event.target.value)} placeholder="Search title, VA, Writer, Audio Editor, trope or genre"/></label>
                <select value={catalogueRating} onChange={(event)=>setCatalogueRating(event.target.value)} aria-label="Content level"><option value="all">All content levels</option><option value="sfw">SFW</option><option value="suggestive">Suggestive</option><option value="adult">Adult</option><option value="explicit">Explicit</option></select>
                <select value={catalogueDuration} onChange={(event)=>setCatalogueDuration(event.target.value)} aria-label="Audio duration"><option value="all">Any length</option><option value="short">Under 10 min</option><option value="medium">10–24 min</option><option value="full">25–44 min</option><option value="long">45+ min</option></select>
              </div>
              <div className="track-grid">
                {filteredTracks.slice(0, 24).map((track) => <LiveTrackCard key={track.id} track={track} playing={playing === track.id} favourite={favouriteReleaseIds.includes(track.id)} onPlay={togglePlayback} onFavourite={() => void toggleFavouriteRelease(track.id)} />)}
                {!filteredTracks.length && <div className="people-empty"><Headphones size={18}/><strong>No matching releases.</strong><span>{tracks.length ? 'Try another creator, writer, trope, genre or filter.' : 'The listening room will populate from real creator releases once audio is published.'}</span></div>}
              </div>
            </section>

            <section id="for-you" className="section-wrap">
              <div className="section-head"><div><p className="eyebrow"><Sparkles size={14}/> FOR YOU</p><h2>What fits right now.</h2></div><select className="mood-select" value={currentIntent} onChange={(event) => setCurrentIntent(event.target.value)} aria-label="Current listening intent"><option value="">Open to anything</option><option value="wind">Wind down</option><option value="story">A story</option><option value="quiet">Something quiet</option><option value="focus">Focus</option><option value="discover">Discover something new</option></select></div>
              <p className="section-copy">Declared preferences carry more weight than observed behaviour. The current session intent only changes the present recommendation context.</p>
              <div className="track-grid">
                {liveRecommendations.map((release: any) => { const track = releaseToTrack(release); return <LiveTrackCard key={track.id} track={track} playing={playing === track.id} favourite={favouriteReleaseIds.includes(track.id)} onPlay={togglePlayback} onFavourite={() => void toggleFavouriteRelease(track.id)} reason={release.reason ? String(release.reason) : undefined} />; })}
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

            <TransparencyPanel notify={notify} />

            <section className="creator-band section-wrap">
              <div className="section-head"><div><p className="eyebrow">THE CREATOR NETWORK</p><h2>Voices worth following.</h2></div><button className="text-button with-icon" onClick={() => navigate('creators')}>Meet the creators <ArrowRight size={15} /></button></div>
              <div className="creator-grid">{creators.slice(0, 5).map((creator) => <button className="creator-card" key={creator.userId} onClick={() => navigate('creators')}><span className="avatar-large">{creator.imageUrl ? <img className="avatar-approved-image" src={creator.imageUrl} alt="" /> : creator.initials || creator.name.slice(0,2).toUpperCase()}</span><span className="creator-card-copy"><strong>{creator.name}</strong><span>{creator.handle ? '@' + creator.handle.replace(/^@/,'') : 'Handle not set'}</span><em>{creator.note || 'Nightjar creator profile.'}</em><small>{creator.releases ?? 0} published releases</small></span><ChevronRight size={17} /></button>)}</div>
              {!creators.length && <div className="people-empty"><Users size={18}/><strong>No approved creator profiles yet.</strong><span>Creator discovery will populate from approved public accounts.</span></div>}
            </section>

            <section className="studio-feature section-wrap">
              <div className="studio-feature-copy"><p className="eyebrow"><BarChart3 size={14} /> CREATOR STUDIO</p><h2>Clear work. Clear rates. Real analytics.</h2><p>Nightjar separates the equal capped standard creator rate from listening analytics. Commercial records stay grounded in confirmed billing rather than fabricated earnings.</p><button className="primary-button" onClick={() => creatorOnly || adminOnly ? navigate('creator') : notify('Apply as a Creator to access Creator Studio.')}>Open Creator Studio <ArrowRight size={16} /></button></div>
              <div className="studio-preview-card"><div className="studio-card-head"><div><span className="mini-label">LIVE CREATOR DATA</span><strong>{creatorOnly ? 'Your account' : 'Connected data'}</strong></div><span className="studio-period">{creatorDashboardLoading ? 'LOADING' : 'LIVE RECORDS'}</span></div><div className="studio-metrics">{studioMetrics.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div><div className="formula-line"><span>PAID SUBSCRIPTIONS</span><ChevronRight size={12}/><span>PUBLISHED RATE BAND</span><ChevronRight size={12}/><span>CAPPED EQUAL RATE</span></div></div>
            </section>
          </section>
        )}

        {view === 'creators' && (
          <section className="page-wrap">
            <div className="page-heading"><div><p className="eyebrow">THE CREATOR NETWORK</p><h1>Voices with a world behind them.</h1><p>Discover independent creators building original catalogues for the Nightjar audience.</p></div><label className="creator-directory-search"><Search size={16}/><input value={creatorQuery} onChange={(event)=>setCreatorQuery(event.target.value)} placeholder="Search creator or handle"/></label></div>
            <div className="creator-directory">{filteredCreators.map((creator, index) => <article className="creator-profile" key={creator.userId}><div className="profile-number">0{index + 1}</div><span className="avatar-xl">{creator.imageUrl ? <img className="avatar-approved-image" src={creator.imageUrl} alt="" /> : creator.initials}</span><div className="profile-main"><div className="profile-heading"><div><h2>{creator.name}</h2><span>{creator.handle}</span></div><button className="icon-button" onClick={() => void toggleProfileFollow(creator.userId)} aria-label={followingProfileIds.includes(creator.userId) ? 'Unfollow creator' : 'Follow creator'}><Heart size={17} fill={followingProfileIds.includes(creator.userId) ? 'currentColor' : 'none'} /></button></div><p>{creator.note}</p><div className="profile-stats"><span><strong>{creator.followers}</strong> followers</span><span><strong>{creator.releases}</strong> releases</span><span><strong>{creator.share}</strong> listening share</span></div></div><button className="round-arrow" onClick={() => setCreatorProfileUserId(creator.userId)}><ArrowRight size={18} /></button></article>)}</div>
          </section>
        )}

        {view === 'creator' && (
          <section className="page-wrap studio-page">
            <div className="page-heading studio-page-heading">
              <div>
                <p className="eyebrow"><BarChart3 size={14} /> CREATOR STUDIO</p>
                <h1>Your audience. Your catalogue. Fair, transparent pay.</h1>
                <p>{accountStatus === 'pending_review' ? 'Your Creator application is awaiting approval.' : 'Your real release pipeline, from upload through moderation to live catalogue.'}</p>
              </div>
              <button className="primary-button with-icon" disabled={!creatorOnly} onClick={() => document.getElementById('creator-pipeline')?.scrollIntoView({ behavior: 'smooth' })}>
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
            {creatorOnly && <CreatorCompensationCard notify={notify} />}
            {creatorOnly && <CollaborationHub role="creator" notify={notify} />}
            <article className="panel-card"><div className="panel-title"><div><span className="mini-label">ECONOMICS</span><h2>Capped equal standard rate</h2></div><ShieldCheck size={18}/></div><div className="formula-stack"><div><span>01</span><strong>Confirmed paid subscriptions</strong></div><ChevronRight size={15}/><div><span>02</span><strong>Published subscriber-rate band</strong></div><ChevronRight size={15}/><div><span>03</span><strong>Equal eligible creator rate, limited by the configured cap</strong></div></div><p className="panel-note">Verified listening remains available as analytics and discovery data. It does not make one Creator’s standard base rate larger than another’s.</p></article>
          </section>
        )}

        {view === 'library' && (effectiveRole === 'listener' || (role === 'admin' && previewRole === 'listener')) && (
          <section className="page-wrap">
            <ListenerLibrary
              onPlayRelease={(release)=>{const track=releaseToTrack(release); setTracks((items)=>items.some((item)=>item.id===track.id)?items:[...items,track]); setPlaying(track.id);}}
              notify={notify}
            />
          </section>
        )}

        {view === 'profile' && (
          <section className="page-section profile-page">
            <div className="page-heading"><div><span className="eyebrow"><UserCircle2 size={14}/> YOUR NIGHTJAR</span><h1>Make Nightjar yours.</h1><p>Every account gets a personal identity and taste profile. Your role controls permissions; your profile controls how you present yourself.</p></div></div>
            <div className="profile-editor-grid">
              <article className="panel profile-editor-card">
                <span className="mini-label">IDENTITY</span>
                <div className="profile-avatar-preview" data-tone={profile.avatarTone || 'plum'}>{profile.avatarUrl ? <img className="profile-approved-image" src={profile.avatarUrl} alt="Approved profile" /> : <strong>{profile.avatarInitials || (profile.displayName || user?.name || 'N').slice(0,2).toUpperCase()}</strong>}</div>
                <div className="profile-image-controls"><label className="secondary-button upload-label"><ImagePlus size={15}/> {profileImageBusy ? 'Working…' : profile.avatarUrl ? 'Replace picture' : 'Add profile picture'}<input type="file" accept="image/png,image/jpeg,image/webp" hidden disabled={profileImageBusy} onChange={(event)=>{const file=event.target.files?.[0]; if(file) void uploadProfileAvatar(file); event.currentTarget.value='';}} /></label>{(profile.avatarUrl || profile.pendingAvatarAssetId) && <button className="ghost-button" disabled={profileImageBusy} onClick={()=>void removeProfileImage()}>Remove picture</button>}</div>
                {profile.pendingAvatarStatus === 'pending' && <p className="image-moderation-status">Picture pending administrator approval. It is not public yet.</p>}
                {profile.pendingAvatarStatus === 'rejected' && <p className="image-moderation-status">The submitted picture was not approved. You can upload another.</p>}
                <h2>{profile.displayName || user?.name || 'Choose your name'}</h2>
                <label>Chosen name<input value={profile.displayName} onChange={(e)=>setProfile((p:any)=>({...p,displayName:e.target.value}))} placeholder="How Nightjar should call you"/></label>
                <label>@handle<input value={profile.handle} onChange={(e)=>setProfile((p:any)=>({...p,handle:e.target.value}))} placeholder="youruniquehandle"/></label>
                <div className="profile-inline-fields"><label>Avatar initials<input maxLength={4} value={profile.avatarInitials} onChange={(e)=>setProfile((p:any)=>({...p,avatarInitials:e.target.value.toUpperCase()}))} placeholder="NJ"/></label><label>Profile tone<select value={profile.avatarTone || 'plum'} onChange={(e)=>setProfile((p:any)=>({...p,avatarTone:e.target.value}))}><option value="plum">Plum</option><option value="wine">Wine</option><option value="mauve">Mauve</option><option value="ivory">Ivory</option></select></label></div>
                <label>Headline<input value={profile.headline} onChange={(e)=>setProfile((p:any)=>({...p,headline:e.target.value}))} placeholder="A short line that feels like you"/></label>
                <label>Pronouns <span className="optional-label">optional</span><input value={profile.pronouns} onChange={(e)=>setProfile((p:any)=>({...p,pronouns:e.target.value}))} placeholder="e.g. she/her"/></label>
                <label>Bio<textarea value={profile.bio} onChange={(e)=>setProfile((p:any)=>({...p,bio:e.target.value}))} placeholder="Tell people a little about you"/></label>
                <label>Welcome message <span className="optional-label">optional</span><textarea value={profile.welcomeMessage ?? ''} onChange={(e)=>setProfile((p:any)=>({...p,welcomeMessage:e.target.value}))} placeholder="A message visitors see when they open your profile"/></label>
              </article>
              <article className="panel profile-editor-card">
                <span className="mini-label">TASTE & ROLE</span>
                <h2>What you love</h2>
                <p className="panel-note">Declared preferences are yours to choose. Nightjar keeps them separate from identity and uses them to refine recommendations.</p>
                <MultiSelectField label="Favourite tags" options={PROFILE_TAG_OPTIONS} values={profile.favouriteTags ?? []} onChange={(values)=>setProfile((p:any)=>({...p,favouriteTags:values}))}/>
                <MultiSelectField label="Favourite tropes" options={PROFILE_TROPE_OPTIONS} values={profile.favouriteTropes ?? []} onChange={(values)=>setProfile((p:any)=>({...p,favouriteTropes:values}))}/>
                <MultiSelectField label="Favourite categories" options={PROFILE_CATEGORY_OPTIONS} values={profile.favouriteCategories ?? []} onChange={(values)=>setProfile((p:any)=>({...p,favouriteCategories:values}))}/>
                <MultiSelectField label="Role focus" options={ROLE_FOCUS_OPTIONS[role ?? 'listener']} values={profile.roleFocus ?? []} onChange={(values)=>setProfile((p:any)=>({...p,roleFocus:values}))}/>
                <label className="profile-toggle"><input type="checkbox" checked={profile.publicProfile !== false} onChange={(e)=>setProfile((p:any)=>({...p,publicProfile:e.target.checked}))}/> Public profile</label>
                <button className="primary-button" disabled={profileLoading} onClick={()=>void saveProfile()}>{profileLoading ? 'Saving…' : 'Save my profile'} <Check size={15}/></button>
              </article>
            </div>
            <div className="profile-public-preview panel">{profile.avatarUrl && <span className="profile-preview-avatar"><img className="avatar-approved-image" src={profile.avatarUrl} alt="" /></span>}<div><span className="mini-label">PUBLIC PROFILE</span><h3>{profile.displayName || 'Your chosen name'} <span>{profile.handle ? '@'+profile.handle.replace(/^@/,'') : '@yourhandle'}</span></h3><p>{profile.headline || 'Your Nightjar headline appears here.'}</p>{profile.welcomeMessage && <p className="profile-welcome-preview">{profile.welcomeMessage}</p>}<div className="profile-preview-chips">{[...(profile.favouriteTags??[]),...(profile.favouriteTropes??[])].slice(0,6).map((item:string)=><span key={item}>{item}</span>)}</div></div><em>{profile.publicProfile === false ? 'Private' : 'Visible to your Nightjar community'}</em></div>
            <article className="panel taste-panel"><div><span className="mini-label">TASTE ENGINE</span><h2>What Nightjar is learning</h2><p>Declared taste is kept separate from identity. Listening signals can refine recommendations without trying to infer who you are.</p></div><div className="taste-vector">{tasteVector.length===0 ? <span className="taste-empty">Your taste graph will grow as you save, finish, replay and explore.</span> : tasteVector.slice(0,10).map((item:any)=><div className="taste-chip" key={item.label}><strong>{item.label}</strong><span>{item.weight}</span></div>)}</div></article>
            <NotificationPreferences notify={notify} />
          </section>
        )}

        {view === 'protection' && (
          <section className="page-wrap protection-page">
            <div className="page-heading">
              <div><p className="eyebrow"><ShieldAlert size={14} /> PROTECTION CENTRE</p><h1>Your account. Your work. Your safety.</h1><p>You are not expected to deal with harassment, abuse, fraud, theft, threats or other wrongdoing alone. Nightjar gives you a direct reporting path and keeps a supporting record of relevant platform events.</p></div>
            </div>
            <div className="protection-banner"><ShieldCheck size={20} /><div><strong>PROTECTED BY DESIGN</strong><span>Security signals are supporting evidence, not an automatic finding of wrongdoing or intent. Nightjar does not capture clipboard contents.</span></div></div>
            <div className="admin-grid">
              <div className="admin-panel"><span className="admin-icon"><ShieldAlert size={19} /></span><span className="mini-label">REPORT SOMETHING</span><h2>Tell Nightjar what happened</h2><select value={reportCategory} onChange={(event) => setReportCategory(event.target.value)}><option>Harassment or abuse</option><option>Fraud or scam</option><option>Impersonation</option><option>Copyright / script theft</option><option>Unauthorised sharing</option><option>Threats or coercion</option><option>Suspected illegal activity</option><option>Account security</option><option>Technical issue</option><option>Feedback / feature request</option><option>Something else</option></select><textarea value={reportSummary} onChange={(event) => setReportSummary(event.target.value)} placeholder="Describe what happened. Include dates, account names, content references or other useful detail." /><button className="primary-button" onClick={() => void submitProtectionReport()}>Submit protected report <ArrowRight size={15} /></button></div>
              <div className="admin-panel"><span className="admin-icon"><ClipboardX size={19} /></span><span className="mini-label">EVIDENCE LOG</span><h2>Quiet security record</h2><p>Blocked copy, cut, print, selection and other protected interactions can be recorded against your account. This helps establish a timeline if a concern is later reported.</p><strong>{protectionEvidence.length} recorded signal{protectionEvidence.length === 1 ? '' : 's'}</strong><button className="secondary-button" onClick={() => void loadProtection()}>Refresh evidence</button></div>
              <div className="admin-panel"><span className="admin-icon"><FileText size={19} /></span><span className="mini-label">MY CASES</span><h2>Reports and support</h2><p>{protectionReports.length ? `${protectionReports.length} case${protectionReports.length === 1 ? '' : 's'} recorded on this account.` : 'No protection reports have been submitted from this account yet.'}</p><div className="evidence-list">{protectionReports.slice(0, 6).map((report) => <div key={report.caseId}><strong>{report.caseId}</strong><span>{report.category} · {report.status}</span></div>)}</div></div>
              <div className="admin-panel"><span className="admin-icon"><Ban size={19} /></span><span className="mini-label">ACCOUNT CONTROL</span><h2>Block and disengage</h2><p>If a user is causing a problem, blocking is available from supported account surfaces. For serious incidents, block and report rather than relying on either action alone.</p><button className="secondary-button" onClick={() => notify('Open the relevant user profile to block that account.')}>How blocking works</button></div>
            </div>
            <div className="protection-footnote"><strong>Immediate danger?</strong><span>Nightjar is not emergency services. In the UK, call 999 for immediate danger. For platform incidents, use this report path so relevant Nightjar records can be reviewed.</span></div>
          </section>
        )}

        {view === 'writer' && effectiveRole === 'writer' && (
          <section className="page-wrap role-studio-page">
            <div className="page-heading"><div><p className="eyebrow"><FileText size={14}/> WRITER STUDIO</p><h1>Write it. Protect it.</h1><p>Live manuscripts, version history and editorial handoff.</p></div></div>
            <div className="writer-create-card"><div><span className="mini-label">NEW SCRIPT</span><h2>Start a manuscript</h2><p>Every new script begins private.</p></div><div className="writer-create-form"><input value={writerDraftTitle} onChange={(event)=>setWriterDraftTitle(event.target.value)} placeholder="Working title"/><button className="primary-button" onClick={()=>void createWriterDraft()}>Create draft <FileText size={15}/></button></div></div>
            <div className="writer-layout"><aside className="writer-library">{writerScripts.map((script:any)=><button key={script.id} className={writerSelected?.id===script.id?'library-item active':'library-item'} onClick={()=>{setWriterSelected(script); void loadWriterPermissions(script.id);}}><span>{script.status}</span><strong>{script.title}</strong><em>v{script.version}</em></button>)}{!writerScripts.length&&<div className="people-empty"><FileText size={18}/><strong>No manuscripts yet.</strong><span>Create a script to begin.</span></div>}</aside>{writerSelected?<article className="writer-editor-card"><div className="editor-toolbar"><div><span className="mini-label">MANUSCRIPT</span><input value={writerSelected.title??''} onChange={e=>setWriterSelected({...writerSelected,title:e.target.value})}/></div><span className="status-pill">{writerSelected.status} · v{writerSelected.version}</span></div><textarea className="script-editor" value={writerSelected.content??''} onChange={e=>setWriterSelected({...writerSelected,content:e.target.value})} placeholder="Begin writing…"/><div className="editor-actions"><button className="secondary-button" onClick={()=>void saveWriterScript()}>Save</button><button className="secondary-button" onClick={()=>void createWriterVersion()}>Record version</button><button className="secondary-button" onClick={()=>void shareWriterScript()}><Users size={14}/> Share full script</button><button className="primary-button" onClick={()=>void submitWriterScript()}>Submit to editorial</button><button className="ghost-button" onClick={()=>void openProtectedReader(writerSelected.id)}><LockKeyhole size={14}/> Protected reader</button>{['Draft','Rejected'].includes(String(writerSelected.status??'Draft'))&&<button className="ghost-button" onClick={()=>void deleteWriterScript()}>Delete manuscript</button>}</div><div className="script-permission-panel"><div><span className="mini-label">FULL-SCRIPT ACCESS</span><strong>{writerPermissionsLoading?'Loading…':writerPermissions.filter((item:any)=>!item.revokedAt).length+' active grant'+(writerPermissions.filter((item:any)=>!item.revokedAt).length===1?'':'s')}</strong></div>{writerPermissions.length===0?<p>No full-script access grants yet.</p>:writerPermissions.map((permission:any)=><div className="script-permission-row" key={permission.recipientUserId}><div><strong>{permission.recipientUserId}</strong><span>Copy {permission.allowCopy?'on':'off'} · Export {permission.allowExport?'on':'off'}{permission.expiresAt?' · expires '+new Date(permission.expiresAt).toLocaleString('en-GB'):''}</span></div>{permission.revokedAt?<em>Revoked</em>:<button className="ghost-button" onClick={()=>void revokeWriterPermission(permission)}>Revoke access</button>}</div>)}</div></article>:<div className="writer-editor-card"><div className="people-empty"><FileText size={18}/><strong>Select a manuscript.</strong><span>Choose a live script from your library.</span></div></div>}</div>
            {writerSelected && <WriterRightsPanel script={writerSelected} onUpdated={(next)=>{setWriterSelected(next); setWriterScripts((items:any[])=>items.map((item:any)=>item.id===next.id?next:item));}} notify={notify} />}
            <CollaborationHub role="writer" notify={notify} />
          </section>
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
                  <button className="secondary-button" onClick={() => void reviewEditorScript('Under review')}>Mark under review</button>
                  <button className="secondary-button" onClick={() => void reviewEditorScript('Revision requested')}>Request revision</button>
                  <button className="primary-button" onClick={() => void reviewEditorScript('Approved')}>Approve</button>
                  <button className="ghost-button" onClick={() => void reviewEditorScript('Rejected')}>Reject</button>
                </div>
              </article>
            )}
            <CollaborationHub role="editor" notify={notify} />
            <div className="protection-banner"><FileCheck2 size={19} /><div><strong>EDITOR BOUNDARY</strong><span>Editorial decisions are recorded against the assigned manuscript. Administrator authority remains separate.</span></div></div>
          </section>
        )}

        {view === 'admin' && effectiveRole === 'admin' && (
          <section className="page-wrap admin-page">
            <div className="page-heading"><div><p className="eyebrow"><Settings2 size={14} /> ADMINISTRATION</p><h1>Nightjar, from the inside.</h1><p>Administrator accounts are isolated from listener, creator and controlled production roles.</p></div></div>
            <div className="admin-preview-control"><div><span className="mini-label">SAFE ROLE PREVIEW</span><strong>Inspect every product surface without changing your account.</strong><p>Preview state is local UI only. Your authenticated role remains Administrator and backend admin permissions are unchanged.</p></div><div className="admin-preview-buttons"><button onClick={() => selectPreviewRole('listener')}>Listener</button><button onClick={() => selectPreviewRole('creator')}>Creator</button><button onClick={() => selectPreviewRole('writer')}>Writer</button><button onClick={() => selectPreviewRole('editor')}>Audio Editor</button><button onClick={clearAdminPreview}>Return to Admin</button></div></div>
            <div className="admin-grid">
              <button className="admin-panel admin-tile" onClick={() => openAdminPeople('listener')}><span className="admin-icon"><Headphones size={19} /></span><span className="mini-label">PEOPLE · LISTENERS</span><h2>{adminOverviewLoading ? '…' : adminOverview?.people?.counts?.listener ?? 0}</h2><p>Listener accounts with access to the catalogue and listening surfaces.</p><strong>Open listener profiles <ArrowRight size={13} /></strong></button>
              <button className="admin-panel admin-tile" onClick={() => openAdminPeople('creator')}><span className="admin-icon"><Mic2 size={19} /></span><span className="mini-label">PEOPLE · CREATORS</span><h2>{adminOverviewLoading ? '…' : adminOverview?.people?.counts?.creator ?? 0}</h2><p>Creator accounts and their current onboarding status.</p><strong>Open creator profiles <ArrowRight size={13} /></strong></button>
              <button className="admin-panel admin-tile" onClick={() => openAdminPeople('admin')}><span className="admin-icon"><ShieldCheck size={19} /></span><span className="mini-label">PEOPLE · ADMINISTRATORS</span><h2>{adminOverviewLoading ? '…' : adminOverview?.people?.counts?.admin ?? 3}</h2><p>Owner accounts with administrator permissions enforced by the backend allowlist.</p><strong>Open administrator profiles <ArrowRight size={13} /></strong></button>
              <button className="admin-panel admin-tile" onClick={() => openAdminPeople('writer')}><span className="admin-icon"><FileText size={19} /></span><span className="mini-label">PEOPLE · WRITERS</span><h2>{adminOverviewLoading ? '…' : adminOverview?.people?.counts?.writer ?? 0}</h2><p>Writers with protected manuscript and script-marketplace access.</p><strong>Open writer profiles <ArrowRight size={13} /></strong></button>
              <button className="admin-panel admin-tile" onClick={() => openAdminPeople('editor')}><span className="admin-icon"><FileCheck2 size={19} /></span><span className="mini-label">PEOPLE · AUDIO EDITORS</span><h2>{adminOverviewLoading ? '…' : adminOverview?.people?.counts?.editor ?? 0}</h2><p>Audio Editors assigned to controlled production and editorial workflows.</p><strong>Open Audio Editor profiles <ArrowRight size={13} /></strong></button>
              <button className="admin-panel admin-tile" onClick={() => openAdminPanel('approvals')}><span className="admin-icon"><Sparkles size={19} /></span><span className="mini-label">CREATOR APPROVALS</span><h2>{adminApplications.filter((application) => application.status === 'pending' || application.status === 'submitted').length || 'Review'}</h2><p>Open the live creator application queue and make an explicit approve, waitlist or reject decision.</p><strong>Open approval workflow <ArrowRight size={13} /></strong></button>
              <button className="admin-panel admin-tile" onClick={() => setModerationOpen(true)}><span className="admin-icon"><Headphones size={19} /></span><span className="mini-label">CONTENT MODERATION</span><h2>Review</h2><p>Preview submitted release audio and metadata before anything enters the public adult catalogue.</p><strong>Open release moderation <ArrowRight size={13} /></strong></button>
              <button className="admin-panel admin-tile" onClick={() => openAdminPanel('images')}><span className="admin-icon"><ImagePlus size={19} /></span><span className="mini-label">IMAGE MODERATION</span><h2>{imageModeration.length || 'Review'}</h2><p>Approve every user-uploaded profile image, logo and release artwork before it can render publicly.</p><strong>Open image queue <ArrowRight size={13} /></strong></button>

              <button className="admin-panel admin-tile" onClick={() => openAdminPanel('revenue')}><span className="admin-icon"><BarChart3 size={19} /></span><span className="mini-label">REVENUE</span><h2>Commercial controls</h2><p>Open confirmed subscription revenue, capped creator-rate bands and payout readiness.</p><strong>Open commercial controls <ArrowRight size={13} /></strong></button>
              <button className="admin-panel admin-tile" onClick={() => openAdminPanel('editorial')}><span className="admin-icon"><FileCheck2 size={19} /></span><span className="mini-label">EDITORIAL</span><h2>{adminScripts.length}</h2><p>Assign live manuscripts to controlled editors and review production workflow.</p><strong>Open editorial controls <ArrowRight size={13} /></strong></button>
              <button className="admin-panel admin-tile" onClick={() => openAdminPanel('reports')}><span className="admin-icon"><ShieldAlert size={19} /></span><span className="mini-label">REPORTS & FEEDBACK</span><h2>{adminReports.length || 'Review'}</h2><p>User-submitted safety reports, technical issues and product feedback, identified by profile name rather than opaque account IDs.</p><strong>Open reports inbox <ArrowRight size={13} /></strong></button>
              <button className="admin-panel admin-tile" onClick={() => navigate('protection')}><span className="admin-icon"><ShieldCheck size={19} /></span><span className="mini-label">SAFETY</span><h2>Access & moderation</h2><p>Review protection signals and age-assurance boundaries.</p><strong>Open Protection Centre <ArrowRight size={13} /></strong></button>
              <button className="admin-panel admin-tile subscription-tile" onClick={() => openAdminPanel('subscriptions')}><span className="admin-icon"><WalletCards size={19} /></span><span className="mini-label">SUBSCRIPTIONS</span><h2>{adminOverviewLoading ? '…' : commercialOverview?.subscriptions.active ?? adminOverview?.subscriptions?.active ?? 0}</h2><p>Active paid subscriptions tracked by the confirmed Nightjar billing ledger.</p><strong>{commercialOverview?.subscriptions.trialing ?? adminOverview?.subscriptions?.trialing ?? 0} trial · {commercialOverview?.subscriptions.pastDue ?? adminOverview?.subscriptions?.pastDue ?? 0} past due <ArrowRight size={13} /></strong></button>
              <button className="admin-panel admin-tile admin-economics" onClick={() => openAdminPanel('economics')}><span className="admin-icon"><Coins size={19} /></span><span className="mini-label">CREATOR ECONOMICS</span><h2>{formatMoneyPence(commercialSettings.planningMonthlyPricePence)} / month</h2><p>Configure the capped equal creator rate without tying standard pay to popularity.</p><strong>Open creator economics <ArrowRight size={13} /></strong></button>
              <div className="admin-panel branding-admin-panel"><span className="admin-icon"><Upload size={19} /></span><span className="mini-label">BRANDING</span><h2>Nightjar logo</h2><p>Upload or replace the logo used across Nightjar. New images enter the same administrator moderation queue and never become public automatically.</p><div className="logo-editor"><div className="logo-preview-box">{logoUrl ? <img src={logoUrl} alt="Current approved Nightjar logo" /> : <img src="/favicon.svg" alt="Default Nightjar logo" />}</div><div className="admin-data-actions"><label className="secondary-button upload-label"><Upload size={15} /> {logoUploading ? 'Uploading…' : 'Submit logo'}<input type="file" accept="image/png,image/jpeg,image/webp" hidden disabled={logoUploading} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadLogo(file); event.currentTarget.value = ''; }} /></label>{logoUrl && <button className="ghost-button" onClick={()=>void removeLogo()}>Remove logo</button>}</div></div><strong>PNG / JPG / WebP · max 5 MB · admin approval required</strong></div>
            </div>
            <div className="demo-warning admin-note"><ShieldCheck size={17} /><div><strong>ADMIN ACCESS MODEL</strong><span>Only the three approved Nightjar owner emails receive this role. Administrator access is enforced by the backend allowlist.</span></div></div>
            {canAdmin && <section className="security-alert-panel"><div><span className="mini-label">SECURITY / OWNER ALERTS</span><h2>Suspicious activity</h2><p>Every qualifying alert is addressed to all three Nightjar owners and retained in the audit trail.</p></div><button className="secondary-button" onClick={() => void loadSecurityAlerts()}>{securityAlertsLoading ? 'Refreshing…' : 'Refresh alerts'}</button><div className="security-alert-list">{securityAlerts.length === 0 ? <div className="people-empty"><ShieldCheck size={18}/><strong>No open security alerts</strong><span>Signals remain evidence, not accusations. Alerts are retained for review.</span></div> : securityAlerts.map((alert:any) => <article className="security-alert-row" key={alert.id}><div><strong>{alert.severity?.toUpperCase() ?? 'MEDIUM'} · Risk {alert.riskScore ?? '—'} · {alert.reason ?? 'Suspicious protected-content activity'}</strong><span>User: {alert.userName ?? 'Nightjar account'}{alert.userHandle ? ' · @' + String(alert.userHandle).replace(/^@/, '') : ''} · Script: {alert.relatedId ?? '—'} · {new Date(alert.createdAt).toLocaleString('en-GB')}</span><em>Delivered to all three owners · no automatic freeze</em></div><div className="security-alert-actions"><button className="ghost-button" disabled={alert.status !== 'open'} onClick={() => void closeSecurityAlertBenign(alert)}>Benign</button><button className="secondary-button" disabled={alert.status !== 'open'} onClick={() => void revokeSessionsFromSecurityAlert(alert)}>Revoke reader sessions</button><button className="secondary-button" disabled={alert.status === 'actioned'} onClick={() => void suspendFromSecurityAlert(alert)}>{alert.status === 'actioned' ? 'Account suspended' : 'Suspend account'}</button></div></article>)}</div></section>}
            {adminPeopleRole && <div className="people-drawer" role="dialog" aria-modal="true" aria-label={`${roleMeta[adminPeopleRole].label} accounts`}><div className="people-drawer-head"><div><span className="mini-label">PEOPLE / ACCOUNT DIRECTORY</span><h2>{roleMeta[adminPeopleRole].label}s</h2><p>{adminPeopleRole === 'admin' ? 'Administrator access is limited to the owner allowlist.' : `Current ${roleMeta[adminPeopleRole].label.toLowerCase()} accounts recorded by Nightjar.`}</p></div><button className="icon-button" onClick={() => setAdminPeopleRole(null)} aria-label="Close account directory"><X size={18} /></button></div><div className="people-drawer-summary"><strong>{adminOverview?.people?.counts?.[adminPeopleRole] ?? 0}</strong><span>accounts in this role</span></div><div className="people-list">{(adminPeopleRole === 'admin' ? (adminOverview?.people?.administrators ?? []) : (adminOverview?.people?.accounts ?? []).filter((account: any) => account.role === adminPeopleRole)).map((account: any) => <article className="people-row people-row-managed" key={account.userId ?? account.email}><span className="account-chip-avatar">{account.avatarUrl ? <img className="avatar-approved-image" src={account.avatarUrl} alt="" /> : (account.name ?? account.email ?? 'N').slice(0, 1).toUpperCase()}</span><div><strong>{account.name ?? 'Nightjar account'}</strong><span>{account.email ?? 'Owner allowlist account'}{account.handle ? ' · @'+account.handle : ''}</span></div><em>{account.testAccess ? 'Tester access · ' : ''}{account.status === 'pending_review' ? 'Pending review' : account.status === 'suspended' ? 'Suspended' : 'Active'}</em>{adminPeopleRole !== 'admin' && <div className="people-row-controls"><select value={account.role} onChange={(e)=>void changeAccountRole(account,e.target.value as 'listener'|'creator'|'writer'|'editor')}><option value="listener">Listener</option><option value="creator">Creator</option><option value="writer">Writer</option><option value="editor">Audio Editor</option></select><select value={account.status ?? 'active'} onChange={(e)=>void changeAccountStatus(account,e.target.value as 'active'|'pending_review'|'suspended')}><option value="active">Active</option><option value="pending_review">Pending review</option><option value="suspended">Suspended</option></select><button className={account.testAccess ? 'secondary-button' : 'ghost-button'} onClick={()=>void changeTestAccess(account, !account.testAccess)}>{account.testAccess ? 'Remove tester access' : 'Enable tester access'}</button></div>}</article>)}{(adminPeopleRole === 'admin' ? (adminOverview?.people?.administrators ?? []) : (adminOverview?.people?.accounts ?? []).filter((account: any) => account.role === adminPeopleRole)).length === 0 && <div className="people-empty"><Users size={18} /><strong>No accounts in this role yet</strong><span>The live directory will populate as accounts are created or approved.</span></div>}</div></div>}
            {adminPanel && <div className="admin-panel-modal" role="dialog" aria-modal="true"><section><div className="admin-modal-head"><div><span className="mini-label">ADMINISTRATION / {adminPanel.toUpperCase()}</span><h2>{adminPanel === 'approvals' ? 'Creator approval queue' : adminPanel === 'reports' ? 'Reports & feedback' : adminPanel === 'subscriptions' ? 'Subscription ledger' : adminPanel === 'revenue' ? 'Commercial controls' : adminPanel === 'editorial' ? 'Editorial assignments' : adminPanel === 'images' ? 'Image moderation' : 'Creator economics'}</h2><p>{adminPanel === 'approvals' ? 'Review creator applications and record an explicit decision.' : adminPanel === 'reports' ? 'Review user-submitted safety reports, technical issues and feedback. Reporter identity is shown by profile name and handle.' : adminPanel === 'subscriptions' ? 'Live subscription records only. Empty means billing data is not connected yet.' : adminPanel === 'revenue' ? 'Operational assumptions are separated from confirmed billing data.' : adminPanel === 'editorial' ? 'Assign live manuscripts to active Audio Editor accounts.' : adminPanel === 'images' ? 'Every uploaded image stays private until an administrator explicitly approves it.' : 'Planning assumptions for Nightjar’s capped equal creator-rate model. Listening remains analytics, not the standard pay formula.'}</p></div><button className="icon-button" onClick={() => setAdminPanel(null)} aria-label="Close administrator panel"><X size={18} /></button></div>{adminPanel === 'reports' && <div className="admin-data-list">{adminPanelLoading ? <div className="people-empty">Loading reports & feedback…</div> : adminReports.length === 0 ? <div className="people-empty"><ShieldCheck size={18}/><strong>No reports or feedback yet</strong><span>User submissions will appear here with their Nightjar profile identity.</span></div> : adminReports.map((report:any) => <article className="admin-data-row" key={report.id}><div><strong>{report.reporterName ?? 'Nightjar account'}{report.reporterHandle ? ' · @' + String(report.reporterHandle).replace(/^@/, '') : ''}</strong><span>{report.caseId ?? 'Nightjar report'} · {report.category ?? 'Something else'} · {report.status ?? 'New'}</span><small>{report.reporterEmail ?? 'Account email unavailable'} · {report.createdAt ? new Date(report.createdAt).toLocaleString('en-GB') : 'Date unavailable'}</small><p>{report.summary ?? 'No report detail supplied.'}</p></div></article>)}</div>}{adminPanel === 'approvals' && <div className="admin-data-list">{adminPanelLoading ? <div className="people-empty">Loading approval queue…</div> : adminApplications.length === 0 ? <div className="people-empty"><Sparkles size={18} /><strong>No creator applications</strong><span>The queue is empty. New creator applications will appear here.</span></div> : adminApplications.map((application) => <article className="admin-data-row" key={application.id}><div><strong>{application.creatorName ?? application.displayName ?? application.email ?? 'Creator applicant'}</strong><span>{application.email ?? 'No email supplied'} · {application.status ?? 'pending'}</span></div><div className="admin-data-actions"><button className="secondary-button" onClick={() => void decideCreatorApplication(application, 'waitlist')}>Waitlist</button><button className="secondary-button" onClick={() => void decideCreatorApplication(application, 'rejected')}>Reject</button><button className="primary-button" onClick={() => void decideCreatorApplication(application, 'approved')}>Approve</button></div></article>)}</div>}{adminPanel === 'editorial' && <div>{adminPanelLoading ? <div className="people-empty">Loading editorial controls…</div> : <div className="admin-data-list">{adminScripts.map((script) => <article className="admin-data-row" key={script.id}><div><strong>{script.title}</strong><span>{script.status ?? 'Draft'} · v{script.version ?? 1}</span></div><select className="admin-select" defaultValue={script.editorUserId ?? ''} onChange={(event) => { if (event.target.value) void assignEditor(script.id, event.target.value); }}><option value="" disabled>{script.editorUserId ? 'Reassign editor' : 'Assign editor'}</option>{adminEditors.map((editor) => <option key={editor.userId} value={editor.userId}>{editor.name ?? editor.email ?? editor.userId}</option>)}</select></article>)}{!adminScripts.length && <div className="people-empty"><FileText size={18} /><strong>No manuscripts available.</strong><span>Submitted live scripts will appear here for assignment.</span></div>}</div>}</div>}{adminPanel === 'images' && <div className="admin-data-list">{adminPanelLoading ? <div className="people-empty">Loading image moderation queue…</div> : imageModeration.length === 0 ? <div className="people-empty"><ImagePlus size={18}/><strong>No images awaiting review</strong><span>Profile pictures, branding and release artwork will appear here before they can become public.</span></div> : imageModeration.map((asset:any)=><article className="image-moderation-row" key={asset.id}><div className="image-moderation-preview">{asset.previewUrl ? <img src={asset.previewUrl} alt="Pending moderation" /> : <ImagePlus size={24}/>}</div><div><strong>{asset.kind === 'profile_avatar' ? 'Profile picture' : asset.kind === 'brand_logo' ? 'Nightjar logo' : 'Release artwork'}</strong><span>{asset.ownerEmail ?? asset.ownerUserId ?? 'Unknown uploader'} · {asset.fileName ?? asset.contentType ?? 'image'}</span><small>This image is private while pending. Approve only after checking there is no nudity, explicit sexual imagery or other unsuitable imagery.</small></div><div className="admin-data-actions"><button className="ghost-button" onClick={()=>void moderateImage(asset,'rejected')}>Reject</button><button className="primary-button" onClick={()=>void moderateImage(asset,'approved')}>Approve image</button></div></article>)}</div>}{adminPanel === 'subscriptions' && <div>{adminPanelLoading ? <div className="people-empty">Loading subscription ledger…</div> : <><div className="admin-modal-grid"><div className="admin-modal-stat"><span>Active</span><strong>{commercialOverview?.subscriptions.active ?? 0}</strong></div><div className="admin-modal-stat"><span>Trial</span><strong>{commercialOverview?.subscriptions.trialing ?? 0}</strong></div><div className="admin-modal-stat"><span>Past due</span><strong>{commercialOverview?.subscriptions.pastDue ?? 0}</strong></div></div><div className="admin-data-list">{adminSubscriptions.length === 0 ? <div className="people-empty"><WalletCards size={18} /><strong>No live subscription records</strong><span>Billing is not connected yet; no subscription data is being fabricated.</span></div> : adminSubscriptions.map((subscription) => <article className="admin-data-row" key={subscription.id}><div><strong>{subscription.email ?? subscription.userId ?? 'Subscriber'}</strong><span>{subscription.plan ?? ('Nightjar · ' + formatMoneyPence(commercialSettings.planningMonthlyPricePence) + ' monthly')} · {subscription.status ?? 'unknown'}</span></div><span>{subscription.currentPeriodEnd ?? '—'}</span></article>)}</div></>}</div>}{adminPanel === 'revenue' && <div>
  <div className="admin-modal-grid">
    <div className="admin-modal-stat"><span>Planning price</span><strong>{formatMoneyPence(commercialSettings.planningMonthlyPricePence)}</strong></div>
    <div className="admin-modal-stat"><span>Live subscriptions</span><strong>{commercialOverview?.subscriptions.active ?? 0}</strong></div>
    <div className="admin-modal-stat"><span>Confirmed gross MRR</span><strong>{formatMoneyPence(commercialOverview?.confirmedGrossMrrPence ?? 0)}</strong></div>
  </div>
  <div className="commercial-edit-grid">
    <label>Planning monthly price (£)<input type="number" min="0" step="0.01" value={commercialSettings.planningMonthlyPricePence == null ? '' : commercialSettings.planningMonthlyPricePence / 100} onChange={(e)=>setCommercialSettings((s)=>({...s,planningMonthlyPricePence:e.target.value===''?null:Math.round(Number(e.target.value)*100)}))}/></label>
    <label>Standard creator monthly cap (£)<input type="number" min="0" step="1" value={commercialSettings.creatorMonthlyCapPence == null ? '' : commercialSettings.creatorMonthlyCapPence / 100} onChange={(e)=>setCommercialSettings((s)=>({...s,creatorMonthlyCapPence:e.target.value===''?null:Math.round(Number(e.target.value)*100)}))} placeholder="Leave unset until research is complete"/></label>
    <label>Operating reserve (%)<input type="number" min="0" max="100" step="0.01" value={commercialSettings.reservePercent ?? ''} onChange={(e)=>setCommercialSettings((s)=>({...s,reservePercent:e.target.value===''?null:Number(e.target.value)}))}/></label>
    <label>Payout cadence<input value={commercialSettings.payoutCadence ?? ''} onChange={(e)=>setCommercialSettings((s)=>({...s,payoutCadence:e.target.value||null}))} placeholder="e.g. Monthly"/></label>
    <label className="commercial-span-two">Creator eligibility definition<textarea value={commercialSettings.creatorEligibilityDefinition ?? ''} onChange={(e)=>setCommercialSettings((s)=>({...s,creatorEligibilityDefinition:e.target.value||null}))} placeholder="Define fulfilled contracted work and eligibility without using popularity."/></label>
    <label className="commercial-span-two">Verified-listening analytics definition<textarea value={commercialSettings.eligibleListeningDefinition ?? ''} onChange={(e)=>setCommercialSettings((s)=>({...s,eligibleListeningDefinition:e.target.value||null}))} placeholder="Define verified listening for analytics/discovery only. It does not determine the standard creator rate."/></label>
    <div className="rate-band-editor">
      <div className="panel-title"><div><span className="mini-label">SUBSCRIBER RATE BANDS</span><h3>Scale fairly, then stop at the cap.</h3></div><button className="secondary-button" type="button" onClick={()=>setCommercialSettings((s)=>({...s,creatorRateBands:[...(s.creatorRateBands??[]),{minPaidSubscribers:0,monthlyRatePence:0}]}))}>Add band</button></div>
      {(commercialSettings.creatorRateBands??[]).map((band,index)=><div className="rate-band-row" key={index}>
        <label>Minimum paid subscribers<input type="number" min="0" step="1" value={band.minPaidSubscribers} onChange={(e)=>setCommercialSettings((s)=>({...s,creatorRateBands:s.creatorRateBands.map((item,i)=>i===index?{...item,minPaidSubscribers:Math.max(0,Math.round(Number(e.target.value)||0))}:item)}))}/></label>
        <label>Monthly creator rate (£)<input type="number" min="0" step="1" value={band.monthlyRatePence/100} onChange={(e)=>setCommercialSettings((s)=>({...s,creatorRateBands:s.creatorRateBands.map((item,i)=>i===index?{...item,monthlyRatePence:Math.max(0,Math.round((Number(e.target.value)||0)*100))}:item)}))}/></label>
        <button className="ghost-button" type="button" onClick={()=>setCommercialSettings((s)=>({...s,creatorRateBands:s.creatorRateBands.filter((_,i)=>i!==index)}))}>Remove</button>
      </div>)}
      {!(commercialSettings.creatorRateBands??[]).length && <p className="panel-note">No rates are locked yet. Add bands after the next creator-research review.</p>}
    </div>
    <label className="rights-check"><input type="checkbox" checked={commercialSettings.tipsEnabled} onChange={(e)=>setCommercialSettings((s)=>({...s,tipsEnabled:e.target.checked}))}/> Enable creator tips when payment processing is ready</label>
    <label className="rights-check"><input type="checkbox" checked={commercialSettings.individualPurchasesEnabled} onChange={(e)=>setCommercialSettings((s)=>({...s,individualPurchasesEnabled:e.target.checked}))}/> Enable individual audio purchases when commerce is ready</label>
  </div>
  <button className="primary-button" disabled={commercialSaving} onClick={()=>void saveCommercialControls()}>{commercialSaving?'Saving…':'Save commercial controls'}</button>
  <div className="admin-formula">
    <div><b>01</b><strong>Count confirmed paying subscriptions, not free/trial accounts.</strong></div>
    <div><b>02</b><strong>Apply the published subscriber band to every eligible contracted Creator.</strong></div>
    <div><b>03</b><strong>Limit the standard rate at the configured monthly cap.</strong></div>
    <div><b>04</b><strong>Listening performance stays analytics/discovery data and never increases or decreases the standard base rate.</strong></div>
  </div>
  <div className="demo-warning admin-note"><ShieldCheck size={17}/><div><strong>CONFIRMED VS PLANNING</strong><span>Subscriber bands and the cap remain editable until research is complete. Confirmed MRR only uses real billing records; Nightjar does not invent revenue or payouts.</span></div></div>
</div>}
{adminPanel === 'economics' && <div>
  <div className="admin-modal-grid">
    <div className="admin-modal-stat"><span>Launch reference</span><strong>{formatMoneyPence(commercialSettings.planningMonthlyPricePence)}</strong></div>
    <div className="admin-modal-stat"><span>Standard-rate cap</span><strong>{formatMoneyPence(commercialSettings.creatorMonthlyCapPence)}</strong></div>
    <div className="admin-modal-stat"><span>Reserve</span><strong>{commercialSettings.reservePercent == null ? 'Not set' : commercialSettings.reservePercent + '%'}</strong></div>
  </div>
  <div className="admin-formula">
    <div><b>01</b><strong>Confirmed paid subscriptions</strong></div>
    <div><b>02</b><strong>Configured subscriber rate band</strong></div>
    <div><b>03</b><strong>Equal standard Creator rate</strong></div>
    <div><b>04</b><strong>Hard monthly cap</strong></div>
  </div>
  <div className="rights-ai-lock"><ShieldCheck size={16}/><div><strong>Popularity affects standard pay: NO</strong><span>Verified listening remains valuable for analytics, recommendations and discovery without determining a Creator’s standard monthly rate.</span></div></div>
  <p className="panel-note">Use Commercial controls to edit the planning price, rate bands, eligibility definition, reserve and final cap. The figures can remain unset while further creator research is collected.</p>
</div>}</section></div>}
          </section>
        )}
      </main>

      <footer className="site-footer"><div className="footer-brand">{logoUrl ? <img className="brand-logo footer-logo" src={logoUrl} alt="Nightjar" /> : <img className="brand-logo footer-logo" src="/favicon.svg" alt="Nightjar" />}<strong>NIGHTJAR</strong></div><span>Premium immersive audio for adults.</span><span>{user ? accountLabel + ' account' : 'Adult access required'}</span></footer>

      {protectedReaderOpen && protectedReaderScript && <ProtectedReader data={protectedReaderScript} close={() => setProtectedReaderOpen(false)} record={(eventType) => void recordProtectionEvent(eventType, protectedReaderScript.script?.id)} notify={notify} />}
      {playing && <NightjarPlayer track={tracks.find((track) => track.id === playing) ?? null} queue={tracks} onSelectTrack={(next) => setPlaying(next.id)} intent={currentIntent} onClose={() => setPlaying(null)} notify={notify} />}
      {creatorProfileUserId && <CreatorProfile creatorUserId={creatorProfileUserId} followingIds={followingProfileIds} onToggleFollow={toggleProfileFollow} onPlayRelease={playReleaseFromCreatorProfile} onClose={() => setCreatorProfileUserId(null)} notify={notify} />}
      {publicProfileUserId && <PublicProfile userId={publicProfileUserId} followingIds={followingProfileIds} onToggleFollow={toggleProfileFollow} onClose={() => setPublicProfileUserId(null)} notify={notify} />}
      <ContentModeration open={moderationOpen} onClose={() => setModerationOpen(false)} notify={notify} />
      {showOnboarding && user && role !== 'admin' && <NightjarOnboarding initialProfile={profile} role={role} onComplete={(nextProfile) => { setProfile((current: any) => ({ ...current, ...nextProfile })); setShowOnboarding(false); }} onSkip={() => setShowOnboarding(false)} notify={notify} />}
      {toast && <div className="toast">{toast}</div>}

      {user && !rolePicker && (
        <button className="floating-account" onClick={() => setRolePicker(true)} aria-label="Open account information">
          <UserCircle2 size={16} /><span>{roleMeta[role ?? 'listener'].label}</span>
        </button>
      )}
    </div>
  );
}

function releaseToTrack(release: any): Track {
  return {
    id: String(release.id),
    title: String(release.title ?? 'Untitled release'),
    creator: String(release.creatorName ?? 'Nightjar creator'),
    duration: release.durationMinutes ? String(release.durationMinutes) + ' min' : '—',
    category: String(release.category ?? 'Audio'),
    descriptor: String(release.description ?? 'No description supplied.'),
    audioAvailable: release.audioAvailable === true,
    audioUrl: null,
    artworkUrl: release.artworkUrl ?? null,
    creatorUserId: release.creatorUserId,
    genre: release.genre ?? '',
    tags: release.tags ?? [],
    tropes: release.tropes ?? [],
    contributors: release.contributors ?? [],
    contentRating: release.contentRating ?? 'adult',
    seriesTitle: release.seriesTitle ?? null,
    episodeNumber: release.episodeNumber ?? null,
  };
}

function LiveTrackCard({ track, playing, favourite, onPlay, onFavourite, reason }: { track: Track; playing: boolean; favourite: boolean; onPlay: (track: Track) => void; onFavourite: () => void; reason?: string }) {
  return <article className="track-card">
    <div className="track-cover" style={track.artworkUrl ? { backgroundImage: 'url("' + track.artworkUrl + '")', backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}>
      <span className="track-index">{track.category}</span>
      {!track.artworkUrl && <div className="track-cover-mark"><Moon size={22} /></div>}
      <button className="cover-play" disabled={!track.audioAvailable && !track.audioUrl} onClick={() => onPlay(track)} aria-label={!track.audioAvailable && !track.audioUrl ? 'Audio not connected' : playing ? 'Pause ' + track.title : 'Play ' + track.title}>
        {playing ? <Pause size={18} /> : <Play size={18} fill="currentColor" />}
      </button>
    </div>
    <div className="track-body">
      <div className="track-type"><span>{track.creator}</span><span>{track.duration}</span></div>
      <h3>{track.title}</h3>
      {(track.seriesTitle || track.contentRating) && <div className="track-meta-line">{track.seriesTitle && <span>{track.seriesTitle}{track.episodeNumber != null ? ' · Episode ' + track.episodeNumber : ''}</span>}<span>{String(track.contentRating ?? 'adult').toUpperCase()}</span></div>}
      <p>{track.descriptor}</p>
      {!!track.contributors?.length && <div className="track-credit-line">{track.contributors.slice(0,4).map((credit)=><span key={credit.role + ':' + credit.name}>{credit.role}: {credit.name}</span>)}</div>}
      <div className="track-footer"><span className="creator-link">{track.audioAvailable || track.audioUrl ? 'Age-gated audio ready' : 'Audio not connected'}</span><button className="icon-button" onClick={onFavourite} aria-label={favourite ? 'Remove favourite' : 'Add favourite'}><Heart size={16} fill={favourite ? 'currentColor' : 'none'} /></button></div>
      {reason && <p className="recommendation-reason"><Sparkles size={12} />{reason}</p>}
    </div>
  </article>;
}

function ProtectedReader({ data, close, record, notify }: { data: any; close: () => void; record: (eventType: string) => void; notify: (message: string) => void }) {
  const script = data.script ?? {};
  const content = String(script.content ?? '');
  const sessionId = String(data.readerSession?.sessionId ?? 'authorised');
  const accountId = String(data.readerSession?.accountId ?? data.readerSession?.userId ?? '');
  const watermark = ['NIGHTJAR', sessionId, accountId ? 'ACCOUNT ' + accountId.slice(-10) : '', script.id ? 'SCRIPT ' + String(script.id).slice(-10) : ''].filter(Boolean).join(' · ');

  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const blockPrint = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'p') {
        event.preventDefault();
        record('print_blocked');
        notify('Printing is disabled inside the protected reader.');
      }
    };
    window.addEventListener('keydown', blockPrint);
    return () => { document.body.style.overflow = original; window.removeEventListener('keydown', blockPrint); };
  }, []);

  const exportScript = () => {
    if (!data.exportAllowed) {
      record('export_blocked');
      notify('Export is not permitted by this writer.');
      return;
    }
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = String(script.title ?? 'nightjar-script').replace(/[^a-z0-9-_]+/gi, '-').replace(/^-|-$/g, '') + '.txt';
    anchor.click();
    URL.revokeObjectURL(url);
    record('writer_authorised_export');
    notify('Writer-authorised script export created.');
  };

  return <div className="protected-reader-backdrop" role="dialog" aria-modal="true" aria-label="Protected manuscript reader">
    <section className="protected-reader"
      onCopy={(event) => { if (!data.copyAllowed) { event.preventDefault(); record('copy_blocked'); notify('Copy is disabled for this protected manuscript.'); } else record('writer_authorised_copy'); }}
      onCut={(event) => { if (!data.copyAllowed) { event.preventDefault(); record('cut_blocked'); } }}
      onPaste={(event) => { if (!data.copyAllowed) { event.preventDefault(); record('paste_blocked'); } }}
      onContextMenu={(event) => { if (!data.copyAllowed) { event.preventDefault(); record('contextmenu_blocked'); } }}
      onDragStart={(event) => { if (!data.copyAllowed) { event.preventDefault(); record('drag_blocked'); } }}>
      <header><div><span className="mini-label">NIGHTJAR / PROTECTED SCRIPT</span><h2>{script.title ?? 'Protected manuscript'}</h2><p>Reader session {sessionId} · expires {data.readerSession?.expiresAt ? new Date(data.readerSession.expiresAt).toLocaleTimeString('en-GB') : 'soon'}</p></div><button className="icon-button" onClick={close} aria-label="Close protected manuscript"><X size={18} /></button></header>
      <div className="reader-notice"><ShieldCheck size={15} /><span>This view is session-attributed. Screenshots cannot be reliably detected by a browser, so Nightjar uses visible session provenance and retained access evidence instead.</span></div>
      <article className="reader-body">
        <div className="reader-watermark-field" aria-hidden="true">{Array.from({length: 12}).map((_, index) => <span key={index}>{watermark}</span>)}</div>
        <p className="reader-watermark">{watermark}</p>
        {content ? content.split(/\n+/).filter(Boolean).map((paragraph: string, index: number) => <p key={index}>{paragraph}</p>) : <p>No manuscript content supplied.</p>}
      </article>
      <footer><span><LockKeyhole size={14} /> Copy {data.copyAllowed ? 'allowed by writer' : 'off'}</span><button className="reader-export-button" onClick={exportScript} disabled={!data.exportAllowed}><Download size={14} /> {data.exportAllowed ? 'Writer-authorised export' : 'Export off'}</button><span>Session attributed · access logged</span></footer>
    </section>
  </div>;
}


export default App;
