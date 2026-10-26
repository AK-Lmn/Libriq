/**
 * Environment configuration and startup validation module.
 * Provides schema validation, fail-fast sanity checks, and type coercion.
 */

/** Development-only signing secret. Never valid in production. */
export const INSECURE_DEV_SECRET = 'libriq-insecure-dev-secret-key-32-chars-min!!';

/** Maximum token lifetime the issuer will ever grant, regardless of request input. */
export const TOKEN_TTL_HARD_CAP_SECONDS = 86400; // 24h

function isInsecureSecret(value) {
  const text = String(value || '');
  return text === INSECURE_DEV_SECRET || /insecure|changeme|example|default/i.test(text);
}

export const CONFIG_SCHEMA = {
  PORT: {
    type: 'number',
    default: 4173,
    validate: (val) => Number.isInteger(val) && val > 0 && val <= 65535,
    message: 'PORT must be an integer between 1 and 65535.',
  },
  NODE_ENV: {
    type: 'string',
    default: 'development',
    validate: (val) => ['development', 'production', 'test'].includes(val),
    message: 'NODE_ENV must be one of: development, production, test.',
  },
  AUTH_SECRET: {
    type: 'string',
    default: INSECURE_DEV_SECRET,
    validate: (val, env) => {
      if (env.NODE_ENV === 'production') {
        return typeof val === 'string' && val.length >= 32 && !isInsecureSecret(val);
      }
      return typeof val === 'string' && val.length >= 16;
    },
    message: 'AUTH_SECRET must be at least 16 characters (32 in production, and must not be the shared development default).',
  },
  TOKEN_TTL_SECONDS: {
    type: 'number',
    default: 3600,
    validate: (val) => Number.isInteger(val) && val > 0 && val <= TOKEN_TTL_HARD_CAP_SECONDS,
    message: `TOKEN_TTL_SECONDS must be a positive integer <= ${TOKEN_TTL_HARD_CAP_SECONDS}.`,
  },
  MAX_PAYLOAD_BYTES: {
    type: 'number',
    default: 102400, // 100 KB
    validate: (val) => Number.isInteger(val) && val > 0 && val <= 10485760, // up to 10MB max
    message: 'MAX_PAYLOAD_BYTES must be a positive integer <= 10MB.',
  },
  MAX_PAGE_SIZE: {
    type: 'number',
    default: 100,
    validate: (val) => Number.isInteger(val) && val > 0 && val <= 500,
    message: 'MAX_PAGE_SIZE must be a positive integer <= 500.',
  },
  DEFAULT_PAGE_SIZE: {
    type: 'number',
    default: 25,
    validate: (val, env) => {
      const max = Number(env.MAX_PAGE_SIZE || 100);
      return Number.isInteger(val) && val > 0 && val <= (Number.isInteger(max) ? max : 100);
    },
    message: 'DEFAULT_PAGE_SIZE must be a positive integer <= MAX_PAGE_SIZE.',
  },
  RATE_LIMIT_ENABLED: {
    type: 'boolean',
    default: true,
    validate: (val) => typeof val === 'boolean',
    message: 'RATE_LIMIT_ENABLED must be a boolean.',
  },
  RATE_LIMIT_WINDOW_MS: {
    type: 'number',
    default: 60000,
    validate: (val) => Number.isInteger(val) && val >= 1000 && val <= 3600000,
    message: 'RATE_LIMIT_WINDOW_MS must be an integer between 1000 and 3600000.',
  },
  RATE_LIMIT_MAX_REQUESTS: {
    type: 'number',
    default: 300,
    validate: (val) => Number.isInteger(val) && val > 0 && val <= 100000,
    message: 'RATE_LIMIT_MAX_REQUESTS must be a positive integer <= 100000.',
  },
  RATE_LIMIT_MAX_AUTH_REQUESTS: {
    type: 'number',
    default: 10,
    validate: (val) => Number.isInteger(val) && val > 0 && val <= 10000,
    message: 'RATE_LIMIT_MAX_AUTH_REQUESTS must be a positive integer <= 10000.',
  },
  RESERVATION_TTL_SECONDS: {
    type: 'number',
    default: 86400, // 24h hold
    validate: (val) => Number.isInteger(val) && val > 0 && val <= 2592000,
    message: 'RESERVATION_TTL_SECONDS must be a positive integer <= 2592000 (30 days).',
  },
  CHECKOUT_TTL_SECONDS: {
    type: 'number',
    default: 1209600, // 14 days
    validate: (val) => Number.isInteger(val) && val > 0 && val <= 31536000,
    message: 'CHECKOUT_TTL_SECONDS must be a positive integer <= 31536000 (365 days).',
  },
  AUTH_USERS: {
    type: 'string',
    default: '',
    required: false,
    validate: (val, env) => {
      const raw = String(val || '').trim();
      if (!raw) {
        // Credentials are mandatory in production: there is no anonymous token issuance.
        return env.NODE_ENV !== 'production';
      }
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) && parsed.every(entry => entry && typeof entry === 'object');
      } catch {
        return false;
      }
    },
    message: 'AUTH_USERS must be a JSON array of credential objects, and is required when NODE_ENV=production.',
  },
  GOOGLE_BOOKS_API_KEY: {
    type: 'string',
    default: '',
    required: false,
    validate: (val) => typeof val === 'string',
    message: 'GOOGLE_BOOKS_API_KEY must be a string.',
  },
};

