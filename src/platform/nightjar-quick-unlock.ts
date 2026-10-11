/**
 * Per-installation, opt-in quick unlock. This device preference never grants
 * Firebase permission: every launch unlock performs a real WebAuthn assertion.
 */
export type NightjarQuickUnlockPreference = { userId: string; enabled: true };
const preferenceKey = 'nightjar.passkeys.quick-unlock.v1';
const sessionKey = 'nightjar.passkeys.unlocked-session.v1';
const graceMillis = 10 * 60 * 1000;

export const nightjarQuickUnlock = {
  preference(): NightjarQuickUnlockPreference | null {
    try {
      const value: unknown = JSON.parse(localStorage.getItem(preferenceKey) || 'null');
      if (value && typeof value === 'object' && 'enabled' in value && 'userId' in value) {
        const entry = value as Record<string, unknown>;
        if (entry.enabled === true && typeof entry.userId === 'string'
            && /^[a-zA-Z0-9_-]{6,160}$/.test(entry.userId)) {
          return { enabled: true, userId: entry.userId };
        }
      }
    } catch { /* private browsing or blocked storage: disable this optional feature */ }
    return null;
  },

  enabledFor(userId: string) { return this.preference()?.userId === userId; },

  enable(userId: string): boolean {
    try {
      if (!/^[a-zA-Z0-9_-]{6,160}$/.test(userId)) return false;
      localStorage.setItem(preferenceKey, JSON.stringify({ enabled:true, userId }));
      this.markUnlocked(userId); // already authenticated when enabling from Settings.
      return true;
    } catch { return false; }
  },

  disable(userId: string) {
    try {
      if (this.preference()?.userId === userId) localStorage.removeItem(preferenceKey);
      sessionStorage.removeItem(sessionKey);
    } catch { /* best effort */ }
  },

  markUnlocked(userId: string) {
    try { sessionStorage.setItem(sessionKey, JSON.stringify({ userId, expiresAt: Date.now() + graceMillis })); }
    catch { /* fallback is to request the passkey again */ }
  },

  unlockedRecently(userId: string): boolean {
    try {
      const value = JSON.parse(sessionStorage.getItem(sessionKey) || 'null') as { userId?: string; expiresAt?: number } | null;
      return value?.userId === userId && Number(value?.expiresAt) > Date.now();
    } catch { return false; }
  },

  lock() {
    try { sessionStorage.removeItem(sessionKey); } catch { /* no cache to invalidate */ }
  },
};
