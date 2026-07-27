import {
  LIBRIQ,
  createBook,
  createBookPatch,
  createProfile,
  SEED_BOOKS,
} from './data.js';
import { Storage } from './storage.js';

function loadClassicScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = new URL(src, import.meta.url).href;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Failed to load classic application dependency: ${src}`));
    document.head.appendChild(script);
  });
}

// Temporary data bridge for the still-classic Utils boundary.
window.LIBRIQ = LIBRIQ;

if (typeof Utils === 'undefined') await loadClassicScript('./utils.js');

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

// Temporary aliases for classic consumers and generated inline handlers.
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
