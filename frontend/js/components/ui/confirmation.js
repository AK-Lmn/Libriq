import { AccessibleDialog } from './dialog.js';

let activeConfirmation = false;

function presentConfirmation({ overlay, panel, heading, description, cancel, close, accept,
  trigger, signal, canAccept = () => true, remove = false, cleanup = () => {} }) {
  const dialog = new AccessibleDialog(overlay, {
    panel, labelledBy: heading, describedBy: description, initialFocus: cancel,
  });
  activeConfirmation = true;
  return new Promise(resolve => {
    let settled = false;
    const finish = result => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', onClose);
      overlay.removeEventListener('dialog:close', onClose);
      cancel.removeEventListener('click', onClose);
      close.removeEventListener('click', onClose);
      accept.removeEventListener('click', onAccept);
      cleanup();
      dialog.close();
      dialog.destroy();
      if (remove) overlay.remove();
      // Finish focus restoration before a caller can open its next confirmation.
      requestAnimationFrame(() => {
        activeConfirmation = false;
        resolve(result);
      });
    };
    const onClose = () => finish(false);
    const onAccept = () => { if (!accept.disabled && canAccept()) finish(true); };
    cancel.addEventListener('click', onClose);
    close.addEventListener('click', onClose);
    accept.addEventListener('click', onAccept);
    overlay.addEventListener('dialog:close', onClose);
    signal?.addEventListener('abort', onClose, { once: true });
    dialog.open({ trigger });
  });
}

/**
 * Presentation only: await confirmAction(message, { title, confirmLabel,
 * cancelLabel, detail, tone: 'danger' | 'default', trigger, signal }).
 * Only the explicit action resolves true. Cancel, Close, Escape, backdrop,
 * abort, missing DOM, blank messages and overlapping requests resolve false.
 * Cancel receives initial focus. Callers retain authorization and execution.
 * Load css/features/support-dialogs.css alongside the shared dialog styles.
 */
export function confirmAction(message, options = {}) {
  if (!globalThis.document?.body || activeConfirmation || typeof message !== 'string' || !message.trim()) {
    return Promise.resolve(false);
  }
  const {
    title = 'Confirm action',
    confirmLabel = 'Continue',
    cancelLabel = 'Cancel',
    detail = '',
    tone = 'danger',
    trigger = document.activeElement,
    signal,
  } = options;
  if (signal?.aborted) return Promise.resolve(false);

  const element = (tag, className, text) => {
    const node = document.createElement(tag);
    node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const button = (className, text) => {
    const node = element('button', className, text);
    node.type = 'button';
    return node;
  };
  const overlay = element('div', 'modal-overlay action-confirmation');
  overlay.id = 'actionConfirmationModal';
  overlay.dataset.tone = tone === 'default' ? 'default' : 'danger';
  const panel = element('div', 'modal modal--centered');
  const header = element('div', 'modal-header');
  const heading = element('h2', 'modal-title', title);
  heading.id = 'actionConfirmationTitle';
  const close = button('modal-close', '');
  close.setAttribute('aria-label', 'Close confirmation');
  const closeIcon = element('i', 'ph ph-x');
  closeIcon.setAttribute('aria-hidden', 'true');
  close.append(closeIcon);
  header.append(heading, close);

  const body = element('div', 'modal-body');
  const notice = element('div', 'modal-danger-panel');
  const icon = element('div', 'modal-danger-icon');
  icon.setAttribute('aria-hidden', 'true');
  icon.append(element('i', tone === 'default' ? 'ph ph-info' : 'ph ph-warning'));
  const copy = element('div', 'confirmation-copy');
  const description = element('p', 'modal-danger-copy', message);
  description.id = 'actionConfirmationDescription';
  copy.append(description);
  if (detail) {
    const note = element('p', 'modal-warning-note', detail);
    note.id = 'actionConfirmationDetail';
    copy.append(note);
  }
  notice.append(icon, copy);
  body.append(notice);
  const footer = element('div', 'modal-footer');
  const cancel = button('btn btn-secondary', cancelLabel);
  cancel.id = 'actionConfirmationCancel';
  const confirm = button(`btn ${tone === 'default' ? 'btn-primary' : 'btn-danger'}`, confirmLabel);
  confirm.id = 'actionConfirmationAccept';
  footer.append(cancel, confirm);
  panel.append(header, body, footer);
  overlay.append(panel);
  document.body.append(overlay);

  const result = presentConfirmation({ overlay, panel, heading, description, cancel, close,
    accept: confirm, trigger, signal, remove: true });
  if (detail) overlay.setAttribute('aria-describedby', `${description.id} actionConfirmationDetail`);
  return result;
}

/**
 * Drop-in presentation for navigation's confirmDangerAction(options).
 * Uses the existing dangerConfirm* IDs and exact case-sensitive phrase check
 * (surrounding whitespace trimmed, as before). Missing copy fails closed.
 * No destructive work is run here.
 */
export function confirmTypedAction({ title, body, prompt, expected, actionLabel,
  trigger = globalThis.document?.activeElement, signal } = {}) {
  if (!globalThis.document?.body || activeConfirmation || signal?.aborted
    || ![title, body, prompt, expected, actionLabel].every(value => typeof value === 'string' && value.trim())) {
    return Promise.resolve(false);
  }
  const overlay = document.getElementById('dangerConfirmModal');
  const heading = document.getElementById('dangerConfirmTitle');
  const description = document.getElementById('dangerConfirmBody');
  const copy = document.getElementById('dangerConfirmBodyCopy');
  const label = document.getElementById('dangerConfirmPrompt');
  const input = document.getElementById('dangerConfirmInput');
  const accept = document.getElementById('dangerConfirmAction');
  const cancel = document.getElementById('dangerConfirmCancel');
  const close = document.getElementById('closeDangerConfirm');
  const error = document.getElementById('dangerConfirmError');
  if (![overlay, heading, description, copy, label, input, accept, cancel, close, error].every(Boolean)) {
    return Promise.resolve(false);
  }
  heading.textContent = title;
  description.textContent = 'Review the consequences before confirming.';
  copy.textContent = body;
  label.textContent = prompt;
  input.value = '';
  input.placeholder = prompt;
  input.setAttribute('aria-describedby', label.id);
  input.removeAttribute('aria-invalid');
  error.hidden = true;
  error.textContent = '';
  error.setAttribute('role', 'alert');
  accept.textContent = actionLabel;
  accept.disabled = true;
  const canAccept = () => input.value.trim() === expected;
  const onInput = () => {
    error.hidden = true;
    input.removeAttribute('aria-invalid');
    accept.disabled = !canAccept();
  };
  input.addEventListener('input', onInput);
  return presentConfirmation({ overlay, panel: overlay.firstElementChild, heading, description: copy,
    cancel, close, accept, trigger, signal, canAccept,
    cleanup: () => { input.removeEventListener('input', onInput); accept.disabled = true; } });
}
