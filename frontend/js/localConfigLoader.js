// Loads the git-ignored js/config.local.js on localhost only. Kept as a file
// (not an inline <script>) so the CSP can forbid inline scripts.
if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
  const localConfig = document.createElement('script');
  localConfig.async = false;
  localConfig.src = 'js/config.local.js';
  document.head.appendChild(localConfig);
}
