// Policy pages have no app shell; follow the system theme.
const light = globalThis.matchMedia?.('(prefers-color-scheme: light)').matches;
document.documentElement.dataset.theme = light ? 'light' : 'dark';