function coerce(schema, rawVal) {
  if (schema.type === 'number') {
    const num = Number(rawVal);
    return Number.isNaN(num) ? { error: true } : { value: num };
  }
  if (schema.type === 'boolean') {
    const text = String(rawVal).trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(text)) return { value: true };
    if (['0', 'false', 'no', 'off'].includes(text)) return { value: false };
    return { error: true };
  }
  return { value: rawVal };
}

export function validateConfig(rawEnv = process.env) {
  const errors = [];
  const config = {};

  const currentEnv = rawEnv.NODE_ENV || 'development';

  for (const [key, schema] of Object.entries(CONFIG_SCHEMA)) {
    const rawVal = rawEnv[key];
    let parsedVal = rawVal;

    if (rawVal === undefined || rawVal === '') {
      if (schema.required) {
        errors.push(`Missing required environment variable: ${key}`);
        continue;
      }
      parsedVal = schema.default;
    } else {
      const coerced = coerce(schema, rawVal);
      if (coerced.error) {
        errors.push(`Invalid ${schema.type} for ${key}: received "${rawVal}".`);
        continue;
      }
      parsedVal = coerced.value;
    }

    if (schema.validate) {
      const isValid = schema.validate(parsedVal, { ...rawEnv, NODE_ENV: currentEnv });
      if (!isValid) {
        errors.push(schema.message || `Validation failed for ${key}.`);
      }
    }

    config[key] = parsedVal;
  }

  return {
    valid: errors.length === 0,
    config,
    errors,
  };
}

export function loadConfig(rawEnv = process.env, failFast = true) {
  const result = validateConfig(rawEnv);
  if (!result.valid && failFast) {
    const message = `Configuration validation failed:\n  - ${result.errors.join('\n  - ')}`;
    const err = new Error(message);
    err.name = 'ConfigValidationError';
    err.errors = result.errors;
    throw err;
  }
  return result.config;
}

/**
 * Returns the signing secret, refusing to fall back to a shared default in production.
 * Fails closed so a broken environment cannot silently downgrade token security.
 */
export function resolveAuthSecret(rawEnv = process.env) {
  const result = validateConfig(rawEnv);
  const secret = result.config.AUTH_SECRET;
  const isProduction = (rawEnv.NODE_ENV || 'development') === 'production';

  if (isProduction && (!result.valid || isInsecureSecret(secret) || String(secret).length < 32)) {
    const err = new Error(
      'AUTH_SECRET is missing, too short, or using the development default. Refusing to sign tokens in production.'
    );
    err.name = 'ConfigValidationError';
    err.errors = result.errors.length ? result.errors : [CONFIG_SCHEMA.AUTH_SECRET.message];
    throw err;
  }

  if (typeof secret !== 'string' || secret.length < 16) {
    const err = new Error('AUTH_SECRET must be at least 16 characters.');
    err.name = 'ConfigValidationError';
    err.errors = [CONFIG_SCHEMA.AUTH_SECRET.message];
    throw err;
  }

  return secret;
}

export { isInsecureSecret };
