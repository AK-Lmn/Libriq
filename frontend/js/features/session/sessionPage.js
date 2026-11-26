import { BookAPI } from '../../api/index.js';
import { Storage } from '../../storage.js';
import { Utils } from '../../utils.js';
import { LibriqFirebase } from '../../firebase-client.js';
import { resolveAccountDisplayName } from '../../accountDisplayName.js';
import { savePendingBook } from '../../services/pendingIntents.js';
import { coverImgAttrs } from '../../shared/coverSize.js';
import { initialAuthMode } from '../../shared/authMode.js';
import { MIN_PASSWORD_LENGTH, newPasswordProblem } from '../../shared/passwordPolicy.js';
import { showFieldErrors, clearFieldErrors } from '../../shared/fieldErrors.js';
import { MIN_SEARCH_LENGTH } from '../../shared/searchQuery.js';
import { STORAGE_KEYS } from '../../shared/storageKeys.js';
import { Navigation } from '../../navigation.js';

export function renderSessionChoicePage() {
  const main = document.getElementById('mainContent');
  if (!main) {
    console.error('[LibriQ] Missing #mainContent while rendering session choice page.');
    return;
  }
  window.LibriqSessionFallback?.close?.();
  main.hidden = false;
  const firebase = LibriqFirebase.getState();
  if (!Navigation.shouldRenderSessionScreen?.(firebase)) {
    if (localStorage.getItem(STORAGE_KEYS.DEBUG_SYNC) === '1') {
      console.debug('[LibriQ][SyncDebug][Nav] session screen blocked', {
        reason: Navigation.isConfirmedSignedOut?.(firebase) ? 'not on session screen' : Navigation.getSessionScreenSuppressionReason?.(firebase),
        hasUser: Boolean(firebase.user),
        restoringSession: Boolean(firebase.restoringSession),
        signedOutConfirmed: Boolean(firebase.signedOutConfirmed),
        ready: Boolean(firebase.ready),
        currentPage: Navigation.currentPage,
      });
    }
    if (firebase.user || firebase.restoringSession) {
      Navigation.goTo('dashboard');
      return;
    }
    if (Navigation.currentPage !== 'session') {
      Navigation.goTo('dashboard');
      return;
    }
  }
  const sessionContext = LibriqFirebase.getSessionContext();
  const hasUser = Boolean(firebase.user);
  const accountName = getDisplayNameForAccount(firebase.user);
  const loading = !firebase.ready || firebase.restoringSession;
  const inAppBrowser = Boolean(sessionContext.isInAppBrowser);
  const signInButtonLabel = hasUser ? `Continue as ${Utils.sanitize(accountName)}` : 'Continue with Google';
  const signInButtonHelp = inAppBrowser
    ? 'Google sign-in may not work inside this app browser.'
    : 'Use your account for cloud backup and Account Sync.';
  const browserHelp = inAppBrowser
    ? 'Open LibriQ in Chrome or Safari to sign in with Google.'
    : '';
  const openInBrowserHref = 'https://libriq.app';
  const authUnavailable = !firebase.available || (typeof navigator !== 'undefined' && navigator.onLine === false);
  const offlineCheckDelayMs = 900;
  const offlineStabilityMs = 1400;

  if (!window.LibriqSessionFallback) {
    window.LibriqSessionFallback = {
      timer: null,
      lastRequestedAt: 0,
      dismissAt: 0,
      modalVisible: false,
    };
  }
  const fallbackState = window.LibriqSessionFallback;

  main.innerHTML = `
    <div class="session-page">
      <section class="session-hero">
        <header class="session-masthead">
          <a class="session-brand" href="./" aria-label="LibriQ home">
            <span class="session-brand-mark">Q</span>
            <span><strong>LibriQ</strong><small>Your reading life, in one place</small></span>
          </a>
          <span class="session-privacy"><i class="ph ph-lock-key" aria-hidden="true"></i> A private space for readers</span>
        </header>
        <div class="session-card-stack session-auth-panel">
          <div class="session-auth-heading">
            <span>Welcome to LibriQ</span>
            <h2 id="sessionAuthTitle">${hasUser ? `Continue your library` : 'Welcome back, reader.'}</h2>
            <p id="sessionAuthCopy">${hasUser ? 'Your account is ready on this device.' : 'Sign in to pick up where you left off.'}</p>
          </div>
          ${inAppBrowser ? `
            <div class="session-inapp-notice" role="alert">
              <div class="session-inapp-icon"><i class="ph ph-warning-circle" aria-hidden="true"></i></div>
              <div class="session-inapp-body">
                <strong>You’re in a social-app browser</strong>
                <p>Google sign-in is blocked in some social apps. Use email below, or continue in your system browser.</p>
                <a class="session-inapp-link" href="${openInBrowserHref}" target="_blank" rel="noopener noreferrer">
                  <i class="ph ph-arrow-square-out" aria-hidden="true"></i> Open in Safari / Chrome
                </a>
              </div>
            </div>
          ` : ''}
          ${loading ? `
            <div class="session-loading-card" aria-live="polite">
              <div class="session-loading-spinner"></div>
              <div>
                <div class="session-card-title">Checking your sign-in status</div>
                <div class="session-card-body">Just a moment while LibriQ checks whether you are already signed in.</div>
              </div>
            </div>
          ` : ''}

          ${loading ? '' : hasUser ? `
            <button class="session-card session-card-primary" id="googleContinueBtn" type="button">
              <div class="session-card-icon"><i class="ph ph-user-circle" aria-hidden="true"></i></div>
              <div class="session-card-content">
                <div class="session-card-title">Continue as ${Utils.sanitize(accountName)}</div>
                <div class="session-card-body">Your signed-in account is ready. Continue to your private library with existing backup and sync settings.</div>
              </div>
              <div class="session-card-action"><i class="ph ph-arrow-right" aria-hidden="true"></i></div>
            </button>
          ` : !firebase.available ? `
            <div class="session-card session-card-unavailable">
              <div class="session-card-icon"><i class="ph ph-warning-circle" aria-hidden="true"></i></div>
              <div class="session-card-content">
                <div class="session-card-title">Account sign-in unavailable</div>
                <div class="session-card-body">LibriQ cannot reach account services right now.</div>
                <button class="btn btn-secondary" id="sessionServiceRetryBtn" type="button">Retry account services</button>
              </div>
            </div>
          ` : ''}

          ${!loading && !hasUser && firebase.initialized && firebase.available ? `
            <div class="session-auth-tabs" role="tablist" aria-label="Email account options">
              <button class="session-auth-tab active" id="sessionSigninTab" role="tab" aria-controls="emailAuthForm" type="button" data-auth-mode="signin" aria-selected="true">Sign in with Email</button>
              <button class="session-auth-tab" id="sessionSignupTab" role="tab" aria-controls="emailAuthForm" type="button" data-auth-mode="signup" aria-selected="false" tabindex="-1">Create account</button>
            </div>
            <form class="session-email-form" id="emailAuthForm" role="tabpanel" aria-labelledby="sessionSigninTab" novalidate>
              <div class="session-reset-mode" id="sessionResetMode" hidden>
                <label class="session-field-label" for="sessionResetEmailInput">Account email</label>
                <input class="form-input" id="sessionResetEmailInput" type="email" placeholder="Email address" autocomplete="email" />
                <button class="btn btn-primary" id="sessionResetSubmit" type="button">
                  <i class="ph ph-envelope-simple" aria-hidden="true"></i>
                  <span>Send reset email</span>
                </button>
                <button class="btn btn-secondary" id="sessionResetBackBtn" type="button">
                  Back to sign in
                </button>
              </div>
              <div class="session-signin-mode" id="sessionSigninMode">
                <label class="session-field-label" for="sessionEmailInput">Email address</label>
                <input class="form-input" id="sessionEmailInput" type="email" placeholder="Email address" autocomplete="email" required />
                <label class="session-field-label" for="sessionPasswordInput">Password</label>
                <input class="form-input" id="sessionPasswordInput" type="password" placeholder="Password" autocomplete="current-password" required />
                <p class="session-field-help" id="sessionPasswordHelp" hidden>Use at least ${MIN_PASSWORD_LENGTH} characters.</p>
                <button class="btn btn-primary" id="emailAuthSubmit" type="submit">
                  <i class="ph ph-envelope-simple" aria-hidden="true"></i>
                  <span>Sign in with Email</span>
                </button>
                <button class="session-link-btn" id="forgotPasswordLink" type="button">Forgot password?</button>
              </div>
              <p class="session-auth-error" id="sessionAuthError" role="alert" hidden></p>
              <p class="session-auth-status" id="sessionAuthStatus" role="status" hidden></p>
            </form>
          ` : ''}

          ${!loading && !hasUser && firebase.initialized && firebase.available ? `
            <div class="session-provider-divider"><span>or continue with</span></div>
            <button class="session-card session-google-card ${inAppBrowser ? 'session-card-disabled' : ''}" id="googleSignInBtn" type="button" ${inAppBrowser ? 'disabled aria-describedby="googleSignInHelp"' : ''}>
              <div class="session-card-icon"><i class="ph ph-google-logo" aria-hidden="true"></i></div>
              <div class="session-card-content">
                <div class="session-card-title">${signInButtonLabel}</div>
                <div class="session-card-body" id="googleSignInHelp">${Utils.sanitize(signInButtonHelp)}</div>
              </div>
              <div class="session-card-action"><i class="ph ph-arrow-right" aria-hidden="true"></i></div>
            </button>
          ` : ''}

          ${browserHelp ? `
            <div class="session-help-callout">
              <div class="session-help-copy">${Utils.sanitize(browserHelp)}</div>
              <a class="session-help-link" href="${openInBrowserHref}" target="_blank" rel="noopener noreferrer">Open in browser</a>
            </div>
          ` : ''}

          ${hasUser ? `
            <button class="session-link-btn" id="switchAccountBtn" type="button">
              Use another account
            </button>
          ` : ''}

          <p class="session-fineprint">
            <i class="ph ph-lock-key" aria-hidden="true"></i> Your library is private. Sign in to save and sync across devices.
          </p>
          <p class="session-legal">By continuing, you agree to the <a href="./terms.html">Terms</a> and <span class="session-legal-tail"><a href="./privacy.html">Privacy Policy</a>.</span></p>
        </div>
        <div class="session-copy">
          <span class="session-eyebrow"><i class="ph ph-book-open-text" aria-hidden="true"></i> A calmer way to track what you read</span>
          <h1 class="session-title">Build a reading life worth remembering.</h1>
          <p class="session-subtitle">
            Keep your library, progress, notes, quotes, and reading patterns together in a private space designed around books.
          </p>

          <div class="session-points">
            <div class="session-point">
              <i class="ph ph-lock-key" aria-hidden="true"></i>
              <span>Your library stays private and under your control.</span>
            </div>
            <div class="session-point">
              <i class="ph ph-download-simple" aria-hidden="true"></i>
              <span>Bring in your Goodreads library and Kindle highlights, with a preview before anything is saved.</span>
            </div>
            ${inAppBrowser ? `
            <div class="session-point session-point-warning">
              <i class="ph ph-warning-circle" aria-hidden="true"></i>
              <span>Google sign-in may not work inside this app browser.</span>
            </div>` : ''}
            <div class="session-point">
              <i class="ph ph-cloud-check" aria-hidden="true"></i>
              <span>Account Sync keeps your reading space available across signed-in devices.</span>
            </div>
          </div>

          <div class="session-product-preview" aria-label="Preview of the LibriQ reading dashboard">
            <div class="session-preview-topbar">
              <span>A glimpse of your reading space</span>
              <span class="session-preview-avatar">R</span>
            </div>
            <div class="session-preview-heading">Your reading rhythm</div>
            <div class="session-preview-grid">
              <div class="session-preview-book">
                <span class="session-preview-cover"><i class="ph ph-book-open" aria-hidden="true"></i></span>
                <span><small>Reading now</small><strong>Continue your current book</strong></span>
              </div>
              <div class="session-preview-stat"><strong>12</strong><span>books this year</span></div>
              <div class="session-preview-stat"><strong>7</strong><span>day streak</span></div>
            </div>
            <div class="session-preview-progress"><span style="width: 68%"></span></div>
          </div>

          <div class="session-demo-showcase" id="sessionDemoShowcase" aria-label="Interactive preview: Search any book">
            <div class="session-demo-header">
              <span class="session-demo-badge"><i class="ph ph-sparkle" aria-hidden="true"></i> Live Book Search</span>
              <span class="session-demo-subtitle">Try finding your current read</span>
            </div>
            <div class="session-demo-searchbar">
              <i class="ph ph-magnifying-glass session-demo-search-icon" aria-hidden="true"></i>
              <input type="text" id="sessionDemoInput" class="session-demo-input" aria-label="Search books by title or author" placeholder="Search a title or author…" autocomplete="off" />
              <span class="session-demo-spinner" id="sessionDemoSpinner" hidden></span>
            </div>
            <div class="session-demo-tags">
              <span class="session-demo-tag-label">Try:</span>
              <button type="button" class="session-demo-tag" data-query="Project Hail Mary">Project Hail Mary</button>
              <button type="button" class="session-demo-tag" data-query="Atomic Habits">Atomic Habits</button>
              <button type="button" class="session-demo-tag" data-query="Dune">Dune</button>
            </div>
            <p class="session-demo-caption">Explore books here. An account is required to save them to your private library.</p>
            <div class="session-demo-results" id="sessionDemoResults" aria-live="polite" hidden></div>
          </div>
        </div>
      </section>
      <div class="session-fallback-modal" id="sessionFallbackModal" role="dialog" aria-modal="true" aria-labelledby="sessionFallbackTitle" aria-describedby="sessionFallbackCopy" hidden>
        <div class="session-fallback-card">
          <button class="session-fallback-close" id="sessionFallbackClose" type="button" aria-label="Back to sign in" data-dialog-initial-focus><i class="ph ph-x" aria-hidden="true"></i></button>
          <div class="session-card-icon"><i class="ph ph-wifi-slash" aria-hidden="true"></i></div>
          <div>
            <span class="session-eyebrow">Your reading space can wait</span>
            <h2 class="session-fallback-title" id="sessionFallbackTitle">No internet connection</h2>
            <p class="session-fallback-copy" id="sessionFallbackCopy">LibriQ needs internet to sign in and sync your library. An existing offline session can continue on this device; changes stay local until you reconnect.</p>
          </div>
          <div class="session-fallback-actions">
            <button class="btn btn-primary" id="authRetryBtn" type="button"><i class="ph ph-arrow-clockwise" aria-hidden="true"></i> Retry</button>
            <button class="btn btn-secondary" id="fallbackOfflineBtn" type="button"><i class="ph ph-house-simple" aria-hidden="true"></i> Continue offline</button>
          </div>
        </div>
      </div>
    </div>`;

  const fallbackModal = document.getElementById('sessionFallbackModal');
  const sessionHero = main.querySelector('.session-hero');
  const continueOffline = () => {
    hideFallback();
    Navigation.setSessionPreference('offline');
    window.LibriqSyncBeta?.pauseForOffline?.();
    Navigation.goTo('dashboard');
  };
  const hideFallback = () => {
    const modal = fallbackModal;
    if (!modal) return;
    Utils.hide(modal);
    sessionHero?.removeAttribute('inert');
    fallbackState.modalVisible = false;
    fallbackState.dismissAt = Date.now();
  };
  const showFallback = (reason = 'network') => {
    const modal = fallbackModal;
    if (!modal?.isConnected) return;
    const serviceUnavailable = reason === 'service' || !firebase.available;
    document.getElementById('sessionFallbackTitle').textContent = serviceUnavailable ? 'Account services unavailable' : 'Connection interrupted';
    document.getElementById('sessionFallbackCopy').textContent = serviceUnavailable
      ? 'LibriQ cannot reach account services right now. Try again shortly. An existing offline session can stay on this device without syncing.'
      : 'LibriQ needs internet to sign in and sync your library. An existing offline session can continue on this device; changes stay local until you reconnect.';
    Utils.show(modal);
    sessionHero?.setAttribute('inert', '');
    fallbackState.modalVisible = true;
    fallbackState.dismissAt = 0;
  };
  const clearFallbackTimer = () => {
    if (fallbackState.timer) {
      window.clearTimeout(fallbackState.timer);
      fallbackState.timer = null;
    }
  };
  const shouldShowBlockingOffline = () => {
    if (Navigation.currentPage !== 'session') return false;
    if (typeof navigator === 'undefined') return false;
    if (navigator.onLine !== false) return false;
    if (document.visibilityState && document.visibilityState !== 'visible') return false;
    if (Navigation.getSessionPreference?.() === 'offline') return false;
    if (Navigation.getCurrentSessionMode?.() === 'offline') return false;
    return true;
  };
  const scheduleFallback = (reason = 'network') => {
    fallbackState.lastRequestedAt = Date.now();
    clearFallbackTimer();
    if (!shouldShowBlockingOffline()) {
      hideFallback();
      return;
    }
    fallbackState.timer = window.setTimeout(() => {
      fallbackState.timer = null;
      if (!shouldShowBlockingOffline()) {
        hideFallback();
        return;
      }
      if (Date.now() - fallbackState.lastRequestedAt < offlineStabilityMs) return;
      showFallback();
    }, offlineCheckDelayMs);
  };
  const reconcileFallback = () => {
    if (typeof navigator !== 'undefined' && navigator.onLine !== false) {
      clearFallbackTimer();
      hideFallback();
      renderSessionChoicePage();
      return;
    }
    scheduleFallback('recheck');
  };
  const showAuthError = (message) => {
    const errorEl = document.getElementById('sessionAuthError');
    if (!errorEl) return;
    errorEl.textContent = message;
    errorEl.hidden = false;
  };
  // Point the flagged fields at the form-level error so it is read with them.
  const AUTH_FIELDS = ['sessionEmailInput', 'sessionPasswordInput', 'sessionResetEmailInput'];
  const flagAuthFields = (err, { reset = false } = {}) => {
    const code = String(err?.code || '').toLowerCase();
    const email = document.getElementById(reset ? 'sessionResetEmailInput' : 'sessionEmailInput');
    const password = reset ? null : document.getElementById('sessionPasswordInput');
    const fields = [];
    if (/invalid-email|missing-email|email-already-in-use/.test(code)) fields.push(email);
    else if (/weak-password|missing-password/.test(code)) fields.push(password);
    else if (/wrong-password|invalid-credential|user-not-found|invalid-login/.test(code)) fields.push(email, password);
    showFieldErrors(fields.filter(Boolean).map(input => [input, { describedById: 'sessionAuthError' }]));
  };
  const clearAuthError = () => {
    clearFieldErrors(AUTH_FIELDS.map(id => document.getElementById(id)).filter(Boolean));
    const errorEl = document.getElementById('sessionAuthError');
    if (!errorEl) return;
    errorEl.textContent = '';
    errorEl.hidden = true;
    const statusEl = document.getElementById('sessionAuthStatus');
    if (statusEl) { statusEl.textContent = ''; statusEl.hidden = true; }
  };
  const retryAuth = () => {
    const currentFb = LibriqFirebase.getState();
    if (!currentFb?.available && typeof window !== 'undefined') {
      window.location.reload();
      return;
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      scheduleFallback('retry');
      return;
    }
    renderSessionChoicePage();
  };
  const getCurrentEmail = () => String(document.getElementById('sessionEmailInput')?.value || document.getElementById('sessionResetEmailInput')?.value || '').trim();
  const showResetMode = () => {
    const resetEmail = document.getElementById('sessionResetEmailInput');
    const currentEmail = getCurrentEmail();
    clearAuthError();
    if (resetEmail && currentEmail) resetEmail.value = currentEmail;
    Navigation.setEmailAuthMode?.('reset');
    resetEmail?.focus();
  };
  const showSigninMode = () => {
    Navigation.setEmailAuthMode?.('signin');
    clearAuthError();
    document.getElementById('sessionEmailInput')?.focus();
  };

  if (!firebase.initialized) {
    hideFallback();
  } else if (authUnavailable && !loading) {
    if (!firebase.available) showFallback('service');
    else scheduleFallback('initial');
  } else {
    hideFallback();
  }

  document.getElementById('googleContinueBtn')?.addEventListener('click', () => {
    Navigation.setSessionPreference('google');
    window.LibriqSyncBeta?.maybeAutoEnable?.('account-continue');
    Navigation.goTo('dashboard');
  });

  document.getElementById('googleSignInBtn')?.addEventListener('click', async () => {
    if (inAppBrowser) {
      Utils.toast('Google sign-in may not work inside this app browser.', 'warning');
      return;
    }
    try {
      await LibriqFirebase.signInWithGoogle();
      Navigation.setSessionPreference('google');
      window.LibriqSyncBeta?.maybeAutoEnable?.('google-sign-in');
      Utils.toast('Sync is on. Your books will update across signed-in devices.', 'success');
      Navigation.goTo('dashboard');
    } catch (err) {
      console.warn('[Libriq] Google sign-in failed:', {
        code: err?.code || '',
        message: err?.message || '',
        details: err?.details || null,
      });
      const message = getFriendlyAuthError(err, 'google');
      if (isAuthNetworkError(err)) {
        showFallback();
      } else {
        Utils.toast(message, getAuthToastType(err));
      }
    }
  });

  Utils.$$('.session-auth-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      clearAuthError();
      Navigation.setEmailAuthMode?.(btn.dataset.authMode);
    });
    btn.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const tabs = Utils.$$('.session-auth-tab');
      const next = event.key === 'Home' ? tabs[0] : event.key === 'End' ? tabs[tabs.length - 1] : tabs.find(tab => tab !== btn);
      next?.click();
      next?.focus();
    });
  });

  document.getElementById('forgotPasswordLink')?.addEventListener('click', () => {
    const email = String(document.getElementById('sessionEmailInput')?.value || '').trim();
    if (email && document.getElementById('sessionResetEmailInput')) {
      document.getElementById('sessionResetEmailInput').value = email;
    }
    showResetMode();
  });

  document.getElementById('sessionResetBackBtn')?.addEventListener('click', () => {
    showSigninMode();
  });

  document.getElementById('sessionResetSubmit')?.addEventListener('click', async () => {
    const email = String(document.getElementById('sessionResetEmailInput')?.value || '').trim();
    const submit = document.getElementById('sessionResetSubmit');
    const label = submit?.querySelector('span');
    clearAuthError();
    submit?.setAttribute('disabled', '');
    submit?.setAttribute('aria-busy', 'true');
    if (label) label.textContent = 'Sending reset link…';
    try {
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw Object.assign(new Error('Enter a valid email address.'), { code: 'auth/invalid-email' });
      }
      await LibriqFirebase.sendPasswordResetToEmail(email);
      Utils.toast('Password reset email sent if an account exists for that address.', 'success');
      showSigninMode();
      const statusEl = document.getElementById('sessionAuthStatus');
      if (statusEl) {
        statusEl.textContent = 'Password reset email sent if an account exists for that address. Check your inbox before signing in.';
        statusEl.hidden = false;
      }
    } catch (err) {
      const code = String(err?.code || '').toLowerCase();
      const message = code.includes('invalid-email')
        ? 'Enter a valid email address.'
        : code.includes('too-many-requests')
          ? 'Please wait before trying again.'
          : code.includes('network-request-failed')
            ? 'Check your connection and try again.'
            : 'Something went wrong. Please try again.';
      showAuthError(message);
      flagAuthFields(err, { reset: true });
    } finally {
      submit?.removeAttribute('disabled');
      submit?.removeAttribute('aria-busy');
      if (label) label.textContent = 'Send reset email';
    }
  });

  document.getElementById('emailAuthForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearAuthError();
    const form = event.currentTarget;
    const authTrigger = document.activeElement;
    const mode = form?.getAttribute('data-auth-mode') === 'signup' ? 'signup' : 'signin';
    const email = document.getElementById('sessionEmailInput')?.value || '';
    const password = document.getElementById('sessionPasswordInput')?.value || '';
    const submit = document.getElementById('emailAuthSubmit');
    const label = submit?.querySelector('span');
    submit?.setAttribute('disabled', '');
    form?.setAttribute('aria-busy', 'true');
    if (label) label.textContent = mode === 'signup' ? 'Creating your account…' : 'Signing you in…';
    try {
      if (mode === 'signup') {
        const problem = newPasswordProblem(password);
        if (problem) throw Object.assign(new Error(problem), { code: 'auth/weak-password' });
        await LibriqFirebase.createAccountWithEmail(email, password);
      } else {
        await LibriqFirebase.signInWithEmail(email, password);
      }
      Navigation.setSessionPreference('account');
      window.LibriqSyncBeta?.maybeAutoEnable?.(mode === 'signup' ? 'email-sign-up' : 'email-sign-in');
      Utils.toast('Sync is on. Your books will update across signed-in devices.', 'success');
      Navigation.goTo('dashboard');
    } catch (err) {
      console.warn('[Libriq] Email auth failed:', { code: err?.code || '', message: err?.message || '' });
      const message = getFriendlyAuthError(err, mode);
      if (isAuthNetworkError(err)) {
        submit?.removeAttribute('disabled');
        authTrigger?.focus?.({ preventScroll: true });
        showFallback();
      }
      showAuthError(message);
      if (!isAuthNetworkError(err)) flagAuthFields(err);
    } finally {
      submit?.removeAttribute('disabled');
      form?.removeAttribute('aria-busy');
      if (label) label.textContent = mode === 'signup' ? 'Create account' : 'Sign in with Email';
    }
  });

  document.getElementById('authRetryBtn')?.addEventListener('click', retryAuth);
  document.getElementById('sessionServiceRetryBtn')?.addEventListener('click', retryAuth);
  document.getElementById('fallbackOfflineBtn')?.addEventListener('click', continueOffline);
  document.getElementById('sessionFallbackClose')?.addEventListener('click', hideFallback);
  document.getElementById('sessionFallbackModal')?.addEventListener('dialog:close', () => {
    sessionHero?.removeAttribute('inert');
    fallbackState.modalVisible = false;
    fallbackState.dismissAt = Date.now();
  });

  document.getElementById('switchAccountBtn')?.addEventListener('click', async () => {
    try {
      await LibriqFirebase.signOut();
      Navigation.setSessionPreference('prompt');
      Navigation.clearAccountResume?.();
    } catch (err) {
      const code = String(err?.code || err?.message || '');
      const cancelled = code.includes('popup-closed-by-user') || code.includes('popup-blocked');
      Utils.toast(cancelled ? 'Sign-out was cancelled.' : 'Could not switch accounts right now.', 'error');
    }
  });

  if (document.getElementById('emailAuthForm')) Navigation.setEmailAuthMode?.(initialAuthMode({ inAppBrowser, storage: localStorage }));

  // Interactive Live Book Search Preview handlers
  const demoInput = document.getElementById('sessionDemoInput');
  const demoSpinner = document.getElementById('sessionDemoSpinner');
  const demoResults = document.getElementById('sessionDemoResults');
  let demoDebounceTimer = null;

  let demoBooks = [];
  const triggerSignupForBook = (book) => {
    const title = book?.title || '';
    savePendingBook(book);
    Navigation.setEmailAuthMode?.('signup');
    const form = document.getElementById('emailAuthForm');
    if (form) form.scrollIntoView({ behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
    document.getElementById('sessionEmailInput')?.focus();
    Utils.toast?.(`Create an account and "${title}" will be in your library.`, 'info');
  };

  const executeDemoSearch = async (query) => {
    const q = (query || '').trim();
    if (!q || q.length < MIN_SEARCH_LENGTH) {
      if (demoResults) {
        demoResults.innerHTML = '';
        demoResults.hidden = true;
      }
      return;
    }
    if (demoSpinner) demoSpinner.hidden = false;
    try {
      const results = await BookAPI.searchBooks(q);
      if (demoSpinner) demoSpinner.hidden = true;
      if (!demoResults) return;
      if (!results || results.length === 0) {
        demoResults.innerHTML = `<div class="session-demo-empty">No books found for "${Utils.sanitize(q)}". Try another title!</div>`;
        demoResults.hidden = false;
        return;
      }
      const topBooks = results.slice(0, 3);
      demoBooks = topBooks;
      demoResults.innerHTML = topBooks.map((b, index) => {
        const cover = b.coverUrl
          ? `<img ${coverImgAttrs(b.coverUrl, 'cover-sm', Utils.sanitize)} loading="lazy" class="session-demo-book-cover" alt="" data-fallback-src="./assets/icons/icon-192.png" />`
          : `<div class="session-demo-book-cover-placeholder"><i class="ph ph-book" aria-hidden="true"></i></div>`;
        return `
          <div class="session-demo-book-card" data-title="${Utils.sanitize(b.title)}" data-index="${index}">
            ${cover}
            <div class="session-demo-book-info">
              <div class="session-demo-book-title">${Utils.sanitize(b.title)}</div>
              <div class="session-demo-book-author">${Utils.sanitize(b.author || 'Unknown')}</div>
              <div class="session-demo-book-meta">${b.year ? Utils.sanitize(b.year) : ''}${b.pageCount ? ` • ${Utils.sanitize(b.pageCount)} pages` : ''}</div>
            </div>
            <button type="button" class="btn btn-sm btn-primary session-demo-save-btn" data-title="${Utils.sanitize(b.title)}" data-index="${index}">
              <i class="ph ph-plus" aria-hidden="true"></i> Save
            </button>
          </div>
        `;
      }).join('');
      demoResults.hidden = false;

      demoResults.querySelectorAll('.session-demo-save-btn, .session-demo-book-card').forEach(el => {
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          const book = demoBooks[Number(el.dataset.index)];
          if (book?.title) triggerSignupForBook(book);
        });
      });
    } catch (err) {
      if (demoSpinner) demoSpinner.hidden = true;
      if (demoResults) {
        demoResults.innerHTML = '<div class="session-demo-empty" role="alert">Book search is unavailable right now. Try another search in a moment.</div>';
        demoResults.hidden = false;
      }
      console.warn('[Libriq] Demo search error:', err);
    }
  };

  demoInput?.addEventListener('input', (e) => {
    if (demoDebounceTimer) clearTimeout(demoDebounceTimer);
    const val = e.target.value;
    demoDebounceTimer = setTimeout(() => executeDemoSearch(val), 350);
  });

  Utils.$$('.session-demo-tag').forEach(btn => {
    btn.addEventListener('click', () => {
      const q = btn.dataset.query;
      if (demoInput) demoInput.value = q;
      executeDemoSearch(q);
    });
  });

  fallbackState.reconcile = reconcileFallback;
  fallbackState.schedule = scheduleFallback;
  fallbackState.close = () => { clearFallbackTimer(); hideFallback(); };
  if (!fallbackState.listenersAttached) {
    window.addEventListener('online', () => fallbackState.reconcile());
    window.addEventListener('offline', () => fallbackState.schedule('offline-event'));
    document.addEventListener('visibilitychange', () => fallbackState.reconcile());
    window.addEventListener('libriq:page-changed', event => {
      if (event.detail?.page !== 'session') fallbackState.close();
    });
    fallbackState.listenersAttached = true;
  }
}

