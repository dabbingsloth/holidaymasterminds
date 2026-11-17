import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

export {
  signInAnonymously, signInWithEmailAndPassword, signOut,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
export {
  doc, collection, getDoc, getDocs, setDoc, updateDoc, deleteDoc, onSnapshot,
  runTransaction, writeBatch, serverTimestamp, deleteField, arrayUnion, arrayRemove, Timestamp,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

export const configured = !String(firebaseConfig.apiKey || '').startsWith('PASTE');
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

/** Resolves once with the signed-in user (or null) after Firebase restores the session. */
export function currentUser() {
  return new Promise((resolve) => {
    const stop = onAuthStateChanged(auth, (u) => { stop(); resolve(u); });
  });
}

/** UI hint only — the real admin check lives in firestore.rules. */
export function isAdminUser(u) {
  return !!u && !u.isAnonymous && u.providerData.some((p) => p.providerId === 'password');
}
