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

`frontend/js/appModules.js` remains the single browser bootstrap. It imports Data and Storage, temporarily installs only `window.LIBRIQ` for classic Utils, loads `utils.js` and waits for it to execute, then imports the remaining application graph. It installs `window.LibriqStorage` only for browser/E2E control, initializes Firebase, Sync, and Cloud Backup once, and calls `bootApp()` exactly once. Finally it sets `window.__LIBRIQ_APP_READY__` and emits the single browser-observable `libriq:app-ready` signal used by smoke/E2E tests.

`firebase-client.js` exports the import-safe `LibriqFirebase` facade. Firebase SDK evaluation remains at module scope, while configuration lookup, app/auth/Firestore initialization, auth subscription, browser listeners, test adapters, and E2E hooks are owned by its explicit idempotent `init()`. App, Sync, Navigation, Dashboard, and Library import this facade directly. Sync uses its narrow Firestore binding surface (`getFirestoreClient`, document/collection/query helpers, snapshot subscription, and document writes) without owning Firebase initialization.

`cloudBackup.js` is the import-safe cloud-backup operation module. It owns eligibility, debounce and in-flight state, automatic and manual writes, UID isolation, offline/reconnect handling, payload construction, backup validation, restore replacement, and cloud merge rules. It imports the Firebase facade, Storage, and data constructors directly, while Utils remains its temporary classic global. Navigation retains Settings markup, previews, confirmations, toasts, and post-operation rendering, but imports the Cloud Backup facade for all operations. Account Sync remains a separate module and Firestore path.

Navigation imports `BookAPI`, `Library`, `Search`, and `Dashboard` directly. Its page renderers remain private while the existing public routing/auth/settings facade is exported. Sync imports Navigation directly and exports `LibriqSyncBeta`; App also imports that facade directly for its event wiring. `appModules.js` centrally installs temporary Firebase and Sync bridges for E2E access and the remaining classic boundary. `window.Navigation` remains for generated inline handlers, while `window.LibriqNavigation` remains for E2E hooks. `window.BookAPI` and `window.Dashboard` have been removed.

`app.js` is an import-safe ES module that imports Navigation, Library, and Search directly. It owns Storage bootstrap, the three idempotent initializers, auth-ready routing, global application events, release notes, reset handling, and service-worker behavior.

The bootstrap initializes Firebase, Sync, and Cloud Backup once before App boot. `window.LibriqCloudBackup` is installed centrally for browser diagnostics and E2E coverage; migrated production modules use direct imports.

Remaining classic/global boundaries are Utils, runtime configuration, and generated handlers. Utils consumes `LIBRIQ`, so `window.LIBRIQ` and the deterministic classic Utils loader remain until its migration. `window.Navigation` remains for generated inline handlers, while `window.LibriqNavigation`, `window.LibriqStorage`, Firebase, Sync, and Cloud Backup bridges remain for deterministic browser/E2E control.

Utils is the recommended next migration target: export its current facade, remove import-time global installation, import any constants it needs directly, update module consumers to direct imports, and then remove the final classic loader and `window.LIBRIQ` bridge.
