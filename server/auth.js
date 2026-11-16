import crypto from 'node:crypto';
import { loadConfig, resolveAuthSecret, TOKEN_TTL_HARD_CAP_SECONDS } from './config.js';

const ALLOWED_ROLES = Object.freeze(['user', 'librarian', 'admin']);
const ALLOWED_PERMISSIONS = Object.freeze(['read', 'reserve', 'checkout', 'return', 'manage_catalog']);
const MAX_PERMISSIONS = 16;
const SCRYPT_KEYLEN = 64;

let cachedSecret = null;

function getSecret() {
  // Fails closed: a broken or insecure configuration throws rather than
  // silently signing tokens with a publicly known development secret.
  if (cachedSecret === null) {
    cachedSecret = resolveAuthSecret(process.env);
  }
  return cachedSecret;
}

/** Test/bootstrap helper so a process can pick up a changed environment. */
export function resetAuthSecretCache() {
  cachedSecret = null;
  cachedCredentials = null;
}

function base64UrlEncode(str) {
  return Buffer.from(str).toString('base64url');
}

function base64UrlDecode(str) {
  return Buffer.from(str, 'base64url').toString('utf8');
}

function sign(content, secret) {
  return crypto.createHmac('sha256', secret).update(content).digest('base64url');
}

function normalizeRole(role) {
  const candidate = String(role || 'user').trim().toLowerCase();
  return ALLOWED_ROLES.includes(candidate) ? candidate : 'user';
}

function normalizePermissions(permissions) {
  if (!Array.isArray(permissions)) return [];
  const unique = new Set();
  for (const permission of permissions) {
    const candidate = String(permission || '').trim().toLowerCase();
    if (ALLOWED_PERMISSIONS.includes(candidate)) unique.add(candidate);
    if (unique.size >= MAX_PERMISSIONS) break;
  }
  return Array.from(unique);
}

/**
 * Clamps the requested lifetime to a positive integer within the hard cap.
 * Non-numeric, negative, and oversized values collapse to a safe default so a
 * token can never be issued without an enforceable numeric expiry.
 */
export function resolveExpiresIn(requested, { defaultTtl = null } = {}) {
  const config = loadConfig(process.env, false);
  const fallback = Number.isInteger(defaultTtl) && defaultTtl > 0
    ? defaultTtl
    : (Number.isInteger(config.TOKEN_TTL_SECONDS) ? config.TOKEN_TTL_SECONDS : 3600);

  if (requested === undefined || requested === null || requested === '') return fallback;

  const numeric = Number(requested);
  if (!Number.isFinite(numeric)) return fallback;

  const floored = Math.floor(numeric);
  if (floored <= 0) return fallback;

  return Math.min(floored, TOKEN_TTL_HARD_CAP_SECONDS);
}

/**
 * Issues a signed JWT-like token.
 * Reserved claims (sub, role, permissions, iat, exp) cannot be overridden by callers.
 * @param {Object} claims User claims (sub, role, permissions)
 * @param {Object} options Options like expiresIn (seconds), secret
 * @returns {string} Signed token
 */
