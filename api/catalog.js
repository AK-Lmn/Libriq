import crypto from 'node:crypto';
import { loadConfig } from './config.js';

const config = loadConfig(process.env, false);
const RESERVATION_TTL_MS = (config.RESERVATION_TTL_SECONDS || 86400) * 1000;
const CHECKOUT_TTL_MS = (config.CHECKOUT_TTL_SECONDS || 1209600) * 1000;

export class CatalogError extends Error {
  constructor(message, code = 'CATALOG_ERROR', statusCode = 400, details = null) {
    super(message);
    this.name = 'CatalogError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

function toPositiveInteger(value, { field, min = 1, max = 1000000 }) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || !Number.isInteger(numeric)) {
    throw new CatalogError(`${field} must be a finite integer.`, 'INVALID_INVENTORY_VALUE', 400);
  }
  if (numeric < min || numeric > max) {
    throw new CatalogError(`${field} must be between ${min} and ${max}.`, 'INVALID_INVENTORY_VALUE', 400);
  }
  return numeric;
}

/**
 * In-memory Catalog and Inventory Store.
 * Enforces CRUD operations, soft/hard deletion, state transitions,
 * concurrency conflict prevention, hold expiry, and inventory reconciliation.
 */
export class CatalogStore {
  constructor() {
    this.resources = new Map();
  }

  clear() {
    this.resources.clear();
  }

  /**
   * Drops reservations and checkouts whose deadline has passed so held copies
   * return to circulation. Called before every read and state transition.
   */
  _expireHolds(resource, now = Date.now()) {
    if (!resource) return { expiredReservations: 0, expiredCheckouts: 0 };

    const before = {
      reservations: resource.reservations.length,
      checkouts: resource.checkouts.length,
    };

    resource.reservations = resource.reservations.filter(reservation => {
      const expiresAt = new Date(reservation?.expiresAt || 0).getTime();
      return Number.isFinite(expiresAt) && expiresAt > now;
    });

    resource.checkouts = resource.checkouts.filter(checkout => {
      const expiresAt = new Date(checkout?.expiresAt || checkout?.dueAt || 0).getTime();
      return Number.isFinite(expiresAt) && expiresAt > now;
    });

    const expiredReservations = before.reservations - resource.reservations.length;
    const expiredCheckouts = before.checkouts - resource.checkouts.length;

    if (expiredReservations > 0 || expiredCheckouts > 0) {
      resource.updatedAt = new Date(now).toISOString();
      resource.lastExpiredAt = resource.updatedAt;
    }

    return { expiredReservations, expiredCheckouts };
  }

  /** Expires holds across the whole store; returns a summary for operators. */
  expireAllHolds(now = Date.now()) {
    let reservations = 0;
    let checkouts = 0;
    let resourcesTouched = 0;

    for (const resource of this.resources.values()) {
      const result = this._expireHolds(resource, now);
      if (result.expiredReservations || result.expiredCheckouts) {
        resourcesTouched += 1;
        reservations += result.expiredReservations;
        checkouts += result.expiredCheckouts;
        this._reconcileCounts(resource);
      }
    }

    return { resourcesTouched, expiredReservations: reservations, expiredCheckouts: checkouts };
  }

  _reconcileCounts(resource) {
    const total = resource.totalCopies;

    if (!Number.isInteger(total) || total < 0) {
      throw new CatalogError(
        'Inventory count invariant violation: totalCopies is not a valid integer.',
        'INVENTORY_INVARIANT_VIOLATION',
        500,
        { total }
      );
    }

    const reserved = resource.reservations.length;
    const checkedOut = resource.checkouts.length;
    const available = total - (reserved + checkedOut);

    if (available < 0) {
      throw new CatalogError(
        'Inventory count invariant violation: available copies cannot be negative.',
        'INVENTORY_INVARIANT_VIOLATION',
        500,
        { total, reserved, checkedOut, available }
      );
    }

    resource.reservedCopies = reserved;
    resource.checkedOutCopies = checkedOut;
    resource.availableCopies = available;

    if (available === total) {
      resource.status = 'available';
    } else if (available === 0) {
      resource.status = checkedOut > 0 ? 'checked_out' : 'reserved';
    } else {
      resource.status = 'partially_available';
    }

    return resource;
  }

  createResource(data) {
    if (!data.title || typeof data.title !== 'string') {
      throw new CatalogError('Title is required and must be a string.', 'INVALID_TITLE', 400);
    }
    if (!data.author || typeof data.author !== 'string') {
      throw new CatalogError('Author is required and must be a string.', 'INVALID_AUTHOR', 400);
    }

    // Identifiers are server-generated so clients cannot choose or probe keys.
    const id = crypto.randomUUID();

    const now = new Date().toISOString();
    const totalCopies = data.totalCopies === undefined || data.totalCopies === null
      ? 1
      : toPositiveInteger(data.totalCopies, { field: 'totalCopies' });

    const resource = {
      id,
      title: data.title.trim(),
      author: data.author.trim(),
      isbn: data.isbn ? String(data.isbn).trim() : null,
      genres: Array.isArray(data.genres) ? data.genres.map(genre => String(genre).trim()).filter(Boolean) : [],
      status: 'available',
      totalCopies,
      availableCopies: totalCopies,
      reservedCopies: 0,
      checkedOutCopies: 0,
      reservations: [],
      checkouts: [],
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };

    this.resources.set(id, resource);
    return this._present(resource);
  }

