import { useState } from 'react';
import { nightjarCommunity } from '../platform/firebase-community';
import { ArrowRight, Check, Sparkles, X } from 'lucide-react';

type Props = {
  initialProfile?: any;
  role: 'listener' | 'creator' | 'writer' | 'admin' | 'editor' | null;
  onComplete: (profile: any) => void;
  onSkip: () => void;
  notify: (message: string) => void;
};

const QUESTION_GROUPS = [
  {
    id: 'identity',
    label: 'YOU',
    title: 'How should Nightjar know you?',
    description: 'Tell Nightjar only what you choose to share. Pronouns and identity details are optional and never used as assumptions about taste.',
    fields: [
      { key: 'displayName', label: 'Display name', placeholder: 'What should people see?' },
      { key: 'handle', label: '@handle', placeholder: 'your-nightjar-name' },
      { key: 'pronouns', label: 'Pronouns', placeholder: 'Optional' },
      { key: 'headline', label: 'Headline', placeholder: 'A short line that feels like you' },
    ],
  },
  {
    id: 'taste',
    label: 'TASTE',
    title: 'What are you actually here for?',
    description: 'These are explicit preferences. Nightjar uses them to shape discovery rather than guessing who you are.',
    fields: [
      { key: 'favouriteTags', label: 'Favourite tags', placeholder: 'Whisper, cinematic, voice-led' },
      { key: 'favouriteTropes', label: 'Favourite tropes', placeholder: 'Slow burn, suspense, character-led' },
      { key: 'favouriteCategories', label: 'Favourite categories', placeholder: 'Story, performance, atmosphere' },
      { key: 'roleFocus', label: 'Creative interests', placeholder: 'Performance, writing, sound design' },
    ],
  },
  {
    id: 'discovery',
    label: 'DISCOVERY',
    title: 'How should your Nightjar experience feel?',
    description: 'You can change these later. The answers are used to make discovery more relevant without turning behaviour into identity.',
    fields: [
      { key: 'bio', label: 'About you', placeholder: 'Optional short introduction' },
      { key: 'welcomeMessage', label: 'Welcome message', placeholder: 'Optional message visitors see on your profile' },
    ],
  },
];

const ROLE_SETUP: Record<'listener' | 'creator' | 'writer' | 'editor', { label: string; title: string; description: string; fields: { key: string; label: string; placeholder: string }[] }> = {
  listener: {
    label: 'LISTENER', title: 'Build your listener profile.', description: 'Give recommendations and community profiles a little more context without turning listening behaviour into identity.',
    fields: [
      { key: 'roleSpecialties', label: 'Listening moods', placeholder: 'Late-night, atmospheric, comfort' },
      { key: 'roleSecondary', label: 'Discovery style', placeholder: 'Hidden gems, series, new releases' },
      { key: 'roleDetailOne', label: 'What you come to Nightjar for', placeholder: 'Optional short note' },
    ],
  },
  creator: {
    label: 'CREATOR', title: 'Build your creator identity.', description: 'Tell listeners and collaborators what you perform and how you like to work. You can add custom creator tags later from your full profile.',
    fields: [
      { key: 'roleSpecialties', label: 'Performance specialties', placeholder: 'Character roleplay, narration, dramatic performance' },
      { key: 'roleSecondary', label: 'Voice / production strengths', placeholder: 'Close-mic, binaural, series work' },
      { key: 'roleAvailability', label: 'Collaboration availability', placeholder: 'Open to collaborations' },
      { key: 'roleDetailOne', label: 'Voice & performance notes', placeholder: 'Optional public-facing performance note' },
    ],
  },
  writer: {
    label: 'WRITER', title: 'Build your writer identity.', description: 'Show your writing strengths without exposing protected scripts or private deal terms.',
    fields: [
      { key: 'roleSpecialties', label: 'Writing specialties', placeholder: 'Dialogue, romance, character development' },
      { key: 'roleSecondary', label: 'Script formats', placeholder: 'Single-voice, series, collaborative rewrite' },
      { key: 'roleAvailability', label: 'Commission availability', placeholder: 'Open to commissions' },
      { key: 'roleDetailOne', label: 'Writing style & tone', placeholder: 'Optional public-facing note' },
    ],
  },
  editor: {
    label: 'AUDIO EDITOR', title: 'Build your Audio Editor identity.', description: 'Make your production skills visible while private assignments stay private.',
    fields: [
      { key: 'roleSpecialties', label: 'Editing services', placeholder: 'Dialogue editing, mixing, mastering' },
      { key: 'roleSecondary', label: 'Production strengths', placeholder: 'Series consistency, remote handoff' },
      { key: 'roleAvailability', label: 'Booking availability', placeholder: 'Open for bookings' },
      { key: 'roleDetailOne', label: 'Workflow & handoff', placeholder: 'Optional public-facing workflow note' },
    ],
  },
};

