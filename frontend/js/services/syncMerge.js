// How a remote snapshot is merged into this device's library. Pure: no
// storage, network or status changes; sync.js applies the result. The field
// helpers are passed in so the rules can be tested on their own.

export function compareTimes(a, b) {
  const at = new Date(a || 0).getTime();
  const bt = new Date(b || 0).getTime();
  if (!Number.isFinite(at) || !Number.isFinite(bt)) return 0;
  return at === bt ? 0 : (at > bt ? 1 : -1);
}

/**
 * @returns {{ books: object[], changed: boolean, conflicts: number, uploadNeeded: boolean, log: Array<[string, object]> }}
 *   books: the merged library (inputs are not mutated)
 *   uploadNeeded: a local copy is newer than the remote one and should go up
 *   log: [message, detail] pairs for the sync debug log
 */
export function mergeBooks({ localBooks, remoteBooks, fingerprint, normalize, mergeOne, toLocal }) {
  const byId = new Map(localBooks.map(book => [book.id, book]));
  const books = localBooks.map(book => ({ ...book }));
  const log = [];
  let changed = false;
  let conflicts = 0;
  let uploadNeeded = false;
  const indexOf = id => books.findIndex(book => book.id === id);

  remoteBooks.forEach(remote => {
    if (!remote?.id) return;
    const local = byId.get(remote.id);
    const remoteTime = remote.updatedAt || remote.createdAt || null;
    const localTime = local?.updatedAt || local?.createdAt || null;
    const remoteFavorite = typeof remote.isFavorite === 'boolean' ? remote.isFavorite : null;

    // A tombstone at least as new as the local edit removes the book.
    if (remote.deletedAt && compareTimes(remote.deletedAt, localTime) >= 0) {
      const idx = indexOf(remote.id);
      if (idx !== -1) {
        books.splice(idx, 1);
        changed = true;
        log.push(['remote book applied', { bookId: remote.id, reason: 'deletedAt tombstone', remoteFavorite }]);
      }
      return;
    }

    if (!local) {
      books.push(toLocal(remote));
      changed = true;
      log.push(['remote book applied', { bookId: remote.id, reason: 'new book from remote', remoteFavorite }]);
      return;
    }

    const cmp = compareTimes(remoteTime, localTime);
    if (cmp > 0) {
      books[indexOf(remote.id)] = mergeOne(local, remote);
      changed = true;
      log.push(['remote book applied', { bookId: remote.id, reason: 'remote newer', remoteFavorite, localFavorite: Boolean(local.isFavorite) }]);
      return;
    }
    if (cmp < 0) {
      uploadNeeded = true;
      log.push(['remote book skipped', { bookId: remote.id, reason: 'local newer, queued upload', remoteFavorite, localFavorite: Boolean(local.isFavorite) }]);
      return;
    }

    // Timestamp tie.
    const favoriteChanged = typeof remote.isFavorite === 'boolean' && local.isFavorite !== remote.isFavorite;
    const hasRemoteUpdatedAt = Boolean(remote.updatedAt || remote.createdAt);
    if (favoriteChanged && (!hasRemoteUpdatedAt || remote.updatedAt === local.updatedAt)) {
      books[indexOf(remote.id)] = mergeOne(local, remote);
      changed = true;
      log.push(['remote book applied', { bookId: remote.id, reason: 'favorite changed on timestamp tie', remoteFavorite, localFavorite: Boolean(local.isFavorite) }]);
    } else if (remote.deletedAt && compareTimes(remote.deletedAt, local?.updatedAt || local?.createdAt || null) >= 0) {
      const idx = indexOf(remote.id);
      if (idx !== -1) {
        books.splice(idx, 1);
        changed = true;
      }
    } else if (fingerprint(normalize(local)) === fingerprint(remote)) {
      // Same timestamp and same content: our own upload coming back through
      // the listener, not a conflict.
      log.push(['remote book skipped', { bookId: remote.id, reason: 'echo of local book' }]);
    } else {
      conflicts += 1;
      log.push(['remote book skipped', { bookId: remote.id, reason: 'timestamp tie or missing timestamp', remoteFavorite, localFavorite: Boolean(local.isFavorite), remoteUpdatedAt: remote.updatedAt || null, localUpdatedAt: local.updatedAt || null }]);
    }
  });

  return { books, changed, conflicts, uploadNeeded, log };
}
