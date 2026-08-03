/**
 * Library route boundary.
 *
 * The renderer stays injectable during the first extraction step. This lets
 * the route move now, while storage/filter markup can be migrated separately
 * without keeping event behavior coupled to Navigation.
 */
export function createLibraryPage({ render, actions }) {
  if (typeof render !== 'function') throw new TypeError('createLibraryPage requires a render function.');

  return function renderLibraryFeature({ root }) {
    render();
    return initLibraryEvents(root || document.getElementById('mainContent'), actions);
  };
}

/**
 * One listener handles current and future library controls, including book
 * cards appended after filtering. Return value removes all bound listeners.
 */
export function initLibraryEvents(container, actions = {}) {
  if (!container || container.dataset.libraryEventsBound === 'true') return () => {};

  const onClick = (event) => {
    const trigger = event.target.closest?.('[data-action]');
    if (!trigger || !container.contains?.(trigger)) return;

    const action = trigger.dataset.action;
    const bookId = trigger.dataset.bookId;
    const handlers = {
      'open-search': () => actions.openSearch?.(),
      'open-manual-entry': () => actions.openManualEntry?.(),
      'import-backup': () => actions.importBackup?.(),
      'clear-library-search': () => actions.clearSearch?.(),
      'show-book-details': () => actions.showBookDetails?.(bookId),
      'update-progress': () => actions.updateProgress?.(bookId),
      'toggle-favorite': () => actions.toggleFavorite?.(bookId),
      'remove-book': () => actions.removeBook?.(bookId),
    };

    if (!handlers[action]) return;
    event.preventDefault();
    event.stopPropagation();
    handlers[action]();
  };

  container.dataset.libraryEventsBound = 'true';
  container.addEventListener('click', onClick);
  return () => {
    container.removeEventListener?.('click', onClick);
    delete container.dataset.libraryEventsBound;
  };
}
