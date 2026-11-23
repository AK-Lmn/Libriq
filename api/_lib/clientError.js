// Collects error reports from frontend/js/shared/errorReporting.js. Each
// report becomes one short log line in the Vercel function logs. Nothing is
// stored. Fields are scrubbed and capped here too, so a hand-made request
// can't put an email address or a long payload in the logs.
import { scrub } from '../../frontend/js/shared/errorReporting.js';

const MAX_BODY = 8000;
const KINDS = new Set(['error', 'unhandledrejection']);

function parseBody(body) {
  if (body == null) return { tooLarge: false, value: null };
  const text = typeof body === 'string' || Buffer.isBuffer(body) ? String(body) : JSON.stringify(body);
  if (text.length > MAX_BODY) return { tooLarge: true, value: null };
  try { return { tooLarge: false, value: JSON.parse(text) }; } catch { return { tooLarge: false, value: null }; }
}

const number = value => (Number.isFinite(Number(value)) && value !== null ? Number(value) : null);

export function createClientErrorHandler({ log = entry => console.warn('[client-error]', JSON.stringify(entry)) } = {}) {
  return async function clientError(req, res) {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).end();
    }
    res.setHeader('Cache-Control', 'no-store');
    const { tooLarge, value } = parseBody(req.body);
    if (tooLarge) return res.status(413).end();
    if (!value || typeof value !== 'object' || !KINDS.has(value.kind) || !value.message) return res.status(400).end();
    log({
      kind: value.kind,
      message: scrub(value.message),
      page: scrub(value.page),
      source: scrub(value.source),
      line: number(value.line),
      column: number(value.column),
      stack: scrub(value.stack, 2000),
      release: scrub(value.release, 40),
    });
    return res.status(204).end();
  };
}
