// Counts a few product moments (sign-up, first book, an import, setting a
// goal) so we can see whether people get value from LibriQ. Only the event
// name is sent, nothing about the reader. /api/product-event adds 1 to a daily
// counter in Firestore (metrics/events-YYYY-MM-DD).
//
// Sent only from the live site. Previews share the production Firebase
// project, and local runs and tests would skew the numbers; tests can force
// it on with ?libriq_product_events=1.

export const EVENTS = ['sign_up', 'first_book', 'import_goodreads', 'import_kindle', 'goal_set'];
const LIVE_HOSTS = new Set(['www.libriq.app', 'libriq.app']);
const ENDPOINT = '/api/product-event';
const SIGNUP_WINDOW_MS = 10 * 60 * 1000;
// Per device, so a reload or an Undo doesn't count the same moment twice.
const SIGNUP_COUNTED_KEY = 'libriq_signup_counted_uid';
const FIRST_BOOK_COUNTED_KEY = 'libriq_first_book_counted';

function beacon(name) {
  const body = JSON.stringify({ name });
  try {
    if (globalThis.navigator?.sendBeacon?.(ENDPOINT, new Blob([body], { type: 'application/json' }))) return;
  } catch { /* fall through */ }
  globalThis.fetch?.(ENDPOINT, { method: 'POST', body, keepalive: true, headers: { 'Content-Type': 'application/json' } }).catch(() => {});
}

export function createProductEvents({
  location = globalThis.location,
  send = beacon,
  storage = globalThis.localStorage,
  now = Date.now,
} = {}) {
  const forced = new URLSearchParams(location?.search || '').get('libriq_product_events') === '1';
  const enabled = LIVE_HOSTS.has(location?.hostname) || forced;
  const read = key => { try { return storage?.getItem(key) ?? null; } catch { return null; } };
  const write = (key, value) => { try { storage?.setItem(key, value); } catch { /* private mode */ } };

  function track(name) {
    if (!enabled || !EVENTS.includes(name)) return;
    try { send(name); } catch { /* never break the app for a counter */ }
  }

  return {
    track,
    // Firebase marks when an account was created. A signed-in user whose
    // account is minutes old has just signed up, by email or with Google.
    trackSignUp(user) {
      const created = Date.parse(user?.metadata?.creationTime || '');
      if (!user?.uid || !Number.isFinite(created) || now() - created > SIGNUP_WINDOW_MS) return;
      if (read(SIGNUP_COUNTED_KEY) === user.uid) return;
      write(SIGNUP_COUNTED_KEY, user.uid);
      track('sign_up');
    },
    trackFirstBook(bookCount) {
      if (bookCount !== 1 || read(FIRST_BOOK_COUNTED_KEY) === '1') return;
      write(FIRST_BOOK_COUNTED_KEY, '1');
      track('first_book');
    },
  };
}

export const ProductEvents = createProductEvents();
