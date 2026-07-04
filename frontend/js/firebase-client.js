import { initializeApp, getApp, getApps } from '../vendor/firebase-app.js';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from '../vendor/firebase-auth.js';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
} from '../vendor/firebase-firestore.js';

const state = {
  available: false,
  initialized: false,
  ready: false,
  user: null,
  error: null,
};

const listeners = new Set();
const config = window.LibriqConfig?.firebase || {};
const hasConfig = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId']
  .every(key => String(config[key] || '').trim());

let app = null;
let auth = null;
let firestore = null;
let authListener = null;

function detectInAppBrowser(ua = navigator.userAgent || '', platform = navigator.platform || '') {
  const value = `${ua} ${platform}`.toLowerCase();
  const has = (needle) => value.includes(needle);

  const isWebView = (
    has('wv') ||
    has('; wv') ||
    has('webview') ||
    has('instagram') ||
    has('fbav') ||
    has('fban') ||
    has('fbios') ||
    has('messenger') ||
    has('line/') ||
    has('tiktok') ||
    has('trill') ||
    has('bytedance') ||
    has('micromessenger') ||
    (has('android') && has('version/') && !has('chrome/')) ||
    (has('android') && has('safari') && !has('chrome/') && !has('crios')) ||
    (has('iphone') && has('applewebkit') && !has('safari')) ||
    (has('ipad') && has('applewebkit') && !has('safari'))
  );

  const hints = [];
  if (has('tiktok') || has('trill') || has('bytedance')) hints.push('tiktok');
  if (has('instagram')) hints.push('instagram');
  if (has('fbav') || has('fban') || has('fbios')) hints.push('facebook');
  if (has('messenger')) hints.push('messenger');
  if (has('line/')) hints.push('line');
  if (has('micromessenger')) hints.push('wechat');
  if (isWebView && !hints.length) hints.push('webview');

  return {
    isInAppBrowser: isWebView,
    hints,
    userAgent: ua,
  };
}

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
    setState({ available: false, initialized: true, ready: true, user: null });
    return state;
  }

  try {
    app = getApps().length ? getApp() : initializeApp(config);
    auth = getAuth(app);
    try {
      firestore = getFirestore(app);
    } catch (firestoreErr) {
      firestore = null;
      console.warn('[Libriq] Firestore unavailable:', firestoreErr);
    }
    state.available = true;
    state.initialized = true;
    state.ready = false;
    state.error = null;

    if (!authListener) {
      authListener = onAuthStateChanged(auth, (user) => {
        setState({ ready: true, user: user ? {
          uid: user.uid,
          displayName: user.displayName || '',
          email: user.email || '',
          photoURL: user.photoURL || '',
        } : null });
      });
    }
  } catch (err) {
    console.warn('[Libriq] Firebase init failed:', err);
    setState({ available: false, initialized: true, ready: true, user: null, error: err });
  }

  return state;
}

async function signInWithGoogle() {
  if (!state.available || !auth) {
    throw new Error('Firebase is unavailable.');
  }

  const sessionContext = detectInAppBrowser();
  if (sessionContext.isInAppBrowser) {
    const error = new Error('Google sign-in may not work inside this app browser.');
    error.code = 'auth/disallowed-useragent';
    error.details = sessionContext;
    throw error;
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

function getFirestoreClient() {
  return firestore;
}

function hasFirestore() {
  return Boolean(state.available && firestore);
}

async function writeBackupDoc(pathSegments, data) {
  if (!firestore || !auth?.currentUser) throw new Error('Firestore is unavailable.');
  const ref = doc(firestore, ...pathSegments);
  return setDoc(ref, data);
}

async function readBackupDoc(pathSegments) {
  if (!firestore || !auth?.currentUser) throw new Error('Firestore is unavailable.');
  const ref = doc(firestore, ...pathSegments);
  return getDoc(ref);
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
  hasFirestore,
  getFirestoreClient,
  writeBackupDoc,
  readBackupDoc,
  getSessionContext: () => detectInAppBrowser(),
};
