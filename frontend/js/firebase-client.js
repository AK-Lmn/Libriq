import { initializeApp, getApp, getApps } from '../vendor/firebase-app.js';
import {
  createUserWithEmailAndPassword,
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  deleteUser,
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
  restoringSession: false,
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
let initRetryTimer = null;
let initRetryStartedAt = 0;
const TEST_MODE = Boolean(
  (location.hostname === 'localhost' || location.hostname === '127.0.0.1') &&
  (new URLSearchParams(location.search).get('libriq_e2e_test_mode') === '1' || localStorage.getItem('libriq_e2e_test_mode') === '1')
);
const INIT_RETRY_TIMEOUT_MS = 3500;
const INIT_RETRY_INTERVAL_MS = 75;
const AUTH_READY_TIMEOUT_MS = 1500;
const ACTIVITY_SYNC_QUEUE_KEY = 'libriq_pending_activity_sync';
const PROFILE_SYNC_QUEUE_KEY = 'libriq_pending_profile_sync';
const AUTH_SIGN_OUT_GRACE_MS = 2500;
let activityOnlineListenerAttached = false;
let authNullTimer = null;
let profileSyncHydrating = false;

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

function getVisibleUser() {
  if (TEST_MODE) return testUser;
  return auth?.currentUser || (state.restoringSession ? state.user : null);
}

function init() {
  if (TEST_MODE) {
    app = { name: 'libriq-test-app' };
    testFirestore = createTestFirestore();
    firestore = testFirestore;
    const storedUid = localStorage.getItem('libriq_e2e_test_uid') || '';
    if (storedUid) {
      testUser = {
        uid: storedUid,
        displayName: localStorage.getItem('libriq_e2e_test_display_name') || storedUid,
        email: localStorage.getItem('libriq_e2e_test_email') || `${storedUid}@example.com`,
        photoURL: '',
      };
      window.LibriqStorage?.setActiveAccountUid?.(testUser.uid);
    } else {
      window.LibriqStorage?.clearActiveAccountScope?.();
    }
    state.available = true;
    state.initialized = true;
    state.ready = true;
    state.error = null;
    state.user = testUser;
    return state;
  }

  if (!hasConfig) {
    if ((location.hostname === 'localhost' || location.hostname === '127.0.0.1') && !initRetryTimer) {
      initRetryStartedAt = initRetryStartedAt || Date.now();
      initRetryTimer = window.setInterval(() => {
        if (hasConfig) {
          window.clearInterval(initRetryTimer);
          initRetryTimer = null;
          initRetryStartedAt = 0;
          init();
          return;
        }
        if (Date.now() - initRetryStartedAt > INIT_RETRY_TIMEOUT_MS) {
          window.clearInterval(initRetryTimer);
          initRetryTimer = null;
          initRetryStartedAt = 0;
          setState({ available: false, initialized: true, ready: true, user: null });
        }
      }, INIT_RETRY_INTERVAL_MS);
      return state;
    }

    setState({ available: false, initialized: true, ready: true, user: null });
    return state;
  }

  if (initRetryTimer) {
    window.clearInterval(initRetryTimer);
    initRetryTimer = null;
    initRetryStartedAt = 0;
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
      if (user?.uid) {
        window.LibriqStorage?.setActiveAccountUid?.(user.uid);
          if (authNullTimer) {
            window.clearTimeout(authNullTimer);
            authNullTimer = null;
          }
          state.restoringSession = false;
        } else {
          if (!state.restoringSession && state.user) {
            state.restoringSession = true;
            if (authNullTimer) window.clearTimeout(authNullTimer);
            authNullTimer = window.setTimeout(() => {
              authNullTimer = null;
              if (auth?.currentUser?.uid) return;
              state.restoringSession = false;
              setState({ user: null, ready: true, available: true });
              window.LibriqStorage?.clearActiveAccountScope?.();
            }, AUTH_SIGN_OUT_GRACE_MS);
          } else if (!state.user) {
            window.LibriqStorage?.clearActiveAccountScope?.();
          }
        }
        setState({ ready: true, user: user ? {
          uid: user.uid,
          displayName: user.displayName || '',
          email: user.email || '',
          photoURL: user.photoURL || '',
        } : (state.restoringSession ? state.user : null) });
        if (user?.uid) {
          syncActivityFromCloud(user.uid);
          syncProfileFromCloud(user.uid);
        }
      });
    }
    if (!activityOnlineListenerAttached) {
      activityOnlineListenerAttached = true;
      window.addEventListener?.('online', () => {
        const current = getCurrentUser();
        if (current?.uid) {
          syncActivityFromCloud(current.uid);
          syncProfileFromCloud(current.uid);
        }
      });
    }
    if (!window.__libriqProfileSyncListenerAttached) {
      window.__libriqProfileSyncListenerAttached = true;
      window.addEventListener?.('libriq:profile:updated', (event) => {
        if (profileSyncHydrating) return;
        const current = getCurrentUser();
        if (!current?.uid) return;
        queueProfileSync(event?.detail || window.LibriqStorage?.getProfile?.());
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
    window.LibriqStorage?.setActiveAccountUid?.(testUser.uid);
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

async function signInWithEmail(email, password) {
  if (TEST_MODE) {
    const normalizedEmail = String(email || '').trim();
    testUser = {
      uid: localStorage.getItem('libriq_e2e_test_uid') || `email-${normalizedEmail || 'reader'}`,
      displayName: normalizedEmail.split('@')[0] || 'Reader',
      email: normalizedEmail,
      photoURL: '',
    };
    window.LibriqStorage?.setActiveAccountUid?.(testUser.uid);
    setState({ ready: true, user: testUser, available: true });
    return { user: testUser };
  }
  if (!state.available || !auth) {
    const error = new Error('Firebase is unavailable.');
    error.code = 'auth/network-request-failed';
    throw error;
  }
  return signInWithEmailAndPassword(auth, String(email || '').trim(), password);
}

async function createAccountWithEmail(email, password) {
  if (TEST_MODE) return signInWithEmail(email, password);
  if (!state.available || !auth) {
    const error = new Error('Firebase is unavailable.');
    error.code = 'auth/network-request-failed';
    throw error;
  }
  return createUserWithEmailAndPassword(auth, String(email || '').trim(), password);
}

async function signOutUser() {
  if (TEST_MODE) {
    testUser = null;
    localStorage.removeItem('libriq_e2e_test_uid');
    localStorage.removeItem('libriq_e2e_test_email');
    localStorage.removeItem('libriq_e2e_test_display_name');
    window.LibriqStorage?.clearActiveAccountScope?.();
    setState({ user: null, ready: true, available: true });
    return;
  }
  if (!state.available || !auth) {
    throw new Error('Firebase is unavailable.');
  }
  state.restoringSession = false;
  if (authNullTimer) {
    window.clearTimeout(authNullTimer);
    authNullTimer = null;
  }
  return signOut(auth);
}

function getFirestoreClient() {
  return firestore;
}

function getCurrentUser() {
  if (TEST_MODE) return testUser;
  const current = getVisibleUser();
  return current ? {
    uid: current.uid,
    displayName: current.displayName || '',
    email: current.email || '',
    photoURL: current.photoURL || '',
  } : null;
}

function _waitForAuthReady(timeoutMs = AUTH_READY_TIMEOUT_MS) {
  if (TEST_MODE) return Promise.resolve(true);
  if (state.ready || !auth) return Promise.resolve(Boolean(state.ready));
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const poll = () => {
      if (state.ready || auth?.currentUser || Date.now() - startedAt >= timeoutMs) {
        resolve(Boolean(state.ready || auth?.currentUser));
        return;
      }
      window.setTimeout(poll, 50);
    };
    poll();
  });
}

async function getCurrentAuthUser(options = {}) {
  const waitForReady = options?.waitForReady !== false;
  if (waitForReady) {
    await _waitForAuthReady(options?.timeoutMs);
  }
  if (TEST_MODE) return testUser;
  return getVisibleUser();
}

async function getCurrentUserIdToken(forceRefresh = false) {
  if (TEST_MODE) return localStorage.getItem('libriq_e2e_test_id_token') || null;
  const current = await getCurrentAuthUser({ waitForReady: true });
  if (!current?.getIdToken) return null;
  try {
    return await current.getIdToken(forceRefresh);
  } catch (err) {
    console.warn('[Libriq] Firebase token retrieval failed:', err);
    return null;
  }
}

function getActivityCollectionPath(uid) {
  return uid ? `users/${uid}/activity` : null;
}

function getProfileDocPath(uid) {
  return uid ? `users/${uid}/profile/current` : null;
}

function logActivityDebug(message, details = {}) {
  if (!TEST_MODE && !window.location?.hostname?.includes('localhost') && !window.location?.hostname?.includes('127.0.0.1')) return;
  try {
    console.debug(`[LibriQ] ${message}`, details);
  } catch {
    console.debug(`[LibriQ] ${message}`);
  }
}

function getPendingActivityQueue() {
  try {
    const raw = localStorage.getItem(ACTIVITY_SYNC_QUEUE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch (err) {
    console.warn('[LibriQ] Activity pending queue read failed:', err);
    return [];
  }
}

function getPendingProfileQueue() {
  try {
    const raw = localStorage.getItem(PROFILE_SYNC_QUEUE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (err) {
    console.warn('[LibriQ] Profile pending queue read failed:', err);
    return null;
  }
}

function setPendingProfileQueue(profile) {
  try {
    if (!profile || typeof profile !== 'object') {
      localStorage.removeItem(PROFILE_SYNC_QUEUE_KEY);
      return;
    }
    localStorage.setItem(PROFILE_SYNC_QUEUE_KEY, JSON.stringify(profile));
  } catch (err) {
    console.warn('[LibriQ] Profile pending queue write failed:', err);
  }
}

function setPendingActivityQueue(events) {
  try {
    localStorage.setItem(ACTIVITY_SYNC_QUEUE_KEY, JSON.stringify(Array.isArray(events) ? events.slice(-100) : []));
  } catch (err) {
    console.warn('[LibriQ] Activity pending queue write failed:', err);
  }
}

function addPendingActivityEvent(event) {
  const normalized = sanitizeActivityEvent(event);
  if (!normalized) return false;
  const queue = getPendingActivityQueue();
  if (queue.some(item => item?.id === normalized.id)) return true;
  queue.push(normalized);
  setPendingActivityQueue(queue);
  return true;
}

function clearPendingActivityEvent(id) {
  if (!id) return;
  const queue = getPendingActivityQueue().filter(event => event?.id !== id);
  setPendingActivityQueue(queue);
}

function hasActiveUser() {
  return TEST_MODE ? Boolean(testUser?.uid) : Boolean(getVisibleUser()?.uid);
}

function sanitizeActivityEvent(event) {
  if (!event || typeof event !== 'object') return null;
  const timestamp = event.createdAt || event.timestamp || new Date().toISOString();
  return {
    id: String(event.id || `act_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`),
    type: String(event.type || 'unknown'),
    timestamp,
    createdAt: event.createdAt || timestamp,
    updatedAt: event.updatedAt || event.timestamp || timestamp,
    bookId: event.bookId || null,
    bookTitle: event.bookTitle || null,
    bookAuthor: event.bookAuthor || null,
    coverUrl: event.coverUrl || null,
    status: event.status || null,
    message: event.message || event.label || null,
    payload: event.payload && typeof event.payload === 'object' ? event.payload : {},
    sourceDeviceId: event.sourceDeviceId || event.deviceId || null,
    pending: Boolean(event.pending),
  };
}

function sanitizeProfile(profile) {
  if (!profile || typeof profile !== 'object') return null;
  const displayName = String(profile.displayName || profile.name || '').trim() || 'Reader';
  const bio = String(profile.bio || '').trim();
  const avatar = String(profile.avatar || profile.photoURL || '').trim();
  const createdAt = profile.createdAt || profile.joinDate || null;
  const updatedAt = profile.updatedAt || createdAt || null;
  return {
    displayName,
    name: displayName,
    bio: bio || null,
    avatar: avatar || null,
    createdAt,
    updatedAt,
  };
}

async function writeActivityEvent(uid, event) {
  const activityUid = uid || getCurrentUser()?.uid || null;
  const normalized = sanitizeActivityEvent(event);
  if (!normalized) return false;
  if (!activityUid) {
    logActivityDebug('Activity write skipped: no uid', { eventId: normalized.id, type: normalized.type });
    return false;
  }
  if (!firestore || !hasActiveUser()) {
    logActivityDebug('Activity write skipped: firestore unavailable or auth not ready', {
      uid: `${String(activityUid).slice(0, 6)}…`,
      eventId: normalized.id,
      type: normalized.type,
      path: getActivityCollectionPath(activityUid),
    });
    return false;
  }
  const path = getActivityCollectionPath(activityUid);
  logActivityDebug('Activity write start', { uid: `${String(activityUid).slice(0, 6)}…`, eventId: normalized.id, type: normalized.type, path });
  const ref = TEST_MODE ? testFirestore.doc('users', activityUid, 'activity', normalized.id) : doc(firestore, 'users', activityUid, 'activity', normalized.id);
  await (TEST_MODE ? testFirestore.setDoc(ref, { ...normalized, pending: false }) : setDoc(ref, { ...normalized, pending: false }, { merge: true }));
  logActivityDebug('Activity write success', { uid: `${String(activityUid).slice(0, 6)}…`, eventId: normalized.id, type: normalized.type, path });
  return true;
}

async function replaceActivityCollection(uid, events = []) {
  const activityUid = uid || getCurrentUser()?.uid || null;
  if (!activityUid) return false;
  if (!firestore || !hasActiveUser()) return false;
  const list = Array.isArray(events) ? events.map(sanitizeActivityEvent).filter(Boolean) : [];
  await Promise.all(list.map(event => {
    const ref = TEST_MODE ? testFirestore.doc('users', activityUid, 'activity', event.id) : doc(firestore, 'users', activityUid, 'activity', event.id);
    return TEST_MODE ? testFirestore.setDoc(ref, { ...event, pending: false }) : setDoc(ref, { ...event, pending: false }, { merge: true });
  }));
  return true;
}

async function readActivityCollection(uid) {
  const activityUid = uid || getCurrentUser()?.uid || null;
  if (!activityUid) return [];
  if (!firestore || !hasActiveUser()) return [];
  const path = getActivityCollectionPath(activityUid);
  logActivityDebug('Activity read start', { uid: `${String(activityUid).slice(0, 6)}…`, path });
  const ref = TEST_MODE ? testFirestore.collection('users', activityUid, 'activity') : collection(firestore, 'users', activityUid, 'activity');
  const q = TEST_MODE ? testFirestore.query(ref, testFirestore.orderBy('timestamp', 'desc')) : query(ref, orderBy('timestamp', 'desc'));
  const snap = TEST_MODE ? await testFirestore.getDocs(q) : await getDocs(q);
  const items = [];
  snap.forEach((docSnap) => {
    const data = docSnap.data();
    if (data) items.push({ id: docSnap.id, ...data });
  });
  logActivityDebug('Activity read success', { uid: `${String(activityUid).slice(0, 6)}…`, path, count: items.length });
  return items;
}

async function syncActivityFromCloud(uid = null) {
  const activityUid = uid || getCurrentUser()?.uid || null;
  if (!activityUid) return [];
  if (!firestore || !hasActiveUser()) return [];
  try {
    logActivityDebug('Activity sync start', { uid: `${String(activityUid).slice(0, 6)}…`, path: getActivityCollectionPath(activityUid) });
    const remote = await readActivityCollection(activityUid);
    const local = Array.isArray(window.LibriqStorage?.getActivityLog?.()) ? window.LibriqStorage.getActivityLog() : [];
    const byId = new Map();
    [...remote, ...local].forEach((event) => {
      const normalized = sanitizeActivityEvent(event);
      if (!normalized) return;
      byId.set(normalized.id, normalized);
    });
    const merged = Array.from(byId.values()).sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
    window.LibriqStorage?.replaceActivityLog?.(merged);
    const pendingQueue = getPendingActivityQueue();
    if (pendingQueue.length && activityUid) {
      const remaining = [];
      for (const event of pendingQueue) {
        try {
          const ok = await writeActivityEvent(activityUid, event);
          if (!ok) remaining.push(event);
        } catch (err) {
          console.warn('[LibriQ] Activity pending write flush failed:', err);
          remaining.push(event);
        }
      }
      setPendingActivityQueue(remaining);
    }
    window.dispatchEvent?.(new CustomEvent('libriq:activity:updated', { detail: { count: merged.length } }));
    logActivityDebug('Activity sync success', { uid: `${String(activityUid).slice(0, 6)}…`, count: merged.length });
    return merged;
  } catch (err) {
    console.warn('[LibriQ] Activity cloud load failed:', err);
    return window.LibriqStorage?.getActivityLog?.() || [];
  }
}

async function writeProfileDoc(uid, profile) {
  const profileUid = uid || getCurrentUser()?.uid || null;
  const normalized = sanitizeProfile(profile);
  if (!profileUid || !normalized) {
    logActivityDebug('Profile write skipped: missing uid or payload', { uid: profileUid ? `${String(profileUid).slice(0, 6)}…` : null });
    return false;
  }
  if (!firestore || !hasActiveUser()) {
    logActivityDebug('Profile write skipped: firestore unavailable or auth not ready', {
      uid: `${String(profileUid).slice(0, 6)}…`,
      path: getProfileDocPath(profileUid),
    });
    return false;
  }
  const path = getProfileDocPath(profileUid);
  logActivityDebug('Profile write start', { uid: `${String(profileUid).slice(0, 6)}…`, path });
  const ref = TEST_MODE ? testFirestore.doc('users', profileUid, 'profile', 'current') : doc(firestore, 'users', profileUid, 'profile', 'current');
  await (TEST_MODE ? testFirestore.setDoc(ref, normalized) : setDoc(ref, normalized, { merge: true }));
  logActivityDebug('Profile write success', { uid: `${String(profileUid).slice(0, 6)}…`, path });
  return true;
}

async function readProfileDoc(uid = null) {
  const profileUid = uid || getCurrentUser()?.uid || null;
  if (!profileUid || !firestore || !hasActiveUser()) return null;
  const path = getProfileDocPath(profileUid);
  logActivityDebug('Profile read start', { uid: `${String(profileUid).slice(0, 6)}…`, path });
  const ref = TEST_MODE ? testFirestore.doc('users', profileUid, 'profile', 'current') : doc(firestore, 'users', profileUid, 'profile', 'current');
  const snap = TEST_MODE ? await testFirestore.getDoc(ref) : await getDoc(ref);
  const data = snap?.data ? snap.data() : null;
  if (!data || typeof data !== 'object') {
    logActivityDebug('Profile read empty', { uid: `${String(profileUid).slice(0, 6)}…`, path });
    return null;
  }
  logActivityDebug('Profile read success', { uid: `${String(profileUid).slice(0, 6)}…`, path });
  return sanitizeProfile(data);
}

async function syncProfileFromCloud(uid = null) {
  const profileUid = uid || getCurrentUser()?.uid || null;
  if (!profileUid) return null;
  if (!firestore || !hasActiveUser()) return null;
  try {
    logActivityDebug('Profile sync start', { uid: `${String(profileUid).slice(0, 6)}…`, path: getProfileDocPath(profileUid) });
    const remote = await readProfileDoc(profileUid);
    const local = sanitizeProfile(window.LibriqStorage?.getProfile?.());
    if (!remote && local) {
      await writeProfileDoc(profileUid, local);
      setPendingProfileQueue(null);
      logActivityDebug('Profile migration uploaded', { uid: `${String(profileUid).slice(0, 6)}…` });
      return local;
    }
    if (!remote) return local;
    const merged = {
      ...window.LibriqStorage?.getProfile?.(),
      displayName: remote.displayName || remote.name || local?.displayName || local?.name || 'Reader',
      name: remote.displayName || remote.name || local?.displayName || local?.name || 'Reader',
      bio: typeof remote.bio === 'string' ? remote.bio : local?.bio || null,
      avatar: remote.avatar || local?.avatar || null,
      createdAt: remote.createdAt || remote.joinDate || local?.createdAt || local?.joinDate || null,
      updatedAt: remote.updatedAt || local?.updatedAt || remote.createdAt || remote.joinDate || local?.createdAt || null,
    };
    profileSyncHydrating = true;
    try {
      window.LibriqStorage?.saveProfile?.(merged);
    } finally {
      profileSyncHydrating = false;
    }
    const pending = getPendingProfileQueue();
    if (pending) {
      const pendingTime = new Date(pending.updatedAt || pending.createdAt || 0).getTime();
      const remoteTime = new Date(merged.updatedAt || merged.createdAt || 0).getTime();
      if (pendingTime > remoteTime) {
        await writeProfileDoc(profileUid, pending);
        setPendingProfileQueue(null);
      }
    }
    window.dispatchEvent?.(new CustomEvent('libriq:profile:updated', { detail: { uid: profileUid } }));
    logActivityDebug('Profile sync success', { uid: `${String(profileUid).slice(0, 6)}…` });
    return merged;
  } catch (err) {
    console.warn('[LibriQ] Profile cloud sync failed:', err);
    return window.LibriqStorage?.getProfile?.() || null;
  }
}

function queueProfileSync(profile) {
  const user = getCurrentUser();
  const normalized = sanitizeProfile(profile);
  if (!normalized) return false;
  logActivityDebug('Profile queue requested', {
    hasUser: Boolean(user?.uid),
    path: getProfileDocPath(user?.uid || null),
  });
  if (!user?.uid || !firestore || !hasActiveUser()) {
    setPendingProfileQueue(normalized);
    logActivityDebug('Profile queued locally pending auth/firestore', { uid: user?.uid ? `${String(user.uid).slice(0, 6)}…` : null });
    return false;
  }
  Promise.resolve().then(async () => {
    try {
      const ok = await writeProfileDoc(user.uid, normalized);
      if (!ok) setPendingProfileQueue(normalized);
      else setPendingProfileQueue(null);
    } catch (err) {
      console.warn('[LibriQ] Profile cloud write failed:', err);
      setPendingProfileQueue(normalized);
    }
  });
  return true;
}

function queueActivitySync(event) {
  const user = getCurrentUser();
  const normalized = sanitizeActivityEvent(event);
  if (!normalized) return false;
  logActivityDebug('Activity queue requested', {
    hasUser: Boolean(user?.uid),
    eventId: normalized.id,
    type: normalized.type,
    path: getActivityCollectionPath(user?.uid || null),
  });
  if (!user?.uid || !firestore || !hasActiveUser()) {
    addPendingActivityEvent(normalized);
    logActivityDebug('Activity queued locally pending auth/firestore', { eventId: normalized.id, type: normalized.type });
    return false;
  }
  Promise.resolve().then(async () => {
    try {
      const ok = await writeActivityEvent(user.uid, normalized);
      if (!ok) addPendingActivityEvent(normalized);
    } catch (err) {
      console.warn('[LibriQ] Activity cloud write failed:', err);
      addPendingActivityEvent(normalized);
    }
  });
  return true;
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

async function deleteFirestoreDocPath(pathSegments) {
  if (TEST_MODE) {
    await testFetch(`/doc?path=${encodeURIComponent(pathSegments.join('/'))}`, { method: 'DELETE' });
    return true;
  }
  if (!firestore || !auth?.currentUser) throw new Error('Firestore is unavailable.');
  const ref = doc(firestore, ...pathSegments);
  await deleteDoc(ref);
  return true;
}

async function deleteFirestoreCollectionDocs(pathSegments) {
  if (TEST_MODE) {
    const res = await testFetch(`/collection?path=${encodeURIComponent(pathSegments.join('/'))}`);
    const docs = await res.json();
    await Promise.all((Array.isArray(docs) ? docs : []).map((item) => testFetch(`/doc?path=${encodeURIComponent(`${pathSegments.join('/')}/${item.id}`)}`, { method: 'DELETE' })));
    return true;
  }
  if (!firestore || !auth?.currentUser) throw new Error('Firestore is unavailable.');
  const ref = collection(firestore, ...pathSegments);
  const snap = await getDocs(ref);
  const deletions = [];
  snap.forEach((docSnap) => {
    deletions.push(deleteDoc(doc(firestore, ...pathSegments, docSnap.id)));
  });
  await Promise.all(deletions);
  return true;
}

async function deleteCurrentUserLibraryData() {
  const user = getCurrentUser();
  if (!user?.uid) throw new Error('Firebase is unavailable.');
  await deleteFirestoreCollectionDocs(['users', user.uid, 'sync', 'v1', 'books']);
  await deleteFirestoreCollectionDocs(['users', user.uid, 'activity']);
  return true;
}

async function deleteCurrentUserAccount() {
  const user = getCurrentUser();
  if (!user?.uid) throw new Error('Firebase is unavailable.');
  await deleteCurrentUserLibraryData();
  await deleteFirestoreDocPath(['users', user.uid, 'profile', 'current']);
  await deleteFirestoreDocPath(['users', user.uid, 'backups', 'current']);
  if (TEST_MODE) {
    await signOutUser();
    return true;
  }
  if (!auth?.currentUser) throw new Error('Firebase is unavailable.');
  try {
    await deleteUser(auth.currentUser);
  } catch (err) {
    if (String(err?.code || '').includes('requires-recent-login')) {
      const friendly = new Error('For security, please sign in again before deleting your account.');
      friendly.code = 'auth/requires-recent-login';
      throw friendly;
    }
    throw err;
  }
  return true;
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
  signInWithEmail,
  createAccountWithEmail,
  signOut: signOutUser,
  isAvailable: () => state.available,
  hasFirestore,
  getFirestoreClient,
  getCurrentUser,
  getCurrentAuthUser,
  getCurrentUserIdToken,
  getActivityCollectionPath,
  getProfileDocPath,
  sanitizeActivityEvent,
  sanitizeProfile,
  writeActivityEvent,
  replaceActivityCollection,
  readActivityCollection,
  syncActivityFromCloud,
  writeProfileDoc,
  readProfileDoc,
  syncProfileFromCloud,
  queueProfileSync,
  queueActivitySync,
  writeBackupDoc,
  readBackupDoc,
  deleteCurrentUserLibraryData,
  deleteCurrentUserAccount,
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
      window.LibriqStorage?.setActiveAccountUid?.(uid);
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
