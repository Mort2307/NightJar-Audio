import { getMessaging, getToken, deleteToken, isSupported, onMessage, type MessagePayload } from 'firebase/messaging';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { firebaseApp, firebaseAuth } from './firebase-auth';

const functions = getFunctions(firebaseApp, 'europe-west2');

const registerCall = httpsCallable<{
  token: string;
  platform?: string;
  userAgent?: string;
  standalone?: boolean;
  timezone?: string;
}, { registered: boolean; deviceId: string }>(functions, 'registerPushDevice');

const unregisterCall = httpsCallable<{ token?: string; deviceId?: string }, { unregistered: boolean }>(functions, 'unregisterPushDevice');
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
const testCall = httpsCallable<{ deviceId: string }, { attempted: number; sent: number; failed: number }>(functions, 'sendTestPushNotification');

const vapidKey = String(import.meta.env.VITE_FIREBASE_VAPID_KEY ?? '').trim();

const getRegistration = async () => {
  if (!('serviceWorker' in navigator)) throw new Error('Push notifications are not supported by this browser.');
  // Register explicitly if the app has not installed its worker yet; avoid an
  // indefinitely pending Enable button if the worker cannot activate.
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const ready = navigator.serviceWorker.ready;
    const registration = navigator.serviceWorker.getRegistration('/').then(async existing =>
      existing || navigator.serviceWorker.register('/service-worker.js', { scope: '/' }));
    return await Promise.race([
      Promise.all([ready, registration]).then(([active]) => active),
      new Promise<ServiceWorkerRegistration>((_, reject) => {
        timeout = setTimeout(() => reject(new Error('Nightjar could not activate its notification service worker. Reload the app and try again.')), 12000);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
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

// A short device identifier, not a token, is kept on this browser after a
// successful explicit registration. Status checks NEVER re-subscribe to FCM.
const savedDeviceKey = () => {
  const uid = firebaseAuth.currentUser?.uid;
  return uid ? 'nightjar.push.device.v1.' + uid : null;
};
const rememberDevice = (id: string | null) => {
  try {
    const key = savedDeviceKey();
    if (!key) return;
    if (id) window.localStorage.setItem(key, id);
    else window.localStorage.removeItem(key);
  } catch { /* storage might be unavailable in private mode */ }
};
const savedDevice = () => {
  try {
    const key = savedDeviceKey();
    return key ? window.localStorage.getItem(key) : null;
  } catch { return null; }
};
export type PushSetupDiagnostics = {
  projectId: string;
  origin: string;
  https: boolean;
  vapidConfigured: boolean;
  vapidFormatOk: boolean;
  browserSupported: boolean;
  browserPermission: NotificationPermission | 'unsupported';
  workerScope: string | null;
  workerActive: boolean;
  advice: string[];
};

const pushSetupDiagnostics = async (): Promise<PushSetupDiagnostics> => {
  const supported = await isSupported().catch(() => false);
  const registration = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration('/').catch(() => undefined) : undefined;
  const https = window.location.protocol === 'https:' || window.location.hostname === 'localhost';
  const vapidFormatOk = /^[A-Za-z0-9_-]{80,110}$/.test(vapidKey);
  const advice: string[] = [];
  if (!https) advice.push('Open Nightjar using HTTPS.');
  if (!vapidKey) advice.push('Configure VITE_FIREBASE_VAPID_KEY using the public key from Firebase Console → Project settings → Cloud Messaging → Web Push certificates, then rebuild Hosting.');
  else if (!vapidFormatOk) advice.push('The configured VAPID public key does not look like a valid Web Push key. Compare it with the Firebase Console public key.');
  if (!supported) advice.push('Web Push is not supported or is blocked in this browser or device.');
  if (typeof Notification !== 'undefined' && Notification.permission === 'denied') advice.push('Allow Nightjar notifications in browser and phone settings before retrying.');
  if (!registration?.active) advice.push('The Nightjar service worker is not active. Reopen the latest deployed Nightjar site and refresh.');
  advice.push('For FCM HTTP 401: check Google Cloud → APIs & Services → Enabled APIs → Firebase Cloud Messaging Registration API for project nightjar-audio.');
  advice.push('Confirm Web API-key restrictions permit Firebase Installations and Firebase Cloud Messaging calls, and that the Web Push certificate belongs to nightjar-audio.');
  return {
    projectId: firebaseApp.options.projectId ?? 'unknown',
    origin: window.location.origin,
    https, vapidConfigured: Boolean(vapidKey), vapidFormatOk,
    browserSupported: supported,
    browserPermission: typeof Notification === 'undefined' ? 'unsupported' : Notification.permission,
    workerScope: registration?.scope ?? null, workerActive: Boolean(registration?.active),
    advice,
  };
};

const describeFcmError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error ?? 'Unknown messaging problem');
  if (/messaging\/token-subscribe-failed|missing required authentication credential|UNAUTHENTICATED|\b401\b/i.test(message)) {
    return new Error('Firebase Cloud Messaging rejected device registration (HTTP 401). Check the FCM Registration API, Web Push public key and Google Cloud API-key restrictions for project nightjar-audio. Nightjar remains usable without push.');
  }
  return error instanceof Error ? error : new Error('Nightjar could not register device notifications.');
};

export const nightjarPush = {
  configured() {
    return Boolean(vapidKey);
  },

  async diagnostics() {
    // Inspection only: never request permission or call getToken here.
    return pushSetupDiagnostics();
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
    if (!/^[A-Za-z0-9_-]{80,110}$/.test(vapidKey)) {
      throw new Error('The Web Push public key is invalid. Update VITE_FIREBASE_VAPID_KEY and redeploy Nightjar Hosting.');
    }
    if (!(await this.supported())) throw new Error('Push notifications are not supported by this browser.');
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') throw new Error(permission === 'denied'
      ? 'Push notifications are blocked in this browser or device settings.'
      : 'Push notification permission was not granted.');

    const registration = await getRegistration();
    const messaging = getMessaging(firebaseApp);
    try {
      const token = await getToken(messaging, {
        vapidKey,
        serviceWorkerRegistration: registration,
      });
      if (!token) throw new Error('Firebase did not return a push token for this device.');
      const registered = await registerCall({
        token,
        platform: platformLabel(),
        userAgent: navigator.userAgent,
        standalone: standalone(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      rememberDevice(registered.data.deviceId);
      return { registered: true, permission };
    } catch (error) {
      throw describeFcmError(error);
    }
  },

  async disable() {
    // Backend revocation works even if FCM is currently returning HTTP 401.
    const deviceId = savedDevice();
    if (deviceId) {
      await unregisterCall({ deviceId });
      rememberDevice(null);
    }
    if (await this.supported()) {
      try { await deleteToken(getMessaging(firebaseApp)); } catch { /* backend registration revoked */ }
    }
    return { disabled: Boolean(deviceId) };
  },

  async status() {
    const supported = await this.supported();
    const permission = this.permission();
    const backend = await statusCall();
    const deviceId = savedDevice();
    // Never start an FCM network registration from a passive status check.
    const thisDeviceRegistered = Boolean(deviceId && permission === 'granted'
      && backend.data.devices.some(device => device.id === deviceId && device.active));
    return {
      configured: Boolean(vapidKey),
      supported,
      browserPermission: permission,
      activeDeviceCount: backend.data.activeDeviceCount,
      thisDeviceRegistered,
      thisDeviceError: null,
      devices: backend.data.devices,
      standalone: standalone(),
    };
  },

  async test() {
    const deviceId = savedDevice();
    if (!deviceId || !/^[0-9a-f]{16}$/.test(deviceId)) {
      throw new Error('Enable push on this device before requesting a test notification.');
    }
    // Explicit opt-in only: a test targets THIS device rather than every
    // account session, which may include a shared or sleeping browser.
    return (await testCall({ deviceId })).data;
  },

  async listenForeground(callback: (payload: MessagePayload) => void) {
    if (!(await this.supported())) return () => {};
    const messaging = getMessaging(firebaseApp);
    return onMessage(messaging, callback);
  },
};
