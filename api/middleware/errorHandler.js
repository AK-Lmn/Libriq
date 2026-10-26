import { sendError } from '../response.js';

/** Error codes whose messages are authored by us and safe to return verbatim. */
const SAFE_CODES = new Set([
  'VALIDATION_ERROR',
  'NOT_FOUND',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'CONFLICT',
  'RATE_LIMITED',
  'PAYLOAD_TOO_LARGE',
  'MALFORMED_PAYLOAD',
  'UNSUPPORTED_MEDIA_TYPE',
  'REQUEST_TIMEOUT',
  'INVALID_PAYLOAD_STRUCTURE',
]);

function statusToCode(status) {
  if (status === 400) return 'BAD_REQUEST';
  if (status === 401) return 'UNAUTHORIZED';
  if (status === 403) return 'FORBIDDEN';
  if (status === 404) return 'NOT_FOUND';
  if (status === 409) return 'CONFLICT';
  if (status === 413) return 'PAYLOAD_TOO_LARGE';
  if (status === 429) return 'RATE_LIMITED';
  return 'INTERNAL_SERVER_ERROR';
}

/**
 * Centralized error handler.
 * Server-side faults are logged in full but never echoed to the client.
 * @param {Error} err
 * @param {import('node:http').ServerResponse} res
 */
export function handleError(err, res) {
  const status = Number(err?.statusCode || err?.status || 500);
  const code = err?.code && SAFE_CODES.has(err.code) ? err.code : statusToCode(status);

  if (status >= 500) {
    // Full detail stays in the server log; the client gets a generic message.
    console.error('[LibriQ][API] Unhandled error:', {
      name: err?.name || 'Error',
      message: err?.message || 'unknown',
      stack: err?.stack || null,
    });
  }

  if (res.headersSent) return;

  if (status >= 500) {
    sendError(res, 'INTERNAL_SERVER_ERROR', 'An internal server error occurred.', 500);
    return;
  }

  const message = typeof err?.message === 'string' && err.message && status < 500
    ? err.message
    : 'The request could not be completed.';
  const details = err?.details ?? null;

  sendError(res, code, message, status, details);
}
