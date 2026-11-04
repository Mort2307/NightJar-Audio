export const NIGHTJAR_PROFILE_TYPES = ['listener', 'creator', 'writer', 'editor', 'artist'] as const;
export type NightjarProfileType = typeof NIGHTJAR_PROFILE_TYPES[number];
export type ProfileVisibility = 'public' | 'private' | 'unlisted';

export type ProfileTypeRecord = {
  type: NightjarProfileType;
  enabled: boolean;
  visibility: ProfileVisibility;
  headline: string;
  bio: string;
  specialties: string[];
  portfolioItemIds: string[];
  schemaVersion: 1;
};

/**
 * Profile presentation is deliberately separate from professional permissions.
 * This module validates profile metadata only; it never grants account roles.
 */
export const isNightjarProfileType = (value: unknown): value is NightjarProfileType =>
  typeof value === 'string' && (NIGHTJAR_PROFILE_TYPES as readonly string[]).includes(value);

export const normaliseProfileTypeRecord = (
  type: NightjarProfileType,
  input: Partial<ProfileTypeRecord>,
): ProfileTypeRecord => ({
  type,
  enabled: input.enabled === true,
  visibility: input.visibility === 'public' || input.visibility === 'unlisted' ? input.visibility : 'private',
  headline: String(input.headline ?? '').trim().slice(0, 140),
  bio: String(input.bio ?? '').trim().slice(0, 1200),
  specialties: Array.from(new Set((Array.isArray(input.specialties) ? input.specialties : [])
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim().slice(0, 60))
    .filter(Boolean))).slice(0, 30),
  portfolioItemIds: Array.from(new Set((Array.isArray(input.portfolioItemIds) ? input.portfolioItemIds : [])
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean))).slice(0, 30),
  schemaVersion: 1,
});
