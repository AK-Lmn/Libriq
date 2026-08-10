export const BookCache = (() => {

  const _store = new Map();

  function get(key) {
    const normalised = _normalise(key);
    return _store.has(normalised) ? _store.get(normalised) : null;
  }

  function set(key, results) {
    if (!Array.isArray(results)) return;
    _store.set(_normalise(key), results);
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
