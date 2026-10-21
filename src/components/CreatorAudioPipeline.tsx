import { useEffect, useMemo, useRef, useState } from 'react';
import { nightjarCatalogue } from '../platform/firebase-catalogue';
import { nightjarMedia } from '../platform/firebase-media';
import { nightjarCollaboration } from '../platform/firebase-collaboration';
import { nightjarCommunity } from '../platform/firebase-community';
import { BookOpenText, Check, ImagePlus, Mic2, Music2, Send, UploadCloud } from 'lucide-react';
import { nightjarAudioFileProblem } from '../platform/audio-upload';
import { creatorEditableMetadata, creatorMetadataSignature } from '../platform/creator-release-metadata';
import { demoDirectory } from '../demo/nightjarDemo';
import SearchableMultiSelect from './SearchableMultiSelect';
import ContextHelp from './ContextHelp';
import ImageFramingEditor from './ImageFramingEditor';
import {nightjarWorkFraming} from '../platform/firebase-artwork-framing';
import type {ApprovedWorkFraming} from '../platform/firebase-artwork-framing';
import FramedApprovedImage from './FramedApprovedImage';
import ManualTranscriptSync from './ManualTranscriptSync';
import { readCreatorTranscriptFile } from '../platform/transcript-file-import';
import TranscriptSyncTool from './TranscriptSyncTool';
import './creator-workflow.css';
import './cloud-profile-draft.css';
import { PROFILE_TAG_OPTIONS, PROFILE_TROPE_OPTIONS } from '../data/nightjarTaxonomy';

type Release = {
  id: string;
  title?: string;
  description?: string;
  category?: string;
  genre?: string;
  mood?: string;
  tags?: string[];
  tropes?: string[];
  durationMinutes?: number;
  audioAvailable?: boolean;
  audioCleanupPending?: boolean;
  audioUrl?: string | null;
  artworkUrl?: string | null;
  artworkAssetId?: string | null;
  artworkFraming?: ApprovedWorkFraming | null;
  artworkStatus?: 'approved' | 'removed' | null;
  pendingArtworkAssetId?: string | null;
  pendingArtworkStatus?: 'pending' | 'rejected' | null;
  status?: string;
  scheduledAt?: string | null;
  scheduledLocal?: string | null;
  scheduledTimeZone?: string | null;
  moderationNote?: string | null;
  contributors?: { userId?: string | null; name: string; role: string }[];
  contentRating?: 'sfw' | 'suggestive' | 'adult' | 'explicit';
  seriesTitle?: string | null;
  episodeNumber?: number | null;
  nightjarOriginal?: boolean;
  releaseDistribution?: 'standard' | 'nightjar_first';
  releaseDistributionConfirmed?: boolean;
  productionNote?: string | null;
  rightsConfirmed?: boolean;
  contributorPermissionsConfirmed?: boolean;
  transcriptText?: string;
  transcriptLanguage?: string;
  transcriptAvailable?: boolean;
  transcriptWordCount?: number;
  transcriptAccessibilityReviewed?: boolean;
  metadataRevision?: number;
};

type Props = {
  releases: Release[];
  accountStatus: 'active' | 'pending_review';
  canPublish: boolean;
  onRefresh: () => Promise<void>;
  notify: (message: string) => void;
  simulationMode?: boolean;
  onSimulationChange?: (release: Release | null, deletedId?: string) => void;
  focusReleaseId?: string | null;
  onSubmitted?: () => void;
  onDeleted?: (id: string) => void;
};

const readDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = reject;
  reader.readAsDataURL(file);
});

const readAudioDurationMinutes = (file: File) => new Promise<number | null>((resolve) => {
  const objectUrl = URL.createObjectURL(file);
  const audio = document.createElement('audio');
  audio.preload = 'metadata';
  audio.onloadedmetadata = () => {
    const seconds = Number(audio.duration);
    URL.revokeObjectURL(objectUrl);
    resolve(Number.isFinite(seconds) && seconds > 0 ? Number((seconds / 60).toFixed(1)) : null);
  };
  audio.onerror = () => {
    URL.revokeObjectURL(objectUrl);
    resolve(null);
  };
  audio.src = objectUrl;
});

