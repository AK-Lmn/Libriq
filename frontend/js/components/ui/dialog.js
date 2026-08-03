const FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'iframe',
  'object',
  'embed',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/** Accessible controller for an existing dialog/overlay element. */
export class AccessibleDialog {
  static #openDialogs = [];
  static #scrollState = null;
  static #inertState = new Map();

  #element;
  #panel;
  #labelledBy;
  #describedBy;
  #closeOnEscape;
  #closeOnBackdrop;
  #initialFocus;
  #returnFocus;
  #previousFocus = null;
  #nestedParent = null;
  #nestedParentAriaHidden = null;
  #isOpen = false;
  #onKeyDown;
  #onBackdropClick;

  constructor(element, {
    panel = null,
    labelledBy = null,
    describedBy = null,
    closeOnEscape = true,
    closeOnBackdrop = true,
    initialFocus = null,
    returnFocus = true,
  } = {}) {
    if (!(element instanceof Element)) {
      throw new TypeError('AccessibleDialog requires a dialog Element.');
    }

    this.#element = element;
    this.#panel = this.#resolveElement(panel) || element.firstElementChild || element;
    this.#labelledBy = labelledBy;
    this.#describedBy = describedBy;
    this.#closeOnEscape = closeOnEscape;
    this.#closeOnBackdrop = closeOnBackdrop;
    this.#initialFocus = initialFocus;
    this.#returnFocus = returnFocus;
    this.#onKeyDown = this.#handleKeyDown.bind(this);
    this.#onBackdropClick = this.#handleBackdropClick.bind(this);

    this.#element.setAttribute('role', 'dialog');
    this.#element.setAttribute('aria-modal', 'true');
    this.#applyAriaReferences();
    if (!this.#element.hasAttribute('hidden')) this.#element.setAttribute('hidden', '');
  }

  get isOpen() {
    return this.#isOpen;
  }

  open({ trigger = document.activeElement, initialFocus = this.#initialFocus } = {}) {
    if (this.#isOpen) return;
    this.#isOpen = true;
    this.#previousFocus = trigger instanceof HTMLElement ? trigger : document.activeElement;
    this.#nestedParent = AccessibleDialog.#openDialogs.at(-1) || null;
    if (this.#nestedParent) {
      this.#nestedParentAriaHidden = this.#nestedParent.#element.getAttribute('aria-hidden');
      this.#nestedParent.#element.inert = true;
      this.#nestedParent.#element.setAttribute('aria-hidden', 'true');
    }
    AccessibleDialog.#openDialogs.push(this);

    this.#element.removeAttribute('hidden');
    this.#element.addEventListener('click', this.#onBackdropClick);
    document.addEventListener('keydown', this.#onKeyDown, true);
    AccessibleDialog.#lockPage(this.#element);

    queueMicrotask(() => {
      const target = this.#resolveElement(initialFocus)
        || this.#getFocusableElements()[0]
        || this.#panel;
      if (!target.hasAttribute?.('tabindex') && target === this.#panel) target.setAttribute('tabindex', '-1');
      target.focus?.({ preventScroll: true });
    });
  }

  close({ restoreFocus = this.#returnFocus } = {}) {
    if (!this.#isOpen) return;
    this.#isOpen = false;
    this.#element.setAttribute('hidden', '');
    this.#element.removeEventListener('click', this.#onBackdropClick);
    document.removeEventListener('keydown', this.#onKeyDown, true);

    const index = AccessibleDialog.#openDialogs.lastIndexOf(this);
    if (index >= 0) AccessibleDialog.#openDialogs.splice(index, 1);
    if (this.#nestedParent?.#isOpen) {
      this.#nestedParent.#element.inert = false;
      if (this.#nestedParentAriaHidden === null) this.#nestedParent.#element.removeAttribute('aria-hidden');
      else this.#nestedParent.#element.setAttribute('aria-hidden', this.#nestedParentAriaHidden);
    }
    this.#nestedParent = null;
    this.#nestedParentAriaHidden = null;
    AccessibleDialog.#unlockPage();

    const focusTarget = this.#previousFocus;
    if (restoreFocus && focusTarget) {
      requestAnimationFrame(() => {
        if (focusTarget.isConnected) focusTarget.focus?.({ preventScroll: true });
      });
    }
    this.#previousFocus = null;
  }

  destroy() {
    this.close({ restoreFocus: false });
    this.#element.removeEventListener('click', this.#onBackdropClick);
    document.removeEventListener('keydown', this.#onKeyDown, true);
  }

  #applyAriaReferences() {
    const labelledBy = this.#resolveElement(this.#labelledBy);
    const describedBy = this.#resolveElement(this.#describedBy);
    if (labelledBy?.id) this.#element.setAttribute('aria-labelledby', labelledBy.id);
    if (describedBy?.id) this.#element.setAttribute('aria-describedby', describedBy.id);
    if (labelledBy) this.#element.removeAttribute('aria-label');
  }

  #resolveElement(value) {
    if (value instanceof Element) return value;
    if (typeof value === 'string') return this.#element.querySelector(value) || document.querySelector(value);
    return null;
  }

  #getFocusableElements() {
    return [...this.#panel.querySelectorAll(FOCUSABLE_SELECTOR)].filter(element => {
      if (element.closest('[hidden], [inert]')) return false;
      return element.getClientRects().length > 0;
    });
  }

  #handleKeyDown(event) {
    if (AccessibleDialog.#openDialogs.at(-1) !== this) return;
    if (event.key === 'Escape' && this.#closeOnEscape) {
      event.preventDefault();
      this.close();
      this.#element.dispatchEvent(new CustomEvent('dialog:close', { bubbles: true, detail: { reason: 'escape' } }));
      return;
    }
    if (event.key !== 'Tab') return;

    const focusable = this.#getFocusableElements();
    if (focusable.length === 0) {
      event.preventDefault();
      this.#panel.focus?.();
      return;
    }

    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  #handleBackdropClick(event) {
    if (this.#closeOnBackdrop && event.target === this.#element) {
      this.close();
      this.#element.dispatchEvent(new CustomEvent('dialog:close', { bubbles: true, detail: { reason: 'backdrop' } }));
    }
  }

  static #lockPage(activeDialog) {
    if (!AccessibleDialog.#scrollState) {
      AccessibleDialog.#scrollState = {
        overflow: document.body.style.overflow,
        paddingRight: document.body.style.paddingRight,
      };
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
      document.body.style.overflow = 'hidden';
      if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`;
    }

    if (AccessibleDialog.#openDialogs.length > 1) return;
    [...document.body.children].forEach(element => {
      if (element === activeDialog || element.contains(activeDialog)) return;
      AccessibleDialog.#inertState.set(element, {
        inert: element.inert,
        ariaHidden: element.getAttribute('aria-hidden'),
      });
      element.inert = true;
      element.setAttribute('aria-hidden', 'true');
    });
  }

  static #unlockPage() {
    if (AccessibleDialog.#openDialogs.length > 0) return;

    AccessibleDialog.#inertState.forEach((state, element) => {
      element.inert = state.inert;
      if (state.ariaHidden === null) element.removeAttribute('aria-hidden');
      else element.setAttribute('aria-hidden', state.ariaHidden);
    });
    AccessibleDialog.#inertState.clear();

    if (AccessibleDialog.#scrollState) {
      document.body.style.overflow = AccessibleDialog.#scrollState.overflow;
      document.body.style.paddingRight = AccessibleDialog.#scrollState.paddingRight;
      AccessibleDialog.#scrollState = null;
    }
  }
}
