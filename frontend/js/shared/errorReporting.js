// Sends uncaught errors and unhandled promise rejections to /api/client-error,
// which writes one log line per report to the Vercel function logs. Nothing
// is stored, and nothing identifies the reader: emails and URL query strings
// are scrubbed, the page is sent as a path, and there is no account id.
//
// At most five reports per page load, each distinct error once. Off on
// localhost and 127.0.0.1 unless ?libriq_error_reports=1 is set.

const ENDPOINT = '/api/client-error';
const MAX_REPORTS = 5;
const MAX_FIELD = 500;
const MAX_STACK = 2000;
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
// Not actionable: cross-origin scripts hide their details ("Script error."),
// and the ResizeObserver warning is harmless browser chatter.
const NOISE = [/^Script error\.?$/i, /^ResizeObserver loop/i];

const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const URL_TAIL = /(https?:\/\/[^\s?#"')]+)[?#][^\s"')]*/g;

export function scrub(value, limit = MAX_FIELD) {
  if (value == null) return null;
  return String(value).replace(EMAIL, '[email]').replace(URL_TAIL, '$1').slice(0, limit);
}

export function buildReport(kind, { message, source, line, column, error }, location, release = null) {
  return {
    kind,
    message: scrub(message),
    source: scrub(source),
    line: Number.isFinite(line) ? line : null,
    column: Number.isFinite(column) ? column : null,
    stack: scrub(error?.stack, MAX_STACK),
    page: scrub(location?.pathname || '/'),
    release: release ? String(release).slice(0, 40) : null,
  };
}

function beacon(report) {
  const body = JSON.stringify(report);
  try {
    if (globalThis.navigator?.sendBeacon?.(ENDPOINT, new Blob([body], { type: 'application/json' }))) return;
  } catch { /* fall through to fetch */ }
  globalThis.fetch?.(ENDPOINT, { method: 'POST', body, keepalive: true, headers: { 'Content-Type': 'application/json' } }).catch(() => {});
}

export function installErrorReporting({
  target = globalThis,
  location = globalThis.location,
  send = beacon,
  release = globalThis.LIBRIQ_APP_VERSION || null,
} = {}) {
  const forced = new URLSearchParams(location?.search || '').get('libriq_error_reports') === '1';
  if (LOCAL_HOSTS.has(location?.hostname) && !forced) return () => {};

  const seen = new Set();
  let count = 0;
  const report = (kind, details) => {
    const message = String(details.message ?? '');
    if (!message || NOISE.some(pattern => pattern.test(message))) return;
    const key = `${kind}|${message}|${details.source || ''}|${details.line || ''}`;
    if (seen.has(key) || count >= MAX_REPORTS) return;
    seen.add(key);
    count += 1;
    try { send(buildReport(kind, details, location, release)); } catch { /* never throw from the reporter */ }
  };

  const onError = event => report('error', {
    // The Error's own message: event.message adds a browser prefix ("Uncaught Error: ").
    message: event?.error?.message || event?.message,
    source: event?.filename,
    line: event?.lineno,
    column: event?.colno,
    error: event?.error,
  });
  const onRejection = event => {
    const reason = event?.reason;
    report('unhandledrejection', {
      message: reason instanceof Error ? reason.message : (typeof reason === 'string' ? reason : JSON.stringify(reason ?? null)),
      error: reason instanceof Error ? reason : null,
    });
  };

  target.addEventListener('error', onError);
  target.addEventListener('unhandledrejection', onRejection);
  return () => {
    target.removeEventListener('error', onError);
    target.removeEventListener('unhandledrejection', onRejection);
  };
}
