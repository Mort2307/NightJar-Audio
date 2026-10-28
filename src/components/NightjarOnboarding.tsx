import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Check, UserCircle2, X } from 'lucide-react';
import { nightjarCommunity } from '../platform/firebase-community';
import { isProfileSetupComplete, recoverPendingProfileDiscoverability } from '../platform/profile-setup-state';
import { nightjarHandleError, normaliseNightjarHandle, suggestNightjarHandle } from '../platform/profile-handle';
import SearchableMultiSelect from './SearchableMultiSelect';
import {
  PROFILE_CATEGORY_OPTIONS,
  PROFILE_TAG_OPTIONS,
  PROFILE_TROPE_OPTIONS,
} from '../data/nightjarTaxonomy';

type Props = {
  initialProfile?: any;
  role: 'listener' | 'creator' | 'writer' | 'admin' | 'editor' | 'artist' | null;
  onComplete: (profile: any) => void;
  onSkip: (draft: any, stepIndex: number, revision: number) => Promise<void>;
  notify: (message: string) => void;
};

type Step = 'identity' | 'presence' | 'personalisation';

const steps: { id: Step; label: string; title: string; description: string }[] = [
  {
    id: 'identity',
    label: 'YOUR NIGHTJAR',
    title: 'Start with your name.',
    description: 'Choose how people see you on Nightjar. Your listener profile and your professional work each have their own place.',
  },
  {
    id: 'presence',
    label: 'YOUR PRESENCE',
    title: 'Tell us a little about yourself.',
    description: 'Add a headline, a short introduction and an optional welcome note. You can fill in professional details in your Studio.',
  },
  {
    id: 'personalisation',
    label: 'YOUR WORLD',
    title: 'What do you like to listen to?',
    description: 'Choose themes, moods and categories that genuinely interest you. These are discovery preferences, not assumptions about identity.',
  },
];

