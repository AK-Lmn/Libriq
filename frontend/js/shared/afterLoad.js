// Runs work that the first screen doesn't need (e.g. App Check's reCAPTCHA
// download) once the page has loaded and the browser is idle, or within 3 s.
export function runWhenIdleAfterLoad(task, env = globalThis) {
  const doc = env.document;
  const win = env.window || env;
  const later = env.setTimeout || globalThis.setTimeout;
  const whenIdle = () => {
    if (typeof win.requestIdleCallback === 'function') win.requestIdleCallback(() => task(), { timeout: 3000 });
    else later(() => task(), 1);
  };
  if (!doc || doc.readyState === 'complete' || typeof win.addEventListener !== 'function') whenIdle();
  else win.addEventListener('load', whenIdle, { once: true });
}
