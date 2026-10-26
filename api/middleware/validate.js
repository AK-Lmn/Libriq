import { sendError } from '../response.js';
import { loadConfig } from '../config.js';

const config = loadConfig(process.env, false);
const DEFAULT_MAX_BYTES = config.MAX_PAYLOAD_BYTES || 102400;
const DEFAULT_MAX_STRING_LENGTH = 2000;
const MAX_OBJECT_DEPTH = 8;
const MAX_OBJECT_KEYS = 100;
const MAX_ARRAY_ITEMS = 200;
const BODY_READ_TIMEOUT_MS = 15000;

/** Keys that must never be accepted from a request body (prototype pollution). */
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Rejects structurally dangerous payloads: prototype-pollution keys,
 * NoSQL operator keys, excessive depth, and oversized collections.
 * Content safety is handled by output encoding and field validation, not by
 * guessing at attack strings.
 * @param {any} value
 * @param {number} depth
 * @returns {{ detected: boolean, type?: string, match?: string }}
 */
export function detectUnsafeStructure(value, depth = 0) {
  if (value === null || value === undefined) return { detected: false };

  if (depth > MAX_OBJECT_DEPTH) {
    return { detected: true, type: 'PAYLOAD_TOO_DEEP', match: `depth > ${MAX_OBJECT_DEPTH}` };
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return { detected: false };
  }

  if (Array.isArray(value)) {
    if (value.length > MAX_ARRAY_ITEMS) {
      return { detected: true, type: 'ARRAY_TOO_LARGE', match: `length > ${MAX_ARRAY_ITEMS}` };
    }
    for (const item of value) {
      const result = detectUnsafeStructure(item, depth + 1);
      if (result.detected) return result;
    }
    return { detected: false };
  }

  if (typeof value === 'object') {
    const keys = Object.keys(value);
    if (keys.length > MAX_OBJECT_KEYS) {
      return { detected: true, type: 'OBJECT_TOO_LARGE', match: `keys > ${MAX_OBJECT_KEYS}` };
    }
    for (const key of keys) {
      if (FORBIDDEN_KEYS.has(key)) {
        return { detected: true, type: 'FORBIDDEN_KEY', match: key };
      }
      if (key.startsWith('$')) {
        return { detected: true, type: 'OPERATOR_KEY', match: key };
      }
      const result = detectUnsafeStructure(value[key], depth + 1);
      if (result.detected) return result;
    }
    return { detected: false };
  }

  return { detected: true, type: 'UNSUPPORTED_TYPE', match: typeof value };
}

/**
 * Reads and parses request JSON body safely, enforcing size and time limits.
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {Object} options
 * @returns {Promise<{ body: any } | false>} Parsed body or false if response sent
 */
export async function parseJsonBody(req, res, options = {}) {
  const maxBytes = options.maxBytes || DEFAULT_MAX_BYTES;
  const timeoutMs = options.timeoutMs || BODY_READ_TIMEOUT_MS;

  const contentLength = Number(req.headers['content-length'] || 0);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    sendError(res, 'PAYLOAD_TOO_LARGE', `Payload size exceeds limit of ${maxBytes} bytes.`, 413);
    return false;
  }

  const contentType = String(req.headers['content-type'] || '').toLowerCase();
  if (contentType && !contentType.includes('application/json')) {
    sendError(res, 'UNSUPPORTED_MEDIA_TYPE', 'Request body must be application/json.', 415);
    return false;
  }

  return new Promise((resolve) => {
    const chunks = [];
    let bytesReceived = 0;
    let settled = false;

    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      req.removeListener('data', onData);
      req.removeListener('end', onEnd);
      req.removeListener('error', onError);
      resolve(value);
    };

    // Bounds how long a client may hold the request body open.
    const timer = setTimeout(() => {
      sendError(res, 'REQUEST_TIMEOUT', `Request body was not received within ${timeoutMs}ms.`, 408);
      req.destroy();
      finish(false);
    }, timeoutMs);

    const onData = (chunk) => {
      if (settled) return;
      bytesReceived += chunk.length;
      if (bytesReceived > maxBytes) {
        sendError(res, 'PAYLOAD_TOO_LARGE', `Payload size exceeds limit of ${maxBytes} bytes.`, 413);
        req.destroy();
        finish(false);
        return;
      }
      chunks.push(chunk);
    };

    const onEnd = () => {
      if (settled) return;
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw.trim()) {
        finish({ body: {} });
        return;
      }

      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        // Parser internals are not echoed back to the client.
        sendError(res, 'MALFORMED_PAYLOAD', 'Request body is not valid JSON.', 400);
        finish(false);
        return;
      }

      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        sendError(res, 'MALFORMED_PAYLOAD', 'Request body must be a JSON object.', 400);
        finish(false);
        return;
      }

      const unsafe = detectUnsafeStructure(parsed);
      if (unsafe.detected) {
        sendError(res, 'INVALID_PAYLOAD_STRUCTURE', 'Request payload structure is not accepted.', 400, {
          reason: unsafe.type,
        });
        finish(false);
        return;
      }

      finish({ body: parsed });
    };

    const onError = () => {
      sendError(res, 'STREAM_ERROR', 'Request body could not be read.', 400);
      finish(false);
    };

    req.on('data', onData);
    req.on('end', onEnd);
    req.on('error', onError);
  });
}

/**
 * Validates object data against a field specification and rejects unknown fields.
 * Supported rules: type, required, min, max, minLength, maxLength, pattern, enum, itemType.
 * @param {Object} data
 * @param {Object} schema
 * @param {{ allowUnknown?: boolean, requireAtLeastOne?: boolean }} options
 * @returns {{ valid: boolean, errors: string[], value: Object }}
 */
