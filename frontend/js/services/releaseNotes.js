// The release these notes describe. Bump it only when the notes change, so
// patch releases don't reopen What's New for everyone.
export const RELEASE_NOTES_VERSION = '4.8.0';

export function getReleaseNotes() {
  return {
    title: `What's New in LibriQ v${RELEASE_NOTES_VERSION}`,
    subtitle: '3D Digital Bookshelf view, refreshed Ribbon Q identity, and UI polish.',
    sections: [
      ['3D Digital Bookshelf View', 'Experience your collection like a physical bookcase. Switch seamlessly between the classic cover grid and 3D spine shelves with realistic depth and paper thickness.'],
      ['Refreshed Brand Identity', 'The signature Ribbon Q logo mark has been precision-upgraded in Deep Indigo & Slate across all navigation headers, favicons, and PWA app icons.'],
      ['Spine Hover Previews', 'Hovering or focusing on any spine brings it forward with an instant floating card showing book cover, author, and reading progress.'],
      ['Dark & Light Theme Harmony', 'Refined glass tokens and shelf planks adapt naturally between deep OLED dark mode and clean editorial paper light mode.'],
    ],
    note: 'All shelf filters, sorting options, and book details work seamlessly with the new Bookshelf view.',
  };
}

function parseVersion(value) {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(String(value || ''));
  return match ? match.slice(1).map(Number) : null;
}

// True when the stored version is the notes' version or any later one.
export function hasSeenRelease(seen, notesVersion = RELEASE_NOTES_VERSION) {
  const a = parseVersion(seen);
  const b = parseVersion(notesVersion);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return true;
}