export default function CreatorAudioPipeline({ releases, accountStatus, canPublish, onRefresh, notify, simulationMode = false, onSimulationChange, focusReleaseId, onSubmitted, onDeleted }: Props) {
  const [selectedRelease, setSelectedRelease] = useState<Release | null>(null);
  const [creatingDraft, setCreatingDraft] = useState(false);
  const createInFlight = useRef(false);
  const [workflowStep, setWorkflowStep] = useState<'prepare' | 'review'>('prepare');
  const [draft, setDraft] = useState({ title: '', description: '', category: '', genre: '', mood: '', tags: '', tropes: '' });
  const [audioBusy, setAudioBusy] = useState(false);
  const [audioStage, setAudioStage] = useState<'idle' | 'uploading' | 'verifying' | 'saved' | 'error'>('idle');
  const [audioProgress, setAudioProgress] = useState(0);
  const [audioFileLabel, setAudioFileLabel] = useState('');
  const [audioRecoveryAvailable,setAudioRecoveryAvailable] = useState(false);
  const [audioTransferInterrupted,setAudioTransferInterrupted] = useState(false);
  const [audioFeedback, setAudioFeedback] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [submissionConfirmed, setSubmissionConfirmed] = useState(false);
  const handledFocus = useRef<string | null>(null);
  const lastOpenedKey = 'nightjar:last-opened-creator-release';
  const [artBusy, setArtBusy] = useState(false);
  const [artFrameFile,setArtFrameFile]=useState<File|null>(null);
  const [approvedFrameRelease,setApprovedFrameRelease]=useState<{id:string;assetId:string;src:string;framing:ApprovedWorkFraming|null}|null>(null);
  const [creditDirectory, setCreditDirectory] = useState<any[]>([]);
  const [promotedTagOptions, setPromotedTagOptions] = useState<string[]>([]);
  const [metadataStatus, setMetadataStatus] = useState<'saved'|'unsaved'|'saving'|'offline'|'conflict'>('saved');
  const [metadataConflict, setMetadataConflict] = useState<Release | null>(null);
  const metadataBaseline = useRef(new Map<string,{signature:string;revision:number}>());
  const metadataInFlight = useRef<Promise<boolean> | null>(null);
  const latestRelease = useRef<Release | null>(null);
  latestRelease.current = selectedRelease;

  const acceptSavedVersion = (release: Release) => {
    metadataBaseline.current.set(release.id,{
      signature:creatorMetadataSignature(release),
      revision:Math.max(0,Number(release.metadataRevision ?? 0)),
    });
  };

  const applyServerRelease = (release: Release) => {
    setSelectedRelease((previous) => {
      if (previous?.id !== release.id) return previous;
      const saved = metadataBaseline.current.get(release.id);
      if (saved && creatorMetadataSignature(previous) !== saved.signature) {
        // Media finalization may complete while a member is still typing.
        // Preserve their unsaved fields and unsubmitted declarations.
        return {...release,...creatorEditableMetadata(previous),
          rightsConfirmed:previous.rightsConfirmed,
          contributorPermissionsConfirmed:previous.contributorPermissionsConfirmed,
          transcriptAccessibilityReviewed:previous.transcriptAccessibilityReviewed,
          releaseDistributionConfirmed:previous.releaseDistributionConfirmed,
        };
      }
      acceptSavedVersion(release);
      return release;
    });
  };

  const persistReleaseMetadata = async (requested: Release, explicit = false): Promise<boolean> => {
    if (simulationMode) return true;
    if (metadataConflict) return false;
    if (metadataInFlight.current) {
      if (!await metadataInFlight.current) return false;
      if (latestRelease.current?.id === requested.id) requested = latestRelease.current;
    }
    if (requested.status !== 'draft') return false;
    const baseline = metadataBaseline.current.get(requested.id);
    if (!baseline) {
      // The initially rendered item came from the private account dashboard.
      acceptSavedVersion(requested);
      if (!explicit) return true;
    }
    const known = metadataBaseline.current.get(requested.id)!;
    const savedSignature = creatorMetadataSignature(requested);
    if (!explicit && savedSignature === known.signature) return true;
    setMetadataStatus('saving');
    const task = (async () => {
      try {
        const response = await nightjarCatalogue.update(requested.id,{
          ...creatorEditableMetadata(requested),
          expectedMetadataRevision:known.revision,
          ...(explicit ? {
            rightsConfirmed:requested.rightsConfirmed === true,
            contributorPermissionsConfirmed:requested.contributorPermissionsConfirmed === true,
            transcriptAccessibilityReviewed:requested.transcriptAccessibilityReviewed === true,
            releaseDistributionConfirmed:requested.releaseDistributionConfirmed === true,
          } : {
            // Editing transcript text invalidates prior accuracy approval.
            ...(requested.transcriptAccessibilityReviewed === false ? {transcriptAccessibilityReviewed:false} : {}),
            ...(requested.releaseDistribution === 'standard' ? {releaseDistributionConfirmed:false} : {}),
          }),
        });
        const canonical = response.release as Release;
        if (!canonical?.id) throw new Error('Nightjar did not acknowledge the metadata save.');
        metadataBaseline.current.set(requested.id,{
          signature:savedSignature,
          revision:Number(canonical.metadataRevision ?? known.revision + 1),
        });
        setSelectedRelease((previous) => previous?.id === requested.id
          ? {...previous, metadataRevision:canonical.metadataRevision}
          : previous);
        if (latestRelease.current?.id === requested.id) {
          setMetadataStatus(creatorMetadataSignature(latestRelease.current) === savedSignature ? 'saved' : 'unsaved');
        }
        return true;
      } catch (error) {
        // A lost callable response can follow a successful commit. Re-read
        // canonical state instead of blindly retrying and overwriting it.
        let remote:Release|undefined;
        try {
          const data = await nightjarCatalogue.dashboard();
          remote = (data.releases as Release[] | undefined)?.find((entry) => entry.id === requested.id);
        } catch { /* preserve the local editor; nothing is marked saved */ }
        if (remote && Number(remote.metadataRevision ?? 0) > known.revision &&
            creatorMetadataSignature(remote) === savedSignature &&
            (!explicit || (
              remote.rightsConfirmed === (requested.rightsConfirmed === true) &&
              remote.contributorPermissionsConfirmed === (requested.contributorPermissionsConfirmed === true) &&
              remote.transcriptAccessibilityReviewed === (requested.transcriptAccessibilityReviewed === true) &&
              remote.releaseDistributionConfirmed === (requested.releaseDistributionConfirmed === true)
            ))) {
          acceptSavedVersion(remote);
          setSelectedRelease(previous=>previous?.id===remote!.id
            ? {...previous,metadataRevision:remote!.metadataRevision} : previous);
          setMetadataStatus(creatorMetadataSignature(latestRelease.current ?? requested) === savedSignature ? 'saved' : 'unsaved');
          return true;
        }
        if (remote && Number(remote.metadataRevision ?? 0) !== known.revision) {
          setMetadataConflict(remote);
          setMetadataStatus('conflict');
        } else {
          setMetadataStatus('offline');
          if (explicit) notify(error instanceof Error ? error.message : 'Nightjar could not confirm that the release details were saved.');
        }
        return false;
      }
    })();
    metadataInFlight.current = task;
    try { return await task; }
    finally { if (metadataInFlight.current === task) metadataInFlight.current = null; }
  };

  const chooseLatestRelease = () => {
    if (!metadataConflict) return;
    acceptSavedVersion(metadataConflict);
    setSelectedRelease(metadataConflict);
    setMetadataConflict(null);
    setMetadataStatus('saved');
  };
  const keepCurrentRelease = () => {
    if (!metadataConflict) return;
    acceptSavedVersion(metadataConflict);
    setSelectedRelease(previous=>previous?.id===metadataConflict.id
      ? {...previous,metadataRevision:metadataConflict.metadataRevision} : previous);
    setMetadataConflict(null);
    setMetadataStatus('unsaved');
  };

  const current = selectedRelease ?? null;
  // Show existing drafts immediately instead of leaving creators in an empty editor.
  useEffect(() => {
    if (selectedRelease || releases.length === 0) return;
    let lastOpened = '';
    try { lastOpened = window.sessionStorage.getItem(lastOpenedKey) ?? ''; } catch { /* private storage may be unavailable */ }
    const next = releases.find((item) => item.id === focusReleaseId) ?? releases.find((item) => item.id === lastOpened) ?? releases.find((item) => item.status === 'draft') ?? releases[0];
    acceptSavedVersion(next);
    setSelectedRelease(next);
    setWorkflowStep(next.status === 'draft' ? 'prepare' : 'review');
  }, [releases, selectedRelease, focusReleaseId]);

  useEffect(() => {
    if (!focusReleaseId || handledFocus.current === focusReleaseId) return;
    const match = releases.find((release) => release.id === focusReleaseId);
    if (match) {
      handledFocus.current = focusReleaseId;
      acceptSavedVersion(match);
      setSelectedRelease(match);
      setWorkflowStep('review');
      try { window.sessionStorage.setItem(lastOpenedKey, match.id); } catch {}
    }
  }, [focusReleaseId, releases]);

  // Reconcile read-only submission status after a refresh without overwriting
  // unfinished metadata that a creator is still editing locally.
  useEffect(() => {
    if (!selectedRelease || selectedRelease.status === 'draft') return;
    const refreshed = releases.find((release) => release.id === selectedRelease.id);
    if (refreshed && refreshed.status !== 'draft') setSelectedRelease((prior) => prior?.id === refreshed.id && JSON.stringify(prior) !== JSON.stringify(refreshed) ? refreshed : prior);
  }, [releases, selectedRelease?.id, selectedRelease?.status]);

  useEffect(() => {
    // A refresh can interrupt the final callable after Storage accepted the
    // bytes. Check only the current authenticated account's local reference.
    setAudioRecoveryAvailable(!simulationMode && !!selectedRelease?.id &&
      selectedRelease.audioAvailable !== true && !selectedRelease.audioCleanupPending &&
      !!nightjarCatalogue.pendingAudio(selectedRelease.id));
    setAudioTransferInterrupted(!simulationMode && !!selectedRelease?.id &&
      selectedRelease.audioAvailable !== true && !selectedRelease.audioCleanupPending &&
      nightjarCatalogue.interruptedAudio(selectedRelease.id));
  }, [simulationMode, selectedRelease?.id, selectedRelease?.audioAvailable, selectedRelease?.audioCleanupPending, audioStage]);

  const recoverAudioUpload = async () => {
    if (!current?.id || audioBusy || submitting || current.audioAvailable || current.audioCleanupPending) return;
    setAudioBusy(true);
    setAudioStage('verifying');
    setAudioFeedback('Checking the already transferred private audio on Nightjar. No new upload is starting.');
    try {
      const data = await nightjarCatalogue.recoverAudio(current.id);
      if (data.release?.audioAvailable !== true) throw new Error('Nightjar did not confirm the audio attachment.');
      applyServerRelease(data.release);
      setAudioRecoveryAvailable(false);
      setAudioTransferInterrupted(false);
      setAudioStage('saved');
      setAudioFeedback('Previously uploaded audio recovered and confirmed on your private release. It is NOT submitted for approval yet.');
      await onRefresh().catch(() => {});
      notify('Your previously transferred recording is now attached. No second upload was needed.');
    } catch (error) {
      setAudioStage('error');
      setAudioFeedback(error instanceof Error ? error.message : 'Recovery is not confirmed. Your previously transferred file has not been deleted.');
    } finally { setAudioBusy(false); }
  };

  const chooseRelease = async (release: Release) => {
    if (current?.id && current.id !== release.id && current.status === 'draft' &&
        creatorMetadataSignature(current) !== metadataBaseline.current.get(current.id)?.signature) {
      if (!await persistReleaseMetadata(current)) {
        notify('Your current release has unsynced changes. Resolve the save before switching recordings.');
        return;
      }
    }
    const server = releases.find(item => item.id === current?.id);
    if (current && server && current.id !== release.id && (
      current.rightsConfirmed !== server.rightsConfirmed ||
      current.contributorPermissionsConfirmed !== server.contributorPermissionsConfirmed ||
      current.transcriptAccessibilityReviewed !== server.transcriptAccessibilityReviewed ||
      current.releaseDistributionConfirmed !== server.releaseDistributionConfirmed
    )) {
      if (!window.confirm('Rights, distribution and transcript accuracy declarations are not autosaved. Leaving now may discard unsaved confirmations. Select Cancel to use Save changes first.')) return;
    }
    acceptSavedVersion(release);
    setMetadataConflict(null);
    setMetadataStatus('saved');
    setSelectedRelease(release);
    try { window.sessionStorage.setItem(lastOpenedKey, release.id); } catch {}
    setWorkflowStep(release.status === 'draft' ? 'prepare' : 'review');
    setAudioStage('idle');
    setAudioFileLabel('');
    setAudioFeedback('');
    setSubmissionConfirmed(false);
  };

  const combinedTagOptions = useMemo(
    () => Array.from(new Set([...PROFILE_TAG_OPTIONS, ...promotedTagOptions])).sort((a, b) => a.localeCompare(b)),
    [promotedTagOptions],
  );

  useEffect(() => {
    if (simulationMode && selectedRelease) onSimulationChange?.(selectedRelease);
  }, [simulationMode, selectedRelease]);

  useEffect(() => {
    if (simulationMode) {
      setPromotedTagOptions([]);
      return;
    }
    let cancelled = false;
    void nightjarCommunity.profileTagCatalogue()
      .then((data) => {
        if (!cancelled) setPromotedTagOptions(data?.tags ?? []);
      })
      .catch(() => {
        if (!cancelled) setPromotedTagOptions([]);
      });
    return () => { cancelled = true; };
  }, [simulationMode]);

  useEffect(() => {
    if (simulationMode) {
      setCreditDirectory(structuredClone(demoDirectory));
      return;
    }
    void nightjarCollaboration.directory()
      .then((data) => setCreditDirectory(data.people ?? []))
      .catch(() => setCreditDirectory([]));
  }, [simulationMode]);
  const statusLabel = current?.status === 'rejected' ? 'REJECTED' : current?.status === 'scheduled' ? 'APPROVED · SCHEDULED' : current?.status === 'removing' ? 'REMOVAL PENDING' : current?.status === 'pending_review' ? 'IN MODERATION' : current?.status === 'released' ? 'LIVE' : current?.status === 'draft' ? 'DRAFT' : String(current?.status ?? 'NEW').toUpperCase();
  const statusHint = current?.status === 'rejected' ? (current.moderationNote || 'This release was not approved. Check Nightjar Messages for the decision and contact the review team.') : current?.status === 'scheduled' ? 'Approved. Publication is automatic at your selected date and time; not visible to listeners yet.' : current?.status === 'removing' ? 'This recording is hidden while Nightjar finishes deleting its files. Retry removal if necessary.' : current?.status === 'pending_review'
    ? 'Your submission is with Nightjar moderation.'
    : current?.status === 'released'
      ? 'Published and available to age-verified listeners.'
      : current?.moderationNote
        ? current.moderationNote
        : 'A complete release can be submitted for moderation.';

  const reviewChecks = [
    { label: 'Recording attached and verified', passed: current?.audioAvailable === true, target: 'release-audio', help: 'Upload an MP3, WAV, M4A, OGG or WebM recording.' },
    { label: 'Release title', passed: Boolean(current?.title?.trim()), target: 'release-details', help: 'Give your recording a title.' },
    { label: 'Category', passed: Boolean(current?.category?.trim()), target: 'release-details', help: 'Enter the type of release.' },
    { label: 'Description', passed: Boolean(current?.description?.trim()), target: 'release-details', help: 'Add a short listener-facing description.' },
    { label: 'Publishing rights confirmed', passed: current?.rightsConfirmed === true, target: 'release-rights', help: 'Confirm you control the publishing rights.' },
    { label: 'Contributor permissions confirmed', passed: current?.contributorPermissionsConfirmed === true, target: 'release-rights', help: 'Confirm any necessary permissions for included work.' },
    ...(current?.transcriptText?.trim() ? [{ label: 'Optional transcript accuracy confirmed', passed: current?.transcriptAccessibilityReviewed === true, target: 'release-transcript', help: 'Check your optional transcript against the finished recording, or clear the text to submit without one.' }] : []),
    ...(current?.releaseDistribution && current.releaseDistribution !== 'standard' ? [{ label: 'Creator release-label declaration', passed: current.releaseDistributionConfirmed === true, target: 'release-distribution', help: 'Choose First on Nightjar only if this recording is being released here for the first time.' }] : []),
    ...(current?.scheduledAt ? [{label:'Future publication time',passed:Date.parse(current.scheduledAt) > Date.now() + 60000,target:'release-schedule',help:'Choose a future release time. Review and approval must happen before publication.'}] : []),
  ];
  const incompleteChecks = reviewChecks.filter((check) => !check.passed);
  const complete = incompleteChecks.length === 0;
  const removalPending = current?.status === 'removing';
  const submittedOrPublished = current?.status === 'pending_review' || current?.status === 'scheduled' || current?.status === 'rejected' || current?.status === 'released' || removalPending;
  const scheduleZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/London';
  const scheduleReadable = (release: Release) => release.scheduledAt ? new Intl.DateTimeFormat('en-GB', { dateStyle:'full',timeStyle:'short',timeZone:release.scheduledTimeZone || scheduleZone }).format(new Date(release.scheduledAt)) + ' (' + (release.scheduledTimeZone || scheduleZone) + ')' : 'Immediately after Nightjar approval';
  const formatLocal = (date:Date) => [date.getFullYear(), String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-')+'T'+[String(date.getHours()).padStart(2,'0'),String(date.getMinutes()).padStart(2,'0')].join(':');
  const setSchedule = (input: string) => {
    if (!input) return setRelease({scheduledAt:null,scheduledLocal:null,scheduledTimeZone:null});
    const parsed = new Date(input);
    if (!Number.isFinite(parsed.getTime()) || formatLocal(parsed) !== input) {
      notify('That local date and time does not exist, possibly because clocks are changing. Choose another time.');
      return;
    }
    if ([-90,-60,-30,30,60,90].some((offset) => formatLocal(new Date(parsed.getTime()+offset*60000))===input)) {
      notify('That time occurs twice when the clocks change. Choose a different time so your release is unambiguous.');
      return;
    }
    setRelease({scheduledAt:parsed.toISOString(),scheduledLocal:input,scheduledTimeZone:scheduleZone});
  };

  const openDetails = (target?: string) => {
    setWorkflowStep('prepare');
    if (target) window.requestAnimationFrame(() => {
      const element = document.getElementById(target);
      if (element instanceof HTMLDetailsElement) element.open = true;
      // Fast, deterministic jumps avoid long mobile compositor scrolling.
      element?.scrollIntoView({ behavior: 'auto', block: 'start' });
    });
  };

  const setRelease = (patch: Partial<Release>) => setSelectedRelease((value) => value ? ({ ...value, ...patch }) : value);
  const metadataSignature = current ? creatorMetadataSignature(current) : '';
  const baselineForCurrent = current ? metadataBaseline.current.get(current.id) : null;
  const unsyncedNow = Boolean(current?.status === 'draft' && (
    metadataStatus === 'offline' || metadataStatus === 'conflict' ||
    metadataStatus === 'saving' || metadataStatus === 'unsaved' ||
    (baselineForCurrent && metadataSignature !== baselineForCurrent.signature)
  ));
  useEffect(() => {
    if (!unsyncedNow) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload',warn);
    return () => window.removeEventListener('beforeunload',warn);
  }, [unsyncedNow]);
  useEffect(() => {
    if (!current || current.status !== 'draft' || simulationMode) return;
    const base = metadataBaseline.current.get(current.id);
    if (!base) { acceptSavedVersion(current);setMetadataStatus('saved');return; }
    if (metadataConflict) return;
    if (metadataSignature === base.signature) {
      if (!metadataInFlight.current) setMetadataStatus('saved');
      return;
    }
    setMetadataStatus('unsaved');
    // No extra scheduled infrastructure: only one debounced callable per edit burst.
    const timer = window.setTimeout(() => {
      const latest = latestRelease.current;
      if (latest?.id === current.id) void persistReleaseMetadata(latest);
    }, 1700);
    return () => window.clearTimeout(timer);
  }, [current?.id,current?.status,metadataSignature,simulationMode,metadataConflict]);

  const updateContributor = (index: number, patch: Partial<{ name: string; role: string; userId?: string | null }>) => {
    if (!current) return;
    const contributors = [...(current.contributors ?? [])];
    const existing = contributors[index];
    contributors[index] = {
      name: patch.name ?? existing?.name ?? '',
      role: patch.role ?? existing?.role ?? 'Voice Actor',
      userId: patch.userId !== undefined ? patch.userId : existing?.userId ?? null,
    };
    setRelease({ contributors });
  };

  const addContributor = () => {
    if (!current || (current.contributors?.length ?? 0) >= 24) return;
    setRelease({ contributors: [...(current.contributors ?? []), { name: '', role: 'Voice Actor', userId: null }] });
  };

  const removeContributor = (index: number) => {
    if (!current) return;
    setRelease({ contributors: (current.contributors ?? []).filter((_, itemIndex) => itemIndex !== index) });
  };

  useEffect(() => {
    if (simulationMode || !current?.id || !current.pendingArtworkAssetId || current.pendingArtworkStatus !== 'pending') return;
    let cancelled = false;
    const pendingAssetId = current.pendingArtworkAssetId;
    const releaseId = current.id;

    const checkStatus = async () => {
      try {
        const status = await nightjarMedia.status(pendingAssetId);
        if (cancelled || status.status === 'pending') return;
        if (status.status === 'approved') {
          setSelectedRelease((value) => value?.id === releaseId ? {
            ...value,
            artworkAssetId: pendingAssetId,
            artworkUrl: status.publicUrl,
            artworkStatus: 'approved',
            pendingArtworkAssetId: null,
            pendingArtworkStatus: null,
          } : value);
        } else if (status.status === 'rejected' || status.status === 'removed') {
          setSelectedRelease((value) => value?.id === releaseId ? {
            ...value,
            pendingArtworkAssetId: null,
            pendingArtworkStatus: status.status === 'rejected' ? 'rejected' : null,
          } : value);
        }
        await onRefresh();
      } catch { /* moderation sync is non-blocking */ }
    };

    void checkStatus();
    const timer = window.setInterval(() => void checkStatus(), 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [simulationMode, current?.id, current?.pendingArtworkAssetId, current?.pendingArtworkStatus]);

  const createDraft = async () => {
    if (createInFlight.current) return;
    if (!canPublish || accountStatus === 'pending_review') return notify('Creator release tools unlock after your professional account is approved.');
    if (!draft.title.trim()) return notify('Give the release a title first.');
    createInFlight.current = true;
    setCreatingDraft(true);
    try {
      if (simulationMode) {
        setWorkflowStep('prepare');
        setSelectedRelease({
          id: 'demo-release-draft-' + Date.now(),
          title: draft.title,
          description: draft.description,
          category: draft.category,
          genre: draft.genre,
          mood: draft.mood,
          tags: draft.tags.split(',').map((item) => item.trim()).filter(Boolean),
          tropes: draft.tropes.split(',').map((item) => item.trim()).filter(Boolean),
          contentRating: 'adult',
          contributors: [],
          status: 'draft',
          audioAvailable: false,
        });
        setDraft({ title: '', description: '', category: '', genre: '', mood: '', tags: '', tropes: '' });
        notify('Simulation: release draft created locally.');
        return;
      }
      const data = await nightjarCatalogue.create({
        title: draft.title,
        description: draft.description,
        category: draft.category,
        genre: draft.genre,
        mood: draft.mood,
        tags: draft.tags.split(',').map((item) => item.trim()).filter(Boolean),
        tropes: draft.tropes.split(',').map((item) => item.trim()).filter(Boolean),
        contentRating: 'adult',
        contributors: [],
      });
      const next = data.release as Release | undefined;
      setDraft({ title: '', description: '', category: '', genre: '', mood: '', tags: '', tropes: '' });
      if (next) { setSelectedRelease(next); setWorkflowStep('prepare'); setSubmissionConfirmed(false); }
      await onRefresh();
      notify(data.reused ? 'Recovered the existing private release draft; no duplicate was created.' : 'Release draft created.');
    } catch { notify('Release draft could not be confirmed. Reopen your private drafts and retry the same operation if needed.'); }
    finally { createInFlight.current=false;setCreatingDraft(false); }
  };

  const uploadAsset = async (file: File, kind: 'audio' | 'artwork') => {
    if(kind === 'audio' && current?.audioCleanupPending) return notify('Finish the previous private audio cleanup before starting another transfer.');
    const max = kind === 'audio' ? 25 * 1024 * 1024 : 5 * 1024 * 1024;
    if (file.size > max) return notify(kind === 'audio' ? 'Audio must be 25 MB or smaller.' : 'Artwork must be 5 MB or smaller.');
    const allowedImage = ['image/png', 'image/jpeg', 'image/webp'];
    if (kind === 'audio') {
      const problem = nightjarAudioFileProblem(file, 25);
      if (problem) return notify(problem);
    }
    if (kind === 'artwork' && !allowedImage.includes(file.type)) return notify('Use PNG, JPG or WebP artwork.');
    if (!current?.id) return notify('Create the release draft before uploading its assets.');

    if (kind === 'audio') {
      setAudioBusy(true);
      setAudioProgress(0);
      setAudioFileLabel(file.name + ' · ' + (file.size / (1024 * 1024)).toFixed(2) + ' MB');
      setAudioStage('uploading');
      setAudioFeedback('Preparing private audio transfer. Keep Nightjar open until it is verified.');
    } else setArtBusy(true);
    try {
      if (simulationMode) {
        if (kind === 'audio') {
          const durationMinutes = await readAudioDurationMinutes(file);
          setSelectedRelease({ ...current, audioAvailable: true, ...(durationMinutes ? { durationMinutes } : {}) });
          setAudioStage('saved');
          setAudioProgress(100);
          setAudioFeedback('Simulation only: a fictional audio attachment is shown. No file has reached Firebase.');
          notify('Simulation: audio attached locally; nothing was uploaded.');
        } else {
          setSelectedRelease({ ...current, pendingArtworkAssetId: 'demo-art-' + Date.now(), pendingArtworkStatus: 'pending' });
          notify('Simulation: artwork placed in a local pending-moderation state.');
        }
        return;
      }
      if (kind === 'artwork') {
        const dataUrl = await readDataUrl(file);
        const image = await nightjarMedia.submitImage({
          kind: 'release_artwork',
          targetId: current.id,
          dataUrl,
          contentType: file.type,
          fileName: file.name,
        });
        setSelectedRelease(previous=>previous?.id===current.id ? {...previous,pendingArtworkAssetId:image.assetId,pendingArtworkStatus:'pending'} : previous);
        await onRefresh();
        notify(current.artworkUrl
          ? 'Replacement artwork submitted for administrator approval. Your current approved artwork stays live until the replacement is approved.'
          : 'Artwork submitted for administrator approval. It cannot appear publicly until approved.');
        return;
      }

      const durationMinutes = await readAudioDurationMinutes(file);
      const data = await nightjarCatalogue.uploadAudio(current.id, file, durationMinutes, (stage, percent) => {
        setAudioStage(stage);
        setAudioProgress(percent);
        setAudioFeedback(stage === 'uploading'
          ? 'Uploading encrypted private audio to Firebase Storage. Please keep Nightjar open.'
          : 'Transfer finished. Nightjar is verifying and attaching the file to your saved release.');
      });
      if (data.release?.audioAvailable !== true) throw new Error('Nightjar did not confirm that the audio was attached to your release.');
      applyServerRelease(data.release);
      setAudioStage('saved');
      setAudioProgress(100);
      setAudioRecoveryAvailable(false);
      setAudioTransferInterrupted(false);
      setAudioFeedback('Audio saved and verified in your private release. This is NOT sent for approval yet. Complete the details and press Submit to moderation.');
      await onRefresh().catch(() => { /* confirmed upload must remain visible */ });
      notify('Audio successfully uploaded and verified. Next: submit the completed release for moderation.');
    } catch (error) {
      const detail = error instanceof Error ? error.message : '';
      if (kind === 'audio') {
        setAudioStage('error');
        setAudioTransferInterrupted(nightjarCatalogue.interruptedAudio(current.id));
        setAudioFeedback(detail || 'Audio upload could not be verified. Please retry. No approval submission was created.');
      }
      notify(kind === 'audio'
        ? (detail || 'Audio upload failed. Please try again or contact Nightjar support.')
        : 'Artwork upload failed.');
    }
    finally { if (kind === 'audio') setAudioBusy(false); else setArtBusy(false); }
  };

  const removeArtwork = async () => {
    if (!current?.id) return;
    setArtBusy(true);
    try {
      if (simulationMode) {
        setSelectedRelease({ ...current, artworkAssetId: null, artworkUrl: null, artworkStatus: null, pendingArtworkAssetId: null, pendingArtworkStatus: null });
        notify('Simulation: artwork removed locally.');
        return;
      }
      if (current.pendingArtworkAssetId) await nightjarMedia.removeOwnedImage(current.pendingArtworkAssetId);
      if (current.artworkAssetId) await nightjarMedia.removeOwnedImage(current.artworkAssetId);
      setSelectedRelease({
        ...current,
        artworkAssetId: null,
        artworkUrl: null,
        artworkStatus: null,
        pendingArtworkAssetId: null,
        pendingArtworkStatus: null,
      });
      await onRefresh();
      notify('Release artwork removed.');
    } catch { notify('Release artwork could not be removed.'); }
    finally { setArtBusy(false); }
  };

  const removeAudio = async () => {
    if (!current?.id) return;
    setAudioBusy(true);
    try {
      if (simulationMode) {
        setSelectedRelease({ ...current, audioAvailable: false, audioUrl: null, durationMinutes: 0 });
        notify('Simulation: audio removed locally.');
        return;
      }
      const result=await nightjarCatalogue.removeAudio(current.id);
      if(result.removed !== true) throw new Error('Nightjar could not confirm the audio was detached.');
      setSelectedRelease({ ...current, audioAvailable: false, audioUrl: null, durationMinutes: 0, audioCleanupPending: result.pendingCleanup });
      await onRefresh().catch(() => {});
      setAudioStage(result.pendingCleanup?'error':'idle');
      setAudioProgress(0);
      setAudioFileLabel('');
      setAudioFeedback(result.pendingCleanup
        ? 'Audio is detached from the release but permanent Storage deletion is pending. Use Retry private audio cleanup to finish.'
        : 'Audio removed and private Storage deletion confirmed.');
      notify(result.pendingCleanup
        ? 'Private audio is unavailable, but file cleanup still needs retrying.'
        : 'Private release audio deleted and confirmed.');
    } catch { notify('Release audio could not be removed.'); }
    finally { setAudioBusy(false); }
  };

  const removeRelease = async () => {
    if (!current?.id || removing || audioBusy || submitting) return;
    const item = current;
    const warning = item.status === 'removing'
      ? 'Retry deletion of the already-retired recording and artwork? NightJar will only finish the pending private media cleanup.'
      : item.status === 'released'
      ? 'Remove this published recording from Nightjar? Listening will stop, and its audio and artwork will be deleted. This cannot be undone.'
      : item.status === 'pending_review'
        ? 'Withdraw and permanently remove this submission from Nightjar review? The uploaded recording will be deleted. This cannot be undone.'
        : 'Remove this draft and delete its uploaded audio and artwork? This cannot be undone.';
    if (!window.confirm(warning)) return;
    setRemoving(true);
    try {
      if (simulationMode) {
        onSimulationChange?.(null, item.id);
      } else {
        const result = await nightjarCatalogue.remove(item.id);
        if (result.deleted !== true) throw new Error('Nightjar could not verify the removal.');
        await onRefresh().catch(() => {});
      }
      setSelectedRelease(null);
      try { window.sessionStorage.removeItem(lastOpenedKey); } catch {}
      setSubmissionConfirmed(false);
      setAudioFileLabel('');
      setAudioFeedback('');
      onDeleted?.(item.id);
      notify('Recording removed from Nightjar. Its playable audio is no longer available.');
    } catch (error) {
      await onRefresh().catch(() => {});
      notify(error instanceof Error ? error.message : 'Removal could not be completed. Please retry.');
    } finally { setRemoving(false); }
  };

  const saveMetadata = async () => {
    if (!current?.id) return;
    if (simulationMode) return notify('Simulation: release metadata saved locally.');
    const saved = await persistReleaseMetadata(current,true);
    if (!saved) return notify('Release details are not confirmed saved. Check the save status before leaving.');
    await onRefresh().catch(() => {});
    notify('Release details saved to your account.');
  };

  const submit = async () => {
    if (!current?.id) return;
    if (!complete) return notify('Complete required release details and rights declarations. If you supplied a transcript or special label, confirm its accuracy.');
    if (!canPublish || accountStatus === 'pending_review') return notify('Creator publishing stays locked until your account is approved.');
    setSubmitting(true);
    try {
      if (simulationMode) {
        setSelectedRelease({ ...current, status: 'pending_review' });
        setWorkflowStep('review');
        setSubmissionConfirmed(true);
        onSubmitted?.();
        notify('Simulation: release moved to pending moderation locally.');
        return;
      }
      // Persist unsaved title, optional transcript, label and rights edits BEFORE the
      // server reviews the submission. Previously the UI could show complete
      // data while submit() still saw stale draft fields on Firestore.
      const saved = await persistReleaseMetadata(latestRelease.current?.id === current.id ? latestRelease.current : current,true);
      if (!saved) throw new Error('Release details are not saved. Resolve the sync status before submitting.');
      const submitted = await nightjarCatalogue.submit(current.id);
      if (submitted.release?.status !== 'pending_review') throw new Error('Nightjar did not confirm this submission reached moderation.');
      setSelectedRelease(submitted.release);
      acceptSavedVersion(submitted.release);
      setMetadataStatus('saved');
      try { window.sessionStorage.setItem(lastOpenedKey, current.id); } catch {}
      setWorkflowStep('review');
      setSubmissionConfirmed(true);
      await onRefresh().catch(() => { /* retain the verified submission status */ });
      onSubmitted?.();
      window.requestAnimationFrame(() => document.getElementById('creator-pipeline')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
      notify('Submission confirmed! Your recording is now awaiting Nightjar review.');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Release could not be submitted for moderation.');
    } finally { setSubmitting(false); }
  };

  return <article className="creator-pipeline-card panel-card">
    <div className="creator-pipeline-header">
      <div>
        <span className="mini-label">CREATOR → CATALOGUE</span>
        <h2>Upload a recording</h2>
        <p>Upload privately, complete the essentials, then submit your release for Nightjar review.</p>
      </div>
      <span className="status-pill"><Mic2 size={12} /> {statusLabel}</span>
    </div>

    <div className="creator-pipeline-grid">
      <aside className="pipeline-library">
        <div className="pipeline-list">{releases.map((release) => <button key={release.id} className={current?.id === release.id ? 'pipeline-release active' : 'pipeline-release'} onClick={() => void chooseRelease(release)}><strong>{release.title || 'Untitled release'}</strong><span>{release.status === 'removing' ? 'Removal pending · Retry' : release.status === 'rejected' ? 'Rejected · Review feedback' : release.status === 'scheduled' ? 'Approved · Scheduled' : release.status === 'pending_review' ? 'Submitted · Awaiting review' : release.status === 'released' ? 'Published' : release.status === 'draft' ? release.audioAvailable ? 'Continue to Review' : 'Draft' : release.status || 'Draft'}</span></button>)}</div>
        {!releases.length && <div className="people-empty"><Music2 size={18} /><strong>No recordings yet.</strong><span>Enter a title below to start uploading.</span></div>}
        <div className="pipeline-create">
          <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} aria-label="Title for a new recording" placeholder="Recording title" />
          <button className="primary-button" disabled={creatingDraft || !canPublish || accountStatus === 'pending_review'} onClick={() => void createDraft()}><UploadCloud size={14} /> {creatingDraft ? 'Creating private draft…' : accountStatus === 'pending_review' ? 'Approval required' : 'Create & upload'}</button>
        </div>
      </aside>

      <div className="pipeline-editor">
        {current ? <>
          <div className="pipeline-status"><div><span>{statusLabel}</span><strong>{statusHint}</strong></div><Check size={18} /></div>
          {submittedOrPublished && <section className="nj-submission-confirmation" role="status" aria-live="polite">
            <Check size={28} aria-hidden="true"/>
            <div><span className="mini-label">{removalPending ? 'NIGHTJAR · REMOVAL PENDING' : current.status === 'rejected' ? 'NIGHTJAR · MODERATION DECISION' : current.status === 'scheduled' ? 'NIGHTJAR · APPROVED & SCHEDULED' : current.status === 'released' ? 'NIGHTJAR · PUBLISHED' : 'NIGHTJAR · SUBMISSION CONFIRMED'}</span>
              <h3>{removalPending ? 'Your recording is hidden.' : current.status === 'rejected' ? 'This recording was not approved.' : current.status === 'scheduled' ? 'Approved! Your release is scheduled.' : current.status === 'released' ? 'Your recording is live.' : 'Your recording has been submitted!'}</h3>
              <p><strong>{current.title}</strong> {removalPending ? 'is no longer publicly accessible. Storage cleanup is still pending; select Retry removal cleanup to finish.' : current.status === 'rejected' ? 'was not approved. Review the reason below and reply to the Nightjar moderation conversation if you have questions.' : current.status === 'scheduled' ? 'has passed Nightjar review and is safely waiting for its scheduled publication.' : current.status === 'released' ? 'has been approved and published.' : 'is safely in Nightjar’s moderation queue. You do not need to upload or submit it again.'}</p>
              <small>{submissionConfirmed ? 'Submission confirmed just now · ' : ''}Status: {removalPending ? 'Removal pending' : current.status === 'rejected' ? 'Rejected' : current.status === 'scheduled' ? 'Scheduled · '+scheduleReadable(current) : current.status === 'released' ? 'Published' : 'Awaiting review'}</small>
            </div>
            {current.scheduledAt && current.status !== 'released' && <small className="nj-creator-scheduled-confirmation">{current.status === 'scheduled' ? 'Approved publication date' : 'Requested publication date'}: {scheduleReadable(current)}</small>}
            {current.status === 'rejected' && current.moderationNote && <p className="nj-creator-moderation-feedback">Reason: {current.moderationNote}</p>}
            <button className="secondary-button" type="button" onClick={() => void onRefresh()}>Refresh status</button>
          </section>}
          {!submittedOrPublished && <div className="nj-creator-workflow-switch" role="group" aria-label="Release workflow">
            <button type="button" className={workflowStep === 'prepare' ? 'is-active' : ''} onClick={() => openDetails()} aria-current={workflowStep === 'prepare' ? 'step' : undefined}>1 · Upload & details</button>
            <button type="button" className={workflowStep === 'review' ? 'is-active' : ''} onClick={() => setWorkflowStep('review')} aria-current={workflowStep === 'review' ? 'step' : undefined}>2 · Review & submit</button>
          </div>}
          {!submittedOrPublished && <section className="nj-release-journey" aria-label="Audio publishing steps">
            <h3>From your recording to Nightjar</h3>
            <div className="nj-release-journey-steps">
              <div className="done"><Check size={14}/> 1. Draft created</div>
              <div className={current.audioAvailable ? 'done' : 'next'}>{current.audioAvailable ? <Check size={14}/> : <Music2 size={14}/>} 2. Audio uploaded and verified</div>
              <div className={complete ? 'done' : current.audioAvailable ? 'next' : ''}>{complete ? <Check size={14}/> : <BookOpenText size={14}/>} 3. Release details and rights</div>
              <div className={current.status === 'pending_review' || current.status === 'released' ? 'done' : complete ? 'next' : ''}>{current.status === 'pending_review' || current.status === 'released' ? <Check size={14}/> : <Send size={14}/>} 4. Submit for review</div>
            </div>
            <p role="status">{current.status === 'pending_review' ? 'Your release has reached the administrator moderation queue. No public listening is possible until it is approved.' : current.status === 'released' ? 'Nightjar approved and published this release.' : current.audioAvailable ? 'Your audio is stored privately, but has NOT been submitted. Complete the release information, then select Submit to moderation.' : 'Choose a supported audio file below. Selecting a file starts an upload; it does not publish or submit your release.'}</p>
          </section>}
          {workflowStep === 'prepare' && !submittedOrPublished && <>
          <div className="pipeline-assets" id="release-audio">
            <div className="asset-drop asset-drop-moderated nj-audio-attachment"><Music2 size={19} /><strong>{audioBusy ? audioStage === 'verifying' ? 'Verifying saved audio…' : 'Uploading your audio…' : current.audioAvailable ? 'Audio connected to this draft' : 'Attach private audio'}</strong><span>MP3 / WAV / M4A / OGG / WebM · max 25 MB · private until approved</span>
              <label className="secondary-button upload-label">{audioBusy ? 'Upload in progress' : current.audioCleanupPending ? 'Finish private audio cleanup first' : current.audioAvailable ? 'Replace this audio' : 'Choose audio to upload'}<input type="file" hidden disabled={audioBusy || current.audioCleanupPending === true || current.status === 'pending_review' || current.status === 'released' || submitting} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadAsset(file, 'audio'); event.currentTarget.value = ''; }} /></label>
              {audioFileLabel && <strong className="nj-audio-file-label">{audioFileLabel}</strong>}
              {current.audioCleanupPending && !current.audioAvailable && <div role="status" className="nj-audio-feedback"><strong>Private audio cleanup pending</strong><p>NightJar has detached the recording and stopped serving it through normal playback. Storage deletion has not been confirmed; previously issued temporary links may remain usable until expiry.</p><button type="button" className="secondary-button" disabled={audioBusy} onClick={()=>void removeAudio()}>{audioBusy?'Checking cleanup…':'Retry private audio cleanup'}</button></div>}
              {audioTransferInterrupted && !audioRecoveryAvailable && !current.audioAvailable && !audioBusy && <div role="status" className="nj-audio-feedback"><strong>Transfer interrupted before completion</strong><p>The browser cannot recover partial audio bytes after a restart. Select your original recording again using Choose audio to upload. No file has been submitted for moderation; your draft remains saved.</p></div>}
              {audioRecoveryAvailable && !current.audioAvailable && <div role="status" className="nj-audio-feedback"><strong>Recover transferred audio</strong><p>Nightjar retained a private upload that was not yet confirmed as attached. You can check it without selecting or transferring the file again.</p><button type="button" className="secondary-button" disabled={audioBusy} onClick={()=>void recoverAudioUpload()}>{audioBusy ? 'Checking private upload…' : 'Recover uploaded recording'}</button></div>}
              {audioBusy && <div className="nj-audio-upload-progress" role="progressbar" aria-label="Audio upload progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={audioProgress}><span style={{width:audioProgress + '%'}}/></div>}
              {audioBusy && <small className="nj-audio-percent">{audioStage === 'verifying' ? 'Transfer 100% · awaiting server verification' : audioProgress + '% transferred'}</small>}
              {(audioFeedback || current.audioAvailable) && <div className={audioStage === 'error' ? 'nj-audio-feedback error' : audioStage === 'saved' || current.audioAvailable ? 'nj-audio-feedback success' : 'nj-audio-feedback'} role="status">{audioFeedback || 'Private audio confirmed. This release is not publicly available until moderation approval.'}</div>}
              {current.audioAvailable && <button className="ghost-button" disabled={audioBusy || submitting || current.status === 'pending_review' || current.status === 'released'} onClick={()=>void removeAudio()}>Remove audio</button>}
            </div>
            <div className="asset-drop asset-drop-moderated"><ImagePlus size={18} /><strong>{artBusy ? 'Working…' : current.pendingArtworkStatus === 'pending' ? current.artworkUrl ? 'Replacement awaiting approval' : 'Artwork awaiting approval' : current.artworkUrl ? 'Replace approved artwork' : 'Attach artwork'}</strong><span>PNG / JPG / WebP · max 5 MB · administrator approval required</span><small className="nj-cover-upload-help">Square cover recommended. Listeners see the entire approved artwork with no category label across it. Use Image Studio to check text and faces before upload.</small><label className="secondary-button upload-label">{current.artworkUrl || current.pendingArtworkAssetId ? 'Replace' : 'Choose image'}<input type="file" accept="image/png,image/jpeg,image/webp" hidden disabled={artBusy} onChange={(event) => { const file = event.target.files?.[0]; if (file) setArtFrameFile(file); event.currentTarget.value = ''; }} /></label>{(current.artworkUrl || current.artworkAssetId || current.pendingArtworkAssetId) && <button className="ghost-button" disabled={artBusy} onClick={()=>void removeArtwork()}>Remove artwork</button>}</div>
          </div>


          <div className="nj-continue-review" role="status">
            <div><strong>{current.audioAvailable ? 'Recording uploaded successfully' : 'Start by uploading your recording'}</strong><small>{current.audioAvailable ? 'Saved privately — not submitted for review yet.' : 'You can complete the details before or after uploading.'}</small></div>
            <button type="button" className="primary-button" disabled={!current.audioAvailable || audioBusy || submitting} onClick={() => setWorkflowStep('review')}><Send size={16}/> Continue to Review →</button>
          </div>
          <section className="nj-release-schedule-panel" id="release-schedule" aria-label="Schedule publication">
            <div><strong>When should listeners hear this?</strong><small>Nightjar reviews your submission as soon as you send it, regardless of the chosen release date.</small></div>
            <label><input type="radio" name="nightjar-publish-mode" checked={!current.scheduledAt} onChange={() => setSchedule('')} /> Publish as soon as Nightjar approves</label>
            <label><input type="radio" name="nightjar-publish-mode" checked={Boolean(current.scheduledAt)} onChange={() => {
              const next = new Date(); next.setDate(next.getDate() + 4); next.setSeconds(0,0);
              setSchedule(formatLocal(next));
            }} /> Release on my chosen date</label>
            {current.scheduledAt && <div className="nj-scheduled-input">
              <label htmlFor="nj-release-date-time">Publication date and local time</label>
              <input id="nj-release-date-time" type="datetime-local" step={60} value={current.scheduledLocal ?? ''} onChange={(event) => setSchedule(event.target.value)} />
              <small>Your device time zone: {scheduleZone}. Nightjar saves the exact moment, accounting for daylight-saving changes.</small>
              <strong>Scheduled for {scheduleReadable(current)}</strong>
              <small>Submitting early does not publish early. Administrator approval is required first.</small>
            </div>}
          </section>
          <div className="nj-workflow-section-heading" id="release-details"><strong>Release details</strong><small>Title, category and description are required. Other fields help discovery.</small></div>
          <div className="pipeline-form-grid">
            <label>Title<input value={current.title ?? ''} onChange={(event) => setRelease({ title: event.target.value })} /></label>
            <label>Category<input value={current.category ?? ''} onChange={(event) => setRelease({ category: event.target.value })} placeholder="Story, performance, soundscape…" /></label>
            <label>Genre<input value={current.genre ?? ''} onChange={(event) => setRelease({ genre: event.target.value })} /></label>
            <label>Mood<input value={current.mood ?? ''} onChange={(event) => setRelease({ mood: event.target.value })} /></label>
            <label className="pipeline-span-two">Description<textarea value={current.description ?? ''} onChange={(event) => setRelease({ description: event.target.value })} placeholder="What should a listener know before pressing play?" /></label>
            <div className="pipeline-taxonomy-field">
              <SearchableMultiSelect
                label="Release tags"
                options={combinedTagOptions}
                values={current.tags ?? []}
                onChange={(tags) => setRelease({ tags })}
                maxItems={24}
                allowCreate
                createLabel="Add custom release tag"
                helperText="Search Nightjar’s shared tags or add a missing niche / explicit descriptor. Distinct approved Creator usage can promote recurring custom tags into the shared catalogue."
              />
            </div>
            <div className="pipeline-taxonomy-field">
              <SearchableMultiSelect
                label="Release tropes"
                options={PROFILE_TROPE_OPTIONS}
                values={current.tropes ?? []}
                onChange={(tropes) => setRelease({ tropes })}
                maxItems={24}
              />
            </div>
            <label>Content level<select value={current.contentRating ?? 'adult'} onChange={(event) => setRelease({ contentRating: event.target.value as Release['contentRating'] })}><option value="sfw">SFW</option><option value="suggestive">Suggestive</option><option value="adult">Adult</option><option value="explicit">Explicit</option></select></label>
            <label>Series title<input value={current.seriesTitle ?? ''} onChange={(event) => setRelease({ seriesTitle: event.target.value || null })} placeholder="Optional series"/></label>
            <label>Episode number<input type="number" min="0" step="1" value={current.episodeNumber ?? ''} onChange={(event) => setRelease({ episodeNumber: event.target.value === '' ? null : Number(event.target.value) })} placeholder="Optional"/></label>
            <label className="pipeline-span-two">Production / behind-the-scenes note<textarea value={current.productionNote ?? ''} onChange={(event) => setRelease({ productionNote: event.target.value || null })} placeholder="Optional context about the people or process behind this release."/></label>
          </div>

          <section className="release-rights-attestation" id="release-rights">
            <div className="release-transcript-head">
              <div>
                <span className="mini-label">RIGHTS & PERMISSIONS · REQUIRED TO PUBLISH</span>
                <strong>Confirm you are allowed to put this release on Nightjar.</strong>
                <p>These declarations are separate from credits. A credit names contributors; it does not by itself prove permission to publish their work or performance.</p>
              </div>
              <span className={current.rightsConfirmed && current.contributorPermissionsConfirmed ? 'status-pill' : 'status-pill muted'}>
                {current.rightsConfirmed && current.contributorPermissionsConfirmed ? 'CONFIRMED' : 'REQUIRED'}
              </span>
            </div>
            <label className="rights-check">
              <input type="checkbox" checked={current.rightsConfirmed === true} onChange={(event)=>setRelease({ rightsConfirmed:event.target.checked })}/>
              <span>I own or control the rights needed to upload, host and publish this release on Nightjar.</span>
            </label>
            <label className="rights-check">
              <input type="checkbox" checked={current.contributorPermissionsConfirmed === true} onChange={(event)=>setRelease({ contributorPermissionsConfirmed:event.target.checked })}/>
              <span>I have any required permission from performers, Writers, Artists, composers, Audio Editors or other contributors whose protected work appears in this release.</span>
            </label>
          </section>

          <section className="nj-release-distribution-panel" id="release-distribution" aria-label="Release debut and distribution">
            <div className="release-transcript-head"><div><span className="mini-label">RELEASE IDENTITY · CREATOR DECLARED</span><strong className="nj-term-label">Where does this recording debut? <ContextHelp topic="first-on-nightjar"/></strong><p>Choose how to label this recording’s first release.</p></div></div>
            <div className="nj-release-distribution-options" role="radiogroup" aria-label="Release distribution label">
              {([
                {value:'standard',label:'Standard release',help:'Available elsewhere already, or no special release label.'},
                {value:'nightjar_first',label:'First on NightJar',help:'This is its first public release. You may distribute it elsewhere later.'},
              ] as const).map((option)=><label key={option.value} className={(current.releaseDistribution || 'standard') === option.value ? 'nj-release-distribution-option selected':'nj-release-distribution-option'}>
                <input type="radio" name="nightjar-release-distribution" checked={(current.releaseDistribution || 'standard') === option.value} onChange={()=>setRelease({releaseDistribution:option.value,releaseDistributionConfirmed:option.value === 'nightjar_first'})}/>
                <span><strong>{option.label}</strong><small>{option.help}</small></span>
              </label>)}
            </div>
          </section>

          <details className="release-transcript-editor nj-optional-transcript" id="release-transcript">
            <summary className="release-transcript-head" aria-label="Optional release transcript, expand or collapse">
              <div>
                <span className="mini-label">ACCESSIBILITY · OPTIONAL TRANSCRIPT</span>
                <strong><BookOpenText size={16}/> Transcript (optional) · tap to expand</strong>
                <p>
                  Audio can be submitted and approved without a transcript. Expand to add a readable version, or confirm the accuracy of text you have already supplied.
                </p>
              </div>
              <span className={current.transcriptText?.trim() && current.transcriptAccessibilityReviewed ? 'status-pill' : 'status-pill muted'}>
                {current.transcriptText?.trim() ? current.transcriptAccessibilityReviewed ? 'READY' : 'REVIEW TEXT' : 'OPTIONAL'}
              </span>
            </summary>

            <div className="release-transcript-meta">
              <label>
                Transcript language
                <input
                  value={current.transcriptLanguage ?? 'en'}
                  maxLength={35}
                  onChange={(event) => setRelease({ transcriptLanguage: event.target.value })}
                  placeholder="en"
                />
                <small>Use a language tag such as en, en-GB, es or fr.</small>
              </label>
              <div className="release-transcript-format-help">
                <strong>Optional timed format</strong>
                <code>[00:18] Speaker: dialogue</code>
                <code>[01:42] [door closes]</code>
                <small>Use [mm:ss] or [hh:mm:ss] at the start of a line. Untimed transcripts are fully supported too.</small>
              </div>
            </div>

            <div className="nj-transcript-file-import">
              <label htmlFor="nj-release-transcript-file"><strong>Import an existing script or caption file</strong> (optional)</label>
              <input id="nj-release-transcript-file" type="file" accept=".txt,.md,.srt,.vtt,text/plain,text/vtt" onChange={async (event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = '';
                if (!file) return;
                if (String(current.transcriptText ?? '').trim() && !window.confirm('Replace your existing draft transcript with this file? The current text will be replaced.')) return;
                try {
                  const text = await readCreatorTranscriptFile(file);
                  setRelease({transcriptText:text,transcriptAccessibilityReviewed:false});
                  notify('Script imported into your private draft. Review it against the finished recording before approving.');
                } catch (error) {
                  notify(error instanceof Error ? error.message : 'This transcript file could not be read.');
                }
              }}/>
              <small>Accepted: plain text, Markdown, SRT or WebVTT. The selected file is read on your device; only the draft text is saved to NightJar. Import material you own or are licensed to use. No speech recognition or external transcription provider.</small>
            </div>

            <label className="release-transcript-text">
              Transcript (optional)
              <textarea
                rows={14}
                maxLength={120000}
                value={current.transcriptText ?? ''}
                onChange={(event) => setRelease({
                  transcriptText: event.target.value,
                  transcriptAccessibilityReviewed: false,
                })}
                placeholder={"[00:00] Speaker: Opening line\n[00:08] [soft music]\n\nOr simply provide clean paragraphs without timestamps."}
              />
              <small>
                {String(current.transcriptText ?? '').trim()
                  ? String(current.transcriptText ?? '').trim().split(/\s+/).filter(Boolean).length.toLocaleString('en-GB') + ' words'
                  : 'No transcript added yet'}
                {' · '}{String(current.transcriptText ?? '').length.toLocaleString('en-GB')}/120,000 characters
              </small>
            </label>

            {current.audioAvailable === true && ['draft', 'rejected'].includes(String(current.status ?? '').toLowerCase())
              ? <TranscriptSyncTool
                  key={'private-transcript-sync-'+current.id}
                  releaseId={current.id}
                  audioAvailable={current.audioAvailable === true}
                  transcriptText={current.transcriptText}
                  language={current.transcriptLanguage}
                  simulationMode={simulationMode}
                  onSaved={async saved => {
                    setSelectedRelease(prior => prior?.id === current.id ? {
                      ...prior,
                      transcriptText: saved.transcriptText,
                      transcriptLanguage: saved.transcriptLanguage,
                      transcriptAccessibilityReviewed: saved.transcriptAccessibilityReviewed,
                      transcriptAvailable: saved.transcriptAvailable,
                      transcriptWordCount: saved.transcriptWordCount,
                    } : prior);
                    await onRefresh().catch(() => {});
                    notify('Timed transcript saved to your release.');
                  }}
                />
              : <ManualTranscriptSync key={'transcript-sync-'+current.id}
                  initialText={current.transcriptText??''}
                  label="Sync transcript manually to local audio"
                  onApply={text=>setRelease({transcriptText:text,transcriptAccessibilityReviewed:false})}/>}


            <label className="release-transcript-confirm">
              <input
                type="checkbox"
                checked={current.transcriptAccessibilityReviewed === true}
                disabled={!current.transcriptText?.trim()}
                onChange={(event) => setRelease({ transcriptAccessibilityReviewed: event.target.checked })}
              />
              <span>
                <strong>I have checked this against the finished audio.</strong>
                <small>Only needed when a transcript is included. Check dialogue, sound cues and changes from the original script.</small>
              </span>
            </label>
          </details>

          <section className="release-credits-editor">
            <div className="release-credits-head"><div><span className="mini-label">PRODUCTION CREDITS</span><strong>Credit everyone involved.</strong><p>Voice Actors, Writers, Audio Editors and other collaborators stay attached to the release. Linking a Nightjar professional account also grants that credited person access to this release without needing a separate Listener subscription.</p></div><button className="secondary-button" type="button" onClick={addContributor}>Add credit</button></div>
            <div className="release-credit-list">
              {(current.contributors ?? []).map((contributor, index) => <div className="release-credit-row" key={index}>
                <select value={contributor.role} onChange={(event) => updateContributor(index, { role: event.target.value })}>
                  <option>Voice Actor</option><option>Writer</option><option>Audio Editor</option><option>Producer</option><option>Director</option><option>Sound Designer</option><option>Cover Artist</option><option>Composer</option><option>Other</option>
                </select>
                <select value={contributor.userId ?? ''} onChange={(event) => {
                  const person = creditDirectory.find((item) => item.userId === event.target.value);
                  if (person) updateContributor(index, { userId: person.userId, name: person.name, role: person.role === 'writer' ? 'Writer' : person.role === 'editor' ? 'Audio Editor' : contributor.role });
                  else updateContributor(index, { userId: null });
                }}>
                  <option value="">Unlinked / external credit · no account access</option>
                  {creditDirectory.map((person) => <option key={person.userId} value={person.userId}>{person.name} · {person.role === 'editor' ? 'Audio Editor' : person.role === 'writer' ? 'Writer' : 'Creator'}</option>)}
                </select>
                <input value={contributor.name} onChange={(event) => updateContributor(index, { name: event.target.value })} placeholder="Credited name"/>
                <button className="ghost-button" type="button" onClick={() => removeContributor(index)}>Remove</button>
              </div>)}
              {!(current.contributors ?? []).length && <div className="people-empty"><strong>No additional credits yet.</strong><span>The primary Creator remains credited automatically. Add every other contributor here.</span></div>}
            </div>
          </section>

          </>}
          {workflowStep === 'review' && !submittedOrPublished && <section className="nj-release-review" aria-label="Review release before moderation">
            <div className="nj-review-heading"><span className="mini-label">REVIEW YOUR SUBMISSION</span><h3>{submittedOrPublished ? current.status === 'released' ? 'This release is published' : 'Your release is awaiting review' : 'Ready to send to Nightjar?'}</h3>
              <p>{submittedOrPublished ? 'Your recording is already in the Nightjar review and publishing workflow. You do not need to submit it again.' : 'Check the essentials below. Only clicking Submit for Review sends your private recording to our moderators.'}</p></div>
            <div className="nj-review-schedule-summary"><strong>Publication plan</strong><span>{scheduleReadable(current)}</span><small>Nightjar receives this recording for moderation immediately. If approved, it will not go public before the scheduled time.</small></div>
            <div className="nj-review-checklist">{reviewChecks.map((check) => <div className={check.passed ? 'nj-review-check passed' : 'nj-review-check missing'} key={check.label}>
              <span aria-hidden="true">{check.passed ? '✓' : '!'}</span><div><strong>{check.label}</strong>{!check.passed && <small>{check.help}</small>}</div>
              {!check.passed && !submittedOrPublished && <button type="button" className="secondary-button" onClick={() => openDetails(check.target)}>Fix</button>}
            </div>)}</div>
            {!submittedOrPublished && <div className="nj-review-submit">
              {incompleteChecks.length > 0 && <p role="status"><strong>{incompleteChecks.length} item{incompleteChecks.length === 1 ? '' : 's'} to finish.</strong> Nothing has been submitted. Select Fix beside a missing item.</p>}
              {incompleteChecks.length === 0 && <p role="status">Everything required is ready. Submission does not publish your recording; an administrator must approve it first.</p>}
              <button type="button" className="secondary-button" onClick={() => openDetails()}>← Edit release</button>
              <button type="button" className="primary-button" disabled={!complete || audioBusy || submitting || !canPublish || accountStatus === 'pending_review'} onClick={() => void submit()}><Send size={16}/> {submitting ? 'Sending to moderators…' : 'Submit for Review'}</button>
            </div>}
          </section>}
          {current.status === 'draft' && !simulationMode && <div className="nj-cloud-profile-draft" role="status" aria-live="polite">
            <span>{metadataStatus === 'saved' ? 'Release details saved to your account · available on other devices'
              : metadataStatus === 'saving' ? 'Saving release details to Nightjar…'
              : metadataStatus === 'unsaved' ? 'Release details changed · awaiting cloud save'
              : metadataStatus === 'conflict' ? 'This release was edited on another device. Choose which version to keep.'
              : 'Release details NOT confirmed saved. Reconnect and retry before leaving.'}</span>
            {metadataStatus === 'conflict' && <div className="nj-cloud-draft-choices">
              <button type="button" className="secondary-button" onClick={chooseLatestRelease}>Load latest account version</button>
              <button type="button" className="ghost-button" onClick={keepCurrentRelease}>Keep my edits and retry</button>
            </div>}
            {metadataStatus === 'offline' && <button type="button" className="ghost-button" onClick={()=>void persistReleaseMetadata(current)}>
              Retry saving details
            </button>}
            <small>Only release text, credits and scheduling autosave. Media transfers and rights/accuracy confirmations are separate; confirm those when submitting.</small>
          </div>}
          {current.artworkStatus==='approved' && current.artworkUrl && current.artworkAssetId &&
            <div className="nj-approved-release-frame panel">
              <FramedApprovedImage src={current.artworkUrl} alt="Approved release artwork"
                className="nj-approved-work-thumb" defaultMode="fit"
                framing={current.artworkFraming?.assetId===current.artworkAssetId?current.artworkFraming:null}/>
              <button type="button" className="secondary-button" disabled={artBusy||submitting}
                onClick={()=>setApprovedFrameRelease({id:current.id,assetId:String(current.artworkAssetId),
                  src:String(current.artworkUrl),framing:current.artworkFraming?.assetId===current.artworkAssetId?(current.artworkFraming ?? null):null})}>
                Adjust approved release artwork
              </button>
              <small>Save the framing without changing your recording or asking for another artwork review.</small>
            </div>}
          <div className="nj-work-removal">
            <div><strong>Remove this recording</strong><small>You control your work. Remove drafts, submissions or published recordings whenever you choose. Removal cannot be undone.</small></div>
            <button className="ghost-button nj-work-remove-button" type="button" disabled={removing || submitting || audioBusy} onClick={() => void removeRelease()}>{removing ? 'Removing recording…' : removalPending ? 'Retry removal cleanup' : 'Remove recording'}</button>
          </div>
          {workflowStep === 'prepare' && !submittedOrPublished && <div className="pipeline-footer"><span>Release details autosave privately. Rights and transcript accuracy confirmations are saved on explicit Save or Submit.</span><div><button className="ghost-button" type="button" onClick={() => void removeRelease()} disabled={removing}>{removing ? 'Removing…' : 'Remove draft'}</button><button className="secondary-button" type="button" onClick={() => void saveMetadata()}>Save changes</button><button className="primary-button" type="button" disabled={!current.audioAvailable || audioBusy || submitting} onClick={() => setWorkflowStep('review')}><Send size={14}/> Continue to Review →</button></div></div>}
        </> : <div className="people-empty"><Mic2 size={19} /><strong>Choose a recording.</strong><span>Select a saved recording above, or create one with a title.</span></div>}
      </div>
    </div>
    {approvedFrameRelease && <ImageFramingEditor
      approvedSrc={approvedFrameRelease.src} shape="release"
      initialFraming={approvedFrameRelease.framing}
      onCancel={()=>setApprovedFrameRelease(null)}
      onSaveFraming={async framing=>{
        const selection=approvedFrameRelease;
        const result=await nightjarWorkFraming.save('release_artwork',selection.id,{assetId:selection.assetId,...framing});
        setSelectedRelease(previous=>previous?.id===selection.id && previous.artworkAssetId===selection.assetId
          ? {...previous,artworkFraming:result.framing} : previous);
        setApprovedFrameRelease(null);
        notify('Release artwork framing saved without a new upload or moderation review.');
      }}
    />}
    {artFrameFile && <ImageFramingEditor file={artFrameFile} shape="release"
      onCancel={()=>setArtFrameFile(null)}
      onApply={async framed=>{
        await uploadAsset(framed,'artwork');
        setArtFrameFile(null);
      }}
    />}
  </article>;
}
