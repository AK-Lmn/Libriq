// emails/rebrand-announcement.js
import { renderLibriqEmail, LibriqEmailLayout } from './template.js';

export const rebrandEmailProps = {
  editionBadge: 'LibriQ v4.8 Update',
  headline: 'A quiet, private place for your reading.',
  pullQuote:
    'We started LibriQ because we wanted a clean way to track books without ads, social media feeds, or pressure. Just your shelves, your notes, and your reading pace.',
  introText:
    'Over the last couple of weeks, we made some big improvements to the app. Here is a quick look at what is new:',
  features: [
    {
      title: '1. The 3D Bookshelf',
      description:
        'You can now see your books standing on virtual wooden shelves. Rotate and browse through your collection like a physical bookcase, or tap a book to inspect its details. Press "V" on desktop or use the switcher icon in your library to try it.',
    },
    {
      title: '2. A Darker, Cleaner Look',
      description:
        'We refreshed the entire app with a deep indigo dark mode. It has clear contrast that stays comfortable on your eyes during late-night reading sessions.',
    },
    {
      title: '3. Works Completely Offline',
      description:
        'Your library now loads straight from your device. You can log pages or add notes on the train or without Wi-Fi, and your progress syncs automatically when you are back online.',
    },
    {
      title: '4. Faster Book Info & Better Help',
      description:
        'Book summaries and cover art now load faster using Wikipedia, Open Library, and Google Books. We also added instant search in the Help Center so you can look up keyboard shortcuts and tips anytime.',
    },
  ],
  ctaTitle: 'Your books are waiting.',
  ctaSubtitle:
    'Your shelves, reading logs, and private notes are right where you left them.',
  ctaButtonText: 'Open LibriQ →',
  ctaHref: 'https://libriq.app',
};

export function RebrandAnnouncementEmail() {
  return LibriqEmailLayout(rebrandEmailProps);
}

export async function renderAnnouncementEmail() {
  return renderLibriqEmail(rebrandEmailProps);
}
