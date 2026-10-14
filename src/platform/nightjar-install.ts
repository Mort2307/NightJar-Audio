/**
 * Capture Chromium's one-shot install prompt before the asynchronous
 * Firebase account check mounts the install invitation.
 * Browsers without beforeinstallprompt still receive device-specific guidance.
 */
export type NightjarBeforeInstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};
let deferred: NightjarBeforeInstallPrompt | null = null;
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferred = event as NightjarBeforeInstallPrompt;
    window.dispatchEvent(new Event('nightjar:install-ready'));
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    window.dispatchEvent(new Event('nightjar:install-ready'));
  });
}
export const nightjarInstaller = {
  available: () => deferred !== null,
  async prompt(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
    if (!deferred) return 'unavailable';
    const pending = deferred;
    deferred = null;
    // The call below must happen synchronously within the user's click.
    await pending.prompt();
    const choice = await pending.userChoice;
    window.dispatchEvent(new Event('nightjar:install-ready'));
    return choice.outcome;
  },
};
