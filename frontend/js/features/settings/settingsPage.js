export function createSettingsPage({ render }) {
  if (typeof render !== 'function') throw new TypeError('createSettingsPage requires a render function.');
  return function renderSettingsFeature() {
    render();
  };
}
