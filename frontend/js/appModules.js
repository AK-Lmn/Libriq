import {
  LIBRIQ,
  createBook,
  createBookPatch,
  createProfile,
  SEED_BOOKS,
} from './data.js';
import { Storage } from './storage.js';
import { Utils } from './utils.js';

window.Utils = Utils;

const [
  { BookAPI },
  { Library },
  { Search },
  { Dashboard },
  { Navigation },
  { LibriqFirebase },
  { LibriqSyncBeta },
  { LibriqCloudBackup },
  { bootApp },
] = await Promise.all([
  import('./api/index.js'),
  import('./library.js'),
  import('./search.js'),
  import('./dashboard.js'),
  import('./navigation.js'),
  import('./firebase-client.js'),
  import('./sync.js'),
  import('./cloudBackup.js'),
  import('./app.js'),
]);

window.Navigation = Navigation;
window.LibriqNavigation = Navigation;
window.LibriqStorage = Storage;
window.LibriqFirebase = LibriqFirebase;
window.LibriqSyncBeta = LibriqSyncBeta;
window.LibriqCloudBackup = LibriqCloudBackup;
// An explicit offline session must not download the Firebase SDK; sign-in
// paths lazy-load it through ensureInitialized(). Fresh sessions (no stored
// preference) still init eagerly so auth restore can't stall on first load.
const firebaseTestMode = new URLSearchParams(globalThis.location?.search || '').get('libriq_e2e_test_mode') === '1'
  || localStorage.getItem('libriq_e2e_test_mode') === '1';
const storedSessionMode = localStorage.getItem('libriq_session_pref')
  || localStorage.getItem('libriq_preferred_session_mode');
const offlineSession = storedSessionMode === 'offline'
  && !firebaseTestMode
  && !Storage.getActiveAccountUid?.();
if (offlineSession) LibriqFirebase.defer();
else LibriqFirebase.init();
LibriqSyncBeta.init();
LibriqCloudBackup.init({
  getSessionPreference: () => Navigation.getSessionPreference(),
  getCurrentPage: () => Navigation.currentPage,
  getSyncState: () => LibriqSyncBeta.getState(),
});
bootApp();
window.__LIBRIQ_APP_READY__ = true;
window.dispatchEvent(new CustomEvent('libriq:app-ready'));

export {
  LIBRIQ,
  createBook,
  createBookPatch,
  createProfile,
  SEED_BOOKS,
  Storage,
  Utils,
  BookAPI,
  Library,
  Search,
  Dashboard,
  Navigation,
  LibriqFirebase,
  LibriqSyncBeta,
  LibriqCloudBackup,
  bootApp,
};
