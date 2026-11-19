// Ties a validation message to the field it is about, so screen readers
// announce it with the field: aria-invalid on the input and the message's id
// in its aria-describedby. Existing describedby ids (hints) are kept.

function describedByIds(input) {
  return (input.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
}

function setDescribedBy(input, ids) {
  if (ids.length) input.setAttribute('aria-describedby', ids.join(' '));
  else input.removeAttribute('aria-describedby');
}

/**
 * Marks `input` invalid. With `message`, writes it in a `.form-error` line
 * after the field (id `${input.id}Error`). With `describedById`, points at an
 * existing message element instead (e.g. a form-level error).
 */
export function setFieldError(input, { message = '', describedById = '' } = {}) {
  if (!input) return;
  let errorId = describedById;
  if (!errorId && message && input.id) {
    errorId = `${input.id}Error`;
    let line = input.ownerDocument.getElementById(errorId);
    if (!line) {
      line = input.ownerDocument.createElement('p');
      line.id = errorId;
      line.className = 'form-error';
      line.dataset.fieldError = 'true';
      input.insertAdjacentElement('afterend', line);
    }
    line.textContent = message;
  }
  input.setAttribute('aria-invalid', 'true');
  if (errorId) {
    const ids = describedByIds(input).filter(id => id !== errorId);
    setDescribedBy(input, [...ids, errorId]);
  }
  // Clear as soon as the reader edits the field.
  if (!input.dataset.fieldErrorWatch) {
    input.dataset.fieldErrorWatch = 'true';
    input.addEventListener('input', () => clearFieldError(input), { once: false });
  }
  input.dataset.fieldErrorId = errorId || '';
}

export function clearFieldError(input) {
  if (!input || input.getAttribute('aria-invalid') !== 'true') return;
  input.removeAttribute('aria-invalid');
  const errorId = input.dataset.fieldErrorId;
  if (errorId) {
    setDescribedBy(input, describedByIds(input).filter(id => id !== errorId));
    const line = input.ownerDocument.getElementById(errorId);
    if (line?.dataset.fieldError === 'true') line.remove();
  }
  delete input.dataset.fieldErrorId;
}

/** Flags each [input, options] pair and focuses the first one. */
export function showFieldErrors(entries) {
  const flagged = entries.filter(([input]) => input);
  flagged.forEach(([input, options]) => setFieldError(input, options));
  flagged[0]?.[0].focus();
}

export function clearFieldErrors(inputs) {
  inputs.forEach(clearFieldError);
}