export default function NightjarOnboarding({ initialProfile, role, onComplete, onSkip, notify }: Props) {
  // Never let a stale, sometimes empty onboarding draft replace an already
  // completed personal profile. Incomplete accounts can still resume drafts.
  const savedDraft = !isProfileSetupComplete(initialProfile) &&
    initialProfile?.onboardingDraft && typeof initialProfile.onboardingDraft === 'object'
    ? initialProfile.onboardingDraft : null;
  const profileText = (field: string): string => {
    const published = initialProfile?.[field];
    const draft = savedDraft?.[field];
    return typeof published === 'string' && published.trim()
      ? published : typeof draft === 'string' ? draft : typeof published === 'string' ? published : '';
  };
  const profileSelections = (field: string): string[] => {
    const published = initialProfile?.[field];
    const draft = savedDraft?.[field];
    return Array.isArray(published) && published.length
      ? published : Array.isArray(draft) ? draft : Array.isArray(published) ? published : [];
  };
  const [stepIndex, setStepIndex] = useState(() => Number.isInteger(savedDraft?.stepIndex) ? Math.max(0, Math.min(2, savedDraft.stepIndex)) : 0);
  const cloudRevision = useRef<number>(Math.max(0,Number(initialProfile?.onboardingDraftRevision??0)));
  const pendingSave = useRef<Promise<void>>(Promise.resolve());
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedOnce = useRef(false);
  const draftVersion = useRef(0);
  const savingFinished = useRef(false);
  const cloudConflict = useRef(false);
  const [draftStatus,setDraftStatus] = useState<'saved'|'unsaved'|'saving'|'error'>('saved');
  const scrollContainerRef = useRef<HTMLElement | null>(null);
  const stepHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [promotedTags, setPromotedTags] = useState<string[]>([]);
  const [profile, setProfile] = useState<any>({
    displayName: profileText('displayName'),
    handle: profileText('handle'),
    pronouns: profileText('pronouns'),
    headline: profileText('headline'),
    bio: profileText('bio'),
    welcomeMessage: profileText('welcomeMessage'),
    favouriteTags: profileSelections('favouriteTags'),
    favouriteTropes: profileSelections('favouriteTropes'),
    favouriteCategories: profileSelections('favouriteCategories'),
    publicProfile: recoverPendingProfileDiscoverability(initialProfile),
  });

  useEffect(() => {
    let cancelled = false;
    void nightjarCommunity.profileTagCatalogue()
      .then((data) => { if (!cancelled) setPromotedTags(data?.tags ?? []); })
      .catch(() => { if (!cancelled) setPromotedTags([]); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    // Each screen starts where its heading and instructions can be read.
    // The scrollable modal, not the document behind it, owns touch scrolling.
    scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'auto' });
    stepHeadingRef.current?.focus({ preventScroll: true });
  }, [stepIndex]);

  const combinedTags = useMemo(
    () => Array.from(new Set([...PROFILE_TAG_OPTIONS, ...promotedTags])).sort((a, b) => a.localeCompare(b)),
    [promotedTags],
  );
  const step = steps[Math.min(stepIndex, steps.length - 1)];
  const initials = (profile.displayName || 'NJ').split(/\s+/).map((part:string)=>part[0]).join('').slice(0,2).toUpperCase();
  const handleProblem = nightjarHandleError(profile.handle);
  const suggestedHandle = handleProblem ? suggestNightjarHandle(profile.handle) : '';
  const roleLabel = role === 'creator' ? 'VA Creator' : role === 'editor' ? 'Audio Editor' : role ? role.charAt(0).toUpperCase() + role.slice(1) : 'Nightjar member';

  // Authenticated Firebase is the source of truth. No phone/browser-only
  // draft: the same signed-in account can resume on a laptop.
  useEffect(() => {
    if(!mountedOnce.current){mountedOnce.current=true;return;}
    if(savingFinished.current)return;
    const version=++draftVersion.current;
    setDraftStatus('unsaved');
    if(saveTimer.current)clearTimeout(saveTimer.current);
    saveTimer.current=setTimeout(()=>{
      saveTimer.current=null;
      setDraftStatus('saving');
      const snapshot={...profile};
      const atStep=stepIndex;
      const next=pendingSave.current.catch(()=>undefined).then(async()=>{
        if(savingFinished.current)return;
        const stored=await nightjarCommunity.saveOnboardingDraft(snapshot,atStep,cloudRevision.current);
        cloudRevision.current=stored.revision;
        cloudConflict.current=false;
        if(version===draftVersion.current)setDraftStatus('saved');
      }).catch((error)=>{
        if(String((error as {code?:string})?.code??'').includes('aborted'))cloudConflict.current=true;
        if(version===draftVersion.current)setDraftStatus('error');
        // Never claim that a draft was saved after a network failure.
        console.warn('Nightjar onboarding cloud autosave failed',error);
      });
      pendingSave.current=next;
    },900);
    return ()=>{if(saveTimer.current){clearTimeout(saveTimer.current);saveTimer.current=null;}};
  },[profile,stepIndex]);

  useEffect(()=>()=>{
    savingFinished.current=true;
    if(saveTimer.current)clearTimeout(saveTimer.current);
  },[]);

  const awaitOutstandingSave = async () => {
    if(saveTimer.current){clearTimeout(saveTimer.current);saveTimer.current=null;}
    await pendingSave.current;
  };

  const update = (key: string, value: unknown) => {
    setFormError('');
    setProfile((current:any)=>({...current,[key]:value}));
  };

  // Blur the field before moving between panels so the virtual keyboard no
  // longer obscures Continue / Create on iOS Safari and Android webviews.
  const goToStep = (next: number) => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    setFormError('');
    setStepIndex(Math.max(0,Math.min(steps.length-1,next)));
    scrollContainerRef.current?.scrollTo({top:0,behavior:'auto'});
  };

  const finish = async () => {
    if (!String(profile.displayName ?? '').trim()) {
      const message = 'Please add your chosen name to finish your NightJar profile.';
      setFormError(message);
      goToStep(0);
      setFormError(message);
      notify(message);
      return;
    }
    if (handleProblem) {
      setFormError(handleProblem);
      goToStep(0);
      setFormError(handleProblem);
      notify(handleProblem);
      return;
    }
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    setFormError('');
    setSaving(true);
    try {
      await awaitOutstandingSave();
      if(cloudConflict.current) throw new Error('Your onboarding draft changed on another device. Refresh Nightjar to load the newest version before completing your profile.');
      const payload = {
        ...(initialProfile ?? {}),
        ...profile,
        handle: normaliseNightjarHandle(profile.handle),
        avatarInitials: initialProfile?.avatarInitials || initials,
        onboardingComplete: true,
        onboardingVersion: 3,
      };
      const data = await nightjarCommunity.saveMyProfile(payload);
      savingFinished.current=true;
      onComplete(data?.profile ?? payload);
      notify(role === 'editor'
        ? 'Your Nightjar profile is ready. Build your professional Audio Editor identity inside Editor Studio.'
        : 'Your Nightjar profile is ready.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Nightjar could not save your profile yet.';
      setFormError(message);
      notify(message);
    } finally {
      setSaving(false);
    }
  };

  const finishLater = async () => {
    if(saving) return;
    setSaving(true);
    try {
      await awaitOutstandingSave();
      if(cloudConflict.current) throw new Error('A newer onboarding draft exists on another device. Refresh before saving your progress here.');
      await onSkip(profile,stepIndex,cloudRevision.current);
      savingFinished.current=true;
    } catch(error) {
      notify(error instanceof Error ? error.message : 'Could not pause your profile setup.');
    } finally {
      setSaving(false);
    }
  };

  const renderStep = () => {
    if (step.id === 'identity') {
      return <div className="premium-onboarding-fields">
        <div className="premium-onboarding-identity-preview">
          <span>{initials}</span>
          <div><strong>{profile.displayName || 'Your chosen name'}</strong><small>{profile.handle ? '@' + profile.handle.replace(/^@/,'') : '@yourhandle'}</small><em>{roleLabel}</em></div>
        </div>
        <div className="premium-onboarding-two">
          <label>Chosen name<input maxLength={80} value={profile.displayName} onChange={(event)=>update('displayName',event.target.value)} placeholder="How should Nightjar know you?"/></label>
          <label>@handle <span className="optional-label">optional</span>
            <input maxLength={50} value={profile.handle} onChange={(event)=>update('handle',event.target.value)}
              placeholder="your-nightjar-name" autoCapitalize="none" autoCorrect="off" spellCheck={false}
              aria-invalid={!!handleProblem} aria-describedby="nightjar-onboarding-handle-hint"/>
            <small id="nightjar-onboarding-handle-hint" role={handleProblem ? 'alert' : undefined}>
              {handleProblem || '3–30 letters, numbers, underscores or hyphens. Leave blank to choose later.'}
            </small>
            {handleProblem && <span className="profile-handle-fixes">
              {suggestedHandle && suggestedHandle !== normaliseNightjarHandle(profile.handle) &&
                <button type="button" className="ghost-button" onClick={()=>update('handle',suggestedHandle)}>Use @{suggestedHandle}</button>}
              <button type="button" className="ghost-button" onClick={()=>update('handle','')}>Continue without a handle</button>
            </span>}
          </label>
        </div>
        <label>Pronouns <span className="optional-label">optional</span><input maxLength={60} value={profile.pronouns} onChange={(event)=>update('pronouns',event.target.value)} placeholder="e.g. she/her"/></label>
        <label className="profile-toggle premium-onboarding-public"><input type="checkbox" checked={profile.publicProfile !== false} onChange={(event)=>update('publicProfile',event.target.checked)}/> Let other Nightjar members discover my profile after setup</label>
        <small>Unfinished profiles stay hidden. Once you complete setup, this choice controls whether members can find you in the directory. You can change it later in My Profile.</small>
      </div>;
    }

    if (step.id === 'presence') {
      return <div className="premium-onboarding-fields">
        <label>Profile headline<input maxLength={140} value={profile.headline} onChange={(event)=>update('headline',event.target.value)} placeholder="A short line that feels unmistakably you"/><small className="field-counter">{String(profile.headline ?? '').length}/140</small></label>
        <label>About you<textarea maxLength={1200} value={profile.bio} onChange={(event)=>update('bio',event.target.value)} placeholder="Introduce yourself in your own words."/><small className="field-counter">{String(profile.bio ?? '').length}/1200</small></label>
        <label>Welcome message <span className="optional-label">optional</span><textarea maxLength={300} value={profile.welcomeMessage} onChange={(event)=>update('welcomeMessage',event.target.value)} placeholder="A small message people see when they open your profile."/><small className="field-counter">{String(profile.welcomeMessage ?? '').length}/300</small></label>
        <div className="premium-onboarding-note"><UserCircle2 size={16}/><div><strong>Your professional profile is separate.</strong><span>If you hold a professional role, its services, experience, portfolio and availability live in that role's Studio — so your personal profile still feels like you.</span></div></div>
      </div>;
    }

    return <div className="premium-onboarding-fields">
      <SearchableMultiSelect label="Moods & tags I enjoy" options={combinedTags} values={profile.favouriteTags ?? []} onChange={(values)=>update('favouriteTags',values)} allowCreate createLabel="Add custom tag" helperText="Your selections help discovery and give visitors a feel for your Nightjar world. They are never treated as professional credentials."/>
      <SearchableMultiSelect label="Tropes & themes I enjoy" options={PROFILE_TROPE_OPTIONS} values={profile.favouriteTropes ?? []} onChange={(values)=>update('favouriteTropes',values)}/>
      <SearchableMultiSelect label="Categories I enjoy" options={PROFILE_CATEGORY_OPTIONS} values={profile.favouriteCategories ?? []} onChange={(values)=>update('favouriteCategories',values)}/>
      <div className="premium-onboarding-finish-card"><Check size={18}/><div><strong>Make this space your own.</strong><span>Add public playlists, credits and creative work whenever you're ready.</span></div></div>
    </div>;
  };

  return <div className="onboarding-backdrop premium-onboarding-backdrop" role="dialog" aria-modal="true" aria-labelledby="nightjar-onboarding-title">
    <section ref={scrollContainerRef} className="onboarding-card premium-onboarding-card" tabIndex={-1} aria-label="Nightjar profile creation steps" aria-describedby="nightjar-onboarding-scroll-hint">
      <div className="premium-onboarding-aura" aria-hidden="true"/>
      <header>
        <div>
          <span className="mini-label">NIGHTJAR / PROFILE CREATION</span>
          <p className="eyebrow"><UserCircle2 size={13}/> YOUR SPACE AFTER DARK</p>
          <h2 id="nightjar-onboarding-title">You belong here.</h2>
          <small className="nj-onboarding-cloud-status" role="status">{draftStatus==='saving' ? 'Saving to Nightjar…' : draftStatus==='unsaved' ? 'Unsaved changes · saving shortly' : draftStatus==='error' ? 'Cloud save interrupted · please retry' : 'Progress backed up to your Nightjar account'}</small>
          <p>Nightjar profiles are designed to feel considered and personal — not like a username attached to a database row.</p>
        </div>
        <button type="button" className="icon-button" disabled={saving} onClick={()=>void finishLater()} aria-label="Save progress and finish setup later"><X size={18}/></button>
      </header>

      <p id="nightjar-onboarding-scroll-hint" className="nj-onboarding-mobile-hint">Scroll inside this form. Save your progress and continue on another device.</p>
      <div className="premium-onboarding-stagebar">
        {steps.map((item,index)=><div className={index===stepIndex?'active':index<stepIndex?'complete':''} key={item.id}><span>{index<stepIndex?<Check size={11}/>:index+1}</span><small>{item.label}</small></div>)}
      </div>

      <article className="onboarding-group premium-onboarding-group">
        <span className="mini-label">{step.label}</span>
        <h3 ref={stepHeadingRef} tabIndex={-1}>{step.title}</h3>
        <p>{step.description}</p>
        {renderStep()}
      </article>

      {formError && <p className="nj-onboarding-inline-error" role="alert">{formError}</p>}
      <div className="onboarding-footer premium-onboarding-footer">
        <span>{roleLabel} · personal profile</span>
        <div>
          {stepIndex > 0 && <button type="button" className="secondary-button" onClick={()=>goToStep(stepIndex-1)}>Back</button>}
          {stepIndex < steps.length - 1
            ? <button type="button" className="primary-button" onClick={()=>goToStep(stepIndex+1)}>Continue <ArrowRight size={14}/></button>
            : <button type="button" className="primary-button" disabled={saving} onClick={()=>void finish()}><Check size={14}/>{saving?'Creating profile…':'Create my Nightjar profile'}</button>}
          <button type="button" className="ghost-button" disabled={saving} onClick={()=>void finishLater()}>Save &amp; finish later</button>
        </div>
      </div>
    </section>
  </div>;
}
