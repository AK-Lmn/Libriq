export const BookCache = (() => {

  const _store = new Map();
  const MAX_ENTRIES = 100;

  function get(key) {
    const normalised = _normalise(key);
    if (!_store.has(normalised)) return null;
    const value = _store.get(normalised);
    _store.delete(normalised);
    _store.set(normalised, value);
    return value;
  }

  function set(key, results) {
    if (!Array.isArray(results)) return;
    const normalised = _normalise(key);
    if (_store.has(normalised)) _store.delete(normalised);
    _store.set(normalised, results);
    if (_store.size > MAX_ENTRIES) {
      const oldestKey = _store.keys().next().value;
      _store.delete(oldestKey);
    }
  }

  function has(key) {
    return _store.has(_normalise(key));
  }

  function invalidate(key) {
    _store.delete(_normalise(key));
  }

  function clear() {
    _store.clear();
  }

  function _normalise(key) {
    return (key || '').toLowerCase().trim();
  }

  return { get, set, has, invalidate, clear };

})();
