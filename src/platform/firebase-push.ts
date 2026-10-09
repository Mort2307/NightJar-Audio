import { getMessaging, getToken, deleteToken, isSupported, onMessage, type MessagePayload } from 'firebase/messaging';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { firebaseApp } from './firebase-auth';

const functions = getFunctions(firebaseApp, 'europe-west2');

const registerCall = httpsCallable<{
  token: string;
  platform?: string;
  userAgent?: string;
  standalone?: boolean;
  timezone?: string;
}, { registered: boolean; deviceId: string }>(functions, 'registerPushDevice');

const unregisterCall = httpsCallable<{ token: string }, { unregistered: boolean }>(functions, 'unregisterPushDevice');
const statusCall = httpsCallable<void, {
  activeDeviceCount: number;
  devices: Array<{
    id: string;
    active: boolean;
    platform: string;
    standalone: boolean;
    lastRegisteredAt: string | null;
    lastDeliveredAt: string | null;
    lastFailedAt: string | null;
    lastError: string | null;
  }>;
}>(functions, 'myPushNotificationStatus');
const testCall = httpsCallable<void, { attempted: number; sent: number; failed: number }>(functions, 'sendTestPushNotification');

const vapidKey = String(import.meta.env.VITE_FIREBASE_VAPID_KEY ?? '').trim();

const getRegistration = async () => {
  if (!('serviceWorker' in navigator)) throw new Error('Push notifications are not supported by this browser.');
  return navigator.serviceWorker.ready;
};

const platformLabel = () => {
  const ua = navigator.userAgent;
  if (/android/i.test(ua)) return 'android-web';
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios-web';
  return 'desktop-web';
};

const standalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches === true
  || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);

const deviceTokenId = async (token: string) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 16);
};

export const nightjarPush = {
  configured() {
    return Boolean(vapidKey);
  },

  permission() {
    return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
  },

  async supported() {
    return typeof Notification !== 'undefined'
      && 'serviceWorker' in navigator
      && await isSupported();
  },

  async enable() {
    if (!vapidKey) {
      throw new Error('Nightjar push is not configured yet. Add the Firebase Web Push VAPID public key.');
    }
    if (!(await this.supported())) throw new Error('Push notifications are not supported by this browser.');
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') throw new Error(permission === 'denied'
      ? 'Push notifications are blocked in this browser or device settings.'
      : 'Push notification permission was not granted.');

    const registration = await getRegistration();
    const messaging = getMessaging(firebaseApp);
    const token = await getToken(messaging, {
      vapidKey,
      serviceWorkerRegistration: registration,
    });
    if (!token) throw new Error('Firebase did not return a push token for this device.');

    await registerCall({
      token,
      platform: platformLabel(),
      userAgent: navigator.userAgent,
      standalone: standalone(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    return { token, permission };
  },

  async disable() {
    if (!(await this.supported())) return { disabled: false };
    const registration = await getRegistration();
    const messaging = getMessaging(firebaseApp);
    let token = '';
    if (vapidKey) {
      try {
        token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: registration });
      } catch {
        token = '';
      }
    }
    if (token) await unregisterCall({ token });
    try { await deleteToken(messaging); } catch { /* backend token is already disabled */ }
    return { disabled: true };
  },

  async status() {
    const supported = await this.supported();
    const permission = this.permission();
    const backend = await statusCall();
    let thisDeviceRegistered = false;
    let thisDeviceError: string | null = null;
    // Backend device count alone cannot tell if this particular phone is registered.
    // Read the existing browser push token without requesting permission.
    if (supported && vapidKey && permission === 'granted') {
      try {
        const registration = await getRegistration();
        const token = await getToken(getMessaging(firebaseApp), {
          vapidKey, serviceWorkerRegistration: registration,
        });
        if (token) {
          const id = await deviceTokenId(token);
          thisDeviceRegistered = backend.data.devices.some(device => device.id === id && device.active);
        }
      } catch (error) {
        thisDeviceError = error instanceof Error ? error.message.slice(0, 200) : 'Device token lookup failed.';
      }
    }
    return {
      configured: Boolean(vapidKey),
      supported,
      browserPermission: permission,
      activeDeviceCount: backend.data.activeDeviceCount,
      thisDeviceRegistered,
      thisDeviceError,
      devices: backend.data.devices,
      standalone: standalone(),
    };
  },

  async test() {
    return (await testCall()).data;
  },

  async listenForeground(callback: (payload: MessagePayload) => void) {
    if (!(await this.supported())) return () => {};
    const messaging = getMessaging(firebaseApp);
    return onMessage(messaging, callback);
  },
};
