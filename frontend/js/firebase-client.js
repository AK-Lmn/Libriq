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
  collection,
  query,
  orderBy,
  onSnapshot,
  setDoc,
  getDoc,
  deleteDoc,
  getDocs,
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
let testUser = null;
let testFirestore = null;
const TEST_MODE = Boolean(
  (location.hostname === 'localhost' || location.hostname === '127.0.0.1') &&
  (new URLSearchParams(location.search).get('libriq_e2e_test_mode') === '1' || localStorage.getItem('libriq_e2e_test_mode') === '1')
);

function getTestApiBase() {
  return `${location.origin}/__libriq_test_api`;
}

async function testFetch(path, init = {}) {
  const res = await fetch(`${getTestApiBase()}${path}`, {
    headers: { 'content-type': 'application/json', ...(init.headers || {}) },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Test API request failed: ${res.status}`);
  }
  return res;
}

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
  if (TEST_MODE) {
    app = { name: 'libriq-test-app' };
    testFirestore = createTestFirestore();
    firestore = testFirestore;
    state.available = true;
    state.initialized = true;
    state.ready = true;
    state.error = null;
    state.user = testUser;
    return state;
  }

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
  if (TEST_MODE) {
    testUser = {
      uid: localStorage.getItem('libriq_e2e_test_uid') || 'test-uid',
      displayName: localStorage.getItem('libriq_e2e_test_display_name') || 'E2E Reader',
      email: localStorage.getItem('libriq_e2e_test_email') || 'e2e@example.com',
      photoURL: '',
    };
    setState({ ready: true, user: testUser, available: true });
    return { user: testUser };
  }
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
  if (TEST_MODE) {
    testUser = null;
    setState({ user: null, ready: true, available: true });
    return;
  }
  if (!state.available || !auth) {
    throw new Error('Firebase is unavailable.');
  }
  return signOut(auth);
}

function getFirestoreClient() {
  return firestore;
}

function getCurrentUser() {
  if (TEST_MODE) return testUser;
  const current = auth?.currentUser || null;
  return current ? {
    uid: current.uid,
    displayName: current.displayName || '',
    email: current.email || '',
    photoURL: current.photoURL || '',
  } : null;
}

function hasFirestore() {
  return Boolean(state.available && firestore);
}

function createTestQuerySnapshot(items) {
  return {
    forEach(fn) {
      items.forEach((item) => fn({ data: () => item }));
    },
  };
}

function createTestFirestore() {
  function normalizeSegments(args) {
    const parts = Array.from(args);
    if (parts[0] && typeof parts[0] === 'object' && (parts[0].__test || parts[0].path)) parts.shift();
    return parts;
  }
  return {
    __test: true,
    collection: (...segments) => ({ path: normalizeSegments(segments).join('/') }),
    doc: (...segments) => {
      const parts = normalizeSegments(segments);
      return { path: parts.join('/'), id: parts[parts.length - 1] };
    },
    query: (ref) => ref,
    orderBy: () => ({ __noop: true }),
    async setDoc(ref, value) {
      await testFetch(`/doc?path=${encodeURIComponent(ref.path)}`, {
        method: 'PUT',
        body: JSON.stringify({ data: value }),
      });
    },
    async getDoc(ref) {
      const res = await testFetch(`/doc?path=${encodeURIComponent(ref.path)}`);
      const data = await res.json();
      return { data: () => data };
    },
    async deleteDoc(ref) {
      await testFetch(`/doc?path=${encodeURIComponent(ref.path)}`, { method: 'DELETE' });
    },
    async getDocs(ref) {
      const res = await testFetch(`/collection?path=${encodeURIComponent(ref.path)}`);
      return createTestQuerySnapshot(await res.json());
    },
    onSnapshot(ref, next, error) {
      const controller = new AbortController();
      fetch(`${getTestApiBase()}/subscribe?path=${encodeURIComponent(ref.path)}`, { signal: controller.signal })
        .then((res) => {
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          const pump = () => reader.read().then(({ done, value }) => {
            if (done) return;
            buffer += decoder.decode(value, { stream: true });
            const chunks = buffer.split('\n\n');
            buffer = chunks.pop() || '';
            for (const chunk of chunks) {
              const line = chunk.split('\n').find((entry) => entry.startsWith('data: '));
              if (!line) continue;
              next(createTestQuerySnapshot(JSON.parse(line.slice(6))));
            }
            return pump();
          });
          return pump();
        })
        .catch((err) => {
          if (!controller.signal.aborted && error) error(err);
        });
      return () => controller.abort();
    },
  };
}

async function writeBackupDoc(pathSegments, data) {
  if (TEST_MODE) {
    await testFetch(`/doc?path=${encodeURIComponent(pathSegments.join('/'))}`, {
      method: 'PUT',
      body: JSON.stringify({ data }),
    });
    return;
  }
  if (!firestore || !auth?.currentUser) throw new Error('Firestore is unavailable.');
  const ref = doc(firestore, ...pathSegments);
  return setDoc(ref, data);
}

async function readBackupDoc(pathSegments) {
  if (TEST_MODE) {
    const res = await testFetch(`/doc?path=${encodeURIComponent(pathSegments.join('/'))}`);
    return { data: async () => res.json() };
  }
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
  getCurrentUser,
  writeBackupDoc,
  readBackupDoc,
  doc: (...args) => TEST_MODE ? testFirestore.doc(...args) : doc(...args),
  setDoc: (...args) => TEST_MODE ? testFirestore.setDoc(...args) : setDoc(...args),
  collection: (...args) => TEST_MODE ? testFirestore.collection(...args) : collection(...args),
  query: (...args) => TEST_MODE ? testFirestore.query(...args) : query(...args),
  orderBy: (...args) => TEST_MODE ? testFirestore.orderBy(...args) : orderBy(...args),
  onSnapshot: (...args) => TEST_MODE ? testFirestore.onSnapshot(...args) : onSnapshot(...args),
  deleteDoc: (...args) => TEST_MODE ? testFirestore.deleteDoc(...args) : deleteDoc(...args),
  getDocs: (...args) => TEST_MODE ? testFirestore.getDocs(...args) : getDocs(...args),
  getSessionContext: () => detectInAppBrowser(),
  isTestMode: () => TEST_MODE,
};

if (TEST_MODE) {
  window.LibriqE2E = {
    seedAuth(uid, email, displayName) {
      localStorage.setItem('libriq_e2e_test_uid', uid);
      localStorage.setItem('libriq_e2e_test_email', email || `${uid}@example.com`);
      localStorage.setItem('libriq_e2e_test_display_name', displayName || uid);
      testUser = { uid, email: email || `${uid}@example.com`, displayName: displayName || uid, photoURL: '' };
      setState({ user: testUser, ready: true, available: true });
      return testUser;
    },
    enableAccountMode() {
      sessionStorage.setItem('libriq_session_mode', 'account');
      localStorage.setItem('libriq_preferred_session_mode', 'account');
      localStorage.setItem('libriq_session_pref', 'account');
    },
    enableSyncBeta() {
      localStorage.setItem('libriq_sync_beta_enabled', '1');
      window.LibriqSyncBeta?.setEnabled?.(true);
    },
    disableAccountMode() {
      sessionStorage.setItem('libriq_session_mode', 'offline');
      localStorage.setItem('libriq_preferred_session_mode', 'offline');
      localStorage.setItem('libriq_session_pref', 'offline');
      window.LibriqSyncBeta?.pauseForOffline?.();
    },
    addBook(book) {
      return Storage.addBook(book);
    },
    updateBook(id, patch) {
      return Storage.updateBook(id, patch);
    },
    toggleFavorite(id) {
      return Storage.toggleFavorite(id);
    },
    deleteBook(id) {
      return Storage.removeBook(id);
    },
    getBooks() {
      return Storage.getBooks();
    },
    clearLocalData() {
      Storage.resetAll();
    },
    getSyncStatus() {
      return window.LibriqSyncDebug?.status?.();
    },
  };
}
