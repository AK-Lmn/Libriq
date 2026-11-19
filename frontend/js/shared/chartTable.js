import { escapeHtml } from './escapeHtml.js';

// The bar charts are drawn with divs. This table carries the same numbers in
// a structure screen readers navigate well. The chart itself is also
// keyboard-readable: one tab stop, arrow keys move between bars (see
// shared/chartKeyboard.js), and each bar shows its value on focus.
export function chartDataTable({ caption, valueHeader, months, values, format = value => String(value) }) {
  const rows = months.map((month, i) =>
    `<tr><th scope="row">${escapeHtml(month)}</th><td>${escapeHtml(format(values[i] || 0))}</td></tr>`).join('');
  return `<table class="sr-only"><caption>${escapeHtml(caption)}</caption>` +
    `<thead><tr><th scope="col">Month</th><th scope="col">${escapeHtml(valueHeader)}</th></tr></thead>` +
    `<tbody>${rows}</tbody></table>`;
}

/** Attributes for the chart container: a labelled group, one tab stop. */
export function chartGroupAttrs(caption) {
  return `role="group" aria-label="${escapeHtml(caption)}. Use the arrow keys to read each month."`;
}

/** Attributes for one bar. Only the bar with isStop=true is in the tab order. */
export function chartBarAttrs(label, isStop) {
  return `role="img" aria-label="${escapeHtml(label)}" tabindex="${isStop ? 0 : -1}"`;
}
