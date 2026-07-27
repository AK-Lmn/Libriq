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

## Temporary classic-script bridge

The API entry exports `BookAPI`; it is consumed through ES imports and is no longer assigned to a browser global.

`frontend/js/appModules.js` is the single browser bootstrap. It imports the API, Library, Search, Dashboard, Navigation, the Firebase facade, Account Sync, and `bootApp`. It installs required compatibility aliases, initializes Firebase once, initializes Sync once, then calls `bootApp()` exactly once. After initialization it sets `window.__LIBRIQ_APP_READY__` and emits the single browser-observable `libriq:app-ready` signal used by smoke/E2E tests.

`firebase-client.js` exports the import-safe `LibriqFirebase` facade. Firebase SDK evaluation remains at module scope, while configuration lookup, app/auth/Firestore initialization, auth subscription, browser listeners, test adapters, and E2E hooks are owned by its explicit idempotent `init()`. App, Sync, Navigation, Dashboard, and Library import this facade directly. Sync uses its narrow Firestore binding surface (`getFirestoreClient`, document/collection/query helpers, snapshot subscription, and document writes) without owning Firebase initialization.

`cloudBackup.js` is the import-safe cloud-backup operation module. It owns eligibility, debounce and in-flight state, automatic and manual writes, UID isolation, offline/reconnect handling, payload construction, backup validation, restore replacement, and cloud merge rules. It imports the Firebase facade and temporarily uses global Storage, Utils, LIBRIQ, and data constructors. Navigation retains Settings markup, previews, confirmations, toasts, and post-operation rendering, but imports the Cloud Backup facade for all operations. Account Sync remains a separate module and Firestore path.

Navigation imports `BookAPI`, `Library`, `Search`, and `Dashboard` directly. Its page renderers remain private while the existing public routing/auth/settings facade is exported. Sync imports Navigation directly and exports `LibriqSyncBeta`; App also imports that facade directly for its event wiring. `appModules.js` centrally installs temporary Firebase and Sync bridges for E2E access and the remaining classic boundary. `window.Navigation` remains for generated inline handlers, while `window.LibriqNavigation` remains for E2E hooks. `window.BookAPI` and `window.Dashboard` have been removed.

`app.js` is an import-safe ES module that imports Navigation, Library, and Search directly. It owns Storage bootstrap, the three idempotent initializers, auth-ready routing, global application events, release notes, reset handling, and service-worker behavior.

The bootstrap initializes Firebase, Sync, and Cloud Backup once before App boot. `window.LibriqCloudBackup` is installed centrally for browser diagnostics and E2E coverage; migrated production modules use direct imports.

Remaining classic/global boundaries are Storage, Utils, `LIBRIQ`, runtime configuration, data constructors, and generated handlers. Firebase, Sync, and Cloud Backup own no browser side effects until their explicit `init()` calls. `window.Navigation`, `window.LibriqNavigation`, `window.Library`, and `window.Search` remain for E2E hooks and inline handlers; Firebase and Cloud Backup bridges remain for deterministic E2E control. Storage is the recommended next migration target, beginning with its book/profile/goals/streak/activity and backup-metadata read/write surface.
