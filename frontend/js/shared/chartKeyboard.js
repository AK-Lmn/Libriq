// Arrow-key navigation for the monthly bar charts. Each chart is one tab
// stop (roving tabindex); Left/Right move between bars and Home/End jump to
// the first or last. Focusing a bar shows its value tooltip (CSS).

const BAR = '.monthly-chart [role="img"]';

export function moveChartFocus(current, key) {
  const chart = current.closest('.monthly-chart');
  if (!chart) return null;
  const bars = [...chart.querySelectorAll('[role="img"]')];
  const index = bars.indexOf(current);
  const next = {
    ArrowRight: bars[Math.min(index + 1, bars.length - 1)],
    ArrowDown: bars[Math.min(index + 1, bars.length - 1)],
    ArrowLeft: bars[Math.max(index - 1, 0)],
    ArrowUp: bars[Math.max(index - 1, 0)],
    Home: bars[0],
    End: bars[bars.length - 1],
  }[key];
  if (!next) return null;
  bars.forEach(bar => bar.setAttribute('tabindex', bar === next ? '0' : '-1'));
  next.focus();
  return next;
}

let installed = false;

export function installChartKeyboard(doc = globalThis.document) {
  if (installed || typeof doc?.addEventListener !== 'function') return;
  installed = true;
  doc.addEventListener('keydown', event => {
    const bar = event.target?.closest?.(BAR);
    if (bar && moveChartFocus(bar, event.key)) event.preventDefault();
  });
}
