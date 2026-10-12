/**
 * Per-installation, opt-in quick unlock. This device preference never grants
 * Firebase permission: every launch unlock performs a real WebAuthn assertion.
 */
export type NightjarQuickUnlockPreference = { userId: string; enabled: true };
const preferenceKey = 'nightjar.passkeys.quick-unlock.v1';
const sessionKey = 'nightjar.passkeys.unlocked-session.v1';
// Redirect grace is deliberately brief; the separate same-tab session guard
// avoids re-prompts on refresh after a real password or passkey sign-in.
const graceMillis = 45 * 1000;
const continuityKey = 'nightjar.passkeys.continuity.v1';
const continuityMillis = 4 * 60 * 60_000;
const backgroundLockMillis = 2 * 60_000;
type Continuity = { userId:string; expiresAt:number; backgroundAt:number | null };
const readContinuity = ():Continuity|null => {
  try {
    const value:unknown = JSON.parse(sessionStorage.getItem(continuityKey) || 'null');
    if (!value || typeof value !== 'object') return null;
    const entry = value as Record<string, unknown>;
    if (typeof entry.userId !== 'string' || !/^[a-zA-Z0-9_-]{6,160}$/.test(entry.userId)
        || typeof entry.expiresAt !== 'number'
        || (entry.backgroundAt !== null && typeof entry.backgroundAt !== 'number')) return null;
    return entry as Continuity;
  } catch { return null; }
};
const writeContinuity = (value:Continuity) => {
  try { sessionStorage.setItem(continuityKey,JSON.stringify(value)); } catch { /* secure fallback asks for the passkey */ }
};

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
      // Enabling should NOT defer the next launch prompt via redirect grace:
      // users often close and immediately reopen the app to test biometrics.
      this.lock();
      return true;
    } catch { return false; }
  },

  disable(userId: string) {
    try {
      if (this.preference()?.userId === userId) localStorage.removeItem(preferenceKey);
      this.lock();
    } catch { /* best effort */ }
  },

  markUnlocked(userId: string) {
    if (!/^[a-zA-Z0-9_-]{6,160}$/.test(userId)) return;
    try { sessionStorage.setItem(sessionKey, JSON.stringify({ userId, expiresAt: Date.now() + graceMillis })); }
    catch { /* fallback is to request the passkey again */ }
    // Only a successful Firebase/password or server-verified WebAuthn sign-in
    // can call this. The record by itself is never authentication.
    writeContinuity({ userId, expiresAt:Date.now() + continuityMillis, backgroundAt:null });
  },
  canRestoreSession(userId:string):boolean {
    const value=readContinuity();
    if (!value || value.userId !== userId || value.expiresAt <= Date.now()) return false;
    return value.backgroundAt === null || Date.now()-value.backgroundAt < backgroundLockMillis;
  },
  markBackground(userId:string) {
    if (!this.canRestoreSession(userId)) return;
    const value=readContinuity();
    if (value) writeContinuity({...value,backgroundAt:Date.now()});
  },
  markForeground(userId:string) {
    if (!this.canRestoreSession(userId)) { this.lock(); return; }
    const value=readContinuity();
    if (value) writeContinuity({...value,backgroundAt:null});
  },
  consumeRedirect() {
    try { sessionStorage.removeItem(sessionKey); } catch { /* optional */ }
  },

  unlockedRecently(userId: string): boolean {
    try {
      const value = JSON.parse(sessionStorage.getItem(sessionKey) || 'null') as { userId?: string; expiresAt?: number } | null;
      return value?.userId === userId && Number(value?.expiresAt) > Date.now();
    } catch { return false; }
  },

  lock() {
    try {
      sessionStorage.removeItem(sessionKey);
      sessionStorage.removeItem(continuityKey);
    } catch { /* no cache to invalidate */ }
  },
};