  /** Strips internal hold records from the client-facing shape. */
  _present(resource, { includeHolders = false } = {}) {
    const { reservations, checkouts, ...rest } = resource;
    if (!includeHolders) return { ...rest };
    return {
      ...rest,
      reservations: reservations.map(entry => ({ ...entry })),
      checkouts: checkouts.map(entry => ({ ...entry })),
    };
  }

  getResource(id, { includeDeleted = false, includeHolders = false } = {}) {
    const resource = this.resources.get(id);
    if (!resource) return null;
    if (resource.deletedAt && !includeDeleted) return null;
    this._expireHolds(resource);
    this._reconcileCounts(resource);
    return this._present(resource, { includeHolders });
  }

  /**
   * Lists resources with mandatory pagination.
   * @returns {{ items: Array, total: number, limit: number, offset: number, hasMore: boolean }}
   */
  listResources({
    includeDeleted = false,
    status = null,
    search = '',
    limit = 25,
    offset = 0,
    includeHolders = false,
  } = {}) {
    const searchLower = String(search || '').toLowerCase();
    const safeLimit = Number.isInteger(limit) && limit > 0 ? limit : 25;
    const safeOffset = Number.isInteger(offset) && offset >= 0 ? offset : 0;

    const matches = [];
    for (const resource of this.resources.values()) {
      if (resource.deletedAt && !includeDeleted) continue;
      this._expireHolds(resource);
      this._reconcileCounts(resource);
      if (status && resource.status !== status) continue;
      if (searchLower) {
        const matchesTitle = resource.title.toLowerCase().includes(searchLower);
        const matchesAuthor = resource.author.toLowerCase().includes(searchLower);
        const matchesIsbn = resource.isbn?.toLowerCase().includes(searchLower);
        if (!matchesTitle && !matchesAuthor && !matchesIsbn) continue;
      }
      matches.push(resource);
    }

    matches.sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));

    const page = matches
      .slice(safeOffset, safeOffset + safeLimit)
      .map(resource => this._present(resource, { includeHolders }));

    return {
      items: page,
      total: matches.length,
      limit: safeLimit,
      offset: safeOffset,
      hasMore: safeOffset + page.length < matches.length,
    };
  }

  updateResource(id, updates = {}) {
    const resource = this.resources.get(id);
    if (!resource || resource.deletedAt) {
      throw new CatalogError(`Resource ${id} not found.`, 'NOT_FOUND', 404);
    }

    const disallowed = ['id', 'reservations', 'checkouts', 'availableCopies', 'reservedCopies', 'checkedOutCopies', 'createdAt', 'deletedAt', 'status'];
    for (const key of disallowed) {
      if (key in updates) {
        throw new CatalogError(`Field "${key}" cannot be updated directly.`, 'INVALID_UPDATE_FIELD', 400);
      }
    }

    this._expireHolds(resource);

    if (updates.totalCopies !== undefined) {
      const newTotal = toPositiveInteger(updates.totalCopies, { field: 'totalCopies' });
      const occupied = resource.reservations.length + resource.checkouts.length;
      if (newTotal < occupied) {
        throw new CatalogError(
          `Cannot reduce totalCopies to ${newTotal}: ${occupied} copies currently reserved or checked out.`,
          'INVALID_INVENTORY_ADJUSTMENT',
          409
        );
      }
      resource.totalCopies = newTotal;
    }

    if (updates.title !== undefined) resource.title = String(updates.title).trim();
    if (updates.author !== undefined) resource.author = String(updates.author).trim();
    if (updates.isbn !== undefined) resource.isbn = updates.isbn ? String(updates.isbn).trim() : null;
    if (Array.isArray(updates.genres)) {
      resource.genres = updates.genres.map(genre => String(genre).trim()).filter(Boolean);
    }

    resource.updatedAt = new Date().toISOString();
    this._reconcileCounts(resource);
    return this._present(resource);
  }

  softDeleteResource(id) {
    const resource = this.resources.get(id);
    if (!resource || resource.deletedAt) {
      throw new CatalogError(`Resource ${id} not found or already deleted.`, 'NOT_FOUND', 404);
    }

    this._expireHolds(resource);

    if (resource.reservations.length > 0 || resource.checkouts.length > 0) {
      throw new CatalogError(
        `Cannot delete resource ${id}: active reservations or checkouts exist.`,
        'RESOURCE_IN_USE',
        409
      );
    }

    const now = new Date().toISOString();
    resource.deletedAt = now;
    resource.updatedAt = now;
    return this._present(resource);
  }

  hardDeleteResource(id) {
    const resource = this.resources.get(id);
    if (!resource) {
      throw new CatalogError(`Resource ${id} not found.`, 'NOT_FOUND', 404);
    }

    this._expireHolds(resource);

    if (resource.reservations.length > 0 || resource.checkouts.length > 0) {
      throw new CatalogError(
        `Cannot hard-delete resource ${id}: active reservations or checkouts exist.`,
        'RESOURCE_IN_USE',
        409
      );
    }

    this.resources.delete(id);
    return true;
  }

  reserveResource(id, userId) {
    if (!userId || typeof userId !== 'string') {
      throw new CatalogError('User ID is required for reservation.', 'INVALID_USER', 400);
    }

    const resource = this.resources.get(id);
    if (!resource || resource.deletedAt) {
      throw new CatalogError(`Resource ${id} not found.`, 'NOT_FOUND', 404);
    }

    const now = Date.now();
    this._expireHolds(resource, now);
    this._reconcileCounts(resource);

    if (resource.reservations.some(r => r.userId === userId)) {
      throw new CatalogError('User already has an active reservation for this resource.', 'DUPLICATE_RESERVATION', 409);
    }

    if (resource.checkouts.some(c => c.userId === userId)) {
      throw new CatalogError('User already has this resource checked out.', 'ALREADY_CHECKED_OUT', 409);
    }

    if (resource.availableCopies <= 0) {
      throw new CatalogError(
        'Resource cannot be reserved: no copies currently available (checked out or reserved by another user).',
        'RESOURCE_ALREADY_RESERVED',
        409
      );
    }

    const timestamp = new Date(now).toISOString();
    resource.reservations.push({
      userId,
      reservedAt: timestamp,
      expiresAt: new Date(now + RESERVATION_TTL_MS).toISOString(),
    });

    resource.updatedAt = timestamp;
    this._reconcileCounts(resource);
    return this._present(resource);
  }

  checkoutResource(id, userId) {
    if (!userId || typeof userId !== 'string') {
      throw new CatalogError('User ID is required for checkout.', 'INVALID_USER', 400);
    }

    const resource = this.resources.get(id);
    if (!resource || resource.deletedAt) {
      throw new CatalogError(`Resource ${id} not found.`, 'NOT_FOUND', 404);
    }

    const now = Date.now();
    this._expireHolds(resource, now);
    this._reconcileCounts(resource);

    if (resource.checkouts.some(c => c.userId === userId)) {
      throw new CatalogError('User already has this resource checked out.', 'ALREADY_CHECKED_OUT', 409);
    }

    const userReservationIdx = resource.reservations.findIndex(r => r.userId === userId);

    if (userReservationIdx !== -1) {
      resource.reservations.splice(userReservationIdx, 1);
    } else if (resource.availableCopies <= 0) {
      throw new CatalogError(
        'Resource is unavailable for checkout: all copies are reserved or checked out.',
        'RESOURCE_UNAVAILABLE',
        409
      );
    }

    const timestamp = new Date(now).toISOString();
    const dueAt = new Date(now + CHECKOUT_TTL_MS).toISOString();
    resource.checkouts.push({
      userId,
      checkedOutAt: timestamp,
      dueAt,
      expiresAt: dueAt,
    });

    resource.updatedAt = timestamp;
    this._reconcileCounts(resource);
    return this._present(resource);
  }

  returnResource(id, userId) {
    if (!userId || typeof userId !== 'string') {
      throw new CatalogError('User ID is required to return a resource.', 'INVALID_USER', 400);
    }

    const resource = this.resources.get(id);
    if (!resource) {
      throw new CatalogError(`Resource ${id} not found.`, 'NOT_FOUND', 404);
    }

    const now = Date.now();
    this._expireHolds(resource, now);

    const checkoutIdx = resource.checkouts.findIndex(c => c.userId === userId);
    const reservationIdx = resource.reservations.findIndex(r => r.userId === userId);

    if (checkoutIdx === -1 && reservationIdx === -1) {
      throw new CatalogError(
        'No active checkout or reservation found for this user on this resource.',
        'NO_ACTIVE_TRANSACTION',
        400
      );
    }

    if (checkoutIdx !== -1) {
      resource.checkouts.splice(checkoutIdx, 1);
    } else {
      resource.reservations.splice(reservationIdx, 1);
    }

    resource.updatedAt = new Date(now).toISOString();
    this._reconcileCounts(resource);
    return this._present(resource);
  }

  reconcileInventory(id) {
    const resource = this.resources.get(id);
    if (!resource) {
      throw new CatalogError(`Resource ${id} not found.`, 'NOT_FOUND', 404);
    }

    this._expireHolds(resource);
    this._reconcileCounts(resource);
    const valid = resource.totalCopies === (resource.availableCopies + resource.reservedCopies + resource.checkedOutCopies);
    return {
      resourceId: id,
      valid,
      totalCopies: resource.totalCopies,
      availableCopies: resource.availableCopies,
      reservedCopies: resource.reservedCopies,
      checkedOutCopies: resource.checkedOutCopies,
      status: resource.status,
    };
  }
}

export const defaultCatalog = new CatalogStore();
export const HOLD_TTL = Object.freeze({
  reservationMs: RESERVATION_TTL_MS,
  checkoutMs: CHECKOUT_TTL_MS,
});
