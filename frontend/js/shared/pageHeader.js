// The one page header every app page opens with: a title, an optional line
// under it, and an optional aside (a button or a small summary) on the right.
// Callers pass HTML they have already escaped.
export function pageHeader({ title, subtitle = '', aside = '', afterTitle = '', className = '', headingClass = '' }) {
  const headerClass = ['page-header', className].filter(Boolean).join(' ');
  const headingClasses = ['page-heading', headingClass].filter(Boolean).join(' ');
  const sub = subtitle ? `<p class="page-subtitle">${subtitle}</p>` : '';
  return `<header class="${headerClass}"><div class="${headingClasses}"><h1 class="page-title">${title}</h1>${afterTitle}${sub}</div>${aside}</header>`;
}
