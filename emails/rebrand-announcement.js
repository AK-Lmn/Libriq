// emails/rebrand-announcement.js
import { renderLibriqEmail, LibriqEmailLayout } from './template.js';

export const rebrandEmailProps = {
  editionBadge: 'LibriQ is Back • Live Rebrand',
  headline: 'LibriQ is officially back live.',
  pullQuote:
    'A few weeks ago, I unpublished LibriQ completely because I felt like it was nowhere near where it needed to be. Today, we are live again with a complete rebrand. Thank you so much to all the users who registered early and believed in this project—I hope to see many more readers joining us.',
  introText:
    'We took that time down to rebuild from the foundation up. Here is what is new in the rebrand:',
  features: [
    {
      title: '1. The 3D Cedar Bookshelf',
      description:
        'Your books now stand on realistic virtual wooden shelves. Pan, rotate, and interact with your personal library like a physical bookcase, or tap any spine to open its notes and quotes. Press "V" on desktop or use the switcher in your library to explore it.',
    },
    {
      title: '2. Automatic Book Descriptions & Metadata',
      description:
        'No more missing summaries or manual typing. LibriQ now automatically enriches books with blurbs and details via Wikipedia and Open Library in the background.',
    },
    {
      title: '3. Full Offline Reliability & Instant Speed',
      description:
        'All icons and library assets are now self-hosted locally on your device. You can track pages and add quotes completely offline—everything syncs smoothly to the cloud whenever you reconnect.',
    },
  ],
  ctaTitle: 'LibriQ is now live.',
  ctaSubtitle:
    'Your shelves, reading streaks, and private notes are waiting for you.',
  ctaButtonText: 'Open LibriQ Now →',
  ctaHref: 'https://libriq.app',
};

export function RebrandAnnouncementEmail() {
  return LibriqEmailLayout(rebrandEmailProps);
}

export async function renderAnnouncementEmail() {
  return renderLibriqEmail(rebrandEmailProps);
}
