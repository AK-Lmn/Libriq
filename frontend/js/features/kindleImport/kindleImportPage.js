export function createKindleImportPage({ parseClippings, actions = {}, documentRoot } = {}) {
  if (typeof parseClippings !== 'function') throw new TypeError('createKindleImportPage requires parseClippings.');
  let boundRoot = null;
  let parsedResult = null;

  const getDocument = () => documentRoot || globalThis.document;

  function renderKindleImportPage() {
    const pageDocument = getDocument();
    const root = pageDocument?.getElementById?.('mainContent');
    if (!root) return;
    root.innerHTML = `
      <div class="page page--narrow" id="kindleImportPage">
        <div class="page-header page-header--spaced">
          <div>
            <h1 class="page-title">Import Kindle Clippings</h1>
            <p class="page-subtitle">Choose your My Clippings.txt file to preview highlights and notes.</p>
          </div>
        </div>
        <div class="goal-widget goal-widget--section-sm">
          <label class="form-label" for="kindleClippingsInput">My Clippings.txt</label>
          <input class="form-input" id="kindleClippingsInput" type="file" accept=".txt,text/plain" data-action="select-kindle-file" />
        </div>
        <div id="kindleImportPreview" aria-live="polite"></div>
      </div>`;
    bindActions(root);
  }

  function bindActions(root) {
    if (boundRoot === root) return;
    boundRoot = root;
    root.addEventListener('change', async event => {
      if (!event.target.matches?.('[data-action="select-kindle-file"]')) return;
      const file = event.target.files?.[0];
      if (!file) return;
      try {
        const result = parseClippings(await file.text());
        parsedResult = result;
        renderPreview(result);
        actions.previewReady?.(result, file);
      } catch (error) {
        parsedResult = null;
        renderError();
        actions.parseError?.(error, file);
      }
    });
    root.addEventListener('click', event => {
      const trigger = event.target.closest?.('[data-action]');
      if (!trigger) return;
      if (trigger.dataset.action === 'import-kindle-clippings' && parsedResult) {
        actions.importClippings?.(parsedResult);
      } else if (trigger.dataset.action === 'clear-kindle-preview') {
        parsedResult = null;
        const input = getDocument()?.getElementById?.('kindleClippingsInput');
        if (input) input.value = '';
        const preview = getDocument()?.getElementById?.('kindleImportPreview');
        if (preview) preview.innerHTML = '';
      } else {
        return;
      }
      event.preventDefault?.();
    });
  }

  function renderPreview(result) {
    const preview = getDocument()?.getElementById?.('kindleImportPreview');
    if (!preview) return;
    const totals = result?.totals || { books: 0, highlights: 0, notes: 0 };
    preview.innerHTML = `
      <div class="goal-widget" id="kindleImportSummary">
        <div class="goal-header"><div class="goal-title">Import Preview</div></div>
        <div class="stats-row profile-stats-row profile-stats-grid">
          <div class="stat-card"><div class="stat-card-value" id="kindleBookCount">${totals.books}</div><div class="stat-card-label">Books</div></div>
          <div class="stat-card"><div class="stat-card-value" id="kindleHighlightCount">${totals.highlights}</div><div class="stat-card-label">Highlights</div></div>
          <div class="stat-card"><div class="stat-card-value" id="kindleNoteCount">${totals.notes}</div><div class="stat-card-label">Notes</div></div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" type="button" data-action="clear-kindle-preview">Choose Another File</button>
          <button class="btn btn-primary" type="button" data-action="import-kindle-clippings" ${totals.highlights + totals.notes === 0 ? 'disabled' : ''}>Import Clippings</button>
        </div>
      </div>`;
  }

  function renderError() {
    const preview = getDocument()?.getElementById?.('kindleImportPreview');
    if (!preview) return;
    preview.innerHTML = `
      <div class="empty-state empty-state--compact" id="kindleImportError">
        <div class="empty-state-title">Could not read this clippings file</div>
        <div class="empty-state-body">Choose a valid My Clippings.txt file and try again.</div>
      </div>`;
  }

  return renderKindleImportPage;
}
