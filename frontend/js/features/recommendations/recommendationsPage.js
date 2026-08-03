export function createRecommendationsPage({ render }) {
  if (typeof render !== 'function') throw new TypeError('createRecommendationsPage requires a render function.');
  return function renderRecommendationsFeature() {
    render();
  };
}
