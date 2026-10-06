import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Check, Sparkles, UserCircle2, X } from 'lucide-react';
import { nightjarCommunity } from '../platform/firebase-community';
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
  onSkip: () => void;
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

  const combinedTags = useMemo(
    () => Array.from(new Set([...PROFILE_TAG_OPTIONS, ...promotedTags])).sort((a, b) => a.localeCompare(b)),
    [promotedTags],
  );
  const step = steps[Math.min(stepIndex, steps.length - 1)];
  const initials = (profile.displayName || 'NJ').split(/\s+/).map((part:string)=>part[0]).join('').slice(0,2).toUpperCase();
  const roleLabel = role === 'creator' ? 'VA Creator' : role === 'editor' ? 'Audio Editor' : role ? role.charAt(0).toUpperCase() + role.slice(1) : 'Nightjar member';

  const update = (key: string, value: unknown) => setProfile((current:any)=>({...current,[key]:value}));

  const finish = async () => {
    setSaving(true);
    try {
      const payload = {
        ...(initialProfile ?? {}),
        ...profile,
        avatarInitials: initialProfile?.avatarInitials || initials,
        onboardingComplete: true,
        onboardingVersion: 3,
      };
      const data = await nightjarCommunity.saveMyProfile(payload);
      onComplete(data?.profile ?? payload);
      notify(role === 'editor'
        ? 'Your Nightjar profile is ready. Build your professional Audio Editor identity inside Editor Studio.'
        : 'Your Nightjar profile is ready.');
    } catch {
      notify('Nightjar could not save your profile yet.');
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
          <label>@handle<input maxLength={30} value={profile.handle} onChange={(event)=>update('handle',event.target.value)} placeholder="your-nightjar-name"/></label>
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
    <section className="onboarding-card premium-onboarding-card">
      <div className="premium-onboarding-aura" aria-hidden="true"/>
      <header>
        <div>
          <span className="mini-label">NIGHTJAR / PROFILE CREATION</span>
          <p className="eyebrow"><UserCircle2 size={13}/> YOUR SPACE AFTER DARK</p>
          <h2 id="nightjar-onboarding-title">You belong here.</h2>
          <p>Nightjar profiles are designed to feel considered and personal — not like a username attached to a database row.</p>
        </div>
        <button className="icon-button" onClick={onSkip} aria-label="Close profile creation"><X size={18}/></button>
      </header>

      <div className="premium-onboarding-stagebar">
        {steps.map((item,index)=><div className={index===stepIndex?'active':index<stepIndex?'complete':''} key={item.id}><span>{index<stepIndex?<Check size={11}/>:index+1}</span><small>{item.label}</small></div>)}
      </div>

      <article className="onboarding-group premium-onboarding-group">
        <span className="mini-label">{step.label}</span>
        <h3>{step.title}</h3>
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
          <button className="ghost-button" disabled={saving} onClick={onSkip}>Finish later</button>
        </div>
      </div>
    </section>
  </div>;
}
