export function executeGoodreadsImport({ importPlan, storage, mergeMatched = true } = {}) {
  if (!importPlan || !storage) {
    throw new TypeError('executeGoodreadsImport requires importPlan and storage.');
  }

  const booksToCreate = Array.isArray(importPlan.booksToCreate) ? importPlan.booksToCreate : [];
  const matchedBooks = Array.isArray(importPlan.matchedBooks) ? importPlan.matchedBooks : [];

  let booksCreated = 0;
  let booksMatchedCount = 0;

  for (const item of booksToCreate) {
    if (!item?.candidate) continue;
    const added = storage.addBook?.(item.candidate);
    if (added !== false) booksCreated++;
  }

  if (mergeMatched) {
    for (const item of matchedBooks) {
      const existing = item?.existingBook;
      const parsed = item?.parsedBook;
      if (!existing?.id || !parsed) continue;

      const patch = {};
      let hasChanges = false;

      // Enrich rating if existing is unrated
      if (existing.rating == null && parsed.rating != null) {
        patch.rating = parsed.rating;
        hasChanges = true;
      }

      // Enrich review if existing has none
      if (!existing.review && parsed.review) {
        patch.review = parsed.review;
        hasChanges = true;
      }

      // Enrich notes if existing has none
      if (!existing.notes && parsed.notes) {
        patch.notes = parsed.notes;
        patch.notesUpdatedAt = new Date().toISOString();
        hasChanges = true;
      }

      // Enrich page count if existing is 0
      if (!existing.pageCount && parsed.pageCount) {
        patch.pageCount = parsed.pageCount;
        hasChanges = true;
      }

      // Enrich publish year if missing
      if (!existing.publishYear && parsed.publishYear) {
        patch.publishYear = parsed.publishYear;
        hasChanges = true;
      }

      // Enrich publisher if missing
      if (!existing.publisher && parsed.publisher) {
        patch.publisher = parsed.publisher;
        hasChanges = true;
      }

      // Enrich date finished if missing and parsed has it
      if (!existing.dateFinished && parsed.dateRead) {
        patch.dateFinished = new Date(parsed.dateRead).toISOString();
        hasChanges = true;
      }

      if (hasChanges) {
        patch.updatedAt = new Date().toISOString();
        const updated = storage.updateBook?.(existing.id, patch);
        if (updated !== false) booksMatchedCount++;
      }
    }
  }

  const result = {
    booksCreated,
    booksMatched: booksMatchedCount,
    totalImported: booksCreated + booksMatchedCount,
  };

  if ((booksCreated > 0 || booksMatchedCount > 0) && typeof storage.buildActivityEvent === 'function' && typeof storage.addActivityEvent === 'function') {
    const event = storage.buildActivityEvent('goodreads_imported', null, result, 'import');
    if (event) storage.addActivityEvent(event);
  }

  return result;
}
