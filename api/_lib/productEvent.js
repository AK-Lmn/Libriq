// Counts product events sent by frontend/js/shared/productEvents.js: one
// Firestore field per event name in a document per UTC day
// (metrics/events-2026-11-23). Only counts, no user or device data.
//
// Counted only in production, for requests from the live site. Previews use
// the same Firebase project and would skew the numbers. The Origin check
// stops casual cross-site posts; it isn't a guarantee, since these are
// low-stakes counters.
import { EVENTS } from '../../frontend/js/shared/productEvents.js';

const ALLOWED_ORIGINS = new Set(['https://www.libriq.app', 'https://libriq.app']);

export const dayKey = time => new Date(time).toISOString().slice(0, 10);

function parse(body) {
  if (body == null) return null;
  if (typeof body === 'object' && !Buffer.isBuffer(body)) return body;
  const text = String(body);
  if (text.length > 200) return null;
  try { return JSON.parse(text); } catch { return null; }
}

export function createProductEventHandler({ increment, env = process.env, now = Date.now }) {
  return async function productEvent(req, res) {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).end();
    }
    res.setHeader('Cache-Control', 'no-store');
    if (!ALLOWED_ORIGINS.has(String(req.headers?.origin || ''))) return res.status(403).end();
    const name = parse(req.body)?.name;
    if (!EVENTS.includes(name)) return res.status(400).end();
    if (env.VERCEL_ENV !== 'production') return res.status(204).end();
    try {
      await increment(name, dayKey(now()));
    } catch (error) {
      console.error('[product-event] count failed', error?.message || String(error));
    }
    return res.status(204).end();
  };
}