function isAuthNetworkError(err) {
  const code = String(err?.code || err?.message || '').toLowerCase();
  return code.includes('network-request-failed') || code.includes('unavailable') || code.includes('failed to fetch') || (typeof navigator !== 'undefined' && navigator.onLine === false);
}

function getAuthToastType(err) {
  const code = String(err?.code || err?.message || '').toLowerCase();
  if (code.includes('popup-closed-by-user')) return 'info';
  if (code.includes('popup-blocked') || code.includes('disallowed')) return 'warning';
  return 'error';
}

function getFriendlyAuthError(err, mode = 'signin') {
  const code = String(err?.code || err?.message || '').toLowerCase();
  if (code.includes('invalid-email')) return 'Enter a valid email address.';
  if (code.includes('wrong-password') || code.includes('invalid-credential') || code.includes('user-not-found')) return 'The email or password does not look right.';
  if (code.includes('weak-password')) return `Choose a stronger password with at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (code.includes('email-already-in-use') || code.includes('account-exists-with-different-credential')) return 'An account already exists for that email. Try signing in instead.';
  if (code.includes('missing-password')) return 'Enter your password to continue.';
  if (code.includes('network-request-failed') || code.includes('unavailable') || code.includes('failed to fetch')) return 'LibriQ cannot reach account services right now.';
  if (code.includes('unauthorized-domain')) return 'This domain is not authorized for account sign-in yet.';
  if (code.includes('invalid-api-key')) return 'Account sign-in is not configured correctly for this build.';
  if (code.includes('configuration-not-found')) return 'Account setup is incomplete for this build.';
  if (code.includes('popup-blocked')) return 'Your browser blocked the sign-in popup.';
  if (code.includes('popup-closed-by-user')) return 'Sign-in was cancelled.';
  if (code.includes('disallowed-useragent')) return 'Google sign-in may not work inside this app browser. Open LibriQ in Chrome or Safari.';
  if (mode === 'signup') return 'Could not create the account right now.';
  return 'Could not sign in right now.';
}

export function getDisplayNameForAccount(user) {
  return resolveAccountDisplayName(Storage.getProfile(), user);
}

export function _friendlyAuthMessage(err) {
  const code = String(err?.code || '').trim();
  const map = {
    'auth/too-many-requests': 'Please wait before trying again.',
    'auth/requires-recent-login': 'For security, please sign in again and retry.',
    'auth/invalid-email': 'Enter a valid email address.',
    'auth/user-disabled': 'This account is disabled.',
    'auth/network-request-failed': 'Check your connection and try again.',
  };
  try { console.warn('[LibriQ] Auth action failed:', code || 'unknown'); } catch {}
  return map[code] || 'Something went wrong. Please try again.';
}