export function issueToken(claims = {}, options = {}) {
  const secret = options.secret || getSecret();
  const now = Math.floor(Date.now() / 1000);
  const expiresIn = resolveExpiresIn(options.expiresIn, { defaultTtl: options.defaultTtl });

  const header = {
    alg: 'HS256',
    typ: 'JWT',
  };

  const {
    sub: _ignoredSub,
    userId: _ignoredUserId,
    role: _ignoredRole,
    permissions: _ignoredPermissions,
    iat: _ignoredIat,
    exp: _ignoredExp,
    ...safeClaims
  } = claims;

  // Reserved claims are assigned last so untrusted input cannot overwrite them.
  const payload = {
    ...safeClaims,
    sub: String(claims.sub || claims.userId || 'anonymous'),
    role: normalizeRole(claims.role),
    permissions: normalizePermissions(claims.permissions),
    iat: now,
    exp: now + expiresIn,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = sign(`${encodedHeader}.${encodedPayload}`, secret);

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

/**
 * Verifies and decodes a signed token.
 * @param {string} token
 * @param {string} [secret]
 * @returns {{ valid: boolean, payload?: Object, error?: string, message?: string }}
 */
export function verifyToken(token, secret = null) {
  let signingSecret;
  try {
    signingSecret = secret || getSecret();
  } catch {
    return { valid: false, error: 'AUTH_UNAVAILABLE', message: 'Authentication is not configured correctly.' };
  }

  if (typeof token !== 'string' || !token.trim()) {
    return { valid: false, error: 'TOKEN_MISSING', message: 'Token is missing or not a string.' };
  }

  const parts = token.trim().split('.');
  if (parts.length !== 3) {
    return { valid: false, error: 'TOKEN_MALFORMED', message: 'Token format is invalid.' };
  }

  const [encodedHeader, encodedPayload, receivedSignature] = parts;

  let header;
  let payload;
  try {
    header = JSON.parse(base64UrlDecode(encodedHeader));
    payload = JSON.parse(base64UrlDecode(encodedPayload));
  } catch {
    return { valid: false, error: 'TOKEN_MALFORMED', message: 'Token encoding or JSON is invalid.' };
  }

  if (header.alg !== 'HS256' || header.typ !== 'JWT') {
    return { valid: false, error: 'TOKEN_INVALID_HEADER', message: 'Unsupported algorithm or token type.' };
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { valid: false, error: 'TOKEN_MALFORMED', message: 'Token payload is invalid.' };
  }

  const expectedSignature = sign(`${encodedHeader}.${encodedPayload}`, signingSecret);
  const receivedSigBuf = Buffer.from(receivedSignature);
  const expectedSigBuf = Buffer.from(expectedSignature);

  if (receivedSigBuf.length !== expectedSigBuf.length || !crypto.timingSafeEqual(receivedSigBuf, expectedSigBuf)) {
    return { valid: false, error: 'TOKEN_TAMPERED', message: 'Token signature verification failed (tampered).' };
  }

  // A token without a usable numeric expiry is rejected outright: no
  // non-numeric or missing `exp` can produce a token that never expires.
  if (!Number.isFinite(payload.exp) || !Number.isInteger(payload.exp)) {
    return { valid: false, error: 'TOKEN_MALFORMED', message: 'Token is missing a valid numeric expiry.' };
  }

  if (!Number.isInteger(payload.iat) || payload.exp <= payload.iat) {
    return { valid: false, error: 'TOKEN_MALFORMED', message: 'Token issued-at and expiry claims are inconsistent.' };
  }

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp - payload.iat > TOKEN_TTL_HARD_CAP_SECONDS) {
    return { valid: false, error: 'TOKEN_LIFETIME_EXCEEDED', message: 'Token lifetime exceeds the permitted maximum.' };
  }

  if (payload.exp < now) {
    return { valid: false, error: 'TOKEN_EXPIRED', message: 'Token has expired.' };
  }

  if (!ALLOWED_ROLES.includes(payload.role)) {
    return { valid: false, error: 'TOKEN_INVALID_CLAIMS', message: 'Token role claim is not recognised.' };
  }

  return {
    valid: true,
    payload,
  };
}

let cachedCredentials = null;

/**
 * Parses AUTH_USERS into a credential directory.
 * Format: [{ "userId": "...", "role": "admin", "permissions": [], "passwordSalt": "hex", "passwordHash": "hex" }]
 * For development convenience a plaintext `password` is accepted outside production.
 */
function loadCredentials() {
  if (cachedCredentials) return cachedCredentials;

  const raw = String(process.env.AUTH_USERS || '').trim();
  const isProduction = (process.env.NODE_ENV || 'development') === 'production';

  if (!raw) {
    cachedCredentials = [];
    return cachedCredentials;
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const err = new Error('AUTH_USERS could not be parsed as JSON.');
    err.name = 'ConfigValidationError';
    throw err;
  }

  if (!Array.isArray(parsed)) {
    const err = new Error('AUTH_USERS must be a JSON array.');
    err.name = 'ConfigValidationError';
    throw err;
  }

  cachedCredentials = parsed
    .filter(entry => entry && typeof entry === 'object' && entry.userId)
    .map(entry => {
      if (isProduction && !entry.passwordHash) {
        const err = new Error(`AUTH_USERS entry "${entry.userId}" must use passwordHash/passwordSalt in production.`);
        err.name = 'ConfigValidationError';
        throw err;
      }
      return {
        userId: String(entry.userId),
        role: normalizeRole(entry.role),
        permissions: normalizePermissions(entry.permissions),
        passwordSalt: entry.passwordSalt ? String(entry.passwordSalt) : null,
        passwordHash: entry.passwordHash ? String(entry.passwordHash) : null,
        password: !isProduction && entry.password ? String(entry.password) : null,
      };
    });

  return cachedCredentials;
}

/** Derives a password hash suitable for AUTH_USERS entries. */
export function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const derived = crypto.scryptSync(String(password), salt, SCRYPT_KEYLEN).toString('hex');
  return { salt, hash: derived };
}

function timingSafeStringEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) {
    // Still perform a comparison to keep timing uniform for mismatched lengths.
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Verifies a userId/password pair against the configured credential directory.
 * Returns null for unknown users and wrong passwords alike.
 * @returns {{ userId: string, role: string, permissions: string[] } | null}
 */
export function verifyCredentials(userId, password) {
  const id = String(userId || '').trim();
  const secret = String(password || '');
  if (!id || !secret) return null;

  const credentials = loadCredentials();
  const record = credentials.find(entry => entry.userId === id);

  if (!record) {
    // Spend comparable work on unknown users to avoid user enumeration by timing.
    crypto.scryptSync(secret, 'libriq-unknown-user-salt', SCRYPT_KEYLEN);
    return null;
  }

  let matches = false;
  if (record.passwordHash && record.passwordSalt) {
    const derived = crypto.scryptSync(secret, record.passwordSalt, SCRYPT_KEYLEN).toString('hex');
    matches = timingSafeStringEqual(derived, record.passwordHash);
  } else if (record.password) {
    matches = timingSafeStringEqual(secret, record.password);
  }

  if (!matches) return null;

  return {
    userId: record.userId,
    role: record.role,
    permissions: record.permissions,
  };
}

/** True when at least one credential is configured. */
export function hasConfiguredCredentials() {
  try {
    return loadCredentials().length > 0;
  } catch {
    return false;
  }
}

export { ALLOWED_ROLES, ALLOWED_PERMISSIONS };
