import { getFunctions, httpsCallable } from 'firebase/functions';
import { signInWithCustomToken, signOut } from 'firebase/auth';
import { firebaseApp, firebaseAuth, type NightjarIdentity } from './firebase-auth';

const functions = getFunctions(firebaseApp, 'europe-west2');
type Challenge = { challengeId: string; options: Record<string, any> };
type PasskeyRecord = { id: string; label: string; createdAt: string | null; lastUsedAt: string | null };
const beginRegistration = httpsCallable<Record<string, never>, Challenge>(functions, 'beginPasskeyRegistration');
const finishRegistration = httpsCallable<{ challengeId: string; response: Record<string, unknown> }, { registered: boolean }>(functions, 'finishPasskeyRegistration');
const beginSignIn = httpsCallable<{ expectedUserId?: string }, Challenge>(functions, 'beginPasskeySignIn');
const finishSignIn = httpsCallable<{ challengeId: string; response: Record<string, unknown> }, { token: string }>(functions, 'finishPasskeySignIn');
const listCall = httpsCallable<void, { passkeys: PasskeyRecord[] }>(functions, 'listMyPasskeys');
const removeCall = httpsCallable<{ id: string }, { removed: boolean }>(functions, 'removeMyPasskey');

/** Only non-sensitive diagnostics are shown to the member. Never include a WebAuthn credential, challenge, ID token or raw response. */
export type NightjarPasskeyStep = 'REGISTER_START' | 'REGISTER_DEVICE' | 'REGISTER_VERIFY'
  | 'LOGIN_START' | 'LOGIN_DEVICE' | 'LOGIN_VERIFY' | 'LOGIN_SESSION';
export class NightjarPasskeyError extends Error {
  readonly step: NightjarPasskeyStep;
  readonly code: string;
  constructor(step: NightjarPasskeyStep, code: string, message: string) {
    super(message);
    this.name = 'NightjarPasskeyError';
    this.step = step;
    this.code = code;
  }
}

const passkeyFailure = (step: NightjarPasskeyStep, error: unknown): NightjarPasskeyError => {
  if (error instanceof NightjarPasskeyError) return error;
  const input = error as { code?: unknown; name?: unknown; message?: unknown } | null;
  const code = typeof input?.code === 'string' ? input.code : typeof input?.name === 'string' ? input.name : 'UNKNOWN';
  const message = typeof input?.message === 'string' ? input.message : '';
  if (code === 'NotAllowedError' || code === 'AbortError') {
    return new NightjarPasskeyError(step, code, 'The device cancelled or timed out. Tap Unlock with biometrics to retry, or use your password.');
  }
  if (code === 'SecurityError' || code === 'NotSupportedError') {
    return new NightjarPasskeyError(step, code, 'This Nightjar app address or browser does not support this passkey. Sign in with your password and register a passkey from this exact app address.');
  }
  if (code === 'functions/invalid-argument' || /Bad Request\b/i.test(message)) {
    return new NightjarPasskeyError(step, 'CALLABLE_REQUEST',
      'Nightjar received an invalid Firebase callable request. Use the Nightjar app rather than opening the Cloud Function URL. If this occurred inside the app, update both Hosting and passkey Functions.');
  }
  if (code === 'functions/failed-precondition' || code === 'functions/permission-denied') {
    // Firebase backend includes access/origin instructions. Show these rather
    // than replacing them with the unhelpful "could not verify" blanket.
    return new NightjarPasskeyError(step, code, message.replace(/^FirebaseError:\s*/i, '').slice(0, 230) || 'Nightjar rejected the passkey for this account or app address.');
  }
  if (code === 'functions/resource-exhausted') {
    return new NightjarPasskeyError(step, code, 'Too many sign-in attempts. Try again later, or sign in using your password.');
  }
  if (code === 'functions/unavailable' || code === 'functions/deadline-exceeded') {
    if (step === 'LOGIN_VERIFY' && /^Your passkey verified, but Nightjar/.test(message)) {
      return new NightjarPasskeyError(step, code, message.slice(0, 280));
    }
    return new NightjarPasskeyError(step, code, 'Cannot reach the Nightjar sign-in service. Check your connection and retry.');
  }
  if (step === 'LOGIN_VERIFY' && code === 'functions/internal') {
    return new NightjarPasskeyError(step, code,
      'Nightjar could not finish server-side passkey sign-in. Your saved passkey was found, but the server failed. Use your password until the Nightjar server issue is repaired.');
  }
  if (step === 'LOGIN_DEVICE' && code === 'NotReadableError') {
    return new NightjarPasskeyError(step, code, 'Your device could not access its passkey authenticator. Try the device screen lock or use a password.');
  }
  return new NightjarPasskeyError(step, code,
    /^(Passkey|That passkey|This browser|Device|Unable|Nightjar|For security|Account)/.test(message)
      ? message.slice(0, 230)
      : 'Passkey verification failed at this step. You can retry or use your password.');
};

