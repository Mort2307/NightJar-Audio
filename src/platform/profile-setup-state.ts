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

// A paused first-run setup is kept off the public directory until published.
// Its temporary private flag must not override the member's saved draft choice.
// Explicit private selections remain private, including after setup completes.
export const recoverPendingProfileDiscoverability = (profile: PersonalProfile): boolean => {
  if (!isProfileSetupComplete(profile)) {
    const draft = profile?.onboardingDraft;
    if (draft && typeof draft === 'object' && !Array.isArray(draft)) {
      const chosen = (draft as Record<string, unknown>).publicProfile;
      if (typeof chosen === 'boolean') return chosen;
    }
  }
  return profile?.publicProfile !== false;
};
