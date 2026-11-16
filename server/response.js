/**
 * Standardized HTTP response helper module.
 * Guarantees uniform response schemas across all endpoints:
 *   Success: { success: true, data: any, meta?: object }
 *   Error:   { success: false, error: { code: string, message: string, details?: any } }
 */

const BASE_HEADERS = Object.freeze({
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
});

export function createSuccessResponse(data = null, meta = null) {
  const payload = {
    success: true,
    data,
  };
  if (meta && typeof meta === 'object') {
    Object.assign(payload, meta);
  }
  return payload;
}

export function createErrorResponse(code, message, details = null) {
  const payload = {
    code: String(code || 'INTERNAL_ERROR'),
    message: String(message || 'An unexpected error occurred.'),
  };
  if (details !== null && details !== undefined) {
    payload.details = details;
  }
  return {
    success: false,
    error: payload,
  };
}

export function sendSuccess(res, data = null, statusCode = 200, meta = null) {
  if (res.headersSent) return;
  res.writeHead(statusCode, { ...BASE_HEADERS });
  res.end(JSON.stringify(createSuccessResponse(data, meta)));
}

export function sendError(res, code, message, statusCode = 400, details = null) {
  if (res.headersSent) return;
  const headers = { ...BASE_HEADERS };
  if (statusCode === 401) {
    headers['WWW-Authenticate'] = 'Bearer realm="libriq", charset="UTF-8"';
  }
  res.writeHead(statusCode, headers);
  res.end(JSON.stringify(createErrorResponse(code, message, details)));
}
