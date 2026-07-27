import { BookAPI } from './api/index.js';
import { Library } from './library.js';
import { Search } from './search.js';
import { Dashboard } from './dashboard.js';
import { Navigation } from './navigation.js';
import { LibriqFirebase } from './firebase-client.js';
import { LibriqSyncBeta } from './sync.js';
import { LibriqCloudBackup } from './cloudBackup.js';
import { bootApp } from './app.js';

// Temporary aliases for classic consumers and generated inline handlers.
window.Navigation = Navigation;
window.LibriqNavigation = Navigation;
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

export { BookAPI, Library, Search, Dashboard, Navigation, LibriqFirebase, LibriqSyncBeta, LibriqCloudBackup, bootApp };
