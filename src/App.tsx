import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { readDemo, writeDemo, resetDemo } from './demo/demoSession';
import { nightjarAuth } from './platform/firebase-auth';
import { nightjarAccount } from './platform/firebase-account';
import { nightjarCommunity } from './platform/firebase-community';
import { nightjarHandleError, normaliseNightjarHandle } from './platform/profile-handle';
import { nightjarMedia } from './platform/firebase-media';
import { optimiseProfileImage, formatProfileImageBytes } from './platform/profile-image-optimizer';
import { nightjarCommercial, type CommercialOverview, type CommercialSettings } from './platform/firebase-commercial';
import { nightjarAdministration } from './platform/firebase-administration';
import { classifyProfessionalApplications, filterProfessionalApplicationsByRole, pendingApplicationRoles, type ProfessionalApplicationBox } from './platform/professional-application-bank';
import { nightjarCatalogue } from './platform/firebase-catalogue';
import { nightjarListening } from './platform/firebase-listening';
import { nightjarExperience, type ListeningBoundaries } from './platform/firebase-experience';
import { DEFAULT_LISTENING_BOUNDARIES, hiddenByBoundaries, matchesListeningMood, type MoodFilter } from './platform/listening-discovery';
import ListeningDiscoveryControls from './components/ListeningDiscoveryControls';
import CreatorProductionTimeline from './components/CreatorProductionTimeline';
import { VoiceCallingCardStudio } from './components/VoiceCallingCard';
import { nightjarNotifications } from './platform/firebase-notifications';
import { nightjarPush } from './platform/firebase-push';
import AdminInstallBranding from './components/AdminInstallBranding';
import ProfessionalLibrary from './components/ProfessionalLibrary';
import SpotlightExperience from './components/SpotlightExperience';
import { scrollNightjarToTop } from './platform/scroll-navigation';
import { nightjarAge } from './platform/firebase-age';
import { nightjarScripts } from './platform/firebase-scripts';
import { nightjarProtection } from './platform/firebase-protection';
import { nightjarAuthSecurity, type AuthenticationSecurityEvent } from './platform/firebase-auth-security';
import { nightjarReviews } from './platform/firebase-reviews';
import { nightjarMessaging } from './platform/firebase-messaging';
import { nightjarEngagement, type ReleaseReaction } from './platform/firebase-engagement';
import { nightjarGifts, type AdminNightjarPayoutOverview } from './platform/firebase-nightjars';
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Check,
  ChevronRight,
  ChevronDown,
  Eye,
  Heart,
  Bookmark,
  ThumbsUp,
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
  Star,
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
  Coins,
  WalletCards,
  ImagePlus,
  RefreshCw,
  MessageCircle,
  CalendarDays,
  Share2,
} from 'lucide-react';
import './components/live-listens.css';
import './components/featured-release-carousel.css';
import './components/writer-script-artwork.css';
import NightjarPlayer from './components/NightjarPlayer';
import WriterDiscovery from './components/WriterDiscovery';
import NotificationPreferences from './components/NotificationPreferences';
import AppUpdateControl from './components/AppUpdateControl';
import CommunityUpdateReader from './components/CommunityUpdateReader';
import { checkNightjarUpdate, applyNightjarSafeUpdate, type NightjarUpdateStatus } from './platform/pwa';
import TransparencyPanel from './components/TransparencyPanel';
import { PROFILE_TAG_OPTIONS } from './data/nightjarTaxonomy';
import { installNativeProtectionBridge } from './platform/native-protection';
import { nightjarReferrals } from './platform/firebase-referrals';
import { publicProfileUrl, shareNightjarProfile, type ShareableProfileRole } from './platform/public-profile-share';
import GlobalCommandPalette, { type NightjarCommand } from './components/GlobalCommandPalette';
import MobileNavigation from './components/MobileNavigation';
import { PersonalisedHome, HomeSection, WorkspaceSection } from './components/NightjarHomeLayout';
import NightjarSettings from './components/NightjarSettings';
import AdminWorkspaceTabs, { type AdminWorkspace } from './components/AdminWorkspaceTabs';
import SecurityEvidenceReview, { type SecurityEvidenceReviewData } from './components/SecurityEvidenceReview';
import AdminSecurityAlerts from './components/AdminSecurityAlerts';
import AdminAuthenticationLog from './components/AdminAuthenticationLog';
import AdminAssistance from './components/AdminAssistance';
import ProductExperience from './components/ProductExperience';
import AdminMemberRoleEditor from './components/AdminMemberRoleEditor';
import RoleDashboard, { type RoleDashboardAction } from './components/RoleDashboard';
import WorkspaceSwitcher from './components/WorkspaceSwitcher';
import NightjarSkeleton from './components/NightjarSkeleton';
import type { ProfileDraftController } from './components/CloudProfileDraft';
import ProfileSectionBoundary from './components/ProfileSectionBoundary';
import { demoCreators, demoTracks, demoSpotlights, demoCreatorDashboard, demoWriterScripts, demoEditorQueue, demoNotifications, demoAdminData, demoLibrary } from './demo/nightjarDemo';

const AdminAudioUploadTest = lazy(() => import('./components/AdminAudioUploadTest'));
const CreatorAudioPipeline = lazy(() => import('./components/CreatorAudioPipeline'));
const CreatorListeningInsights = lazy(() => import('./components/CreatorListeningInsights'));
const CreatorLivePreviewOverview = lazy(() => import('./components/CreatorLivePreviewOverview'));
const CreatorProfile = lazy(() => import('./components/CreatorProfile'));
const ContentModeration = lazy(() => import('./components/ContentModeration'));
const PersonalCalendar = lazy(() => import('./components/PersonalCalendar'));
const NightjarOnboarding = lazy(() => import('./components/NightjarOnboarding'));
const CloudProfileDraft = lazy(() => import('./components/CloudProfileDraft'));
const PublicProfile = lazy(() => import('./components/PublicProfile'));
const CollaborationHub = lazy(() => import('./components/CollaborationHub'));
const WriterRightsPanel = lazy(() => import('./components/WriterRightsPanel'));
const WriterScriptArtwork = lazy(() => import('./components/WriterScriptArtwork'));
const ManuscriptReviewConversation = lazy(() => import('./components/ManuscriptReviewConversation'));
const ListenerLibrary = lazy(() => import('./components/ListenerLibrary'));
const ListenerCreatorDiscovery = lazy(() => import('./components/ListenerCreatorDiscovery'));
const NightjarGiftPanel = lazy(() => import('./components/NightjarGiftPanel'));
const CreatorCapacityBank = lazy(() => import('./components/CreatorCapacityBank'));
const ScriptMarketplace = lazy(() => import('./components/ScriptMarketplace'));
const ScriptLicenceWorkspace = lazy(() => import('./components/ScriptLicenceWorkspace'));
const ReleaseReviews = lazy(() => import('./components/ReleaseReviews'));
const CreatorSuggestionBox = lazy(() => import('./components/CreatorSuggestionBox'));
const NightjarTeamCommunity = lazy(() => import('./components/NightjarTeamCommunity'));
const MessagingHub = lazy(() => import('./components/MessagingHub'));
const ProfessionalRoleManager = lazy(() => import('./components/ProfessionalRoleManager'));
const ArtistStudio = lazy(() => import('./components/ArtistStudio'));
const NightjarWalletPanel = lazy(() => import('./components/NightjarWalletPanel'));
const UserProfileStudio = lazy(() => import('./components/UserProfileStudio'));
const RoleProfileExtension = lazy(() => import('./components/RoleProfileExtension'));
const EditorStudio = lazy(() => import('./components/EditorStudio'));
const AdminFinanceSimulator = lazy(() => import('./components/AdminFinanceSimulator'));
const AdminReleaseReadiness = lazy(() => import('./components/AdminReleaseReadiness'));
const AdminLegalReadiness = lazy(() => import('./components/AdminLegalReadiness'));
const AdminCommunications = lazy(() => import('./components/AdminCommunications'));
const AdminLiveMarketplacePreview = lazy(() => import('./components/AdminLiveMarketplacePreview'));
const AdminManuscriptReview = lazy(() => import('./components/AdminManuscriptReview'));
const AdminLiveProfileViewer = lazy(() => import('./components/AdminLiveProfileViewer'));
const EditorShowcaseModeration = lazy(() => import('./components/EditorShowcaseModeration'));


type View = 'discover' | 'library' | 'creators' | 'creator' | 'writer' | 'editor' | 'artist' | 'messages' | 'admin' | 'protection' | 'profile' | 'calendar' | 'settings';
type AgeStage = 'gate' | 'assurance' | 'app';
type AccountRole = 'admin' | 'creator' | 'listener' | 'writer' | 'editor' | 'artist';
type PreviewRole = 'creator' | 'listener' | 'writer' | 'editor' | 'artist';
type TestingMode = 'off' | 'demo' | 'simulation' | 'live';
const LIVE_PREVIEW_ROLES: { id: PreviewRole; label: string; detail: string }[] = [
  { id: 'listener', label: 'Listener', detail: 'Discover, library, playlists, favourites and profile' },
  { id: 'creator', label: 'VA Creator', detail: 'Studio, release drafts, marketplace and collaborations' },
  { id: 'writer', label: 'Writer', detail: 'Scripts, submissions, permissions and collaboration' },
  { id: 'editor', label: 'Audio Editor', detail: 'Studio, assignments, portfolio and review' },
  { id: 'artist', label: 'Artist', detail: 'Profile, artwork portfolio and professional roles' },
];

const PROFILE_ROLE_DEFAULTS = {
  roleFocus: [] as string[],
  roleSpecialties: [] as string[],
  roleSecondary: [] as string[],
  roleAvailability: '',
  roleHeadline: '',
  roleBio: '',
  roleDetailOne: '',
  roleDetailTwo: '',
  portfolioNote: '',
  featuredPortfolioIds: [] as string[],
  editorSoftware: [] as string[],
  editorProjectTypes: [] as string[],
  editorDeliveryFormats: [] as string[],
  editorCollaborationPreferences: [] as string[],
  editorTurnaround: '',
  editorExperienceYears: '',
  editorSkillLevels: {} as Record<string,string>,
  creatorLanguages: [] as string[],
  creatorDirectionModes: [] as string[],
  creatorDeliveryFormats: [] as string[],
  creatorTurnaround: '',
  creatorEquipment: '',
  writerScriptLengths: [] as string[],
  writerCollaborationPreferences: [] as string[],
  writerTurnaround: '',
  writerRightsNote: '',
  artistMediums: [] as string[],
  artistDeliveryFormats: [] as string[],
  artistTurnaround: '',
  artistSoftware: [] as string[],
  listenerCommunityStyle: [] as string[],
};

const profileRoleDraft = (profile: any) => ({
  roleFocus: [...(profile.roleFocus ?? [])],
  roleSpecialties: [...(profile.roleSpecialties ?? [])],
  roleSecondary: [...(profile.roleSecondary ?? [])],
  roleAvailability: profile.roleAvailability ?? '',
  roleHeadline: profile.roleHeadline ?? '',
  roleBio: profile.roleBio ?? '',
  roleDetailOne: profile.roleDetailOne ?? '',
  roleDetailTwo: profile.roleDetailTwo ?? '',
  portfolioNote: profile.portfolioNote ?? '',
  featuredPortfolioIds: [...(profile.featuredPortfolioIds ?? [])],
  editorSoftware: [...(profile.editorSoftware ?? [])],
  editorProjectTypes: [...(profile.editorProjectTypes ?? [])],
  editorDeliveryFormats: [...(profile.editorDeliveryFormats ?? [])],
  editorCollaborationPreferences: [...(profile.editorCollaborationPreferences ?? [])],
  editorTurnaround: profile.editorTurnaround ?? '',
  editorExperienceYears: profile.editorExperienceYears ?? '',
  editorSkillLevels: { ...(profile.editorSkillLevels ?? {}) },
  creatorLanguages: [...(profile.creatorLanguages ?? [])],
  creatorDirectionModes: [...(profile.creatorDirectionModes ?? [])],
  creatorDeliveryFormats: [...(profile.creatorDeliveryFormats ?? [])],
  creatorTurnaround: profile.creatorTurnaround ?? '',
  creatorEquipment: profile.creatorEquipment ?? '',
  writerScriptLengths: [...(profile.writerScriptLengths ?? [])],
  writerCollaborationPreferences: [...(profile.writerCollaborationPreferences ?? [])],
  writerTurnaround: profile.writerTurnaround ?? '',
  writerRightsNote: profile.writerRightsNote ?? '',
  artistMediums: [...(profile.artistMediums ?? [])],
  artistDeliveryFormats: [...(profile.artistDeliveryFormats ?? [])],
  artistTurnaround: profile.artistTurnaround ?? '',
  artistSoftware: [...(profile.artistSoftware ?? [])],
  listenerCommunityStyle: [...(profile.listenerCommunityStyle ?? [])],
});

const captureProfileRoleDraft = (profile: any, role: PreviewRole) => ({
  ...profile,
  roleProfiles: {
    ...(profile.roleProfiles ?? {}),
    [role]: profileRoleDraft(profile),
  },
});

const applyProfileRoleDraft = (profile: any, role: PreviewRole) => {
  const stored = profile?.roleProfiles?.[role];
  const fallback = profile?.activeRole === role ? profileRoleDraft(profile) : {};
  return {
    ...profile,
    ...PROFILE_ROLE_DEFAULTS,
    ...(stored && typeof stored === 'object' ? stored : fallback),
  };
};


const TESTING_SESSION_KEY = 'nightjar.testing.session.v1';

const readTestingSession = (): { mode: TestingMode; role: PreviewRole | null } => {
  try {
    const raw = window.sessionStorage.getItem(TESTING_SESSION_KEY);
    if (!raw) return { mode: 'off', role: null };
    const parsed = JSON.parse(raw);
    const mode: TestingMode = parsed?.mode === 'live' ? 'live' : parsed?.mode === 'simulation' ? 'simulation' : parsed?.mode === 'demo' ? 'demo' : 'off';
    const role: PreviewRole | null = ['listener', 'creator', 'writer', 'editor', 'artist'].includes(parsed?.role) ? parsed.role : null;
    return (mode === 'simulation' || mode === 'live') && role ? { mode, role } : mode === 'demo' ? { mode, role: null } : { mode: 'off', role: null };
  } catch {
    return { mode: 'off', role: null };
  }
};

const writeTestingSession = (mode: TestingMode, role: PreviewRole | null = null) => {
  try {
    window.sessionStorage.setItem(TESTING_SESSION_KEY, JSON.stringify({ mode, role: mode === 'simulation' || mode === 'live' ? role : null }));
  } catch { /* session persistence is an enhancement, never a blocker */ }
};

const clearTestingSession = () => {
  try { window.sessionStorage.removeItem(TESTING_SESSION_KEY); } catch { /* ignore unavailable storage */ }
};

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
  transcriptAvailable?: boolean;
  transcriptLanguage?: string;
  transcriptWordCount?: number;
  creatorUserId?: string;
  genre?: string;
  mood?: string;
  tags?: string[];
  tropes?: string[];
  contributors?: { userId?: string | null; name: string; role: string }[];
  contentRating?: string;
  seriesTitle?: string | null;
  episodeNumber?: number | null;
  nightjarOriginal?: boolean;
  releaseDistribution?: 'standard' | 'nightjar_first';
  productionNote?: string | null;
  communityLikeCount?: number;
  communityLoveCount?: number;
  communityReactionCount?: number;
  communityCommentCount?: number;
  listenCount?: number;
  playbackAllowed?: boolean;
  playbackAccessReason?: 'admin' | 'credited_work' | 'subscription' | 'subscription_required' | null;
};

type PublicDirectoryProfile = {
  userId: string;
  role: Exclude<AccountRole, 'admin'>;
  roles?: Exclude<AccountRole, 'admin'>[];
  name: string;
  handle?: string | null;
  headline?: string | null;
  bio?: string | null;
  followerCount?: number;
  avatarUrl?: string | null;
  avatarInitials?: string | null;
  favouriteTags?: string[];
  favouriteCategories?: string[];
  roleSpecialties?: string[];
  roleAvailability?: string | null;
  roleProfiles?: Record<string, {
    roleFocus?: string[];
    roleSpecialties?: string[];
    roleSecondary?: string[];
    roleAvailability?: string | null;
    roleHeadline?: string | null;
    roleBio?: string | null;
    editorSoftware?: string[];
    editorProjectTypes?: string[];
    editorDeliveryFormats?: string[];
    editorCollaborationPreferences?: string[];
    editorTurnaround?: string | null;
    editorExperienceYears?: number | null;
    editorSkillLevels?: Record<string,string>;
    creatorLanguages?: string[];
    creatorDirectionModes?: string[];
    creatorDeliveryFormats?: string[];
    creatorTurnaround?: string | null;
    creatorEquipment?: string | null;
    writerScriptLengths?: string[];
    writerCollaborationPreferences?: string[];
    writerTurnaround?: string | null;
    writerRightsNote?: string | null;
    artistMediums?: string[];
    artistDeliveryFormats?: string[];
    artistTurnaround?: string | null;
    artistSoftware?: string[];
    listenerCommunityStyle?: string[];
  }>;
  releaseCount?: number;
  publishedWorkCount?: number;
  creditedReleaseCount?: number;
  completedCollaborations?: number;
  activityBadges?: { id: string; label: string; detail: string }[];
  nightjarTeam?: boolean;
};

type Spotlight = {
  kind: 'creator' | 'writer' | 'editor' | 'artist' | 'listener';
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
    label: 'VA Creator',
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
  artist: {
    label: 'Artist',
    description: 'Create commissioned visual artwork, cover art, character art and promotional visuals.',
  },
};


const formatMoneyPence = (pence: number | null | undefined) => {
  if (pence == null || !Number.isFinite(Number(pence))) return 'Not set';
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(Number(pence) / 100);
};

const formatAdminDate = (value: unknown) => {
  if (!value) return '—';
  const raw = String(value);
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const protectionEventLabel = (eventType: unknown) => {
  const value = String(eventType ?? '');
  const labels: Record<string, string> = {
    possible_screenshot_key: 'Possible PrintScreen signal',
    possible_capture_shortcut: 'Possible capture shortcut',
    native_screenshot_detected: 'Native screenshot callback',
    native_screen_capture_detected: 'Native screen-capture callback',
    print_blocked: 'Print command blocked',
    print_dialog_attempt: 'Print dialog attempt',
    save_page_blocked: 'Save-page command blocked',
    copy_blocked: 'Copy blocked',
    cut_blocked: 'Cut blocked',
    selection_blocked: 'Selection blocked',
    contextmenu_blocked: 'Context menu blocked',
    drag_blocked: 'Drag blocked',
    script_view: 'Protected manuscript opened',
  };
  return (labels[value] ?? value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())) || 'Protection signal';
};

const protectionConfidenceLabel = (value: unknown) => {
  if (value === 'native_callback') return 'Native OS callback';
  if (value === 'strong') return 'Strong browser signal';
  if (value === 'possible') return 'Possible browser signal';
  if (value === 'contextual') return 'Context signal';
  return null;
};

const readFileDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = reject;
  reader.readAsDataURL(file);
});

const EMPTY_PROFILE = { displayName: '', handle: '', headline: '', bio: '', welcomeMessage: '', pronouns: '', avatarInitials: '', avatarTone: 'plum', avatarUrl: null, avatarStatus: null, pendingAvatarAssetId: null, pendingAvatarStatus: null, favouriteTags: [], favouriteTropes: [], favouriteCategories: [], roleFocus: [], roleSpecialties: [], roleSecondary: [], roleAvailability: '', roleHeadline: '', roleBio: '', roleDetailOne: '', roleDetailTwo: '', portfolioNote: '', featuredPortfolioIds: [], editorSoftware: [], editorProjectTypes: [], editorDeliveryFormats: [], editorCollaborationPreferences: [], editorTurnaround: '', editorExperienceYears: '', editorSkillLevels: {}, creatorLanguages: [], creatorDirectionModes: [], creatorDeliveryFormats: [], creatorTurnaround: '', creatorEquipment: '', writerScriptLengths: [], writerCollaborationPreferences: [], writerTurnaround: '', writerRightsNote: '', artistMediums: [], artistDeliveryFormats: [], artistTurnaround: '', artistSoftware: [], listenerCommunityStyle: [], publicProfile: true };

function App() {
  const [view, setView] = useState<View>(() => { const value = window.location.pathname.replace(/^\/+|\/+$/g, ''); const topLevel = value.split('/')[0]; return (['discover','library','creators','creator','writer','editor','artist','messages','admin','protection','profile','calendar','settings'].includes(topLevel) ? topLevel : 'discover') as View; });
  const [profileRolesPage, setProfileRolesPage] = useState(() => /^\/profile\/roles\/?$/.test(window.location.pathname));
  const [playing, setPlaying] = useState<string | null>(null);
  const [focusedContentReleaseId, setFocusedContentReleaseId] = useState<string | null>(() => new URLSearchParams(window.location.search).get('release'));
  const [focusedContentScriptId, setFocusedContentScriptId] = useState<string | null>(() => new URLSearchParams(window.location.search).get('script'));
  const [notificationArtworkFocusId, setNotificationArtworkFocusId] = useState<string | null>(() => new URLSearchParams(window.location.search).get('artwork'));
  const [communityUpdateId, setCommunityUpdateId] = useState<string | null>(() => {
    const id = new URLSearchParams(window.location.search).get('update');
    return id && /^[0-9a-f-]{36}$/i.test(id) ? id : null;
  });
  const openedContentReleaseRef = useRef<string | null>(null);
  const [transcriptRequested, setTranscriptRequested] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [liveRoleMenuOpen, setLiveRoleMenuOpen] = useState(false);
  const liveRoleMenuRef = useRef<HTMLDivElement | null>(null);
  const [ageStage, setAgeStage] = useState<AgeStage>('gate');
  // Never show account entry or an adult workspace while Firebase and the
  // backend are restoring this session on refresh.
  const [sessionHydrating, setSessionHydrating] = useState(true);
  const [sessionRestoreError, setSessionRestoreError] = useState(false);
  const [ageVerified, setAgeVerified] = useState(false);
  const [ageStatus, setAgeStatus] = useState<'NOT_STARTED' | 'PENDING' | 'COMPLETE' | 'FAIL'>('NOT_STARTED');
  const [ageConfigured, setAgeConfigured] = useState(false);
  const [ageProvider, setAgeProvider] = useState('didit');
  const [ageEnvironment, setAgeEnvironment] = useState<'sandbox' | 'live'>('sandbox');
  const [ageVerifiedAt, setAgeVerifiedAt] = useState<string | null>(null);
  const [ageReverifyRequired, setAgeReverifyRequired] = useState(false);
  const [ageSessionActive, setAgeSessionActive] = useState(false);
  const [ageProviderVerified, setAgeProviderVerified] = useState(false);
  const [ageProviderStatus, setAgeProviderStatus] = useState('NOT_STARTED');
  const [ageLivePilotAvailable, setAgeLivePilotAvailable] = useState(false);
  const [agePilotEligible, setAgePilotEligible] = useState(false);
  const [agePilotConsent, setAgePilotConsent] = useState(false);
  const [diditPilotEmail, setDiditPilotEmail] = useState('');
  const [diditPilotBusy, setDiditPilotBusy] = useState(false);
  const [diditPilotFeedback, setDiditPilotFeedback] = useState('');
  const [ageLaunchUrl, setAgeLaunchUrl] = useState<string | null>(null);
  const [ageLoading, setAgeLoading] = useState(false);
  const [ageTemporaryBypass, setAgeTemporaryBypass] = useState(false);
  const [ageTemporaryBypassReason, setAgeTemporaryBypassReason] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [toastAction, setToastAction] = useState<{ label: string; run: () => void | Promise<void> } | null>(null);
  const toastTimer = useRef<number | null>(null);
  const [favouriteReleaseIds, setFavouriteReleaseIds] = useState<string[]>([]);
  const [followingProfileIds, setFollowingProfileIds] = useState<string[]>([]);
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [role, setRole] = useState<AccountRole | null>(null);
  const [accountStatus, setAccountStatus] = useState<'active' | 'pending_review'>('active');
  const [accountLoading, setAccountLoading] = useState(false);
  const [rolePicker, setRolePicker] = useState(false);
  const [previewRole, setPreviewRole] = useState<PreviewRole | null>(null);
  const [demoMode, setDemoMode] = useState(false);
  const productLoadEpoch = useRef(0);
  const [simulationMode, setSimulationMode] = useState(false);
  const liveRolePreview = role === 'admin' && Boolean(previewRole) && !simulationMode && !demoMode;
  const interactiveRoleTest = role === 'admin' && simulationMode && Boolean(previewRole);
  const [testingSessionHydrated, setTestingSessionHydrated] = useState(false);
  const [demoSessionKey, setDemoSessionKey] = useState(0);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [pendingLogoPreviewUrl, setPendingLogoPreviewUrl] = useState<string | null>(null);
  const [demoLogoPreviewUrl, setDemoLogoPreviewUrl] = useState<string | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [identityEmail, setIdentityEmail] = useState<string | null>(null);
  const [identityAdmin, setIdentityAdmin] = useState(false);
  const [protectedReaderOpen, setProtectedReaderOpen] = useState(false);
  const [protectionEvidence, setProtectionEvidence] = useState<any[]>([]);
  const [protectionReports, setProtectionReports] = useState<any[]>([]);
  const [adminReports, setAdminReports] = useState<any[]>([]);
  const [adminCommunityReports, setAdminCommunityReports] = useState<any[]>([]);
  const [adminReviewQueue, setAdminReviewQueue] = useState<any[]>([]);
  const [reportCategory, setReportCategory] = useState('Something else');
  const [reportSummary, setReportSummary] = useState('');
  const [adminOverview, setAdminOverview] = useState<any | null>(null);
  const [adminOverviewLoading, setAdminOverviewLoading] = useState(false);
  const [adminTesterEmail, setAdminTesterEmail] = useState('');
  const [adminPeopleRole, setAdminPeopleRole] = useState<'listener' | 'creator' | 'writer' | 'editor' | 'artist' | 'admin' | null>(() => {
    const roleFromPath = window.location.pathname.match(/^\/admin\/people\/(listener|creator|writer|editor|artist|admin)\/?$/)?.[1];
    return (roleFromPath ?? null) as 'listener' | 'creator' | 'writer' | 'editor' | 'artist' | 'admin' | null;
  });
  const [profile, setProfile] = useState<any>(() => structuredClone(EMPTY_PROFILE));
  const [profileEditRole, setProfileEditRole] = useState<PreviewRole>('listener');
  const [profileTagCatalogue, setProfileTagCatalogue] = useState<string[]>([]);
  const [profilePortfolioOptions, setProfilePortfolioOptions] = useState<any[]>([]);
  const [profileCompletedCollaborations, setProfileCompletedCollaborations] = useState(0);
  const [profileLoading, setProfileLoading] = useState(false);
  const [tasteVector, setTasteVector] = useState<any[]>([]);
  const [securityAlerts, setSecurityAlerts] = useState<any[]>([]);
  const [securityAlertsLoading, setSecurityAlertsLoading] = useState(false);
  const [authenticationEvents, setAuthenticationEvents] = useState<AuthenticationSecurityEvent[]>([]);
  const [authenticationEventsLoading, setAuthenticationEventsLoading] = useState(false);
  const [securityEvidenceReview, setSecurityEvidenceReview] = useState<SecurityEvidenceReviewData | null>(null);
  const [assistancePrefillEmail, setAssistancePrefillEmail] = useState('');
  const [securityEvidenceLoading, setSecurityEvidenceLoading] = useState(false);
  const [adminPanel, setAdminPanel] = useState<'approvals' | 'suggestions' | 'reports' | 'reviews' | 'revenue' | 'subscriptions' | 'economics' | 'editorial' | 'images' | 'tags' | 'branding' | 'live-preview' | 'profile-viewer' | null>(() => {
    const panelFromPath = window.location.pathname.match(/^\/admin\/(approvals|suggestions|reports|reviews|revenue|subscriptions|economics|editorial|images|tags|branding|live-preview|profile-viewer)\/?$/)?.[1];
    return (panelFromPath ?? null) as 'approvals' | 'suggestions' | 'reports' | 'reviews' | 'revenue' | 'subscriptions' | 'economics' | 'editorial' | 'images' | 'tags' | 'branding' | 'live-preview' | 'profile-viewer' | null;
  });
  const [adminProfileViewerUserId, setAdminProfileViewerUserId] = useState<string | null>(null);
  const [adminWorkspace, setAdminWorkspace] = useState<AdminWorkspace>(() => {
    const match = window.location.pathname.match(/^\/admin\/workspace\/(overview|people|content|launch|finance|security|assistance|tools)\/?$/);
    return (match?.[1] ?? 'overview') as AdminWorkspace;
  });
  const [adminApplications, setAdminApplications] = useState<any[]>([]);
  const [adminApplicationWave, setAdminApplicationWave] = useState('Wave 1');
  const [adminApplicationRoleFilter, setAdminApplicationRoleFilter] = useState<'all'|'creator'|'writer'|'editor'|'artist'>('all');
  const [adminApplicationBox, setAdminApplicationBox] = useState<ProfessionalApplicationBox>('pending');
  const [adminCreatorSuggestions, setAdminCreatorSuggestions] = useState<any[]>([]);
  const [adminSubscriptions, setAdminSubscriptions] = useState<any[]>([]);
  const [adminScripts, setAdminScripts] = useState<any[]>([]);
  const [adminPanelLoading, setAdminPanelLoading] = useState(false);
  const [imageModeration, setImageModeration] = useState<any[]>([]);
  const [adminProfileTags, setAdminProfileTags] = useState<any[]>([]);
  const [adminProfileTagThreshold, setAdminProfileTagThreshold] = useState(5);
  const [moderationPreviewAsset, setModerationPreviewAsset] = useState<any | null>(null);
  const [profileImageBusy, setProfileImageBusy] = useState(false);
  const [commercialOverview, setCommercialOverview] = useState<CommercialOverview | null>(null);
  const [nightjarPayoutOverview, setNightjarPayoutOverview] = useState<AdminNightjarPayoutOverview | null>(null);
  const [commercialSettings, setCommercialSettings] = useState<CommercialSettings>({
    planningMonthlyPricePence: 699,
    creatorPoolPercent: 50,
    companyProfitPercent: 30,
    businessFundPercent: 20,
    planningEligibleNetPercent: 66.33,
    safeCreatorUtilizationPercent: 70,
    revenueAveragingDays: 90,
    subscriberStressTestPercent: 20,
    minimumBankedCreatorSlots: 2,
    automaticCreatorSlotOpening: false,
    creatorSlotRecommendations: true,
    reservePercent: 20,
    payoutCadence: 'Monthly',
    eligibleListeningDefinition: null,
    compensationModel: 'capped_equal_rate',
    creatorMonthlyCapPence: 300000,
    creatorRateBands: [
      { minPaidSubscribers: 0, monthlyRatePence: 0 },
      { minPaidSubscribers: 500, monthlyRatePence: 25000 },
      { minPaidSubscribers: 1000, monthlyRatePence: 50000 },
      { minPaidSubscribers: 2500, monthlyRatePence: 75000 },
      { minPaidSubscribers: 5000, monthlyRatePence: 150000 },
      { minPaidSubscribers: 7500, monthlyRatePence: 225000 },
      { minPaidSubscribers: 10000, monthlyRatePence: 300000 },
    ],
    creatorEligibilityDefinition: null,
    popularityAffectsBaseRate: false,
    tipsEnabled: false,
    individualPurchasesEnabled: false,
    listenerSubscriptionUrl: null,
  });
  const [commercialSaving, setCommercialSaving] = useState(false);
  const [creatorSlotBusyUserId, setCreatorSlotBusyUserId] = useState<string | null>(null);
  const [listeningAccess, setListeningAccess] = useState<{
    role:string|null;
    subscribed:boolean;
    subscriptionStatus:string|null;
    planningMonthlyPricePence:number|null;
    subscriptionUrl:string|null;
    creditedWorkIncluded:true;
    rule:string;
  } | null>(null);
  const [reviewTrack, setReviewTrack] = useState<Track | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [catalogueQuery, setCatalogueQuery] = useState('');
  const [catalogueRating, setCatalogueRating] = useState('all');
  const [catalogueDuration, setCatalogueDuration] = useState('all');
  const [selectedListeningMood, setSelectedListeningMood] = useState<MoodFilter>('all');
  const [listeningBoundaries, setListeningBoundaries] = useState<ListeningBoundaries>(DEFAULT_LISTENING_BOUNDARIES);
  const [momentSeek, setMomentSeek] = useState<{ releaseId: string; seconds: number; nonce: number } | null>(null);
  // Apply private boundaries across app routes after a verified user session,
  // not just when someone visits Discover. Reset immediately on account switch.
  useEffect(() => {
    setListeningBoundaries(DEFAULT_LISTENING_BOUNDARIES);
    setSelectedListeningMood('all');
    if (!user?.userId || !ageVerified || demoMode) return;
    let cancelled = false;
    void nightjarExperience.boundaries().then((value) => {
      if (!cancelled) setListeningBoundaries(value);
    }).catch(() => {
      if (!cancelled) notify('Your listening preferences could not be loaded; check them under Discover.');
    });
    return () => { cancelled = true; };
  }, [user?.userId, ageVerified, demoMode]);
  const [profileDirectory, setProfileDirectory] = useState<PublicDirectoryProfile[]>([]);
  const [directoryQuery, setDirectoryQuery] = useState('');
  const [supportTarget, setSupportTarget] = useState<{userId:string;name:string;role:'creator'|'writer'|'editor'|'artist';roles:string[]}|null>(null);
  const [directoryRoleFilter, setDirectoryRoleFilter] = useState<'all' | 'creator' | 'writer' | 'editor' | 'artist' | 'listener'>('all');
  const [directoryTagFilter, setDirectoryTagFilter] = useState('all');
  const [directoryAvailabilityFilter, setDirectoryAvailabilityFilter] = useState('all');
  const [savedDirectoryViews, setSavedDirectoryViews] = useState<any[]>([]);
  const [creatorSpotlightList, setCreatorSpotlightList] = useState<Spotlight[]>([]);
  const [writerSpotlightList, setWriterSpotlightList] = useState<Spotlight[]>([]);
  const [editorSpotlightList, setEditorSpotlightList] = useState<Spotlight[]>([]);
  const [artistSpotlightList, setArtistSpotlightList] = useState<Spotlight[]>([]);
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
  const [focusedReleaseId, setFocusedReleaseId] = useState<string | null>(null);
  const [nightjarUpdate, setNightjarUpdate] = useState<NightjarUpdateStatus | null>(null);
  const [nightjarUpdating, setNightjarUpdating] = useState(false);
  const [releaseReactions, setReleaseReactions] = useState<Record<string, Exclude<ReleaseReaction, null>>>({});
  const [messageRecipientUserId, setMessageRecipientUserId] = useState<string | null>(null);
  const [messageCollaborationId, setMessageCollaborationId] = useState<string | null>(null);
  const [messageConversationId, setMessageConversationId] = useState<string | null>(null);
  const [messageUnreadCount, setMessageUnreadCount] = useState(0);
  const [messageNeedsReplyCount, setMessageNeedsReplyCount] = useState(0);
  const [messageAwaitingReplyCount, setMessageAwaitingReplyCount] = useState(0);
  const [creatorProfileUserId, setCreatorProfileUserId] = useState<string | null>(null);
  const [publicProfileInitialRole, setPublicProfileInitialRole] = useState<string | null>(() => {
    const initial = new URLSearchParams(window.location.search).get('role');
    return ['listener','creator','writer','editor','artist'].includes(String(initial)) ? initial : null;
  });
  const [publicProfileUserId, setPublicProfileUserId] = useState<string | null>(() => {
    const match = window.location.pathname.match(/^\/people\/([^/]+)$/);
    return match ? decodeURIComponent(match[1]) : null;
  });
  const [moderationOpen, setModerationOpen] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [profileBaseline, setProfileBaseline] = useState<any | null>(null);
  const profileCloudDraftRef = useRef<ProfileDraftController|null>(null);
  const [profileSaveError, setProfileSaveError] = useState('');

  const [writerDraftTitle, setWriterDraftTitle] = useState('');
  const [writerNewArtworkFile, setWriterNewArtworkFile] = useState<File | null>(null);
  const [writerScripts, setWriterScripts] = useState<any[]>([]);
  const [writerSelected, setWriterSelected] = useState<any | null>(null);
  const [editorQueue, setEditorQueue] = useState<any[]>([]);
  const [editorSelected, setEditorSelected] = useState<any | null>(null);
  const [, setProtectedScripts] = useState<any[]>([]);
  const [protectedReaderScript, setProtectedReaderScript] = useState<any | null>(null);
  const [writerPermissions, setWriterPermissions] = useState<any[]>([]);
  const [writerPermissionsLoading, setWriterPermissionsLoading] = useState(false);
  const [writerUploadBusy, setWriterUploadBusy] = useState(false);

  useEffect(() => {
    if (!moderationPreviewAsset) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setModerationPreviewAsset(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [moderationPreviewAsset]);

  useEffect(() => {
    if (!liveRoleMenuOpen) return;
    const onOutside = (event: PointerEvent) => {
      if (!liveRoleMenuRef.current?.contains(event.target as Node)) setLiveRoleMenuOpen(false);
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setLiveRoleMenuOpen(false);
    };
    document.addEventListener('pointerdown', onOutside);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('pointerdown', onOutside);
      document.removeEventListener('keydown', onEscape);
    };
  }, [liveRoleMenuOpen]);
  useEffect(() => installNativeProtectionBridge(), []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCommandOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const profileDirty = useMemo(() => {
    if (!profileBaseline) return false;
    return JSON.stringify(profile) !== JSON.stringify(profileBaseline);
  }, [profile, profileBaseline]);

  useEffect(() => {
    if (!profileDirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [profileDirty]);

  useEffect(() => {
    if (!user?.userId) {
      setSavedDirectoryViews([]);
      return;
    }
    try {
      const stored = window.localStorage.getItem('nightjar.directory.views:' + user.userId);
      setSavedDirectoryViews(stored ? JSON.parse(stored) : []);
    } catch {
      setSavedDirectoryViews([]);
    }
  }, [user?.userId]);

  // listCatalogue only supplies released entries; don't expose private drafts here.
  // Keep featured first, then browse all playable public releases without changing audio playback.
  const [activeFeaturedId, setActiveFeaturedId] = useState<string | null>(null);
  const [featuredCarouselVisible, setFeaturedCarouselVisible] = useState(false);
  const [featuredCarouselPaused, setFeaturedCarouselPaused] = useState(false);
  const [featuredCarouselReducedMotion, setFeaturedCarouselReducedMotion] = useState(false);
  const [featuredCarouselHovered, setFeaturedCarouselHovered] = useState(false);
  const [featuredCarouselAnnouncement, setFeaturedCarouselAnnouncement] = useState('');
  const featuredCarouselRef = useRef<HTMLDivElement | null>(null);
  const featuredTouchStart = useRef<{ x: number; y: number } | null>(null);
  const carouselTracks = useMemo(() => [...tracks]
    .filter((track) => track.audioAvailable === true || Boolean(track.audioUrl))
    .sort((left, right) => Number(right.featured === true) - Number(left.featured === true)), [tracks]);
  const featuredIndex = Math.max(0, carouselTracks.findIndex((track) => track.id === activeFeaturedId));
  const featured = carouselTracks[featuredIndex] ?? null;
  const changeFeatured = (offset: number) => {
    if (carouselTracks.length < 2) return;
    const nextIndex = (featuredIndex + offset + carouselTracks.length) % carouselTracks.length;
    setActiveFeaturedId(carouselTracks[nextIndex].id);
    setFeaturedCarouselAnnouncement(
      carouselTracks[nextIndex].title + ', ' + (nextIndex + 1) + ' of ' + carouselTracks.length + ' released audios.'
    );
  };

  // Respect OS reduced-motion preferences, including live accessibility changes.
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setFeaturedCarouselReducedMotion(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

  // Only rotate the visible card. Preserve manual swiping and keyboard access,
  // pause on desktop hover, while examining comments, and for reduced motion.
  useEffect(() => {
    if (view !== 'discover' || carouselTracks.length < 2) {
      setFeaturedCarouselVisible(false);
      return;
    }
    const card = featuredCarouselRef.current;
    if (!card) return;
    if (typeof IntersectionObserver === 'undefined') {
      setFeaturedCarouselVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => setFeaturedCarouselVisible(Boolean(entries[0]?.isIntersecting && entries[0].intersectionRatio >= 0.25)),
      { threshold: [0, 0.25] }
    );
    observer.observe(card);
    return () => observer.disconnect();
  }, [view, carouselTracks.length]);

  useEffect(() => {
    if (view !== 'discover' || carouselTracks.length < 2 || !featuredCarouselVisible
      || featuredCarouselPaused || featuredCarouselReducedMotion || featuredCarouselHovered || reviewTrack !== null) return;
    const interval = window.setInterval(() => {
      if (document.hidden || window.matchMedia('(prefers-reduced-motion: reduce)').matches
        || featuredCarouselRef.current?.querySelector(':focus-visible')) return;
      setActiveFeaturedId((previousId) => {
        const selectedIndex = carouselTracks.findIndex((track) => track.id === previousId);
        const safeIndex = selectedIndex < 0 ? 0 : selectedIndex;
        return carouselTracks[(safeIndex + 1) % carouselTracks.length].id;
      });
    }, 3000);
    return () => window.clearInterval(interval);
  }, [view, carouselTracks, activeFeaturedId, featuredCarouselVisible, featuredCarouselPaused, featuredCarouselReducedMotion, featuredCarouselHovered, reviewTrack]);

  // Only link people to a verified account ID from the release credit or a unique
  // exact-name, matching-role public directory entry. Never guess an identity from a name.
  const featuredCredits = useMemo(() => {
    if (!featured) return [] as { role: string; name: string; userId: string | null; profileRole: string }[];
    const credits = [
      { role:'Creator', name:featured.creator, userId:featured.creatorUserId ?? null },
      ...(featured.contributors ?? []),
    ];
    const seen = new Set<string>();
    return credits.flatMap(({ role, name, userId }) => {
      const cleanName = String(name ?? '').trim();
      const cleanRole = String(role ?? '').trim() || 'Contributor';
      if (!cleanName) return [];
      const key = cleanRole.toLocaleLowerCase() + ':' + cleanName.toLocaleLowerCase();
      if (seen.has(key)) return [];
      seen.add(key);
      const roleName = cleanRole.toLowerCase();
      const profileRole = roleName.includes('writ') || roleName.includes('script') ? 'writer'
        : roleName.includes('edit') || roleName.includes('sound') ? 'editor'
        : roleName.includes('art') || roleName.includes('illustrat') ? 'artist' : 'creator';
      const matches = profileDirectory.filter((person) =>
        person.name.trim().toLowerCase() === cleanName.toLowerCase()
        && (person.roles ?? [person.role]).includes(profileRole as Exclude<AccountRole, 'admin'>));
      const verifiedUserId = String(userId ?? '').trim() || (matches.length === 1 ? matches[0].userId : '');
      return [{ role:cleanRole, name:cleanName, userId:verifiedUserId || null, profileRole }];
    });
  }, [featured, profileDirectory]);
  const communityByRelease = useMemo(() => Object.fromEntries(tracks.map((track) => [track.id, {
    likes:Number(track.communityLikeCount ?? 0),
    loves:Number(track.communityLoveCount ?? 0),
    comments:Number(track.communityCommentCount ?? 0),
  }])), [tracks]);
  const creatorSpotlight = creatorSpotlightList[0] ?? null;
  const writerSpotlight = writerSpotlightList[0] ?? null;
  const editorSpotlight = editorSpotlightList[0] ?? null;
  const artistSpotlight = artistSpotlightList[0] ?? null;
  const directoryTagOptions = useMemo(() => Array.from(new Set(
    profileDirectory.flatMap((profile) => {
      const roleProfiles = Object.values(profile.roleProfiles ?? {});
      return [
        ...(profile.favouriteTags ?? []),
        ...(profile.roleSpecialties ?? []),
        ...(profile.favouriteCategories ?? []),
        ...roleProfiles.flatMap((slice) => [
          ...(slice.roleFocus ?? []),
          ...(slice.roleSpecialties ?? []),
          ...(slice.roleSecondary ?? []),
          ...(slice.editorSoftware ?? []),
          ...(slice.editorProjectTypes ?? []),
          ...(slice.editorDeliveryFormats ?? []),
          ...(slice.editorCollaborationPreferences ?? []),
          ...(slice.creatorLanguages ?? []),
          ...(slice.creatorDirectionModes ?? []),
          ...(slice.creatorDeliveryFormats ?? []),
          ...(slice.writerScriptLengths ?? []),
          ...(slice.writerCollaborationPreferences ?? []),
          ...(slice.artistMediums ?? []),
          ...(slice.artistDeliveryFormats ?? []),
          ...(slice.artistSoftware ?? []),
          ...(slice.listenerCommunityStyle ?? []),
        ]),
      ];
    }),
  )).sort((a, b) => a.localeCompare(b)), [profileDirectory]);
  const directoryAvailabilityOptions = useMemo(() => Array.from(new Set(
    profileDirectory.flatMap((profile) => [
      profile.roleAvailability,
      ...Object.values(profile.roleProfiles ?? {}).map((slice) => slice.roleAvailability),
    ]).filter((value): value is string => Boolean(value)),
  )).sort((a, b) => a.localeCompare(b)), [profileDirectory]);
  const filteredDirectoryProfiles = useMemo(() => {
    const query = directoryQuery.trim().toLowerCase();
    return profileDirectory.filter((profile) => {
      const roleProfiles = profile.roleProfiles ?? {};
      const allRoleSlices = Object.values(roleProfiles);
      const selectedRoleSlice = directoryRoleFilter !== 'all' ? roleProfiles[directoryRoleFilter] : undefined;
      const searchable = [
        profile.name,
        profile.handle,
        profile.headline,
        profile.bio,
        profile.role,
        ...(profile.roles ?? []),
        profile.roleAvailability,
        ...(profile.favouriteTags ?? []),
        ...(profile.roleSpecialties ?? []),
        ...(profile.favouriteCategories ?? []),
        ...allRoleSlices.flatMap((slice) => [
          slice.roleAvailability,
          slice.roleHeadline,
          slice.roleBio,
          slice.editorTurnaround,
          slice.creatorTurnaround,
          slice.creatorEquipment,
          slice.writerTurnaround,
          slice.writerRightsNote,
          slice.artistTurnaround,
          ...(slice.roleFocus ?? []),
          ...(slice.roleSpecialties ?? []),
          ...(slice.roleSecondary ?? []),
          ...(slice.editorSoftware ?? []),
          ...(slice.editorProjectTypes ?? []),
          ...(slice.editorDeliveryFormats ?? []),
          ...(slice.editorCollaborationPreferences ?? []),
          ...Object.keys(slice.editorSkillLevels ?? {}),
        ]),
        ...(profile.activityBadges ?? []).map((badge) => badge.label),
      ].filter(Boolean).join(' ').toLowerCase();
      const taxonomy = [
        ...(profile.favouriteTags ?? []),
        ...(profile.favouriteCategories ?? []),
        ...(selectedRoleSlice?.roleFocus ?? (directoryRoleFilter === 'all' ? allRoleSlices.flatMap((slice) => slice.roleFocus ?? []) : [])),
        ...(selectedRoleSlice?.roleSpecialties ?? (directoryRoleFilter === 'all' ? allRoleSlices.flatMap((slice) => slice.roleSpecialties ?? []) : profile.roleSpecialties ?? [])),
        ...(selectedRoleSlice?.roleSecondary ?? (directoryRoleFilter === 'all' ? allRoleSlices.flatMap((slice) => slice.roleSecondary ?? []) : [])),
        ...(selectedRoleSlice?.editorSoftware ?? (directoryRoleFilter === 'all' ? allRoleSlices.flatMap((slice) => slice.editorSoftware ?? []) : [])),
        ...(selectedRoleSlice?.editorProjectTypes ?? (directoryRoleFilter === 'all' ? allRoleSlices.flatMap((slice) => slice.editorProjectTypes ?? []) : [])),
        ...(selectedRoleSlice?.editorDeliveryFormats ?? (directoryRoleFilter === 'all' ? allRoleSlices.flatMap((slice) => slice.editorDeliveryFormats ?? []) : [])),
        ...(selectedRoleSlice?.editorCollaborationPreferences ?? (directoryRoleFilter === 'all' ? allRoleSlices.flatMap((slice) => slice.editorCollaborationPreferences ?? []) : [])),
      ];
      const availabilityValues = directoryRoleFilter !== 'all'
        ? [selectedRoleSlice?.roleAvailability, profile.role === directoryRoleFilter ? profile.roleAvailability : null]
        : [profile.roleAvailability, ...allRoleSlices.map((slice) => slice.roleAvailability)];
      if (query && !searchable.includes(query)) return false;
      if (directoryRoleFilter !== 'all' && profile.role !== directoryRoleFilter && !(profile.roles ?? []).includes(directoryRoleFilter)) return false;
      if (directoryTagFilter !== 'all' && !taxonomy.includes(directoryTagFilter)) return false;
      if (directoryAvailabilityFilter !== 'all' && !availabilityValues.includes(directoryAvailabilityFilter)) return false;
      return true;
    });
  }, [profileDirectory, directoryQuery, directoryRoleFilter, directoryTagFilter, directoryAvailabilityFilter]);

  const filteredTracks = useMemo(() => {
    const query = catalogueQuery.trim().toLowerCase();
    return tracks.filter((track) => {
      if (hiddenByBoundaries(track, listeningBoundaries) || !matchesListeningMood(track, selectedListeningMood)) return false;
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
  }, [tracks, catalogueQuery, catalogueRating, catalogueDuration, selectedListeningMood, listeningBoundaries]);
  const notificationReleaseCards = useMemo(() => {
    const focused = focusedContentReleaseId ? filteredTracks.find(item => item.id === focusedContentReleaseId) : null;
    return focused ? [focused, ...filteredTracks.filter(item => item.id !== focused.id)] : filteredTracks;
  }, [filteredTracks, focusedContentReleaseId, tracks]);

  const studioMetrics = [
    ['Published releases', String(creatorDashboard.metrics?.released ?? 0)],
    ['Draft releases', String(creatorDashboard.metrics?.drafts ?? 0)],
    ['Verified listening', String(creatorDashboard.metrics?.verifiedListeningMinutes ?? 0) + ' min'],
    ['Unique listeners', String(creatorDashboard.metrics?.uniqueListeners ?? 0)],
    ['Qualified listens', String(creatorDashboard.metrics?.qualifiedListens ?? 0)],
  ];

  useEffect(() => {
    const onPop = () => {
      const profileMatch = window.location.pathname.match(/^\/people\/([^/]+)$/);
      if (profileMatch) {
        const profileRole = new URLSearchParams(window.location.search).get('role');
        setPublicProfileInitialRole(['listener','creator','writer','editor','artist'].includes(String(profileRole)) ? profileRole : null);
        setNotificationArtworkFocusId(new URLSearchParams(window.location.search).get('artwork'));
        setPublicProfileUserId(decodeURIComponent(profileMatch[1]));
        return;
      }
      setPublicProfileUserId(null);
      const value = window.location.pathname.replace(/^\/+|\/+$/g, '');
      const topLevel = value.split('/')[0];
      setProfileRolesPage(value === 'profile/roles');
      if (topLevel === 'admin') {
        setSimulationMode(false);
        setPreviewRole(null);
        const panelFromPath = value.match(/^admin\/(approvals|suggestions|reports|reviews|revenue|subscriptions|economics|editorial|images|tags|branding|live-preview|profile-viewer)$/)?.[1];
        const peopleFromPath = value.match(/^admin\/people\/(listener|creator|writer|editor|artist|admin)$/)?.[1];
        setAdminPanel((panelFromPath ?? null) as typeof adminPanel);
        setAdminPeopleRole((peopleFromPath ?? null) as typeof adminPeopleRole);
        const workspaceFromPath = value.match(/^admin\/workspace\/(overview|people|content|launch|finance|security|assistance|tools)$/)?.[1];
        setAdminWorkspace((workspaceFromPath ?? 'overview') as AdminWorkspace);
      } else {
        setAdminPanel(null);
        setAdminPeopleRole(null);
      }
      setView((['discover','library','creators','creator','writer','editor','artist','messages','admin','protection','profile','calendar','settings'].includes(topLevel) ? topLevel : 'discover') as View);
    };
    window.addEventListener('popstate', onPop);
    void (async () => {
      try {
        const data = await nightjarMedia.getBranding();
        const nextLogo = data.logoUrl ?? null;
        setLogoUrl(nextLogo);
      } catch { /* branded wordmark remains available */ }
    })();
    let cancelled = false;
    const unsubscribe = nightjarAuth.observe((identity) => {
      if (cancelled) return;
      setSessionHydrating(true);
      setSessionRestoreError(false);
      if (!identity) {
        setDemoMode(false);
        setSimulationMode(false);
        setPreviewRole(null);
        setUser(null);
        setRole(null);
        setAgeVerified(false);
        setAgeStage('gate');
        setSessionHydrating(false);
        return;
      }

      setUser({
        userId: identity.userId,
        email: identity.email ?? undefined,
        name: identity.name ?? undefined,
      });

      if (!identity.emailVerified) {
        setAgeStage('gate');
        setSessionHydrating(false);
        return;
      }

      void (async () => {
        try {
          await loadAccount();
          if (cancelled || nightjarAuth.current()?.userId !== identity.userId) return;
          const verified = await refreshAgeStatus();
          if (cancelled || nightjarAuth.current()?.userId !== identity.userId) return;
          if (!verified) setAgeStage('assurance');
        } catch (error) {
          // A failed restore cannot grant access. Keep the ordinary sign-in
          // route available; all privileged actions remain server-checked.
          if (!cancelled && nightjarAuth.current()?.userId === identity.userId) {
            console.warn('Nightjar session restore failed', error);
            setSessionRestoreError(true);
            setAgeStage('gate');
          }
        } finally {
          if (!cancelled && nightjarAuth.current()?.userId === identity.userId) {
            setSessionHydrating(false);
          }
        }
      })();
    });

    return () => {
      cancelled = true;
      unsubscribe();
      window.removeEventListener('popstate', onPop);
    };
  }, []);

  useEffect(() => {
    if (role !== 'admin') {
      if (role) clearTestingSession();
      setTestingSessionHydrated(false);
      return;
    }

    const savedTesting = readTestingSession();
    // Restore only explicitly selected Owner QA or public preview, never a role permission grant.
    const testing = savedTesting.mode === 'live' || savedTesting.mode === 'simulation' ? savedTesting : { mode: 'off' as TestingMode, role: null };
    const ownerConsoleRequested = /^\/admin(?:\/|$)/.test(window.location.pathname);

    if (ownerConsoleRequested) {
      setDemoMode(testing.mode === 'demo' || testing.mode === 'simulation');
      setSimulationMode(false);
      setPreviewRole(null);
      setView('admin');
      writeTestingSession(testing.mode === 'off' ? 'off' : 'demo', null);
    } else if (testing.mode === 'live' && testing.role) {
      setDemoMode(false);
      setSimulationMode(false);
      setPreviewRole(testing.role);
      const current = window.location.pathname.replace(/^\/+|\/+$/g, '');
      const home: View = testing.role === 'creator' ? 'creator' : testing.role === 'listener' ? 'discover' : 'creators';
      const allowed = testing.role === 'creator' ? ['creator', 'creators', 'discover'] : testing.role === 'listener' ? ['discover', 'library', 'creators'] : ['creators', 'discover'];
      const destination: View = allowed.includes(current) ? current as View : home;
      if (current !== destination) window.history.replaceState({}, '', '/' + destination);
      setView(destination);
    } else if (testing.mode === 'simulation' && testing.role) {
      setDemoMode(true);
      setSimulationMode(true);
      setPreviewRole(testing.role);
      const restoredView: View = testing.role === 'creator' ? 'creator' : testing.role === 'writer' ? 'writer' : testing.role === 'editor' ? 'editor' : testing.role === 'artist' ? 'artist' : 'discover';
      const restoredPath = restoredView === 'discover' ? '/discover' : '/' + restoredView;
      if (window.location.pathname !== restoredPath) window.history.replaceState({}, '', restoredPath);
      setView(restoredView);
    } else if (testing.mode === 'demo') {
      setDemoMode(true);
      setSimulationMode(false);
      setPreviewRole(null);
    } else {
      setDemoMode(false);
      setSimulationMode(false);
      setPreviewRole(null);
    }
    setTestingSessionHydrated(true);
  }, [role]);

  useEffect(() => {
    if (role !== 'admin' || !testingSessionHydrated) return;
    writeTestingSession(simulationMode ? 'simulation' : demoMode ? 'demo' : previewRole ? 'live' : 'off', previewRole);
  }, [role, testingSessionHydrated, demoMode, simulationMode, previewRole]);

  useEffect(() => {
    if (!user || !ageVerified || !role || role === 'admin') return;
    let cancelled = false;
    void nightjarCommunity.getMyProfile().then((data) => {
      if (cancelled) return;
      const nextProfile = data?.profile;
      if (nextProfile) {
        const preferredRole: PreviewRole = ['listener','creator','writer','editor','artist'].includes(String(role))
          ? role as PreviewRole
          : 'listener';
        const availableRoles: PreviewRole[] = Array.isArray(nextProfile.roles)
          ? nextProfile.roles.filter((item: unknown): item is PreviewRole =>
              typeof item === 'string'
              && ['listener','creator','writer','editor','artist'].includes(item),
            )
          : ['listener'];
        const targetRole: PreviewRole = availableRoles.includes(preferredRole) ? preferredRole : 'listener';
        const mergedProfile = applyProfileRoleDraft(nextProfile, targetRole);
        setProfile(mergedProfile);
        setProfileBaseline(structuredClone(mergedProfile));
        setProfileEditRole(targetRole);
        setShowOnboarding(nextProfile.onboardingComplete !== true && nextProfile.onboardingDeferred !== true && nextProfile.onboardingDismissed !== true);
      } else {
        // New accounts do not have a profiles document yet. Give their blank
        // editor a real baseline so editing enables Save rather than locking it.
        const empty = { ...structuredClone(EMPTY_PROFILE), roles: ['listener'] };
        setProfile(empty);
        setProfileBaseline(structuredClone(empty));
        setProfileEditRole('listener');
        setShowOnboarding(true);
      }
    }).catch(() => { /* A later explicit profile load can retry without losing local edits. */ });
    return () => { cancelled = true; };
  }, [user, ageVerified, role]);

  useEffect(() => {
    if (!user || !ageVerified || (role === 'admin' && !testingSessionHydrated)) return;
    void loadLiveProductData();
    if ((role === 'creator' && accountStatus === 'active') || (canAdmin && !liveRolePreview)) { void loadCreatorDashboard(); void loadProtectedScripts(); }
    if (role === 'writer') void loadWriterScripts();
    if (role === 'editor' && accountStatus === 'active') void loadEditorQueue();
    if (canAdmin) {
      void loadAdminOverview();
      void loadSecurityAlerts();
      void loadAuthenticationEvents();
      void loadAdminApplications();
      void loadAdminCreatorSuggestions();
      void loadAdminReports();
      void loadAdminReviews();
      void loadAdminEditorial();
      void loadPendingImages();
      void loadCommercialControls();
    }
  }, [user, ageVerified, role, accountStatus, currentIntent, previewRole, demoMode, testingSessionHydrated]);

  useEffect(() => {
    const messageRole = role === 'admin' ? previewRole : role;
    const professional = ['creator','writer','editor','artist'].includes(String(messageRole));
    const professionalActive = role === 'admin' || accountStatus === 'active' || demoMode;
    if (!user || !ageVerified || !professional || !professionalActive || liveRolePreview) {
      setMessageUnreadCount(0);
      setMessageNeedsReplyCount(0);
      setMessageAwaitingReplyCount(0);
      return;
    }
    let cancelled = false;
    const refresh = async () => {
      try {
        if (demoMode) {
          if (!cancelled) {
            setMessageUnreadCount(1);
            setMessageNeedsReplyCount(1);
            setMessageAwaitingReplyCount(1);
          }
          return;
        }
        const data = await nightjarMessaging.conversations();
        if (!cancelled) {
          const conversations = data.conversations ?? [];
          const needsReply = conversations.filter((item:any) => item.waitingState === 'awaiting_me').length;
          const awaiting = conversations.filter((item:any) => item.waitingState === 'awaiting_them' && Number(item.waitingHours ?? 0) >= 48).length;
          setMessageUnreadCount(Number(data.unreadCount ?? 0));
          setMessageNeedsReplyCount(needsReply);
          setMessageAwaitingReplyCount(awaiting);
        }
      } catch {
        if (!cancelled) {
          setMessageUnreadCount(0);
          setMessageNeedsReplyCount(0);
          setMessageAwaitingReplyCount(0);
        }
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 30000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [user?.userId, ageVerified, role, accountStatus, previewRole, demoMode, liveRolePreview]);


  // Rehydrate the fictional role-specific profile only after React has enabled demo data.
  // Calling loadProfile synchronously inside startSimulation would use a stale live-mode closure.
  useEffect(() => {
    if (!interactiveRoleTest || !user?.userId || !ageVerified) return;
    void loadProfile(previewRole!);
  }, [interactiveRoleTest, previewRole, user?.userId, ageVerified]);

  const clearToastTimer = () => {
    if (toastTimer.current != null) window.clearTimeout(toastTimer.current);
    toastTimer.current = null;
  };

  const notify = (message: string) => {
    clearToastTimer();
    setToastAction(null);
    setToast(message);
    toastTimer.current = window.setTimeout(() => {
      setToast(null);
      setToastAction(null);
    }, 2800);
  };

  const notifyWithAction = (message: string, label: string, run: () => void | Promise<void>) => {
    clearToastTimer();
    setToast(message);
    setToastAction({ label, run });
    toastTimer.current = window.setTimeout(() => {
      setToast(null);
      setToastAction(null);
    }, 5200);
  };

  const navigate = (nextView: View) => {
    if (nextView === 'admin') setAdminWorkspace('overview');
    setProfileRolesPage(false);
    setAdminPanel(null);
    setAdminPeopleRole(null);
    setLiveRoleMenuOpen(false);
    if (nextView === 'admin' && canAdmin) {
      setPreviewRole(null);
      setSimulationMode(false);
      setRolePicker(false);
    }
    const path = nextView === 'discover' ? '/discover' : '/' + nextView;
    if (window.location.pathname !== path) window.history.pushState({}, '', path);
    setView(nextView);
    setMenuOpen(false);
    scrollNightjarToTop();
  };

  const openAdminWorkspace = (workspace: AdminWorkspace) => {
    if (!canAdmin) return;
    setAdminPanel(null);
    setAdminPeopleRole(null);
    setAdminWorkspace(workspace);
    setMenuOpen(false);
    const path = workspace === 'overview' ? '/admin' : '/admin/workspace/' + workspace;
    if (window.location.pathname !== path) window.history.pushState({}, '', path);
    scrollNightjarToTop();
  };

  useEffect(() => {
    if (!user?.userId) return;
    let cancelled = false;
    let unsubscribeForeground: (() => void) | undefined;

    // Do not silently register or refresh FCM on login. An existing browser
    // permission is not consent to another network registration attempt;
    // device changes are handled explicitly in Notification Preferences.
    void nightjarPush.listenForeground((payload) => {
      const title = payload.data?.title || payload.notification?.title || 'Nightjar update';
      const body = payload.data?.body || payload.notification?.body || '';
      notify(body ? title + ' — ' + body : title);
      // FCM delivers open-app messages to onMessage rather than the background
      // worker. Show an OS notification too so a same-phone test is visible in
      // Android notifications, not just as an in-app toast.
      void nightjarPush.showPhoneNotification(
        title,
        body || 'Open Nightjar to view this update.',
        payload.data?.notificationId,
        payload.data?.route || '/discover',
      ).catch(() => { /* in-app toast remains available if OS alerts are blocked */ });
      void loadNotifications(productLoadEpoch.current);
    }).then((unsubscribe) => {
      if (cancelled) unsubscribe();
      else unsubscribeForeground = unsubscribe;
    }).catch(() => { /* foreground push enhancement remains non-blocking */ });

    const onWorkerMessage = (event: MessageEvent) => {
      if (event.data?.type !== 'NIGHTJAR_PUSH_OPEN') return;
      const url = String(event.data.route ?? '/discover');
      if ((url.startsWith('/discover?') || /^\/people\/[a-zA-Z0-9_-]+/.test(url))) {
        openPublicationNotificationRoute(url);
        return;
      }
      if (url.startsWith('/admin') && canAdmin) {
        navigate('admin');
        if (url.includes('release-moderation')) setModerationOpen(true);
        else if (url === '/admin/workspace/security') setAdminWorkspace('security');
        else {
          const panel = url.split('/')[2]?.split('?')[0];
          if (['approvals','images','reviews','reports','editorial','suggestions','subscriptions'].includes(panel)) {
            setAdminPanel(panel as 'approvals'|'images'|'reviews'|'reports'|'editorial'|'suggestions'|'subscriptions');
          }
        }
        return;
      }
      const route = url.replace(/^\//, '');
      const target = (['discover','library','creators','creator','writer','editor','artist','messages','admin','protection','profile','calendar','settings'].includes(route)
        ? route : 'discover') as View;
      navigate(target);
    };

    navigator.serviceWorker?.addEventListener('message', onWorkerMessage);
    return () => {
      cancelled = true;
      unsubscribeForeground?.();
      navigator.serviceWorker?.removeEventListener('message', onWorkerMessage);
    };
  }, [user?.userId, role]);

  // NIGHTJAR_ROUTE_SCROLL_RESET: reset only after the newly selected route/profile has rendered.
  useEffect(() => {
    scrollNightjarToTop();
  }, [view, publicProfileUserId]);

  const openPublicProfile = (userId: string, initialRole?: string) => {
    if (!userId) return;
    const returnPath = window.location.pathname.startsWith('/people/') ? '/creators' : window.location.pathname;
    const requestedRole = initialRole && ['listener','creator','writer','editor','artist'].includes(initialRole) ? initialRole : null;
    const route = '/people/' + encodeURIComponent(userId) + (requestedRole ? '?role=' + encodeURIComponent(requestedRole) : '');
    window.history.pushState({ nightjarOverlay:'public-profile', returnPath }, '', route);
    setPublicProfileInitialRole(requestedRole);
    setNotificationArtworkFocusId(null);
    setPublicProfileUserId(userId);
    scrollNightjarToTop();
  };

  // The same exact-content route is used by push taps and in-app inbox taps.
  // Untrusted routes cannot leave this origin or open an unapproved screen.
  const openPublicationNotificationRoute = (rawRoute: string) => {
    try {
      const target = new URL(rawRoute, window.location.origin);
      if (target.origin !== window.location.origin) return;
      if (target.pathname === '/discover') {
        const releaseId = target.searchParams.get('release');
        const scriptId = target.searchParams.get('script');
        const valid = (id: string | null) => id && /^[a-zA-Z0-9_-]{1,160}$/.test(id) ? id : null;
        const updateId = target.searchParams.get('update');
        if (updateId && /^[0-9a-f-]{36}$/i.test(updateId)) {
          navigate('discover');
          setCommunityUpdateId(updateId);
          window.history.replaceState({}, '', target.pathname + target.search);
          return;
        }
        if (!valid(releaseId) && !valid(scriptId)) return;
        setFocusedContentReleaseId(valid(releaseId));
        setFocusedContentScriptId(valid(scriptId));
        if (valid(releaseId)) openedContentReleaseRef.current = null;
        navigate('discover');
        window.history.replaceState({}, '', target.pathname + target.search);
        void loadLiveProductData();
        return;
      }
      const person = target.pathname.match(/^\/people\/([a-zA-Z0-9_-]{1,160})$/);
      if (person) {
        const role = target.searchParams.get('role');
        openPublicProfile(person[1], role && ['creator','writer','artist','editor','listener'].includes(role) ? role : undefined);
        setNotificationArtworkFocusId(target.searchParams.get('artwork'));
        window.history.replaceState(window.history.state, '', target.pathname + target.search);
      }
    } catch { /* malformed notification route cannot leave NightJar */ }
  };

  const closePublicProfile = () => {
    const returnPath = typeof window.history.state?.returnPath === 'string' ? window.history.state.returnPath : '/creators';
    window.history.replaceState({}, '', returnPath);
    setPublicProfileUserId(null);
    setPublicProfileInitialRole(null);
    const value = returnPath.replace(/^\/+|\/+$/g, '');
    if (['discover','library','creators','creator','writer','editor','artist','messages','admin','protection','profile','calendar','settings'].includes(value)) setView(value as View);
  };

  const recommendCreator = async (person: PublicDirectoryProfile, selectedRole: ShareableProfileRole) => {
    // The directory contains server-checked public profiles. Never publish
    // fictional simulation identities as links to real member profiles.
    if (demoMode) {
      notify('Simulation profiles cannot be shared outside Nightjar.');
      return;
    }
    let url = publicProfileUrl(window.location.origin, person.userId, selectedRole);
    // Keep existing VA referral tracking. Writer, Editor and Artist sharing
    // must not call the voice-creator-only recommendation backend.
    if (selectedRole === 'creator') {
      try {
        const result = await nightjarReferrals.recommendCreator(person.userId);
        if (typeof result.path === 'string' && result.path.startsWith('/') && !result.path.startsWith('//')) {
          url = window.location.origin + result.path + (result.path.includes('?') ? '&' : '?') + 'role=creator';
        }
      } catch {
        // An unavailable recommendation service must not prevent direct sharing.
      }
    }
    const roleLabel = selectedRole === 'creator' ? 'VA Creator' : selectedRole === 'editor' ? 'Audio Editor'
      : selectedRole === 'writer' ? 'Writer' : 'Artist';
    await shareNightjarProfile({ url, name: person.name, roleLabel, notify });
  };

  useEffect(() => {
    if (accountLoading || !role) return;
    const perspective = role === 'admin' ? (previewRole ?? 'admin') : role;
    const home: View = perspective === 'creator' ? 'creator' : perspective === 'writer' ? 'writer' : perspective === 'editor' ? 'editor' : perspective === 'artist' ? 'artist' : 'discover';
    if ((view === 'admin' && (role !== 'admin' || simulationMode)) ||
        (view === 'creator' && perspective !== 'creator' && perspective !== 'admin') ||
        (view === 'writer' && perspective !== 'writer') ||
        (view === 'editor' && perspective !== 'editor') ||
        (view === 'artist' && perspective !== 'artist') ||
        (view === 'messages' && !['creator','writer','editor','artist'].includes(String(perspective))) ||
        (view === 'library' && perspective !== 'listener')) {
      navigate(home);
    }
  }, [view, role, accountLoading, simulationMode, previewRole]);

  const loadLiveProductData = async () => {
    const epoch = ++productLoadEpoch.current;
    try {
      if (demoMode) {
        setTracks(readDemo('tracks', demoTracks) as Track[]);
        setProfileDirectory([
          ...structuredClone(demoCreators).map((item:any) => ({
            userId:item.userId, role:'creator' as const, name:item.name, handle:item.handle, headline:item.note,
            followerCount:item.followers, avatarInitials:item.initials, favouriteTags:['Atmospheric','Story-led'],
            favouriteCategories:['Audio roleplay'], roleSpecialties:['Character roleplay','Narration'],
            roleAvailability:'Open to collaborations', releaseCount:item.releases, completedCollaborations:4,
            activityBadges:[{id:'published-creator',label:'Published Creator',detail:'Has released work in the Nightjar catalogue.'},{id:'completed-collaborator',label:'Completed Collaborator',detail:'Has completed Nightjar collaborations.'}],
          })),
          { userId:'demo-writer-mara', role:'writer', name:'Mara Bell', handle:'marabell', headline:'Dialogue-first Writer', followerCount:486, avatarInitials:'MB', favouriteTags:['Dialogue-heavy','Story-led'], favouriteCategories:['Erotic romance'], roleSpecialties:['Dialogue','Character development'], roleAvailability:'Open to commissions', publishedWorkCount:3, creditedReleaseCount:2, completedCollaborations:3, activityBadges:[{id:'published-writer',label:'Published Writer',detail:'Has published writing recorded by Nightjar.'},{id:'completed-collaborator',label:'Completed Collaborator',detail:'Has completed Nightjar collaborations.'}] },
          { userId:'demo-editor-sam', role:'editor', name:'Sam Reed', handle:'samreed', headline:'Dialogue, mixing and production polish', followerCount:352, avatarInitials:'SR', favouriteTags:['Sound-rich','Cinematic'], favouriteCategories:['Audio drama'], roleSpecialties:['Dialogue editing','Mixing'], roleAvailability:'Open for bookings', creditedReleaseCount:4, completedCollaborations:5, activityBadges:[{id:'credited-editor',label:'Credited Audio Editor',detail:'Has public Nightjar release credits.'},{id:'frequent-collaborator',label:'Frequent Collaborator',detail:'Five or more completed Nightjar collaborations.'}] },
          { userId:'demo-listener-jamie', role:'listener', name:'Jamie', handle:'jamielistens', headline:'Late-night story listener', followerCount:74, avatarInitials:'JL', favouriteTags:['Atmospheric','Slow-paced'], favouriteCategories:['Romantic story'], roleSpecialties:['Story-first','Atmospheric'], roleAvailability:null, activityBadges:[] },
          { userId:'demo-artist-elara', role:'artist', name:'Elara Finch', handle:'elarafinch', headline:'Atmospheric covers and character illustration', followerCount:219, avatarInitials:'EF', favouriteTags:['Atmospheric','Cinematic'], favouriteCategories:['Fantasy'], roleSpecialties:['Cover artwork','Character illustration','Digital painting'], roleAvailability:'Open for commissions', completedCollaborations:2, activityBadges:[{id:'artist-profile',label:'Human Artist',detail:'Approved Nightjar Artist profile.'}] },
        ] as PublicDirectoryProfile[]);
        setCreatorSpotlightList(structuredClone(demoSpotlights.creators) as Spotlight[]);
        setWriterSpotlightList(structuredClone(demoSpotlights.writers) as Spotlight[]);
        setEditorSpotlightList(structuredClone(demoSpotlights.editors) as Spotlight[]);
        setArtistSpotlightList(structuredClone(demoSpotlights.artists ?? []) as Spotlight[]);
        setListenerSpotlight(structuredClone(demoSpotlights.listener) as Spotlight);
        setSpotlightMeta({ listenerTopSevenCount: 2, listenerSpotlightDay: 3, listenerWeek: 'Demo week' });
        const demoMessages = readDemo('notifications', demoNotifications);
        setNotifications(demoMessages);
        setNotificationUnreadCount(demoMessages.filter((item) => !item.read).length);
        setLiveRecommendations(structuredClone(demoTracks.slice(0, 4)).map((item: any, index: number) => ({ ...item, reason: index === 0 ? 'Because you like cinematic slow-burn stories' : 'Demo recommendation based on your selected preferences' })));
        setLiveTrending(structuredClone(demoTracks.slice(1, 5)));
        setFavouriteReleaseIds(readDemo('favourites', ['demo-release-1','demo-release-2']));
        setFollowingProfileIds(readDemo('following', ['demo-creator-aria','demo-creator-rowan']));
        setReleaseReactions(readDemo('releaseReactions', { 'demo-release-1':'love' }) as Record<string, Exclude<ReleaseReaction,null>>);
        return;
      }
      const [catalogueResponse, directoryResponse, firebaseSpotlightResponse] = await Promise.all([
        nightjarCatalogue.list(),
        nightjarCommunity.listPublicProfiles(),
        nightjarCommunity.spotlightState(),
      ]);
      if (epoch !== productLoadEpoch.current) return;
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
        transcriptAvailable: release.transcriptAvailable === true,
        transcriptLanguage: release.transcriptLanguage ?? 'en',
        transcriptWordCount: Math.max(0, Number(release.transcriptWordCount ?? 0)),
        creatorUserId: release.creatorUserId,
        genre: release.genre ?? '',
        tags: release.tags ?? [],
        tropes: release.tropes ?? [],
        contributors: release.contributors ?? [],
        contentRating: release.contentRating ?? 'adult',
        seriesTitle: release.seriesTitle ?? null,
        episodeNumber: release.episodeNumber ?? null,
        nightjarOriginal: release.nightjarOriginal === true,
        releaseDistribution: release.releaseDistribution ?? 'standard',
        productionNote: release.productionNote ?? null,
        communityLikeCount: Math.max(0, Number(release.communityLikeCount ?? 0)),
        communityLoveCount: Math.max(0, Number(release.communityLoveCount ?? 0)),
        communityReactionCount: Math.max(0, Number(release.communityReactionCount ?? 0)),
        communityCommentCount: Math.max(0, Number(release.communityCommentCount ?? 0)),
        listenCount: Math.max(0, Number(release.listenCount ?? 0)),
        playbackAllowed: typeof release.playbackAllowed === 'boolean' ? release.playbackAllowed : undefined,
        playbackAccessReason: release.playbackAccessReason ?? null,
      })) as Track[];
      setTracks(liveTracks);
      setProfileDirectory((directoryResponse.profiles ?? []).map((item:any) => ({
        userId:String(item.userId),
        role:item.role,
        roles:Array.isArray(item.roles) ? item.roles : [item.role],
        nightjarTeam:item.nightjarTeam === true,
        roleProfiles:item.roleProfiles ?? {},
        name:item.displayName ?? item.name ?? 'Nightjar member',
        handle:item.handle ?? null,
        headline:item.headline ?? null,
        bio:item.bio ?? null,
        followerCount:Number(item.followerCount ?? 0),
        avatarUrl:item.avatarUrl ?? null,
        avatarInitials:item.avatarInitials ?? item.initials ?? null,
        favouriteTags:item.favouriteTags ?? [],
        favouriteCategories:item.favouriteCategories ?? [],
        roleSpecialties:item.roleSpecialties ?? [],
        roleAvailability:item.roleAvailability ?? null,
        releaseCount:Number(item.releaseCount ?? 0),
        publishedWorkCount:Number(item.publishedWorkCount ?? 0),
        creditedReleaseCount:Number(item.creditedReleaseCount ?? 0),
        completedCollaborations:Number(item.completedCollaborations ?? 0),
        activityBadges:item.activityBadges ?? [],
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
      setArtistSpotlightList(spotlights.filter((item: any) => item.kind === 'artist' && item.name).map(mapSpotlight));
      const listener = spotlights.find((item: any) => item.kind === 'listener' && item.name);
      setListenerSpotlight(listener ? mapSpotlight(listener) : null);
      setSpotlightMeta({
        listenerTopSevenCount: Number(firebaseSpotlightResponse.listenerTopSevenCount ?? 0),
        listenerSpotlightDay: firebaseSpotlightResponse.listenerSpotlightDay == null ? null : Number(firebaseSpotlightResponse.listenerSpotlightDay),
        listenerWeek: firebaseSpotlightResponse.listenerWeek ?? null,
      });
      await loadNotifications(epoch);
      if (user) {
        const [recommendationsResponse, trendingResponse, communityState, reactionState, listeningAccessResponse] = await Promise.all([
          nightjarCatalogue.recommendations(currentIntent),
          nightjarCatalogue.trending(),
          nightjarCommunity.state(),
          nightjarEngagement.state(),
          nightjarCommercial.listeningAccess(),
        ]);
        if (epoch !== productLoadEpoch.current) return;
        setLiveRecommendations(recommendationsResponse.recommendations ?? []);
        setLiveTrending(trendingResponse.trending ?? []);
        setFavouriteReleaseIds((communityState.favourites ?? []).map((item: any) => String(item.releaseId)));
        setFollowingProfileIds((communityState.follows ?? []).map((item: any) => String(item.targetUserId ?? item.creatorUserId)).filter(Boolean));
        setReleaseReactions(Object.fromEntries((reactionState.reactions ?? []).map((item) => [String(item.releaseId), item.reaction])) as Record<string, Exclude<ReleaseReaction,null>>);
        setListeningAccess(listeningAccessResponse);
      }
    } catch {
      if (epoch !== productLoadEpoch.current) return;
      setTracks([]);
      setProfileDirectory([]);
      setCreatorSpotlightList([]);
      setWriterSpotlightList([]);
      setEditorSpotlightList([]);
      setArtistSpotlightList([]);
      setListenerSpotlight(null);
      setSpotlightMeta({ listenerTopSevenCount: 0, listenerSpotlightDay: null, listenerWeek: null });
      setNotifications([]);
      setNotificationUnreadCount(0);
      setNotificationsOpen(false);
      setLiveRecommendations([]);
      setLiveTrending([]);
      setListeningAccess(null);
    }
  };

  // Show real deployed-build updates in the bell, not as synthetic Firestore messages.
  // Checking never alters FCM subscriptions or marks a user's activity as read.
  useEffect(() => {
    let mounted = true;
    const check = () => {
      if (document.visibilityState === 'hidden') return;
      void checkNightjarUpdate().then(status => {
        if (mounted) setNightjarUpdate(status.latestBuildId ? status : null);
      }).catch(() => { /* offline is not evidence of a new build */ });
    };
    check();
    const interval = window.setInterval(check, 300000);
    document.addEventListener('visibilitychange', check);
    window.addEventListener('nightjar:update-available', check);
    return () => {
      mounted = false;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('nightjar:update-available', check);
    };
  }, []);

  const installNightjarUpdate = async () => {
    if (nightjarUpdating) return;
    setNightjarUpdating(true);
    try { if (!await applyNightjarSafeUpdate()) { setNightjarUpdating(false); notify('Nightjar is already running the latest available build.'); } }
    catch { setNightjarUpdating(false); notify('Unable to update Nightjar. Check your connection and try again.'); }
  };

  const loadNotifications = async (epoch: number) => {
    if (!nightjarAuth.current()) return;
    try {
      const data = await nightjarNotifications.list();
      if (epoch !== productLoadEpoch.current) return;
      const nextNotifications = data.notifications ?? [];
      setNotifications(nextNotifications);
      setNotificationUnreadCount(Number(data.unreadCount ?? 0));
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
      const personalSpotlight = nextNotifications.find((item: any) => item.type === 'spotlight' && item.spotlightDate === today && item.read !== true);
      if (personalSpotlight && window.sessionStorage.getItem('nightjar_spotlight_notice:' + today + ':' + personalSpotlight.subtype) !== 'shown') {
        window.sessionStorage.setItem('nightjar_spotlight_notice:' + today + ':' + personalSpotlight.subtype, 'shown');
        notify('It’s your Nightjar Spotlight day! ✨ Open Discover to celebrate and share your feature.');
      }
    } catch { /* notifications remain non-blocking */ }
  };

  // Live Owner actions are derived from pending queues, not stale stored
  // messages. Refresh only while the Owner Console is actually in use.
  useEffect(() => {
    if (!user || !ageVerified || role !== 'admin' || simulationMode) return;
    const refresh = () => {
      if (document.visibilityState === 'visible') void loadNotifications(productLoadEpoch.current);
    };
    const interval = window.setInterval(refresh, 180000);
    document.addEventListener('visibilitychange', refresh);
    return () => { window.clearInterval(interval); document.removeEventListener('visibilitychange', refresh); };
  }, [user?.userId, ageVerified, role, simulationMode]);

  const markNotificationRead = async (notification: any) => {
    if (notification?.read === true || notification?.actionRequired === true) return;
    try {
      if (!demoMode) await nightjarNotifications.markRead(String(notification.id));
      setNotifications((items) => {
        const next = items.map((item) => item.id === notification.id ? { ...item, read: true } : item);
        if (demoMode) writeDemo('notifications', next);
        return next;
      });
      setNotificationUnreadCount((count) => Math.max(0, count - 1));
    } catch { /* notification read state is non-critical */ }
  };

  const markAllNotificationsRead = async () => {
    const unread = notifications.filter((item:any) => item.read !== true && item.actionRequired !== true);
    if (!unread.length) return;
    try {
      if (!demoMode) await Promise.all(unread.map((item:any) => nightjarNotifications.markRead(String(item.id))));
      setNotifications((items) => {
        const next = items.map((item:any) => item.actionRequired === true ? item : { ...item, read:true });
        if (demoMode) writeDemo('notifications', next);
        return next;
      });
      setNotificationUnreadCount((count) => Math.max(0, count - unread.length));
      notify('Personal notifications marked as read. Outstanding Administrator reviews remain visible.');
    } catch {
      notify('Some notifications could not be updated.');
    }
  };

  const openNotification = async (item:any) => {
    if ((item.type === 'admin_action' && canAdmin || item.type === 'admin_attention' && canAdmin) && !simulationMode) {
      if (item.type === 'admin_attention') await markNotificationRead(item);
      setNotificationsOpen(false);
      navigate('admin');
      if (item.subtype === 'release_verification' || item.subtype === 'release_submitted') {
        setModerationOpen(true);
      } else if (item.subtype === 'professional_approval') {
        openAdminPanel('approvals');
      } else if (item.subtype === 'image_verification') {
        openAdminPanel('images');
      } else if (item.subtype === 'review_verification') {
        openAdminPanel('reviews');
      } else if (item.subtype === 'report_review') {
        openAdminPanel('reports');
      } else if (item.subtype === 'script_submission' || item.subtype === 'editor_portfolio') {
        openAdminPanel('editorial');
      } else if (item.subtype === 'security_alert') {
        openAdminWorkspace('security');
      } else if (item.subtype === 'creator_suggestion') {
        openAdminPanel('suggestions');
      } else if (item.subtype === 'payment_attention') {
        openAdminPanel('subscriptions');
      }
      return;
    }
    await markNotificationRead(item);
    setNotificationsOpen(false);

    if ((item.type === 'content' && ['new_audio','new_script','new_artwork'].includes(String(item.subtype))) || (item.type === 'follow' && item.subtype === 'new_follower')) {
      openPublicationNotificationRoute(String(item.route ?? ''));
      return;
    }

    if (item.type === 'announcement' && item.updateId) {
      openPublicationNotificationRoute(String(item.route ?? '/discover?update=' + encodeURIComponent(item.updateId)));
      return;
    }

    if (item.type === 'release_submission' && item.releaseId) {
      const releaseId = String(item.releaseId);
      if (!['creator','writer','editor','artist','listener'].includes(String(effectiveRole))) return;
      try {
        if (effectiveRole !== 'creator' && !demoMode) {
          const next = await nightjarAccount.setActiveRole('creator');
          if (next.activeRole !== 'creator') throw new Error('Could not switch to VA Creator.');
          setRole('creator');
        }
        setFocusedReleaseId(releaseId);
        navigate('creator');
        void loadCreatorDashboard();
        window.setTimeout(() => document.getElementById('creator-pipeline')?.scrollIntoView({ behavior:'smooth', block:'start' }), 150);
      } catch {
        notify('Switch to your approved VA Creator workspace to view this submission.');
      }
      return;
    }

    if (item.type === 'spotlight') {
      navigate('discover');
      window.setTimeout(() => {
        const kind = ['creator','writer','editor','artist','listener'].includes(String(item.subtype)) ? String(item.subtype) : null;
        const target = kind ? document.getElementById('spotlight-' + kind) : document.getElementById('daily-spotlights-title');
        target?.scrollIntoView({ behavior:'smooth', block:'start' });
      }, 180);
      return;
    }

    if (item.type === 'message' && item.conversationId && (['creator','writer','editor','artist'].includes(String(effectiveRole)) || role === 'admin')) {
      setMessageConversationId(String(item.conversationId));
      setMessageRecipientUserId(null);
      setMessageCollaborationId(item.collaborationId ? String(item.collaborationId) : null);
      navigate('messages');
      return;
    }

    if ((item.type === 'comment' || item.subtype === 'release_comment' || item.subtype === 'release_reaction') && item.releaseId) {
      const releaseId = String(item.releaseId);
      const track = tracks.find((candidate) => candidate.id === releaseId) ?? {
        id: releaseId,
        title: String(item.releaseTitle ?? 'Published Nightjar work'),
        creator: String(item.creatorName ?? 'Nightjar creator'),
        duration: '—',
        category: 'Published work',
        descriptor: 'Nightjar community discussion.',
      };
      setReviewTrack(track as Track);
      return;
    }

    if (item.type === 'content' && item.subtype === 'release' && item.releaseId) {
      if (effectiveRole === 'creator') {
        navigate('creator');
        window.setTimeout(() => document.getElementById('creator-pipeline')?.scrollIntoView({ behavior:'smooth', block:'start' }), 50);
      } else {
        navigate('discover');
      }
    }
  };


  const shareSpotlight = async (spotlight: Spotlight) => {
    const kindLabel = spotlight.kind === 'creator' ? 'VA Creator' : spotlight.kind === 'editor' ? 'Audio Editor' : spotlight.kind === 'artist' ? 'Artist' : 'Writer';
    const isMySpotlight = Boolean(user?.userId && user.userId === spotlight.targetId && !simulationMode);
    const text = isMySpotlight
      ? `It's my day in the Nightjar Spotlight! ✨ Come celebrate with me and discover my work on Nightjar. #NightjarSpotlight`
      : spotlight.kind === 'listener'
        ? `Today Nightjar is celebrating ${spotlight.name} in our Listener Spotlight. Come meet the people who make this community special. #NightjarSpotlight`
        : `The Nightjar Spotlight belongs to ${spotlight.name} today — our featured ${kindLabel}. Discover and celebrate their work! #NightjarSpotlight`;
    // Shared features lead to the member's lasting public profile.
    const url = spotlight.targetId && spotlight.publicProfile !== false
      ? window.location.origin + '/people/' + encodeURIComponent(spotlight.targetId)
      : window.location.origin + '/discover';
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
      if (demoMode) setCreatorDashboard(readDemo('creatorDashboard', demoCreatorDashboard));
      else {
        const data = await nightjarCatalogue.dashboard();
        setCreatorDashboard({ metrics: data.metrics ?? {}, releases: data.releases ?? [] });
      }
    } catch {
      setCreatorDashboard({ metrics: {}, releases: [] });
    } finally {
      setCreatorDashboardLoading(false);
    }
  };

  // All listeners receive the same backend-qualified counts. Avoid polling the
  // protected catalogue, profile directory and spotlights just for metrics.
  useEffect(() => {
    if (!user?.userId || !ageVerified || demoMode || liveRolePreview || (view !== 'discover' && view !== 'creator')) return;
    let cancelled = false;
    let inFlight = false;
    const refresh = async () => {
      if (cancelled || inFlight || document.visibilityState === 'hidden') return;
      inFlight = true;
      try {
        const result = await nightjarCatalogue.listenCounts();
        if (cancelled) return;
        const counts = new Map((result.counts ?? []).map((entry) => [entry.releaseId, Math.max(0, Number(entry.listens) || 0)]));
        setTracks((current) => current.map((track) => counts.has(track.id)
          ? { ...track, listenCount: counts.get(track.id) }
          : track));
        if (view === 'creator' && (role === 'creator' || role === 'admin')) {
          const dashboard = await nightjarCatalogue.dashboard();
          if (!cancelled) setCreatorDashboard({ metrics: dashboard.metrics ?? {}, releases: dashboard.releases ?? [] });
        }
      } catch {
        // A missing/deploying callable must not break listening or creator tools.
      } finally {
        inFlight = false;
      }
    };
    const onFocus = () => { void refresh(); };
    const onVisibility = () => { if (document.visibilityState === 'visible') void refresh(); };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 60_000);
    window.addEventListener('nightjar:qualified-listen', onFocus);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener('nightjar:qualified-listen', onFocus);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [user?.userId, ageVerified, demoMode, liveRolePreview, view, role]);

  const loadWriterScripts = async () => {
    if (!user) return;
    try {
      const items = demoMode ? readDemo('writerScripts', demoWriterScripts) : (await nightjarScripts.writerScripts()).scripts ?? [];
      setWriterScripts(items);
      setWriterSelected((current: any) => current && items.some((item: any) => item.id === current.id) ? current : items[0] ?? null);
    } catch {
      setWriterScripts([]);
    }
  };

  const loadEditorQueue = async () => {
    if (!user) return;
    try {
      const items = demoMode ? readDemo('editorQueue', demoEditorQueue) : (await nightjarScripts.editorQueue()).queue ?? [];
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
      if (demoMode) {
        setProtectedScripts(readDemo('writerScripts', demoWriterScripts).map((script:any) => ({
          id:script.id,
          title:script.title,
          status:script.status,
          writerName:'Mara Bell',
          accessLevel:'demo',
        })));
      } else {
        const data = await nightjarScripts.protectedCatalogue();
        setProtectedScripts(data.scripts ?? []);
      }
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
        if (!window.location.pathname.startsWith('/admin')) navigate('admin');
        else setView('admin');
        void loadAdminOverview();
        void loadSecurityAlerts();
        return;
      }

      if (data.role === 'creator' || data.role === 'listener' || data.role === 'writer' || data.role === 'editor' || data.role === 'artist') {
        setRole(data.role);
        setAccountStatus(nextStatus);
        setRolePicker(false);
        // Preserve the dedicated My Roles deep link on a fresh PWA/browser load.
        if (/^\/profile\/roles\/?$/.test(window.location.pathname)) {
          setView('profile');
          setProfileRolesPage(true);
        } else {
          const requested = window.location.pathname.split('/')[1] as View;
          const safeViews: View[] = data.role === 'listener' ? ['discover','library','creators','profile','settings','calendar','protection'] : ['discover','library','creators','profile','settings','calendar','protection','messages',data.role];
          if (safeViews.includes(requested)) setView(requested);
          else navigate(data.role === 'creator' ? 'creator' : data.role === 'writer' ? 'writer' : data.role === 'editor' ? 'editor' : data.role === 'artist' ? 'artist' : 'discover');
        }
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
      setAgeProvider(String(data.provider ?? 'didit'));
      setAgeEnvironment(data.environment === 'live' ? 'live' : 'sandbox');
      setAgeProviderVerified(data.providerVerified === true);
      if (data.providerVerified === true) setAgeLaunchUrl(null);
      setAgeProviderStatus(String(data.providerStatus ?? 'NOT_STARTED'));
      setAgeLivePilotAvailable(data.livePilotAvailable === true);
      setAgePilotEligible(data.diditPilotEligible === true);
      setAgeVerifiedAt(data.verifiedAt ?? null);
      setAgeReverifyRequired(data.reverifyRequired === true);
      setAgeTemporaryBypass(data.temporaryBypass === true);
      setAgeTemporaryBypassReason(typeof data.temporaryBypassReason === 'string' ? data.temporaryBypassReason : null);
      setAgeSessionActive(data.sessionActive === true);
      const diditPending = ['PENDING','PROCESSING','IN_PROGRESS','PENDING_REVIEW','CREATING','RESUBMITTED'].includes(String(data.providerStatus ?? data.status));
      setAgeStatus(data.providerVerified === true ? 'COMPLETE'
        : diditPending && data.diditPilotEligible === true ? 'PENDING'
        : verified ? 'COMPLETE'
        : diditPending ? 'PENDING'
        : ['FAIL','ERROR','CANCELLED','EXPIRED','BLOCKED'].includes(String(data.status)) ? 'FAIL' : 'NOT_STARTED');
      if (verified) setAgeStage('app');
      return verified;
    } catch { return false; }
  };

  const openAgeCheck = async (adminPilot = false, memberPilot = false) => {
    setAgeLoading(true);
    try {
      if (!nightjarAuth.current()) { window.location.assign('/account'); return; }
      if (memberPilot) {
        if (!agePilotEligible || role === 'admin' || !ageConfigured || simulationMode || demoMode) {
          notify('Didit is only available to testers explicitly enrolled by a Nightjar administrator.'); return;
        }
        if (ageProviderVerified) { notify('Your Nightjar account is already verified by Didit. No further identity check is required.'); return; }
        if (!agePilotConsent) { notify('Please acknowledge the live ID verification notice first.'); return; }
        if (!window.confirm(
          ageEnvironment === 'live'
            ? 'Start the REAL Didit 18+ ID check for this test account? You may need to show a government ID. A charge may apply to Nightjar. Your existing beta access will remain available.'
            : 'Start the Didit SANDBOX check? This does not count as verified age and your existing beta access remains available.'
        )) return;
      }
      if (adminPilot) {
        if (role !== 'admin' || simulationMode || !ageConfigured) {
          notify('Only approved administrators can start the Didit pilot.'); return;
        }
        if (ageProviderVerified) { notify('Didit already verified this administrator.'); return; }
        if (!window.confirm(
          ageEnvironment === 'live'
            ? 'Start a REAL Didit verification for your administrator account? Provider charges may apply. Existing testers keep their bypass.'
            : 'Start a Didit sandbox pilot check? This should be unbilled ONLY if the configured Didit key and workflow are genuinely sandbox. Existing testers keep their bypass.'
        )) return;
      } else if (!memberPilot) {
        const alreadyVerified = await refreshAgeStatus();
        if (alreadyVerified) { notify('Test access or permanent verification is already active. No paid Didit check was created.'); return; }
      }
      const data = await nightjarAge.start();
      setAgeConfigured(Boolean(data.configured));
      setAgeProvider(String(data.provider ?? 'didit'));
      setAgeEnvironment(data.environment === 'live' ? 'live' : 'sandbox');
      setAgeTemporaryBypass(data.temporaryBypass === true);
      setAgeTemporaryBypassReason(typeof data.temporaryBypassReason === 'string' ? data.temporaryBypassReason : null);
      setAgeSessionActive(Boolean(data.sessionId && !data.verified));
      if (data.verified === true && data.provider === 'didit') {
        await refreshAgeStatus();
        notify('Didit confirmed your existing adult verification.');
      } else if (data.temporaryBypass === true) {
        await refreshAgeStatus();
        notify('Private test access remains active. No verification session was created.');
      } else if (data.launchUrl) {
        setAgeLaunchUrl(String(data.launchUrl));
        setAgeStatus('PENDING');
        const popup = window.open(String(data.launchUrl), '_blank', 'noopener,noreferrer');
        notify(popup ? 'Didit opened. Complete the check, then return to Nightjar.' :
          'Open your Didit session using the button on this page; popups are blocked.');
      }
    } catch (error) {
      notify(error instanceof Error ? 'Didit could not start: ' + error.message : 'Didit could not start verification.');
    } finally { setAgeLoading(false); }
  };

  useEffect(() => {
    if (!user || ageStatus !== 'PENDING') return;
    const timer = window.setInterval(() => { void refreshAgeStatus(); }, 5000);
    return () => window.clearInterval(timer);
  }, [ageStatus, user]);

  const updateDiditPilotAccess = async (enabled: boolean) => {
    if (!canAdmin || simulationMode || demoMode) return;
    const email = diditPilotEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setDiditPilotFeedback('Enter the email address of one registered, verified beta tester.');
      return;
    }
    if (enabled && !window.confirm(
      'Permit ' + email + ' to start a Didit ID-verification pilot voluntarily? This does not remove their beta bypass or start a paid session. The tester must explicitly consent and press Start themselves.'
    )) return;
    setDiditPilotBusy(true);
    setDiditPilotFeedback('');
    try {
      const result = await nightjarAdministration.setDiditPilotAccess(email, enabled);
      setDiditPilotFeedback(result.enabled
        ? 'This registered test account can now start Didit voluntarily. Ask them to refresh Nightjar and open Profile → Account & Support.'
        : 'Didit pilot access disabled for this account. Their existing beta-test access is unchanged.');
    } catch (error) {
      setDiditPilotFeedback(error instanceof Error ? error.message : 'Could not change Didit pilot enrolment.');
    } finally {
      setDiditPilotBusy(false);
    }
  };

  const signIn = async () => {
    window.location.assign('/account?entry=signin');
  };

  const signOut = async () => {
    resetDemo();
    setDemoMode(false);
    setSimulationMode(false);
    setPreviewRole(null);
    await nightjarAuth.signOut();
    clearTestingSession();
    setDemoMode(false);
    setSimulationMode(false);
    setPreviewRole(null);
    setTestingSessionHydrated(false);
    setUser(null);
    setRole(null);
    setAgeVerified(false);
    setAgeStatus('NOT_STARTED');
    setAgeConfigured(false);
    setAgeProvider('didit');
    setAgeEnvironment('sandbox');
    setAgeVerifiedAt(null);
    setAgeReverifyRequired(false);
    setAgeSessionActive(false);
    setAgeProviderVerified(false);
    setAgeProviderStatus('NOT_STARTED');
    setAgeLivePilotAvailable(false);
    setAgeLaunchUrl(null);
    setView('discover');
    setRolePicker(false);
    notify('Signed out of Nightjar.');
  };

  const chooseRole = async (nextRole: Exclude<AccountRole, 'admin'>) => {
    setAccountLoading(true);
    try {
      const data = await nightjarAccount.chooseRole(nextRole);
      const requestedProfessionalRole = data.requestedProfessionalRole ?? null;
      setRole((data.role as AccountRole) ?? 'listener');
      setAccountStatus('active');
      setRolePicker(false);
      navigate('discover');
      if (requestedProfessionalRole) {
        notify(`${roleMeta[requestedProfessionalRole].label} application stored. You can keep using Nightjar as a Listener while it waits for a controlled intake wave.`);
      } else {
        notify('Listener access is ready. Welcome to Nightjar.');
      }
    } catch {
      notify('We could not create this account type. Please try again.');
    } finally {
      setAccountLoading(false);
    }
  };

  const recordProtectionEvent = async (
    eventType: string,
    relatedId = 'protected-script',
    context: Record<string, unknown> = {},
  ) => {
    if (!user) return;
    const summaryByType: Record<string, string> = {
      copy_blocked: 'Protected copy interaction blocked; no clipboard contents were captured.',
      selection_blocked: 'Protected text selection shortcut was blocked inside the manuscript reader.',
      save_page_blocked: 'Browser save-page shortcut was blocked while protected manuscript content was open.',
      print_blocked: 'Keyboard print command blocked while protected manuscript content was open.',
      print_dialog_attempt: 'Browser print flow was invoked while protected manuscript content was open.',
      possible_screenshot_key: 'Possible screenshot key signal observed while protected manuscript content was open. This does not prove that a screenshot was captured.',
      possible_capture_shortcut: 'Possible operating-system capture shortcut was observed while protected manuscript content was open. Browser delivery is best-effort and does not prove capture.',
      native_screenshot_detected: 'Native screenshot callback reported an operating-system screenshot while protected manuscript content was open.',
      native_screen_capture_detected: 'Native screen-capture callback reported active capture while protected manuscript content was open.',
    };
    try {
      if (demoMode) {
        setProtectionEvidence((items:any[]) => [{
          id:'demo-evidence-' + Date.now(),
          eventType,
          relatedId,
          ...context,
          createdAt:new Date().toISOString(),
        }, ...items]);
        return;
      }
      await nightjarProtection.record({
        eventType,
        relatedType: 'script',
        relatedId,
        deviceId: getProtectionDeviceToken(),
        clientPlatform: (navigator as any).userAgentData?.platform ?? navigator.platform ?? 'browser',
        visibilityState: document.visibilityState,
        viewport: window.innerWidth + 'x' + window.innerHeight,
        route: window.location.pathname,
        summary: summaryByType[eventType] ?? 'Protected interaction recorded by Nightjar.',
        ...context,
      });
    } catch { }
  };

  const openProtectedReader = async (scriptId: string) => {
    try {
      if (demoMode) {
        const script = readDemo('writerScripts', demoWriterScripts).find((item:any) => item.id === scriptId);
        if (!script) {
          notify('Demo manuscript could not be found.');
          return;
        }
        setProtectedReaderScript({ script, canReadFull:true, allowCopy:false, allowExport:false, demo:true });
        setProtectedReaderOpen(true);
        void recordProtectionEvent('script_view', scriptId);
        return;
      }
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

  const applyFavouriteState = async (releaseId: string, favourite: boolean) => {
    if (!simulationMode) await nightjarCommunity.setFavouriteRelease(releaseId, favourite);
    setFavouriteReleaseIds((items) => {
      const updated = favourite ? Array.from(new Set([...items, releaseId])) : items.filter((id) => id !== releaseId);
      if (simulationMode) {
        writeDemo('favourites', updated);
        const library = readDemo('library', demoLibrary);
        const release = readDemo('tracks', demoTracks).find((item) => item.id === releaseId);
        const favourites = favourite
          ? [...(library.favourites ?? []).filter((item: any) => item.id !== releaseId), ...(release ? [{ ...release, creatorName: release.creator, favourite: true }] : [])]
          : (library.favourites ?? []).filter((item: any) => item.id !== releaseId);
        writeDemo('library', { ...library, favourites });
      }
      return updated;
    });
  };

  const toggleFavouriteRelease = async (releaseId: string) => {
    try {
      if (demoMode && !simulationMode) {
        notify('Demo data is read-only. Start Listener Simulation to change favourites.');
        return;
      }
      const next = !favouriteReleaseIds.includes(releaseId);
      await applyFavouriteState(releaseId, next);
      notifyWithAction(next ? 'Added to favourites.' : 'Removed from favourites.', 'Undo', async () => {
        try {
          await applyFavouriteState(releaseId, !next);
          notify(next ? 'Favourite removed again.' : 'Favourite restored.');
        } catch {
          notify('Undo could not be completed.');
        }
      });
    } catch {
      notify('Favourite could not be updated.');
    }
  };

  const applyReleaseCommunityCounts = (releaseId: string, summary: { likes?: number; loves?: number; total?: number; comments?: number }) => {
    const patch = (item:any) => item.id === releaseId ? {
      ...item,
      communityLikeCount: Math.max(0, Number(summary.likes ?? item.communityLikeCount ?? 0)),
      communityLoveCount: Math.max(0, Number(summary.loves ?? item.communityLoveCount ?? 0)),
      communityReactionCount: Math.max(0, Number(summary.total ?? item.communityReactionCount ?? 0)),
      communityCommentCount: Math.max(0, Number(summary.comments ?? item.communityCommentCount ?? 0)),
    } : item;
    setTracks((items) => items.map(patch));
    setLiveRecommendations((items) => items.map(patch));
    setLiveTrending((items) => items.map(patch));
  };

  const toggleReleaseReaction = async (releaseId: string, reaction: Exclude<ReleaseReaction, null>) => {
    const listenerPerspective = role === 'listener' || (role === 'admin' && simulationMode && previewRole === 'listener');
    if (!listenerPerspective) return notify('Like and Love reactions are available to Listener accounts.');
    if (demoMode && !simulationMode) return notify('Demo data is read-only. Start Listener Simulation to react.');

    const previous = releaseReactions[releaseId] ?? null;
    const next: ReleaseReaction = previous === reaction ? null : reaction;
    const current = tracks.find((item) => item.id === releaseId)
      ?? liveRecommendations.find((item:any) => item.id === releaseId)
      ?? liveTrending.find((item:any) => item.id === releaseId);
    const previousLikes = Number(current?.communityLikeCount ?? 0);
    const previousLoves = Number(current?.communityLoveCount ?? 0);

    setReleaseReactions((items) => {
      const updated = { ...items };
      if (next) updated[releaseId] = next;
      else delete updated[releaseId];
      if (simulationMode) writeDemo('releaseReactions', updated);
      return updated;
    });

    const optimisticLikes = previousLikes - (previous === 'like' ? 1 : 0) + (next === 'like' ? 1 : 0);
    const optimisticLoves = previousLoves - (previous === 'love' ? 1 : 0) + (next === 'love' ? 1 : 0);
    applyReleaseCommunityCounts(releaseId, {
      likes: optimisticLikes,
      loves: optimisticLoves,
      total: optimisticLikes + optimisticLoves,
    });

    if (simulationMode) return;

    try {
      const result = await nightjarEngagement.setReaction(releaseId, next);
      setReleaseReactions((items) => {
        const updated = { ...items };
        const confirmed = result.reactions?.myReaction ?? null;
        if (confirmed) updated[releaseId] = confirmed;
        else delete updated[releaseId];
        return updated;
      });
      applyReleaseCommunityCounts(releaseId, {
        likes: result.reactions?.likes,
        loves: result.reactions?.loves,
        total: result.reactions?.total,
      });
    } catch {
      setReleaseReactions((items) => {
        const updated = { ...items };
        if (previous) updated[releaseId] = previous;
        else delete updated[releaseId];
        return updated;
      });
      applyReleaseCommunityCounts(releaseId, {
        likes: previousLikes,
        loves: previousLoves,
        total: previousLikes + previousLoves,
      });
      notify('Reaction could not be updated.');
    }
  };

  const applyFollowState = async (targetUserId: string, following: boolean) => {
    if (!simulationMode) await nightjarCommunity.setProfileFollow(targetUserId, following);
    setFollowingProfileIds((items) => {
      const updated = following ? Array.from(new Set([...items, targetUserId])) : items.filter((id) => id !== targetUserId);
      if (simulationMode) writeDemo('following', updated);
      return updated;
    });
  };

  const toggleProfileFollow = async (targetUserId: string) => {
    if (!targetUserId || targetUserId === user?.userId) return;
    try {
      if (demoMode && !simulationMode) {
        notify('Demo data is read-only. Start Simulation to change follows.');
        return;
      }
      const next = !followingProfileIds.includes(targetUserId);
      await applyFollowState(targetUserId, next);
      notifyWithAction(next ? 'Profile followed.' : 'Profile unfollowed.', 'Undo', async () => {
        try {
          await applyFollowState(targetUserId, !next);
          notify(next ? 'Follow removed.' : 'Follow restored.');
        } catch {
          notify('Undo could not be completed.');
        }
      });
    } catch {
      notify('Follow could not be updated.');
    }
  };

  const playReleaseFromCreatorProfile = (release: any) => {
    const track = releaseToTrack(release);
    setTracks((items) => items.some((item) => item.id === track.id) ? items : [...items, track]);
    setCreatorProfileUserId(null);
    togglePlayback(track);
  };

  const togglePlayback = (track: Track) => {
    setTranscriptRequested(null);
    setMomentSeek(null);
    if (hiddenByBoundaries(track, listeningBoundaries)) {
      notify('This recording matches your private listening boundaries. Change them under Discover → My Listening Boundaries to open it.');
      return;
    }
    if (!track.audioAvailable && !track.audioUrl) {
      notify('This release has no playable audio attached yet.');
      return;
    }
    if (track.playbackAllowed === false || track.playbackAccessReason === 'subscription_required') {
      const message = 'A Nightjar subscription is required for work you are not credited on. Your own credited releases remain included for you.';
      if (listeningAccess?.subscriptionUrl) {
        notifyWithAction(message, 'Subscribe', () => { window.location.href = listeningAccess.subscriptionUrl!; });
      } else {
        notify(message + ' Subscription checkout is not connected yet.');
      }
      return;
    }
    setPlaying(playing === track.id ? null : track.id);
  };

  // Public audio notifications highlight the exact published release. Playback
  // always remains behind the existing user-initiated age and entitlement gates.
  useEffect(() => {
    if (view !== 'discover' || !focusedContentReleaseId) return;
    const track = tracks.find(item => item.id === focusedContentReleaseId);
    if (!track || openedContentReleaseRef.current === focusedContentReleaseId) return;
    openedContentReleaseRef.current = focusedContentReleaseId;
    setCatalogueQuery('');
    setCatalogueRating('all');
    setCatalogueDuration('all');
    const timer = window.setTimeout(() => {
      document.getElementById('nightjar-release-' + track.id)?.scrollIntoView({ block:'center', behavior:'smooth' });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [view, focusedContentReleaseId, tracks]);

  const openTranscript = (track: Track) => {
    if (!track.transcriptAvailable && !demoMode) {
      notify('A transcript has not been published for this release yet.');
      return;
    }
    if (track.playbackAllowed === false || track.playbackAccessReason === 'subscription_required') {
      const message = 'A Nightjar subscription is required for work you are not credited on. Your own credited releases remain included for you.';
      if (listeningAccess?.subscriptionUrl) {
        notifyWithAction(message, 'Subscribe', () => { window.location.href = listeningAccess.subscriptionUrl!; });
      } else {
        notify(message + ' Subscription checkout is not connected yet.');
      }
      return;
    }
    setTranscriptRequested(track.id);
    setPlaying(track.id);
  };

  const loadAdminOverview = async () => {
    if (!canAdmin) return;
    setAdminOverviewLoading(true);
    try {
      if (demoMode) {
        const demoAccounts = [
          ...demoCreators.map((item) => ({ userId:item.userId, name:item.name, email:item.handle + '@demo.invalid', handle:item.handle, role:'creator', status:'active' })),
          { userId:'demo-writer-mara', name:'Mara Bell', email:'mara@demo.invalid', handle:'marabell', role:'writer', status:'active' },
          { userId:'demo-writer-ivy', name:'Ivy North', email:'ivy@demo.invalid', handle:'ivynorth', role:'writer', status:'active' },
          { userId:'demo-editor-sam', name:'Sam Reed', email:'sam@demo.invalid', handle:'samreed', role:'editor', status:'active' },
          { userId:'demo-editor-rin', name:'Rin Cole', email:'rin@demo.invalid', handle:'rincole', role:'editor', status:'active' },
          { userId:'demo-listener-jamie', name:'Jamie', email:'jamie@demo.invalid', handle:'jamielistens', role:'listener', status:'active' },
          { userId:'demo-listener-lex', name:'Lex', email:'lex@demo.invalid', handle:'lexlistens', role:'listener', status:'active' },
        ];
        setCommercialOverview(null);
        setAdminOverview(readDemo('adminOverview', {
          people: {
            counts: { listener:18, creator:5, writer:4, editor:3, admin:3 },
            accounts: demoAccounts,
            administrators: [
              { userId:'demo-admin-1', name:'Owner One', email:'owner.one@demo.invalid', role:'admin', status:'active' },
              { userId:'demo-admin-2', name:'Owner Two', email:'owner.two@demo.invalid', role:'admin', status:'active' },
              { userId:'demo-admin-3', name:'Owner Three', email:'owner.three@demo.invalid', role:'admin', status:'active' },
            ],
          },
          testing: {
            closedBeta: true,
            ageAssuranceConfigured: false,
            temporaryAgeBypassEnabled: true,
            approvedTesterCount: 2,
            approvedTesters: [
              { email:'qa.one@demo.invalid', enabled:true },
              { email:'qa.two@demo.invalid', enabled:true },
            ],
          },
          subscriptions: { active:12500, trialing:420, pastDue:86 },
        }));
      } else {
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
      }
    } catch {
      notify('Administrator overview could not be loaded right now.');
    } finally {
      setAdminOverviewLoading(false);
    }
  };

  const loadProfile = async (roleOverride?: PreviewRole | 'admin') => {
    if (!user) return;
    setProfileLoading(true);
    try {
      if (demoMode) {
        const demoProfiles: Record<PreviewRole | 'admin', any> = {
          listener: { displayName:'Jamie', handle:'jamielistens', headline:'Late-night story listener', bio:'Fictional listener profile for Nightjar Simulation Mode.', welcomeMessage:'Here for stories, atmosphere and independent creators.', pronouns:'', avatarInitials:'JL', avatarTone:'plum', avatarUrl:null, favouriteTags:['Atmospheric','Gentle'], favouriteTropes:['Slow burn','Comfort & reassurance'], favouriteCategories:['Romantic story','Audio drama'], roleFocus:['Discovery','Supporting creators'], roleSpecialties:['Late-night','Story-first','Atmospheric'], roleSecondary:['Hidden gems','Series'], roleAvailability:'', roleHeadline:'Late-night listener · Story-first · Atmospheric', listenerCommunityStyle:['Recommendations welcome','Playlist curator','Independent-creator supporter','Series follower'], roleBio:'I come to Nightjar for long-form character stories, atmosphere, slow builds and independent creators I might not find elsewhere.', roleDetailOne:'Long-form character stories, atmosphere and a slow build.', roleDetailTwo:'Always happy to discover smaller independent creators.', publicProfile:true },
          creator: { displayName:'Aria Vale', handle:'ariavale', headline:'Cinematic character-led audio', bio:'Fictional Creator profile for Nightjar Simulation Mode.', welcomeMessage:'Welcome — start with After Midnight.', pronouns:'', avatarInitials:'AV', avatarTone:'plum', avatarUrl:null, favouriteTags:['Cinematic','Atmospheric','After-hours tension'], favouriteTropes:['Slow burn','Mutual pining'], favouriteCategories:['Audio drama','Romantic story'], roleFocus:['Voice performance','Narration','Audio production'], roleSpecialties:['Character roleplay','Narration','Dramatic performance'], roleSecondary:['Close-mic performance','Series work','Remote collaboration'], roleAvailability:'Open to collaborations', roleHeadline:'Cinematic VA · Character-led performance · Intimate delivery', creatorLanguages:['English · UK','Northern English'], creatorDirectionModes:['Self-directed','Live direction','Written direction / notes'], creatorDeliveryFormats:['Raw WAV','Cleaned dialogue','Multiple takes','Pickups included','Series continuity'], creatorTurnaround:'3–5 days', creatorEquipment:'Broadcast-quality home booth · BEACN microphone · remote direction available.', roleBio:'Character-led voice performance with restrained pacing, close-mic intimacy and collaborative production instincts.', roleDetailOne:'Character-led performance with restrained, intimate delivery and cinematic pacing.', roleDetailTwo:'Broadcast-quality home setup with remote direction available.', publicProfile:true },
          writer: { displayName:'Mara Bell', handle:'marabell', headline:'Character-led scripts and collaborative productions', bio:'Fictional Writer profile for Nightjar Simulation Mode.', welcomeMessage:'Scripts, licensing and collaboration live here.', pronouns:'', avatarInitials:'MB', avatarTone:'plum', avatarUrl:null, favouriteTags:['Story-led','Dialogue-heavy'], favouriteTropes:['Forbidden attraction','Second chance'], favouriteCategories:['Romantic story','Sci-fi'], roleFocus:['Script writing','Dialogue writing','Character development'], roleSpecialties:['Dialogue','Character development','Romance'], roleSecondary:['Single-voice script','Series / episodic','Collaborative rewrite'], roleAvailability:'Open to commissions', roleHeadline:'Dialogue-first Writer · Character development · Collaborative scripts', writerScriptLengths:['Short · 500–1,500 words','Medium · 1,500–4,000 words','Series / episodic'], writerCollaborationPreferences:['VA-led commissions','Collaborative outlining','Long-running series','Licensing existing scripts'], writerTurnaround:'1–2 weeks', writerRightsNote:'Open to licensed catalogue work and commissioned originals through protected Nightjar workflows.', roleBio:'I write character-led scripts with strong dialogue, clear emotional progression and enough room for performers to make the work their own.', roleDetailOne:'Dialogue-first scripts with strong character progression and room for performer interpretation.', roleDetailTwo:'Open to licensed catalogue work and creator commissions through protected Nightjar workflows.', publicProfile:true },
          editor: { displayName:'Sam Reed', handle:'samreed', headline:'Dialogue Editor · Restoration · Immersive Audio', bio:'Fictional Audio Editor profile for Nightjar Simulation Mode. Dialogue-first post-production with a clean, natural finish and obsessive attention to the tiny noises nobody notices until they are gone.', welcomeMessage:'Clean edits, clear handoffs, properly credited work.', pronouns:'', avatarInitials:'SR', avatarTone:'plum', avatarUrl:null, favouriteTags:['Sound-rich','Cinematic','Binaural'], favouriteTropes:[], favouriteCategories:['Audio drama','Audio roleplay','ASMR / whisper'], roleFocus:['Audio editing','Dialogue editing','Sound design','Mixing','Mastering'], roleSpecialties:['Dialogue editing','Noise cleanup / restoration','Breath / mouth-click cleanup','Mixing','Mastering','Binaural / spatial production'], roleSecondary:['Series consistency','Detailed notes','Remote handoff','Room-tone repair','Broadcast-ready delivery'], roleAvailability:'Open for bookings', roleHeadline:'Dialogue Editor · Restoration · Immersive Audio', roleBio:'Dialogue-first post-production with a clean, natural finish and obsessive attention to the tiny noises nobody notices until they are gone.', roleDetailOne:'Organised remote handoff, labelled revisions, timestamped notes and non-destructive project delivery. Happy working directly with VAs, writers or an established production team.', roleDetailTwo:'Dialogue-led scenes, binaural work and recurring series are the sweet spot. Difficult recordings are welcome when expectations are agreed before the edit.', editorSoftware:['Reaper','iZotope RX','Adobe Audition'], editorProjectTypes:['Single-voice roleplay','Multi-voice audio drama','ASMR / close-mic audio','Binaural / spatial scenes','Series / episodic production','Restoration / rescue edits'], editorDeliveryFormats:['WAV master','24-bit delivery','48 kHz delivery','Separate stems','Dialogue stem','Loudness-matched master','Platform-ready final'], editorCollaborationPreferences:['VAs / performers','Writers','Long-term series teams','One-off commissions','First-time creators'], editorTurnaround:'3–5 days', editorExperienceYears:6, editorSkillLevels:{'Dialogue editing':'Specialist','Noise cleanup / restoration':'Specialist','Breath / mouth-click cleanup':'Specialist','Mixing':'Experienced','Mastering':'Experienced','Binaural / spatial production':'Experienced'}, publicProfile:true },
          artist: { displayName:'Lena Moss', handle:'lenamoss', headline:'Atmospheric illustration and cover artwork', bio:'Fictional Artist profile for Nightjar Simulation Mode.', welcomeMessage:'Visual storytelling for audio creators, writers and series.', pronouns:'', avatarInitials:'LM', avatarTone:'plum', avatarUrl:null, favouriteTags:['Atmospheric','Cinematic'], favouriteTropes:[], favouriteCategories:['Fantasy','Contemporary romance'], roleFocus:['Illustration','Cover artwork','Character art'], roleSpecialties:['Cover artwork','Character illustration','Digital painting'], roleSecondary:['Atmospheric artwork','Dark / moody artwork','Long-form collaboration'], roleAvailability:'Open for commissions', roleHeadline:'Atmospheric Artist · Covers · Character illustration', artistMediums:['Digital painting','Illustration','Typography'], artistDeliveryFormats:['Cover artwork','Square social artwork','Portrait artwork','Series visual system'], artistTurnaround:'1–2 weeks', artistSoftware:['Procreate','Adobe Photoshop'], roleBio:'Painterly digital illustration with cinematic lighting, strong silhouettes and a focus on artwork that belongs to the world of the audio.', roleDetailOne:'Painterly digital illustration with cinematic lighting and strong character silhouettes.', roleDetailTwo:'Open to cover, character and promotional commissions through Nightjar.', publicProfile:true },
          admin: { displayName:'Nightjar Admin Demo', handle:'nightjardemo', headline:'Administrator demo profile', bio:'Fictional admin-facing profile while Demo Data is enabled.', welcomeMessage:'', pronouns:'', avatarInitials:'NJ', avatarTone:'plum', avatarUrl:null, favouriteTags:[], favouriteTropes:[], favouriteCategories:[], roleFocus:['Platform operations'], roleSpecialties:['Platform operations','Community safety'], roleSecondary:['Testing','Reports'], roleAvailability:'', roleDetailOne:'Owner-console simulation profile.', roleDetailTwo:'', publicProfile:false },
        };
        const demoRole = roleOverride ?? previewRole ?? 'admin';
        const demoProfile = readDemo('profile:' + demoRole, demoProfiles[demoRole]);
        setProfile(demoProfile);
        setProfileBaseline(structuredClone(demoProfile));
        if (demoRole !== 'admin') setProfileEditRole(demoRole);
        setTasteVector([{label:'Atmospheric',weight:0.92},{label:'Slow burn',weight:0.81},{label:'Story-led',weight:0.76},{label:'Cinematic',weight:0.69}]);
        const demoPortfolioOptions = demoRole === 'creator'
          ? demoTracks.filter((item:any)=>item.creatorUserId === 'demo-creator-aria').map((item:any)=>({ id:item.id, type:'release', title:item.title, subtitle:item.category }))
          : demoRole === 'listener'
            ? (readDemo('library', demoLibrary).playlists ?? []).map((item:any)=>({ id:item.id, type:'playlist', title:item.title, subtitle:(item.releaseIds?.length ?? 0) + ' releases' }))
            : demoRole === 'writer'
              ? demoTracks.filter((item:any)=>(item.contributors ?? []).some((credit:any)=>credit.userId === 'demo-writer-mara')).map((item:any)=>({ id:item.id, type:'credit', title:item.title, subtitle:'Writer credit' }))
              : demoRole === 'editor'
                ? demoTracks.filter((item:any)=>(item.contributors ?? []).some((credit:any)=>credit.userId === 'demo-editor-sam')).map((item:any)=>({ id:item.id, type:'credit', title:item.title, subtitle:'Audio Editor credit' }))
                : demoRole === 'artist'
                  ? []
                  : [];
        setProfilePortfolioOptions(demoPortfolioOptions);
        setProfileCompletedCollaborations(demoRole === 'creator' ? 4 : demoRole === 'writer' ? 3 : demoRole === 'editor' ? 5 : demoRole === 'artist' ? 2 : 0);
        return;
      }
      const requestedEditRole: PreviewRole = roleOverride && roleOverride !== 'admin'
        ? roleOverride
        : role && role !== 'admin' && ['listener','creator','writer','editor','artist'].includes(role)
          ? role as PreviewRole
          : 'listener';
      const [profileData, tasteData, tagData, portfolioData] = await Promise.all([
        nightjarCommunity.getMyProfile(),
        nightjarListening.taste().catch(() => ({ vector: [] })),
        nightjarCommunity.profileTagCatalogue().catch(() => ({ tags: [] })),
        nightjarCommunity.getMyProfilePortfolioOptions(requestedEditRole).catch(() => ({ role:requestedEditRole, options: [], completedCollaborations: 0 })),
      ]);
      if (profileData?.profile) {
        const availableRoles: PreviewRole[] = Array.isArray(profileData.profile.roles)
          ? profileData.profile.roles.filter((item: unknown): item is PreviewRole =>
              typeof item === 'string'
              && ['listener','creator','writer','editor','artist'].includes(item),
            )
          : ['listener'];
        const targetRole: PreviewRole = availableRoles.includes(requestedEditRole)
          ? requestedEditRole
          : availableRoles.includes(profileData.profile.activeRole)
            ? profileData.profile.activeRole as PreviewRole
            : 'listener';
        const mergedProfile = applyProfileRoleDraft(profileData.profile, targetRole);
        setProfile(mergedProfile);
        setProfileBaseline(structuredClone(mergedProfile));
        setProfileEditRole(targetRole);
      } else {
        // No saved profile yet: allow the first edit to be persisted.
        const empty = { ...structuredClone(EMPTY_PROFILE), roles: role === 'admin' ? ['admin'] : ['listener'] };
        setProfile(empty);
        setProfileBaseline(structuredClone(empty));
        setProfileEditRole('listener');
      }
      setTasteVector(tasteData.vector ?? []);
      setProfileTagCatalogue(Array.isArray(tagData?.tags) ? tagData.tags : []);
      setProfilePortfolioOptions(Array.isArray(portfolioData?.options) ? portfolioData.options : []);
      setProfileCompletedCollaborations(Number(portfolioData?.completedCollaborations ?? 0));
    } catch { notify('Profile could not be loaded right now.'); }
    finally { setProfileLoading(false); }
  };

  const reviewEditorScript = async (status: string) => {
    if (!editorSelected) return;
    const comment = window.prompt('Editorial note (optional)') ?? '';
    try {
      if (simulationMode) {
        const next = { ...editorSelected, status, lastEditorialComment: comment || editorSelected.lastEditorialComment };
        setEditorSelected(next);
        setEditorQueue((items) => {
          const updated = items.map((item) => item.id === next.id ? next : item);
          writeDemo('editorQueue', updated);
          return updated;
        });
        const scripts = readDemo('writerScripts', demoWriterScripts);
        writeDemo('writerScripts', scripts.map((item: any) => item.id === next.id ? { ...item, status, lastEditorialComment: comment || item.lastEditorialComment } : item));
        notify('Simulation: editorial decision recorded locally.');
      } else {
        const data = await nightjarScripts.review(editorSelected.id, status, comment);
        setEditorSelected(data.script ?? editorSelected);
        await loadEditorQueue();
        notify('Editorial decision recorded.');
      }
    } catch {
      notify('Editorial decision could not be recorded.');
    }
  };

  const finishOnboardingLater = async (draft: any, stepIndex: number, revision: number) => {
    const stored = await nightjarCommunity.pauseOnboarding(draft, stepIndex, revision);
    if (stored.completed) { setShowOnboarding(false); return; }
    const saved = { ...profile, onboardingDismissed:true, onboardingDeferred:true,
      onboardingDraft:{ ...draft, stepIndex }, onboardingDraftRevision:stored.revision };
    setProfile(saved);
    setProfileBaseline(structuredClone(saved));
    setShowOnboarding(false);
    notify('Progress saved to Nightjar. Resume from My Profile on any device.');
  };

  const saveProfile = async () => {
    if (!user || profileLoading) return;
    const invalidHandle = nightjarHandleError(profile.handle);
    if (invalidHandle) {
      setProfileSaveError(invalidHandle);
      notify(invalidHandle);
      return;
    }
    if (!demoMode && profileDirty) {
      const controller = profileCloudDraftRef.current;
      if (!controller || !await controller.flush()) {
        notify('Your profile draft is still syncing, offline, or was changed on another device. Resolve the draft before publishing.');
        return;
      }
    }
    setProfileSaveError('');
    setProfileLoading(true);
    try {
      const capturedProfile = captureProfileRoleDraft({
        ...profile,
        handle: normaliseNightjarHandle(profile.handle),
      }, profileEditRole);
      // Keep unsaved drafts on-screen while the request is in flight.
      setProfile(capturedProfile);
      if (demoMode) {
        if (simulationMode) {
          writeDemo('profile:' + (previewRole ?? profileEditRole), capturedProfile);
          setProfileBaseline(structuredClone(capturedProfile));
          notify('Simulation: profile saved locally for this testing session.');
        } else {
          const message = 'Demo data is read-only. Leave Demo Mode to save your actual Nightjar account.';
          setProfileSaveError(message);
          notify(message);
        }
        return;
      }

      // Save the personal identity and all approved professional drafts in ONE
      // server transaction. Multiple calls used to report "failed" after an
      // earlier role had already saved, and made multi-role profiles fragile.
      const payload = applyProfileRoleDraft(capturedProfile, profileEditRole);
      const result = await nightjarCommunity.saveMyProfile(payload, profileEditRole);
      if (!result?.profile) throw new Error('The server did not confirm your profile save.');

      // A successful callable already includes a Firestore read-back. The
      // additional refresh is optional: an unrelated read outage must not
      // turn a committed save into a false failure.
      const refreshed = await nightjarCommunity.getMyProfile().catch(() => null);
      const mergedProfile = applyProfileRoleDraft(refreshed?.profile ?? result.profile, profileEditRole);
      setProfile(mergedProfile);
      setProfileBaseline(structuredClone(mergedProfile));
      // Clear only the revision we just saved; preserve newer work from other devices.
      if (profileCloudDraftRef.current) {
        try { await profileCloudDraftRef.current.clear(); }
        catch { notify('Your profile is saved, but the private draft cleanup needs another attempt.'); }
      }
      notify('Your Nightjar profile and all approved role details have been saved.');
    } catch (error) {
      const code = typeof error === 'object' && error !== null && 'code' in error
        ? String((error as { code?: unknown }).code ?? '')
        : '';
      const raw = error instanceof Error ? error.message : '';
      const detail = raw.replace(/^Firebase(?:Error)?:\s*/i, '').replace(/\s*\(functions\/[^)]+\)\.?$/, '').trim();
      const message = code.includes('already-exists') ? 'That @handle is already in use. Please try a different one.'
        : code.includes('invalid-argument') ? (detail || 'Check your @handle: use 3–30 letters, numbers, underscores or hyphens.')
        : code.includes('permission-denied') ? (detail || 'This account cannot edit one of the selected roles. Check your approved roles.')
        : code.includes('unauthenticated') ? 'Your sign-in has expired. Sign in again, then save your profile.'
        : code.includes('unavailable') || code.includes('deadline-exceeded') ? 'The profile service is temporarily unavailable. Your changes are still on this page.'
        : detail && !/^(internal|unknown)$/i.test(detail) ? detail
        : 'Profile could not be saved. Your changes are still here; try again.';
      setProfileSaveError(message);
      notify(message);
    } finally {
      setProfileLoading(false);
    }
  };

  const switchProfileEditRole = async (nextRole: PreviewRole) => {
    if (nextRole === profileEditRole) return;
    const availableRoles: PreviewRole[] = (Array.isArray(profile.roles) ? profile.roles : ['listener'])
      .filter((item: unknown): item is PreviewRole =>
        typeof item === 'string'
        && ['listener','creator','writer','editor','artist'].includes(item),
      );
    if (!availableRoles.includes(nextRole)) return;
    if (!demoMode && profileDirty && (!profileCloudDraftRef.current || !await profileCloudDraftRef.current.flush())) {
      notify('Finish syncing your draft or resolve the device conflict before switching roles.');
      return;
    }

    setProfile((current:any) => applyProfileRoleDraft(captureProfileRoleDraft(current, profileEditRole), nextRole));
    setProfileBaseline((current:any) => current ? applyProfileRoleDraft(current, nextRole) : current);
    setProfileEditRole(nextRole);
    scrollNightjarToTop();
    setProfileLoading(true);
    try {
      if (demoMode) {
        const demoPortfolio = nextRole === 'creator'
          ? demoTracks.filter((item:any)=>item.creatorUserId === 'demo-creator-aria').map((item:any)=>({ id:item.id, type:'release', title:item.title, subtitle:item.category }))
          : nextRole === 'listener'
            ? (readDemo('library', demoLibrary).playlists ?? []).map((item:any)=>({ id:item.id, type:'playlist', title:item.title, subtitle:(item.releaseIds?.length ?? 0) + ' releases' }))
            : nextRole === 'writer'
              ? demoTracks.filter((item:any)=>(item.contributors ?? []).some((credit:any)=>credit.userId === 'demo-writer-mara')).map((item:any)=>({ id:item.id, type:'credit', title:item.title, subtitle:'Writer credit' }))
              : nextRole === 'editor'
                ? demoTracks.filter((item:any)=>(item.contributors ?? []).some((credit:any)=>credit.userId === 'demo-editor-sam')).map((item:any)=>({ id:item.id, type:'credit', title:item.title, subtitle:'Audio Editor credit' }))
                : [];
        setProfilePortfolioOptions(demoPortfolio);
        setProfileCompletedCollaborations(nextRole === 'creator' ? 4 : nextRole === 'writer' ? 3 : nextRole === 'editor' ? 5 : nextRole === 'artist' ? 2 : 0);
      } else {
        const portfolioData = await nightjarCommunity.getMyProfilePortfolioOptions(nextRole);
        setProfilePortfolioOptions(Array.isArray(portfolioData?.options) ? portfolioData.options : []);
        setProfileCompletedCollaborations(Number(portfolioData?.completedCollaborations ?? 0));
      }
    } catch {
      setProfilePortfolioOptions([]);
      setProfileCompletedCollaborations(0);
      notify('That role profile could not be loaded right now.');
    } finally {
      setProfileLoading(false);
    }
  };

  const loadSecurityAlerts = async () => {
    if (!canAdmin) return;
    setSecurityAlertsLoading(true);
    try {
      if (demoMode) setSecurityAlerts(readDemo('securityAlerts', demoAdminData.securityAlerts));
      else {
        const data = await nightjarProtection.alerts();
        setSecurityAlerts(data.alerts ?? []);
      }
    } catch { notify('Security alerts could not be loaded.'); }
    finally { setSecurityAlertsLoading(false); }
  };

  const loadAuthenticationEvents = async () => {
    if (!canAdmin) return;
    setAuthenticationEventsLoading(true);
    try {
      if (demoMode) {
        setAuthenticationEvents([
          { id:'demo-auth-1', eventType:'signin_failed', targetEmailMasked:'sa***@example.com', adminTarget:false, firebaseCode:'auth/invalid-credential', clientAttemptId:'DEMO-AUTH-7F2', clientPlatform:'Chrome · Windows', route:'/account', evidenceQuality:'nightjar_client_observed', createdAt:new Date().toISOString() },
          { id:'demo-auth-2', eventType:'closed_beta_signin_denied', targetEmailMasked:'un***@example.com', adminTarget:false, firebaseCode:'closed_beta_not_invited', clientAttemptId:'DEMO-AUTH-7F2', clientPlatform:'Chrome · Windows', route:'/account', evidenceQuality:'nightjar_client_observed', createdAt:new Date(Date.now()-120000).toISOString() },
        ]);
      } else {
        const data = await nightjarAuthSecurity.events();
        setAuthenticationEvents(data.events ?? []);
      }
    } catch {
      notify('Authentication attempt log could not be loaded.');
    } finally {
      setAuthenticationEventsLoading(false);
    }
  };

  const openSecurityAlertEvidence = async (alert: any) => {
    if (!canAdmin || !alert?.id) return;
    setSecurityEvidenceLoading(true);
    try {
      if (demoMode) {
        setSecurityEvidenceReview({
          alert,
          evidence: [
            { id:'demo-sec-1', eventType:'possible_screenshot_key', relatedId:alert.relatedId ?? 'demo-script-1', readerSessionId:'DEMO-RDR-92A', deviceId:'NJ-DV-DEMO-7F2', clientPlatform:'Windows', detectionSource:'keyboard_printscreen', detectionConfidence:'possible', route:'/writer', summary:'Possible screenshot-key signal observed while protected manuscript content was open. This does not prove capture.', createdAt:new Date().toISOString() },
            { id:'demo-sec-2', eventType:'print_blocked', relatedId:alert.relatedId ?? 'demo-script-1', readerSessionId:'DEMO-RDR-92A', deviceId:'NJ-DV-DEMO-7F2', clientPlatform:'Windows', detectionSource:'browser_keyboard', detectionConfidence:'strong', route:'/writer', summary:'Keyboard print command blocked while protected manuscript content was open.', createdAt:new Date(Date.now()-45000).toISOString() },
          ],
        });
      } else {
        const data = await nightjarProtection.alertEvidence(alert.id);
        setSecurityEvidenceReview(data);
      }
    } catch {
      notify('Security evidence could not be loaded.');
    } finally {
      setSecurityEvidenceLoading(false);
    }
  };

  const loadAdminReports = async () => {
    if (!canAdmin) return;
    setAdminPanelLoading(true);
    try {
      if (demoMode) {
        setAdminReports(readDemo('adminReports', demoAdminData.reports));
        setAdminCommunityReports([
          {id:'demo-comment-report',type:'release_comment',snapshotText:'Demo reported comment for moderation.',reason:'Demo comment report',status:'open',createdAt:new Date().toISOString()},
          {id:'demo-message-report',type:'direct_message',snapshotText:'Demo reported professional message.',reason:'Demo message report',status:'open',createdAt:new Date().toISOString()},
        ]);
      } else {
        const [data, communityReports] = await Promise.all([
          nightjarProtection.adminReports(),
          nightjarEngagement.adminReports(),
        ]);
        setAdminReports(data.reports ?? []);
        setAdminCommunityReports(communityReports.reports ?? []);
      }
    } catch { notify('Reports and feedback could not be loaded.'); }
    finally { setAdminPanelLoading(false); }
  };

  const loadAdminReviews = async () => {
    if (!canAdmin) return;
    setAdminPanelLoading(true);
    try {
      if (demoMode) setAdminReviewQueue(readDemo('adminReviews', demoAdminData.reviews));
      else {
        const data = await nightjarReviews.adminQueue();
        setAdminReviewQueue(data.reviews ?? []);
      }
    } catch {
      notify('Review moderation queue could not be loaded.');
    } finally {
      setAdminPanelLoading(false);
    }
  };

  const resolveCommunityReport = async (report:any, decision:'dismiss'|'remove') => {
    if (!canAdmin || !report?.id) return;
    try {
      if (demoMode) {
        setAdminCommunityReports((items:any[]) => items.filter((item:any)=>item.id!==report.id));
      } else {
        await nightjarEngagement.moderateCommunityReport(report.id, decision);
        await loadAdminReports();
      }
      notify(decision === 'remove'
        ? report.type === 'direct_message' ? 'Reported message removed from the private thread.' : 'Reported comment removed.'
        : 'Community report dismissed.');
    } catch {
      notify('Community moderation action could not be completed.');
    }
  };

  const suspendReportedCommunityAccount = async (report:any) => {
    if (!canAdmin || !report?.subjectUserId || !report?.subjectRole || report.subjectRole === 'admin') return;
    const confirmed = window.confirm(
      'Suspend ' + (report.subjectName ?? 'this Nightjar account') + '?\n\n' +
      'This blocks normal account access. The report itself will remain open so you can separately decide whether the reported content should be removed.'
    );
    if (!confirmed) return;

    try {
      if (demoMode) {
        setAdminOverview((current:any) => {
          const updated = {
            ...(current ?? {}),
            people: {
              ...(current?.people ?? {}),
              accounts: (current?.people?.accounts ?? []).map((item:any) =>
                item.userId === report.subjectUserId ? { ...item, status:'suspended' } : item
              ),
            },
          };
          writeDemo('adminOverview', updated);
          return updated;
        });
        notify('Demo reported account suspended locally. The report remains open for content review.');
        return;
      }

      await nightjarAdministration.setAccountRole(
        report.subjectUserId,
        report.subjectRole as 'listener'|'creator'|'writer'|'editor',
        'suspended',
      );
      await loadAdminOverview();
      notify('Reported account suspended. The report remains open for a separate content decision.');
    } catch {
      notify('Reported account could not be suspended.');
    }
  };

  const moderateReleaseReview = async (review: any, decision: 'approved' | 'rejected') => {
    if (!canAdmin || !review?.id) return;
    try {
      if (demoMode) {
        setAdminReviewQueue((items:any[]) => { const updated=items.filter((item:any)=>item.id!==review.id); writeDemo('adminReviews',updated); return updated; });
        notify(decision === 'approved' ? 'Demo review approved locally.' : 'Demo review rejected locally.');
        return;
      }
      await nightjarReviews.moderate(review.id, decision);
      await loadAdminReviews();
      notify(decision === 'approved' ? 'Review approved.' : 'Review rejected.');
    } catch {
      notify('Review moderation action could not be completed.');
    }
  };

  const suspendFromSecurityAlert = async (alert: any) => {
    if (!canAdmin || !alert?.id) return;
    try {
      if (demoMode) {
        setSecurityAlerts((items:any[]) => { const updated=items.map((item:any)=>item.id===alert.id?{...item,status:'actioned'}:item); writeDemo('securityAlerts',updated); return updated; });
        notify('Demo account suspended locally; no live account was changed.');
        return;
      }
      await nightjarProtection.suspend(alert.id);
      await loadSecurityAlerts();
      await loadAdminOverview();
      notify('Account suspended and active protected-reader sessions revoked.');
    } catch { notify('The security action could not be completed.'); }
  };

  const revokeSessionsFromSecurityAlert = async (alert: any) => {
    if (!canAdmin || !alert?.id) return;
    try {
      if (demoMode) {
        setSecurityAlerts((items:any[]) => { const updated=items.map((item:any)=>item.id===alert.id?{...item,sessionsRevoked:true}:item); writeDemo('securityAlerts',updated); return updated; });
        notify('Demo reader sessions revoked locally.');
        return;
      }
      await nightjarProtection.revokeSessions(alert.id);
      await loadSecurityAlerts();
      notify('Protected-reader sessions revoked. The account itself remains active pending review.');
    } catch { notify('Reader sessions could not be revoked.'); }
  };

  const closeSecurityAlertBenign = async (alert: any) => {
    if (!canAdmin || !alert?.id) return;
    const note = window.prompt('Optional review note — why is this activity considered benign?') ?? '';
    try {
      if (demoMode) {
        setSecurityAlerts((items:any[]) => { const updated=items.map((item:any)=>item.id===alert.id?{...item,status:'closed',reviewNote:note}:item); writeDemo('securityAlerts',updated); return updated; });
        notify('Demo security alert closed as benign locally.');
        return;
      }
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
      if (demoMode) {
        setWriterPermissions(readDemo('permissions:' + targetId, [
          { recipientUserId:'demo-creator-aria', allowCopy:false, allowExport:true, expiresAt:null, revokedAt:null },
          { recipientUserId:'demo-editor-sam', allowCopy:true, allowExport:false, expiresAt:null, revokedAt:null },
        ]));
      } else {
        const data = await nightjarScripts.permissions(targetId);
        setWriterPermissions(data.permissions ?? []);
      }
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
      if (simulationMode) {
        setWriterPermissions((items) => { const updated=[...items, { recipientUserId:recipientUserId.trim(), allowCopy, allowExport, expiresAt:expiry.trim() || null, revokedAt:null }]; writeDemo('permissions:' + writerSelected.id,updated); return updated; });
        notify('Simulation: full-script access granted locally.');
        return;
      }
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
      if (simulationMode) {
        setWriterPermissions((items) => { const updated=items.map((item)=>item.recipientUserId===permission.recipientUserId?{...item,revokedAt:new Date().toISOString()}:item); writeDemo('permissions:' + writerSelected.id,updated); return updated; });
        notify('Simulation: full-script access revoked locally.');
        return;
      }
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
      if (demoMode) {
        setProtectionEvidence([{ id:'demo-evidence-1', eventType:'copy_blocked', createdAt:new Date().toISOString() }]);
        setProtectionReports([{ caseId:'DEMO-1042', category:'Feedback / feature request', status:'Closed' }]);
      } else {
        const [evidence, reports] = await Promise.all([nightjarProtection.evidence(), nightjarProtection.reports()]);
        setProtectionEvidence(evidence.evidence ?? []);
        setProtectionReports(reports.reports ?? []);
      }
    } catch { notify('Protection records could not be loaded right now.'); }
  };

  const submitProtectionReport = async () => {
    if (!reportSummary.trim()) return notify('Please describe what happened.');
    try {
      if (demoMode) {
        setProtectionReports((items) => [{ caseId:'DEMO-' + String(Date.now()).slice(-6), category:reportCategory, status:'New', summary:reportSummary }, ...items]);
        setReportSummary('');
        notify('Simulation: report added locally. Nothing was submitted to Nightjar.');
        return;
      }
      const data = await nightjarProtection.submitReport(reportCategory, reportSummary);
      setReportSummary('');
      await loadProtection();
      notify(`Report ${data.report?.caseId ?? ''} submitted.`);
    } catch { notify('We could not submit the report. Please try again.'); }
  };

  const accountLabel = role ? roleMeta[role].label : 'Signed out';
  const effectiveRole: AccountRole | null = role === 'admin' ? (previewRole ?? 'admin') : role;
  const combinedProfileTagOptions = Array.from(new Set([...PROFILE_TAG_OPTIONS, ...profileTagCatalogue]));
  const canAdmin = role === 'admin';
  const canProtection = Boolean(user);
  const simulationIdentity = previewRole === 'listener'
    ? { name: 'Jamie', initials: 'JL', label: 'Listener' }
    : previewRole === 'creator'
      ? { name: 'Aria Vale', initials: 'AV', label: 'Creator' }
      : previewRole === 'writer'
        ? { name: 'Mara Bell', initials: 'MB', label: 'Writer' }
        : previewRole === 'editor'
          ? { name: 'Sam Reed', initials: 'SR', label: 'Audio Editor' }
          : { name: 'Nightjar Admin', initials: 'NJ', label: 'Administrator' };

  const applyRuntimeLogo = (nextLogo: string | null) => {
    // In-app branding is intentionally separate from the fixed PWA/home-screen identity.
    setLogoUrl(nextLogo);
  };

  const loadBranding = async () => {
    try {
      if (demoMode && demoLogoPreviewUrl) {
        applyRuntimeLogo(demoLogoPreviewUrl);
        return;
      }
      const data = await nightjarMedia.getBranding();
      applyRuntimeLogo(data.logoUrl ?? null);
    } catch { /* wordmark fallback remains available */ }
  };

  useEffect(() => {
    const onFocus = () => {
      if (!demoMode) void loadBranding();
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === 'nightjar.branding.version' && !demoMode) void loadBranding();
    };
    window.addEventListener('focus', onFocus);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('storage', onStorage);
    };
  }, [demoMode, demoLogoPreviewUrl]);


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
    if (demoMode) {
      if (demoLogoPreviewUrl?.startsWith('blob:')) URL.revokeObjectURL(demoLogoPreviewUrl);
      const previewUrl = URL.createObjectURL(file);
      setDemoLogoPreviewUrl(previewUrl);
      applyRuntimeLogo(previewUrl);
      notify('Demo logo preview applied locally. Nothing was uploaded or changed in production.');
      return;
    }
    setLogoUploading(true);
    try {
      const dataUrl = await readFileDataUrl(file);
      setPendingLogoPreviewUrl(dataUrl);
      await nightjarMedia.submitImage({ kind: 'brand_logo', dataUrl, contentType: file.type, fileName: file.name });
      await loadPendingImages();
      setAdminPanel('images');
      scrollNightjarToTop();
      notify('Replacement logo uploaded. The preview is shown in Admin; approve it in Image Moderation to make it live.');
    } catch {
      setPendingLogoPreviewUrl(null);
      notify('Logo upload failed.');
    } finally {
      setLogoUploading(false);
    }
  };

  const removeLogo = async () => {
    if (!canAdmin) return;
    if (demoMode) {
      if (demoLogoPreviewUrl?.startsWith('blob:')) URL.revokeObjectURL(demoLogoPreviewUrl);
      setDemoLogoPreviewUrl(null);
      try {
        const data = await nightjarMedia.getBranding();
        applyRuntimeLogo(data.logoUrl ?? null);
      } catch {
        applyRuntimeLogo(null);
      }
      notify('Demo logo preview cleared. Live branding was not changed.');
      return;
    }
    try {
      await nightjarMedia.removeBrandLogo();
      setPendingLogoPreviewUrl(null);
      applyRuntimeLogo(null);
      window.localStorage.setItem('nightjar.branding.version', String(Date.now()));
      notify('Nightjar logo removed.');
    } catch { notify('Logo could not be removed.'); }
  };

  const uploadProfileAvatar = async (file: File) => {
    if (!user || profileImageBusy) return;
    setProfileImageBusy(true);
    try {
      // Decode, downscale, re-encode and strip embedded metadata before any upload.
      // The original full-resolution file never reaches Firebase Storage.
      const resultImage = await optimiseProfileImage(file);
      const sizeNote = formatProfileImageBytes(resultImage.originalBytes) + ' to '
        + formatProfileImageBytes(resultImage.outputBytes);

      if (demoMode) {
        setProfile((current: any) => ({ ...current, pendingAvatarStatus:'pending', pendingAvatarAssetId:'demo-avatar-' + Date.now() }));
        notify('Simulation: photo compressed (' + sizeNote + ') and added to a fictional moderation queue. Nothing was uploaded.');
        return;
      }

      const dataUrl = await readFileDataUrl(resultImage.file);
      const result = await nightjarMedia.submitImage({
        kind: 'profile_avatar',
        dataUrl,
        contentType: resultImage.file.type,
        fileName: resultImage.file.name,
      });
      setProfile((current: any) => ({ ...current, pendingAvatarStatus: result.status, pendingAvatarAssetId: result.assetId }));
      notify('Photo resized and compressed (' + sizeNote + '). Submitted for review; your approved portrait remains live until accepted.');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Profile photo could not be processed. Please try another JPG or PNG.');
    } finally {
      setProfileImageBusy(false);
    }
  };

  const removeProfileImage = async () => {
    setProfileImageBusy(true);
    try {
      if (demoMode) {
        setProfile((current: any) => ({ ...current, avatarUrl:null, avatarAssetId:null, avatarStatus:null, pendingAvatarAssetId:null, pendingAvatarStatus:null }));
        notify('Simulation: profile image removed locally.');
        return;
      }
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
      if (demoMode) setImageModeration(readDemo('imageModeration', demoAdminData.imageModeration));
      else {
        const data = await nightjarMedia.listPending();
        const assets = data.assets ?? [];
        const assetsWithPreviews = await Promise.all(assets.map(async (asset:any) => {
          try {
            const preview = await nightjarMedia.pendingPreview(asset.id);
            return { ...asset, previewUrl: preview.dataUrl, previewError: null };
          } catch {
            return { ...asset, previewUrl: null, previewError: 'Preview unavailable. Do not approve until the image can be viewed.' };
          }
        }));
        setImageModeration(assetsWithPreviews);
        const pendingBrand = assetsWithPreviews.find((asset:any) => asset.kind === 'brand_logo' && asset.previewUrl);
        setPendingLogoPreviewUrl(pendingBrand?.previewUrl ?? null);
      }
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
      if (demoMode) {
        setImageModeration((items:any[]) => { const updated=items.filter((item:any)=>item.id!==asset.id); writeDemo('imageModeration',updated); return updated; });
        notify(decision === 'approved' ? 'Demo image approved locally.' : 'Demo image rejected locally.');
        return;
      }
      const moderationResult = await nightjarMedia.moderate(asset.id, decision, note, decision === 'approved');
      await loadPendingImages();
      if (asset.kind === 'brand_logo') {
        setPendingLogoPreviewUrl(null);
        if (decision === 'approved') {
          if (moderationResult.publicUrl) applyRuntimeLogo(moderationResult.publicUrl);
          else await loadBranding();
        }
        window.localStorage.setItem('nightjar.branding.version', String(Date.now()));
        window.dispatchEvent(new CustomEvent('nightjar:branding-changed'));
      } else {
        await loadBranding();
      }
      await loadProfile();
      notify(asset.kind === 'brand_logo' && decision === 'approved'
        ? 'Nightjar logo approved and applied across the live app.'
        : decision === 'approved'
          ? 'Image approved for public use.'
          : 'Image rejected and its stored image bytes removed.');
    } catch { notify('Image moderation action could not be completed.'); }
  };

  const loadCommercialControls = async () => {
    if (!canAdmin) return;
    setAdminPanelLoading(true);
    try {
      if (demoMode) {
        const data:any = readDemo('commercial', demoAdminData.commercial);
        setCommercialOverview(data);
        setCommercialSettings(data.settings);
        setNightjarPayoutOverview({
          recipients: [
            { userId:'demo-creator-aria', displayName:'Aria Vale', roles:['creator'], pendingNightjars:8, pendingPence:800, clearedNightjars:24, clearedPence:2400, lifetimeNightjars:32, lifetimePence:3200, byRole:{ creator:{ pendingNightjars:8,pendingPence:800,clearedNightjars:24,clearedPence:2400,lifetimeNightjars:32,lifetimePence:3200 } } },
            { userId:'demo-writer-mara', displayName:'Mara Bell', roles:['writer','artist'], pendingNightjars:10, pendingPence:1000, clearedNightjars:18, clearedPence:1800, lifetimeNightjars:28, lifetimePence:2800, byRole:{ writer:{ pendingNightjars:6,pendingPence:600,clearedNightjars:13,clearedPence:1300 }, artist:{ pendingNightjars:4,pendingPence:400,clearedNightjars:5,clearedPence:500 } } },
          ],
          totals:{ pendingNightjars:18,pendingPence:1800,clearedNightjars:42,clearedPence:4200,lifetimeNightjars:60,lifetimePence:6000,outstandingWalletNightjars:37,outstandingWalletLiabilityPence:3700 },
        });
        setAdminOverview((current: any) => ({ ...(current ?? {}), subscriptions: data.subscriptions }));
      } else {
        const [data, giftPayouts] = await Promise.all([
          nightjarCommercial.overview(),
          nightjarGifts.adminPayoutOverview().catch(() => null),
        ]);
        setCommercialOverview(data);
        setCommercialSettings(data.settings);
        setNightjarPayoutOverview(giftPayouts);
        setAdminOverview((current: any) => ({ ...(current ?? {}), subscriptions: data.subscriptions }));
      }
    } catch { notify('Commercial controls could not be loaded.'); }
    finally { setAdminPanelLoading(false); }
  };

  const saveCommercialControls = async () => {
    if (!canAdmin) return;
    setCommercialSaving(true);
    try {
      if (demoMode) {
        writeDemo('commercial', { ...readDemo('commercial', demoAdminData.commercial), settings: commercialSettings });
        notify('Demo commercial assumptions saved locally for this session only.');
        return;
      }
      const data = await nightjarCommercial.save(commercialSettings);
      setCommercialSettings(data.settings);
      await loadCommercialControls();
      notify('Commercial assumptions saved.');
    } catch { notify('Commercial assumptions could not be saved.'); }
    finally { setCommercialSaving(false); }
  };

  const togglePaidCreatorSlot = async (userId: string, active: boolean) => {
    if (!canAdmin || creatorSlotBusyUserId) return;
    setCreatorSlotBusyUserId(userId);
    try {
      if (demoMode) {
        if (active) {
          if (!commercialOverview) {
            notify('Demo Creator capacity is not loaded yet.');
            return;
          }
          const nextPaidCount = commercialOverview.paidCreatorCount + 1;
          const violatesSafeCapacity = nextPaidCount > commercialOverview.safeCreatorCapacity;
          const violatesBankedHeadroom =
            commercialOverview.theoreticalCreatorCapacity - nextPaidCount < commercialSettings.minimumBankedCreatorSlots;
          const violatesStressTest =
            nextPaidCount * commercialOverview.standardMonthlyCreatorRatePence > commercialOverview.stressCreatorCapacityPence;
          if (violatesSafeCapacity || violatesBankedHeadroom || violatesStressTest) {
            notify('Demo safety guard kept this Creator slot banked.');
            return;
          }
        }
        setCommercialOverview((current) => {
          if (!current) return current;
          const creatorSlots = current.creatorSlots.map((creator) => creator.userId === userId ? { ...creator, paidCreatorSlotActive: active } : creator);
          const paidCreatorCount = creatorSlots.filter((creator) => creator.paidCreatorSlotActive).length;
          const plannedCreatorPayoutPence = paidCreatorCount * current.standardMonthlyCreatorRatePence;
          const unusedCreatorCapacityPence = Math.max(0, current.creatorCapacityPence - plannedCreatorPayoutPence);
          const bankedCreatorCapacity = Math.max(0, current.theoreticalCreatorCapacity - paidCreatorCount);
          const safeReleaseSlots = Math.max(0, current.safeCreatorCapacity - paidCreatorCount);
          const creatorBudgetUtilizationPercent = current.creatorCapacityPence > 0 ? Math.round((plannedCreatorPayoutPence / current.creatorCapacityPence) * 10000) / 100 : 0;
          return {
            ...current,
            creatorSlots,
            paidCreatorCount,
            plannedCreatorPayoutPence,
            unusedCreatorCapacityPence,
            growthAndStabilityFundContributionPence: current.coreBusinessFundPence + unusedCreatorCapacityPence,
            bankedCreatorCapacity,
            safeReleaseSlots,
            creatorBudgetUtilizationPercent,
            stressTestPass: plannedCreatorPayoutPence <= current.stressCreatorCapacityPence,
            nextCreatorRecommended: paidCreatorCount + 1 <= current.safeCreatorCapacity
              && Math.max(0, current.theoreticalCreatorCapacity - (paidCreatorCount + 1)) >= commercialSettings.minimumBankedCreatorSlots
              && (paidCreatorCount + 1) * current.standardMonthlyCreatorRatePence <= current.stressCreatorCapacityPence,
          };
        });
        notify(active ? 'Demo paid Creator slot released.' : 'Demo Creator slot returned to the bank.');
        return;
      }
      const data = await nightjarCommercial.setCreatorPaidSlot(userId, active);
      setCommercialOverview(data.overview);
      setCommercialSettings(data.overview.settings);
      notify(active ? 'Paid Creator slot released.' : 'Creator slot returned to the bank.');
    } catch (error: any) {
      notify(error?.message || 'Creator slot could not be changed safely.');
    } finally {
      setCreatorSlotBusyUserId(null);
    }
  };

  const openAdminPeople = (nextRole: 'listener' | 'creator' | 'writer' | 'editor' | 'artist' | 'admin') => {
    if (!canAdmin) return;
    setAdminPanel(null);
    setAdminPeopleRole(nextRole);
    const path = '/admin/people/' + nextRole;
    if (window.location.pathname !== path) window.history.pushState({}, '', path);
    window.scrollTo({top:0,left:0,behavior:'instant'});
  };

  const loadAdminApplications = async () => {
    if (!canAdmin) return;
    setAdminPanelLoading(true);
    try {
      if (demoMode) setAdminApplications(readDemo('adminApplications', demoAdminData.applications));
      else {
        const data = await nightjarAdministration.professionalApplicationBank();
        setAdminApplications(data.applications ?? []);
      }
    } catch {
      notify('Professional approval queue could not be loaded.');
    } finally {
      setAdminPanelLoading(false);
    }
  };

  const loadAdminCreatorSuggestions = async () => {
    if (!canAdmin) return;
    setAdminPanelLoading(true);
    try {
      if (demoMode) {
        setAdminCreatorSuggestions([
          { id:'demo-suggestion-1', creatorName:'Suggested Creator', publicUrl:'https://example.invalid/creator', note:'Strong community recommendation.', submittedByName:'Jamie', submittedByHandle:'jamielistens', status:'new', referralCode:'DEMO-CREATOR' },
        ]);
      } else {
        const data = await nightjarReferrals.adminSuggestions();
        setAdminCreatorSuggestions(data.suggestions ?? []);
      }
    } catch {
      notify('Creator suggestions could not be loaded.');
    } finally {
      setAdminPanelLoading(false);
    }
  };

  const reviewCreatorSuggestion = async (suggestion:any, status:'new'|'contacted'|'invited'|'joined'|'dismissed') => {
    if (!canAdmin || !suggestion?.id) return;
    try {
      if (demoMode) {
        setAdminCreatorSuggestions((items:any[]) => items.map((item:any) => item.id === suggestion.id ? { ...item, status } : item));
      } else {
        await nightjarReferrals.adminReviewSuggestion(suggestion.id, status);
        await loadAdminCreatorSuggestions();
      }
      notify('Creator suggestion updated.');
    } catch {
      notify('Creator suggestion could not be updated.');
    }
  };

  const loadAdminSubscriptions = async () => {
    if (!canAdmin) return;
    setAdminPanelLoading(true);
    try {
      if (demoMode) {
        const commercial:any = readDemo('commercial', demoAdminData.commercial);
        setAdminSubscriptions(readDemo('adminSubscriptions', demoAdminData.subscriptions));
        setCommercialOverview(commercial);
        setCommercialSettings(commercial.settings);
        setAdminOverview((current: any) => ({ ...(current ?? {}), subscriptions: commercial.subscriptions }));
      } else {
        const [ledger, commercial] = await Promise.all([
          nightjarCommercial.subscriptions(),
          nightjarCommercial.overview(),
        ]);
        setAdminSubscriptions(ledger.subscriptions ?? []);
        setCommercialOverview(commercial);
        setCommercialSettings(commercial.settings);
        setAdminOverview((current: any) => ({ ...(current ?? {}), subscriptions: commercial.subscriptions }));
      }
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
      if (demoMode) {
        setAdminScripts(readDemo('adminScripts', demoAdminData.scripts));
      } else {
        const scriptsData = await nightjarScripts.adminScripts();
        setAdminScripts(scriptsData.scripts ?? []);
      }
    } catch {
      notify('Manuscript review queue could not be loaded.');
    } finally {
      setAdminPanelLoading(false);
    }
  };

  const reviewAdminManuscript = async (script: any, decision: 'approved' | 'changes' | 'rejected', note: string) => {
    if (!canAdmin || !script?.id) throw new Error('Administrator permission is required.');
    const nextStatus = decision === 'approved' ? 'Approved' : decision === 'changes' ? 'Revision requested' : 'Rejected';
    if (demoMode) {
      setAdminScripts((items: any[]) => {
        const updated = items.map((item: any) => item.id === script.id ? { ...item, status: nextStatus, lastEditorialComment: note || null } : item);
        writeDemo('adminScripts', updated);
        return updated;
      });
      notify('Demo only: manuscript decision saved locally.');
      return;
    }
    const response = await nightjarScripts.adminReviewScript(script.id, decision, note);
    await loadAdminEditorial();
    notify(decision === 'approved' ? (response.marketplaceVisible ? 'Manuscript approved and marketplace listing is now visible.' : 'Manuscript approved. The Writer can set Marketplace visibility and a synopsis to publish its listing.') : decision === 'changes' ? 'Changes requested. The Writer has been notified.' : 'Manuscript rejected with an explanation for the Writer.');
  };

  const loadAdminProfileTags = async () => {
    if (!canAdmin) return;
    setAdminPanelLoading(true);
    try {
      if (demoMode) {
        setAdminProfileTagThreshold(5);
        setAdminProfileTags([
          { id:'after-hours-tension', label:'After-hours tension', status:'candidate', uniqueCreatorCount:3, source:'creator_custom' },
          { id:'slow-command', label:'Slow command', status:'promoted', uniqueCreatorCount:7, source:'creator_custom' },
          { id:'demo-hidden-tag', label:'Hidden demo tag', status:'hidden', uniqueCreatorCount:2, source:'creator_custom' },
        ]);
      } else {
        const data = await nightjarCommunity.adminProfileTagCatalogue();
        setAdminProfileTags(data.tags ?? []);
        setAdminProfileTagThreshold(data.promotionThreshold ?? 5);
      }
    } catch {
      notify('Custom tag catalogue could not be loaded.');
    } finally {
      setAdminPanelLoading(false);
    }
  };

  const setProfileTagStatus = async (tag: any, status: 'candidate' | 'promoted' | 'hidden') => {
    if (!canAdmin || !tag?.id) return;
    try {
      if (demoMode) {
        setAdminProfileTags((items:any[]) => items.map((item:any) => item.id === tag.id ? { ...item, status } : item));
        notify(`Demo tag set to ${status} locally.`);
        return;
      }
      await nightjarCommunity.adminSetProfileTagStatus(tag.id, status);
      await loadAdminProfileTags();
      notify(status === 'hidden'
        ? 'Tag hidden from the shared Nightjar catalogue.'
        : status === 'promoted'
          ? 'Tag promoted into the shared Nightjar catalogue.'
          : 'Tag returned to candidate status.');
    } catch {
      notify('Tag catalogue status could not be changed.');
    }
  };

  const openAdminPanel = (panel: 'approvals' | 'suggestions' | 'reports' | 'reviews' | 'revenue' | 'subscriptions' | 'economics' | 'editorial' | 'images' | 'tags' | 'branding' | 'live-preview' | 'profile-viewer') => {
    if (!canAdmin) return;
    setAdminPeopleRole(null);
    setLiveRoleMenuOpen(false);
    setView('admin');
    if (previewRole && !simulationMode) setPreviewRole(null);
    if ((panel === 'live-preview' || panel === 'profile-viewer') && demoMode) {
      setSimulationMode(false);
      setPreviewRole(null);
      setDemoMode(false);
      resetDemo();
      productLoadEpoch.current++;
    }
    setAdminPanel(panel);
    if (panel === 'approvals') setAdminApplicationBox('pending');

    const path = '/admin/' + panel;
    if (window.location.pathname !== path) window.history.pushState({}, '', path);
    window.scrollTo({top:0,left:0,behavior:'instant'});
  };

  // Exiting QA simulation is asynchronous. Always load real accounts only
  // after React has completed the transition out of fictional data.
  useEffect(() => {
    if (adminPanel !== 'profile-viewer' || demoMode || !canAdmin) return;
    void loadAdminOverview();
  }, [adminPanel, demoMode, canAdmin]);

  // Load a selected workpage once, including deep links and browser Back/Forward.
  useEffect(() => {
    if (view !== 'admin' || !canAdmin || !adminPanel) return;
    if (adminPanel === 'approvals') void loadAdminApplications();
    if (adminPanel === 'suggestions') void loadAdminCreatorSuggestions();
    if (adminPanel === 'reports') void loadAdminReports();
    if (adminPanel === 'reviews') void loadAdminReviews();
    if (adminPanel === 'subscriptions') void loadAdminSubscriptions();
    if (adminPanel === 'editorial') void loadAdminEditorial();
    if (adminPanel === 'images') void loadPendingImages();
    if (adminPanel === 'tags') void loadAdminProfileTags();
    if (adminPanel === 'revenue' || adminPanel === 'economics') void loadCommercialControls();
  }, [view, canAdmin, adminPanel]);

  const decideCreatorApplication = async (
    application: any,
    decision: 'approved' | 'waitlist' | 'rejected',
    selectedRoles?: ('creator' | 'writer' | 'editor' | 'artist')[],
  ) => {
    if (!canAdmin || !application?.userId) return;
    const requestedRoles: ('creator' | 'writer' | 'editor' | 'artist')[] = Array.isArray(application.requestedRoles)
      ? application.requestedRoles.filter((role:unknown): role is 'creator' | 'writer' | 'editor' | 'artist' => ['creator','writer','editor','artist'].includes(String(role)))
      : [];
    const roles: ('creator' | 'writer' | 'editor' | 'artist')[] = selectedRoles?.length ? selectedRoles : requestedRoles;
    try {
      if (demoMode) {
        setAdminApplications((items:any[]) => {
          const updated=items.map((item:any)=>{
            if(item.id!==application.id) return item;
            if(decision!=='approved') return {...item,status:decision};
            const approvedRoles=Array.from(new Set([...(item.approvedRoles??[]),...roles]));
            const remaining=(item.requestedRoles??[]).filter((role:string)=>!roles.includes(role as 'creator'|'writer'|'editor'|'artist'));
            return {...item,approvedRoles,requestedRoles:remaining,status:remaining.length?'banked':'approved',wave:adminApplicationWave};
          });
          writeDemo('adminApplications',updated);
          return updated;
        });
        notify(decision === 'approved' ? `Demo roles approved for ${adminApplicationWave}.` : `Demo professional application ${decision} locally.`);
        return;
      }
      await nightjarAdministration.reviewProfessionalApplication(
        application.userId,
        decision,
        roles,
        decision === 'approved' ? adminApplicationWave : '',
      );
      await loadAdminApplications();
      await loadAdminOverview();
      notify(decision === 'approved'
        ? `${roles.map((role)=>roleMeta[role].label).join(' + ')} approved for ${adminApplicationWave}.`
        : `Professional application ${decision}.`);
    } catch {
      notify('Professional application decision could not be saved.');
    }
  };

  const retryProfessionalApprovalEmail = async (application: any) => {
    if (!canAdmin || !application?.userId || !application?.approvalEmailEventId) return;
    try {
      const result = await nightjarAdministration.retryProfessionalApprovalEmail(
        application.userId,
        application.approvalEmailEventId,
      );
      await loadAdminApplications();
      notify(result.outcome === 'sent'
        ? 'Professional approval email sent.'
        : 'Email could not be delivered. Check Gmail connection and retry from history.');
    } catch (error: any) {
      notify(error?.message || 'Approval email cannot be retried at this time.');
    }
  };

  const manageAccountProfessions = async (
    account: any,
    approvedRoles: ('creator' | 'writer' | 'editor' | 'artist')[],
    previousRoles: ('creator' | 'writer' | 'editor' | 'artist')[],
  ) => {
    if (!canAdmin || !account?.userId || account.role === 'admin') {
      throw new Error('Administrator access required to manage member professions.');
    }
    if (demoMode) {
      setAdminOverview((current: any) => {
        const accounts = (current?.people?.accounts ?? []).map((item: any) => {
          if (item.userId !== account.userId) return item;
          const roles = ['listener', ...approvedRoles];
          return {
            ...item, roles,
            pendingProfessionalRoles: (item.pendingProfessionalRoles ?? []).filter((role: string) => !approvedRoles.includes(role as 'creator'|'writer'|'editor'|'artist')),
            role: roles.includes(item.role) ? item.role : 'listener',
          };
        });
        const counts = {
          ...(current?.people?.counts ?? {}),
          listener: accounts.filter((item: any) => item.role !== 'admin').length,
          ...Object.fromEntries((['creator', 'writer', 'editor', 'artist'] as const).map(
            (role) => [role, accounts.filter((item: any) => item.roles?.includes(role)).length],
          )),
        };
        const updated = { ...(current ?? {}), people: { ...(current?.people ?? {}), accounts, counts } };
        writeDemo('adminOverview', updated);
        return updated;
      });
      notify('Simulation: multiple professional roles updated locally. No live user was changed.');
      return;
    }

    const result = await nightjarAdministration.manageProfessionalRoles(account.userId, approvedRoles, previousRoles);
    await loadAdminOverview();
    await loadAdminApplications();
    notify(result.addedRoles.length
      ? 'Granted professional access: ' + result.addedRoles.map((role) => roleMeta[role].label).join(', ')
      : result.removedRoles.length
        ? 'Updated professional access. Removed: ' + result.removedRoles.map((role) => roleMeta[role].label).join(', ')
        : 'Professional roles are unchanged.');
  };

  const queueAccountProfessions = async (
    account: any,
    roles: ('creator' | 'writer' | 'editor' | 'artist')[],
  ) => {
    if (!canAdmin || !account?.userId || account.role === 'admin') {
      throw new Error('Administrator access required to queue professional roles.');
    }
    if (demoMode) {
      setAdminOverview((current: any) => {
        const accounts = (current?.people?.accounts ?? []).map((item: any) => {
          if (item.userId !== account.userId) return item;
          const existing = item.pendingProfessionalRoles ?? [];
          const approved = item.roles ?? [];
          return {
            ...item,
            pendingProfessionalRoles: Array.from(new Set([
              ...existing,
              ...roles.filter((role) => !approved.includes(role)),
            ])),
          };
        });
        const updated = { ...(current ?? {}), people: { ...(current?.people ?? {}), accounts } };
        writeDemo('adminOverview', updated);
        return updated;
      });
      notify('Simulation: role suggestions queued locally. No live account changed.');
      return;
    }
    const result = await nightjarAdministration.queueProfessionalRoles(account.userId, roles);
    await loadAdminOverview();
    await loadAdminApplications();
    notify(result.queuedRoles.length
      ? 'Queued for administrator approval: ' + result.queuedRoles.map((role) => roleMeta[role].label).join(', ') + '. Member consent and age checks are still required.'
      : 'These professional roles are already queued or approved.');
  };

  const changeAccountRole = async (account: any, nextRole: 'listener' | 'creator' | 'writer' | 'editor' | 'artist') => {
    if (!canAdmin || !account?.userId) return;
    try {
      if (demoMode) {
        setAdminOverview((current:any) => {
          const accounts = (current?.people?.accounts ?? []).map((item:any) => item.userId === account.userId ? { ...item, role:nextRole } : item);
          const counts = { ...(current?.people?.counts ?? {}) };
          const previousRole = account.role;
          if (previousRole && previousRole !== nextRole && typeof counts[previousRole] === 'number') counts[previousRole] = Math.max(0, counts[previousRole] - 1);
          if (previousRole !== nextRole && typeof counts[nextRole] === 'number') counts[nextRole] += 1;
          const updated = { ...(current ?? {}), people:{ ...(current?.people ?? {}), accounts, counts } };
          writeDemo('adminOverview', updated);
          return updated;
        });
        notify(`Demo account role changed to ${roleMeta[nextRole].label} locally.`);
        return;
      }
      await nightjarAdministration.setAccountWorkspace(account.userId, nextRole);
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
      if (demoMode) {
        setAdminOverview((current:any) => { const updated={ ...(current ?? {}), people:{ ...(current?.people ?? {}), accounts:(current?.people?.accounts ?? []).map((item:any) => item.userId===account.userId?{...item,status:nextStatus}:item) } }; writeDemo('adminOverview',updated); return updated; });
        notify(`Demo account status changed to ${nextStatus.replace('_', ' ')} locally.`);
        return;
      }
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
      if (demoMode) {
        setAdminOverview((current:any) => { const updated={ ...(current ?? {}), people:{ ...(current?.people ?? {}), accounts:(current?.people?.accounts ?? []).map((item:any) => item.userId===account.userId?{...item,testAccess:enabled}:item) } }; writeDemo('adminOverview',updated); return updated; });
        notify(enabled ? 'Demo tester access enabled locally.' : 'Demo tester access removed locally.');
        return;
      }
      await nightjarAdministration.setTestAccess(account.userId, enabled);
      await loadAdminOverview();
      notify(enabled
        ? 'Temporary tester access enabled. This account can use Nightjar while age assurance is not configured.'
        : 'Temporary tester access removed. Normal age assurance requirements apply again.');
    } catch {
      notify('Tester access could not be changed.');
    }
  };

  const changeClosedBetaTester = async (emailValue: string, enabled: boolean) => {
    if (!canAdmin) return;
    const email = emailValue.trim().toLowerCase();
    if (!email) return notify('Enter the tester email address first.');
    try {
      if (demoMode) {
        setAdminOverview((current:any) => {
          const currentTesting = current?.testing ?? {};
          const existing = Array.isArray(currentTesting.approvedTesters) ? currentTesting.approvedTesters : [];
          const approvedTesters = enabled
            ? [...existing.filter((item:any) => String(item.email).toLowerCase() !== email), { email, enabled:true }]
            : existing.filter((item:any) => String(item.email).toLowerCase() !== email);
          const updated = {
            ...(current ?? {}),
            testing: {
              ...currentTesting,
              closedBeta:true,
              temporaryAgeBypassEnabled:true,
              approvedTesters,
              approvedTesterCount:approvedTesters.length,
            },
          };
          writeDemo('adminOverview',updated);
          return updated;
        });
        if (enabled) setAdminTesterEmail('');
        notify(enabled ? 'Demo tester email approved locally.' : 'Demo tester email removed locally.');
        return;
      }
      await nightjarAdministration.setClosedBetaTester(email, enabled);
      if (enabled) setAdminTesterEmail('');
      await loadAdminOverview();
      notify(enabled
        ? 'Tester email approved. They can now create or use a Nightjar account during private testing.'
        : 'Tester email removed. Private Nightjar access and the temporary age bypass are revoked.');
    } catch {
      notify('Tester email access could not be changed.');
    }
  };

  const attachNewWriterArtwork = async (script: any) => {
    if (!writerNewArtworkFile || !script?.id) return script;
    const file = writerNewArtworkFile;
    setWriterNewArtworkFile(null);
    if (simulationMode) {
      return { ...script, pendingArtworkAssetId: 'demo-script-artwork-' + Date.now(), pendingArtworkStatus: 'pending' };
    }
    try {
      const image = await nightjarMedia.submitImage({
        kind: 'script_artwork',
        targetId: script.id,
        fileName: file.name,
        contentType: file.type,
        dataUrl: await readFileDataUrl(file),
      });
      notify('Optional script artwork sent to the administrator image queue.');
      return { ...script, pendingArtworkAssetId: image.assetId, pendingArtworkStatus: 'pending' };
    } catch (error) {
      notify('Manuscript saved, but its optional artwork could not be uploaded: ' + (error instanceof Error ? error.message : 'Please retry from the artwork panel.'));
      return script;
    }
  };

  const createWriterDraft = async () => {
    const title = writerDraftTitle.trim();
    if (!title) return notify('Give the script a working title first.');
    try {
      if (simulationMode) {
        const next = {
          id:'demo-script-' + Date.now(), title, status:'Draft', version:1, content:'',
          lastEditorialComment:null,
          rights:{ copyrightOwner:'Demo Writer', writerRetainsCopyright:true, licenceType:'none', licenceLength:'', adaptationApprovalRequired:true, significantEditsApprovalRequired:true, castingApprovalRequired:false, finalAudioApprovalRequired:false, aiTrainingAllowed:false, commercialUse:false, withdrawalTerms:'' },
          marketplace:{ visibility:'private', synopsis:'', genres:[], tropes:[], commissionPricePence:null, collaborationWanted:false, editorWanted:false },
        };
        const withArtwork = await attachNewWriterArtwork(next);
        setWriterScripts((items) => { const updated = [withArtwork, ...items]; writeDemo('writerScripts', updated); return updated; });
        setWriterSelected(withArtwork);
        setWriterDraftTitle('');
        notify('Simulation: draft created locally.');
        return;
      }
      const data = await nightjarScripts.create(title, '');
      const newScript = await attachNewWriterArtwork(data.script);
      setWriterDraftTitle('');
      await loadWriterScripts();
      setWriterSelected(newScript ?? null);
      if (data.script?.id) await loadWriterPermissions(data.script.id);
      notify('Draft created.');
    } catch {
      notify('The script could not be created.');
    }
  };

  const uploadWriterScript = async (file: File) => {
    const extension = file.name.toLowerCase().split('.').pop() ?? '';
    const allowed = new Set(['txt','md','markdown','rtf','doc','docx','pdf']);
    if (!allowed.has(extension)) {
      notify('Upload TXT, Markdown, RTF, DOC, DOCX or PDF manuscripts.');
      return;
    }
    if (!file.size || file.size > 8 * 1024 * 1024) {
      notify('Manuscript files must be 8 MB or smaller.');
      return;
    }

    const titleFromFile = file.name.replace(/\.[^.]+$/, '').trim() || 'Untitled manuscript';
    const title = writerDraftTitle.trim() || titleFromFile;
    setWriterUploadBusy(true);

    try {
      if (simulationMode) {
        const editableText = ['txt','md','markdown'].includes(extension) ? await file.text() : '';
        const next = {
          id:'demo-uploaded-script-' + Date.now(),
          title,
          status:'Draft',
          access:'Private',
          version:1,
          content:editableText.slice(0,200000),
          sourceFile:{
            fileName:file.name,
            contentType:file.type || 'application/octet-stream',
            sizeBytes:file.size,
            uploadedAt:new Date().toISOString(),
          },
          lastEditorialComment:null,
          rights:{ copyrightOwner:'Demo Writer', writerRetainsCopyright:true, licenceType:'none', licenceLength:'', adaptationApprovalRequired:true, significantEditsApprovalRequired:true, castingApprovalRequired:false, finalAudioApprovalRequired:false, aiTrainingAllowed:false, commercialUse:false, withdrawalTerms:'' },
          marketplace:{ visibility:'private', synopsis:'', genres:[], tropes:[], commissionPricePence:null, collaborationWanted:false, editorWanted:false },
        };
        const withArtwork = await attachNewWriterArtwork(next);
        setWriterScripts((items) => { const updated = [withArtwork, ...items]; writeDemo('writerScripts', updated); return updated; });
        setWriterSelected(withArtwork);
        setWriterDraftTitle('');
        notify('Simulation: manuscript uploaded as a private draft.');
        return;
      }

      const dataUrl = await readFileDataUrl(file);
      const data = await nightjarScripts.upload({
        title,
        fileName:file.name,
        contentType:file.type,
        dataUrl,
      });
      const newScript = await attachNewWriterArtwork(data.script);
      setWriterDraftTitle('');
      await loadWriterScripts();
      setWriterSelected(newScript ?? null);
      if (data.script?.id) await loadWriterPermissions(data.script.id);
      notify('Manuscript uploaded privately. Set rights and marketplace listing details before sending it for administrator review.');
    } catch {
      notify('The manuscript could not be uploaded.');
    } finally {
      setWriterUploadBusy(false);
    }
  };

  const saveWriterScript = async () => {
    if (!writerSelected) return;
    try {
      if (simulationMode) {
        setWriterScripts((items) => { const updated = items.map((item) => item.id === writerSelected.id ? writerSelected : item); writeDemo('writerScripts', updated); return updated; });
        notify('Simulation: script saved locally.');
        return;
      }
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
      if (simulationMode) {
        const next = { ...writerSelected, version: Number(writerSelected.version ?? 1) + 1 };
        setWriterSelected(next);
        setWriterScripts((items) => { const updated = items.map((item) => item.id === next.id ? next : item); writeDemo('writerScripts', updated); return updated; });
        notify('Simulation: manuscript version recorded locally.');
        return;
      }
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
      if (simulationMode) {
        setWriterScripts((items) => { const updated = items.filter((item) => item.id !== writerSelected.id); writeDemo('writerScripts', updated); return updated; });
        setWriterSelected(null);
        setWriterPermissions([]);
        notify('Simulation: manuscript deleted locally.');
        return;
      }
      await nightjarScripts.remove(writerSelected.id);
      setWriterSelected(null);
      setWriterPermissions([]);
      await loadWriterScripts();
      notify('Manuscript deleted.');
    } catch {
      notify('Manuscript could not be deleted.');
    }
  };

  const submitWriterScript = async (): Promise<boolean> => {
    if (!writerSelected || !['Draft', 'Revision requested', 'Rejected'].includes(String(writerSelected.status ?? 'Draft'))) return false;
    try {
      if (simulationMode) {
        const next = { ...writerSelected, status: 'Submitted' };
        setWriterSelected(next);
        setWriterScripts((items) => {
          const updated = items.map((item) => item.id === next.id ? next : item);
          writeDemo('writerScripts', updated);
          return updated;
        });
        notify('Simulation: protected manuscript submitted for administrator review.');
        return true;
      }
      // Always persist unsaved title/text edits from the Writer Studio first.
      // The Rights panel has already persisted the Writer's attestations.
      await nightjarScripts.update(writerSelected.id, {
        title: writerSelected.title,
        content: writerSelected.content ?? '',
      });
      const result = await nightjarScripts.submit(writerSelected.id);
      if (result.script?.status !== 'Submitted') {
        notify('NightJar did not confirm submission. Check your manuscript status before retrying.');
        return false;
      }
      setWriterSelected(result.script);
      await loadWriterScripts();
      notify('Manuscript submitted directly to NightJar administrators. Your full work remains private.');
      return true;
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Submission could not be completed. Review the saved manuscript and rights declarations.');
      return false;
    }
  };

  const disableDemoMode = () => {
    if (!canAdmin) return;
    if (demoLogoPreviewUrl?.startsWith('blob:')) URL.revokeObjectURL(demoLogoPreviewUrl);
    setDemoLogoPreviewUrl(null);
    setSimulationMode(false);
    setDemoMode(false);
    productLoadEpoch.current++;
    resetDemo();
    setPreviewRole(null);
    navigate('admin');
    void nightjarMedia.getBranding().then((data) => applyRuntimeLogo(data.logoUrl ?? null)).catch(() => applyRuntimeLogo(null));
    notify('Demo and simulation data disabled. Nightjar is showing live records again.');
  };

  const startSimulation = (next: PreviewRole = 'listener') => {
    if (!canAdmin) return;
    if (!demoMode) { resetDemo(); productLoadEpoch.current++; }
    setDemoMode(true);
    setSimulationMode(true);
    setPreviewRole(next);
    setRolePicker(false);
    setModerationOpen(false);
    setAdminPanel(null);
    setAdminPeopleRole(null);
    setProtectedReaderOpen(false);
    setProtectedReaderScript(null);
    setPlaying(null);
    setReviewTrack(null);
    setMessageRecipientUserId(null);
    setMessageCollaborationId(null);
    setCreatorProfileUserId(null);
    setPublicProfileUserId(null);
    setNotificationsOpen(false);
    if (next === 'creator') navigate('creator');
    else if (next === 'listener') navigate('discover');
    else if (next === 'writer') navigate('writer');
    else if (next === 'editor') navigate('editor');
    else if (next === 'artist') navigate('artist');
    else navigate('profile');
    notify(`Testing ${roleMeta[next].label} workflows with local fictional records. No real account was impersonated.`);
  };

  const stopSimulation = () => {
    if (!canAdmin) return;
    disableDemoMode();
  };

  const resetSimulation = () => {
    if (!canAdmin || !demoMode) return;
    resetDemo();
    setDemoSessionKey((value) => value + 1);
    setPlaying(null);
    setReviewTrack(null);
    setCreatorProfileUserId(null);
    setPublicProfileUserId(null);
    setWriterPermissions([]);
    setWriterSelected(null);
    setEditorSelected(null);
    setProfile((current:any) => ({ ...current, displayName:'', handle:'', headline:'', bio:'', welcomeMessage:'', avatarUrl:null, pendingAvatarAssetId:null, pendingAvatarStatus:null, favouriteTags:[], favouriteTropes:[], favouriteCategories:[], roleFocus:[], roleSpecialties:[], roleSecondary:[], roleAvailability:'', roleHeadline:'', roleBio:'', roleDetailOne:'', roleDetailTwo:'', portfolioNote:'', featuredPortfolioIds:[], editorSoftware:[], editorProjectTypes:[], editorDeliveryFormats:[], editorCollaborationPreferences:[], editorTurnaround:'', editorExperienceYears:'', editorSkillLevels:{} }));
    setProfileTagCatalogue([]);
    void loadLiveProductData();
    void loadCreatorDashboard();
    void loadWriterScripts();
    void loadEditorQueue();
    void loadAdminOverview();
    void loadProfile();
    notify('Demo / simulation state reset to the original fictional dataset.');
  };

  // No account impersonation or role grant. Display public live data under
  // the signed-in administrator's identity with interactions disabled.
  const selectPreviewRole = (next: PreviewRole) => {
    if (!canAdmin) return;
    if (demoMode) { resetDemo(); productLoadEpoch.current++; }
    setDemoMode(false);
    setSimulationMode(false);
    setPreviewRole(next);
    setRolePicker(false);
    setAdminPanel(null);
    setAdminPeopleRole(null);
    setModerationOpen(false);
    setPlaying(null);
    setReviewTrack(null);
    setProtectedReaderOpen(false);
    setProtectedReaderScript(null);
    setCreatorProfileUserId(null);
    setPublicProfileUserId(null);
    setMessageRecipientUserId(null);
    setMessageConversationId(null);
    setMessageCollaborationId(null);
    setNotificationsOpen(false);
    setCommandOpen(false);
    const destination: View = next === 'creator' ? 'creator' : next === 'listener' ? 'discover' : 'creators';
    navigate(destination);
    notify('Viewing real Nightjar public content as ' + roleMeta[next].label + ' · read only.');
  };

  const openLiveMemberProfile = (userId?: string) => {
    if (!canAdmin) return;
    setAdminProfileViewerUserId(userId ?? null);
    openAdminPanel('profile-viewer');
  };

  const clearAdminPreview = () => {
    if (!canAdmin) return;
    setDemoMode(false);
    setSimulationMode(false);
    setPreviewRole(null);
    navigate('admin');
    void loadAdminOverview();
    notify('Returned to Administrator view.');
  };

  if (sessionHydrating) {
    return <main className="access-shell" role="status" aria-live="polite">
      <section className="access-card nj-launch-unlock-waiting">
        <span className="brand-lockup"><img className="brand-logo" src={logoUrl ?? "/brand-logo"} alt="Nightjar"/> NIGHTJAR</span>
        <p className="access-lede">Restoring your secure session and checking account access…</p>
      </section>
    </main>;
  }

  if (ageStage === 'gate') {
    return (
      <main className="access-shell">
        <div className="access-glow access-glow-one" />
        <div className="access-glow access-glow-two" />
        <section className="access-card" aria-labelledby="nightjar-access-title">
          <div className="access-topline">
            <span className="brand-lockup"><img className="brand-logo" src={logoUrl ?? "/brand-logo"} alt="Nightjar"/><span>NIGHTJAR</span></span>
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
            <div><ShieldCheck size={18} /><div><strong>Adults only</strong><span>Nightjar remains an 18+ product. Approved QA accounts can use restricted temporary test access until the production age-assurance provider is live.</span></div></div>
            <div><Headphones size={18} /><div><strong>Audio first</strong><span>Built around voice, atmosphere and headphone immersion.</span></div></div>
          </div>
          {sessionRestoreError && user && <div className="access-note" role="alert">Your Nightjar session is still saved, but we could not reconnect securely. Check your connection and retry without entering your password again.</div>}
          {sessionRestoreError && user ? <button type="button" className="primary-button wide-button" disabled={accountLoading} onClick={() => { setSessionHydrating(true); setSessionRestoreError(false); void (async()=>{try { await loadAccount(); const verified=await refreshAgeStatus(); if(!verified)setAgeStage('assurance'); } catch {setSessionRestoreError(true);} finally {setSessionHydrating(false);} })(); }}>Retry session <RefreshCw size={17}/></button> :
          <button className="primary-button wide-button" disabled={accountLoading} onClick={() => void signIn()}>
            {accountLoading ? 'Opening secure sign-in…' : 'Sign in to Nightjar'} <ArrowRight size={17} />
          </button>}
          <p className="access-fine">Testing build: age assurance is not globally bypassed. Only owner accounts and explicitly approved testers can use temporary QA access.</p>
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
              <strong>{ageTemporaryBypass ? 'Nightjar Private Test Access' : 'Didit Age Verification'}</strong>
              <span>
                {ageTemporaryBypass
                  ? `Approved QA account · temporary age-assurance bypass active${ageTemporaryBypassReason === 'administrator' ? ' for an administrator' : ''}. This is not a completed Didit verification and automatically stops working when test bypass mode is disabled.`
                  : ageVerified
                    ? `Verified on this Nightjar account${ageVerifiedAt ? ' · ' + new Date(ageVerifiedAt).toLocaleDateString('en-GB') : ''}. Future logins use this stored verification state.`
                    : ageSessionActive
                      ? 'A verification session is in progress. Finish it and return to Nightjar; the account state will update automatically.'
                      : ageConfigured
                        ? `Secure ${ageEnvironment} provider connected and ready for a verification session.`
                        : 'Verification integration is ready; provider credentials still need to be added.'}
              </span>
            </div>
            <span className="status-pill">{ageTemporaryBypass ? 'TEST ACCESS' : ageVerified ? 'VERIFIED' : ageStatus === 'PENDING' ? 'PENDING' : ageConfigured ? 'READY' : 'SETUP REQUIRED'}</span>
          </div>
          <div className="verification-list">
            {ageTemporaryBypass
              ? <div><ShieldCheck size={16} /><span>This email is on Nightjar's private tester allowlist; temporary QA access is separate from production age verification.</span></div>
              : <div><Check size={16} /><span>Adult access is checked before the catalogue is released.</span></div>}
            <div><Check size={16} /><span>{ageTemporaryBypass ? 'No raw identity documents or fake verification result are created for this bypass.' : 'Verification is stored against your Nightjar account, not repeated on each login or device.'}</span></div>
            <div><Check size={16} /><span>{ageTemporaryBypass ? 'Removing this email from the tester allowlist revokes the bypass immediately.' : 'Nightjar stores verification state and an opaque reference rather than raw identity documents.'}</span></div>
            {ageReverifyRequired && !ageTemporaryBypass && <div><ShieldCheck size={16} /><span>A fresh verification is currently required before adult access can continue.</span></div>}
          </div>
          <button className="primary-button wide-button" disabled={ageLoading || (ageVerified && !ageReverifyRequired)} onClick={() => void openAgeCheck()}>
            {ageLoading ? 'Opening secure check…' : ageTemporaryBypass ? 'Private test access active' : ageVerified && !ageReverifyRequired ? 'Age verified — continue' : ageReverifyRequired ? 'Repeat age verification' : 'Open secure age check'} <LockKeyhole size={16} />
          </button>
          <p className="access-fine">{ageTemporaryBypass ? 'Testing only: this account has controlled QA access while production age assurance is unavailable. It has not been marked as Didit verified.' : 'Adult catalogue access is granted only after a verified age-assurance result.'}</p>
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
            Every Nightjar account includes Listener access. Approved professional roles can be combined on the same account, and you can switch between your VA Creator, Writer, Audio Editor and Artist workspaces.
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
                  <div><span className="role-kicker">VA CREATOR</span><h2>Apply as a VA Creator</h2><p>Your application is banked until Mike and Megs open a controlled intake wave. Listener access remains available immediately.</p></div>
                  <button className="primary-button" disabled={accountLoading} onClick={() => void chooseRole('creator')}>Store VA application <ArrowRight size={15} /></button>
                </article>
                <article className="role-card">
                  <span className="role-icon"><FileText size={20} /></span>
                  <div><span className="role-kicker">WRITER</span><h2>Apply as a Writer</h2><p>Apply for protected writing, commissions and collaboration without creating a second account.</p></div>
                  <button className="secondary-button" disabled={accountLoading} onClick={() => void chooseRole('writer')}>Store Writer application <ArrowRight size={15} /></button>
                </article>
                <article className="role-card">
                  <span className="role-icon"><FileCheck2 size={20} /></span>
                  <div><span className="role-kicker">AUDIO EDITOR</span><h2>Apply as an Audio Editor</h2><p>Apply for production and editorial access. Approval is released only when Nightjar has capacity.</p></div>
                  <button className="secondary-button" disabled={accountLoading} onClick={() => void chooseRole('editor')}>Store Editor application <ArrowRight size={15} /></button>
                </article>
                <article className="role-card">
                  <span className="role-icon"><ImagePlus size={20} /></span>
                  <div><span className="role-kicker">ARTIST</span><h2>Apply as an Artist</h2><p>Apply to offer real visual artwork, commissions and collaboration to Nightjar creators.</p></div>
                  <button className="secondary-button" disabled={accountLoading} onClick={() => void chooseRole('artist')}>Store Artist application <ArrowRight size={15} /></button>
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

  const creatorOnly = effectiveRole === 'creator' && !liveRolePreview;
  const updateSimulatedRelease = (release: any | null, deletedId?: string) => {
    if (!simulationMode) return;
    const current = readDemo('creatorDashboard', demoCreatorDashboard);
    const releases = deletedId
      ? current.releases.filter((item: any) => item.id !== deletedId)
      : release ? [...current.releases.filter((item: any) => item.id !== release.id), release] : current.releases;
    const next = { ...current, releases };
    writeDemo('creatorDashboard', next);
    setCreatorDashboard(next);
  };
  const adminOnly = canAdmin && !simulationMode && !liveRolePreview;

  const persistDirectoryViews = (views:any[]) => {
    setSavedDirectoryViews(views);
    if (!user?.userId) return;
    try { window.localStorage.setItem('nightjar.directory.views:' + user.userId, JSON.stringify(views)); } catch { /* local preference storage is optional */ }
  };
  const saveDirectoryView = () => {
    const parts = [
      directoryRoleFilter !== 'all' ? roleMeta[directoryRoleFilter].label : 'All roles',
      directoryTagFilter !== 'all' ? directoryTagFilter : '',
      directoryAvailabilityFilter !== 'all' ? directoryAvailabilityFilter : '',
      directoryQuery.trim() ? '“' + directoryQuery.trim() + '”' : '',
    ].filter(Boolean);
    const next = {
      id:'view-' + Date.now().toString(36),
      name:parts.join(' · '),
      query:directoryQuery,
      role:directoryRoleFilter,
      tag:directoryTagFilter,
      availability:directoryAvailabilityFilter,
    };
    persistDirectoryViews([next,...savedDirectoryViews].slice(0,8));
    notify('Directory view saved on this device.');
  };
  const applyDirectoryView = (saved:any) => {
    setDirectoryQuery(saved.query ?? '');
    setDirectoryRoleFilter(saved.role ?? 'all');
    setDirectoryTagFilter(saved.tag ?? 'all');
    setDirectoryAvailabilityFilter(saved.availability ?? 'all');
  };
  const deleteDirectoryView = (id:string) => {
    persistDirectoryViews(savedDirectoryViews.filter((item:any)=>item.id !== id));
  };
  const clearDirectoryFilters = () => {
    setDirectoryQuery('');
    setDirectoryRoleFilter('all');
    setDirectoryTagFilter('all');
    setDirectoryAvailabilityFilter('all');
  };

  const profileCompletionSignals = [
    Boolean(profile.displayName),
    Boolean(profile.handle),
    Boolean(profile.headline),
    Boolean(profile.bio),
    Boolean(profile.welcomeMessage),
    Array.isArray(profile.favouriteTags) && profile.favouriteTags.length > 0,
    Array.isArray(profile.favouriteCategories) && profile.favouriteCategories.length > 0,
    profile.avatarStatus === 'approved' || Boolean(profile.avatarUrl),
  ];
  const profileCompletion = Math.round((profileCompletionSignals.filter(Boolean).length / profileCompletionSignals.length) * 100);
  const applicationGroups = classifyProfessionalApplications(adminApplications);
  const visibleAdminApplications = filterProfessionalApplicationsByRole(applicationGroups[adminApplicationBox], adminApplicationRoleFilter);
  const failedProfessionalApprovalEmailCount = adminApplications.filter((item:any) => item.approvalEmailStatus === 'failed').length;
  const profileEditableRoles: PreviewRole[] = (Array.isArray(profile.roles) ? profile.roles : [effectiveRole ?? 'listener'])
    .filter((item: unknown): item is PreviewRole =>
      typeof item === 'string'
      && ['listener','creator','writer','editor','artist'].includes(item),
    );
  const uniqueProfileEditableRoles: PreviewRole[] = Array.from(
    new Set<PreviewRole>(profileEditableRoles.length ? profileEditableRoles : ['listener']),
  );
  const hasProfessionalProfileRole = uniqueProfileEditableRoles.some((item) => ['creator','writer','editor','artist'].includes(item));

  const openProfileEditor = () => {
    navigate('profile');
    void loadProfile();
  };

  const openMyRoles = () => {
    if (!user?.userId || (canAdmin && !simulationMode)) return;
    setAdminPanel(null);
    setAdminPeopleRole(null);
    if (window.location.pathname !== '/profile/roles') {
      window.history.pushState({}, '', '/profile/roles');
    }
    setProfileRolesPage(true);
    setView('profile');
    setMenuOpen(false);
    scrollNightjarToTop();
  };
  const commandItems: NightjarCommand[] = [
    ...(effectiveRole === 'listener' || effectiveRole === 'admin' ? [{ id:'nav-discover', group:'Navigate', label:'Discover', detail:'Recommendations, catalogue and spotlights', keywords:['home','listen'], icon:<Headphones size={15}/>, action:()=>navigate('discover') }] : []),
    { id:'nav-directory', group:'Navigate', label:'Directory', detail:'Find VA Creators, Writers, Audio Editors, Artists and Listeners', keywords:['people','profiles','community'], icon:<Users size={15}/>, action:()=>navigate('creators') },
    ...((!canAdmin || interactiveRoleTest) && user?.userId ? [{ id:'nav-my-roles', group:'Account', label:'My Roles', detail:'Apply for or switch approved professional roles', keywords:['role','voice actor','VA','writer','editor','artist','application'], icon:<ShieldCheck size={15}/>, action:openMyRoles }] : []),
    ...(['creator','writer','editor','artist'].includes(String(effectiveRole)) ? [{ id:'nav-messages', group:'Work', label:'Messages', detail:[
  messageUnreadCount ? messageUnreadCount + ' unread' : '',
  messageNeedsReplyCount ? messageNeedsReplyCount + ' need your reply' : '',
  messageAwaitingReplyCount ? messageAwaitingReplyCount + ' awaiting reply' : '',
].filter(Boolean).join(' · ') || 'Private professional Inbox', keywords:['inbox','dm','conversation','collaboration'], icon:<MessageCircle size={15}/>, action:()=>navigate('messages') }] : []),
    ...(effectiveRole === 'listener' ? [{ id:'nav-library', group:'Navigate', label:'Library', detail:'Favourites, history and playlists', keywords:['saved','playlist'], icon:<Headphones size={15}/>, action:()=>navigate('library') }] : []),
    ...(effectiveRole === 'creator' || adminOnly ? [{ id:'nav-creator', group:'Studio', label:'Creator Studio', detail:'Releases, catalogue and creator operations', keywords:['publish','audio'], icon:<Mic2 size={15}/>, action:()=>{ navigate('creator'); void loadCreatorDashboard(); } }] : []),
    ...(effectiveRole === 'writer' ? [{ id:'nav-writer', group:'Studio', label:'Writer Studio', detail:'Manuscripts, rights and collaborations', keywords:['script','write'], icon:<FileText size={15}/>, action:()=>{ navigate('writer'); void loadWriterScripts(); } }] : []),
    ...(effectiveRole === 'editor' ? [{ id:'nav-editor', group:'Studio', label:'Editor Studio', detail:'Professional profile, portfolio, projects and collaborations', keywords:['edit','review','portfolio','services'], icon:<FileCheck2 size={15}/>, action:()=>{ navigate('editor'); void loadEditorQueue(); void loadProfile(); } }] : []),
    ...(effectiveRole === 'artist' ? [{ id:'nav-artist', group:'Studio', label:'Artist Studio', detail:'Artwork, portfolio and collaboration opportunities', keywords:['artist','artwork','commission','illustration','portfolio'], icon:<ImagePlus size={15}/>, action:()=>navigate('artist') }] : []),
    { id:'nav-calendar', group:'Account', label:'My calendar', detail:'Your local date, private plans and scheduled audio releases',keywords:['calendar','date','schedule','release','appointment'],icon:<CalendarDays size={15}/>,action:()=>navigate('calendar') },
    { id:'nav-profile', group:'Account', label:'Profile', detail:'Identity, public showcase and preferences', keywords:['settings','bio'], icon:<UserCircle2 size={15}/>, action:openProfileEditor },
    { id:'nav-protection', group:'Account', label:'Protection Centre', detail:'Reports, evidence and account safety', keywords:['security','safety'], icon:<ShieldCheck size={15}/>, action:()=>{ navigate('protection'); void loadProtection(); } },
    ...(canAdmin && !simulationMode ? [{ id:'nav-admin', group:'Administration', label:'Owner Console', detail:'People, content, security and commercial operations', keywords:['admin','moderation'], icon:<Settings2 size={15}/>, action:()=>{ navigate('admin'); void loadAdminOverview(); } }] : []),
    ...profileDirectory.slice(0,80).map((person) => ({
      id:'profile-' + person.userId,
      group:roleMeta[person.role].label,
      label:person.name,
      detail:[person.handle ? '@' + person.handle.replace(/^@/,'') : '', person.headline ?? '', person.roleAvailability ?? ''].filter(Boolean).join(' · '),
      keywords:[person.role,...(person.favouriteTags??[]),...(person.roleSpecialties??[])],
      icon:<UserCircle2 size={15}/>,
      action:()=>openPublicProfile(person.userId),
    })),
    ...tracks.slice(0,100).map((track) => ({
      id:'release-' + track.id,
      group:'Release',
      label:track.title,
      detail:[track.creator,track.category,track.duration].filter(Boolean).join(' · '),
      keywords:[track.creator,track.genre??'',...(track.tags??[]),...(track.tropes??[])],
      icon:<Headphones size={15}/>,
      action:()=>togglePlayback(track),
    })),
  ];

  const notificationGroups = Object.entries(notifications.slice(0,20).reduce((groups:Record<string,any[]>, item:any) => {
    const key = item.type === 'admin_action' || item.type === 'admin_attention' ? 'Owner action required' : item.type === 'spotlight' ? 'Spotlights' : item.type === 'message' ? 'Messages' : item.type === 'comment' ? 'Comments' : item.subtype === 'creator' ? 'Creators' : item.subtype === 'writer' ? 'Writers' : item.subtype === 'editor' ? 'Editorial' : item.type === 'collaboration' ? 'Collaborations' : 'Updates';
    (groups[key] ??= []).push(item);
    return groups;
  }, {}));

  const baseActions: RoleDashboardAction[] = [
    ...(profileCompletion < 70 ? [{ id:'complete-profile', title:'Strengthen your public profile', reason:`Your profile is ${profileCompletion}% complete. Richer profiles are easier to understand and discover.`, label:'Open profile', priority:'high' as const, onClick:openProfileEditor }] : []),
    ...(messageUnreadCount > 0 && messageNeedsReplyCount === 0 && ['creator','writer','editor','artist'].includes(String(effectiveRole)) ? [{ id:'messages', title:`Review ${messageUnreadCount} unread private message${messageUnreadCount === 1 ? '' : 's'}`, reason:'A professional Nightjar conversation has new activity. Keeping replies inside the work context reduces missed handoffs and uncertainty.', label:'Open Inbox', priority:'high' as const, onClick:()=>navigate('messages') }] : []),
    ...(messageNeedsReplyCount > 0 && ['creator','writer','editor','artist'].includes(String(effectiveRole)) ? [{ id:'needs-reply', title:`${messageNeedsReplyCount} conversation${messageNeedsReplyCount === 1 ? '' : 's'} need your reply`, reason:'These threads remain visible even after you read them because the other professional is still waiting on you for the next step.', label:'Reply now', priority:'high' as const, onClick:()=>navigate('messages') }] : []),
    ...(messageAwaitingReplyCount > 0 && ['creator','writer','editor','artist'].includes(String(effectiveRole)) ? [{ id:'awaiting-reply', title:`${messageAwaitingReplyCount} conversation${messageAwaitingReplyCount === 1 ? '' : 's'} awaiting a reply`, reason:'Your most recent message in these threads has been unanswered for at least 48 hours. A single follow-up reminder can be sent from the Inbox; Nightjar never sends repeated reminders automatically.', label:'Review threads', onClick:()=>navigate('messages') }] : []),
    ...(notificationUnreadCount > 0 ? [{ id:'notifications', title:`Review ${notificationUnreadCount} unread update${notificationUnreadCount === 1 ? '' : 's'}`, reason:'These are recent account or community changes you have not reviewed yet.', label:'Open updates', onClick:()=>setNotificationsOpen(true) }] : []),
  ];
  const creatorActions: RoleDashboardAction[] = [
    ...baseActions,
    ...(creatorDashboard.releases.length === 0 ? [{ id:'publish', title:'Create your first release', reason:'Your public catalogue is empty, so Listener discovery has nothing to surface yet.', label:'Start release', priority:'high' as const, onClick:()=>document.querySelector('.creator-audio-pipeline')?.scrollIntoView({behavior:'smooth'}) }] : []),
    ...((profile.featuredPortfolioIds ?? []).length === 0 && creatorDashboard.releases.length > 0 ? [{ id:'feature-work', title:'Choose featured releases', reason:'Featured work gives profile visitors a deliberate starting point instead of making them scan the full catalogue.', label:'Curate profile', onClick:openProfileEditor }] : []),
  ];
  const writerActions: RoleDashboardAction[] = [
    ...baseActions,
    ...(writerScripts.length === 0 ? [{ id:'first-script', title:'Start your first manuscript', reason:'Writer discovery can describe your identity, but your production workspace has no manuscript yet.', label:'Create script', priority:'high' as const, onClick:()=>document.querySelector('.writer-create-card')?.scrollIntoView({behavior:'smooth'}) }] : []),
    ...(writerScripts.some((script:any)=>String(script.status).toLowerCase().includes('revision')) ? [{ id:'revision', title:'A manuscript needs revision', reason:'Editorial feedback is waiting on at least one manuscript.', label:'Review feedback', priority:'high' as const, onClick:()=>document.querySelector('.writer-layout')?.scrollIntoView({behavior:'smooth'}) }] : []),
  ];
  const editorActions: RoleDashboardAction[] = [
    ...baseActions,
    ...(editorQueue.length > 0 ? [{ id:'editor-queue', title:`${editorQueue.length} manuscript${editorQueue.length === 1 ? '' : 's'} in your queue`, reason:'Assigned production work is ready for an editorial decision or handoff.', label:'Open queue', priority:'high' as const, onClick:()=>document.querySelector('.editorial-queue')?.scrollIntoView({behavior:'smooth'}) }] : []),
  ];
  const adminActions: RoleDashboardAction[] = [
    ...(securityAlerts.filter((item:any)=>item.status === 'open').length ? [{ id:'security', title:'Review open security alerts', reason:'Protection signals require human review before any account action is taken.', label:'Review alerts', priority:'high' as const, onClick:()=>openAdminWorkspace('security') }] : []),
    ...(imageModeration.length ? [{ id:'images', title:`${imageModeration.length} image${imageModeration.length === 1 ? '' : 's'} awaiting moderation`, reason:'Images remain private until an Administrator explicitly approves them.', label:'Moderate images', priority:'high' as const, onClick:()=>openAdminPanel('images') }] : []),
    ...(applicationGroups.pending.length ? [{ id:'applications', title:`${applicationGroups.pending.length} professional application${applicationGroups.pending.length === 1 ? '' : 's'} awaiting approval`, reason:'Only outstanding professional applications are counted. Completed approvals are archived separately.', label:'Review new applications', onClick:()=>openAdminPanel('approvals') }] : []),
    ...(adminCreatorSuggestions.some((item:any)=>item.status === 'new') ? [{ id:'creator-suggestions', title:'New Creator suggestions to review', reason:'Nightjar members have recommended Creators who are not yet on the platform.', label:'Review suggestions', onClick:()=>openAdminPanel('suggestions') }] : []),
    ...((commercialOverview?.subscriptions.pastDue ?? 0) > 0 ? [{ id:'past-due', title:'Past-due subscriptions need visibility', reason:'Past-due revenue is kept out of confirmed cash planning until payment succeeds.', label:'Open subscriptions', onClick:()=>openAdminPanel('subscriptions') }] : []),
  ];

  return (
    <div className={view === 'profile' && !profileRolesPage && profileDirty ? 'app-shell has-mobile-profile-save' : 'app-shell'}>
      <a className="skip-link" href="#nightjar-main-content">Skip to main content</a>
      <ProductExperience allowInstall={Boolean(user && ageVerified)} />
      {ageVerified && ageProvider === 'temporary-test-access' && <div className="testing-age-bypass-banner" role="status"><ShieldCheck size={14}/><span><strong>APPROVED TEST ACCESS</strong> This account is using temporary QA age access. Production age assurance is still required before public launch.</span></div>}
      <header className="topbar">
        <button className="brand-button" onClick={() => navigate('discover')} aria-label="Nightjar home">
          {logoUrl ? <img className="brand-logo" src={logoUrl} alt="Nightjar" /> : <img className="brand-logo" src={logoUrl ?? "/brand-logo"} alt="Nightjar" />}<span>NIGHTJAR</span>
        </button>

        <nav className={menuOpen ? 'nav open' : 'nav'} aria-label="Primary navigation">
          {(effectiveRole === 'listener' || effectiveRole === 'admin' || !role) && <button className={view === 'discover' ? 'nav-link active' : 'nav-link'} onClick={() => navigate('discover')}>Discover</button>}
          <button className={view === 'creators' ? 'nav-link active' : 'nav-link'} onClick={() => navigate('creators')}>{effectiveRole==='listener'?'Creators & Work':'Directory'}</button>
          {(effectiveRole === 'listener' || (role === 'admin' && previewRole === 'listener')) && <button className={view === 'library' ? 'nav-link active' : 'nav-link'} onClick={() => navigate('library')}>Library</button>}
          {(creatorOnly || adminOnly || (liveRolePreview && previewRole === 'creator')) && <button className={view === 'creator' ? 'nav-link active' : 'nav-link'} onClick={() => { navigate('creator'); void loadCreatorDashboard(); }}>Creator Studio</button>}
          {effectiveRole === 'writer' && !liveRolePreview && <button className={view === 'writer' ? 'nav-link active' : 'nav-link'} onClick={() => { navigate('writer'); void loadWriterScripts(); }}>Writer Studio</button>}
          {effectiveRole === 'editor' && !liveRolePreview && <button className={view === 'editor' ? 'nav-link active' : 'nav-link'} onClick={() => { navigate('editor'); void loadEditorQueue(); void loadProfile(); }}>Editor Studio</button>}
          {effectiveRole === 'artist' && !liveRolePreview && <button className={view === 'artist' ? 'nav-link active' : 'nav-link'} onClick={() => navigate('artist')}>Artist Studio</button>}
          {!liveRolePreview && (['creator','writer','editor','artist'].includes(String(effectiveRole)) || role === 'admin') && (role === 'admin' || accountStatus === 'active' || demoMode) && <button className={view === 'messages' ? 'nav-link active nav-message-link' : 'nav-link nav-message-link'} onClick={() => navigate('messages')}>Messages{messageUnreadCount > 0 && <span>{messageUnreadCount > 9 ? '9+' : messageUnreadCount}</span>}</button>}
          {canProtection && !liveRolePreview && <button className={view === 'profile' && !profileRolesPage ? 'nav-link active' : 'nav-link'} onClick={() => { navigate('profile'); void loadProfile(); }}>Profile</button>}
          {canProtection && (!canAdmin || interactiveRoleTest) && <button className={view === 'profile' && profileRolesPage ? 'nav-link active' : 'nav-link'} onClick={openMyRoles}>My Roles</button>}
          {canProtection && !liveRolePreview && <button className={view === 'protection' ? 'nav-link active' : 'nav-link'} onClick={() => { navigate('protection'); void loadProtection(); }}>Protection</button>}
          {canAdmin && !simulationMode && <button className={view === 'admin' ? 'nav-link active' : 'nav-link'} onClick={() => { navigate('admin'); void loadAdminOverview(); void loadSecurityAlerts(); }}>Admin</button>}
          {user && !liveRolePreview && <button className={view === 'calendar' ? 'nav-link active' : 'nav-link'} onClick={() => navigate('calendar')}>Calendar</button>}
          {user && !liveRolePreview && <button className={view === 'settings' ? 'nav-link active' : 'nav-link'} onClick={() => navigate('settings')}>Settings</button>}
        </nav>

        <div className="top-actions">
          {canAdmin && <div className="nj-live-switcher" ref={liveRoleMenuRef}>
            <button type="button" className={liveRolePreview || interactiveRoleTest ? 'nj-live-switcher-trigger active' : 'nj-live-switcher-trigger'}
              aria-expanded={liveRoleMenuOpen} aria-haspopup="dialog" aria-controls="nj-live-switcher-menu"
              onClick={() => { setMenuOpen(false); setLiveRoleMenuOpen((open) => !open); }}>
              <Eye size={17} aria-hidden="true" />
              <span className="nj-live-switcher-label"><strong>View as</strong><small>{interactiveRoleTest && previewRole ? roleMeta[previewRole].label + ' · QA' : liveRolePreview && previewRole ? roleMeta[previewRole].label + ' · Public' : 'Test roles'}</small></span>
              <ChevronDown size={15} className={liveRoleMenuOpen ? 'nj-switcher-chevron rotated' : 'nj-switcher-chevron'} aria-hidden="true" />
            </button>
            {liveRoleMenuOpen && <section className="nj-live-switcher-popover" id="nj-live-switcher-menu" role="dialog" aria-modal="false" aria-label="Live role viewing controls">
              <header className="nj-live-switcher-heading"><span className="mini-label"><ShieldCheck size={14} /> ADMINISTRATOR ONLY</span><strong>Test Nightjar as…</strong><small>Interactive role workspaces · local fictional records · no live writes</small></header>
              <div className="nj-live-switcher-options" role="group" aria-label="Select a live member perspective">
                {LIVE_PREVIEW_ROLES.map((option) => <button key={option.id} type="button"
                  aria-pressed={interactiveRoleTest && previewRole === option.id}
                  className={interactiveRoleTest && previewRole === option.id ? 'nj-live-switcher-option selected' : 'nj-live-switcher-option'}
                  onClick={() => startSimulation(option.id)}>
                  <span><strong>{option.label}</strong><small>{option.detail}</small></span>
                  {interactiveRoleTest && previewRole === option.id ? <Check size={16} aria-hidden="true"/> : <ChevronRight size={16} aria-hidden="true" />}
                </button>)}
              </div>
              <div className="nj-live-switcher-footer">
                <button type="button" onClick={() => openLiveMemberProfile()}><Users size={15} aria-hidden="true"/> Live Profile Viewer · real accounts</button>
                <button type="button" onClick={() => selectPreviewRole(previewRole ?? 'creator')}><Eye size={15} aria-hidden="true"/> Live public content (read-only)</button>
                <button type="button" onClick={() => { disableDemoMode(); openAdminPanel('live-preview'); }}><FileText size={15} aria-hidden="true"/> Real script visibility audit</button>
                <button type="button" onClick={() => interactiveRoleTest ? disableDemoMode() : clearAdminPreview()}><ShieldCheck size={15} aria-hidden="true"/> Return to Admin</button>
              </div>
            </section>}
          </div>}
          {user && !liveRolePreview && <button className="nj-search-trigger desktop-only" onClick={() => setCommandOpen(true)} aria-label="Search Nightjar"><Search size={15}/><span>Search</span><kbd>⌘K</kbd></button>}
          {user && !liveRolePreview && <div className="notification-wrap">
            <button className="ghost-button notification-button" onClick={() => { if (!notificationsOpen) void loadNotifications(productLoadEpoch.current); setNotificationsOpen((open) => !open); }} aria-label={notificationUnreadCount + (nightjarUpdate?.updateAvailable ? 1 : 0) ? String(notificationUnreadCount + (nightjarUpdate?.updateAvailable ? 1 : 0)) + ' updates and unread notifications' : 'Notifications'}>
              <Bell size={17} />
              {(notificationUnreadCount > 0 || nightjarUpdate?.updateAvailable) && <span className="notification-badge">{notificationUnreadCount + (nightjarUpdate?.updateAvailable ? 1 : 0) > 9 ? '9+' : notificationUnreadCount + (nightjarUpdate?.updateAvailable ? 1 : 0)}</span>}
            </button>
            {notificationsOpen && <section className="notification-popover" aria-label="Nightjar notifications">
              <div className="notification-popover-head"><div><span className="mini-label">NIGHTJAR ACTIVITY</span><strong>Recent updates</strong></div><div className="notification-popover-actions">{notificationUnreadCount > 0 && <button className="text-button" onClick={() => void markAllNotificationsRead()}>Mark all read</button>}<button className="icon-button" onClick={() => setNotificationsOpen(false)} aria-label="Close notifications"><X size={15} /></button></div></div>
              {nightjarUpdate?.updateAvailable && <div className="nightjar-update-notification" role="status">
                <div className="nightjar-update-notification-copy"><Download size={18} aria-hidden="true"/><span><strong>New Nightjar version available</strong><small>Latest build {nightjarUpdate.latestBuildId}. Update this device to enjoy the newest features.</small></span></div>
                <button type="button" className="primary-button" onClick={() => void installNightjarUpdate()} disabled={nightjarUpdating}><Download size={14}/>{nightjarUpdating ? 'Updating…' : 'Update now'}</button>
              </div>}
              {notifications.length ? <div className="notification-list">{notificationGroups.map(([group,items]) => <div className="notification-group" key={group}><span className="nj-notification-group-label">{group}</span>{(items as any[]).slice(0,6).map((item:any) => <button className={item.read ? 'notification-row' : 'notification-row unread'} key={item.id} onClick={() => { if (nightjarUpdate?.updateAvailable && (item.type === 'app_update' || /new (version|build)|update available/i.test(String(item.title)))) void installNightjarUpdate(); else void openNotification(item); }}>
                <span className="notification-row-icon">{item.type === 'admin_action' || item.type === 'admin_attention' ? <ShieldCheck size={15}/> : item.type === 'spotlight' ? <Star size={15}/> : item.subtype === 'creator' ? <Mic2 size={15} /> : item.subtype === 'writer' ? <FileText size={15} /> : item.type === 'message' || item.type === 'comment' ? <MessageCircle size={15}/> : item.subtype === 'editor' ? <FileCheck2 size={15}/> : <Headphones size={15} />}</span>
                <span><strong>{item.title}</strong><small>{item.message}</small>{nightjarUpdate?.updateAvailable && (item.type === 'app_update' || /new (version|build)|update available/i.test(String(item.title))) && <span className="notification-inline-update"><Download size={12} aria-hidden="true" /> Update now</span>}</span>
              </button>)}</div>)}</div> : !nightjarUpdate?.updateAvailable && <div className="notification-empty"><Bell size={17} /><span>No new activity. You’re caught up.</span></div>}
            </section>}
          </div>}
          {!user ? (
            <button className="primary-button" disabled={accountLoading} onClick={() => void signIn()}>Sign in <ArrowRight size={15} /></button>
          ) : (
            <>
              <button className="account-chip" onClick={() => liveRolePreview ? clearAdminPreview() : simulationMode ? (navigate('profile'), void loadProfile()) : setRolePicker(true)}>
                <span className="account-chip-avatar">{simulationMode ? simulationIdentity.initials : profile.avatarUrl ? <img className="avatar-approved-image" src={profile.avatarUrl} alt="" loading="lazy" decoding="async" /> : (user.name ?? user.email ?? 'N').slice(0, 1).toUpperCase()}</span>
                <span><strong>{simulationMode ? simulationIdentity.name : user.name ?? 'Nightjar account'}</strong><em>{simulationMode ? simulationIdentity.label + ' · Simulation' : canAdmin && previewRole ? `Administrator · ${liveRolePreview ? 'live' : 'simulation'} ${roleMeta[previewRole].label} view` : accountLabel}</em></span>
              </button>
              <button className="ghost-button desktop-only" onClick={() => void signOut()}><LogOut size={15} /></button>
            </>
          )}
          <button className="menu-button" onClick={() => { setLiveRoleMenuOpen(false); setMenuOpen((open) => !open); }} aria-label="Open navigation menu" aria-expanded={menuOpen}>{menuOpen ? <X size={20} /> : <Menu size={20} />}</button>
        </div>
      </header>

      {demoMode && !simulationMode && <div className={simulationMode ? 'simulation-banner active' : 'simulation-banner'}>
        <div><strong>{simulationMode ? 'SIMULATION MODE' : 'DEMO DATA'}</strong><span>{simulationMode ? `Viewing Nightjar as ${previewRole ? roleMeta[previewRole].label : 'Administrator'} · no simulated actions write to production` : 'Populated fictional records · live production data is not being changed'}</span></div>
        <div className="simulation-banner-actions">
          {simulationMode && <><button onClick={() => startSimulation('listener')}>Listener</button><button onClick={() => startSimulation('creator')}>Creator</button><button onClick={() => startSimulation('writer')}>Writer</button><button onClick={() => startSimulation('editor')}>Audio Editor</button><button onClick={() => startSimulation('artist')}>Artist</button><button onClick={resetSimulation}>Reset simulation</button><button onClick={stopSimulation}>Return to Admin</button></>}
          {!simulationMode && <button onClick={resetSimulation}>Reset demo data</button>}
          <button onClick={disableDemoMode}>Turn demo off</button>
        </div>
      </div>}

      {interactiveRoleTest && <div className="nightjar-role-qa-banner" role="status"><ShieldCheck size={17} aria-hidden="true"/><div><strong>INTERACTIVE {previewRole ? roleMeta[previewRole].label.toUpperCase() : 'MEMBER'} TEST ACCOUNT</strong><span>Actual role screens with local fictional records. Applications, messages and profile changes do not write to Firebase. Use an approved separate tester login for real authentication, permissions and email testing.</span></div><div className="nightjar-role-qa-actions"><button type="button" className="ghost-button" onClick={resetSimulation}>Reset local test</button><button className="secondary-button" type="button" onClick={disableDemoMode}>Exit role test</button></div></div>}
      {liveRolePreview && <div className="nightjar-live-role-banner" role="status"><ShieldCheck size={16} aria-hidden="true"/><span><strong>{previewRole ? roleMeta[previewRole].label : 'Member'} preview</strong> · Live public data · Read only</span><button className="secondary-button" type="button" onClick={clearAdminPreview}>Exit preview <ArrowRight size={14} aria-hidden="true"/></button></div>}
      <main id="nightjar-main-content" className={liveRolePreview ? 'nightjar-main nightjar-read-only-preview' : 'nightjar-main'}
        onClickCapture={(event) => {
          if (!liveRolePreview) return;
          const target = event.target as HTMLElement;
          if (target.closest('[data-nj-preview-safe="true"],input,select')) return;
          if (target.closest('button,a,textarea,summary,[role="button"],[contenteditable]')) {
            event.preventDefault();
            event.stopPropagation();
          }
        }}
        onKeyDownCapture={(event) => {
          if (!liveRolePreview || event.key === 'Tab') return;
          const target = event.target as HTMLElement;
          if (target.closest('[data-nj-preview-safe="true"],input,select')) return;
          if (target.closest('button,a,textarea,summary,[role="button"],[contenteditable]')) {
            event.preventDefault();
            event.stopPropagation();
          }
        }}
        onSubmitCapture={(event) => { if (liveRolePreview) { event.preventDefault(); event.stopPropagation(); } }}
        onDropCapture={(event) => { if (liveRolePreview) { event.preventDefault(); event.stopPropagation(); } }}
      >
        {!liveRolePreview && !demoMode && Boolean(user) && ['creator','writer','editor','artist'].includes(String(effectiveRole)) && ['creator','writer','editor','artist'].includes(view) &&
          <div className="page-wrap"><CreatorProductionTimeline notify={notify}/></div>}
        {!canAdmin && !simulationMode && !liveRolePreview && ['creator', 'writer', 'editor', 'artist'].includes(String(effectiveRole)) && ['creator', 'writer', 'editor', 'artist'].includes(view) &&
          <div className="page-wrap nj-workspace-switcher-wrap">
            <WorkspaceSwitcher
              activeRole={effectiveRole as 'creator' | 'writer' | 'editor' | 'artist'}
              onManageRoles={openMyRoles}
              onSwitch={(nextRole) => {
                setRole(nextRole);
                setPreviewRole(null);
                navigate(nextRole === 'listener' ? 'discover' : nextRole);
                void loadProfile(nextRole);
                if (nextRole === 'creator') void loadCreatorDashboard();
                if (nextRole === 'writer') void loadWriterScripts();
                if (nextRole === 'editor') void loadEditorQueue();
              }}
            />
          </div>}
        {view === 'discover' && (
          <PersonalisedHome userId={user?.userId ?? "guest"} editable={!liveRolePreview && !simulationMode} onNavigate={navigate}>
            <HomeSection id="featured" title="Featured audio">
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
                  <button data-nj-preview-safe="true" className="primary-button" onClick={() => { window.dispatchEvent(new CustomEvent('nightjar:open-home-section',{detail:'catalogue'})); window.setTimeout(()=>document.getElementById('nightjar-home-catalogue')?.scrollIntoView({behavior:'smooth'}),50); }}>Enter the listening room <ArrowRight size={16} /></button>
                  <button data-nj-preview-safe="true" className="text-button with-icon" onClick={() => liveRolePreview ? selectPreviewRole('creator') : creatorOnly || adminOnly ? navigate('creator') : notify('Create or apply for a Creator account to open Creator Studio.')}><Mic2 size={15}/> For creators <ChevronRight size={16} /></button>
                </div>
                <div className="hero-signals">
                  <span><Headphones size={15} /> Headphone-first</span>
                  <span><Mic2 size={15} /> Creator-led</span>
                  <span><ShieldCheck size={15} /> 18+ access</span>
                </div>
              </div>
              <div className="hero-art" aria-label="Browse Nightjar released audio">
                <div className="orbit orbit-a" /><div className="orbit orbit-b" />
                <div
                  className="featured-card"
                  ref={featuredCarouselRef}
                  onPointerEnter={(event) => { if (event.pointerType === 'mouse') setFeaturedCarouselHovered(true); }}
                  onPointerLeave={() => setFeaturedCarouselHovered(false)}
                  role="region"
                  aria-roledescription="carousel"
                  aria-label="Released audio carousel"
                  tabIndex={carouselTracks.length > 1 ? 0 : undefined}
                  onKeyDown={(event) => {
                    if (event.target !== event.currentTarget) return;
                    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                      event.preventDefault();
                      changeFeatured(event.key === 'ArrowRight' ? 1 : -1);
                    }
                  }}
                  onTouchStart={(event) => {
                    const touch = event.touches[0];
                    featuredTouchStart.current = touch && event.touches.length === 1
                      ? { x: touch.clientX, y: touch.clientY } : null;
                  }}
                  onTouchEnd={(event) => {
                    const start = featuredTouchStart.current;
                    featuredTouchStart.current = null;
                    const touch = event.changedTouches[0];
                    if (!start || !touch) return;
                    const deltaX = touch.clientX - start.x;
                    const deltaY = touch.clientY - start.y;
                    if (Math.abs(deltaX) >= 55 && Math.abs(deltaX) > Math.abs(deltaY) * 1.3) {
                      changeFeatured(deltaX < 0 ? 1 : -1);
                    }
                  }}
                  onTouchCancel={() => { featuredTouchStart.current = null; }}
                >
                  {featured ? <>
                    <div className="featured-top"><span className="mini-label">NIGHTJAR / RELEASES</span><span className="status-dot"><span /> LIVE RELEASE</span></div>
                    <div key={featured.id} className="cover-art release-cover featured-release-cover">
                      <ReleaseCoverVisual artworkUrl={featured.artworkUrl} brandLogoUrl={logoUrl ?? '/brand-logo'} />
                      <h2 className="featured-cover-title">{featured.title.toUpperCase()}</h2>
                    </div>
                    <div className="feature-meta">
                      <div><span className="mini-label">{featured.category}</span><strong>{featured.title}</strong></div>
                      <button className="round-play" disabled={!featured.audioAvailable && !featured.audioUrl} onClick={() => togglePlayback(featured)} aria-label={playing === featured.id ? 'Pause release' : 'Play release'}>{playing === featured.id ? <Pause size={19} /> : <Play size={19} fill="currentColor" />}</button>
                    </div>
                    {carouselTracks.length > 1 && (
                      <nav className="featured-carousel-controls" aria-label="Browse published audio">
                        <button type="button" className="featured-carousel-arrow" data-nj-preview-safe="true"
                          onClick={() => changeFeatured(-1)} aria-label="Previous released audio">
                          <ArrowLeft size={18} aria-hidden="true" />
                        </button>
                        <div className="featured-carousel-position">
                          <strong>{featuredIndex + 1} / {carouselTracks.length}</strong>
                          <small>3 SEC · SWIPE TO EXPLORE</small>
                          {featuredCarouselReducedMotion
                            ? <span className="featured-carousel-motion-note">Auto rotation off for reduced motion</span>
                            : <button type="button" className="featured-carousel-autoplay" data-nj-preview-safe="true"
                              onClick={() => setFeaturedCarouselPaused((paused) => !paused)}
                              aria-label={featuredCarouselPaused ? 'Resume automatic audio carousel' : 'Pause automatic audio carousel'}
                              aria-pressed={featuredCarouselPaused}>
                              {featuredCarouselPaused ? <Play size={12} aria-hidden="true" /> : <Pause size={12} aria-hidden="true" />}
                              {featuredCarouselPaused ? 'Resume rotation' : 'Pause rotation'}
                            </button>}
                        </div>
                        <button type="button" className="featured-carousel-arrow" data-nj-preview-safe="true"
                          onClick={() => changeFeatured(1)} aria-label="Next released audio">
                          <ArrowRight size={18} aria-hidden="true" />
                        </button>
                      </nav>
                    )}
                    <span className="sr-only" aria-live="polite" aria-atomic="true">{featuredCarouselAnnouncement}</span>
                    {featuredCredits.length > 0 && (
                      <div className="featured-credit-list" aria-label="Release credits">
                        {featuredCredits.map((credit) => (
                          <div className="featured-credit-item" key={credit.role.toLocaleLowerCase() + ':' + credit.name.toLocaleLowerCase()}>
                            <span className="featured-credit-role">{credit.role}</span>
                            {credit.userId
                              ? <button type="button" className="featured-credit-name featured-credit-link" aria-label={'View ' + credit.name + ' public profile'} onClick={() => openPublicProfile(credit.userId!, credit.profileRole)}>{credit.name}<ChevronRight size={13} aria-hidden="true" /></button>
                              : <strong className="featured-credit-name">{credit.name}</strong>}
                          </div>
                        ))}
                      </div>
                    )}
                    <button type="button" className="featured-discussion-button" onClick={() => setReviewTrack(featured)} aria-label={'Open comments and community for ' + featured.title}>
                      <MessageCircle size={17} aria-hidden="true" />
                      <span>Join the conversation</span>
                      <small>{Number(featured.communityCommentCount ?? 0)} comments</small>
                      <ChevronRight size={15} aria-hidden="true" />
                    </button>
                    <div className="player-meta"><span>{featured.duration}</span><span>{featured.audioAvailable || featured.audioUrl ? 'Private audio connected' : 'Audio not connected'}</span><span><Headphones size={13}/> {Number(featured.listenCount ?? 0).toLocaleString('en-GB')} listens</span></div>
                  </> : <div className="empty-feature"><Moon size={40}/><strong>No featured release yet.</strong><span>Published catalogue records will appear here as creators release audio.</span></div>}
                </div>
              </div>
            </section>

            </HomeSection>

            <HomeSection id="spotlights" title="Community spotlights">
            <SpotlightExperience
              spotlightMeta={spotlightMeta}
              spotlights={[creatorSpotlight, writerSpotlight, editorSpotlight, artistSpotlight, listenerSpotlight].filter((person): person is Spotlight => person !== null)}
              viewerUserId={simulationMode ? null : user?.userId}
              followingIds={followingProfileIds}
              simulationMode={simulationMode}
              simulationRole={simulationMode ? previewRole : null}
              onProfile={openPublicProfile}
              onFollow={toggleProfileFollow}
              onShare={shareSpotlight}
              onListen={(releaseId) => { const track = tracks.find((item)=>item.id===releaseId); if (track) togglePlayback(track); }}
            />
            </HomeSection>

            <HomeSection id="writers" title="Discover writers"><WriterDiscovery followingIds={followingProfileIds} onToggleFollow={toggleProfileFollow} notify={notify} demoMode={demoMode} /></HomeSection>

            <HomeSection id="catalogue" title="Published audio">
            <section id="catalogue" className="section-wrap">
              <div className="section-head"><div><p className="eyebrow">THE LISTENING ROOM</p><h2>Published releases.</h2></div><button data-nj-preview-safe="true" className="text-button with-icon" onClick={() => { window.dispatchEvent(new CustomEvent('nightjar:open-home-section',{detail:'recommended'})); window.setTimeout(()=>document.getElementById('nightjar-home-recommended')?.scrollIntoView({behavior:'smooth'}),50); }}>Personalise <Sparkles size={14}/></button></div>
              {effectiveRole === 'listener' && !liveRolePreview && <ListeningDiscoveryControls
                mood={selectedListeningMood} onMoodChange={setSelectedListeningMood}
                boundaries={listeningBoundaries} onBoundariesChange={setListeningBoundaries}
                notify={notify} simulationMode={demoMode} />}
              <div className="catalogue-filter-bar">
                <label className="catalogue-search"><Search size={15}/><input value={catalogueQuery} onChange={(event)=>setCatalogueQuery(event.target.value)} placeholder="Search title, VA, Writer, Audio Editor, Artist, trope or genre"/></label>
                <select value={catalogueRating} onChange={(event)=>setCatalogueRating(event.target.value)} aria-label="Content level"><option value="all">All content levels</option><option value="sfw">SFW</option><option value="suggestive">Suggestive</option><option value="adult">Adult</option><option value="explicit">Explicit</option></select>
                <select value={catalogueDuration} onChange={(event)=>setCatalogueDuration(event.target.value)} aria-label="Audio duration"><option value="all">Any length</option><option value="short">Under 10 min</option><option value="medium">10–24 min</option><option value="full">25–44 min</option><option value="long">45+ min</option></select>
              </div>
              <div className="track-grid">
                {notificationReleaseCards.slice(0, 24).map((track) => <LiveTrackCard highlighted={focusedContentReleaseId === track.id} key={track.id} brandLogoUrl={logoUrl ?? '/brand-logo'} track={track} playing={playing === track.id} favourite={favouriteReleaseIds.includes(track.id)} reaction={releaseReactions[track.id] ?? null} canReact={effectiveRole === 'listener' && !liveRolePreview} onPlay={togglePlayback} onRead={openTranscript} onFavourite={() => void toggleFavouriteRelease(track.id)} onReaction={(reaction) => void toggleReleaseReaction(track.id,reaction)} onCommunity={() => setReviewTrack(track)} />)}
                {!notificationReleaseCards.length && <div className="people-empty"><Headphones size={18}/><strong>No matching releases.</strong><span>{tracks.length ? 'Try another creator, writer, trope, genre or filter.' : 'The listening room will populate from real creator releases once audio is published.'}</span></div>}
              </div>
            </section>
            </HomeSection>

            {focusedContentScriptId && <section id="nightjar-public-script-marketplace" className="section-wrap" aria-label="Published Writer scripts">
              <Suspense fallback={<NightjarSkeleton variant="cards" count={2} label="Loading approved Writer scripts" />}>
                <ScriptMarketplace key={'discover-marketplace-' + demoSessionKey}
                  focusScriptId={focusedContentScriptId}
                  notify={notify} demoMode={demoMode} simulationMode={simulationMode}
                  onOpenWriter={openPublicProfile}
                  readOnlyPreview={effectiveRole !== 'creator' || liveRolePreview}
                  onMessageUser={effectiveRole === 'creator' && !liveRolePreview ? (userId,collaborationId) => {
                    setMessageRecipientUserId(userId);
                    setMessageCollaborationId(collaborationId??null);
                    navigate('messages');
                  } : undefined}
                />
              </Suspense>
            </section>}

            <HomeSection id="recommended" title="For you">
            <section id="for-you" className="section-wrap">
              <div className="section-head"><div><p className="eyebrow"><Sparkles size={14}/> FOR YOU</p><h2>What fits right now.</h2></div><div className="nj-intent-control" aria-label="Current listening intent">{[
  ['','Open'],
  ['wind','Wind down'],
  ['story','Story'],
  ['quiet','Quiet'],
  ['focus','Focus'],
  ['discover','Surprise me'],
].map(([value,label])=><button type="button" key={value || 'open'} className={currentIntent===value?'active':''} aria-pressed={currentIntent===value} onClick={()=>setCurrentIntent(value)}>{label}</button>)}</div></div>
              <p className="section-copy">Declared preferences carry more weight than observed behaviour. The current session intent only changes the present recommendation context.</p>
              <div className="track-grid">
                {liveRecommendations.map((release: any) => { const track = releaseToTrack(release); return <LiveTrackCard key={track.id} brandLogoUrl={logoUrl ?? '/brand-logo'} track={track} playing={playing === track.id} favourite={favouriteReleaseIds.includes(track.id)} reaction={releaseReactions[track.id] ?? null} canReact={effectiveRole === 'listener' && !liveRolePreview} onPlay={togglePlayback} onRead={openTranscript} onFavourite={() => void toggleFavouriteRelease(track.id)} onReaction={(reaction) => void toggleReleaseReaction(track.id,reaction)} onCommunity={() => setReviewTrack(track)} reason={release.reason ? String(release.reason) : undefined} />; })}
                {!liveRecommendations.length && <div className="people-empty"><Sparkles size={18}/><strong>Your recommendation graph is still forming.</strong><span>Save work, finish releases, follow creators and set explicit preferences to create meaningful personalised recommendations.</span></div>}
              </div>
            </section>

            </HomeSection>
            <HomeSection id="trending" title="Trending now">
            <section className="section-wrap">
              <div className="section-head"><div><p className="eyebrow">TRENDING</p><h2>Popular right now.</h2></div><span className="section-copy">General popularity is kept separate from personalisation.</span></div>
              <div className="track-grid">
                {liveTrending.map((release: any) => { const track = releaseToTrack(release); return <LiveTrackCard key={track.id} brandLogoUrl={logoUrl ?? '/brand-logo'} track={track} playing={playing === track.id} favourite={favouriteReleaseIds.includes(track.id)} reaction={releaseReactions[track.id] ?? null} canReact={effectiveRole === 'listener' && !liveRolePreview} onPlay={togglePlayback} onRead={openTranscript} onFavourite={() => void toggleFavouriteRelease(track.id)} onReaction={(reaction) => void toggleReleaseReaction(track.id,reaction)} onCommunity={() => setReviewTrack(track)} />; })}
                {!liveTrending.length && <div className="people-empty"><BarChart3 size={18}/><strong>No live trending data.</strong><span>Trending appears only after real listening events exist.</span></div>}
              </div>
            </section>

            </HomeSection>
            <div className="nj-home-transparency"><TransparencyPanel demoMode={demoMode} /></div>

            <HomeSection id="creators" title="Voices worth following">
            <section className="creator-band section-wrap">
              <div className="section-head"><div><p className="eyebrow">THE CREATOR NETWORK</p><h2>Voices worth following.</h2></div><button data-nj-preview-safe="true" className="text-button with-icon" onClick={() => navigate('creators')}>Meet the creators <ArrowRight size={15} /></button></div>
              <div className="creator-grid">{profileDirectory.filter((person) => person.role === 'creator').slice(0, 5).map((creator) => <button data-nj-preview-safe="true" className="creator-card" key={creator.userId} onClick={() => openPublicProfile(creator.userId)}><span className="avatar-large">{creator.avatarUrl ? <img className="avatar-approved-image" src={creator.avatarUrl} alt="" loading="lazy" decoding="async" /> : creator.avatarInitials || creator.name.slice(0,2).toUpperCase()}</span><span className="creator-card-copy"><strong>{creator.name}</strong><span>{creator.handle ? '@' + creator.handle.replace(/^@/,'') : 'Handle not set'}</span><em>{creator.headline || creator.bio || 'Nightjar creator profile.'}</em><small>{creator.releaseCount ?? 0} published releases</small></span><ChevronRight size={17} /></button>)}</div>
              {!profileDirectory.some((person) => person.role === 'creator') && <div className="people-empty"><Users size={18}/><strong>No approved creator profiles yet.</strong><span>Creator discovery will populate from approved public accounts.</span></div>}
            </section>

            </HomeSection>
            <HomeSection id="studio" title="Creator opportunities">
            <section className="studio-feature section-wrap">
              <div className="studio-feature-copy"><p className="eyebrow"><BarChart3 size={14} /> CREATOR STUDIO</p><h2>Clear work. Clear rates. Real analytics.</h2><p>Nightjar separates the equal capped standard creator rate from listening analytics. Commercial records stay grounded in confirmed billing rather than fabricated earnings.</p><button data-nj-preview-safe="true" className="primary-button" onClick={() => liveRolePreview ? selectPreviewRole('creator') : creatorOnly || adminOnly ? navigate('creator') : notify('Apply as a Creator to access Creator Studio.')}>Open Creator Studio <ArrowRight size={16} /></button></div>
              {!liveRolePreview && <div className="studio-preview-card"><div className="studio-card-head"><div><span className="mini-label">LIVE CREATOR DATA</span><strong>{creatorOnly ? 'Your account' : 'Connected data'}</strong></div><span className="studio-period">{creatorDashboardLoading ? 'LOADING' : 'LIVE RECORDS'}</span></div><div className="studio-metrics">{studioMetrics.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div><div className="formula-line"><span>PAID SUBSCRIPTIONS</span><ChevronRight size={12}/><span>PUBLISHED RATE BAND</span><ChevronRight size={12}/><span>CAPPED EQUAL RATE</span></div></div>}
            </section>
            </HomeSection>
          </PersonalisedHome>
        )}

        {view === 'creators' && (
          <section className="page-wrap profile-directory-page">
            <div className="page-heading profile-directory-heading">
              <div>
                <p className="eyebrow">{effectiveRole==='listener'?'DISCOVER NIGHTJAR CREATORS':'NIGHTJAR COMMUNITY DIRECTORY'}</p>
                <h1>{effectiveRole==='listener'?'Find the makers behind your favourites.':'Discover the people behind Nightjar.'}</h1>
                <p>{effectiveRole==='listener'?'Explore VAs, Writers, Audio Editors and Artists. Find their published work, follow favourites for free, or choose to show your support—no commissioning or professional enquiry required.':'Explore the Professional Library by category—VA Creators, Writers, Audio Editors and Artists. Each person appears in every profession they are approved for. Search by name, handle, specialties, tags or availability. Only published public profiles appear.'}</p>
              </div>
              <div className="creator-directory-tools profile-directory-tools">
                <label className="creator-directory-search"><Search size={16}/><input value={directoryQuery} onChange={(event)=>setDirectoryQuery(event.target.value)} placeholder={effectiveRole==='listener'?'Find a creator, style, subject or genre…':'Search name, tag, specialty, badge…'}/></label>
                <select value={directoryRoleFilter} onChange={(event)=>setDirectoryRoleFilter(event.target.value as 'all' | 'creator' | 'writer' | 'editor' | 'artist' | 'listener')}>
                  <option value="all">All professionals · grouped by category</option>
                  <option value="creator">VA Creators</option>
                  <option value="writer">Writers</option>
                  <option value="editor">Audio Editors</option>
                  <option value="artist">Artists</option>
                  <option value="listener">Listeners</option>
                </select>
                <select value={directoryTagFilter} onChange={(event)=>setDirectoryTagFilter(event.target.value)}>
                  <option value="all">All tags & specialties</option>
                  {directoryTagOptions.map((option)=><option key={option} value={option}>{option}</option>)}
                </select>
                {effectiveRole!=='listener'&&<select value={directoryAvailabilityFilter} onChange={(event)=>setDirectoryAvailabilityFilter(event.target.value)}>
                  <option value="all">Any availability</option>
                  {directoryAvailabilityOptions.map((option)=><option key={option} value={option}>{option}</option>)}
                </select>}
              </div>
            </div>
            <Suspense fallback={<NightjarSkeleton variant="cards" count={2} label="Loading Nightjar Team updates" />}>
              <NightjarTeamCommunity admin={canAdmin&&!liveRolePreview} readOnly={liveRolePreview||demoMode} notify={notify} demoMode={demoMode}/>
            </Suspense>
            <div className="nj-directory-viewbar">
              <div className="nj-directory-view-actions">
                {!liveRolePreview && <button className="secondary-button" onClick={saveDirectoryView}>Save view</button>}
                <button data-nj-preview-safe="true" className="ghost-button" onClick={clearDirectoryFilters}>Clear filters</button>
                {!liveRolePreview && <span>Saved views stay on this signed-in account’s browser only.</span>}
              </div>
              {!liveRolePreview && !!savedDirectoryViews.length && <div className="nj-directory-saved-views">{savedDirectoryViews.map((saved:any)=><span key={saved.id}><button onClick={()=>applyDirectoryView(saved)}>{saved.name}</button><button aria-label={'Delete saved view ' + saved.name} onClick={()=>deleteDirectoryView(saved.id)}>×</button></span>)}</div>}
            </div>

            {effectiveRole==='listener'&&<Suspense fallback={<NightjarSkeleton variant="cards" count={3} label="Finding Nightjar creators and released work" />}>
              <ListenerCreatorDiscovery
                profiles={profileDirectory}
                releases={tracks}
                followingIds={followingProfileIds}
                category={directoryRoleFilter}
                onCategoryChange={(next)=>{setDirectoryRoleFilter(next);setDirectoryTagFilter('all');setDirectoryAvailabilityFilter('all');}}
                onOpen={openPublicProfile}
                onFollow={toggleProfileFollow}
                onPlayRelease={(releaseId)=>{const track=tracks.find(item=>item.id===releaseId);if(track)togglePlayback(track);}}
                readOnly={liveRolePreview||(demoMode&&!simulationMode)}
              />
            </Suspense>}

            {effectiveRole!=='listener'&&!liveRolePreview && <Suspense fallback={<NightjarSkeleton variant="list" count={1} label="Loading Creator suggestion tools" />}><CreatorSuggestionBox notify={notify} demoMode={demoMode} simulationMode={simulationMode}/></Suspense>}

            <ProfessionalLibrary
              audience={effectiveRole==='listener'?'listener':'professional'}
              onSupport={(person,role)=>{
                if(demoMode||liveRolePreview){notify('Nightjars can only be gifted from an active member account.');return;}
                if(person.userId===user?.userId){notify('You cannot gift Nightjars to your own account.');return;}
                setSupportTarget({userId:person.userId,name:person.name,role,roles:person.roles??[person.role]});
              }}
              profiles={profileDirectory}
              filteredProfiles={filteredDirectoryProfiles}
              category={directoryRoleFilter}
              onCategoryChange={(next) => { setDirectoryRoleFilter(next); setDirectoryTagFilter('all'); setDirectoryAvailabilityFilter('all'); }}
              onOpen={openPublicProfile}
              onFollow={toggleProfileFollow}
              followingIds={followingProfileIds}
              onRecommend={(person, selectedRole) => void recommendCreator(person as PublicDirectoryProfile, selectedRole)}
              onMessage={(recipient) => { setMessageRecipientUserId(recipient); setMessageCollaborationId(null); navigate('messages'); }}
              canMessage={['creator','writer','editor','artist'].includes(String(effectiveRole)) && !liveRolePreview}
              readOnly={liveRolePreview||(demoMode&&!simulationMode)}
            />
          </section>
        )}

        {view === 'messages' && !liveRolePreview && (['creator','writer','editor','artist'].includes(String(effectiveRole)) || role === 'admin') && (role === 'admin' || accountStatus === 'active' || demoMode) && (
          <section className="page-wrap messages-page">
            <div className="page-heading"><div><p className="eyebrow"><MessageCircle size={14}/> PRIVATE MESSAGING</p><h1>Keep creative conversations moving.</h1><p>Creators and Nightjar administrators can communicate directly inside Nightjar without changing rights, credits or access permissions.</p></div></div>
            <Suspense fallback={<NightjarSkeleton variant="page" count={3} label="Loading private messages" />}><MessagingHub role={role === 'admin' ? 'admin' : effectiveRole as 'creator'|'writer'|'editor'|'artist'} currentUserId={user?.userId} initialRecipientUserId={messageRecipientUserId} initialConversationId={messageConversationId} initialCollaborationId={messageCollaborationId} onRecipientHandled={()=>{setMessageRecipientUserId(null);setMessageConversationId(null);setMessageCollaborationId(null);}} onUnreadChange={setMessageUnreadCount} onStatusChange={({unread,needsReply,awaitingReply})=>{setMessageUnreadCount(unread);setMessageNeedsReplyCount(needsReply);setMessageAwaitingReplyCount(awaitingReply);}} notify={notify} demoMode={demoMode} simulationMode={simulationMode}/></Suspense>
          </section>
        )}

        {view === 'creator' && (creatorOnly || adminOnly || (liveRolePreview && previewRole === 'creator')) && (
          <section className={liveRolePreview ? 'page-wrap studio-page studio-page-live-preview' : 'page-wrap studio-page'}>
            <div className="page-heading studio-page-heading">
              <div>
                <p className="eyebrow"><BarChart3 size={14} /> CREATOR STUDIO</p>
                <h1>{liveRolePreview ? 'Welcome to Creator Studio.' : 'Your audience. Your catalogue. Fair, transparent pay.'}</h1>
                <p>{liveRolePreview ? 'A complete look at the VA experience, connected to real Nightjar public records. Protected account work remains visible only to its owner.' : accountStatus === 'pending_review' ? 'Your Creator application is awaiting approval.' : 'Your real release pipeline, from upload through moderation to live catalogue.'}</p>
              </div>
              {!liveRolePreview && <button className="primary-button with-icon" disabled={!creatorOnly} onClick={() => document.getElementById('creator-pipeline')?.scrollIntoView({ behavior: 'smooth' })}>
                <Upload size={16} /> New release
              </button>}
            </div>
            {liveRolePreview && <Suspense fallback={<NightjarSkeleton variant="cards" count={3} label="Loading real Creator workspace preview" />}>
              <CreatorLivePreviewOverview
                publicReleases={tracks}
                publicProfiles={profileDirectory}
                onOpenPublicProfile={openPublicProfile}
                onOpenScriptAudit={() => openAdminPanel('live-preview')}
              />
            </Suspense>}
            {!liveRolePreview && <RoleDashboard
              eyebrow="CREATOR COMMAND CENTRE"
              title="What needs your attention."
              description="Publishing, profile and community actions surfaced from your current Nightjar state."
              metrics={[
                {label:'Releases',value:creatorDashboard.releases.length,detail:'Current catalogue records',destination:'the release pipeline',onClick:()=>document.getElementById('creator-pipeline')?.scrollIntoView({behavior:'smooth',block:'start'})},
                {label:'Qualified listens',value:creatorDashboard.metrics?.qualifiedListens ?? 0,detail:'Verified audience plays',destination:'listening insights',onClick:()=>{window.dispatchEvent(new CustomEvent('nightjar:open-workspace-section',{detail:'creator-listening-insights'}));window.setTimeout(()=>document.querySelector('.nj-listening-insights')?.scrollIntoView({behavior:'smooth',block:'start'}),60);}},
                {label:'Featured',value:(profile.featuredPortfolioIds ?? []).length,detail:'Profile showcase',destination:'your profile',onClick:openProfileEditor},
                {label:'Collaborations',value:profileCompletedCollaborations,detail:'Completed on Nightjar',destination:'the collaboration workspace',onClick:()=>{const target=document.querySelector('.collaboration-hub');if(target)target.scrollIntoView({behavior:'smooth',block:'start'});else navigate('profile');}},
                {label:'Messages',value:messageUnreadCount,detail:messageNeedsReplyCount ? messageNeedsReplyCount + ' need your reply' : messageAwaitingReplyCount ? messageAwaitingReplyCount + ' awaiting reply' : 'Unread private threads',destination:'messages',onClick:()=>navigate('messages')},
              ]}
              actions={creatorActions}
              loading={creatorDashboardLoading}
            />}
            {creatorDashboardLoading && <NightjarSkeleton variant="cards" count={4} label="Loading Creator Studio data" />}
            {accountStatus === 'pending_review' && creatorOnly && <div className="admin-note"><Sparkles size={17} /><div><strong>CREATOR ACCOUNT / PENDING REVIEW</strong><span>Your account is created, but publishing stays locked until an administrator approves the application.</span></div></div>}
            {!liveRolePreview && <div className="dashboard-metric-grid">
              {studioMetrics.map(([label, value]) => <div className="dashboard-metric" key={label}><span>{label}</span><strong>{creatorDashboardLoading ? '…' : value}</strong><em>Live record</em></div>)}
            </div>}
            {!liveRolePreview && <WorkspaceSection userId={user?.userId ?? 'guest'} sectionId="creator-listening-insights" title="Listening insights" summary="Audience numbers and listening performance"><Suspense fallback={<NightjarSkeleton variant="cards" count={2} label="Loading creator listening insights" />}>
              <CreatorListeningInsights releases={creatorDashboard.releases} verifiedMinutes={Number(creatorDashboard.metrics?.verifiedListeningMinutes ?? 0)} loading={creatorDashboardLoading} onRefresh={() => { void loadCreatorDashboard(); }} />
            </Suspense></WorkspaceSection>}
            {creatorOnly && Boolean(user?.userId) && !liveRolePreview && <VoiceCallingCardStudio
              creatorUserId={String(user?.userId ?? '')} releases={creatorDashboard.releases}
              notify={notify} simulationMode={simulationMode} />}
            {!liveRolePreview && <WorkspaceSection userId={user?.userId ?? 'guest'} sectionId="creator-release-pipeline" title="My audio releases" summary="Upload, manage drafts, submit and publish" defaultOpen><div id="creator-pipeline">
              {creatorOnly ? <Suspense fallback={<NightjarSkeleton variant="cards" count={3} label="Loading Creator release tools" />}><CreatorAudioPipeline key={'creator-pipeline-' + demoSessionKey} releases={creatorDashboard.releases} accountStatus={accountStatus} canPublish={creatorOnly && accountStatus !== 'pending_review'} onRefresh={loadCreatorDashboard} notify={notify} simulationMode={simulationMode} onSimulationChange={updateSimulatedRelease} focusReleaseId={focusedReleaseId} onSubmitted={() => { void loadNotifications(productLoadEpoch.current); }} onDeleted={(releaseId) => { setTracks((items) => items.filter((track) => track.id !== releaseId)); setPlaying((id) => id === releaseId ? null : id); setReviewTrack((track) => track?.id === releaseId ? null : track); setFocusedReleaseId((id) => id === releaseId ? null : id); }} /></Suspense> : <div className="admin-note"><Mic2 size={17}/><div><strong>CREATOR STUDIO PREVIEW</strong><span>Administrator preview can inspect the interface; only an active Creator can upload, submit or publish real releases.</span></div></div>}
            </div></WorkspaceSection>}
            {(creatorOnly || (canAdmin && !demoMode)) && <WorkspaceSection userId={user?.userId ?? 'guest'} sectionId="creator-script-marketplace" title="Script marketplace" summary="Browse available scripts and connect with writers"><div className={liveRolePreview ? 'nj-creator-preview-marketplace' : undefined}>
              <Suspense fallback={<NightjarSkeleton variant="cards" count={3} label="Loading live script marketplace" />}>
                <ScriptMarketplace key={'marketplace-' + demoSessionKey} notify={notify} onOpenWriter={openPublicProfile} onMessageUser={(userId,collaborationId)=>{setMessageRecipientUserId(userId);setMessageCollaborationId(collaborationId??null);navigate('messages');}} demoMode={demoMode} simulationMode={simulationMode} readOnlyPreview={canAdmin && !demoMode} onAdminAudit={liveRolePreview ? () => openAdminPanel('live-preview') : undefined} />
              </Suspense>
            </div></WorkspaceSection>}
            {canAdmin && !demoMode && !liveRolePreview && <div className="admin-note"><ShieldCheck size={18}/><div><strong>REAL CREATOR MARKETPLACE · READ ONLY</strong><span>These are actual approved scripts with Marketplace visibility. No fictional entries are shown, and you cannot send interest as another user. For unpublished tester uploads, use Admin → Live Role Preview to see why they are hidden.</span></div></div>}
            {creatorOnly && accountStatus !== 'pending_review' && <WorkspaceSection userId={user?.userId ?? 'guest'} sectionId="creator-licences" title="Licensing and rights" summary="Offers, agreements and protected rights"><Suspense fallback={<NightjarSkeleton variant="list" count={2} label="Loading script rights offers" />}><ScriptLicenceWorkspace role="creator" currentUserId={user?.userId} demoMode={demoMode} simulationMode={simulationMode} notify={notify} onMessageUser={(uid)=>{setMessageRecipientUserId(uid);setMessageCollaborationId(null);navigate('messages');}}/></Suspense></WorkspaceSection>}
            {creatorOnly && accountStatus !== 'pending_review' && <WorkspaceSection userId={user?.userId ?? 'guest'} sectionId="creator-collaborations" title="Collaborations" summary="Active projects, invitations and handoffs"><Suspense fallback={<NightjarSkeleton variant="list" count={2} label="Loading Creator collaborations" />}><CollaborationHub key={'creator-collab-' + demoSessionKey} role="creator" notify={notify} demoMode={demoMode} simulationMode={simulationMode} onMessageUser={(userId,collaborationId)=>{ setMessageRecipientUserId(userId); setMessageCollaborationId(collaborationId??null); navigate('messages'); }} /></Suspense></WorkspaceSection>}
            {canAdmin && !liveRolePreview && <article className="panel-card"><div className="panel-title"><div><span className="mini-label">ECONOMICS · ADMIN PREVIEW</span><h2>Capped equal standard rate</h2></div><ShieldCheck size={18}/></div><div className="formula-stack"><div><span>01</span><strong>Confirmed paid subscriptions</strong></div><ChevronRight size={15}/><div><span>02</span><strong>Published subscriber-rate band</strong></div><ChevronRight size={15}/><div><span>03</span><strong>Equal eligible creator rate, limited by the configured cap</strong></div></div><p className="panel-note">Administrator planning preview only. This compensation model is not shown on member or professional profiles and should not be treated as a contractual earnings promise.</p></article>}
          </section>
        )}

        {view === 'artist' && effectiveRole === 'artist' && !liveRolePreview && (
          <Suspense fallback={<NightjarSkeleton variant="page" count={4} label="Opening Artist Studio" />}>
            <ArtistStudio
              key={'artist-studio-' + demoSessionKey}
              notify={notify}
              demoMode={demoMode}
              onEditProfile={() => { navigate('profile'); void switchProfileEditRole('artist'); }}
              onMessages={() => navigate('messages')}
              onDirectory={() => navigate('creators')}
              completedCollaborations={profileCompletedCollaborations}
              messageUnreadCount={messageUnreadCount}
            />
          </Suspense>
        )}

        {view === 'library' && (effectiveRole === 'listener' || (role === 'admin' && previewRole === 'listener')) && (
          <section className="page-wrap">
            <Suspense fallback={<NightjarSkeleton variant="page" count={4} label="Loading Listener Library" />}><ListenerLibrary
              onDiscoverCreators={()=>{setDirectoryRoleFilter('all');navigate('creators');}}
              key={'listener-library-' + demoSessionKey}
              onPlayRelease={(release)=>{const track=releaseToTrack(release); setTracks((items)=>items.some((item)=>item.id===track.id)?items:[...items,track]); togglePlayback(track);}}
              onPlayMoment={(release,seconds)=>{
                const track=releaseToTrack(release);
                if (hiddenByBoundaries(track,listeningBoundaries)) {notify('This saved moment matches a listening boundary. Adjust your preference in Discover before playing.');return;}
                setTracks((items)=>items.some((item)=>item.id===track.id)?items:[...items,track]);
                setMomentSeek({releaseId:track.id,seconds,nonce:Date.now()});
                setPlaying(track.id);
              }}
              notify={notify}
              demoMode={demoMode}
              simulationMode={simulationMode}
            /></Suspense>
          </section>
        )}

        {view === 'calendar' && user && ageVerified && !liveRolePreview && (
          <Suspense fallback={<NightjarSkeleton variant="page" count={3} label="Opening your Nightjar calendar" />}>
            <PersonalCalendar role={effectiveRole ?? 'listener'} showCreatorReleases={uniqueProfileEditableRoles.includes('creator') || effectiveRole === 'creator'} simulationMode={simulationMode || demoMode} notify={notify}
              onOpenStudio={() => {void (async()=>{
                try {
                  if (!canAdmin && effectiveRole !== 'creator') {
                    const result = await nightjarAccount.setActiveRole('creator');
                    if (result.activeRole !== 'creator') throw new Error('Nightjar could not switch to your approved VA Creator workspace.');
                    setRole('creator');void loadProfile('creator');
                  }
                  navigate('creator');void loadCreatorDashboard();
                  window.setTimeout(()=>document.getElementById('creator-pipeline')?.scrollIntoView({behavior:'smooth',block:'start'}),150);
                } catch(error) {notify(error instanceof Error?error.message:'Could not open VA Creator Studio.');}
              })();}}
              onOpenModeration={() => setModerationOpen(true)}/>
          </Suspense>
        )}
        {view === 'settings' && (
          <NightjarSettings
            email={simulationMode ? undefined : user?.email}
            administrator={effectiveRole === 'admin' && canAdmin}
            simulationMode={demoMode}
            notify={notify}
            onProfile={() => { navigate('profile'); void loadProfile(); }}
            onCalendar={() => navigate('calendar')}
            onRoles={openMyRoles}
            onProtection={() => { navigate('protection'); void loadProtection(); }}
            onAdmin={() => { navigate('admin'); void loadAdminOverview(); void loadSecurityAlerts(); }}
            onSignOut={() => { void signOut(); }}
          />
        )}

        {view === 'profile' && !profileRolesPage && (
          <section className="page-section profile-page premium-profile-page">
            <div className="page-heading premium-profile-page-heading">
              <div><span className="eyebrow"><UserCircle2 size={14}/> YOUR NIGHTJAR</span><h1>Your profile should feel worth opening.</h1><p>Every Nightjar member gets a premium personal profile. Professional roles add specialist identity and tools without turning Listener profiles into second-class accounts.</p></div>
              <div className="profile-heading-actions">
                {user?.userId && (effectiveRole === 'admin' ? profile.adminCommunityVisible === true : profile.publicProfile !== false) && <button className="secondary-button" onClick={()=>openPublicProfile(user.userId,effectiveRole === 'admin' ? 'listener' : effectiveRole ?? undefined)}>View my public profile</button>}
                {user?.userId && (effectiveRole === 'admin' ? profile.adminCommunityVisible === true : profile.publicProfile !== false) && (effectiveRole === 'admin' || ['creator','writer','editor','artist'].includes(String(effectiveRole))) && !demoMode && <button type="button" className="secondary-button" onClick={()=>void shareNightjarProfile({
                  url:publicProfileUrl(window.location.origin,user.userId,effectiveRole === 'admin' ? 'listener' : effectiveRole as ShareableProfileRole),
                  name:String(profile.displayName || user.name || 'Nightjar creator'),
                  roleLabel:effectiveRole === 'admin' ? 'Nightjar Team' : effectiveRole === 'creator' ? 'VA Creator' : effectiveRole === 'editor' ? 'Audio Editor' : effectiveRole === 'writer' ? 'Writer' : 'Artist',
                  notify,
                })}><Share2 size={15} aria-hidden="true"/> Share my profile</button>}
                {(!canAdmin || interactiveRoleTest) && <button type="button" className="primary-button" onClick={openMyRoles}><ShieldCheck size={16} /> My Roles · Apply or switch</button>}
              </div>
            </div>

            {effectiveRole === 'listener' && !liveRolePreview && (
              <RoleDashboard
                eyebrow="LISTENER ACCOUNT"
                title="Your Nightjar at a glance."
                description="Your profile, saved releases, followed profiles and latest account activity in one place."
                metrics={[
                  {label:'Profile',value:profileCompletion + '%',detail:'Public identity completeness',destination:'your profile',onClick:()=>document.querySelector('.premium-user-profile')?.scrollIntoView({behavior:'smooth',block:'start'})},
                  {label:'Favourites',value:favouriteReleaseIds.length,detail:'Saved releases',destination:'your library',onClick:()=>navigate('library')},
                  {label:'Following',value:followingProfileIds.length,detail:'Public profiles',destination:'the professional directory',onClick:()=>navigate('creators')},
                  {label:'Updates',value:notificationUnreadCount,detail:'Unread activity',destination:'notifications',onClick:()=>{setNotificationsOpen(true);window.scrollTo({top:0,behavior:'smooth'});}},
                ]}
              />
            )}

            {agePilotEligible && effectiveRole !== 'admin' && <section className="nj-didit-member-pilot" aria-label="Voluntary identity verification pilot">
              <div className="nj-didit-member-pilot-heading">
                <ShieldCheck size={22} aria-hidden="true"/>
                <div><span className="mini-label">AGE ASSURANCE · AUTHORISED TEST ACCOUNT</span>
                  <h2>Didit ID verification</h2>
                  <p>{ageProviderVerified
                    ? 'Your account has a completed, provider-confirmed 18+ check. The result is saved securely by Nightjar and reused when you sign in on another device.'
                    : 'Nightjar has invited this account to test ID verification. Your existing private-beta access remains active while you test. Verification is optional during this pilot.'}</p>
                </div>
                <span className={ageProviderVerified ? 'status-pill' : 'status-pill muted'}>{ageProviderVerified ? 'VERIFIED 18+' : ageEnvironment === 'live' ? 'LIVE PILOT' : 'SANDBOX'}</span>
              </div>
              {!ageProviderVerified && <>
                <label className="nj-didit-member-consent"><input type="checkbox" checked={agePilotConsent} onChange={(event) => setAgePilotConsent(event.target.checked)} />
                  <span>I understand that Didit may request identification, that live checks may incur a charge to Nightjar, and that I can retain my current tester access without starting this check.</span>
                </label>
                <div className="nj-didit-member-actions">
                  <button type="button" className="primary-button" disabled={!ageConfigured || !agePilotConsent || ageLoading} onClick={() => void openAgeCheck(false, true)}>
                    <LockKeyhole size={15} aria-hidden="true"/>{ageLoading ? 'Opening Didit…' : ageSessionActive ? 'Continue existing Didit check' : ageEnvironment === 'live' ? 'Start my Didit ID check' : 'Start sandbox check'}
                  </button>
                  <button type="button" className="secondary-button" onClick={() => void refreshAgeStatus()} disabled={ageLoading}><RefreshCw size={15}/> Refresh status</button>
                  {ageLaunchUrl && <a href={ageLaunchUrl} className="secondary-button" target="_blank" rel="noopener noreferrer">Open verification session <ArrowRight size={15}/></a>}
                </div>
                {!ageConfigured && <p className="nj-didit-member-notice">Didit has not yet been configured for this Firebase environment. No verification can start.</p>}
                {ageEnvironment !== 'live' && <p className="nj-didit-member-notice">Sandbox tests do not grant permanent 18+ verification. Live approval must be confirmed by Didit.</p>}
                {ageStatus === 'PENDING' && <p className="nj-didit-member-notice">Your verification is in progress. Nightjar will check the provider result and update this account automatically.</p>}
              </>}
              <p className="nj-didit-member-footnote">Nightjar keeps only the server-verified age-assurance result and provider reference—not your raw identity images or a reusable login token stored in your browser. A new ID check is requested only if verification is revoked or a valid recheck is required.</p>
            </section>}

            {effectiveRole !== 'admin' && profile?.onboardingComplete !== true && !demoMode && (
              <section className="panel nj-profile-setup-resume" aria-label="Finish your personal Nightjar profile">
                <div>
                  <span className="mini-label">YOUR PROFILE · FINISH WHEN READY</span>
                  <h2>Your Nightjar setup is waiting for you.</h2>
                  <p>Complete the remaining personal profile fields whenever it suits you. Your Listener access and any approved professional roles stay available.</p>
                </div>
                <button type="button" className="primary-button" onClick={()=>setShowOnboarding(true)}>
                  <UserCircle2 size={16}/> Finish profile setup
                </button>
              </section>
            )}
            {profileSaveError && <div className="admin-note" role="alert"><ShieldAlert size={17}/><div><strong>Profile save unsuccessful</strong><span>{profileSaveError} Your edited fields have not been cleared.</span></div></div>}
            {!demoMode && user && profileBaseline && <ProfileSectionBoundary title="Cloud profile draft"><Suspense fallback={<div className="nj-cloud-profile-draft">Checking your account draft…</div>}>
              <CloudProfileDraft key={user.userId+':'+(effectiveRole==='admin'?'admin':profileEditRole)}
                role={effectiveRole==='admin'?'admin':profileEditRole}
                profile={profile} dirty={profileDirty} setProfile={setProfile}
                register={(controller)=>{profileCloudDraftRef.current=controller;}} notify={notify}/>
            </Suspense></ProfileSectionBoundary>}
            <ProfileSectionBoundary title="Your profile editor"><Suspense fallback={<NightjarSkeleton variant="page" count={4} label="Loading your Nightjar profile" />}>
              <UserProfileStudio
                profile={profile}
                setProfile={setProfile}
                userName={simulationMode ? simulationIdentity.name : user?.name}
                userEmail={simulationMode ? (previewRole ?? 'listener') + '.qa@nightjar.invalid' : user?.email}
                role={effectiveRole}
                roles={effectiveRole === 'admin' ? undefined : uniqueProfileEditableRoles}
                profileCompletion={profileCompletion}
                profileLoading={profileLoading}
                profileDirty={profileDirty}
                profileBaseline={profileBaseline}
                profileImageBusy={profileImageBusy}
                combinedTagOptions={combinedProfileTagOptions}
                tasteVector={tasteVector}
                onUploadAvatar={uploadProfileAvatar}
                onRemoveAvatar={removeProfileImage}
                onSave={saveProfile}
                onRevert={()=>profileBaseline && setProfile(structuredClone(profileBaseline))}
                notify={notify}
                simulationMode={demoMode}
                onOpenEditorStudio={effectiveRole==='editor'?()=>{navigate('editor'); void loadEditorQueue(); void loadProfile();}:undefined}
              />
            </Suspense></ProfileSectionBoundary>

            {effectiveRole !== 'admin' && <section className="profile-identity-switcher panel">
              <div className="profile-identity-switcher-head">
                <div><span className="mini-label">ONE PROFILE · EVERY APPROVED ROLE</span><h2>Choose the identity you want to edit.</h2><p>Your name, avatar, handle and personal profile stay shared. Each professional identity keeps its own headline, services, availability, portfolio and working preferences.</p></div>
                <ShieldCheck size={19}/>
              </div>
              <div className="profile-identity-tabs" role="tablist" aria-label="Profile identities">
                {uniqueProfileEditableRoles.map((item)=><button type="button" role="tab" aria-selected={profileEditRole===item} className={profileEditRole===item?'active':''} key={item} onClick={()=>void switchProfileEditRole(item)}>{roleMeta[item].label}</button>)}
              </div>
              <div className="profile-identity-context"><span>Editing <strong>{roleMeta[profileEditRole].label}</strong></span><span>Workspace <strong>{effectiveRole ? roleMeta[effectiveRole].label : 'Listener'}</strong></span>{uniqueProfileEditableRoles.length>1&&<span><strong>{uniqueProfileEditableRoles.length}</strong> identities on one public profile</span>}</div>
            </section>}

            {effectiveRole !== 'admin' && <ProfileSectionBoundary title="Professional identity editor"><Suspense fallback={<NightjarSkeleton variant="cards" count={3} label="Loading role profile" />}>
              <RoleProfileExtension
                role={profileEditRole}
                profile={profile}
                setProfile={setProfile}
                portfolioOptions={profilePortfolioOptions}
                completedCollaborations={profileCompletedCollaborations}
              />
            </Suspense></ProfileSectionBoundary>}

            {profileEditRole === 'artist' && <section className="panel nj-profile-artist-handoff">
              <div><span className="mini-label">ARTIST / ARTWORK</span><h2>Your portfolio lives in Artist Studio.</h2><p>Your Artist identity is edited here, alongside your other approved roles. Uploads, artwork approvals and portfolio management have their own focused workspace.</p></div>
              <button type="button" className="primary-button" onClick={() => effectiveRole === 'artist' ? navigate('artist') : openMyRoles()}>{effectiveRole === 'artist' ? 'Open Artist Studio' : 'Switch to Artist role'} <ArrowRight size={15}/></button>
            </section>}

            {profileDirty && <div className="premium-profile-floating-save" role="region" aria-label="Unsaved profile changes" aria-busy={profileLoading}>
              <span><strong>{profileLoading ? 'Saving your profile…' : 'Profile changes waiting.'}</strong><small>Save your personal and professional changes together.</small></span>
              <button type="button" className="primary-button" disabled={profileLoading} aria-label={profileLoading ? 'Saving profile changes' : 'Save all profile changes'} onClick={()=>void saveProfile()}>
                {profileLoading ? <RefreshCw size={17} className="nj-save-loading-icon" aria-hidden="true"/> : <Check size={17} aria-hidden="true"/>}
                <span className="nj-save-label-full">{profileLoading ? 'Saving…' : 'Save all profile changes'}</span>
                <span className="nj-save-label-mobile">{profileLoading ? 'Saving…' : 'Save changes'}</span>
              </button>
            </div>}

            <section className="profile-account-hub">
              <div className="profile-account-hub-head">
                <div><span className="mini-label">ACCOUNT & SUPPORT</span><h2>Your Nightjar account, neatly in one place.</h2><p>App maintenance, role access and Nightjar support belong to the account — not to one creative identity. These tools stay consistent whichever profile role is active.</p></div>
                <ShieldCheck size={20}/>
              </div>
              <div className="profile-account-hub-grid">
                <article className="panel profile-account-tool-card">
                  <div className="profile-account-tool-head"><div><span className="mini-label">APP & DEVICE</span><h3>Keep Nightjar current</h3></div><RefreshCw size={17}/></div>
                  <p>Check the deployed build or clear stale app caches without touching your account or cloud data.</p>
                  <AppUpdateControl compact />
                </article>
                {effectiveRole !== 'admin' ? <article className="panel profile-account-tool-card">
                  <div className="profile-account-tool-head"><div><span className="mini-label">PROFESSIONAL ACCESS</span><h3>My Roles</h3></div><ShieldCheck size={17}/></div>
                  <p>Apply for additional professions, review outstanding requests or switch between approved workspaces — all on one account.</p>
                  <button type="button" className="secondary-button" onClick={openMyRoles}>Open My Roles <ArrowRight size={15}/></button>
                </article> : <article className="panel profile-account-tool-card"><div className="profile-account-tool-head"><div><span className="mini-label">ADMINISTRATOR</span><h3>Professional roles are member-facing</h3></div><ShieldCheck size={17}/></div><p>Administrator identity stays separate from Listener and professional role applications.</p></article>}
              </div>
              {effectiveRole !== 'admin' && <Suspense fallback={<NightjarSkeleton variant="cards" count={2} label="Loading Nightjar wallet" />}><NightjarWalletPanel compact notify={notify} professional={hasProfessionalProfileRole} demoMode={demoMode} /></Suspense>}
            </section>

            <div className="premium-profile-account-grid">
              <article className="panel nj-account-activity premium-account-activity">
                <div className="panel-title"><div><span className="mini-label">ACCOUNT ACTIVITY</span><h2>Your Nightjar pulse</h2></div><Bell size={17}/></div>
                <p className="panel-note">Useful account and community changes live here. Protected audit events remain in the Protection Centre.</p>
                <div className="nj-account-activity-list">
                  {notifications.slice(0,8).map((item:any)=><button key={item.id} className={item.read ? '' : 'unread'} onClick={()=>void markNotificationRead(item)}><span>{item.subtype === 'creator' ? <Mic2 size={14}/> : item.subtype === 'writer' ? <FileText size={14}/> : item.subtype === 'editor' ? <FileCheck2 size={14}/> : <Bell size={14}/>}</span><div><strong>{item.title}</strong><small>{item.message}</small></div>{item.read !== true && <em>NEW</em>}</button>)}
                  {!notifications.length && <div className="people-empty"><Bell size={17}/><strong>Quiet for now.</strong><span>Account and community updates will appear here when something changes.</span></div>}
                </div>
              </article>
              <NotificationPreferences key={'notification-prefs-' + demoSessionKey} notify={notify} simulationMode={demoMode} isAdministrator={canAdmin && !demoMode && !simulationMode && !liveRolePreview} />
            </div>
          </section>
        )}

        {view === 'profile' && profileRolesPage && (!canAdmin || interactiveRoleTest) && (
          <section className="page-section profile-page professional-roles-page">
            <div className="page-heading">
              <div>
                <span className="eyebrow"><ShieldCheck size={14}/> PROFESSIONAL ACCESS</span>
                <h1>My Roles</h1>
                <p>Request one or several creative roles, track your applications and open each approved workspace. Your personal account and Listener access stay intact.</p>
              </div>
              <button type="button" className="secondary-button" onClick={openProfileEditor}><ArrowLeft size={16}/> Back to profile</button>
            </div>
            <Suspense fallback={<NightjarSkeleton variant="cards" count={3} label="Loading My Roles" />}>
              <ProfessionalRoleManager
                key={'roles-' + demoSessionKey + '-' + (simulationMode ? 'qa' : 'member')}
                notify={notify}
                simulationMode={interactiveRoleTest}
                initialRole={previewRole ?? undefined}
                onRoleChanged={(nextRole) => {
                  const next = nextRole as PreviewRole;
                  if (interactiveRoleTest) {
                    setPreviewRole(next);
                    navigate(next === 'creator' ? 'creator' : next === 'writer' ? 'writer' : next === 'editor' ? 'editor' : next === 'artist' ? 'artist' : 'discover');
                    return;
                  }
                  setRole(next);
                  setPreviewRole(null);
                  navigate('profile');
                  void loadProfile(next);
                }}
              />
            </Suspense>
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
              <div className="admin-panel"><span className="admin-icon"><ClipboardX size={19} /></span><span className="mini-label">EVIDENCE LOG</span><h2>Quiet security record</h2><p>Blocked extraction, print and capture-related signals can be retained against a protected reader session. Browser screenshot signals are explicitly labelled as possible; native callbacks are recorded separately.</p><strong>{protectionEvidence.length} recorded signal{protectionEvidence.length === 1 ? '' : 's'}</strong><div className="protection-evidence-preview">{protectionEvidence.slice(0,5).map((item:any)=><div key={item.id}><span>{protectionEventLabel(item.eventType)}</span><small>{protectionConfidenceLabel(item.detectionConfidence) ?? 'Recorded interaction'}{item.createdAt ? ' · ' + new Date(item.createdAt).toLocaleString('en-GB') : ''}</small></div>)}{!protectionEvidence.length && <small>No protection signals recorded for this account yet.</small>}</div><button className="secondary-button" onClick={() => void loadProtection()}>Refresh evidence</button></div>
              <div className="admin-panel"><span className="admin-icon"><FileText size={19} /></span><span className="mini-label">MY CASES</span><h2>Reports and support</h2><p>{protectionReports.length ? `${protectionReports.length} case${protectionReports.length === 1 ? '' : 's'} recorded on this account.` : 'No protection reports have been submitted from this account yet.'}</p><div className="evidence-list">{protectionReports.slice(0, 6).map((report) => <div key={report.caseId}><strong>{report.caseId}</strong><span>{report.category} · {report.status}</span></div>)}</div></div>
              <div className="admin-panel"><span className="admin-icon"><Ban size={19} /></span><span className="mini-label">ACCOUNT CONTROL</span><h2>Block and disengage</h2><p>If a user is causing a problem, blocking is available from supported account surfaces. For serious incidents, block and report rather than relying on either action alone.</p><button className="secondary-button" onClick={() => notify('Open the relevant user profile to block that account.')}>How blocking works</button></div>
            </div>
            <div className="protection-footnote"><strong>Immediate danger?</strong><span>Nightjar is not emergency services. In the UK, call 999 for immediate danger. For platform incidents, use this report path so relevant Nightjar records can be reviewed.</span></div>
          </section>
        )}

        {view === 'writer' && effectiveRole === 'writer' && !liveRolePreview && (
          <section className="page-wrap role-studio-page">
            <div className="page-heading"><div><p className="eyebrow"><FileText size={14}/> WRITER STUDIO</p><h1>Write it. Protect it.</h1><p>Private manuscripts, protected uploads and direct NightJar administrator review for marketplace submissions.</p></div></div>
            <RoleDashboard
              eyebrow="WRITER COMMAND CENTRE"
              title="Your writing workflow."
              description="Nightjar prioritises manuscripts, revisions and identity tasks without exposing protected script text."
              metrics={[
                {label:'Manuscripts',value:writerScripts.length,detail:'Your current library',destination:'the manuscript workspace',onClick:()=>document.querySelector('.writer-layout, .writer-create-card')?.scrollIntoView({behavior:'smooth',block:'start'})},
                {label:'Revisions',value:writerScripts.filter((item:any)=>String(item.status).toLowerCase().includes('revision')).length,detail:'Needs attention',destination:'the manuscript workspace',onClick:()=>document.querySelector('.writer-layout, .writer-create-card')?.scrollIntoView({behavior:'smooth',block:'start'})},
                {label:'Collaborations',value:profileCompletedCollaborations,detail:'Completed on Nightjar',destination:'the collaboration workspace',onClick:()=>{const target=document.querySelector('.collaboration-hub');if(target)target.scrollIntoView({behavior:'smooth',block:'start'});else navigate('profile');}},
                {label:'Messages',value:messageUnreadCount,detail:messageNeedsReplyCount ? messageNeedsReplyCount + ' need your reply' : messageAwaitingReplyCount ? messageAwaitingReplyCount + ' awaiting reply' : 'Unread private threads',destination:'messages',onClick:()=>navigate('messages')},
              ]}
              actions={writerActions}
            />
            <div className="writer-create-card">
              <div><span className="mini-label">NEW SCRIPT</span><h2>Start or upload a manuscript</h2><p>Every new script begins private. Write inside Nightjar or bring in an existing manuscript without retyping it.</p></div>
              <div className="writer-create-stack">
                <div className="writer-create-form">
                  <input value={writerDraftTitle} onChange={(event)=>setWriterDraftTitle(event.target.value)} placeholder="Working title · optional for uploads"/>
                  <button className="primary-button" onClick={()=>void createWriterDraft()}>Create draft <FileText size={15}/></button>
                </div>
                <div className="writer-upload-row">
                  <span className="writer-create-or">OR</span>
                  <label className={writerUploadBusy ? 'secondary-button writer-upload-button disabled' : 'secondary-button writer-upload-button'}>
                    <Upload size={15}/> {writerUploadBusy ? 'Uploading manuscript…' : 'Upload script'}
                    <input
                      type="file"
                      accept=".txt,.md,.markdown,.rtf,.doc,.docx,.pdf,text/plain,text/markdown,application/rtf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf"
                      disabled={writerUploadBusy}
                      onChange={(event)=>{
                        const file=event.target.files?.[0];
                        event.currentTarget.value='';
                        if(file) void uploadWriterScript(file);
                      }}
                    />
                  </label>
                  <small>TXT · Markdown · RTF · Word · PDF · max 8 MB. Uploaded originals stay private and protected.</small>
                </div>
                <label className="writer-initial-artwork">Optional cover image for this new script
                  <input type="file" accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp" disabled={writerUploadBusy}
                    onChange={(event) => {
                      const file = event.target.files?.[0] ?? null;
                      if (file && (!['image/png','image/jpeg','image/webp'].includes(file.type) || !file.size || file.size > 5 * 1024 * 1024)) {
                        notify('Script artwork must be a PNG, JPG or WebP image no larger than 5 MB.');
                        event.currentTarget.value = '';
                        setWriterNewArtworkFile(null);
                        return;
                      }
                      setWriterNewArtworkFile(file);
                    }}/>
                  <small>{writerNewArtworkFile ? writerNewArtworkFile.name + ' · will be sent for separate admin approval' : 'Optional · add an image now, or any time after approval and publication.'}</small>
                </label>
              </div>
            </div>
            <div className="writer-layout"><aside className="writer-library">{writerScripts.map((script:any)=><button key={script.id} className={writerSelected?.id===script.id?'library-item active':'library-item'} onClick={()=>{setWriterSelected(script); void loadWriterPermissions(script.id);}}><span>{script.status}</span><strong>{script.title}</strong><em>v{script.version}</em></button>)}{!writerScripts.length&&<div className="people-empty"><FileText size={18}/><strong>No manuscripts yet.</strong><span>Create a script to begin.</span></div>}</aside>{writerSelected?<article className="writer-editor-card"><div className="editor-toolbar"><div><span className="mini-label">MANUSCRIPT</span><input value={writerSelected.title??''} readOnly={!['Draft','Revision requested','Rejected'].includes(String(writerSelected.status ?? 'Draft'))} onChange={e=>setWriterSelected({...writerSelected,title:e.target.value})}/></div><span className="status-pill">{writerSelected.status} · v{writerSelected.version}</span></div>{writerSelected.sourceFile&&<div className="writer-source-file"><div><Upload size={15}/><span><strong>{writerSelected.sourceFile.fileName}</strong><small>{Math.max(1,Math.round(Number(writerSelected.sourceFile.sizeBytes??0)/1024))} KB · protected source upload</small></span></div><span className="status-pill">PRIVATE SOURCE</span></div>}<textarea className="script-editor" value={writerSelected.content??''} readOnly={!['Draft','Revision requested','Rejected'].includes(String(writerSelected.status ?? 'Draft'))} onChange={e=>setWriterSelected({...writerSelected,content:e.target.value})} placeholder={writerSelected.sourceFile?'Optional editable text copy. Your uploaded source manuscript remains the protected original.':'Begin writing…'}/>{['Submitted','Under review'].includes(String(writerSelected.status)) && <p className="writer-submission-status"><ShieldCheck size={16}/> Submitted to NightJar for admin review. Your manuscript is protected while you wait; no Audio Editor assignment is required.</p>}{['Revision requested','Rejected'].includes(String(writerSelected.status)) && writerSelected.lastEditorialComment && <p className="writer-submission-status"><FileText size={16}/> Review feedback: {writerSelected.lastEditorialComment}</p>}<div className="editor-actions"><button className="secondary-button" disabled={!['Draft','Revision requested','Rejected'].includes(String(writerSelected.status ?? 'Draft'))} onClick={()=>void saveWriterScript()}>Save</button><button className="secondary-button" onClick={()=>void createWriterVersion()}>Record version</button><button className="secondary-button" onClick={()=>void shareWriterScript()}><Users size={14}/> Share full script</button><button className="primary-button" disabled={!['Draft','Revision requested','Rejected'].includes(String(writerSelected.status ?? 'Draft'))} onClick={()=>{window.dispatchEvent(new CustomEvent('nightjar:open-workspace-section',{detail:'writer-rights'}));window.setTimeout(()=>document.getElementById('writer-rights-review')?.scrollIntoView({behavior:'smooth',block:'start'}),50);}}>{['Submitted','Under review'].includes(String(writerSelected.status)) ? 'Awaiting admin review' : ['Approved','Published'].includes(String(writerSelected.status)) ? 'Approved by NightJar' : 'Review rights & submit'}</button><button className="ghost-button" onClick={()=>void openProtectedReader(writerSelected.id)}><LockKeyhole size={14}/> Protected reader</button>{['Draft','Rejected'].includes(String(writerSelected.status??'Draft'))&&<button className="ghost-button" onClick={()=>void deleteWriterScript()}>Delete manuscript</button>}</div><div className="script-permission-panel"><div><span className="mini-label">FULL-SCRIPT ACCESS</span><strong>{writerPermissionsLoading?'Loading…':writerPermissions.filter((item:any)=>!item.revokedAt).length+' active grant'+(writerPermissions.filter((item:any)=>!item.revokedAt).length===1?'':'s')}</strong></div>{writerPermissions.length===0?<p>No full-script access grants yet.</p>:writerPermissions.map((permission:any)=><div className="script-permission-row" key={permission.recipientUserId}><div><strong>{permission.recipientUserId}</strong><span>Copy {permission.allowCopy?'on':'off'} · Export {permission.allowExport?'on':'off'}{permission.expiresAt?' · expires '+new Date(permission.expiresAt).toLocaleString('en-GB'):''}</span></div>{permission.revokedAt?<em>Revoked</em>:<button className="ghost-button" onClick={()=>void revokeWriterPermission(permission)}>Revoke access</button>}</div>)}</div></article>:<div className="writer-editor-card"><div className="people-empty"><FileText size={18}/><strong>Select a manuscript.</strong><span>Choose a live script from your library.</span></div></div>}</div>
            {writerSelected && <WorkspaceSection userId={user?.userId ?? 'guest'} sectionId="writer-artwork" title="Manuscript artwork" summary="Optional cover art and approvals"><Suspense fallback={<NightjarSkeleton variant="list" count={1} label="Loading manuscript artwork controls" />}><WriterScriptArtwork key={'writer-artwork-' + String(writerSelected.id)} script={writerSelected} onUpdated={(next)=>{setWriterSelected(next); setWriterScripts((items:any[])=>{const updated=items.map((item:any)=>item.id===next.id?next:item); if(simulationMode) writeDemo('writerScripts',updated); return updated;});}} notify={notify} simulationMode={simulationMode}/></Suspense></WorkspaceSection>}
            {writerSelected && <WorkspaceSection userId={user?.userId ?? 'guest'} sectionId="writer-rights" title="Script rights and submission" summary="Licence terms and review" defaultOpen><Suspense fallback={<NightjarSkeleton variant="list" count={2} label="Loading Writer rights controls" />}><WriterRightsPanel key={'writer-rights-' + demoSessionKey + '-' + String(writerSelected?.id ?? '')} script={writerSelected} onUpdated={(next)=>{setWriterSelected(next); setWriterScripts((items:any[])=>{const updated=items.map((item:any)=>item.id===next.id?next:item); if(simulationMode) writeDemo('writerScripts',updated); return updated;});}} notify={notify} simulationMode={simulationMode} submitManuscript={submitWriterScript} /></Suspense></WorkspaceSection>}
            {writerSelected && String(writerSelected.status)!=='Draft' && <WorkspaceSection userId={user?.userId ?? 'guest'} sectionId="writer-review" title="Review conversation" summary="Comments and manuscript feedback" defaultOpen><Suspense fallback={<NightjarSkeleton variant="list" count={1} label="Loading NightJar review conversation" />}><ManuscriptReviewConversation key={'writer-review-thread-'+String(writerSelected.id)} scriptId={String(writerSelected.id)} audience="writer" notify={notify} demoMode={demoMode} simulationMode={simulationMode}/></Suspense></WorkspaceSection>}
            <WorkspaceSection userId={user?.userId ?? 'guest'} sectionId="writer-negotiations" title="Rights negotiations" summary="Offers and agreements"><Suspense fallback={<NightjarSkeleton variant="list" count={2} label="Loading Writer rights negotiations" />}><ScriptLicenceWorkspace role="writer" currentUserId={user?.userId} demoMode={demoMode} simulationMode={simulationMode} notify={notify} onMessageUser={(uid)=>{setMessageRecipientUserId(uid);setMessageCollaborationId(null);navigate('messages');}}/></Suspense></WorkspaceSection>
            <WorkspaceSection userId={user?.userId ?? 'guest'} sectionId="writer-collaborations" title="Collaborations" summary="Projects and creative partnerships"><Suspense fallback={<NightjarSkeleton variant="list" count={2} label="Loading Writer collaborations" />}><CollaborationHub key={'writer-collab-' + demoSessionKey} role="writer" notify={notify} demoMode={demoMode} simulationMode={simulationMode} onMessageUser={(userId,collaborationId)=>{ setMessageRecipientUserId(userId); setMessageCollaborationId(collaborationId??null); navigate('messages'); }} /></Suspense></WorkspaceSection>
          </section>
        )}

        {view === 'editor' && effectiveRole === 'editor' && !liveRolePreview && (
          <Suspense fallback={<NightjarSkeleton variant="page" count={5} label="Loading Editor Studio" />}>
            <EditorStudio
              profile={profile}
              setProfile={setProfile}
              profileLoading={profileLoading}
              profileDirty={profileDirty}
              profileBaseline={profileBaseline}
              onSaveProfile={saveProfile}
              onRevertProfile={()=>profileBaseline && setProfile(structuredClone(profileBaseline))}
              profilePortfolioOptions={profilePortfolioOptions}
              completedCollaborations={profileCompletedCollaborations}
              editorQueue={editorQueue}
              editorSelected={editorSelected}
              setEditorSelected={setEditorSelected}
              onReviewScript={reviewEditorScript}
              accountStatus={accountStatus}
              messageUnreadCount={messageUnreadCount}
              messageNeedsReplyCount={messageNeedsReplyCount}
              messageAwaitingReplyCount={messageAwaitingReplyCount}
              actions={editorActions}
              demoMode={demoMode}
              simulationMode={simulationMode}
              demoSessionKey={demoSessionKey}
              notify={notify}
              onOpenMessages={()=>navigate('messages')}
              onMessageUser={(userId,collaborationId)=>{ setMessageRecipientUserId(userId); setMessageCollaborationId(collaborationId??null); navigate('messages'); }}
            />
          </Suspense>
        )}

        {view === 'admin' && canAdmin && !simulationMode && (
          <section className={adminPanel || adminPeopleRole ? 'page-wrap admin-page admin-detail-active' : 'page-wrap admin-page'}>
            <div className="page-heading admin-owner-heading">
              <div><p className="eyebrow"><Settings2 size={14} /> ADMINISTRATOR WORKSPACE</p>
              <h1>{adminWorkspace === 'overview' ? 'Owner dashboard' : ({ people:'People & accounts', content:'Content & approvals', launch:'Launch readiness', finance:'Finance & subscriptions', security:'Safety & security', assistance:'Admin assistance', tools:'Platform tools' } as Record<string,string>)[adminWorkspace]}</h1>
              <p>{adminWorkspace === 'overview' ? 'Daily priorities, pending decisions and the right tools — without endless scrolling.' : 'A focused Nightjar workpage. Choose another section above to move between administrative tasks.'}</p></div>
              <button className="secondary-button" onClick={() => { void loadAdminOverview(); void loadSecurityAlerts(); void loadAuthenticationEvents(); void loadAdminApplications(); void loadAdminCreatorSuggestions(); void loadAdminReports(); void loadAdminReviews(); void loadAdminEditorial(); void loadPendingImages(); void loadCommercialControls(); }}><RefreshCw size={14}/> Refresh</button>
            </div>
            <AdminWorkspaceTabs
              active={adminWorkspace}
              onChange={openAdminWorkspace}
              pendingApplications={applicationGroups.pending.length}
              pendingImages={imageModeration.length}
              openAlerts={securityAlerts.filter((item:any)=>item.status === 'open').length}
            />
            {adminWorkspace === 'assistance' && <AdminAssistance initialEmail={assistancePrefillEmail} onPeople={() => openAdminWorkspace('people')} onSafety={() => openAdminWorkspace('security')} onMail={() => openAdminWorkspace('tools')} />}
            {adminWorkspace === 'overview' && <RoleDashboard
              eyebrow="OWNER ACTION CENTRE"
              title="Exceptions first."
              description="Nightjar surfaces items that require an owner decision before routine totals, so operational risk does not get buried in dashboards."
              metrics={[
                {label:'Security',value:securityAlerts.filter((item:any)=>item.status === 'open').length,detail:'Open human-review alerts',destination:'administrator security alerts',onClick:()=>openAdminWorkspace('security')},
                {label:'Images',value:imageModeration.length,detail:'Awaiting moderation',destination:'image moderation',onClick:()=>openAdminPanel('images')},
                {label:'Applications',value:applicationGroups.pending.length,detail:'New applications awaiting approval',destination:'professional application bank',onClick:()=>openAdminPanel('approvals')},
                {label:'Past due',value:commercialOverview?.subscriptions.pastDue ?? 0,detail:'Billing attention',destination:'subscription ledger',onClick:()=>openAdminPanel('subscriptions')},
              ]}
              actions={adminActions}
              loading={adminOverviewLoading}
            />}
            {adminWorkspace === 'launch' && <>
            <Suspense fallback={<NightjarSkeleton variant="cards" count={3} label="Checking release readiness" />}>
              <AdminReleaseReadiness
                testing={adminOverview?.testing}
                provider={{ configured: ageConfigured, environment: ageEnvironment, providerVerified: ageProviderVerified }}
                openSecurityAlerts={securityAlerts.filter((item:any)=>item.status==='open').length}
                pendingImages={imageModeration.length}
                pendingApplications={applicationGroups.pending.length}
                onOpenDidit={() => document.getElementById('nightjar-admin-didit')?.scrollIntoView({ behavior:'instant', block:'start' })}
                onOpenTesters={() => openAdminWorkspace('people')}
                onOpenSecurityAlerts={() => openAdminWorkspace('security')}
                onOpenImages={() => openAdminPanel('images')}
                onOpenApplications={() => openAdminPanel('approvals')}
                onOpenAppUpdates={() => navigate('settings')}
                onOpenFinance={() => openAdminWorkspace('finance')}
                onOpenLegalReadiness={() => document.querySelector<HTMLElement>('.admin-legal-readiness')?.scrollIntoView({ behavior:'instant', block:'start' })}
              />
            </Suspense>
            <Suspense fallback={<NightjarSkeleton variant="cards" count={2} label="Loading legal readiness" />}>
              <AdminLegalReadiness />
            </Suspense>
            <section className="panel nj-didit-pilot" id="nightjar-admin-didit" aria-label="Administrator Didit verification pilot">
              <span className="mini-label">AGE ASSURANCE · ADMIN PILOT</span>
              <h2>Didit Age Verification</h2>
              <p>Test Didit as an administrator, or invite one registered beta tester to initiate their own voluntary check. Live verification can incur provider charges; other testers keep their normal bypass.</p>
              <div className="demo-state-line">
                <span className={ageConfigured ? 'status-pill' : 'status-pill muted'}>{ageLivePilotAvailable ? 'LIVE PILOT ENABLED' : ageConfigured ? 'DIDIT CONNECTED' : 'DIDIT SETUP REQUIRED'}</span>
                <span className={ageProviderVerified ? 'status-pill' : 'status-pill muted'}>{ageProviderVerified ? 'VERIFIED 18+' : ageProviderStatus.replaceAll('_', ' ')}</span>
                <span className={ageEnvironment === 'live' ? 'status-pill warning' : 'status-pill'}>{ageEnvironment === 'live' ? 'LIVE · MAY INCUR FEES' : 'SANDBOX / UNCONFIGURED'}</span>
              </div>
              <div className="admin-member-multi-role-actions">
                <button type="button" className="primary-button" disabled={ageLoading || !ageConfigured || ageProviderVerified}
                  onClick={() => void openAgeCheck(true)}>{ageLoading ? 'Opening Didit…' : ageProviderVerified ? 'Verified · no repeat needed' : ageEnvironment === 'live' ? 'Start my live Didit test' : 'Start sandbox Didit test'}</button>
                <button type="button" className="secondary-button" onClick={() => void refreshAgeStatus()}>Refresh Didit status</button>
                {ageLaunchUrl && !ageProviderVerified && <a className="secondary-button" href={ageLaunchUrl} target="_blank" rel="noopener noreferrer">Open existing Didit session</a>}
              </div>
              <small>Sandbox checks never count as production adult verification. All approved private-beta testers retain their separate temporary test-access status.</small>
              <div className="nj-didit-pilot-manager">
                <div><span className="mini-label">CONTROLLED TEST COHORT · ONE ACCOUNT AT A TIME</span><strong>Invite one tester to verify with Didit</strong>
                <p>A voluntary test invitation does not remove that tester's existing bypass, start a chargeable session, or affect any other member. Only registered, email-verified and allowlisted test accounts can join.</p></div>
                <div className="nj-didit-pilot-manager-controls">
                  <label htmlFor="nj-didit-pilot-email">Registered tester email</label>
                  <input id="nj-didit-pilot-email" type="email" autoComplete="off" placeholder="tester@example.com"
                    value={diditPilotEmail} onChange={(event) => { setDiditPilotEmail(event.target.value); setDiditPilotFeedback(''); }}
                    disabled={diditPilotBusy} />
                  <div className="nj-didit-pilot-manager-actions">
                    <button type="button" className="primary-button" disabled={diditPilotBusy} onClick={() => void updateDiditPilotAccess(true)}>Enable Didit pilot</button>
                    <button type="button" className="secondary-button" disabled={diditPilotBusy} onClick={() => void updateDiditPilotAccess(false)}>Disable pilot</button>
                  </div>
                  {diditPilotFeedback && <p className="nj-didit-pilot-feedback" role="status">{diditPilotFeedback}</p>}
                </div>
              </div>
            </section>
            </>}
            {adminWorkspace === 'tools' && <Suspense fallback={<NightjarSkeleton variant="cards" count={1} label="Loading Audio Upload Test" />}>
              <AdminAudioUploadTest />
            </Suspense>}
            {adminWorkspace === 'tools' && <Suspense fallback={<NightjarSkeleton variant="cards" count={2} label="Loading Nightjar Mail" />}>
              <AdminCommunications />
            </Suspense>}
            {adminWorkspace === 'content' && <Suspense fallback={<NightjarSkeleton variant="cards" count={2} label="Loading Editor showcase moderation" />}>
              <EditorShowcaseModeration />
            </Suspense>}
            {adminWorkspace === 'tools' && <div className="admin-owner-summary"><div><span className="mini-label">ACCESS</span><strong>Administrator only</strong><small>Backend owner allowlist + authenticated admin identity</small></div><button type="button" className="admin-owner-test" onClick={() => document.getElementById("demo-simulation-controls")?.scrollIntoView({ behavior: "smooth", block: "start" })}><span className="mini-label">LIVE PREVIEW</span><strong>Live role view</strong><small>Real Nightjar content · read-only · open controls ↓</small></button><div><span className="mini-label">OPERATIONS</span><strong>People · Content · Commercial · Safety</strong><small>Central control surface for the Nightjar app</small></div></div>}
            {adminWorkspace === 'tools' && <div className="admin-preview-control demo-control" id="demo-simulation-controls"><div><span className="mini-label">LIVE APP VIEW · NO DEMO DATA</span><strong>See Nightjar with the actual public content.</strong><p>See the real Listener catalogue and Creator marketplace. Other roles show public discovery only. Preview cannot change users, scripts, payments or permissions; private workspaces require an approved tester account.</p><div className="demo-state-line"><span className="status-pill">Real Firebase content</span><span className="status-pill muted">Read-only</span></div></div><div className="admin-preview-buttons"><button onClick={() => selectPreviewRole('listener')}>View live Listener</button><button onClick={() => selectPreviewRole('creator')}>View live VA Creator</button><button onClick={() => selectPreviewRole('writer')}>Writer public discovery</button><button onClick={() => selectPreviewRole('editor')}>Editor public discovery</button><button onClick={() => selectPreviewRole('artist')}>Artist public discovery</button><button onClick={() => openAdminPanel('live-preview')}>Audit script visibility</button></div></div>}
            {adminWorkspace !== 'overview' && adminWorkspace !== 'launch' && adminWorkspace !== 'assistance' && <div className="admin-grid nj-admin-focused-grid">
              {adminWorkspace === 'people' && <>
              <button className="admin-panel admin-tile" onClick={() => openAdminPeople('listener')}><span className="admin-icon"><Headphones size={19} /></span><span className="mini-label">PEOPLE · LISTENERS</span><h2>{adminOverviewLoading ? '…' : adminOverview?.people?.counts?.listener ?? 0}</h2><p>Listener accounts with access to the catalogue and listening surfaces.</p><strong>Open listener profiles <ArrowRight size={13} /></strong></button>
              <button className="admin-panel admin-tile" onClick={() => openAdminPeople('creator')}><span className="admin-icon"><Mic2 size={19} /></span><span className="mini-label">PEOPLE · CREATORS</span><h2>{adminOverviewLoading ? '…' : adminOverview?.people?.counts?.creator ?? 0}</h2><p>Creator accounts and their current onboarding status.</p><strong>Open creator profiles <ArrowRight size={13} /></strong></button>
              <button className="admin-panel admin-tile" onClick={() => openAdminPeople('admin')}><span className="admin-icon"><ShieldCheck size={19} /></span><span className="mini-label">PEOPLE · ADMINISTRATORS</span><h2>{adminOverviewLoading ? '…' : adminOverview?.people?.counts?.admin ?? 3}</h2><p>Owner accounts with administrator permissions enforced by the backend allowlist.</p><strong>Open administrator profiles <ArrowRight size={13} /></strong></button>
              <button className="admin-panel admin-tile" onClick={() => openAdminPeople('writer')}><span className="admin-icon"><FileText size={19} /></span><span className="mini-label">PEOPLE · WRITERS</span><h2>{adminOverviewLoading ? '…' : adminOverview?.people?.counts?.writer ?? 0}</h2><p>Writers with protected manuscript and script-marketplace access.</p><strong>Open writer profiles <ArrowRight size={13} /></strong></button>
              <button className="admin-panel admin-tile" onClick={() => openAdminPeople('editor')}><span className="admin-icon"><FileCheck2 size={19} /></span><span className="mini-label">PEOPLE · AUDIO EDITORS</span><h2>{adminOverviewLoading ? '…' : adminOverview?.people?.counts?.editor ?? 0}</h2><p>Audio Editors assigned to controlled production and editorial workflows.</p><strong>Open Audio Editor profiles <ArrowRight size={13} /></strong></button>
              <button className="admin-panel admin-tile" onClick={() => openAdminPeople('artist')}><span className="admin-icon"><ImagePlus size={19} /></span><span className="mini-label">PEOPLE · ARTISTS</span><h2>{adminOverviewLoading ? '…' : adminOverview?.people?.counts?.artist ?? 0}</h2><p>Approved human artists available for visual commissions and collaboration.</p><strong>Open Artist profiles <ArrowRight size={13} /></strong></button>
              </>}
              {adminWorkspace === 'tools' && <>
              <button className="admin-panel admin-tile" onClick={() => openAdminPanel('branding')}>
                <span className="admin-icon"><ImagePlus size={19}/></span>
                <span className="mini-label">APP INSTALL · NIGHTJAR LOGO</span>
                <h2>Fix installation icon</h2>
                <p>Create launcher icons from the approved Nightjar logo for mobile and desktop installations.</p>
                <strong>Open install branding <ArrowRight size={13}/></strong>
              </button>
              <button className="admin-panel admin-tile" onClick={() => openLiveMemberProfile()}>
                <span className="admin-icon"><Users size={19}/></span>
                <span className="mini-label">LIVE MEMBER PROFILES · ALL APPROVED ROLES</span>
                <h2>Live Profile Viewer</h2>
                <p>Select real users, compare several approved role identities, and open the same published profile view members see. No simulation and no changes to accounts.</p>
                <strong>Inspect live profiles <ArrowRight size={13}/></strong>
              </button>
              <button className="admin-panel admin-tile" onClick={() => openAdminPanel('live-preview')}>
                <span className="admin-icon"><FileText size={19}/></span>
                <span className="mini-label">LIVE ROLE PREVIEW · REAL TESTER CONTENT</span>
                <h2>Preview what VAs can actually see</h2>
                <p>View the genuine marketplace and check why tester manuscripts are, or are not, visible. No demo records or write actions.</p>
                <strong>Open live preview <ArrowRight size={13}/></strong>
              </button>
              </>}
              {adminWorkspace === 'content' && <>
              <button className="admin-panel admin-tile" onClick={() => openAdminPanel('approvals')}><span className="admin-icon"><Sparkles size={19} /></span><span className="mini-label">PROFESSIONAL APPROVALS</span><h2>{applicationGroups.pending.length}</h2><p>Bank and release VA Creator, Writer, Audio Editor and Artist applications in controlled intake waves.</p><strong>Open approval workflow <ArrowRight size={13} /></strong></button>
              <button className="admin-panel admin-tile" onClick={() => openAdminPanel('suggestions')}><span className="admin-icon"><Users size={19} /></span><span className="mini-label">CREATOR SUGGESTIONS</span><h2>{adminCreatorSuggestions.filter((item:any)=>item.status === 'new').length || 'Review'}</h2><p>Review Creators recommended by Nightjar members and track whether they were contacted, invited or joined.</p><strong>Open Creator suggestions <ArrowRight size={13} /></strong></button>
              <button className="admin-panel admin-tile" onClick={() => setModerationOpen(true)}><span className="admin-icon"><Headphones size={19} /></span><span className="mini-label">AUDIO LIBRARY · OWNER REVIEW</span><h2>Review audio uploads</h2><p>Listen to private creator audio already uploaded, distinguish drafts from submitted releases, and approve only completed moderation submissions.</p><strong>Open audio library &amp; moderation <ArrowRight size={13} /></strong></button>
              <button className="admin-panel admin-tile" onClick={() => openAdminPanel('images')}><span className="admin-icon"><ImagePlus size={19} /></span><span className="mini-label">IMAGE MODERATION</span><h2>{imageModeration.length || 'Review'}</h2><p>Approve every user-uploaded profile image, logo, release artwork and Artist portfolio image before it can render publicly.</p><strong>Open image queue <ArrowRight size={13} /></strong></button>
              <button className="admin-panel admin-tile" onClick={() => openAdminPanel('tags')}><span className="admin-icon"><Search size={19} /></span><span className="mini-label">TAG CATALOGUE</span><h2>{adminProfileTags.filter((tag:any)=>tag.status === 'candidate').length || 'Review'}</h2><p>Review custom Creator tags, promote useful recurring terms and hide unsuitable shared-catalogue entries.</p><strong>Open tag governance <ArrowRight size={13} /></strong></button>
              </>}

              {adminWorkspace === 'finance' && <>
              <button className="admin-panel admin-tile" onClick={() => openAdminPanel('revenue')}><span className="admin-icon"><BarChart3 size={19} /></span><span className="mini-label">REVENUE</span><h2>Commercial controls</h2><p>Open confirmed subscription revenue, capped creator-rate bands and payout readiness.</p><strong>Open commercial controls <ArrowRight size={13} /></strong></button>
              </>}
              {adminWorkspace === 'content' && <>
              <button className="admin-panel admin-tile" onClick={() => navigate('messages')}><span className="admin-icon"><MessageCircle size={19}/></span><span className="mini-label">NIGHTJAR ADMIN MESSAGING</span><h2>Open team inbox</h2><p>Send and receive private in-app messages with Writers, VAs, Audio Editors and Artists. Keep manuscript-specific review notes in the review queue.</p><strong>Open NightJar messages <ArrowRight size={13}/></strong></button>
              <button className="admin-panel admin-tile" onClick={() => openAdminPanel('editorial')}><span className="admin-icon"><FileCheck2 size={19} /></span><span className="mini-label">MANUSCRIPT APPROVALS</span><h2>Review scripts</h2><p>Approve or request changes for submitted Writer manuscripts. Marketplace review requires no Audio Editor assignment.</p><strong>Open manuscript review <ArrowRight size={13} /></strong></button>
              <button className="admin-panel admin-tile" onClick={() => openAdminPanel('reports')}><span className="admin-icon"><ShieldAlert size={19} /></span><span className="mini-label">REPORTS & FEEDBACK</span><h2>{(adminReports.length + adminCommunityReports.length) || 'Review'}</h2><p>User-submitted safety reports, technical issues and product feedback, identified by profile name rather than opaque account IDs.</p><strong>Open reports inbox <ArrowRight size={13} /></strong></button>
              <button className="admin-panel admin-tile" onClick={() => openAdminPanel('reviews')}><span className="admin-icon"><Star size={19} /></span><span className="mini-label">REVIEW MODERATION</span><h2>{adminReviewQueue.length || 'Review'}</h2><p>Approve or reject listener ratings and written reviews before they appear publicly.</p><strong>Open review queue <ArrowRight size={13} /></strong></button>
              </>}
              {adminWorkspace === 'security' && <>
              <button className="admin-panel admin-tile" onClick={() => navigate('protection')}><span className="admin-icon"><ShieldCheck size={19} /></span><span className="mini-label">SAFETY</span><h2>Access & moderation</h2><p>Review protection signals and age-assurance boundaries.</p><strong>Open Protection Centre <ArrowRight size={13} /></strong></button>
              </>}
              {adminWorkspace === 'finance' && <>
              <button className="admin-panel admin-tile subscription-tile" onClick={() => openAdminPanel('subscriptions')}><span className="admin-icon"><WalletCards size={19} /></span><span className="mini-label">SUBSCRIPTIONS</span><h2>{adminOverviewLoading ? '…' : commercialOverview?.subscriptions.active ?? adminOverview?.subscriptions?.active ?? 0}</h2><p>Active paid subscriptions tracked by the confirmed Nightjar billing ledger.</p><strong>{commercialOverview?.subscriptions.trialing ?? adminOverview?.subscriptions?.trialing ?? 0} trial · {commercialOverview?.subscriptions.pastDue ?? adminOverview?.subscriptions?.pastDue ?? 0} past due <ArrowRight size={13} /></strong></button>
              <button className="admin-panel admin-tile admin-economics" onClick={() => openAdminPanel('economics')}><span className="admin-icon"><Coins size={19} /></span><span className="mini-label">FINANCE LAB</span><h2>Model the whole split</h2><p>Simulate users, subscribers, price, VAT, fees, professional-role payouts, app funding, tax reserve and operator income.</p><strong>Open finance simulator <ArrowRight size={13} /></strong></button>
              </>}
              {adminWorkspace === 'tools' && <>
              <div className="admin-panel branding-admin-panel"><span className="admin-icon"><Upload size={19} /></span><span className="mini-label">BRANDING</span><h2>Nightjar logo</h2><p>{demoMode ? 'Preview a replacement logo locally while Demo Mode is active. Nothing is uploaded or changed in production.' : 'Upload or replace the logo used across Nightjar. A replacement stays pending until an administrator approves it in Image Moderation.'}</p><div className="logo-preview-grid"><div><span className="mini-label">CURRENT APPROVED</span><div className="logo-preview-box">{logoUrl ? <img src={logoUrl} alt={demoMode ? 'Nightjar demo logo preview' : 'Current approved Nightjar logo'} /> : <img src="/brand-logo" alt="Default Nightjar logo" />}</div></div>{!demoMode && pendingLogoPreviewUrl && <div><span className="mini-label">PENDING REPLACEMENT</span><div className="logo-preview-box pending-logo-preview"><img src={pendingLogoPreviewUrl} alt="Pending Nightjar logo replacement" /></div></div>}</div><div className="admin-data-actions"><label className="secondary-button upload-label"><Upload size={15} /> {demoMode ? 'Preview logo' : logoUploading ? 'Working…' : 'Replace logo'}<input type="file" accept="image/png,image/jpeg,image/webp" hidden disabled={logoUploading} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadLogo(file); event.currentTarget.value = ''; }} /></label>{logoUrl && <button className="ghost-button" onClick={()=>void removeLogo()}>{demoMode ? 'Clear preview' : 'Remove logo'}</button>}</div><strong>{demoMode ? 'Local preview only · PNG / JPG / WebP · max 5 MB' : pendingLogoPreviewUrl ? 'Replacement uploaded · open Image Moderation to approve it' : 'Approved logo is used inside Nightjar. The home-screen/PWA icon is the fixed official Nightjar mark shipped with the app release.'}</strong></div>
              </>}
            </div>}
            {canAdmin && adminWorkspace === 'people' && <section className="security-alert-panel" id="nightjar-admin-testers"><div><span className="mini-label">PRIVATE TESTING / EMAIL ALLOWLIST</span><h2>Approved tester emails</h2><p>Only the owner accounts and emails listed here can enter Nightjar while Closed Beta is enabled. Approved testers still verify their Firebase email normally; the temporary age bypass is clearly marked as test access.</p></div><div className="admin-application-wavebar"><label>Tester email<input type="email" value={adminTesterEmail} onChange={(event)=>setAdminTesterEmail(event.target.value)} placeholder="tester@example.com" /></label><button className="primary-button" disabled={!adminTesterEmail.trim()} onClick={()=>void changeClosedBetaTester(adminTesterEmail,true)}>Approve tester email</button></div><div className="security-alert-list">{(adminOverview?.testing?.approvedTesters ?? []).length === 0 ? <div className="people-empty"><ShieldCheck size={18}/><strong>No tester emails approved</strong><span>Owner administrator emails remain allowed automatically.</span></div> : (adminOverview?.testing?.approvedTesters ?? []).map((tester:any)=><article className="security-alert-row" key={tester.email}><div><strong>{tester.email}</strong><span>Private beta account access · temporary age-assurance bypass while test mode is enabled</span><em>Removing access blocks Nightjar backend use even if a Firebase Auth identity already exists.</em></div><div className="security-alert-actions"><button className="ghost-button" onClick={()=>void changeClosedBetaTester(tester.email,false)}>Remove tester access</button></div></article>)}</div><strong>{adminOverview?.testing?.approvedTesterCount ?? 0} approved tester email{(adminOverview?.testing?.approvedTesterCount ?? 0) === 1 ? '' : 's'} · Closed Beta {adminOverview?.testing?.closedBeta === false ? 'OFF' : 'ON'}</strong></section>}
            {adminWorkspace === 'security' && <div className="demo-warning admin-note"><ShieldCheck size={17} /><div><strong>ADMIN ACCESS MODEL</strong><span>Only the three approved Nightjar owner emails receive this role. Administrator access is enforced by the backend allowlist.</span></div></div>}
            {canAdmin && adminWorkspace === 'security' && <AdminSecurityAlerts
              alerts={securityAlerts}
              loading={securityAlertsLoading}
              evidenceLoading={securityEvidenceLoading}
              onRefresh={() => { void loadSecurityAlerts(); }}
              onReview={(alert) => { void openSecurityAlertEvidence(alert); }}
              onBenign={(alert) => { void closeSecurityAlertBenign(alert); }}
              onRevoke={(alert) => { void revokeSessionsFromSecurityAlert(alert); }}
              onSuspend={(alert) => { void suspendFromSecurityAlert(alert); }}
            />}
            {canAdmin && adminWorkspace === 'security' && <AdminAuthenticationLog
              events={authenticationEvents}
              loading={authenticationEventsLoading}
              onRefresh={() => { void loadAuthenticationEvents(); }}
              onAssistance={(email) => { setAssistancePrefillEmail(email); openAdminWorkspace('assistance'); }}
            />}

            {adminPeopleRole && <div className="people-drawer admin-full-page" aria-label={`${roleMeta[adminPeopleRole].label} accounts`}><div className="people-drawer-head"><div><span className="mini-label">PEOPLE / ACCOUNT DIRECTORY</span><h2>{roleMeta[adminPeopleRole].label}s</h2><p>{adminPeopleRole === 'admin' ? 'Administrator access is limited to the owner allowlist.' : `Current ${roleMeta[adminPeopleRole].label.toLowerCase()} accounts recorded by Nightjar.`}</p></div><button className="secondary-button" onClick={() => navigate('admin')} aria-label="Back to Owner Console"><ArrowLeft size={16} /> Owner Console</button></div><div className="people-drawer-summary"><strong>{adminOverview?.people?.counts?.[adminPeopleRole] ?? 0}</strong><span>accounts in this role</span></div><div className="people-list">{(adminPeopleRole === 'admin' ? (adminOverview?.people?.administrators ?? []) : (adminOverview?.people?.accounts ?? []).filter((account: any) => adminPeopleRole === 'listener' || account.role === adminPeopleRole || (account.roles ?? []).includes(adminPeopleRole))).map((account: any) => <article className="people-row people-row-managed" key={account.userId ?? account.email}><span className="account-chip-avatar">{account.avatarUrl ? <img className="avatar-approved-image" src={account.avatarUrl} alt="" loading="lazy" decoding="async" /> : (account.name ?? account.email ?? 'N').slice(0, 1).toUpperCase()}</span><div><strong>{account.name ?? 'Nightjar account'}</strong><span>{account.email ?? 'Owner allowlist account'}{account.handle ? ' · @'+account.handle : ''}</span></div><em>{account.testAccess ? 'Tester access · ' : ''}{account.status === 'pending_review' ? 'Pending review' : account.status === 'suspended' ? 'Suspended' : 'Active'}</em>{adminPeopleRole !== 'admin' && <button type="button" className="secondary-button" onClick={() => openLiveMemberProfile(account.userId)}><Eye size={15}/> View live profile</button>}{adminPeopleRole !== 'admin' && <AdminMemberRoleEditor
  account={account}
  onSave={manageAccountProfessions}
  onQueue={queueAccountProfessions}
  onActiveRoleChange={changeAccountRole}
  onStatusChange={changeAccountStatus}
  onTestAccessChange={changeTestAccess}
/>}</article>)}{(adminPeopleRole === 'admin' ? (adminOverview?.people?.administrators ?? []) : (adminOverview?.people?.accounts ?? []).filter((account: any) => adminPeopleRole === 'listener' || account.role === adminPeopleRole || (account.roles ?? []).includes(adminPeopleRole))).length === 0 && <div className="people-empty"><Users size={18} /><strong>No accounts in this role yet</strong><span>The live directory will populate as accounts are created or approved.</span></div>}</div></div>}
            {adminPanel && <div className="admin-panel-modal admin-full-page"><section aria-label="Administration workpage"><div className="admin-modal-head"><div><span className="mini-label">ADMINISTRATION / {adminPanel.toUpperCase()}</span><h2>{adminPanel === 'approvals' ? 'Professional approval queue' : adminPanel === 'branding' ? 'Nightjar app installation icon' : adminPanel === 'profile-viewer' ? 'Live Profile Viewer' : adminPanel === 'live-preview' ? 'Live professional visibility preview' : adminPanel === 'suggestions' ? 'Creator suggestions' : adminPanel === 'reports' ? 'Reports & feedback' : adminPanel === 'reviews' ? 'Review moderation' : adminPanel === 'subscriptions' ? 'Subscription ledger' : adminPanel === 'revenue' ? 'Commercial controls' : adminPanel === 'editorial' ? 'Manuscript review & approvals' : adminPanel === 'images' ? 'Image moderation' : adminPanel === 'tags' ? 'Tag catalogue governance' : 'Finance simulator & creator economics'}</h2><p>{adminPanel === 'branding' ? 'Generate approved Nightjar logo icons for installation. Existing app icons may require reinstalling.' : adminPanel === 'profile-viewer' ? 'Inspect actual public member profiles across Listener, VA Creator, Writer, Audio Editor and Artist roles. Select several accounts and approved roles without impersonation.' : adminPanel === 'live-preview' ? 'Review real tester script visibility with the same marketplace endpoint used by Nightjar professionals. No demo data or impersonation.' : adminPanel === 'approvals' ? 'Review banked VA Creator, Writer, Audio Editor and Artist applications. Approve whole applications or individual roles into a named intake wave.' : adminPanel === 'suggestions' ? 'Review Creators recommended by Nightjar members. Suggestions never auto-approve a professional account.' : adminPanel === 'reports' ? 'Review user-submitted safety reports, technical issues and feedback. Reporter identity is shown by profile name and handle.' : adminPanel === 'reviews' ? 'Listener ratings and written reviews are moderated before public display.' : adminPanel === 'subscriptions' ? 'Live subscription records only. Empty means billing data is not connected yet.' : adminPanel === 'revenue' ? 'Operational assumptions are separated from confirmed billing data.' : adminPanel === 'editorial' ? 'Verify submitted manuscripts through a read-only protected viewer, then approve or request changes. Marketplace scripts never enter an editorial queue.' : adminPanel === 'images' ? 'Every uploaded image stays private until an administrator explicitly approves it.' : adminPanel === 'tags' ? 'Review creator-made discovery tags. Explicit adult terminology is allowed; administrators can promote useful terms or hide unsuitable catalogue entries.' : 'Adjust the complete Nightjar finance model safely: audience, subscription price, taxes and fees, contributor role shares, app funding and operator income. The simulator never changes live billing.'}</p></div><button className="secondary-button" onClick={() => navigate('admin')} aria-label="Back to Owner Console"><ArrowLeft size={16} /> Owner Console</button></div>{adminPanel === 'reports' && <div className="admin-data-list">{adminPanelLoading ? <div className="people-empty">Loading reports & feedback…</div> : (adminReports.length === 0 && adminCommunityReports.length === 0) ? <div className="people-empty"><ShieldCheck size={18}/><strong>No reports or feedback yet</strong><span>User submissions will appear here for Administrator review.</span></div> : adminReports.map((report:any) => <article className="admin-data-row" key={report.id}><div><strong>{report.reporterName ?? 'Nightjar account'}{report.reporterHandle ? ' · @' + String(report.reporterHandle).replace(/^@/, '') : ''}</strong><span>{report.caseId ?? 'Nightjar report'} · {report.category ?? 'Something else'} · {report.status ?? 'New'}</span><small>{report.reporterEmail ?? 'Account email unavailable'} · {report.createdAt ? new Date(report.createdAt).toLocaleString('en-GB') : 'Date unavailable'}</small><p>{report.summary ?? 'No report detail supplied.'}</p></div></article>)}{adminCommunityReports.map((report:any)=><article className="admin-data-row community-report-row" key={report.id}><div><strong>{report.type === 'direct_message' ? 'Reported professional message' : 'Reported release comment / reply'}</strong><span>{report.reason ?? 'Community report'} · {report.createdAt ? new Date(report.createdAt).toLocaleString('en-GB') : 'Date unavailable'}</span><small>Reporter: {report.reporterName ?? 'Nightjar member'}{report.reporterHandle ? ' · @'+String(report.reporterHandle).replace(/^@/,'') : ''} · Reported account: {report.subjectName ?? 'Nightjar member'}{report.subjectRole ? ' · '+(report.subjectRole === 'editor' ? 'Audio Editor' : String(report.subjectRole).charAt(0).toUpperCase()+String(report.subjectRole).slice(1)) : ''}{report.releaseTitle ? ' · '+report.releaseTitle : ''}</small><p>{report.snapshotText || 'No retained report excerpt.'}</p><small>{report.type === 'direct_message' ? 'Only the specifically reported message snapshot is shown here — not the full private conversation.' : 'The reported public comment can be removed without affecting the release.'}</small></div><div className="admin-data-actions"><button className="ghost-button" onClick={()=>void resolveCommunityReport(report,'dismiss')}>Dismiss</button><button className="secondary-button" onClick={()=>void resolveCommunityReport(report,'remove')}>{report.type === 'direct_message' ? 'Remove message' : 'Remove comment'}</button>{report.subjectUserId && report.subjectRole && report.subjectRole !== 'admin' && <button className="danger-button" onClick={()=>void suspendReportedCommunityAccount(report)}>Suspend reported account</button>}</div></article>)}</div>}{adminPanel === 'reviews' && <div className="admin-data-list">{adminPanelLoading ? <div className="people-empty">Loading review queue…</div> : adminReviewQueue.length === 0 ? <div className="people-empty"><Star size={18}/><strong>No reviews awaiting moderation</strong><span>Listener submissions will appear here before public display.</span></div> : adminReviewQueue.map((review:any)=><article className="admin-data-row" key={review.id}><div><strong>{review.releaseTitle ?? 'Nightjar release'}</strong><span>{review.reviewerName ?? 'Nightjar listener'}{review.reviewerHandle ? ' · @' + String(review.reviewerHandle).replace(/^@/,'') : ''} · {'★'.repeat(review.rating ?? 0)}{'☆'.repeat(Math.max(0,5-(review.rating ?? 0)))}</span><p>{review.review || 'Rating only — no written review.'}</p></div><div className="admin-data-actions"><button className="ghost-button" onClick={()=>void moderateReleaseReview(review,'rejected')}>Reject</button><button className="primary-button" onClick={()=>void moderateReleaseReview(review,'approved')}>Approve review</button></div></article>)}</div>}{adminPanel === 'suggestions' && <div className="admin-data-list">{adminPanelLoading ? <div className="people-empty">Loading Creator suggestions…</div> : adminCreatorSuggestions.length === 0 ? <div className="people-empty"><Users size={18}/><strong>No Creator suggestions yet</strong><span>Member recommendations will appear here for review.</span></div> : adminCreatorSuggestions.map((suggestion:any)=><article className="admin-data-row" key={suggestion.id}><div><strong>{suggestion.creatorName}</strong><span>{suggestion.status ?? 'new'} · suggested by {suggestion.submittedByName ?? 'Nightjar member'}{suggestion.submittedByHandle ? ' · @'+String(suggestion.submittedByHandle).replace(/^@/,'') : ''}</span>{suggestion.publicUrl && <small>{suggestion.publicUrl}</small>}{suggestion.note && <p>{suggestion.note}</p>}<small>Referral: {suggestion.referralCode ?? '—'}{suggestion.claimedByUserId ? ' · joined Nightjar' : ''}</small></div><div className="admin-data-actions"><button className="ghost-button" onClick={()=>void reviewCreatorSuggestion(suggestion,'dismissed')}>Dismiss</button><button className="secondary-button" onClick={()=>void reviewCreatorSuggestion(suggestion,'contacted')}>Contacted</button><button className="primary-button" onClick={()=>void reviewCreatorSuggestion(suggestion,'invited')}>Invited</button></div></article>)}</div>}{adminPanel === 'branding' && <AdminInstallBranding notify={notify} simulationMode={demoMode}/>}{adminPanel === 'profile-viewer' && <Suspense fallback={<NightjarSkeleton variant="page" count={4} label="Opening live member profile viewer"/>}>
  <AdminLiveProfileViewer accounts={adminOverview?.people?.accounts ?? []} initialUserId={adminProfileViewerUserId} onRefreshAccounts={loadAdminOverview} notify={notify}/>
</Suspense>}{adminPanel === 'live-preview' && <Suspense fallback={<NightjarSkeleton variant="page" count={4} label="Loading live professional preview"/>}>
  <AdminLiveMarketplacePreview notify={notify}/>
</Suspense>}{adminPanel === 'approvals' && <div className="admin-data-list">
  <div className="admin-application-wavebar">
    <div>
      <span className="mini-label">CONTROLLED INTAKE</span>
      <strong>Professional application bank</strong>
      <small>Only new applications are counted as needing approval. Completed approvals appear in Already Approved; rejected or withdrawn applications remain in Decision History.</small>
    </div>
    <label>Filter profession
      <select value={adminApplicationRoleFilter} onChange={(event)=>setAdminApplicationRoleFilter(event.target.value as 'all'|'creator'|'writer'|'editor'|'artist')}>
        <option value="all">All professionals</option>
        <option value="creator">VA Creators</option>
        <option value="writer">Writers</option>
        <option value="editor">Audio Editors</option>
        <option value="artist">Artists</option>
      </select>
    </label>
    {adminApplicationBox === 'pending' && <label>Approval wave
      <input value={adminApplicationWave} onChange={(event)=>setAdminApplicationWave(event.target.value)} placeholder="e.g. Launch Wave 1"/>
    </label>}
  </div>
  {failedProfessionalApprovalEmailCount > 0 && <div className="nj-application-email-alert" role="status">
    <strong>{failedProfessionalApprovalEmailCount} approval email{failedProfessionalApprovalEmailCount === 1 ? '' : 's'} require{failedProfessionalApprovalEmailCount === 1 ? 's' : ''} attention.</strong>
    <span>Creator access remains approved. Open Already Approved to review the Gmail delivery error and retry safely.</span>
    <button className="ghost-button" type="button" onClick={()=>setAdminApplicationBox('approved')}>Open approved accounts</button>
  </div>}
  <div className="nj-application-tabs" role="tablist" aria-label="Professional application workboxes">
    {([
      { id:'pending', label:'Needs approval', count:applicationGroups.pending.length },
      { id:'approved', label:'Already Approved', count:applicationGroups.approved.length },
      { id:'history', label:'Decision History', count:applicationGroups.history.length },
      { id:'attention', label:'Needs attention', count:applicationGroups.attention.length },
    ] as const).map((tab)=><button key={tab.id} type="button" role="tab" aria-selected={adminApplicationBox === tab.id}
      className={adminApplicationBox === tab.id ? 'active' : ''}
      onClick={()=>setAdminApplicationBox(tab.id)}>{tab.label}<span>{tab.count}</span></button>)}
  </div>
  {adminPanelLoading
    ? <div className="people-empty">Loading professional applications…</div>
    : visibleAdminApplications.length === 0
      ? <div className="people-empty"><Sparkles size={18}/>
          <strong>{adminApplicationBox === 'pending' ? 'No new applications awaiting approval' : adminApplicationBox === 'approved' ? 'Nobody has been approved yet' : adminApplicationBox === 'history' ? 'No rejected or withdrawn applications' : 'No application records need attention'}</strong>
          <span>{adminApplicationBox === 'pending' ? 'Already approved people never appear in this queue or its badge.' : adminApplicationBox === 'approved' ? 'Approved professionals are kept here without being counted as pending.' : adminApplicationBox === 'history' ? 'Rejected and withdrawn applications are retained here.' : 'Records with no actionable role are kept for investigation.'}</span>
        </div>
      : visibleAdminApplications.map((application:any) => {
          const remainingRoles = pendingApplicationRoles(application);
          const approvedRoles: string[] = Array.isArray(application.approvedRoles) ? application.approvedRoles : [];
          const status = String(application.status ?? 'banked').toLowerCase();
          const hasFinishedApproval = approvedRoles.length > 0 && remainingRoles.length === 0 && adminApplicationBox === 'approved';
          const roleLabel = (role:string) => role === 'creator' ? 'VA Creator' : role === 'editor' ? 'Audio Editor' : role === 'artist' ? 'Artist' : role === 'writer' ? 'Writer' : role;
          const readableDate = (date: unknown) => {
            if (!date || typeof date !== 'string') return null;
            const timestamp = new Date(date);
            return Number.isNaN(timestamp.getTime()) ? null : timestamp.toLocaleString('en-GB');
          };
          return <article className="admin-data-row professional-application-row" key={application.id}>
            <div>
              <strong>{application.displayName ?? application.email ?? 'Professional applicant'}</strong>
              <div className="nj-application-summary">
                <span className={'nj-application-status nj-application-status-' + adminApplicationBox}>
                  {adminApplicationBox === 'pending'
                    ? remainingRoles.map(roleLabel).join(' / ') + ' - ' + status
                    : hasFinishedApproval
                      ? 'Approved - No pending roles'
                      : adminApplicationBox === 'history'
                        ? status.replaceAll('_', ' ')
                        : 'No roles awaiting a decision - ' + status}
                </span>
                {application.wave && <span className="nj-application-wave">Intake: {application.wave}</span>}
                {approvedRoles.length > 0 && <div className="nj-application-field">
                  <span className="nj-application-field-label">Approved roles</span>
                  <strong>{approvedRoles.map(roleLabel).join(' / ')}</strong>
                </div>}
                {(adminApplicationBox === 'approved' || adminApplicationBox === 'history') && <div className="nj-application-field">
                  <span className="nj-application-field-label">Decision</span>
                  <strong>{hasFinishedApproval || status === 'approved' ? 'Approved' : status === 'rejected' ? 'Rejected' : status === 'withdrawn' ? 'Withdrawn' : status.replaceAll('_', ' ')}</strong>
                </div>}
                {adminApplicationBox === 'approved' && approvedRoles.length > 0 && <div className="nj-application-field">
                  <span className="nj-application-field-label">Approval email</span>
                  <strong>{application.approvalEmailStatus === 'sent'
                    ? 'Sent' + (readableDate(application.approvalEmailSentAt) ? ' on ' + readableDate(application.approvalEmailSentAt) : '')
                    : application.approvalEmailStatus === 'failed' ? 'Delivery failed - retry available'
                    : application.approvalEmailStatus === 'sending' ? 'Sending'
                    : 'No automated email recorded (existing approval)'}</strong>
                </div>}
              </div>
              {adminApplicationBox === 'approved' && application.approvalEmailStatus === 'failed' && application.approvalEmailError && <small className="nj-application-mail-error">Email error: {application.approvalEmailError}</small>}
              {adminApplicationBox === 'approved' && (application.approvalEmailStatus === 'failed' || !application.approvalEmailStatus) && application.approvalEmailEventId && <button type="button" className="secondary-button" onClick={() => void retryProfessionalApprovalEmail(application)}>{application.approvalEmailStatus === 'failed' ? 'Retry approval email' : 'Send existing approval email'}</button>}
              {application.updatedAt && <small>Application last updated: {readableDate(application.updatedAt) ?? 'Date unavailable'}</small>}
              {application.statement && <p>{application.statement}</p>}
              {application.experience && <small>{application.experience}</small>}
              {application.portfolioUrl && <small>Portfolio: {application.portfolioUrl}</small>}
              {adminApplicationBox === 'pending' && <small>{application.ageVerified ? 'Age assurance verified' : application.temporaryTestAccess ? 'Approved temporary tester access' : demoMode ? 'Demo applicant · age check simulated' : 'Age assurance required before approval'}</small>}
              {adminApplicationBox === 'attention' && <small>There are no actionable pending professional roles on this application record. Check the account and its role history before changing anything.</small>}
            </div>
            {adminApplicationBox === 'pending' && <div className="admin-data-actions professional-application-actions">
              <button className="secondary-button" onClick={() => void decideCreatorApplication(application, 'waitlist')}>Keep banked</button>
              <button className="ghost-button" onClick={() => void decideCreatorApplication(application, 'rejected')}>Reject remaining</button>
              {remainingRoles.map((role)=><button key={role} className="secondary-button"
                disabled={!demoMode && application.ageVerified !== true && application.temporaryTestAccess !== true}
                title={!demoMode && application.ageVerified !== true && application.temporaryTestAccess !== true ? 'Age assurance or explicit tester access is required first.' : undefined}
                onClick={() => void decideCreatorApplication(application, 'approved', [role])}>Approve {roleLabel(role)}</button>)}
              <button className="primary-button"
                disabled={remainingRoles.length === 0 || (!demoMode && application.ageVerified !== true && application.temporaryTestAccess !== true)}
                title={!demoMode && application.ageVerified !== true && application.temporaryTestAccess !== true ? 'Age assurance or explicit tester access is required first.' : undefined}
                onClick={() => void decideCreatorApplication(application, 'approved')}>Approve all for wave</button>
            </div>}
          </article>;
        })}
</div>}{adminPanel === 'editorial' && <Suspense fallback={<NightjarSkeleton variant="list" count={3} label="Loading manuscript approvals"/>}><AdminManuscriptReview scripts={adminScripts} loading={adminPanelLoading} demoMode={demoMode} simulationMode={simulationMode} notify={notify} onRefresh={loadAdminEditorial} onReview={reviewAdminManuscript} onMessageWriter={(uid)=>{setMessageRecipientUserId(uid);setMessageCollaborationId(null);navigate('messages');}}/></Suspense>}{adminPanel === 'tags' && <div className="admin-data-list">
  {adminPanelLoading ? <div className="people-empty">Loading custom tag catalogue…</div> : adminProfileTags.length === 0 ? <div className="people-empty"><Search size={18}/><strong>No custom tag candidates yet</strong><span>Creator-made tags will appear here as they are used. Automatic shared-catalogue promotion starts at {adminProfileTagThreshold} distinct approved Creators.</span></div> : adminProfileTags.map((tag:any)=><article className="admin-data-row" key={tag.id}>
    <div>
      <strong>{tag.label}</strong>
      <span>{tag.uniqueCreatorCount ?? 0} distinct approved Creator{tag.uniqueCreatorCount === 1 ? '' : 's'} · {String(tag.status ?? 'candidate').replaceAll('_',' ')}</span>
      <small>{tag.status === 'promoted' ? 'Selectable across Nightjar' : tag.status === 'hidden' ? 'Hidden from the shared selector' : `Auto-promotes at ${adminProfileTagThreshold} Creators`}</small>
    </div>
    <div className="admin-data-actions">
      {tag.status !== 'hidden' && <button className="ghost-button" onClick={()=>void setProfileTagStatus(tag,'hidden')}>Hide</button>}
      {tag.status !== 'candidate' && <button className="secondary-button" onClick={()=>void setProfileTagStatus(tag,'candidate')}>Candidate</button>}
      {tag.status !== 'promoted' && <button className="primary-button" onClick={()=>void setProfileTagStatus(tag,'promoted')}>Promote</button>}
    </div>
  </article>)}
</div>}{adminPanel === 'images' && <div className="admin-data-list">{adminPanelLoading ? <div className="people-empty">Loading image moderation queue…</div> : imageModeration.length === 0 ? <div className="people-empty"><ImagePlus size={18}/><strong>No images awaiting review</strong><span>Profile pictures, script artwork, branding and release artwork appear here before becoming public.</span></div> : imageModeration.map((asset:any)=><article className="image-moderation-row" key={asset.id}><div className="image-moderation-preview">{asset.previewUrl ? <button type="button" className="image-moderation-preview-button" onClick={()=>setModerationPreviewAsset(asset)} aria-label="View pending image full screen"><img src={asset.previewUrl} alt="Pending moderation" /><span className="image-preview-open-hint">Click to inspect full screen</span></button> : <div className="image-preview-unavailable"><ImagePlus size={24}/><span>{asset.previewError ?? 'Preview loading failed'}</span></div>}</div><div><strong>{asset.kind === 'profile_avatar' ? 'Profile picture' : asset.kind === 'brand_logo' ? 'Nightjar logo' : asset.kind === 'artist_portfolio' ? 'Artist portfolio artwork' : asset.kind === 'script_artwork' ? 'Script artwork' : asset.kind === 'social_avatar' ? 'Social profile picture' : 'Release artwork'}</strong><span>{asset.ownerEmail ?? asset.ownerUserId ?? 'Unknown uploader'} · {asset.fileName ?? asset.contentType ?? 'image'}</span><small>This image is private while pending. Approve only after checking there is no nudity, explicit sexual imagery or other unsuitable imagery.</small></div><div className="admin-data-actions">{asset.previewUrl && <button className="secondary-button" onClick={()=>setModerationPreviewAsset(asset)}>View full image</button>}<button className="ghost-button" onClick={()=>void moderateImage(asset,'rejected')}>Reject</button><button className="primary-button" disabled={!asset.previewUrl} title={!asset.previewUrl ? 'Preview this image successfully before approval.' : undefined} onClick={()=>void moderateImage(asset,'approved')}>Approve image</button></div></article>)}</div>}{adminPanel === 'subscriptions' && <div>{adminPanelLoading ? <div className="people-empty">Loading subscription ledger…</div> : <>
  <div className="admin-modal-grid">
    <div className="admin-modal-stat"><span>Active</span><strong>{commercialOverview?.subscriptions.active ?? 0}</strong></div>
    <div className="admin-modal-stat"><span>Trial</span><strong>{commercialOverview?.subscriptions.trialing ?? 0}</strong></div>
    <div className="admin-modal-stat"><span>Past due</span><strong>{commercialOverview?.subscriptions.pastDue ?? 0}</strong></div>
  </div>

  <div className="subscription-finance-section">
    <div className="subscription-finance-heading">
      <div><span className="mini-label">MONTHLY INCOME PLANNING</span><h3>What this billing cycle could support</h3></div>
      <span className="status-pill">{commercialOverview?.activePaidSubscribers ?? 0} confirmed paid</span>
    </div>

    <div className="subscription-finance-grid">
      <article className="subscription-finance-card subscription-finance-primary">
        <span>Confirmed monthly gross</span>
        <strong>{formatMoneyPence(commercialOverview?.confirmedGrossMrrPence ?? 0)}</strong>
        <small>Confirmed active subscription amounts only. This is the starting point for monthly planning.</small>
      </article>
      <article className="subscription-finance-card">
        <span>Trial upside</span>
        <strong>+{formatMoneyPence(commercialOverview?.trialPotentialPence ?? 0)}</strong>
        <small>Potential only if every current trial converts at its known or planning monthly price.</small>
      </article>
      <article className="subscription-finance-card">
        <span>Past due at risk</span>
        <strong>{formatMoneyPence(commercialOverview?.pastDueAtRiskPence ?? 0)}</strong>
        <small>Revenue that may recover, but should not be treated as available cash until payment succeeds.</small>
      </article>
      <article className="subscription-finance-card">
        <span>Gross if current trials convert</span>
        <strong>{formatMoneyPence(commercialOverview?.potentialGrossWithTrialsPence ?? 0)}</strong>
        <small>Planning scenario: confirmed gross plus current trial potential. It is not booked revenue.</small>
      </article>
    </div>

    <div className="subscription-payout-panel">
      <div className="subscription-finance-heading">
        <div><span className="mini-label">PAYOUT PLANNING</span><h3>Creator commitments and operating headroom</h3></div>
        <span className="status-pill muted">{commercialSettings.payoutCadence ?? 'Cadence not set'}</span>
      </div>
      <div className="subscription-payout-grid">
        <div><span>Standard Creator rate</span><strong>{commercialSettings.creatorRateBands.length ? formatMoneyPence(commercialOverview?.standardMonthlyCreatorRatePence ?? 0) : 'Not set'}</strong><small>Current subscriber band, capped by the configured monthly maximum.</small></div>
        <div><span>Paid Creator slots</span><strong>{commercialOverview?.paidCreatorCount ?? 0}</strong><small>{commercialOverview?.activeCreatorCount ?? 0} active Creator accounts can exist without automatically consuming paid capacity.</small></div>
        <div><span>Creator payout commitment</span><strong>{formatMoneyPence(commercialOverview?.plannedCreatorPayoutPence ?? 0)}</strong><small>Equal standard-rate commitment for the current paid Creator roster.</small></div>
        <div><span>Creator compensation capacity</span><strong>{formatMoneyPence(commercialOverview?.creatorCapacityPence ?? 0)}</strong><small>Up to {commercialSettings.creatorPoolPercent}% of Eligible Net Revenue before the safety guard.</small></div>
        <div><span>Growth & Stability contribution</span><strong>{formatMoneyPence(commercialOverview?.growthAndStabilityFundContributionPence ?? 0)}</strong><small>Core business allocation plus unused Creator capacity.</small></div>
      </div>
      <div className="demo-warning admin-note"><ShieldCheck size={17}/><div><strong>ELIGIBLE NET, NOT RAW MRR</strong><span>Creator capacity is based on confirmed net settlement values where available. If the processor has not supplied them yet, Nightjar uses the configured conservative planning factor and labels the result as an estimate.</span></div></div>
      {(commercialOverview?.unpricedActiveSubscriptions ?? 0) > 0 && <div className="demo-warning admin-note"><ShieldAlert size={17}/><div><strong>INCOMPLETE BILLING AMOUNTS</strong><span>{commercialOverview?.unpricedActiveSubscriptions} active subscription records do not yet have a confirmed monthly amount, so confirmed gross is deliberately understated rather than guessed.</span></div></div>}
    </div>
  </div>

  <div className="admin-data-list subscription-ledger-list">
    {adminSubscriptions.length === 0 ? <div className="people-empty"><WalletCards size={18} /><strong>No live subscription records</strong><span>Billing is not connected yet; no subscription data is being fabricated.</span></div> : adminSubscriptions.map((subscription) => <article className="admin-data-row" key={subscription.id}><div><strong>{subscription.email ?? subscription.userId ?? 'Subscriber'}</strong><span>{subscription.plan ?? ('Nightjar · ' + formatMoneyPence(commercialSettings.planningMonthlyPricePence) + ' monthly')} · {subscription.status ?? 'unknown'}</span><small>{subscription.confirmedMonthlyAmountPence != null ? formatMoneyPence(subscription.confirmedMonthlyAmountPence) + ' / month' : 'Monthly amount not confirmed'}</small></div><span>{'Period end ' + formatAdminDate(subscription.currentPeriodEnd)}</span></article>)}
  </div>
</>}</div>}{adminPanel === 'revenue' && <div>
  <div className="admin-modal-grid">
    <div className="admin-modal-stat"><span>Planning price</span><strong>{formatMoneyPence(commercialSettings.planningMonthlyPricePence)}</strong></div>
    <div className="admin-modal-stat"><span>Live subscriptions</span><strong>{commercialOverview?.subscriptions.active ?? 0}</strong></div>
    <div className="admin-modal-stat"><span>Confirmed gross MRR</span><strong>{formatMoneyPence(commercialOverview?.confirmedGrossMrrPence ?? 0)}</strong></div>
    <div className="admin-modal-stat"><span>Eligible net revenue</span><strong>{formatMoneyPence(commercialOverview?.eligibleNetRevenuePence ?? 0)}</strong></div>
  </div>
  <Suspense fallback={<div className="people-empty">Loading Creator Capacity Bank…</div>}>
    <CreatorCapacityBank overview={commercialOverview} settings={commercialSettings} busyUserId={creatorSlotBusyUserId} onTogglePaidSlot={(userId, active)=>void togglePaidCreatorSlot(userId, active)} />
  </Suspense>
  <section className="nightjar-admin-payout-panel">
    <div className="subscription-finance-heading">
      <div><span className="mini-label">NIGHTJAR SUPPORT GIFTS</span><h3>Gift liabilities and creator payout readiness</h3></div>
      <span className="status-pill">£1 creator value per Nightjar</span>
    </div>
    <div className="subscription-payout-grid">
      <div><span>Pending clearance</span><strong>{formatMoneyPence(nightjarPayoutOverview?.totals.pendingPence ?? 0)}</strong><small>{nightjarPayoutOverview?.totals.pendingNightjars ?? 0} Nightjars inside the seven-day clearance window.</small></div>
      <div><span>Cleared for creator payout</span><strong>{formatMoneyPence(nightjarPayoutOverview?.totals.clearedPence ?? 0)}</strong><small>{nightjarPayoutOverview?.totals.clearedNightjars ?? 0} cleared Nightjars waiting for settlement through the monthly payout process.</small></div>
      <div><span>Lifetime creator support</span><strong>{formatMoneyPence(nightjarPayoutOverview?.totals.lifetimePence ?? 0)}</strong><small>{nightjarPayoutOverview?.totals.lifetimeNightjars ?? 0} Nightjars received across all professional roles.</small></div>
      <div><span>Unspent wallet liability</span><strong>{formatMoneyPence(nightjarPayoutOverview?.totals.outstandingWalletLiabilityPence ?? 0)}</strong><small>{nightjarPayoutOverview?.totals.outstandingWalletNightjars ?? 0} purchased Nightjars still held in user wallets and reserved for future professional support.</small></div>
    </div>
    {!!nightjarPayoutOverview?.recipients?.length && <div className="admin-data-list nightjar-payout-recipient-list">
      {nightjarPayoutOverview.recipients.slice(0,20).map((recipient)=><article className="admin-data-row" key={recipient.userId}><div><strong>{recipient.displayName}</strong><span>{recipient.roles.map((role)=>role==='creator'?'VA Creator':role==='editor'?'Audio Editor':role==='artist'?'Artist':'Writer').join(' · ') || 'Professional'}</span><small>{recipient.pendingNightjars} pending · {recipient.clearedNightjars} cleared · {recipient.lifetimeNightjars} lifetime Nightjars</small></div><div><strong>{formatMoneyPence(recipient.clearedPence)}</strong><small>cleared support</small></div></article>)}
    </div>}
    <div className="demo-warning admin-note"><ShieldCheck size={17}/><div><strong>SEPARATE FROM SUBSCRIPTION PAY</strong><span>Nightjar gifts are direct creator-support liabilities. Cleared gift earnings are added to the recipient’s monthly payout; unused listener Nightjars remain a creator-value liability until gifted or legitimately refunded.</span></div></div>
  </section>
  <div className="commercial-edit-grid">
    <label>Planning monthly price (£)<input type="number" min="0" step="0.01" value={commercialSettings.planningMonthlyPricePence == null ? '' : commercialSettings.planningMonthlyPricePence / 100} onChange={(e)=>setCommercialSettings((s)=>({...s,planningMonthlyPricePence:e.target.value===''?null:Math.round(Number(e.target.value)*100)}))}/></label>
    <label>Current creator monthly cap (£)<input type="number" min="0" step="1" value={commercialSettings.creatorMonthlyCapPence == null ? '' : commercialSettings.creatorMonthlyCapPence / 100} onChange={(e)=>setCommercialSettings((s)=>({...s,creatorMonthlyCapPence:e.target.value===''?null:Math.round(Number(e.target.value)*100)}))}/></label>
    <label>Creator compensation ceiling (%)<input type="number" min="0" max="100" step="0.01" value={commercialSettings.creatorPoolPercent} onChange={(e)=>setCommercialSettings((s)=>({...s,creatorPoolPercent:Number(e.target.value)}))}/></label>
    <label>Company / profit allocation (%)<input type="number" min="0" max="100" step="0.01" value={commercialSettings.companyProfitPercent} onChange={(e)=>setCommercialSettings((s)=>({...s,companyProfitPercent:Number(e.target.value)}))}/></label>
    <label>Core business fund (%)<input type="number" min="0" max="100" step="0.01" value={commercialSettings.businessFundPercent} onChange={(e)=>setCommercialSettings((s)=>({...s,businessFundPercent:Number(e.target.value),reservePercent:Number(e.target.value)}))}/></label>
    <label>Planning eligible-net factor (%)<input type="number" min="1" max="100" step="0.01" value={commercialSettings.planningEligibleNetPercent} onChange={(e)=>setCommercialSettings((s)=>({...s,planningEligibleNetPercent:Number(e.target.value)}))}/></label>
    <label>Maximum safe Creator utilisation (%)<input type="number" min="1" max="100" step="0.01" value={commercialSettings.safeCreatorUtilizationPercent} onChange={(e)=>setCommercialSettings((s)=>({...s,safeCreatorUtilizationPercent:Number(e.target.value)}))}/></label>
    <label>Rolling revenue average (days)<input type="number" min="1" max="365" step="1" value={commercialSettings.revenueAveragingDays} onChange={(e)=>setCommercialSettings((s)=>({...s,revenueAveragingDays:Math.max(1,Math.round(Number(e.target.value)||1))}))}/></label>
    <label>Subscriber / revenue stress test (%)<input type="number" min="0" max="90" step="0.01" value={commercialSettings.subscriberStressTestPercent} onChange={(e)=>setCommercialSettings((s)=>({...s,subscriberStressTestPercent:Number(e.target.value)}))}/></label>
    <label>Minimum Creator slots kept in bank<input type="number" min="0" max="100" step="1" value={commercialSettings.minimumBankedCreatorSlots} onChange={(e)=>setCommercialSettings((s)=>({...s,minimumBankedCreatorSlots:Math.max(0,Math.round(Number(e.target.value)||0))}))}/></label>
    <label>Payout cadence<input value={commercialSettings.payoutCadence ?? ''} onChange={(e)=>setCommercialSettings((s)=>({...s,payoutCadence:e.target.value||null}))} placeholder="e.g. Monthly"/></label>
    <p className="panel-note commercial-span-two"><strong>Allocation rule:</strong> Creator compensation + company/profit + core business fund must total 100%. Unused Creator capacity rolls into the Nightjar Growth & Stability Fund. The planning eligible-net factor is only used where the payment provider has not supplied a confirmed net settlement amount.</p>
    <label className="rights-check commercial-span-two"><input type="checkbox" checked={commercialSettings.creatorSlotRecommendations} onChange={(e)=>setCommercialSettings((s)=>({...s,creatorSlotRecommendations:e.target.checked}))}/> Show safe paid-Creator-slot recommendations. Slot release always remains manual.</label>
    <label className="commercial-span-two">Listener subscription checkout URL<input type="url" value={commercialSettings.listenerSubscriptionUrl ?? ''} onChange={(e)=>setCommercialSettings((s)=>({...s,listenerSubscriptionUrl:e.target.value||null}))} placeholder="https://your-real-payment-provider.example/subscribe"/></label>
    <p className="panel-note commercial-span-two">Nightjar only shows a Subscribe action when this is a real configured http/https checkout URL. Leave it blank until your billing provider is genuinely ready.</p>
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
    <div className="panel-note commercial-span-two"><strong>Direct-tip switch retired.</strong> Nightjar support now uses the auditable Nightjar wallet and gift ledger. Real-money pack checkout will only unlock after a verified payment-provider callback is connected.</div>
    <label className="rights-check"><input type="checkbox" checked={commercialSettings.individualPurchasesEnabled} onChange={(e)=>setCommercialSettings((s)=>({...s,individualPurchasesEnabled:e.target.checked}))}/> Enable individual audio purchases when commerce is ready</label>
  </div>
  <button className="primary-button" disabled={commercialSaving} onClick={()=>void saveCommercialControls()}>{commercialSaving?'Saving…':'Save commercial controls'}</button>
  <div className="admin-formula">
    <div><b>01</b><strong>Establish Eligible Net Revenue after taxes, processor costs, refunds and chargebacks where confirmed settlement data exists.</strong></div>
    <div><b>02</b><strong>Allocate up to {commercialSettings.creatorPoolPercent}% to Creator compensation, {commercialSettings.companyProfitPercent}% to company/profit and {commercialSettings.businessFundPercent}% to the core Nightjar fund.</strong></div>
    <div><b>03</b><strong>Apply the subscriber payout band equally, capped at {formatMoneyPence(commercialSettings.creatorMonthlyCapPence)} per paid Creator.</strong></div>
    <div><b>04</b><strong>Never automatically fill capacity: keep at least {commercialSettings.minimumBankedCreatorSlots} Creator slots banked and require the rolling-revenue and downturn checks before recommending expansion.</strong></div>
  </div>
  <div className="demo-warning admin-note"><ShieldCheck size={17}/><div><strong>CONFIRMED VS PLANNING</strong><span>Where a processor has not supplied confirmed net settlement values, Nightjar clearly labels the eligible-net figure as a conservative planning estimate. Paid Creator slot activation is always manual and is also checked by the backend.</span></div></div>
</div>}
{adminPanel === 'economics' && <div>
  <Suspense fallback={<div className="people-empty">Loading Finance Lab…</div>}>
    <AdminFinanceSimulator
      settings={commercialSettings}
      currentPaidSubscribers={commercialOverview?.activePaidSubscribers ?? 0}
      currentUsers={(adminOverview?.people?.accounts?.length ?? 0) + (adminOverview?.people?.administrators?.length ?? 0)}
    />
  </Suspense>
  <div className="admin-economics-existing-model">
  <div className="subscription-finance-heading"><div><span className="mini-label">CURRENT LIVE PLANNING MODEL</span><h3>Existing Creator-capacity assumptions</h3></div><span className="status-pill muted">Separate from simulator</span></div>
  <div className="admin-modal-grid">
    <div className="admin-modal-stat"><span>Launch reference</span><strong>{formatMoneyPence(commercialSettings.planningMonthlyPricePence)}</strong></div>
    <div className="admin-modal-stat"><span>Standard-rate cap</span><strong>{formatMoneyPence(commercialSettings.creatorMonthlyCapPence)}</strong></div>
    <div className="admin-modal-stat"><span>Creator ceiling</span><strong>{commercialSettings.creatorPoolPercent}%</strong></div>
    <div className="admin-modal-stat"><span>Company / profit</span><strong>{commercialSettings.companyProfitPercent}%</strong></div>
    <div className="admin-modal-stat"><span>Core business fund</span><strong>{commercialSettings.businessFundPercent}%</strong></div>
  </div>
  <div className="admin-formula">
    <div><b>01</b><strong>Confirmed paid subscriptions</strong></div>
    <div><b>02</b><strong>Configured subscriber rate band</strong></div>
    <div><b>03</b><strong>Equal standard Creator rate</strong></div>
    <div><b>04</b><strong>Hard monthly cap</strong></div>
  </div>
  <div className="rights-ai-lock"><ShieldCheck size={16}/><div><strong>Popularity affects standard pay: NO</strong><span>Verified listening remains valuable for analytics, recommendations and discovery without determining a Creator’s standard monthly rate.</span></div></div>
  <p className="panel-note">Use Commercial controls to edit the live planning price, rate bands, eligibility definition, reserve and final cap. The Finance Lab above is deliberately a sandbox until you decide which scenario becomes policy.</p>
  </div>
</div>}</section></div>}
          </section>
        )}
      </main>

      {user && ageVerified && view === 'profile' && !profileRolesPage && profileDirty && (
        <div className="nj-mobile-profile-save" role="region" aria-label="Unsaved profile changes" aria-busy={profileLoading}>
          <div className="nj-mobile-profile-save-text">
            <strong>{profileLoading ? 'Saving your profile…' : 'Unsaved profile changes'}</strong>
            <small>Save your changes before leaving.</small>
          </div>
          <button type="button" className="primary-button" disabled={profileLoading} onClick={() => void saveProfile()} aria-label={profileLoading ? 'Saving profile changes' : 'Save all profile changes'}>
            {profileLoading ? <RefreshCw size={17} className="nj-save-loading-icon" aria-hidden="true" /> : <Check size={17} aria-hidden="true" />}
            {profileLoading ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      )}
      {user && ageVerified && !liveRolePreview && <MobileNavigation view={view} role={effectiveRole} onNavigate={navigate} onSearch={() => setCommandOpen(true)} onActivity={() => { setNotificationsOpen(true); window.scrollTo({top:0,behavior:"smooth"}); }} activityUnreadCount={notificationUnreadCount} messageUnreadCount={messageUnreadCount} messageNeedsReplyCount={messageNeedsReplyCount} />}

      <footer className="site-footer"><div className="footer-brand">{logoUrl ? <img className="brand-logo footer-logo" src={logoUrl} alt="Nightjar" /> : <img className="brand-logo footer-logo" src={logoUrl ?? "/brand-logo"} alt="Nightjar" />}<strong>NIGHTJAR</strong></div><span>Premium immersive audio for adults.</span><nav className="footer-legal-links" aria-label="Legal"><a href="/legal">T&Cs Centre</a><a href="/legal/terms">Terms</a><a href="/legal/privacy">Privacy</a><a href="/legal/professional">Professional terms</a></nav><span>{user ? accountLabel + ' account' : 'Adult access required'}</span></footer>

      {securityEvidenceReview && <SecurityEvidenceReview review={securityEvidenceReview} onClose={() => setSecurityEvidenceReview(null)} onAssistance={(email) => { setAssistancePrefillEmail(email); setSecurityEvidenceReview(null); openAdminWorkspace('assistance'); }} />}

      {moderationPreviewAsset?.previewUrl && <div className="image-moderation-fullscreen" role="dialog" aria-modal="true" aria-label="Full-screen image moderation preview" onClick={()=>setModerationPreviewAsset(null)}>
        <div className="image-moderation-fullscreen-shell" onClick={(event)=>event.stopPropagation()}>
          <div className="image-moderation-fullscreen-head">
            <div><span className="mini-label">ADMIN IMAGE REVIEW</span><strong>{moderationPreviewAsset.kind === 'profile_avatar' ? 'Profile picture' : moderationPreviewAsset.kind === 'brand_logo' ? 'Nightjar logo' : 'Release artwork'}</strong><small>{moderationPreviewAsset.ownerEmail ?? moderationPreviewAsset.ownerUserId ?? 'Unknown uploader'} · {moderationPreviewAsset.fileName ?? moderationPreviewAsset.contentType ?? 'image'}</small></div>
            <button type="button" className="icon-button" onClick={()=>setModerationPreviewAsset(null)} aria-label="Close full-screen image preview"><X size={22}/></button>
          </div>
          <div className="image-moderation-fullscreen-stage">
            <img src={moderationPreviewAsset.previewUrl} alt="Full-size pending image awaiting administrator moderation" />
          </div>
          <div className="image-moderation-fullscreen-foot"><ShieldCheck size={16}/><span>Inspect the complete image before approving it. Press Escape or click outside the image to close.</span></div>
        </div>
      </div>}

      <GlobalCommandPalette open={commandOpen && !liveRolePreview} onClose={() => setCommandOpen(false)} commands={commandItems} />

      {protectedReaderOpen && protectedReaderScript && <ProtectedReader data={protectedReaderScript} close={() => setProtectedReaderOpen(false)} record={(eventType, context) => void recordProtectionEvent(eventType, protectedReaderScript.script?.id, context)} notify={notify} />}
      {communityUpdateId && user && ageVerified && !demoMode && <CommunityUpdateReader
        id={communityUpdateId}
        onClose={() => {
          setCommunityUpdateId(null);
          const target = new URL(window.location.href);
          if (target.searchParams.has('update')) {
            target.searchParams.delete('update');
            window.history.replaceState({}, '', target.pathname + target.search);
          }
        }}
      />}
      {playing && <NightjarPlayer
        key={playing + (momentSeek?.releaseId === playing ? ':' + momentSeek.nonce : '')}
        track={tracks.find((track) => track.id === playing) ?? null}
        queue={tracks}
        onSelectTrack={(next) => togglePlayback(next as Track)}
        intent={currentIntent}
        onClose={() => { setPlaying(null); setTranscriptRequested(null); }}
        notify={notify}
        simulationMode={demoMode}
        initialTranscriptOpen={transcriptRequested === playing}
        initialSeekSeconds={momentSeek?.releaseId === playing ? momentSeek.seconds : null}
      />}
      {creatorProfileUserId && <Suspense fallback={<NightjarSkeleton variant="profile" count={2} label="Loading Creator profile" />}><CreatorProfile creatorUserId={creatorProfileUserId} followingIds={followingProfileIds} onToggleFollow={liveRolePreview ? async () => { notify('Read-only preview: follow actions are disabled.'); } : toggleProfileFollow} onPlayRelease={liveRolePreview ? () => notify('Playback requires an authorised Listener account.') : playReleaseFromCreatorProfile} onClose={() => setCreatorProfileUserId(null)} notify={notify} canMessage={!liveRolePreview && ['creator','writer','editor','artist'].includes(String(effectiveRole)) && creatorProfileUserId !== user?.userId} onMessage={(targetUserId)=>{ setCreatorProfileUserId(null); setMessageRecipientUserId(targetUserId); setMessageCollaborationId(null); navigate('messages'); }} onCommunityRelease={(release)=>{ if (liveRolePreview) { notify('Read-only preview: community interactions are disabled.'); return; } setCreatorProfileUserId(null); setReviewTrack(releaseToTrack(release)); }} canReact={effectiveRole==='listener' && !liveRolePreview} reactionByRelease={releaseReactions} onReaction={(releaseId,reaction)=>void toggleReleaseReaction(releaseId,reaction)} communityByRelease={communityByRelease} demoMode={demoMode} /></Suspense>}
      {supportTarget && !liveRolePreview && <Suspense fallback={<NightjarSkeleton variant="profile" count={2} label="Opening Nightjars support" />}>
        <NightjarGiftPanel recipientUserId={supportTarget.userId} recipientName={supportTarget.name} recipientRole={supportTarget.role} recipientRoles={supportTarget.roles} onClose={()=>setSupportTarget(null)} notify={notify}/>
      </Suspense>}
      {publicProfileUserId && <Suspense fallback={<NightjarSkeleton variant="profile" count={2} label="Loading public profile" />}><PublicProfile key={publicProfileUserId+':'+(publicProfileInitialRole??'default')+':'+(notificationArtworkFocusId??'none')} initialRole={publicProfileInitialRole??undefined} focusArtworkId={notificationArtworkFocusId} userId={publicProfileUserId} followingIds={followingProfileIds} onToggleFollow={liveRolePreview ? async () => { notify('Read-only preview: follow actions are disabled.'); } : toggleProfileFollow} readOnlyPreview={liveRolePreview} onClose={closePublicProfile} notify={notify} canMessage={!liveRolePreview && ['creator','writer','editor','artist'].includes(String(effectiveRole)) && publicProfileUserId !== user?.userId} onMessage={(targetUserId)=>{ closePublicProfile(); setMessageRecipientUserId(targetUserId); setMessageCollaborationId(null); navigate('messages'); }} onCommunityRelease={(release)=>{ if (liveRolePreview) { notify('Read-only preview: community interactions are disabled.'); return; } closePublicProfile(); setReviewTrack(releaseToTrack(release)); }} canReact={effectiveRole==='listener' && !liveRolePreview} reactionByRelease={releaseReactions} onReaction={(releaseId,reaction)=>void toggleReleaseReaction(releaseId,reaction)} communityByRelease={communityByRelease} demoMode={demoMode} /></Suspense>}
      <Suspense fallback={null}><ContentModeration open={moderationOpen && canAdmin && !simulationMode} onClose={() => setModerationOpen(false)} notify={notify} demoMode={demoMode} onMessageCreator={(creatorId) => { setModerationOpen(false);setMessageRecipientUserId(creatorId);setMessageConversationId(null);setMessageCollaborationId(null);navigate('messages'); }} onDeleted={(releaseId) => { setTracks((items) => items.filter((track) => track.id !== releaseId)); setPlaying((id) => id === releaseId ? null : id); }} /></Suspense>
      {reviewTrack && <Suspense fallback={<NightjarSkeleton variant="list" count={2} label="Loading release community" />}><ReleaseReviews release={{ id: reviewTrack.id, title: reviewTrack.title, creator: reviewTrack.creator, creatorUserId: reviewTrack.creatorUserId ?? null, contributors: reviewTrack.contributors ?? [] }} onClose={() => setReviewTrack(null)} notify={notify} demoMode={demoMode} simulationMode={simulationMode} viewerRole={effectiveRole} currentUserId={user?.userId ?? null} onCommunityChanged={(summary)=>applyReleaseCommunityCounts(reviewTrack.id, summary)} onOpenProfile={(userId, role) => { setReviewTrack(null); openPublicProfile(userId, role); }} /></Suspense>}
      {showOnboarding && user && role !== 'admin' && <Suspense fallback={<NightjarSkeleton variant="page" count={3} label="Loading Nightjar setup" />}><NightjarOnboarding initialProfile={profile} role={role} onComplete={(nextProfile) => { const merged = applyProfileRoleDraft(nextProfile, profileEditRole); setProfile(merged); setProfileBaseline(structuredClone(merged)); setProfileSaveError(''); setShowOnboarding(false); }} onSkip={(draft,stepIndex,revision)=>finishOnboardingLater(draft,stepIndex,revision)} notify={notify} /></Suspense>}
      {toast && <div className="toast nj-toast" role="status" aria-live="polite"><span>{toast}</span>{toastAction && <button type="button" onClick={() => { const action=toastAction; clearToastTimer(); setToastAction(null); setToast(null); void action.run(); }}>{toastAction.label}</button>}</div>}

      {user && !rolePicker && !liveRolePreview && !(view === 'profile' && profileDirty) && (
        <button className="floating-account" onClick={() => liveRolePreview ? clearAdminPreview() : simulationMode ? (navigate('profile'), void loadProfile()) : setRolePicker(true)} aria-label="Open account information">
          <UserCircle2 size={16} /><span>{simulationMode ? simulationIdentity.label + ' simulation' : roleMeta[role ?? 'listener'].label}</span>
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
    transcriptAvailable: release.transcriptAvailable === true,
    transcriptLanguage: release.transcriptLanguage ?? 'en',
    transcriptWordCount: Math.max(0, Number(release.transcriptWordCount ?? 0)),
    creatorUserId: release.creatorUserId,
    genre: release.genre ?? '',
    mood: release.mood ?? '',
    tags: release.tags ?? [],
    tropes: release.tropes ?? [],
    contributors: release.contributors ?? [],
    contentRating: release.contentRating ?? 'adult',
    seriesTitle: release.seriesTitle ?? null,
    episodeNumber: release.episodeNumber ?? null,
    nightjarOriginal: release.nightjarOriginal === true,
    releaseDistribution: release.releaseDistribution ?? 'standard',
    productionNote: release.productionNote ?? null,
    communityLikeCount: Math.max(0, Number(release.communityLikeCount ?? 0)),
    communityLoveCount: Math.max(0, Number(release.communityLoveCount ?? 0)),
    communityReactionCount: Math.max(0, Number(release.communityReactionCount ?? 0)),
    communityCommentCount: Math.max(0, Number(release.communityCommentCount ?? 0)),
    listenCount: Math.max(0, Number(release.listenCount ?? 0)),
    playbackAllowed: typeof release.playbackAllowed === 'boolean' ? release.playbackAllowed : undefined,
    playbackAccessReason: release.playbackAccessReason ?? null,
  };
}

function ReleaseCoverVisual({ artworkUrl, brandLogoUrl }: { artworkUrl?: string | null; brandLogoUrl: string }) {
  const [artworkFailed, setArtworkFailed] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);
  useEffect(() => setArtworkFailed(false), [artworkUrl]);
  useEffect(() => setLogoFailed(false), [brandLogoUrl]);

  return artworkUrl?.trim() && !artworkFailed ? (
    <img className="release-cover-media" src={artworkUrl} alt="" loading="lazy" onError={() => setArtworkFailed(true)} />
  ) : (
    <div className="release-cover-brand" aria-hidden="true">
      {logoFailed
        ? <span className="release-cover-wordmark">NIGHTJAR</span>
        : <img className="release-cover-brand-logo" src={brandLogoUrl} alt="" loading="lazy" onError={() => setLogoFailed(true)} />}
    </div>
  );
}

function LiveTrackCard({ track, playing, favourite, reaction, canReact, onPlay, onRead, onFavourite, onReaction, onCommunity, reason, brandLogoUrl, highlighted = false }: { highlighted?: boolean; track: Track; playing: boolean; favourite: boolean; reaction: ReleaseReaction; canReact: boolean; onPlay: (track: Track) => void; onRead: (track: Track) => void; onFavourite: () => void; onReaction: (reaction: Exclude<ReleaseReaction,null>) => void; onCommunity: () => void; reason?: string; brandLogoUrl: string }) {
  return <article id={"nightjar-release-" + track.id} className={highlighted ? "track-card nightjar-notification-target" : "track-card"}>
    <div className="track-cover release-cover">
      <ReleaseCoverVisual artworkUrl={track.artworkUrl} brandLogoUrl={brandLogoUrl} />
      <span className="track-index">{track.category}</span>
      <button className="cover-play" disabled={!track.audioAvailable && !track.audioUrl} onClick={() => onPlay(track)} aria-label={!track.audioAvailable && !track.audioUrl ? 'Audio not connected' : playing ? 'Pause ' + track.title : 'Play ' + track.title}>
        {playing ? <Pause size={18} /> : <Play size={18} fill="currentColor" />}
      </button>
    </div>
    <div className="track-body">
      <div className="track-type"><span>{track.creator}</span><span>{track.duration}</span></div>
      <h3>{track.title}</h3>
      <small className="track-verified-listens"><Headphones size={13} aria-hidden="true"/> {Number(track.listenCount ?? 0).toLocaleString('en-GB')} qualified listens</small>
      {(track.seriesTitle || track.contentRating || track.nightjarOriginal || (track.releaseDistribution && track.releaseDistribution !== 'standard') || track.transcriptAvailable) && <div className="track-meta-line">{track.nightjarOriginal && <span>NIGHTJAR ORIGINAL</span>}{track.releaseDistribution === 'nightjar_first' && <span>FIRST ON NIGHTJAR</span>}{track.transcriptAvailable && <span>TRANSCRIPT AVAILABLE</span>}{track.seriesTitle && <span>{track.seriesTitle}{track.episodeNumber != null ? ' · Episode ' + track.episodeNumber : ''}</span>}<span>{String(track.contentRating ?? 'adult').toUpperCase()}</span></div>}
      <p>{track.descriptor}</p>
      {track.productionNote && <p className="track-production-note"><strong>Behind the scenes:</strong> {track.productionNote}</p>}
      {!!track.contributors?.length && <div className="track-credit-line">{track.contributors.slice(0,4).map((credit)=><span key={credit.role + ':' + credit.name}>{credit.role}: {credit.name}</span>)}</div>}
      <div className="track-footer">
        <span className={track.playbackAccessReason === 'subscription_required' ? 'creator-link track-access-state locked' : 'creator-link track-access-state'}>{!track.audioAvailable && !track.audioUrl ? 'Audio not connected' : track.playbackAccessReason === 'credited_work' ? 'Included · your credited work' : track.playbackAccessReason === 'subscription' ? 'Included with subscription' : track.playbackAccessReason === 'admin' ? 'Administrator access' : track.playbackAccessReason === 'subscription_required' ? 'Subscription required' : 'Age-gated audio ready'}</span>
        <div className="track-footer-actions">
          {track.transcriptAvailable && <button className="text-button track-transcript-button" onClick={() => onRead(track)}><FileText size={14}/> Read transcript</button>}
          {canReact && <button className={reaction === 'like' ? 'text-button track-reaction-button active' : 'text-button track-reaction-button'} onClick={() => onReaction('like')} aria-pressed={reaction === 'like'} title="Like this published work"><ThumbsUp size={14} fill={reaction === 'like' ? 'currentColor' : 'none'}/> Like <span>{track.communityLikeCount ?? 0}</span></button>}
          {canReact && <button className={reaction === 'love' ? 'text-button track-reaction-button active' : 'text-button track-reaction-button'} onClick={() => onReaction('love')} aria-pressed={reaction === 'love'} title="Love this published work"><Heart size={14} fill={reaction === 'love' ? 'currentColor' : 'none'}/> Love <span>{track.communityLoveCount ?? 0}</span></button>}
          <button className="text-button track-community-button" onClick={onCommunity}><MessageCircle size={14}/> Comments <span>{track.communityCommentCount ?? 0}</span></button>
          <button className="icon-button" onClick={onFavourite} aria-label={favourite ? 'Remove private favourite' : 'Save privately to favourites'} title={favourite ? 'Private favourite saved' : 'Save privately to favourites'}><Bookmark size={16} fill={favourite ? 'currentColor' : 'none'} /></button>
        </div>
      </div>
      {reason && <p className="recommendation-reason"><Sparkles size={12} />{reason}</p>}
    </div>
  </article>;
}

function ProtectedReader({ data, close, record, notify }: { data: any; close: () => void; record: (eventType: string, context?: Record<string, unknown>) => void; notify: (message: string) => void }) {
  const script = data.script ?? {};
  const content = String(script.content ?? '');
  const sourceFile = data.sourceFile ?? null;
  const sessionId = String(data.readerSession?.sessionId ?? 'authorised');
  const accountId = String(data.readerSession?.accountId ?? data.readerSession?.userId ?? '');
  const watermark = ['NIGHTJAR', sessionId, accountId ? 'ACCOUNT ' + accountId.slice(-10) : '', script.id ? 'SCRIPT ' + String(script.id).slice(-10) : ''].filter(Boolean).join(' · ');
  const lastCaptureSignalAt = useRef(0);

  // The only intentional body scroll lock is the active protected reader.
  // Keep it independent of logging/notification callback changes, so a
  // routine re-render cannot tear down and recreate the document scroll lock.
  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.body.classList.add('nightjar-protected-reader-open');
    return () => {
      document.body.style.overflow = original;
      document.body.classList.remove('nightjar-protected-reader-open');
    };
  }, []);

  useEffect(() => {
    const eventContext = (detectionSource?: string, detectionConfidence?: string) => ({
      readerSessionId: sessionId,
      visibilityState: document.visibilityState,
      ...(detectionSource ? { detectionSource } : {}),
      ...(detectionConfidence ? { detectionConfidence } : {}),
    });

    const recordCapture = (eventType: string, detectionSource: string, detectionConfidence: 'possible' | 'strong' | 'native_callback', message?: string) => {
      const now = Date.now();
      if (now - lastCaptureSignalAt.current < 700) return;
      lastCaptureSignalAt.current = now;
      record(eventType, eventContext(detectionSource, detectionConfidence));
      if (message) notify(message);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      const key = String(event.key ?? '').toLowerCase();
      const code = String(event.code ?? '').toLowerCase();
      const command = event.ctrlKey || event.metaKey;

      if (command && key === 'p') {
        event.preventDefault();
        record('print_blocked', eventContext('browser_keyboard', 'strong'));
        notify('Printing is disabled inside the protected reader.');
        return;
      }

      if (command && key === 's') {
        event.preventDefault();
        record('save_page_blocked', eventContext('browser_keyboard', 'strong'));
        notify('Saving this protected manuscript as a web page is disabled.');
        return;
      }

      if (!data.copyAllowed && command && key === 'a') {
        event.preventDefault();
        record('selection_blocked', eventContext('browser_keyboard', 'strong'));
        notify('Select-all is disabled for this protected manuscript.');
        return;
      }

      const windowsSnipShortcut = event.metaKey && event.shiftKey && key === 's';
      const macCaptureShortcut = event.metaKey && event.shiftKey && ['3','4','5'].includes(key);
      if (windowsSnipShortcut || macCaptureShortcut) {
        recordCapture(
          'possible_capture_shortcut',
          windowsSnipShortcut ? 'windows_capture_shortcut' : 'macos_capture_shortcut',
          'possible',
          'Nightjar recorded a possible operating-system capture shortcut for this protected reader session.',
        );
        return;
      }

      if (key === 'printscreen' || code === 'printscreen') {
        recordCapture(
          'possible_screenshot_key',
          'keyboard_printscreen',
          'possible',
          'Nightjar recorded a possible screenshot-key signal for this protected reader session.',
        );
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      const key = String(event.key ?? '').toLowerCase();
      const code = String(event.code ?? '').toLowerCase();
      if (key === 'printscreen' || code === 'printscreen') {
        recordCapture(
          'possible_screenshot_key',
          'keyboard_printscreen',
          'possible',
          'Nightjar recorded a possible screenshot-key signal for this protected reader session.',
        );
      }
    };

    const handleBeforePrint = () => {
      record('print_dialog_attempt', eventContext('browser_beforeprint', 'strong'));
    };

    const handleNativeScreenshot = (event: Event) => {
      const detail = (event as CustomEvent<Record<string, unknown>>).detail ?? {};
      recordCapture(
        'native_screenshot_detected',
        String(detail.source ?? 'native_screenshot_bridge'),
        'native_callback',
        'Nightjar recorded a native screenshot callback for this protected reader session.',
      );
    };

    const handleNativeScreenCapture = (event: Event) => {
      const detail = (event as CustomEvent<Record<string, unknown>>).detail ?? {};
      recordCapture(
        'native_screen_capture_detected',
        String(detail.source ?? 'native_screen_capture_bridge'),
        'native_callback',
        'Nightjar recorded a native screen-capture callback for this protected reader session.',
      );
    };

    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('keyup', handleKeyUp, true);
    window.addEventListener('beforeprint', handleBeforePrint);
    window.addEventListener('nightjar:native-screenshot', handleNativeScreenshot as EventListener);
    window.addEventListener('nightjar:native-screen-capture', handleNativeScreenCapture as EventListener);

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('keyup', handleKeyUp, true);
      window.removeEventListener('beforeprint', handleBeforePrint);
      window.removeEventListener('nightjar:native-screenshot', handleNativeScreenshot as EventListener);
      window.removeEventListener('nightjar:native-screen-capture', handleNativeScreenCapture as EventListener);
    };
  }, [data.copyAllowed, sessionId, record, notify]);

  const blockSelectedText = () => {
    if (data.copyAllowed) return;
    const selection = window.getSelection();
    if (!selection || !selection.toString().trim()) return;
    selection.removeAllRanges();
    record('selection_blocked', {
      readerSessionId: sessionId,
      detectionSource: 'reader_selection',
      detectionConfidence: 'strong',
    });
    notify('Text selection is disabled for this protected manuscript.');
  };

  const openProtectedSource = () => {
    if (!sourceFile?.url) {
      notify('The protected source file is not available for this reader session.');
      return;
    }
    record('source_file_opened', {
      readerSessionId: sessionId,
      detectionSource: 'protected_source_link',
      detectionConfidence: 'strong',
    });
    const opened = window.open(sourceFile.url, '_blank', 'noopener,noreferrer');
    if (!opened) notify('Your browser blocked the protected source window. Allow pop-ups for Nightjar and try again.');
  };

  const exportScript = () => {
    if (!data.exportAllowed) {
      record('export_blocked', { readerSessionId: sessionId });
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
    record('writer_authorised_export', { readerSessionId: sessionId });
    notify('Writer-authorised script export created.');
  };

  return <div className="protected-reader-backdrop" role="dialog" aria-modal="true" aria-label="Protected manuscript reader">
    <section
      className={data.copyAllowed ? 'protected-reader' : 'protected-reader copy-locked'}
      onCopy={(event) => { if (!data.copyAllowed) { event.preventDefault(); record('copy_blocked', { readerSessionId: sessionId, detectionSource:'reader_copy', detectionConfidence:'strong' }); notify('Copy is disabled for this protected manuscript.'); } else record('writer_authorised_copy', { readerSessionId: sessionId }); }}
      onCut={(event) => { if (!data.copyAllowed) { event.preventDefault(); record('cut_blocked', { readerSessionId: sessionId, detectionSource:'reader_cut', detectionConfidence:'strong' }); } }}
      onPaste={(event) => { if (!data.copyAllowed) { event.preventDefault(); record('paste_blocked', { readerSessionId: sessionId, detectionSource:'reader_paste', detectionConfidence:'strong' }); } }}
      onContextMenu={(event) => { if (!data.copyAllowed) { event.preventDefault(); record('contextmenu_blocked', { readerSessionId: sessionId, detectionSource:'reader_contextmenu', detectionConfidence:'strong' }); } }}
      onDragStart={(event) => { if (!data.copyAllowed) { event.preventDefault(); record('drag_blocked', { readerSessionId: sessionId, detectionSource:'reader_drag', detectionConfidence:'strong' }); } }}
      onPointerUp={blockSelectedText}
    >
      <header><div><span className="mini-label">NIGHTJAR / PROTECTED SCRIPT</span><h2>{script.title ?? 'Protected manuscript'}</h2><p>Reader session {sessionId} · expires {data.readerSession?.expiresAt ? new Date(data.readerSession.expiresAt).toLocaleTimeString('en-GB') : 'soon'}</p></div><button className="icon-button" onClick={close} aria-label="Close protected manuscript"><X size={18} /></button></header>
      <div className="reader-notice"><ShieldCheck size={15} /><span>Nightjar records detectable browser capture shortcuts as possible signals, not proof. Native Android/iOS shells can send stronger OS-level screenshot or screen-capture callbacks. Session watermarking remains active in every protected reader.</span></div>
      <div className="reader-protection-status" aria-label="Protected reader safeguards">
        <span><ShieldCheck size={13}/> Session watermark active</span>
        <span><ClipboardX size={13}/> {data.copyAllowed ? 'Writer-authorised copy' : 'Copy / selection restricted'}</span>
        <span><FileCheck2 size={13}/> Capture signals retained as evidence</span>
      </div>
      <article className="reader-body">
        <div className="reader-watermark-field" aria-hidden="true">{Array.from({length: 12}).map((_, index) => <span key={index}>{watermark}</span>)}</div>
        <p className="reader-watermark">{watermark}</p>
        {sourceFile?.url&&<div className="reader-source-file"><div><FileText size={19}/><span><strong>{sourceFile.fileName ?? 'Uploaded manuscript'}</strong><small>Protected original · link expires {sourceFile.expiresAt ? new Date(sourceFile.expiresAt).toLocaleTimeString('en-GB') : 'with this reader session'}</small></span></div><button type="button" className="secondary-button" onClick={openProtectedSource}><FileText size={14}/> Open protected source</button></div>}
        {content ? content.split(/\n+/).filter(Boolean).map((paragraph: string, index: number) => <p key={index}>{paragraph}</p>) : sourceFile?.url ? <p className="reader-source-note">This manuscript was uploaded as an original file. Open the protected source above to read the writer’s supplied document.</p> : <p>No manuscript content supplied.</p>}
      </article>
      <footer><span><LockKeyhole size={14} /> Copy {data.copyAllowed ? 'allowed by writer' : 'off'}</span><button className="reader-export-button" onClick={exportScript} disabled={!data.exportAllowed}><Download size={14} /> {data.exportAllowed ? 'Writer-authorised export' : 'Export off'}</button><span>Browser capture detection is best-effort · access logged</span></footer>
    </section>
  </div>;
}

export default App;
