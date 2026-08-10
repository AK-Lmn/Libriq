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
LibriqFirebase.init();
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
