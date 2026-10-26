import url from 'node:url';
import { issueToken, verifyToken, verifyCredentials, hasConfiguredCredentials } from './auth.js';
import { defaultCatalog, CatalogError } from './catalog.js';
import { requireAuth, requireRole } from './middleware/auth.js';
import { parseJsonBody, validatePayload, parsePagination } from './middleware/validate.js';
import { handleError } from './middleware/errorHandler.js';
import { enforceRateLimit, enforceAuthRateLimit } from './middleware/rateLimit.js';
import { sendSuccess, sendError } from './response.js';

const ISBN_PATTERN = /^[0-9Xx-]{10,17}$/;
const STATUS_VALUES = ['available', 'partially_available', 'reserved', 'checked_out'];

/**
 * Dispatches API requests with standardized responses, validation, and auth.
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {import('./catalog.js').CatalogStore} [catalog]
 * @returns {Promise<boolean>} True if route was handled, false if not an API route
 */
export async function handleApiRequest(req, res, catalog = defaultCatalog) {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname || '/';

  if (!pathname.startsWith('/api/')) {
    return false;
  }

  try {
    if (!enforceRateLimit(req, res, 'global')) return true;

    // --- Auth Routes ---
    // Tokens are only issued against configured credentials. Role and
    // permissions come from the credential record, never from the request.
    if (pathname === '/api/auth/token' && req.method === 'POST') {
      if (!enforceAuthRateLimit(req, res)) return true;

      if (!hasConfiguredCredentials()) {
        sendError(
          res,
          'AUTH_UNAVAILABLE',
          'Token issuance is not configured. Set AUTH_USERS to enable sign-in.',
          503
        );
        return true;
      }

      const parsedBody = await parseJsonBody(req, res);
      if (parsedBody === false) return true;

      const validation = validatePayload(parsedBody.body, {
        userId: { type: 'string', required: true, maxLength: 128 },
        password: { type: 'string', required: true, maxLength: 256, preserveWhitespace: true },
      });
      if (!validation.valid) {
        sendError(res, 'VALIDATION_ERROR', 'Validation failed.', 400, validation.errors);
        return true;
      }

      const identity = verifyCredentials(validation.value.userId, validation.value.password);
      if (!identity) {
        // Identical response for unknown user and wrong password.
        sendError(res, 'INVALID_CREDENTIALS', 'Invalid user ID or password.', 401);
        return true;
      }

      const token = issueToken({
        userId: identity.userId,
        role: identity.role,
        permissions: identity.permissions,
      });

      const verified = verifyToken(token);
      sendSuccess(res, {
        token,
        tokenType: 'Bearer',
        expiresAt: verified.valid ? new Date(verified.payload.exp * 1000).toISOString() : null,
        expiresIn: verified.valid ? verified.payload.exp - verified.payload.iat : null,
      });
      return true;
    }

    if (pathname === '/api/auth/verify' && req.method === 'POST') {
      if (!enforceAuthRateLimit(req, res)) return true;

      const parsedBody = await parseJsonBody(req, res);
      if (parsedBody === false) return true;

      const validation = validatePayload(parsedBody.body, {
        token: { type: 'string', required: true, maxLength: 4096, preserveWhitespace: true },
      });
      if (!validation.valid) {
        sendError(res, 'TOKEN_MISSING', 'Token is required for verification.', 400);
        return true;
      }

      const result = verifyToken(validation.value.token);
      if (!result.valid) {
        sendError(res, result.error, result.message, 401);
        return true;
      }

      sendSuccess(res, {
        valid: true,
        payload: {
          sub: result.payload.sub,
          role: result.payload.role,
          permissions: result.payload.permissions,
          iat: result.payload.iat,
          exp: result.payload.exp,
        },
      });
      return true;
    }

    if (pathname === '/api/auth/me' && req.method === 'GET') {
      const authPassed = await requireAuth()(req, res);
      if (!authPassed) return true;

      sendSuccess(res, {
        user: {
          sub: req.user.sub,
          role: req.user.role,
          permissions: req.user.permissions,
          exp: req.user.exp,
        },
      });
      return true;
    }

    // --- Catalog Routes ---
    // POST /api/catalog/resources (Create)
    if (pathname === '/api/catalog/resources' && req.method === 'POST') {
      const authPassed = await requireAuth()(req, res);
      if (!authPassed) return true;

      const rolePassed = await requireRole(['admin', 'librarian'])(req, res);
      if (!rolePassed) return true;

      const parsedBody = await parseJsonBody(req, res);
      if (parsedBody === false) return true;

      const validation = validatePayload(parsedBody.body, {
        title: { type: 'string', required: true, minLength: 1, maxLength: 300 },
        author: { type: 'string', required: true, minLength: 1, maxLength: 200 },
        isbn: { type: 'string', required: false, maxLength: 17, pattern: ISBN_PATTERN },
        totalCopies: { type: 'number', required: false, integer: true, min: 1, max: 100000 },
        genres: { type: 'array', required: false, itemType: 'string', maxItems: 20, itemMaxLength: 60 },
      });
      if (!validation.valid) {
        sendError(res, 'VALIDATION_ERROR', 'Validation failed.', 400, validation.errors);
        return true;
      }

      const resource = catalog.createResource(validation.value);
      sendSuccess(res, resource, 201);
      return true;
    }

    // GET /api/catalog/resources (List, paginated)
    if (pathname === '/api/catalog/resources' && req.method === 'GET') {
      const wantsDeleted = parsed.query.includeDeleted === 'true';
      let includeDeleted = false;

      // Soft-deleted records are staff-only.
      if (wantsDeleted) {
        const authPassed = await requireAuth()(req, res);
        if (!authPassed) return true;
        const rolePassed = await requireRole(['admin', 'librarian'])(req, res);
        if (!rolePassed) return true;
        includeDeleted = true;
      }

      const status = parsed.query.status ? String(parsed.query.status) : null;
      if (status && !STATUS_VALUES.includes(status)) {
        sendError(res, 'VALIDATION_ERROR', 'Validation failed.', 400, [
          `Query parameter "status" must be one of: ${STATUS_VALUES.join(', ')}.`,
        ]);
        return true;
      }

      const search = String(parsed.query.search || '').slice(0, 200);
      const pagination = parsePagination(parsed.query);
      if (pagination.errors.length) {
        sendError(res, 'VALIDATION_ERROR', 'Validation failed.', 400, pagination.errors);
        return true;
      }

      const page = catalog.listResources({
        includeDeleted,
        status,
        search,
        limit: pagination.limit,
        offset: pagination.offset,
      });

      sendSuccess(res, page.items, 200, {
        pagination: {
          total: page.total,
          limit: page.limit,
          offset: page.offset,
          hasMore: page.hasMore,
        },
      });
      return true;
    }

    // Single resource operations
    const resourceMatch = pathname.match(/^\/api\/catalog\/resources\/([^/]+)(\/(reserve|checkout|return|reconcile))?$/);
    if (resourceMatch) {
      const resourceId = resourceMatch[1];
      const action = resourceMatch[3];

      // GET /api/catalog/resources/:id
      if (!action && req.method === 'GET') {
        const wantsDeleted = parsed.query.includeDeleted === 'true';
        let includeDeleted = false;

        if (wantsDeleted) {
          const authPassed = await requireAuth()(req, res);
          if (!authPassed) return true;
          const rolePassed = await requireRole(['admin', 'librarian'])(req, res);
          if (!rolePassed) return true;
          includeDeleted = true;
        }

        const resource = catalog.getResource(resourceId, { includeDeleted });
        if (!resource) {
          sendError(res, 'NOT_FOUND', 'Resource not found.', 404);
          return true;
        }
        sendSuccess(res, resource);
        return true;
      }

      // PATCH /api/catalog/resources/:id
      if (!action && req.method === 'PATCH') {
        const authPassed = await requireAuth()(req, res);
        if (!authPassed) return true;

        const rolePassed = await requireRole(['admin', 'librarian'])(req, res);
        if (!rolePassed) return true;

        const parsedBody = await parseJsonBody(req, res);
        if (parsedBody === false) return true;

        const validation = validatePayload(parsedBody.body, {
          title: { type: 'string', required: false, minLength: 1, maxLength: 300 },
          author: { type: 'string', required: false, minLength: 1, maxLength: 200 },
          isbn: { type: 'string', required: false, maxLength: 17, pattern: ISBN_PATTERN },
          totalCopies: { type: 'number', required: false, integer: true, min: 1, max: 100000 },
          genres: { type: 'array', required: false, itemType: 'string', maxItems: 20, itemMaxLength: 60 },
        }, { requireAtLeastOne: true });
        if (!validation.valid) {
          sendError(res, 'VALIDATION_ERROR', 'Validation failed.', 400, validation.errors);
          return true;
        }

        const updated = catalog.updateResource(resourceId, validation.value);
        sendSuccess(res, updated);
        return true;
      }

      // DELETE /api/catalog/resources/:id
      if (!action && req.method === 'DELETE') {
        const authPassed = await requireAuth()(req, res);
        if (!authPassed) return true;

        const rolePassed = await requireRole(['admin'])(req, res);
        if (!rolePassed) return true;

        const isHard = parsed.query.hard === 'true';
        if (isHard) {
          catalog.hardDeleteResource(resourceId);
          sendSuccess(res, { id: resourceId, deleted: true, hard: true });
        } else {
          const softDeleted = catalog.softDeleteResource(resourceId);
          sendSuccess(res, softDeleted);
        }
        return true;
      }

      // POST /api/catalog/resources/:id/reserve
      if (action === 'reserve' && req.method === 'POST') {
        const authPassed = await requireAuth()(req, res);
        if (!authPassed) return true;

        const resource = catalog.reserveResource(resourceId, req.user.sub);
        sendSuccess(res, resource);
        return true;
      }

      // POST /api/catalog/resources/:id/checkout
      if (action === 'checkout' && req.method === 'POST') {
        const authPassed = await requireAuth()(req, res);
        if (!authPassed) return true;

        const resource = catalog.checkoutResource(resourceId, req.user.sub);
        sendSuccess(res, resource);
        return true;
      }

      // POST /api/catalog/resources/:id/return
      if (action === 'return' && req.method === 'POST') {
        const authPassed = await requireAuth()(req, res);
        if (!authPassed) return true;

        const resource = catalog.returnResource(resourceId, req.user.sub);
        sendSuccess(res, resource);
        return true;
      }

      // GET /api/catalog/resources/:id/reconcile (staff only: exposes inventory internals)
      if (action === 'reconcile' && req.method === 'GET') {
        const authPassed = await requireAuth()(req, res);
        if (!authPassed) return true;

        const rolePassed = await requireRole(['admin', 'librarian'])(req, res);
        if (!rolePassed) return true;

        const reconciliation = catalog.reconcileInventory(resourceId);
        sendSuccess(res, reconciliation);
        return true;
      }
    }

    sendError(res, 'NOT_FOUND', 'Route not found.', 404);
    return true;
  } catch (err) {
    if (err instanceof CatalogError) {
      sendError(res, err.code, err.message, err.statusCode, err.details);
      return true;
    }
    handleError(err, res);
    return true;
  }
}
