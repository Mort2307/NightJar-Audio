import { initializeApp, getApps } from 'firebase/app';
import { nightjarQuickUnlock } from './nightjar-quick-unlock';
import {
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  reauthenticateWithCredential,
  EmailAuthProvider,
  sendEmailVerification,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
  type User,
} from 'firebase/auth';

const firebaseConfig = {
  apiKey: 'AIzaSyBHgKqK9SRYJoWWrKH0DeMX4I35AVIoMJs',
  authDomain: 'nightjar-audio.firebaseapp.com',
  projectId: 'nightjar-audio',
  storageBucket: 'nightjar-audio.firebasestorage.app',
  messagingSenderId: '981039114349',
  appId: '1:981039114349:web:80defbb59c7a56889af764',
  measurementId: 'G-QRMGT02JRD',
};

export const firebaseApp = getApps()[0] ?? initializeApp(firebaseConfig);
export const firebaseAuth = getAuth(firebaseApp);
void setPersistence(firebaseAuth, browserLocalPersistence);

export type NightjarIdentity = {
  userId: string;
  email: string | null;
  name: string | null;
  emailVerified: boolean;
};

const mapUser = (user: User): NightjarIdentity => ({
  userId: user.uid,
  email: user.email,
  name: user.displayName,
  emailVerified: user.emailVerified,
});

export const nightjarAuth = {
  observe(callback: (identity: NightjarIdentity | null) => void) {
    return onAuthStateChanged(firebaseAuth, (user) => callback(user ? mapUser(user) : null));
  },

  current(): NightjarIdentity | null {
    return firebaseAuth.currentUser ? mapUser(firebaseAuth.currentUser) : null;
  },

  async register(email: string, password: string) {
    const credential = await createUserWithEmailAndPassword(firebaseAuth, email.trim(), password);
    let verificationSent = true;
    try {
      await sendEmailVerification(credential.user);
    } catch {
      verificationSent = false;
    }
    return { identity: mapUser(credential.user), verificationSent };
  },

  async signIn(email: string, password: string) {
    const credential = await signInWithEmailAndPassword(firebaseAuth, email.trim(), password);
    return mapUser(credential.user);
  },

  async signOut() {
    // Explicit sign-out and cold-launch relock must invalidate refresh grants.
    nightjarQuickUnlock.lock();
    await signOut(firebaseAuth);
  },

  async resendVerification() {
    if (!firebaseAuth.currentUser) throw new Error('auth/no-current-user');
    await sendEmailVerification(firebaseAuth.currentUser);
  },

  async reloadIdentity() {
    if (!firebaseAuth.currentUser) return null;
    await firebaseAuth.currentUser.reload();
    if (firebaseAuth.currentUser.emailVerified) {
      await firebaseAuth.currentUser.getIdToken(true);
    }
    return mapUser(firebaseAuth.currentUser);
  },

  async resetPassword(email: string) {
    await sendPasswordResetEmail(firebaseAuth, email.trim());
  },

  async reauthenticate(password: string) {
    const user = firebaseAuth.currentUser;
    if (!user?.email) throw new Error('Sign in with email and password before managing passkeys.');
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
    await user.getIdToken(true);
  },

  async changePassword(currentPassword: string, nextPassword: string) {
    const user = firebaseAuth.currentUser;
    if (!user?.email) throw new Error('auth/no-current-user');
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, currentPassword));
    await updatePassword(user, nextPassword);
  },

  async idToken(forceRefresh = false) {
    if (!firebaseAuth.currentUser) return null;
    return firebaseAuth.currentUser.getIdToken(forceRefresh);
  },
};
