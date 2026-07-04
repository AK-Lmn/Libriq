import { initializeApp, getApp, getApps } from '../vendor/firebase-app.js';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from '../vendor/firebase-auth.js';

const state = {
  available: false,
  initialized: false,
  user: null,
  error: null,
};

const listeners = new Set();
const config = window.LibriqConfig?.firebase || {};
const hasConfig = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId']
  .every(key => String(config[key] || '').trim());

let app = null;
let auth = null;
let authListener = null;

function emit() {
  listeners.forEach(fn => {
    try {
      fn({ ...state });
    } catch (err) {
      console.warn('[Libriq] Firebase listener error:', err);
    }
  });
  window.dispatchEvent(new CustomEvent('libriq:auth-changed', { detail: { ...state } }));
}

function setState(next) {
  Object.assign(state, next);
  emit();
}

function init() {
  if (!hasConfig) {
    setState({ available: false, initialized: true, user: null });
    return state;
  }

  try {
    app = getApps().length ? getApp() : initializeApp(config);
    auth = getAuth(app);
    state.available = true;
    state.initialized = true;
    state.error = null;

    if (!authListener) {
      authListener = onAuthStateChanged(auth, (user) => {
        setState({ user: user ? {
          uid: user.uid,
          displayName: user.displayName || '',
          email: user.email || '',
          photoURL: user.photoURL || '',
        } : null });
      });
    }
  } catch (err) {
    console.warn('[Libriq] Firebase init failed:', err);
    setState({ available: false, initialized: true, user: null, error: err });
  }

  return state;
}

async function signInWithGoogle() {
  if (!state.available || !auth) {
    throw new Error('Firebase is unavailable.');
  }

  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  return signInWithPopup(auth, provider);
}

async function signOutUser() {
  if (!state.available || !auth) {
    throw new Error('Firebase is unavailable.');
  }
  return signOut(auth);
}

function subscribe(fn) {
  if (typeof fn !== 'function') return () => {};
  listeners.add(fn);
  fn({ ...state });
  return () => listeners.delete(fn);
}

init();

window.LibriqFirebase = {
  getState: () => ({ ...state }),
  onChange: subscribe,
  signInWithGoogle,
  signOut: signOutUser,
  isAvailable: () => state.available,
};
