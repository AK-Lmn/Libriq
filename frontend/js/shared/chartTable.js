import { escapeHtml } from './escapeHtml.js';

// The bar charts are drawn with divs and show values only in hover
// tooltips. This table carries the same numbers for screen readers; the
// visual chart next to it is aria-hidden.
export function chartDataTable({ caption, valueHeader, months, values, format = value => String(value) }) {
  const rows = months.map((month, i) =>
    `<tr><th scope="row">${escapeHtml(month)}</th><td>${escapeHtml(format(values[i] || 0))}</td></tr>`).join('');
  return `<table class="sr-only"><caption>${escapeHtml(caption)}</caption>` +
    `<thead><tr><th scope="col">Month</th><th scope="col">${escapeHtml(valueHeader)}</th></tr></thead>` +
    `<tbody>${rows}</tbody></table>`;
}
