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
  const auth = initializeFirebaseClient(config);
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });

  return signInWithPopup(auth, provider);
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

export function firebaseAuthErrorMessage(error: unknown) {
  const code =
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
      ? error.code
      : "";

  switch (code) {
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
      return "Google login did not finish. Please try again and keep the Google window open until it returns to BokekLab.";
    case "auth/popup-blocked":
      return "Your browser blocked the Google login popup. Please allow popups for BokekLab or use email login.";
    case "auth/unauthorized-domain":
      return "This website domain is not allowed in Firebase yet. Add your Cloud Run domain in Firebase Authentication > Authorized domains.";
    case "auth/invalid-email":
      return "That email address does not look valid yet.";
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "Email or password is incorrect. Please try again or reset your password.";
    case "auth/email-already-in-use":
      return "That email already has an account. Try signing in instead.";
    case "auth/weak-password":
      return "Please use a stronger password with at least 6 characters.";
    case "auth/network-request-failed":
      return "Network hiccup while contacting Firebase. Check your connection and try again.";
    default:
      return error instanceof Error
        ? "Login failed. Please try again, or use email login if Google sign-in keeps failing."
        : "Login failed. Please try again.";
  }
}
