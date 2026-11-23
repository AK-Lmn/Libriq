// localStorage and sessionStorage keys that more than one module reads or
// writes. A key used by a single module stays as a constant in that module.
// tests/storage-keys.test.js fails if a key string is written out in two
// modules, so a rename can't leave one side reading the old key.
//
// shell-hint.js runs as a classic script before the app loads and can't
// import this file. It keeps its own copies of SESSION_PREF and
// ACTIVE_ACCOUNT_UID, and the test checks they match.
export const STORAGE_KEYS = Object.freeze({
  SESSION_PREF: 'libriq_session_pref',
  PREFERRED_SESSION_MODE: 'libriq_preferred_session_mode',
  // sessionStorage: the mode chosen for this tab.
  SESSION_MODE: 'libriq_session_mode',
  ACTIVE_ACCOUNT_UID: 'libriq_active_account_uid',
  SYNC_BETA_ENABLED: 'libriq_sync_beta_enabled',
  SYNC_DELETE_TOMBSTONES: 'libriq_sync_delete_tombstones',
  DEVICE_ID: 'libriq_device_id',
  INSTALLED: 'libriq_installed',
  ONBOARDING_DISMISSED: 'libriq_onboarding_dismissed',
  DEBUG_SYNC: 'libriq_debug_sync',
  // Also the URL parameter (?libriq_e2e_test_mode=1) that turns on test mode.
  E2E_TEST_MODE: 'libriq_e2e_test_mode',
});
