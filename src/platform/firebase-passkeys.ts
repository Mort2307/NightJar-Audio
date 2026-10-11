import { getFunctions, httpsCallable } from 'firebase/functions';
import { signInWithCustomToken } from 'firebase/auth';
import { firebaseApp, firebaseAuth, type NightjarIdentity } from './firebase-auth';

const functions = getFunctions(firebaseApp, 'europe-west2');
type Challenge = { challengeId: string; options: Record<string, any> };
type PasskeyRecord = { id: string; label: string; createdAt: string | null; lastUsedAt: string | null };
const beginRegistration = httpsCallable<void, Challenge>(functions, 'beginPasskeyRegistration');
const finishRegistration = httpsCallable<{ challengeId: string; response: Record<string, unknown> }, { registered: boolean }>(functions, 'finishPasskeyRegistration');
const beginSignIn = httpsCallable<void, Challenge>(functions, 'beginPasskeySignIn');
const finishSignIn = httpsCallable<{ challengeId: string; response: Record<string, unknown> }, { token: string }>(functions, 'finishPasskeySignIn');
const listCall = httpsCallable<void, { passkeys: PasskeyRecord[] }>(functions, 'listMyPasskeys');
const removeCall = httpsCallable<{ id: string }, { removed: boolean }>(functions, 'removeMyPasskey');

const b64Bytes = (encoded: string): ArrayBuffer => {
  const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64 + '='.repeat((4 - base64.length % 4) % 4));
  return Uint8Array.from(raw, char => char.charCodeAt(0)).buffer;
};
const bytesB64 = (value: ArrayBuffer | null): string | null => {
  if (!value) return null;
  const raw = new Uint8Array(value);
  let binary = '';
  for (const n of raw) binary += String.fromCharCode(n);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

const serialize = (credential: PublicKeyCredential, registration: boolean): Record<string, unknown> => {
  // Modern browsers supply a native, standards-conformant WebAuthn JSON serializer.
  const native = credential as PublicKeyCredential & { toJSON?: () => Record<string, unknown> };
  if (typeof native.toJSON === 'function') return native.toJSON();
  const response = credential.response;
  const base = {
    id: credential.id,
    rawId: bytesB64(credential.rawId),
    type: credential.type,
    clientExtensionResults: credential.getClientExtensionResults(),
    authenticatorAttachment: credential.authenticatorAttachment,
  };
  if (registration) {
    const attestation = response as AuthenticatorAttestationResponse;
    return {
      ...base,
      response: {
        attestationObject: bytesB64(attestation.attestationObject),
        clientDataJSON: bytesB64(attestation.clientDataJSON),
        transports: attestation.getTransports?.() ?? [],
      },
    };
  }
  const assertion = response as AuthenticatorAssertionResponse;
  return {
    ...base,
    response: {
      authenticatorData: bytesB64(assertion.authenticatorData),
      clientDataJSON: bytesB64(assertion.clientDataJSON),
      signature: bytesB64(assertion.signature),
      userHandle: bytesB64(assertion.userHandle),
    },
  };
};

export const nightjarPasskeys = {
  supported() {
    return typeof window !== 'undefined' && window.isSecureContext &&
      'PublicKeyCredential' in window && typeof navigator.credentials?.get === 'function' && typeof navigator.credentials?.create === 'function';
  },

  async register() {
    if (!this.supported()) throw new Error('This browser or device cannot register passkeys. Use a secure Nightjar browser with Face ID, Touch ID, Windows Hello or a device PIN.');
    const { data } = await beginRegistration();
    const o = data.options;
    const publicKey = {
      ...o,
      challenge: b64Bytes(o.challenge),
      user: { ...o.user, id: b64Bytes(o.user.id) },
      excludeCredentials: (o.excludeCredentials ?? []).map((entry: any) => ({ ...entry, id: b64Bytes(entry.id) })),
    } as PublicKeyCredentialCreationOptions;
    const credential = await navigator.credentials.create({ publicKey });
    if (!credential || credential.type !== 'public-key') throw new Error('Passkey setup was cancelled.');
    return (await finishRegistration({ challengeId: data.challengeId, response: serialize(credential as PublicKeyCredential, true) })).data;
  },

  async signIn(): Promise<NightjarIdentity> {
    if (!this.supported()) throw new Error('Passkey sign-in is unavailable on this device. Use your email and password.');
    const { data } = await beginSignIn();
    const o = data.options;
    const publicKey = {
      ...o,
      challenge: b64Bytes(o.challenge),
      allowCredentials: (o.allowCredentials ?? []).map((entry: any) => ({ ...entry, id: b64Bytes(entry.id) })),
    } as PublicKeyCredentialRequestOptions;
    const credential = await navigator.credentials.get({ publicKey });
    if (!credential || credential.type !== 'public-key') throw new Error('Passkey sign-in was cancelled.');
    const reply = (await finishSignIn({ challengeId: data.challengeId, response: serialize(credential as PublicKeyCredential, false) })).data;
    const result = await signInWithCustomToken(firebaseAuth, reply.token);
    return {
      userId: result.user.uid,
      email: result.user.email,
      name: result.user.displayName,
      emailVerified: result.user.emailVerified,
    };
  },

  async list() { return (await listCall()).data.passkeys; },
  async remove(id: string) { return (await removeCall({ id })).data; },
};
