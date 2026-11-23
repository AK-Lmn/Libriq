// Which tab the sign-in screen opens on. Someone who has signed in on this
// device before gets "Sign in"; a first-time visitor gets "Create account".
// Signed-out visitors also get libriq:local:* defaults at boot, so only
// account-scoped data (libriq:users:<uid>:*) counts as a past sign-in.
import { STORAGE_KEYS } from './storageKeys.js';

export const RETURNING_READER_KEY = 'libriq_returning_reader';
const ACTIVE_UID_KEY = STORAGE_KEYS.ACTIVE_ACCOUNT_UID;
const ACCOUNT_DATA_PREFIX = 'libriq:users:';

export function isReturningReader(storage) {
  try {
    if (storage.getItem(RETURNING_READER_KEY) === '1' || storage.getItem(ACTIVE_UID_KEY)) return true;
    for (let i = 0; i < storage.length; i += 1) {
      if (String(storage.key(i) || '').startsWith(ACCOUNT_DATA_PREFIX)) return true;
    }
  } catch { /* storage blocked: treat as a first visit */ }
  return false;
}

export function markReturningReader(storage) {
  try { storage.setItem(RETURNING_READER_KEY, '1'); } catch { /* storage blocked */ }
}

// In-app browsers (Instagram, TikTok…) block Google sign-in, so they always
// start on email sign-up.
export function initialAuthMode({ inAppBrowser, storage }) {
  return inAppBrowser || !isReturningReader(storage) ? 'signup' : 'signin';
}
