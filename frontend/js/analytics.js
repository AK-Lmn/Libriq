// Vercel Web Analytics: cookieless page counts, no personal data, no banner needed.
// The script only exists on Vercel deployments, so local and test hosts skip it.
const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])$|\.(localhost|test)$/;

export function shouldLoadAnalytics(hostname) {
  return Boolean(hostname) && !LOCAL_HOST.test(hostname);
}

if (typeof document !== 'undefined' && shouldLoadAnalytics(location.hostname)) {
  window.va = window.va || function va(...args) { (window.vaq = window.vaq || []).push(args); };
  const script = document.createElement('script');
  script.defer = true;
  script.src = '/_vercel/insights/script.js';
  document.head.appendChild(script);
}
