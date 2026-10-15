import { AccessibleDialog } from '../../components/ui/dialog.js';

export function createGoodreadsImportPage({
  parseCsv,
  buildImportPlan,
  executeImport,
  actions = {},
  documentRoot,
} = {}) {
  if (typeof parseCsv !== 'function') throw new TypeError('createGoodreadsImportPage requires parseCsv.');
  if (typeof buildImportPlan !== 'function') throw new TypeError('createGoodreadsImportPage requires buildImportPlan.');

  let boundRoot = null;
  let previewResult = null;
  let selectedFile = null;
  let dialog = null;
  let revision = 0;
  let importing = false;
  const getDocument = () => documentRoot || globalThis.document;

  function ensureModal() {
    const pageDocument = getDocument();
    if (!pageDocument) return null;
    let modal = pageDocument.getElementById?.('goodreadsImportModal');
    if (!modal) {
      modal = pageDocument.createElement?.('div');
      if (!modal) return null;
      modal.id = 'goodreadsImportModal';
      modal.className = 'modal-overlay';
      modal.hidden = true;
      modal.setAttribute?.('role', 'dialog');
      modal.setAttribute?.('aria-modal', 'true');
      modal.setAttribute?.('aria-labelledby', 'goodreadsImportTitle');
      modal.setAttribute?.('aria-describedby', 'goodreadsImportDescription');
      pageDocument.body?.appendChild?.(modal);
    }
    return modal;
  }

  function renderShell(modal) {
    modal.innerHTML = `
      <div class="modal modal--centered goodreads-import-panel" tabindex="-1">
        <div class="modal-header">
          <div class="goodreads-import-heading">
            <span class="goodreads-import-eyebrow"><i class="ph ph-books" aria-hidden="true"></i> From Goodreads</span>
            <h2 class="modal-title" id="goodreadsImportTitle">Import Goodreads Library</h2>
            <p class="goodreads-import-subtitle" id="goodreadsImportDescription">Upload your goodreads_library_export.csv to review your books before importing.</p>
          </div>
          <button class="modal-close" type="button" aria-label="Close Goodreads import" data-action="cancel-goodreads-import">
            <i class="ph ph-x" aria-hidden="true"></i>
          </button>
        </div>
        <div class="modal-body">
          <ol class="goodreads-import-steps" aria-label="Import steps"><li><span>01</span> Choose CSV</li><li><span>02</span> Review preview</li><li><span>03</span> Import</li></ol>
          <div class="goodreads-import-file">
            <div class="goodreads-import-file-icon"><i class="ph ph-file-csv" aria-hidden="true"></i></div>
            <div class="goodreads-import-file-fields">
              <label class="form-label" for="goodreadsCsvInput">goodreads_library_export.csv</label>
              <p id="goodreadsFileHint">In Goodreads, go to My Books &gt; Import and export &gt; Export Library, then select the downloaded CSV file.</p>
              <input class="form-input" id="goodreadsCsvInput" type="file" accept=".csv,text/csv,text/comma-separated-values" aria-describedby="goodreadsFileHint" data-action="select-goodreads-file" />
            </div>
          </div>
          <div id="goodreadsImportPreview" aria-live="polite" aria-atomic="true"></div>
          <p class="goodreads-import-privacy"><i class="ph ph-lock-simple" aria-hidden="true"></i> Your library stays completely private on this device and your LibriQ account. No external connection is made.</p>
        </div>
        <div class="modal-footer goodreads-import-footer">
          <button class="btn btn-secondary" type="button" data-action="cancel-goodreads-import">Cancel</button>
          <button class="btn btn-primary" id="continueGoodreadsImport" type="button" data-action="continue-goodreads-import" disabled>Continue Import</button>
        </div>
      </div>`;
  }

  function open() {
    const modal = ensureModal();
    if (!modal) return false;
    dialog?.destroy();
    revision += 1;
    importing = false;
    previewResult = null;
    selectedFile = null;
    renderShell(modal);
    bindActions(modal);
    renderInitial();
    setState('initial');
    setContinueEnabled(false);
    if (typeof Element !== 'undefined' && modal instanceof Element) {
      dialog = new AccessibleDialog(modal, {
        panel: modal.firstElementChild,
        closeOnEscape: false,
        closeOnBackdrop: false,
        initialFocus: '.goodreads-import-footer [data-action="cancel-goodreads-import"]',
      });
      dialog.open();
    } else {
      modal.hidden = false;
      modal.querySelector?.('[data-action="cancel-goodreads-import"]')?.focus?.();
    }
    return true;
  }

  function close({ notify = false } = {}) {
    revision += 1;
    importing = false;
    dialog?.close();
    const modal = getDocument()?.getElementById?.('goodreadsImportModal');
    if (modal) modal.hidden = true;
    previewResult = null;
    selectedFile = null;
    if (notify) actions.cancel?.();
  }

  function bindActions(root) {
    if (boundRoot === root) return;
    boundRoot = root;
    root.addEventListener('change', handleFileChange);
    root.addEventListener('click', handleClick);
    root.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !importing) {
        event.preventDefault?.();
        close({ notify: true });
      }
    });
  }

  async function handleFileChange(event) {
    if (!event.target.matches?.('[data-action="select-goodreads-file"]')) return;
    if (importing) return;
    const request = ++revision;
    const file = event.target.files?.[0];
    previewResult = null;
    selectedFile = file || null;
    setContinueEnabled(false);
    if (!file) {
      renderInitial();
      setState('initial');
      return;
    }
    if (typeof file.text !== 'function') {
      renderError('Could not read the selected file.');
      return;
    }
    setState('reading');
    renderMessage('Reading your Goodreads export…', 'Parsing books, ratings, shelves and reading dates. Nothing has been imported yet.', 'processing', 'ph-hourglass');
    try {
      const text = await file.text();
      if (request !== revision) return;
      if (!String(text).trim()) {
        renderEmpty();
        return;
      }
      const parsed = parseCsv(text);
      if (!parsed?.ok || !Array.isArray(parsed?.books) || parsed.books.length === 0) {
        renderError(parsed?.error || 'Could not find valid book records in this CSV.');
        return;
      }
      const existingBooks = actions.getExistingBooks?.() || [];
      const importPlan = buildImportPlan({ parsedBooks: parsed.books, existingBooks });
      previewResult = { parsed, importPlan, file };
      renderPreview(previewResult);
      setContinueEnabled(true);
      actions.previewReady?.(previewResult);
    } catch (error) {
      if (request !== revision) return;
      previewResult = null;
      setContinueEnabled(false);
      renderError(error?.message || 'Could not parse this Goodreads CSV.');
      actions.previewError?.(error, file);
    }
  }

  async function handleClick(event) {
    if (event.target === boundRoot && !importing) {
      close({ notify: true });
      return;
    }
    const trigger = event.target.closest?.('[data-action]');
    if (!trigger) return;
    const action = trigger.dataset.action;
    if (action === 'cancel-goodreads-import') {
      event.preventDefault?.();
      if (!importing) close({ notify: true });
    } else if (action === 'continue-goodreads-import' && previewResult && !importing) {
      event.preventDefault?.();
      const request = revision;
      const detail = previewResult;
      importing = true;
      setContinueEnabled(false);
      setState('importing');
      renderMessage('Importing your Goodreads library…', 'Adding books, ratings and dates to your library. Please keep this window open.', 'processing', 'ph-hourglass');
      getDocument()?.getElementById?.('goodreadsImportModal')?.querySelector?.('.goodreads-import-panel')?.focus?.();
      try {
        let result;
        if (typeof actions.continueImport === 'function') {
          result = await actions.continueImport(detail);
        } else if (typeof executeImport === 'function') {
          result = executeImport({ importPlan: detail.importPlan, storage: actions.getStorage?.() });
        }
        if (request !== revision) return;
        importing = false;
        if (result !== false) {
          renderMessage('Import complete', 'Your Goodreads books have been added to your private library.', 'complete', 'ph-check-circle');
          close();
        } else {
          renderExecutionError();
        }
      } catch (error) {
        if (request !== revision) return;
        importing = false;
        renderExecutionError();
        actions.executionError?.(error, detail);
      }
    }
  }

  function renderPreview({ importPlan, file }) {
    const preview = getDocument()?.getElementById?.('goodreadsImportPreview');
    if (!preview) return;
    const totals = importPlan.totals;
    const stats = [
      ['goodreadsBooksToCreate', 'New books to add', totals.toCreate],
      ['goodreadsBooksMatched', 'Existing books to update', totals.matched],
      ['goodreadsBooksFinished', 'Finished (Read)', totals.finished],
      ['goodreadsBooksReading', 'Currently reading', totals.reading],
      ['goodreadsBooksWishlist', 'Want to read', totals.wishlist],
      ['goodreadsBooksRated', 'With ratings', totals.rated],
    ];

    const sampleBooks = [
      ...importPlan.booksToCreate.map(b => ({ title: b.candidate.title, author: b.candidate.author, status: b.candidate.status, isNew: true })),
      ...importPlan.matchedBooks.map(b => ({ title: b.parsedBook.title, author: b.parsedBook.author, status: b.mappedStatus, isNew: false })),
    ].slice(0, 5);

    setState('preview');
    preview.innerHTML = `
      <div class="goodreads-preview-summary" id="goodreadsImportSummary">
        <div class="goodreads-preview-heading">
          <h3>Import Preview</h3>
          <span><i class="ph ph-eye" aria-hidden="true"></i> ${escapeHtml(totals.total)} books found</span>
        </div>
        <p class="goodreads-preview-filename">${escapeHtml(file?.name || 'goodreads_library_export.csv')}</p>
        <dl class="goodreads-preview-counts">
          ${stats.map(([id, label, value]) => `
            <div class="goodreads-preview-stat">
              <dt>${label}</dt>
              <dd id="${id}">${Number(value) || 0}</dd>
            </div>
          `).join('')}
        </dl>
        ${sampleBooks.length > 0 ? `
          <div class="goodreads-preview-samples">
            <h4>Sample titles:</h4>
            <ul>
              ${sampleBooks.map(b => `
                <li>
                  <span class="sample-title">${escapeHtml(b.title)}</span>
                  <span class="sample-author">by ${escapeHtml(b.author)}</span>
                  <span class="sample-badge sample-badge--${escapeHtml(b.status)}">${escapeHtml(b.status)}</span>
                </li>
              `).join('')}
            </ul>
          </div>
        ` : ''}
        <p class="goodreads-preview-explanation">Nothing has changed yet. Continue Import creates new books and enriches ratings and notes on existing books without creating duplicate entries.</p>
      </div>`;
  }

  function renderInitial() {
    renderMessage('Preview before you import', 'Choose your Goodreads export CSV to see books, shelves, ratings and dates. Nothing changes until you confirm.', 'initial', 'ph-eye');
  }

  function renderExecutionError() {
    renderPreview(previewResult);
    const preview = getDocument()?.getElementById?.('goodreadsImportPreview');
    if (preview) {
      preview.innerHTML = `
        <div class="goodreads-import-message goodreads-import-message--error" id="goodreadsImportError" role="alert">
          <i class="ph ph-warning-circle" aria-hidden="true"></i>
          <div><h3>Could not complete the import</h3><p>Some books may already have been added. Check your library before retrying.</p></div>
        </div>${preview.innerHTML}`;
    }
    setState('error');
    setContinueEnabled(true);
    getDocument()?.getElementById?.('goodreadsImportModal')?.querySelector?.('.goodreads-import-footer [data-action="cancel-goodreads-import"]')?.focus?.();
  }

  function setState(state) {
    const modal = getDocument()?.getElementById?.('goodreadsImportModal');
    modal?.setAttribute?.('data-state', state);
    const input = getDocument()?.getElementById?.('goodreadsCsvInput');
    if (input) input.disabled = importing;
    modal?.querySelectorAll?.('[data-action="cancel-goodreads-import"]').forEach(button => { button.disabled = importing; });
    const button = getDocument()?.getElementById?.('continueGoodreadsImport');
    if (button) button.textContent = importing ? 'Importing…' : 'Continue Import';
  }

  function renderEmpty() {
    setState('empty');
    renderMessage('No books found', 'The selected file is empty. Choose a populated goodreads_library_export.csv file.', 'empty', 'ph-file-csv');
  }

  function renderError(description = 'Choose a valid Goodreads export CSV and try again.') {
    setState('error');
    renderMessage('Could not read this Goodreads CSV', description, 'error', 'ph-warning-circle');
  }

  function renderMessage(title, body, state, icon) {
    const preview = getDocument()?.getElementById?.('goodreadsImportPreview');
    if (!preview) return;
    preview.innerHTML = `
      <div class="goodreads-import-message goodreads-import-message--${state}" id="${state === 'error' || state === 'empty' ? 'goodreadsImportError' : 'goodreadsImportStatus'}" ${state === 'error' ? 'role="alert"' : ''}>
        <i class="ph ${icon}" aria-hidden="true"></i>
        <div><h3>${title}</h3><p>${body}</p></div>
      </div>`;
  }

  function setContinueEnabled(enabled) {
    const button = getDocument()?.getElementById?.('continueGoodreadsImport');
    if (button) button.disabled = !enabled;
  }

  return { open, close, getPreview: () => previewResult, getSelectedFile: () => selectedFile };
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}
