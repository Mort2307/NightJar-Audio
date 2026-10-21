// One definition of the profile-completion badge and introductory-setup state.
// Legacy members may have completed every personal field before the separate
// onboardingComplete flag existed. That discrepancy must not trigger a blank form.
// This measures optional profile richness, NOT identity/age verification.
type PersonalProfile = Record<string, unknown> | null | undefined;
const hasText = (value: unknown) => typeof value === 'string' && value.trim().length > 0;
const hasSelections = (value: unknown) => Array.isArray(value) && value.length > 0;

export const profileCompletionPercentage = (profile: PersonalProfile): number => {
  const p = profile ?? {};
  const completed = [
    hasText(p.displayName),
    hasText(p.handle),
    hasText(p.headline),
    hasText(p.bio),
    hasText(p.welcomeMessage),
    hasSelections(p.favouriteTags),
    hasSelections(p.favouriteCategories),
    p.avatarStatus === 'approved' || hasText(p.avatarUrl),
  ].filter(Boolean).length;
  return Math.round((completed / 8) * 100);
};

export const isProfileSetupComplete = (profile: PersonalProfile): boolean =>
  profile?.onboardingComplete === true || profileCompletionPercentage(profile) === 100;
