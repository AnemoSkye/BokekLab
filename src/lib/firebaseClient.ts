import { initializeApp, type FirebaseApp } from "firebase/app";
import {
  GoogleAuthProvider,
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import type { FirebasePublicConfig } from "../../shared/recipe";

let firebaseApp: FirebaseApp | null = null;

export function initializeFirebaseClient(config: FirebasePublicConfig) {
  if (!firebaseApp) {
    firebaseApp = initializeApp(config);
    void setPersistence(getAuth(firebaseApp), browserLocalPersistence);
  }

  return getAuth(firebaseApp);
}

export function listenForAuth(config: FirebasePublicConfig, callback: (user: User | null) => void) {
  return onAuthStateChanged(initializeFirebaseClient(config), callback);
}

export async function signInWithGoogle(config: FirebasePublicConfig) {
  return signInWithPopup(initializeFirebaseClient(config), new GoogleAuthProvider());
}

export async function signInWithEmail(config: FirebasePublicConfig, email: string, password: string) {
  return signInWithEmailAndPassword(initializeFirebaseClient(config), email, password);
}

export async function signUpWithEmail(config: FirebasePublicConfig, email: string, password: string) {
  return createUserWithEmailAndPassword(initializeFirebaseClient(config), email, password);
}

export async function resetPassword(config: FirebasePublicConfig, email: string) {
  return sendPasswordResetEmail(initializeFirebaseClient(config), email);
}

export async function signOutOfFirebase(config: FirebasePublicConfig) {
  return signOut(initializeFirebaseClient(config));
}
