/** A share link always opens the selected public professional identity.
 * The Firebase UID is URL-encoded and no private account details are embedded.
 */
export type ShareableProfileRole = 'creator' | 'writer' | 'editor' | 'artist' | 'listener';
export const publicProfileUrl = (origin: string, userId: string, role: ShareableProfileRole) =>
  origin.replace(/\/$/, '') + '/people/' + encodeURIComponent(userId) + '?role=' + encodeURIComponent(role);

/** Use the native Android/iOS share sheet, otherwise provide a copyable link. */
export const shareNightjarProfile = async ({
  url, name, roleLabel, notify,
}: { url: string; name: string; roleLabel: string; notify: (message: string) => void }) => {
  try {
    const text = 'Discover ' + name + ' — ' + roleLabel + ' on Nightjar.';
    if (typeof navigator.share === 'function') {
      await navigator.share({ title: 'Nightjar · ' + name, text, url });
    } else if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text + ' ' + url);
      notify('Profile link copied — ready to share.');
    } else if (typeof window.prompt === 'function') {
      window.prompt('Copy this Nightjar public profile link:', url);
    } else {
      notify('Profile sharing is unavailable on this device.');
    }
  } catch (error) {
    if (error && typeof error === 'object' && 'name' in error && error.name === 'AbortError') return;
    notify('Unable to share this profile right now.');
  }
};
