import { getFunctions, httpsCallable } from 'firebase/functions';
import { firebaseApp } from './firebase-auth';

const functions = getFunctions(firebaseApp, 'europe-west2');

export type TranscriptPreferenceMode = 'on_demand' | 'always_open';
export type TranscriptTextSize = 'standard' | 'large' | 'extra_large';

export type AccessibilityPreferences = {
  transcriptMode: TranscriptPreferenceMode;
  transcriptFollowPlayback: boolean;
  transcriptTextSize: TranscriptTextSize;
  transcriptHighContrast: boolean;
  theme?: import('./nightjar-theme').NightjarTheme;
};

const getPreferencesCall = httpsCallable<void, { preferences: AccessibilityPreferences }>(
  functions,
  'getAccessibilityPreferences',
);
const savePreferencesCall = httpsCallable<AccessibilityPreferences, { preferences: AccessibilityPreferences }>(
  functions,
  'saveAccessibilityPreferences',
);

export const DEFAULT_ACCESSIBILITY_PREFERENCES: AccessibilityPreferences = {
  transcriptMode: 'on_demand',
  transcriptFollowPlayback: true,
  transcriptTextSize: 'standard',
  transcriptHighContrast: false,
  theme: 'bronze',
};

export const nightjarAccessibility = {
  async get() {
    return (await getPreferencesCall()).data.preferences;
  },

  async save(preferences: AccessibilityPreferences) {
    return (await savePreferencesCall(preferences)).data.preferences;
  },
};
