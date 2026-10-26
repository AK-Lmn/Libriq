import { loadConfig } from '../config.js';
import { sendError } from '../response.js';

const config = loadConfig(process.env, false);

const WINDOW_MS = config.RATE_LIMIT_WINDOW_MS || 60000;
const MAX_REQUESTS = config.RATE_LIMIT_MAX_REQUESTS || 300;
const MAX_AUTH_REQUESTS = config.RATE_LIMIT_MAX_AUTH_REQUESTS || 10;
const ENABLED = config.RATE_LIMIT_ENABLED !== false;

/** Hard ceiling on tracked clients so the limiter itself cannot exhaust memory. */
const MAX_TRACKED_CLIENTS = 10000;

const buckets = new Map();

function clientKey(req) {
  const socketAddress = req.socket?.remoteAddress || 'unknown';
  return String(socketAddress);
}

function prune(now) {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
  if (buckets.size > MAX_TRACKED_CLIENTS) {
    // Evict oldest insertions first; Map preserves insertion order.
    const excess = buckets.size - MAX_TRACKED_CLIENTS;
    let removed = 0;
    for (const key of buckets.keys()) {
      buckets.delete(key);
      if (++removed >= excess) break;
    }
  }
}

/**
 * Fixed-window rate limiter keyed by client address and bucket name.
 * @param {string} bucketName Logical bucket, e.g. 'auth' or 'global'
 * @param {number} limit Maximum requests per window
 * @returns {{ allowed: boolean, remaining: number, retryAfterSeconds: number, limit: number }}
 */
export function consume(req, bucketName = 'global', limit = MAX_REQUESTS) {
  if (!ENABLED) {
    return { allowed: true, remaining: limit, retryAfterSeconds: 0, limit };
  }

  const now = Date.now();
  prune(now);

  const key = `${bucketName}:${clientKey(req)}`;
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0, limit };
  }

  existing.count += 1;
  if (existing.count > limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
      limit,
    };
  }

  return { allowed: true, remaining: limit - existing.count, retryAfterSeconds: 0, limit };
}

/**
 * Enforces a rate limit, writing a 429 response when exceeded.
 * @returns {boolean} True when the request may proceed.
 */
export function enforceRateLimit(req, res, bucketName = 'global', limit = MAX_REQUESTS) {
  const result = consume(req, bucketName, limit);
  if (result.allowed) return true;

  if (!res.headersSent) {
    res.setHeader('Retry-After', String(result.retryAfterSeconds));
    res.setHeader('X-RateLimit-Limit', String(result.limit));
    res.setHeader('X-RateLimit-Remaining', '0');
  }
  sendError(
    res,
    'RATE_LIMITED',
    `Too many requests. Retry in ${result.retryAfterSeconds} second(s).`,
    429,
    { retryAfterSeconds: result.retryAfterSeconds }
  );
  return false;
}

/** Limits for authentication endpoints, which are far more sensitive than reads. */
export function enforceAuthRateLimit(req, res) {
  return enforceRateLimit(req, res, 'auth', MAX_AUTH_REQUESTS);
}

/** Test helper. */
export function resetRateLimits() {
  buckets.clear();
}

export const RATE_LIMIT_SETTINGS = Object.freeze({
  enabled: ENABLED,
  windowMs: WINDOW_MS,
  maxRequests: MAX_REQUESTS,
  maxAuthRequests: MAX_AUTH_REQUESTS,
});
