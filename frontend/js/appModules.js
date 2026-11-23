import './analytics.js';
import {
  LIBRIQ,
  createBook,
  createBookPatch,
  createProfile,
  SEED_BOOKS,
} from './data.js';
import { Storage } from './storage.js';
import { Utils } from './utils.js';
import { installChartKeyboard } from './shared/chartKeyboard.js';
import { STORAGE_KEYS } from './shared/storageKeys.js';

window.Utils = Utils;
Utils.installDelegatedHandlers(document);
installChartKeyboard(document);

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
const firebaseTestMode = new URLSearchParams(globalThis.location?.search || '').get(STORAGE_KEYS.E2E_TEST_MODE) === '1'
  || localStorage.getItem(STORAGE_KEYS.E2E_TEST_MODE) === '1';
const storedSessionMode = localStorage.getItem(STORAGE_KEYS.SESSION_PREF)
  || localStorage.getItem(STORAGE_KEYS.PREFERRED_SESSION_MODE);
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
