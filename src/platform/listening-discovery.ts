import type { ListeningBoundaries } from './firebase-experience';

export const MOOD_FILTERS = [
  { id: 'all', label: 'All moods', keywords: [] },
  { id: 'comforting', label: 'Comforting', keywords: ['comfort','cosy','cozy','soft','soothing','gentle'] },
  { id: 'slowburn', label: 'Slow Burn', keywords: ['slow burn','slowburn','tension','yearning'] },
  { id: 'mysterious', label: 'Mysterious', keywords: ['mystery','mysterious','suspense','noir'] },
  { id: 'intense', label: 'Intense', keywords: ['intense','passionate','dramatic','high-stakes'] },
  { id: 'fantasy', label: 'Fantasy', keywords: ['fantasy','magic','paranormal','myth'] },
  { id: 'short', label: 'Short & Sweet', keywords: ['short','sweet','mini','bite-size'] },
] as const;

export type MoodFilter = typeof MOOD_FILTERS[number]['id'];
export type DiscoveryRelease = {
  title?: string; descriptor?: string; description?: string;
  genre?: string; mood?: string; category?: string; duration?: string;
  tags?: string[]; tropes?: string[]; contentRating?: string;
};

export const DEFAULT_LISTENING_BOUNDARIES: ListeningBoundaries = {
  excludedRatings: [],
  hiddenTerms: [],
};

export const hiddenByBoundaries = (release: DiscoveryRelease, boundaries: ListeningBoundaries) => {
  if (boundaries.excludedRatings.includes(String(release.contentRating ?? '').toLowerCase())) return true;
  const metadata = [
    release.descriptor, release.description, release.genre, release.mood,
    release.category, ...(release.tags ?? []), ...(release.tropes ?? []),
  ].join(' ').toLowerCase();
  // Only metadata is matched; this is not a guarantee about unlabelled content.
  return boundaries.hiddenTerms.some((term) => term.trim().length > 0
    && metadata.includes(term.toLowerCase().trim()));
};

export const matchesListeningMood = (release: DiscoveryRelease, mood: MoodFilter) => {
  if (mood === 'all') return true;
  if (mood === 'short' && Number.parseFloat(String(release.duration ?? '')) > 0
    && Number.parseFloat(String(release.duration)) < 10) return true;
  const option = MOOD_FILTERS.find((entry) => entry.id === mood);
  if (!option) return true;
  const metadata = [
    release.mood, release.genre, release.category, ...(release.tags ?? []),
    ...(release.tropes ?? []), release.descriptor, release.description,
  ].filter(Boolean).join(' ').toLowerCase();
  return option.keywords.some((keyword) => metadata.includes(keyword));
};
