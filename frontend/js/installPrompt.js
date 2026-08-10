const DISMISS_KEY = 'libriq_install_prompt_dismissed';

let deferredPrompt = null;
let initialized = false;

function getElements() {
  return {
    prompt: document.getElementById('installPrompt'),
    install: document.getElementById('installPromptAction'),
    dismiss: document.getElementById('installPromptDismiss'),
  };
}

function hidePrompt() {
  const { prompt } = getElements();
  if (prompt) prompt.hidden = true;
}

function showPrompt() {
  const { prompt } = getElements();
  if (!prompt || localStorage.getItem(DISMISS_KEY) === '1') return;
  prompt.hidden = false;
}

export function initInstallPrompt() {
  if (initialized || typeof window === 'undefined' || typeof document === 'undefined') return;
  initialized = true;

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredPrompt = event;
    showPrompt();
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    localStorage.removeItem(DISMISS_KEY);
    hidePrompt();
  });

  const { install, dismiss } = getElements();
  install?.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    deferredPrompt = null;
    hidePrompt();
  });
  dismiss?.addEventListener('click', () => {
    localStorage.setItem(DISMISS_KEY, '1');
    hidePrompt();
  });
}
