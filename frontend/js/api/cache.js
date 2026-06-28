/* ============================================
   LIBRIQ — cache.js
   Lightweight session-scoped in-memory cache.
   Keyed by query string. Cleared on page reload.
   Transparent to callers — just wrap your fetch.
   ============================================ */

const BookCache = (() => {

  // Map<string, Object[]>  — query → results array
  const _store = new Map();

  /**
   * Return cached results for a query, or null if not cached.
   * @param {string} key
   * @returns {Object[]|null}
   */
  function get(key) {
    const normalised = _normalise(key);
    return _store.has(normalised) ? _store.get(normalised) : null;
  }

  /**
   * Store results for a query.
   * Only called on successful (non-empty) fetches.
   * @param {string} key
   * @param {Object[]} results
   */
  function set(key, results) {
    if (!Array.isArray(results)) return;
    _store.set(_normalise(key), results);
  }

  /**
   * Check whether a query is already cached.
   * @param {string} key
   * @returns {boolean}
   */
  function has(key) {
    return _store.has(_normalise(key));
  }

  /**
   * Invalidate a specific entry (useful for ISBN lookups).
   * @param {string} key
   */
  function invalidate(key) {
    _store.delete(_normalise(key));
  }

  /** Clear the entire cache (e.g. after library reset). */
  function clear() {
    _store.clear();
  }

  // Normalise cache keys so "Dune" and "dune " both hit the same entry
  function _normalise(key) {
    return (key || '').toLowerCase().trim();
  }

  return { get, set, has, invalidate, clear };

})();
