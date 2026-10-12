import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Check, Sparkles, UserCircle2, X } from 'lucide-react';
import { nightjarCommunity } from '../platform/firebase-community';
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
  onSkip: (savedProfile?:any) => void;
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
  const scrollRef = useRef<HTMLElement|null>(null);
  const stepHeadingRef = useRef<HTMLHeadingElement|null>(null);
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

  useEffect(() => {
    let cancelled = false;
    void nightjarCommunity.profileTagCatalogue()
      .then((data) => { if (!cancelled) setPromotedTags(data?.tags ?? []); })
      .catch(() => { if (!cancelled) setPromotedTags([]); });
    return () => { cancelled = true; };
  }, []);

  // Each step begins at the top of the accessible, finger-scrollable dialog.
  // Never force a user to use keyboard Tab to reach hidden fields.
  useEffect(() => {
    scrollRef.current?.scrollTo({top:0,behavior:'instant'});
    stepHeadingRef.current?.focus({preventScroll:true});
  },[stepIndex]);

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
    setSaving(true);
    try {
      const payload = {
        ...(initialProfile ?? {}),
        ...profile,
        handle: normaliseNightjarHandle(profile.handle),
        avatarInitials: initialProfile?.avatarInitials || initials,
        onboardingComplete: true,
        onboardingDismissed: false,
        onboardingVersion: 3,
      };
      const data = await nightjarCommunity.saveMyProfile(payload);
      onComplete(data?.profile ?? payload);
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

  // Closing the introduction means 'let me work on this later', not
  // 'force me through the same VA/profile form every time I sign in'.
  // Save any fields they already typed without marking the profile complete.
  const finishLater = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const payload = {
        ...(initialProfile ?? {}),
        ...profile,
        handle: handleProblem ? '' : normaliseNightjarHandle(profile.handle),
        avatarInitials: initialProfile?.avatarInitials || initials,
        onboardingDismissed:true,
        onboardingComplete:false,
        onboardingVersion:3,
      };
      const result = await nightjarCommunity.saveMyProfile(payload);
      onSkip(result?.profile ?? payload);
      notify('Your profile progress is saved. Finish setup any time from Profile.');
    } catch {
      // Closing the dialog must still work when a network request fails.
      // The parent remembers the dismissal on this device, without claiming a save.
      onSkip();
      notify('Setup closed. Changes not saved; open Profile to finish when connected.');
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
    <section className="onboarding-card premium-onboarding-card" ref={scrollRef} tabIndex={-1} aria-label="Scrollable Nightjar profile setup">
      <div className="premium-onboarding-aura" aria-hidden="true"/>
      <header>
        <div>
          <span className="mini-label">NIGHTJAR / PROFILE CREATION</span>
          <p className="eyebrow"><UserCircle2 size={13}/> YOUR SPACE AFTER DARK</p>
          <h2 id="nightjar-onboarding-title">You belong here.</h2>
          <p>This is your shared Nightjar profile, not a mandatory VA application. You can finish it later from Profile and keep using your Listener access.</p>
        </div>
        <button className="icon-button" disabled={saving} onClick={()=>void finishLater()} aria-label="Save progress and close profile creation"><X size={18}/></button>
      </header>

      <div className="premium-onboarding-stagebar">
        {steps.map((item,index)=><div className={index===stepIndex?'active':index<stepIndex?'complete':''} key={item.id}><span>{index<stepIndex?<Check size={11}/>:index+1}</span><small>{item.label}</small></div>)}
      </div>

      <article className="onboarding-group premium-onboarding-group">
        <span className="mini-label">{step.label}</span>
        <h3 ref={stepHeadingRef} tabIndex={-1} className="premium-onboarding-step-intro">{step.title}</h3>
        <p>{step.description}</p>
        {renderStep()}
      </article>

      <div className="onboarding-footer premium-onboarding-footer">
        <span>{roleLabel} · personal profile</span>
        <div>
          {stepIndex > 0 && <button className="secondary-button" onClick={()=>setStepIndex((index)=>index-1)}>Back</button>}
          {stepIndex < steps.length - 1
            ? <button className="primary-button" onClick={()=>setStepIndex((index)=>index+1)}>Continue <ArrowRight size={14}/></button>
            : <button className="primary-button" disabled={saving} onClick={()=>void finish()}><Check size={14}/>{saving?'Creating profile…':'Create my Nightjar profile'}</button>}
          <button className="ghost-button" disabled={saving} onClick={()=>void finishLater()}>{saving?'Saving…':'Save & finish later'}</button>
        </div>
      </div>
    </section>
  </div>;
}
