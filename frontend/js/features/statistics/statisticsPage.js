export function createStatisticsPage({ render }) {
  if (typeof render !== 'function') throw new TypeError('createStatisticsPage requires a render function.');
  return function renderStatisticsPage() {
    render();
  };
}
