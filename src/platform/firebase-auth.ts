import { initializeApp, getApps } from 'firebase/app';
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
  apiKey: 'AIzaSyAj-_xUmbO1E4KOPag4Cc1gfs3GsjFFjZ8',
  authDomain: 'nightjar-audio-9d659.firebaseapp.com',
  projectId: 'nightjar-audio-9d659',
  storageBucket: 'nightjar-audio-9d659.firebasestorage.app',
  messagingSenderId: '816045852400',
  appId: '1:816045852400:web:f58345e14c5612a73d2435',
  measurementId: 'G-K9G3Y77J7F',
};

const app = getApps()[0] ?? initializeApp(firebaseConfig);
export const firebaseAuth = getAuth(app);
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
    await sendEmailVerification(credential.user);
    return mapUser(credential.user);
  },

  async signIn(email: string, password: string) {
    const credential = await signInWithEmailAndPassword(firebaseAuth, email.trim(), password);
    return mapUser(credential.user);
  },

  async signOut() {
    await signOut(firebaseAuth);
  },

  async resendVerification() {
    if (!firebaseAuth.currentUser) throw new Error('auth/no-current-user');
    await sendEmailVerification(firebaseAuth.currentUser);
  },

  async reloadIdentity() {
    if (!firebaseAuth.currentUser) return null;
    await firebaseAuth.currentUser.reload();
    return mapUser(firebaseAuth.currentUser);
  },

  async resetPassword(email: string) {
    await sendPasswordResetEmail(firebaseAuth, email.trim());
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
