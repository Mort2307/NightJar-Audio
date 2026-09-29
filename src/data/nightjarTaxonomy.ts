export type ProfileRoleKey = 'admin' | 'creator' | 'listener' | 'writer' | 'editor';

export const PROFILE_TAG_OPTIONS = [
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

export const PROFILE_TROPE_OPTIONS = [
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

export const PROFILE_CATEGORY_OPTIONS = [
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

export const ROLE_FOCUS_OPTIONS: Record<ProfileRoleKey, readonly string[]> = {
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

export type RoleProfileConfig = {
  title: string;
  description: string;
  tagLabel: string;
  focusLabel: string;
  specialtiesLabel: string;
  specialtiesOptions: readonly string[];
  secondaryLabel: string;
  secondaryOptions: readonly string[];
  availabilityLabel: string | null;
  availabilityOptions: readonly string[];
  detailOneLabel: string;
  detailOnePlaceholder: string;
  detailTwoLabel: string;
  detailTwoPlaceholder: string;
};

export const ROLE_PROFILE_CONFIG: Record<ProfileRoleKey, RoleProfileConfig> = {
  listener: {
    title: 'Listener identity',
    description: 'Make discovery and community profiles reflect how you actually listen, without pretending listening habits define who you are.',
    tagLabel: 'Favourite tags',
    focusLabel: 'Listener focus',
    specialtiesLabel: 'Listening moods',
    specialtiesOptions: ['Late-night', 'Atmospheric', 'Comfort', 'Story-first', 'Character-first', 'Relaxing', 'Intense', 'Playful', 'Romantic', 'Experimental'],
    secondaryLabel: 'Discovery style',
    secondaryOptions: ['New releases', 'Followed creators', 'Hidden gems', 'Short listens', 'Long-form stories', 'Series', 'Community recommendations', 'Surprise me'],
    availabilityLabel: null,
    availabilityOptions: [],
    detailOneLabel: 'What I come to Nightjar for',
    detailOnePlaceholder: 'Optional note about the kind of listening experience you enjoy.',
    detailTwoLabel: 'Community note',
    detailTwoPlaceholder: 'Optional message about recommendations, follows or how you like to participate.',
  },
  creator: {
    title: 'Creator identity',
    description: 'Show listeners and collaborators what you perform, how you work and what kind of productions you want to make.',
    tagLabel: 'Creator tags',
    focusLabel: 'Creator focus',
    specialtiesLabel: 'Performance specialties',
    specialtiesOptions: ['Character roleplay', 'Narration', 'Dialogue performance', 'Whisper / soft-spoken', 'ASMR performance', 'Improvisation', 'Multi-character performance', 'Dramatic performance', 'Comedy', 'Guided fantasy', 'Audio drama'],
    secondaryLabel: 'Voice & production strengths',
    secondaryOptions: ['Binaural staging', 'Close-mic performance', 'Sound design', 'Self-direction', 'Live direction', 'Long-form recording', 'Short-form recording', 'Series work', 'Remote collaboration'],
    availabilityLabel: 'Collaboration availability',
    availabilityOptions: ['Open to collaborations', 'Selective / case-by-case', 'Booked but open to enquiries', 'Not currently available'],
    detailOneLabel: 'Voice & performance notes',
    detailOnePlaceholder: 'Accents, vocal range, recurring character styles, performance approach or anything collaborators should know.',
    detailTwoLabel: 'Recording / production setup',
    detailTwoPlaceholder: 'Optional studio, microphone, editing or production notes. Do not post private contact details.',
  },
  writer: {
    title: 'Writer identity',
    description: 'Present your writing strengths, preferred formats and collaboration terms without exposing protected manuscript content.',
    tagLabel: 'Writing tags',
    focusLabel: 'Writer focus',
    specialtiesLabel: 'Writing specialties',
    specialtiesOptions: ['Romance', 'Erotica', 'Dialogue', 'Character development', 'Worldbuilding', 'Comedy', 'Suspense', 'Fantasy', 'Sci-fi', 'Paranormal', 'Dark romance', 'Aftercare / comfort', 'Series development'],
    secondaryLabel: 'Script formats',
    secondaryOptions: ['Single-voice script', 'Multi-voice script', 'Audio drama', 'Roleplay', 'Narrative fiction', 'Series / episodic', 'Short-form', 'Long-form', 'Commissioned brief', 'Collaborative rewrite'],
    availabilityLabel: 'Commission availability',
    availabilityOptions: ['Open to commissions', 'Selective / case-by-case', 'Existing collaborators only', 'Not currently taking commissions'],
    detailOneLabel: 'Writing style & tone',
    detailOnePlaceholder: 'Describe your voice, strengths, preferred themes or the sort of briefs you enjoy.',
    detailTwoLabel: 'Licensing & collaboration note',
    detailTwoPlaceholder: 'Public-facing note about commissions, licensing preferences or collaboration. Keep private deal terms inside protected workflows.',
  },
  editor: {
    title: 'Audio Editor identity',
    description: 'Make your production skills visible while keeping private editorial assignments and client material protected.',
    tagLabel: 'Production tags',
    focusLabel: 'Editor focus',
    specialtiesLabel: 'Editing services',
    specialtiesOptions: ['Dialogue editing', 'Noise cleanup', 'Comping', 'Mixing', 'Mastering', 'Sound design', 'Binaural production', 'Loudness delivery', 'Quality control', 'Revision passes', 'Audio drama assembly'],
    secondaryLabel: 'Production strengths',
    secondaryOptions: ['Fast turnaround', 'Long-form projects', 'Series consistency', 'Remote handoff', 'Detailed notes', 'Creator coaching', 'Restoration', 'Music / ambience integration', 'Metadata delivery'],
    availabilityLabel: 'Booking availability',
    availabilityOptions: ['Open for bookings', 'Limited availability', 'Booked but taking enquiries', 'Not currently available'],
    detailOneLabel: 'Workflow & handoff',
    detailOnePlaceholder: 'How you prefer to receive files, notes and revisions. Do not expose private project information.',
    detailTwoLabel: 'Typical turnaround / production note',
    detailTwoPlaceholder: 'Optional public estimate or note about the kind of projects you are best suited to.',
  },
  admin: {
    title: 'Administrator identity',
    description: 'Keep an administrator profile operational and clear. Administrator profiles remain non-public by design.',
    tagLabel: 'Platform tags',
    focusLabel: 'Administrator focus',
    specialtiesLabel: 'Responsibilities',
    specialtiesOptions: ['Platform operations', 'Community safety', 'Content moderation', 'Creator support', 'Writer support', 'Editorial operations', 'Commercial operations', 'Technical operations'],
    secondaryLabel: 'Operational areas',
    secondaryOptions: ['Account support', 'Image moderation', 'Reports', 'Subscriptions', 'Creator approvals', 'Editorial assignments', 'Security review', 'Testing'],
    availabilityLabel: null,
    availabilityOptions: [],
    detailOneLabel: 'Team / role note',
    detailOnePlaceholder: 'Optional internal-facing summary of your administrator responsibilities.',
    detailTwoLabel: 'Support note',
    detailTwoPlaceholder: 'Optional operational note for the administrator profile.',
  },
};
