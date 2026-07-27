# LibriQ architecture

## Book metadata and provider API

The book API layer uses native browser ES modules so its dependencies are explicit and no longer depend on classic-script ordering. It remains plain JavaScript: no framework, build tool, or bundler is required.

`frontend/js/api/index.js` is the public entry point. Its dependency flow is:

```text
bookIdentity
    └─ normalizeBook
        ├─ openLibrary
        ├─ googleBooks
        └─ gutendex
bookIdentity + normalizeBook ─ mergeBooks
internetArchive ─────────────┐
cache ───────────────────────┼─ index (public BookAPI)
providers + mergeBooks ──────┘
```

There are no circular API dependencies. Provider modules own transport and provider-specific failure state. `normalizeBook` owns conversion to LibriQ's stable saved-book shape, `bookIdentity` owns matching/source identity, `mergeBooks` owns deduplication and metadata priority, and `cache` owns session-scoped search caching. Importing the entry point performs no network requests.

## Data module and temporary classic-script bridge

`frontend/js/data.js` is an import-safe ES module. It exports `LIBRIQ`, `createBook`, `createBookPatch`, `createProfile`, and `SEED_BOOKS`; importing it does not touch storage, the DOM, the network, listeners, or browser globals. App, Cloud Backup, Dashboard, Library, Navigation, and Sync import the data values they use directly.

`package.json` is the application-version authority. The existing build step generates `frontend/js/version.js` for the data module and `frontend/js/version-classic.js` for the service worker, so `LIBRIQ.VERSION`, release-note routing, backup/sync payloads, and the service-worker cache namespace use the same version.

The API entry exports `BookAPI`; it is consumed through ES imports and is no longer assigned to a browser global.

`frontend/js/storage.js` is an import-safe ES module. It imports `LIBRIQ`, `createBook`, `createProfile`, and `SEED_BOOKS` directly and exports the existing `Storage` facade without installing globals or touching local storage at import time. `bootApp()` remains the sole production owner of its idempotent `bootstrap()`. Bootstrap restores the persisted active account UID before repairing or creating scoped defaults and retrieving the stable device ID. All existing keys, local/account key formats, schemas, migrations, events, and reset behavior remain compatible.

App, Library, Search, Dashboard, Navigation, Firebase, Account Sync, and Cloud Backup import Storage directly. Firebase retains ownership of authentication, hydration, offline queues, reconnect replay, account switching, and sign-out orchestration; Sync and Cloud Backup retain their existing algorithms, paths, and payloads.

`frontend/js/utils.js` is an import-safe ES module. It imports only `LIBRIQ` from the data layer and exports the existing formatting, sanitization, book-markup, DOM, and toast facade. Importing it performs no DOM, storage, listener, timer, network, or global work. App, Library, Search, Dashboard, Navigation, Account Sync, and Cloud Backup import Utils directly.

`frontend/js/appModules.js` remains the single browser bootstrap. It statically imports Data, Storage, and Utils, then imports the remaining application graph. The classic Utils loader and `window.LIBRIQ` data bridge are removed. It installs `window.Utils` only because the existing generated cover-image `onerror` fallback calls `Utils.buildCoverPlaceholder`; other migrated production code uses direct imports. The bootstrap then initializes Firebase, Sync, and Cloud Backup once, calls `bootApp()` exactly once, and publishes the existing readiness signal.

`firebase-client.js` exports the import-safe `LibriqFirebase` facade. Firebase SDK evaluation remains at module scope, while configuration lookup, app/auth/Firestore initialization, auth subscription, browser listeners, test adapters, and E2E hooks are owned by its explicit idempotent `init()`. App, Sync, Navigation, Dashboard, and Library import this facade directly. Sync uses its narrow Firestore binding surface (`getFirestoreClient`, document/collection/query helpers, snapshot subscription, and document writes) without owning Firebase initialization.

`cloudBackup.js` is the import-safe cloud-backup operation module. It owns eligibility, debounce and in-flight state, automatic and manual writes, UID isolation, offline/reconnect handling, payload construction, backup validation, restore replacement, and cloud merge rules. It imports the Firebase facade, Storage, Utils, and data constructors directly. Navigation retains Settings markup, previews, confirmations, toasts, and post-operation rendering, but imports the Cloud Backup facade for all operations. Account Sync remains a separate module and Firestore path.

Navigation imports `BookAPI`, `Library`, `Search`, and `Dashboard` directly. Its page renderers remain private while the existing public routing/auth/settings facade is exported. Sync imports Navigation directly and exports `LibriqSyncBeta`; App also imports that facade directly for its event wiring. `appModules.js` centrally installs temporary Firebase and Sync bridges for E2E access and the remaining classic boundary. `window.Navigation` remains for generated inline handlers, while `window.LibriqNavigation` remains for E2E hooks. `window.BookAPI` and `window.Dashboard` have been removed.

`app.js` is an import-safe ES module that imports Navigation, Library, and Search directly. It owns Storage bootstrap, the three idempotent initializers, auth-ready routing, global application events, release notes, reset handling, and service-worker behavior.

The bootstrap initializes Firebase, Sync, and Cloud Backup once before App boot. `window.LibriqCloudBackup` is installed centrally for browser diagnostics and E2E coverage; migrated production modules use direct imports.

Remaining classic/global boundaries are runtime configuration and generated inline handlers. `window.Navigation`, `window.Library`, `window.Search`, and `window.Utils` support those generated handlers; `window.LibriqNavigation`, `window.LibriqStorage`, Firebase, Sync, and Cloud Backup bridges support deterministic browser/E2E control.

Runtime configuration is the recommended next module-boundary review. Generated inline handlers should be migrated separately to delegated module-owned listeners before removing their Navigation, Library, Search, and Utils bridges.