export const passkeyDiagnostic = (error: unknown): string => {
  if (error instanceof NightjarPasskeyError) return error.step + ' / ' + error.code.replace(/[^A-Za-z0-9_/-]/g, '').slice(0, 64);
  return 'UNKNOWN';
};


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
    if (!this.supported()) throw new NightjarPasskeyError('REGISTER_DEVICE', 'UNSUPPORTED', 'This browser or device cannot register passkeys. Use a secure Nightjar browser with Face ID, Touch ID, Windows Hello or a device PIN.');
    let data: Challenge;
    try { data = (await beginRegistration({})).data; }
    catch (error) { throw passkeyFailure('REGISTER_START', error); }
    let credential: Credential | null;
    try {
      const o = data.options;
      const publicKey = {
        ...o,
        challenge: b64Bytes(o.challenge),
        user: { ...o.user, id: b64Bytes(o.user.id) },
        excludeCredentials: (o.excludeCredentials ?? []).map((entry: any) => ({ ...entry, id: b64Bytes(entry.id) })),
      } as PublicKeyCredentialCreationOptions;
      credential = await navigator.credentials.create({ publicKey });
    } catch (error) { throw passkeyFailure('REGISTER_DEVICE', error); }
    if (!credential || credential.type !== 'public-key') throw new NightjarPasskeyError('REGISTER_DEVICE', 'CANCELLED', 'Passkey setup was cancelled.');
    try { return (await finishRegistration({ challengeId: data.challengeId, response: serialize(credential as PublicKeyCredential, true) })).data; }
    catch (error) { throw passkeyFailure('REGISTER_VERIFY', error); }
  },

  async signIn(expectedUserId?: string, signal?: AbortSignal, onProgress?: (step: NightjarPasskeyStep) => void): Promise<NightjarIdentity> {
    if (!this.supported()) throw new NightjarPasskeyError('LOGIN_DEVICE', 'UNSUPPORTED', 'Passkey sign-in is unavailable on this device. Use your email and password.');
    onProgress?.('LOGIN_START');
    let data: Challenge;
    try { data = (await beginSignIn(expectedUserId ? { expectedUserId } : {})).data; }
    catch (error) { throw passkeyFailure('LOGIN_START', error); }
    onProgress?.('LOGIN_DEVICE');
    let credential: Credential | null;
    try {
      const o = data.options;
      const publicKey = {
        ...o,
        challenge: b64Bytes(o.challenge),
        allowCredentials: (o.allowCredentials ?? []).map((entry: any) => ({ ...entry, id: b64Bytes(entry.id) })),
      } as PublicKeyCredentialRequestOptions;
      credential = await navigator.credentials.get({ publicKey, signal });
    } catch (error) { throw passkeyFailure('LOGIN_DEVICE', error); }
    if (!credential || credential.type !== 'public-key' || signal?.aborted) {
      throw new NightjarPasskeyError('LOGIN_DEVICE', 'CANCELLED', 'Passkey sign-in was cancelled.');
    }
    onProgress?.('LOGIN_VERIFY');
    let reply: { token: string };
    try { reply = (await finishSignIn({ challengeId: data.challengeId, response: serialize(credential as PublicKeyCredential, false) })).data; }
    catch (error) { throw passkeyFailure('LOGIN_VERIFY', error); }
    if (signal?.aborted) throw new NightjarPasskeyError('LOGIN_DEVICE', 'CANCELLED', 'Passkey sign-in was cancelled.');
    onProgress?.('LOGIN_SESSION');
    let result;
    try { result = await signInWithCustomToken(firebaseAuth, reply.token); }
    catch (error) { throw passkeyFailure('LOGIN_SESSION', error); }
    if (signal?.aborted || (expectedUserId && result.user.uid !== expectedUserId)) {
      await signOut(firebaseAuth);
      throw new NightjarPasskeyError('LOGIN_SESSION', signal?.aborted ? 'CANCELLED' : 'ACCOUNT_MISMATCH',
        signal?.aborted
          ? 'Passkey sign-in was cancelled.'
          : 'That passkey belongs to a different Nightjar account. Use the registered passkey or sign in with your password.');
    }
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