export function validatePayload(data, schema, options = {}) {
  const errors = [];
  const value = {};

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { valid: false, errors: ['Payload must be a non-null JSON object.'], value };
  }

  if (!options.allowUnknown) {
    const allowed = new Set(Object.keys(schema));
    for (const key of Object.keys(data)) {
      if (!allowed.has(key)) {
        errors.push(`Field "${key}" is not an accepted field.`);
      }
    }
  }

  for (const [field, rule] of Object.entries(schema)) {
    const val = data[field];
    const isAbsent = val === undefined || val === null || val === '';

    if (rule.required && isAbsent) {
      errors.push(`Field "${field}" is required.`);
      continue;
    }
    if (isAbsent) continue;

    if (rule.type === 'array') {
      if (!Array.isArray(val)) {
        errors.push(`Field "${field}" must be an array, got ${typeof val}.`);
        continue;
      }
      if (rule.maxItems !== undefined && val.length > rule.maxItems) {
        errors.push(`Field "${field}" must contain at most ${rule.maxItems} items.`);
        continue;
      }
      if (rule.itemType) {
        const badItem = val.find(item => typeof item !== rule.itemType);
        if (badItem !== undefined) {
          errors.push(`Field "${field}" must contain only ${rule.itemType} values.`);
          continue;
        }
      }
      if (rule.itemMaxLength !== undefined) {
        const tooLong = val.find(item => String(item).length > rule.itemMaxLength);
        if (tooLong !== undefined) {
          errors.push(`Field "${field}" items must be at most ${rule.itemMaxLength} characters.`);
          continue;
        }
      }
      value[field] = val;
      continue;
    }

    if (rule.type === 'number') {
      // Rejects NaN, Infinity, and numeric-looking strings so downstream
      // arithmetic can never produce NaN state.
      if (typeof val !== 'number' || !Number.isFinite(val)) {
        errors.push(`Field "${field}" must be a finite number, got ${typeof val}.`);
        continue;
      }
      if (rule.integer && !Number.isInteger(val)) {
        errors.push(`Field "${field}" must be an integer.`);
        continue;
      }
      if (rule.min !== undefined && val < rule.min) {
        errors.push(`Field "${field}" must be >= ${rule.min}.`);
        continue;
      }
      if (rule.max !== undefined && val > rule.max) {
        errors.push(`Field "${field}" must be <= ${rule.max}.`);
        continue;
      }
      value[field] = val;
      continue;
    }

    if (rule.type === 'boolean') {
      if (typeof val !== 'boolean') {
        errors.push(`Field "${field}" must be a boolean, got ${typeof val}.`);
        continue;
      }
      value[field] = val;
      continue;
    }

    if (rule.type === 'string') {
      if (typeof val !== 'string') {
        errors.push(`Field "${field}" must be of type string, got ${typeof val}.`);
        continue;
      }
      const trimmed = rule.preserveWhitespace ? val : val.trim();
      const maxLength = rule.maxLength ?? DEFAULT_MAX_STRING_LENGTH;
      if (trimmed.length > maxLength) {
        errors.push(`Field "${field}" must be at most ${maxLength} characters.`);
        continue;
      }
      if (rule.minLength !== undefined && trimmed.length < rule.minLength) {
        errors.push(`Field "${field}" must be at least ${rule.minLength} characters.`);
        continue;
      }
      if (rule.pattern && !rule.pattern.test(trimmed)) {
        errors.push(`Field "${field}" has an invalid format.`);
        continue;
      }
      if (rule.enum && !rule.enum.includes(trimmed)) {
        errors.push(`Field "${field}" must be one of: ${rule.enum.join(', ')}.`);
        continue;
      }
      value[field] = trimmed;
      continue;
    }

    if (typeof val !== rule.type) {
      errors.push(`Field "${field}" must be of type ${rule.type}, got ${typeof val}.`);
      continue;
    }
    value[field] = val;
  }

  if (options.requireAtLeastOne && Object.keys(value).length === 0 && errors.length === 0) {
    errors.push('At least one updatable field must be provided.');
  }

  return {
    valid: errors.length === 0,
    errors,
    value,
  };
}

/**
 * Parses and clamps pagination parameters.
 * @param {Record<string, any>} query
 * @returns {{ limit: number, offset: number, errors: string[] }}
 */
export function parsePagination(query = {}) {
  const errors = [];
  const maxLimit = config.MAX_PAGE_SIZE || 100;
  const defaultLimit = Math.min(config.DEFAULT_PAGE_SIZE || 25, maxLimit);

  let limit = defaultLimit;
  if (query.limit !== undefined && query.limit !== '') {
    const parsed = Number(query.limit);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      errors.push('Query parameter "limit" must be a positive integer.');
    } else {
      limit = Math.min(parsed, maxLimit);
    }
  }

  let offset = 0;
  if (query.offset !== undefined && query.offset !== '') {
    const parsed = Number(query.offset);
    if (!Number.isInteger(parsed) || parsed < 0) {
      errors.push('Query parameter "offset" must be a non-negative integer.');
    } else {
      offset = parsed;
    }
  }

  return { limit, offset, errors, maxLimit };
}

export const VALIDATION_LIMITS = Object.freeze({
  maxStringLength: DEFAULT_MAX_STRING_LENGTH,
  maxObjectDepth: MAX_OBJECT_DEPTH,
  maxObjectKeys: MAX_OBJECT_KEYS,
  maxArrayItems: MAX_ARRAY_ITEMS,
  bodyReadTimeoutMs: BODY_READ_TIMEOUT_MS,
  maxPayloadBytes: DEFAULT_MAX_BYTES,
});
