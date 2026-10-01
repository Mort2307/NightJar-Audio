import { useEffect, useMemo, useState } from 'react';
import { nightjarCommunity } from '../platform/firebase-community';
import { ArrowRight, Check, Sparkles, X } from 'lucide-react';
import SearchableMultiSelect from './SearchableMultiSelect';
import {
  PROFILE_CATEGORY_OPTIONS,
  PROFILE_TAG_OPTIONS,
  PROFILE_TROPE_OPTIONS,
  ROLE_FOCUS_OPTIONS,
  ROLE_PROFILE_CONFIG,
  type ProfileRoleKey,
} from '../data/nightjarTaxonomy';

type Props = {
  initialProfile?: any;
  role: 'listener' | 'creator' | 'writer' | 'admin' | 'editor' | 'artist' | null;
  onComplete: (profile: any) => void;
  onSkip: () => void;
  notify: (message: string) => void;
};

type Field = {
  key: string;
  label: string;
  placeholder: string;
};

type QuestionGroup = {
  id: string;
  label: string;
  title: string;
  description: string;
  fields: Field[];
};

const QUESTION_GROUPS: QuestionGroup[] = [
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
    description: 'Search and select what fits. If a useful tag is missing, non-admin accounts can add it here instead of working around a fixed list.',
    fields: [
      { key: 'favouriteTags', label: 'Favourite tags', placeholder: 'Search or add a tag' },
      { key: 'favouriteTropes', label: 'Favourite tropes', placeholder: 'Search tropes' },
      { key: 'favouriteCategories', label: 'Favourite categories', placeholder: 'Search categories' },
      { key: 'roleFocus', label: 'Creative interests', placeholder: 'Search role focus' },
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

const ROLE_SETUP: Record<'listener' | 'creator' | 'writer' | 'editor' | 'artist', QuestionGroup> = {
  listener: {
    id: 'role-listener',
    label: 'LISTENER',
    title: 'Build your listener profile.',
    description: 'Give recommendations and community profiles a little more context without exposing private listening history.',
    fields: [
      { key: 'roleSpecialties', label: 'Listening moods', placeholder: 'Choose listening moods' },
      { key: 'roleSecondary', label: 'Discovery style', placeholder: 'Choose discovery styles' },
      { key: 'roleDetailOne', label: 'What you come to Nightjar for', placeholder: 'Optional short note' },
      { key: 'roleDetailTwo', label: 'Community note', placeholder: 'Optional public community note' },
    ],
  },
  creator: {
    id: 'role-creator',
    label: 'CREATOR',
    title: 'Build your creator identity.',
    description: 'Tell listeners and collaborators what you perform and how you like to work. Custom creator tags can be added during setup as well as later.',
    fields: [
      { key: 'roleSpecialties', label: 'Performance specialties', placeholder: 'Choose performance specialties' },
      { key: 'roleSecondary', label: 'Voice / production strengths', placeholder: 'Choose strengths' },
      { key: 'roleAvailability', label: 'Collaboration availability', placeholder: 'Choose availability' },
      { key: 'roleDetailOne', label: 'Voice & performance notes', placeholder: 'Optional public-facing performance note' },
      { key: 'roleDetailTwo', label: 'Recording / production setup', placeholder: 'Optional public-facing production note' },
    ],
  },
  writer: {
    id: 'role-writer',
    label: 'WRITER',
    title: 'Build your writer identity.',
    description: 'Show your writing strengths without exposing protected scripts or private deal terms.',
    fields: [
      { key: 'roleSpecialties', label: 'Writing specialties', placeholder: 'Choose writing specialties' },
      { key: 'roleSecondary', label: 'Script formats', placeholder: 'Choose script formats' },
      { key: 'roleAvailability', label: 'Commission availability', placeholder: 'Choose availability' },
      { key: 'roleDetailOne', label: 'Writing style & tone', placeholder: 'Optional public-facing note' },
      { key: 'roleDetailTwo', label: 'Licensing & collaboration note', placeholder: 'Optional public-facing collaboration note' },
    ],
  },
  editor: {
    id: 'role-editor',
    label: 'AUDIO EDITOR',
    title: 'Build your Audio Editor identity.',
    description: 'Make your production skills visible while private assignments, notes and client material stay private.',
    fields: [
      { key: 'roleSpecialties', label: 'Editing services', placeholder: 'Choose editing services' },
      { key: 'roleSecondary', label: 'Production strengths', placeholder: 'Choose production strengths' },
      { key: 'roleAvailability', label: 'Booking availability', placeholder: 'Choose availability' },
      { key: 'roleDetailOne', label: 'Workflow & handoff', placeholder: 'Optional public-facing workflow note' },
      { key: 'roleDetailTwo', label: 'Turnaround / production note', placeholder: 'Optional public-facing production note' },
    ],
  },,
  artist: {
    id: 'role-artist',
    label: 'ARTIST',
    title: 'Build your artist identity.',
    description: 'Show creators what you make, the briefs you enjoy and whether you are open for commissions.',
    fields: [
      { key: 'roleSpecialties', label: 'Art services', placeholder: 'Choose art services' },
      { key: 'roleSecondary', label: 'Creative strengths', placeholder: 'Choose creative strengths' },
      { key: 'roleAvailability', label: 'Commission availability', placeholder: 'Choose availability' },
      { key: 'roleDetailOne', label: 'Style & portfolio note', placeholder: 'Optional public-facing style note' },
      { key: 'roleDetailTwo', label: 'Commission / licensing note', placeholder: 'Optional public-facing commission note' },
    ],
  },

};

const listFields = new Set([
  'favouriteTags',
  'favouriteTropes',
  'favouriteCategories',
  'roleFocus',
  'roleSpecialties',
  'roleSecondary',
]);

export default function NightjarOnboarding({ initialProfile, role, onComplete, onSkip, notify }: Props) {
  const [groupIndex, setGroupIndex] = useState(0);
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
    roleFocus: initialProfile?.roleFocus || [],
    roleSpecialties: initialProfile?.roleSpecialties || [],
    roleSecondary: initialProfile?.roleSecondary || [],
    roleAvailability: initialProfile?.roleAvailability || '',
    roleDetailOne: initialProfile?.roleDetailOne || '',
    roleDetailTwo: initialProfile?.roleDetailTwo || '',
    portfolioNote: initialProfile?.portfolioNote || '',
    featuredPortfolioIds: Array.isArray(initialProfile?.featuredPortfolioIds) ? initialProfile.featuredPortfolioIds : [],
    publicProfile: initialProfile?.publicProfile !== false,
    onboardingComplete: initialProfile?.onboardingComplete === true,
  });

  useEffect(() => {
    let cancelled = false;
    void nightjarCommunity.profileTagCatalogue()
      .then((data) => {
        if (!cancelled) setPromotedTags(data?.tags ?? []);
      })
      .catch(() => {
        if (!cancelled) setPromotedTags([]);
      });
    return () => { cancelled = true; };
  }, []);

  const roleKey = (role ?? 'listener') as ProfileRoleKey;
  const roleConfig = ROLE_PROFILE_CONFIG[roleKey];
  const combinedTags = useMemo(
    () => Array.from(new Set([...PROFILE_TAG_OPTIONS, ...promotedTags])).sort((a, b) => a.localeCompare(b)),
    [promotedTags],
  );

  const questionGroups = role && role !== 'admin'
    ? [...QUESTION_GROUPS, ROLE_SETUP[role]]
    : QUESTION_GROUPS;
  const group = questionGroups[Math.min(groupIndex, questionGroups.length - 1)];

  const updateScalar = (key: string, value: string) => {
    setProfile((current: any) => ({ ...current, [key]: value }));
  };

  const updateList = (key: string, values: string[]) => {
    setProfile((current: any) => ({ ...current, [key]: values }));
  };

  const optionsForField = (key: string): readonly string[] => {
    if (key === 'favouriteTags') return combinedTags;
    if (key === 'favouriteTropes') return PROFILE_TROPE_OPTIONS;
    if (key === 'favouriteCategories') return PROFILE_CATEGORY_OPTIONS;
    if (key === 'roleFocus') return ROLE_FOCUS_OPTIONS[roleKey];
    if (key === 'roleSpecialties') return roleConfig.specialtiesOptions;
    if (key === 'roleSecondary') return roleConfig.secondaryOptions;
    return [];
  };

  const labelForField = (field: Field) => {
    if (field.key === 'favouriteTags') return roleConfig.tagLabel;
    if (field.key === 'roleFocus') return roleConfig.focusLabel;
    if (field.key === 'roleSpecialties') return roleConfig.specialtiesLabel;
    if (field.key === 'roleSecondary') return roleConfig.secondaryLabel;
    if (field.key === 'roleAvailability') return roleConfig.availabilityLabel ?? field.label;
    if (field.key === 'roleDetailOne') return roleConfig.detailOneLabel;
    if (field.key === 'roleDetailTwo') return roleConfig.detailTwoLabel;
    return field.label;
  };

  const finish = async () => {
    setSaving(true);
    try {
      const payload = { ...profile, onboardingComplete: true, onboardingVersion: 2 };
      const data = await nightjarCommunity.saveMyProfile(payload);
      onComplete(data?.profile ?? payload);
      notify('Nightjar profile and taste preferences saved.');
    } catch {
      notify('Nightjar could not save your onboarding yet.');
    } finally {
      setSaving(false);
    }
  };

  const renderField = (field: Field) => {
    const label = labelForField(field);

    if (listFields.has(field.key)) {
      const allowCustomTag = field.key === 'favouriteTags' && role !== 'admin';
      return <SearchableMultiSelect
        key={field.key}
        label={label}
        options={optionsForField(field.key)}
        values={Array.isArray(profile[field.key]) ? profile[field.key] : []}
        onChange={(values) => updateList(field.key, values)}
        allowCreate={allowCustomTag}
        createLabel="Add custom tag"
        helperText={allowCustomTag
          ? role === 'creator'
            ? 'Missing niche or explicit descriptor? Add it here. Repeated use by distinct approved creators can promote it into Nightjar’s shared catalogue.'
            : 'Missing something useful? Add a custom tag to your profile. Shared catalogue promotion is driven by approved creator usage.'
          : undefined}
      />;
    }

    if (field.key === 'roleAvailability' && roleConfig.availabilityLabel) {
      return <label key={field.key}>{label}
        <select value={profile.roleAvailability ?? ''} onChange={(event) => updateScalar('roleAvailability', event.target.value)}>
          <option value="">Not specified</option>
          {roleConfig.availabilityOptions.map((option) => <option value={option} key={option}>{option}</option>)}
        </select>
      </label>;
    }

    if (['bio', 'welcomeMessage', 'roleDetailOne', 'roleDetailTwo'].includes(field.key)) {
      return <label key={field.key}>{label}
        <textarea
          value={profile[field.key] ?? ''}
          onChange={(event) => updateScalar(field.key, event.target.value)}
          placeholder={field.placeholder}
        />
      </label>;
    }

    return <label key={field.key}>{label}
      <input
        value={profile[field.key] ?? ''}
        onChange={(event) => updateScalar(field.key, event.target.value)}
        placeholder={field.placeholder}
      />
    </label>;
  };

  return <div className="onboarding-backdrop" role="dialog" aria-modal="true" aria-labelledby="nightjar-onboarding-title">
    <section className="onboarding-card">
      <header>
        <div>
          <span className="mini-label">NIGHTJAR / PERSONALISATION</span>
          <p className="eyebrow"><Sparkles size={13}/> EXPLICIT TASTE · YOUR CONTROL</p>
          <h2 id="nightjar-onboarding-title">Make Nightjar yours.</h2>
          <p>Nightjar learns from what you deliberately tell it. It does not need to guess who you are.</p>
        </div>
        <button className="icon-button" onClick={onSkip} aria-label="Close onboarding"><X size={18}/></button>
      </header>

      <div className="onboarding-progress">
        <span style={{ width: ((groupIndex + 1) / questionGroups.length * 100) + '%' }} />
        <small>Step {groupIndex + 1} of {questionGroups.length}</small>
      </div>

      <article className="onboarding-group">
        <span className="mini-label">{group.label}</span>
        <h3>{group.title}</h3>
        <p>{group.description}</p>
        <div className="onboarding-fields">{group.fields.map(renderField)}</div>
      </article>

      <div className="onboarding-footer">
        <span>{role ? 'Account role: ' + (role === 'editor' ? 'Audio Editor' : role.charAt(0).toUpperCase() + role.slice(1)) : 'Nightjar account'}</span>
        <div>
          {groupIndex > 0 && <button className="secondary-button" onClick={() => setGroupIndex((index) => index - 1)}>Back</button>}
          {groupIndex < questionGroups.length - 1
            ? <button className="primary-button" onClick={() => setGroupIndex((index) => index + 1)}>Continue <ArrowRight size={14}/></button>
            : <button className="primary-button" disabled={saving} onClick={() => void finish()}><Check size={14}/> {saving ? 'Saving…' : 'Finish setup'}</button>}
          <button className="ghost-button" disabled={saving} onClick={onSkip}>Skip for now</button>
        </div>
      </div>
    </section>
  </div>;
}
