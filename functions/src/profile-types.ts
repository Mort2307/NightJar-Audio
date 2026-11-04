export const NIGHTJAR_PROFILE_TYPES = ['listener', 'creator', 'writer', 'editor', 'artist'] as const;
export type NightjarProfileType = typeof NIGHTJAR_PROFILE_TYPES[number];
export type ProfileVisibility = 'public' | 'private' | 'unlisted';

export type ProfileTypeRecord = {
  type: NightjarProfileType;
  enabled: boolean;
  visibility: ProfileVisibility;
  schemaVersion: 1;
};

/**
 * Profile type settings control presentation only. Role-specific content remains
 * in profiles/{uid}.roleProfiles and professional permissions remain on accounts.
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
  schemaVersion: 1,
});

export const normaliseProfileTypeSettings = (input: unknown): Partial<Record<NightjarProfileType, ProfileTypeRecord>> => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const source = input as Record<string, unknown>;
  const result: Partial<Record<NightjarProfileType, ProfileTypeRecord>> = {};
  for (const type of NIGHTJAR_PROFILE_TYPES) {
    const raw = source[type];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    result[type] = normaliseProfileTypeRecord(type, raw as Partial<ProfileTypeRecord>);
  }
  return result;
};

export const resolveVisibleProfileTypes = (
  approvedRoles: readonly string[],
  settings: Partial<Record<NightjarProfileType, ProfileTypeRecord>>,
  hasExplicitSettings: boolean,
  options: { ownerPreview?: boolean; directory?: boolean } = {},
): NightjarProfileType[] => NIGHTJAR_PROFILE_TYPES.filter((type) => {
  if (type !== 'listener' && !approvedRoles.includes(type)) return false;
  if (options.ownerPreview) return true;
  if (!hasExplicitSettings) return true;
  const setting = settings[type];
  if (setting?.enabled !== true || setting.visibility === 'private') return false;
  if (options.directory && setting.visibility !== 'public') return false;
  return true;
});
