import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Check, Sparkles, UserCircle2, X } from 'lucide-react';
import { nightjarCommunity } from '../platform/firebase-community';
import { nightjarProfileDrafts } from '../platform/firebase-profile-drafts';
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
  onSkip: (savedProfile: any) => void;
  notify: (message: string) => void;
};

type Step = 'identity' | 'presence' | 'personalisation';

const steps: { id: Step; label: string; title: string; description: string }[] = [
  {
    id: 'identity',
    label: 'YOUR NIGHTJAR',
    title: 'Create a profile that feels like yours.',
    description: 'This is your account-level identity across Nightjar. Whether you listen, create, write, edit or make artwork, your personal profile is never treated as the “basic” version.',
  },
  {
    id: 'presence',
    label: 'YOUR PRESENCE',
    title: 'Give people a reason to remember you.',
    description: 'A premium profile should feel intentional. Add a headline, a short introduction and an optional welcome note. Professional services and credentials stay in the relevant role Studio.',
  },
  {
    id: 'personalisation',
    label: 'YOUR WORLD',
    title: 'Shape what Nightjar feels like for you.',
    description: 'Choose themes, moods and categories that genuinely interest you. These are discovery preferences, not assumptions about identity.',
  },
];

export default function NightjarOnboarding({ initialProfile, role, onComplete, onSkip, notify }: Props) {
  const [stepIndex, setStepIndex] = useState(0);
  const cardRef = useRef<HTMLElement | null>(null);
  const revisionRef = useRef(0);
  const lastSyncedRef = useRef('');
  const pendingSaveRef = useRef<Promise<boolean>|null>(null);
  const stopSyncRef = useRef(false);
  const [draftReady,setDraftReady] = useState(false);
  const [draftStatus,setDraftStatus] = useState<'loading'|'saved'|'saving'|'unsaved'|'conflict'|'offline'>('loading');
  const [draftConflict,setDraftConflict] = useState(false);
  const [saving, setSaving] = useState(false);
  const [promotedTags, setPromotedTags] = useState<string[]>([]);
  const [profile, setProfile] = useState<any>({
    displayName: initialProfile?.displayName || '',
    handle: initialProfile?.handle || '',
    pronouns: initialProfile?.pronouns || '',
    headline: initialProfile?.headline || '',
    bio: initialProfile?.bio || '',
    welcomeMessage: initialProfile?.welcomeMessage || '',
    favouriteTags: initialProfile?.favouriteTags || [],
    favouriteTropes: initialProfile?.favouriteTropes || [],
    favouriteCategories: initialProfile?.favouriteCategories || [],
    publicProfile: initialProfile?.publicProfile !== false,
  });

  // Drafts live in Firestore under the signed-in account, not localStorage.
  // The next phone, PC, browser or installed app sees the same draft.
  useEffect(() => {
    let cancelled=false;
    stopSyncRef.current=false;
    void nightjarProfileDrafts.get('onboarding').then((draft)=>{
      if(cancelled)return;
      revisionRef.current=draft.revision;
      const saved=draft.payload;
      if(saved){
        const {stepIndex:restoredStep,...fields}=saved;
        setProfile((prev:any)=>({...prev,...fields}));
        setStepIndex(Math.max(0,Math.min(2,Number(restoredStep??0))));
        lastSyncedRef.current=JSON.stringify({profile:{...profile,...fields},stepIndex:Number(restoredStep??0)});
      }else{
        lastSyncedRef.current=JSON.stringify({profile,stepIndex:0});
      }
      setDraftReady(true);
      setDraftStatus('saved');
    }).catch(()=>{
      if(cancelled)return;
      // Do not allow an unversioned device to overwrite an unseen cloud draft.
      setDraftReady(false);
      setDraftStatus('offline');
      notify('Nightjar could not load your saved progress. Reconnect and retry before editing.');
    });
    return()=>{cancelled=true;stopSyncRef.current=true;};
  },[]);

  const workingProfileRef=useRef(profile);
  const workingStepRef=useRef(stepIndex);
  workingProfileRef.current=profile;
  workingStepRef.current=stepIndex;
  const createDraftPayload=()=>{
    const p=workingProfileRef.current;
    return {
      displayName:p.displayName??'',handle:p.handle??'',pronouns:p.pronouns??'',
      headline:p.headline??'',bio:p.bio??'',welcomeMessage:p.welcomeMessage??'',
      favouriteTags:p.favouriteTags??[],favouriteTropes:p.favouriteTropes??[],
      favouriteCategories:p.favouriteCategories??[],publicProfile:p.publicProfile!==false,
      stepIndex:workingStepRef.current,
    };
  };
  const syncDraft=async():Promise<boolean>=>{
    if(!draftReady||draftConflict||stopSyncRef.current)return false;
    if(pendingSaveRef.current)return pendingSaveRef.current.then((done)=>done && syncDraft());
    const fullSignature=JSON.stringify({profile:workingProfileRef.current,stepIndex:workingStepRef.current});
    if(fullSignature===lastSyncedRef.current){setDraftStatus('saved');return true;}
    setDraftStatus('saving');
    const pending=(async()=>{
      try{
        const result=await nightjarProfileDrafts.save('onboarding',createDraftPayload(),revisionRef.current);
        if(stopSyncRef.current)return false;
        if(!result.saved){
          setDraftConflict(true);setDraftStatus('conflict');
          return false;
        }
        revisionRef.current=result.revision;
        lastSyncedRef.current=fullSignature;
        setDraftStatus('saved');
        return true;
      }catch{
        if(!stopSyncRef.current)setDraftStatus('offline');
        return false;
      }
    })();
    pendingSaveRef.current=pending;
    try{return await pending;}finally{pendingSaveRef.current=null;}
  };
  useEffect(()=>{
    if(!draftReady||draftConflict||stopSyncRef.current)return;
    const signature=JSON.stringify({profile,stepIndex});
    if(signature===lastSyncedRef.current)return;
    setDraftStatus('unsaved');
    const timer=window.setTimeout(()=>{void syncDraft();},1100);
    return()=>window.clearTimeout(timer);
  },[profile,stepIndex,draftReady,draftConflict]);

  const restoreLatest=async()=>{
    setDraftStatus('loading');
    try{
      const draft=await nightjarProfileDrafts.get('onboarding');
      revisionRef.current=draft.revision;
      const {stepIndex:restoredStep,...fields}=draft.payload??{};
      const nextProfile={...initialProfile,...fields};
      const nextStep=Math.max(0,Math.min(2,Number(restoredStep??0)));
      workingProfileRef.current=nextProfile;workingStepRef.current=nextStep;
      setProfile(nextProfile);setStepIndex(nextStep);
      lastSyncedRef.current=JSON.stringify({profile:nextProfile,stepIndex:nextStep});
      setDraftConflict(false);setDraftReady(true);setDraftStatus('saved');
    }catch{setDraftStatus('offline');}
  };
  const keepLocalChanges=async()=>{
    try{
      const latest=await nightjarProfileDrafts.get('onboarding');
      revisionRef.current=latest.revision;
      setDraftConflict(false);setDraftStatus('unsaved');
      // The user has explicitly chosen this device's draft over the newer
      // remote draft; the next autosave performs the version-guarded write.
    }catch{setDraftStatus('offline');}
  };

  useEffect(() => {
    let cancelled = false;
    void nightjarCommunity.profileTagCatalogue()
      .then((data) => { if (!cancelled) setPromotedTags(data?.tags ?? []); })
      .catch(() => { if (!cancelled) setPromotedTags([]); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    // Each mobile step begins at its first field rather than inheriting the
    // previous step's scroll position. The card itself is touch-scrollable.
    cardRef.current?.scrollTo({ top: 0, behavior: 'instant' });
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

  const update = (key: string, value: unknown) => setProfile((current:any)=>({...current,[key]:value}));

  const finish = async () => {
    if (handleProblem) {
      setStepIndex(0);
      notify(handleProblem);
      return;
    }
    if (!await syncDraft()){notify('Your profile draft has not synced. Resolve the connection or version conflict before finishing.');return;}
    setSaving(true);
    try {
      const payload = {
        ...(initialProfile ?? {}),
        ...profile,
        handle: normaliseNightjarHandle(profile.handle),
        avatarInitials: initialProfile?.avatarInitials || initials,
        onboardingComplete: true,
        onboardingVersion: 3,
      };
      const data = await nightjarCommunity.saveMyProfile(payload);
      if(!data?.profile?.onboardingComplete)throw new Error('Nightjar did not confirm your profile is complete.');
      stopSyncRef.current=true;
      await nightjarProfileDrafts.clear('onboarding',revisionRef.current).catch(()=>({cleared:false}));
      onComplete(data.profile);
      notify(role === 'editor'
        ? 'Your Nightjar profile is ready. Build your professional Audio Editor identity inside Editor Studio.'
        : 'Your Nightjar profile is ready.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Nightjar could not save your profile yet.';
      notify(message);
    } finally {
      setSaving(false);
    }
  };

  const finishLater = async () => {
    if (saving) return;
    if (!await syncDraft()){notify('Your draft is not synced yet. Please reconnect or resolve the conflict before leaving.');return;}
    setSaving(true);
    try {
      // Save whatever they completed as an ordinary incomplete profile.
      // A partially typed invalid @handle is omitted rather than making
      // Finish later a hidden validation trap on touch devices.
      const payload = {
        ...(initialProfile ?? {}),
        ...profile,
        handle: handleProblem ? '' : normaliseNightjarHandle(profile.handle),
        avatarInitials: initialProfile?.avatarInitials || initials,
        onboardingComplete: false,
        deferOnboarding: true,
      };
      const data = await nightjarCommunity.saveMyProfile(payload);
      if (!data?.profile?.onboardingDismissedAt) {
        throw new Error('Nightjar did not confirm that your profile can be finished later.');
      }
      stopSyncRef.current=true;
      onSkip(data.profile);
      notify(handleProblem
        ? 'Your progress was saved. The invalid @handle was left blank so you can choose it later from your profile.'
        : 'Your progress is saved. Continue as a Listener or finish your profile whenever you choose.');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Nightjar could not save your progress. Please try again.');
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
        <label className="profile-toggle premium-onboarding-public"><input type="checkbox" checked={profile.publicProfile !== false} onChange={(event)=>update('publicProfile',event.target.checked)}/> Let other Nightjar members discover my profile</label>
      </div>;
    }

    if (step.id === 'presence') {
      return <div className="premium-onboarding-fields">
        <label>Profile headline<input maxLength={140} value={profile.headline} onChange={(event)=>update('headline',event.target.value)} placeholder="A short line that feels unmistakably you"/><small className="field-counter">{String(profile.headline ?? '').length}/140</small></label>
        <label>About you<textarea maxLength={1200} value={profile.bio} onChange={(event)=>update('bio',event.target.value)} placeholder="Introduce yourself in your own words."/><small className="field-counter">{String(profile.bio ?? '').length}/1200</small></label>
        <label>Welcome message <span className="optional-label">optional</span><textarea maxLength={300} value={profile.welcomeMessage} onChange={(event)=>update('welcomeMessage',event.target.value)} placeholder="A small message people see when they open your profile."/><small className="field-counter">{String(profile.welcomeMessage ?? '').length}/300</small></label>
        <div className="premium-onboarding-note"><Sparkles size={16}/><div><strong>Your professional identity stays separate.</strong><span>If you hold a professional role, its services, experience, portfolio and availability live in that role's Studio — so your personal profile still feels like you.</span></div></div>
      </div>;
    }

    return <div className="premium-onboarding-fields">
      <SearchableMultiSelect label="Moods & tags I enjoy" options={combinedTags} values={profile.favouriteTags ?? []} onChange={(values)=>update('favouriteTags',values)} allowCreate createLabel="Add custom tag" helperText="Your selections help discovery and give visitors a feel for your Nightjar world. They are never treated as professional credentials."/>
      <SearchableMultiSelect label="Tropes & themes I enjoy" options={PROFILE_TROPE_OPTIONS} values={profile.favouriteTropes ?? []} onChange={(values)=>update('favouriteTropes',values)}/>
      <SearchableMultiSelect label="Categories I enjoy" options={PROFILE_CATEGORY_OPTIONS} values={profile.favouriteCategories ?? []} onChange={(values)=>update('favouriteCategories',values)}/>
      <div className="premium-onboarding-finish-card"><Sparkles size={18}/><div><strong>This is only the beginning.</strong><span>Your profile grows with public playlists, verified credits, collaborations, badges and the work or recommendations you choose to share.</span></div></div>
    </div>;
  };

  return <div className="onboarding-backdrop premium-onboarding-backdrop" role="dialog" aria-modal="true" aria-labelledby="nightjar-onboarding-title">
    <section ref={cardRef} className="onboarding-card premium-onboarding-card" aria-describedby="nightjar-onboarding-guidance" aria-busy={!draftReady || saving}>
      <div className="premium-onboarding-aura" aria-hidden="true"/>
      <header>
        <div>
          <span className="mini-label">NIGHTJAR / PROFILE CREATION</span>
          <p className="eyebrow"><UserCircle2 size={13}/> YOUR SPACE AFTER DARK</p>
          <h2 id="nightjar-onboarding-title">You belong here.</h2>
          <p id="nightjar-onboarding-guidance">Nightjar profiles are designed to feel considered and personal. You can scroll through every field on your phone or save your progress and finish later.</p>
        </div>
        <button type="button" className="icon-button" onClick={() => void finishLater()} disabled={saving||!draftReady||draftConflict} aria-label="Save profile progress and close setup"><X size={18}/></button>
      </header>

      <div className="nj-cloud-draft-status" role="status" aria-live="polite">
        <span>{draftStatus==='saved'?'Saved to your Nightjar account · available on other devices':
          draftStatus==='saving'?'Saving your changes across devices…':
          draftStatus==='unsaved'?'Changes pending cloud save…':
          draftStatus==='conflict'?'This draft changed on another device. Choose which version to use.':
          draftStatus==='offline'?'Unable to sync. Check your connection; your draft has not been overwritten.':
          'Checking your Nightjar account for saved progress…'}</span>
        {draftConflict && <div className="nj-cloud-draft-conflict">
          <button type="button" className="secondary-button" onClick={()=>void restoreLatest()}>Load latest saved version</button>
          <button type="button" className="ghost-button" onClick={()=>void keepLocalChanges()}>Keep my current edits</button>
        </div>}
        {!draftReady && <button type="button" className="ghost-button" onClick={()=>void restoreLatest()}>Retry sync</button>}
      </div>
      <div className="premium-onboarding-stagebar">
        {steps.map((item,index)=><div className={index===stepIndex?'active':index<stepIndex?'complete':''} key={item.id}><span>{index<stepIndex?<Check size={11}/>:index+1}</span><small>{item.label}</small></div>)}
      </div>

      <article className="onboarding-group premium-onboarding-group">
        <span className="mini-label">{step.label}</span>
        <h3>{step.title}</h3>
        <p>{step.description}</p>
        {draftReady ? renderStep() : <p className="nj-cloud-draft-loading">Waiting for your saved account profile…</p>}
      </article>

      <div className="onboarding-footer premium-onboarding-footer" aria-label="Profile setup navigation">
        <span>{roleLabel} · personal profile</span>
        <div>
          {stepIndex > 0 && <button className="secondary-button" onClick={()=>setStepIndex((index)=>index-1)}>Back</button>}
          {stepIndex < steps.length - 1
            ? <button className="primary-button" disabled={!draftReady||draftConflict||saving} onClick={()=>setStepIndex((index)=>index+1)}>Continue <ArrowRight size={14}/></button>
            : <button className="primary-button" disabled={saving||!draftReady||draftConflict} onClick={()=>void finish()}><Check size={14}/>{saving?'Creating profile…':'Create my Nightjar profile'}</button>}
          <button type="button" className="ghost-button" disabled={saving||!draftReady||draftConflict} onClick={() => void finishLater()}>{saving ? 'Saving progress…' : 'Save & finish later'}</button>
        </div>
      </div>
    </section>
  </div>;
}