const listFields = new Set(['favouriteTags', 'favouriteTropes', 'favouriteCategories', 'roleFocus', 'roleSpecialties', 'roleSecondary']);

const normalize = (key: string, value: string) => listFields.has(key)
  ? value.split(',').map((item) => item.trim()).filter(Boolean).slice(0, 16)
  : value;

export default function NightjarOnboarding({ initialProfile, role, onComplete, onSkip, notify }: Props) {
  const [groupIndex, setGroupIndex] = useState(0);
  const [saving, setSaving] = useState(false);
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
    roleFocus: initialProfile?.roleFocus || [],
    roleSpecialties: initialProfile?.roleSpecialties || [],
    roleSecondary: initialProfile?.roleSecondary || [],
    roleAvailability: initialProfile?.roleAvailability || '',
    roleDetailOne: initialProfile?.roleDetailOne || '',
    roleDetailTwo: initialProfile?.roleDetailTwo || '',
    publicProfile: initialProfile?.publicProfile !== false,
    onboardingComplete: initialProfile?.onboardingComplete === true,
  });

  const questionGroups = role && role !== 'admin' ? [...QUESTION_GROUPS, ROLE_SETUP[role]] : QUESTION_GROUPS;
  const group = questionGroups[groupIndex];

  const update = (key: string, value: string) => setProfile((current: any) => ({ ...current, [key]: normalize(key, value) }));
  const displayValue = (key: string) => Array.isArray(profile[key]) ? profile[key].join(', ') : profile[key] || '';

  const finish = async () => {
    setSaving(true);
    try {
      const payload = { ...profile, onboardingComplete: true, onboardingVersion: 1 };
      const data = await nightjarCommunity.saveMyProfile(payload);
      onComplete(data?.profile ?? payload);
      notify('Nightjar profile and taste preferences saved.');
    } catch {
      notify('Nightjar could not save your onboarding yet.');
    } finally {
      setSaving(false);
    }
  };

  return <div className="onboarding-backdrop" role="dialog" aria-modal="true" aria-labelledby="nightjar-onboarding-title">
    <section className="onboarding-card">
      <header><div><span className="mini-label">NIGHTJAR / PERSONALISATION</span><p className="eyebrow"><Sparkles size={13}/> EXPLICIT TASTE · YOUR CONTROL</p><h2 id="nightjar-onboarding-title">Make Nightjar yours.</h2><p>Nightjar learns from what you tell it you like. It does not need to guess who you are.</p></div><button className="icon-button" onClick={onSkip} aria-label="Close onboarding"><X size={18}/></button></header>
      <div className="onboarding-progress"><span style={{ width: ((groupIndex + 1) / questionGroups.length * 100) + '%' }} /><small>Step {groupIndex + 1} of {questionGroups.length}</small></div>
      <article className="onboarding-group"><span className="mini-label">{group.label}</span><h3>{group.title}</h3><p>{group.description}</p><div className="onboarding-fields">{group.fields.map((field:any) => <label key={field.key}>{field.label}<input value={displayValue(field.key)} onChange={(event) => update(field.key, event.target.value)} placeholder={field.placeholder} /></label>)}</div></article>
      <div className="onboarding-footer"><span>{role ? 'Account role: ' + (role === 'editor' ? 'Audio Editor' : role.charAt(0).toUpperCase() + role.slice(1)) : 'Nightjar account'}</span><div>{groupIndex > 0 && <button className="secondary-button" onClick={() => setGroupIndex((index) => index - 1)}>Back</button>}{groupIndex < questionGroups.length - 1 ? <button className="primary-button" onClick={() => setGroupIndex((index) => index + 1)}>Continue <ArrowRight size={14}/></button> : <button className="primary-button" disabled={saving} onClick={() => void finish()}><Check size={14}/> {saving ? 'Saving…' : 'Finish setup'}</button>}<button className="ghost-button" disabled={saving} onClick={onSkip}>Skip for now</button></div></div>
    </section>
  </div>;
}
