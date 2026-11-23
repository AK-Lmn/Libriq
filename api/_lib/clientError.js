// Collects error reports from frontend/js/shared/errorReporting.js. Each
// report becomes one short log line in the Vercel function logs. Fields are
// scrubbed and capped here too, so a hand-made request can't put an email
// address or a long payload in the logs.
//
// Vercel Hobby keeps runtime logs for about an hour, so in production, for
// requests from the live site, reports are also stored in Firestore: one
// document per distinct error per day (clientErrors/{day}-{fingerprint})
// whose count goes up on repeats. Previews use the same Firebase project and
// are not stored.
import { createHash } from 'node:crypto';
import { scrub } from '../../frontend/js/shared/errorReporting.js';

const MAX_BODY = 8000;
const KINDS = new Set(['error', 'unhandledrejection']);
const ALLOWED_ORIGINS = new Set(['https://www.libriq.app', 'https://libriq.app']);

function parseBody(body) {
  if (body == null) return { tooLarge: false, value: null };
  const text = typeof body === 'string' || Buffer.isBuffer(body) ? String(body) : JSON.stringify(body);
  if (text.length > MAX_BODY) return { tooLarge: true, value: null };
  try { return { tooLarge: false, value: JSON.parse(text) }; } catch { return { tooLarge: false, value: null }; }
}

const number = value => (Number.isFinite(Number(value)) && value !== null ? Number(value) : null);

export const errorFingerprint = entry => createHash('sha256')
  .update([entry.kind, entry.message, entry.source, entry.line].join('|'))
  .digest('hex')
  .slice(0, 16);

export function createClientErrorHandler({
  log = entry => console.warn('[client-error]', JSON.stringify(entry)),
  store = null,
  env = process.env,
  now = Date.now,
} = {}) {
  return async function clientError(req, res) {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).end();
    }
    res.setHeader('Cache-Control', 'no-store');
    const { tooLarge, value } = parseBody(req.body);
    if (tooLarge) return res.status(413).end();
    if (!value || typeof value !== 'object' || !KINDS.has(value.kind) || !value.message) return res.status(400).end();
    const entry = {
      kind: value.kind,
      message: scrub(value.message),
      page: scrub(value.page),
      source: scrub(value.source),
      line: number(value.line),
      column: number(value.column),
      stack: scrub(value.stack, 2000),
      release: scrub(value.release, 40),
    };
    log(entry);
    const live = env.VERCEL_ENV === 'production' && ALLOWED_ORIGINS.has(String(req.headers?.origin || ''));
    if (store && live) {
      try {
        await store({ ...entry, fingerprint: errorFingerprint(entry) }, new Date(now()).toISOString().slice(0, 10));
      } catch (error) {
        console.error('[client-error] store failed', error?.message || String(error));
      }
    }
    return res.status(204).end();
  };
}
