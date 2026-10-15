// emails/rebrand-announcement.js
import React from 'react';
import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Heading,
  Text,
  Link,
  Button,
  Hr,
  render,
} from '@react-email/components';

export function RebrandAnnouncementEmail() {
  const e = React.createElement;

  return e(
    Html,
    { lang: 'en' },
    e(Head, null),
    e(
      Body,
      {
        style: {
          backgroundColor: '#090d16',
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
          margin: 0,
          padding: '32px 0',
        },
      },
      e(
        Container,
        {
          style: {
            maxWidth: '560px',
            margin: '0 auto',
            backgroundColor: '#0f172a',
            border: '1px solid #1e293b',
            borderRadius: '12px',
            padding: '36px 32px',
            color: '#e2e8f0',
          },
        },
        // Header
        e(
          Section,
          { style: { marginBottom: '24px' } },
          e(
            Text,
            {
              style: {
                fontSize: '22px',
                fontWeight: '700',
                color: '#818cf8',
                letterSpacing: '-0.5px',
                margin: '0 0 4px 0',
              },
            },
            'LibriQ'
          ),
          e(
            Text,
            {
              style: {
                fontSize: '12px',
                fontWeight: '500',
                color: '#64748b',
                textTransform: 'uppercase',
                letterSpacing: '1px',
                margin: 0,
              },
            },
            'Product Announcement'
          )
        ),

        // Title
        e(
          Heading,
          {
            as: 'h1',
            style: {
              fontSize: '22px',
              fontWeight: '700',
              color: '#ffffff',
              lineHeight: '1.3',
              margin: '0 0 16px 0',
            },
          },
          'LibriQ is back: the rebrand'
        ),

        // Intro
        e(
          Text,
          {
            style: {
              fontSize: '14px',
              lineHeight: '22px',
              color: '#94a3b8',
              margin: '0 0 16px 0',
            },
          },
          'We built LibriQ with a simple promise: a quiet, private sanctuary for your reading life, free from algorithmic noise, social pressure, and advertising clutter.'
        ),
        e(
          Text,
          {
            style: {
              fontSize: '14px',
              lineHeight: '22px',
              color: '#94a3b8',
              margin: '0 0 24px 0',
            },
          },
          'Over the past few weeks, we have completely overhauled the platform. Today, we are introducing LibriQ v4.8 with major design and architectural enhancements:'
        ),

        // Feature 1
        e(
          Section,
          {
            style: {
              backgroundColor: '#131d35',
              border: '1px solid #1e2c4f',
              borderRadius: '8px',
              padding: '16px 18px',
              marginBottom: '12px',
            },
          },
          e(
            Text,
            {
              style: {
                fontSize: '14px',
                fontWeight: '600',
                color: '#cbd5e1',
                margin: '0 0 4px 0',
              },
            },
            'The 3D Digital Bookshelf'
          ),
          e(
            Text,
            {
              style: {
                fontSize: '13px',
                lineHeight: '20px',
                color: '#94a3b8',
                margin: 0,
              },
            },
            'View your collection on virtual cedar shelves with ambient lighting, distinctive spine bindings, and interactive inspection. Tap the Bookshelf switcher in your library (or press "V" on desktop) to explore it.'
          )
        ),

        // Feature 2
        e(
          Section,
          {
            style: {
              backgroundColor: '#131d35',
              border: '1px solid #1e2c4f',
              borderRadius: '8px',
              padding: '16px 18px',
              marginBottom: '12px',
            },
          },
          e(
            Text,
            {
              style: {
                fontSize: '14px',
                fontWeight: '600',
                color: '#cbd5e1',
                margin: '0 0 4px 0',
              },
            },
            'Deep Indigo Visual Identity'
          ),
          e(
            Text,
            {
              style: {
                fontSize: '13px',
                lineHeight: '20px',
                color: '#94a3b8',
                margin: 0,
              },
            },
            'A refined, high-contrast dark interface engineered specifically for comfortable night reading and distraction-free tracking.'
          )
        ),

        // Feature 3
        e(
          Section,
          {
            style: {
              backgroundColor: '#131d35',
              border: '1px solid #1e2c4f',
              borderRadius: '8px',
              padding: '16px 18px',
              marginBottom: '12px',
            },
          },
          e(
            Text,
            {
              style: {
                fontSize: '14px',
                fontWeight: '600',
                color: '#cbd5e1',
                margin: '0 0 4px 0',
              },
            },
            'Local-First Offline Speed'
          ),
          e(
            Text,
            {
              style: {
                fontSize: '13px',
                lineHeight: '20px',
                color: '#94a3b8',
                margin: 0,
              },
            },
            'Upgraded IndexedDB caching that enables instant page loads, offline progress updates, and automatic synchronization when reconnected.'
          )
        ),

        // Feature 4
        e(
          Section,
          {
            style: {
              backgroundColor: '#131d35',
              border: '1px solid #1e2c4f',
              borderRadius: '8px',
              padding: '16px 18px',
              marginBottom: '20px',
            },
          },
          e(
            Text,
            {
              style: {
                fontSize: '14px',
                fontWeight: '600',
                color: '#cbd5e1',
                margin: '0 0 4px 0',
              },
            },
            'Background Metadata Enrichment & Help Center'
          ),
          e(
            Text,
            {
              style: {
                fontSize: '13px',
                lineHeight: '20px',
                color: '#94a3b8',
                margin: 0,
              },
            },
            'Automated synopsis and cover retrieval via Open Library, Google Books, and Wikipedia, plus an instant in-guide search center with keyboard shortcut navigation.'
          )
        ),

        // Library intact
        e(
          Text,
          {
            style: {
              fontSize: '14px',
              lineHeight: '22px',
              color: '#cbd5e1',
              margin: '0 0 24px 0',
            },
          },
          'Your library data, private notes, and reading history remain intact and ready for you.'
        ),

        // Primary Button
        e(
          Section,
          { style: { textAlign: 'center', margin: '28px 0' } },
          e(
            Button,
            {
              href: 'https://libriq.app',
              style: {
                backgroundColor: '#4f46e5',
                color: '#ffffff',
                padding: '12px 28px',
                borderRadius: '8px',
                fontWeight: '600',
                fontSize: '14px',
                textDecoration: 'none',
                display: 'inline-block',
              },
            },
            'Open Your Library'
          )
        ),

        // Sign off
        e(
          Text,
          {
            style: {
              fontSize: '13px',
              color: '#94a3b8',
              lineHeight: '20px',
              margin: '0 0 24px 0',
            },
          },
          'Best regards,',
          e('br', null),
          'The LibriQ Team'
        ),

        // Divider
        e(Hr, { style: { borderColor: '#1e293b', margin: '24px 0' } }),

        // Footer
        e(
          Text,
          {
            style: {
              fontSize: '11px',
              lineHeight: '18px',
              color: '#64748b',
              margin: '0 0 8px 0',
            },
          },
          'You are receiving this update because you registered an account on LibriQ (',
          e(
            Link,
            {
              href: 'https://libriq.app',
              style: { color: '#818cf8', textDecoration: 'none' },
            },
            'https://libriq.app'
          ),
          ').'
        ),
        e(
          Text,
          {
            style: {
              fontSize: '11px',
              lineHeight: '18px',
              color: '#64748b',
              margin: '0 0 8px 0',
            },
          },
          'LibriQ is private by design: we do not sell data, track browsing across the web, or display advertisements.'
        ),
        e(
          Text,
          {
            style: {
              fontSize: '11px',
              lineHeight: '18px',
              color: '#64748b',
              margin: 0,
            },
          },
          'To unsubscribe from future product announcements or delete your account, reply to this email or visit Settings in the app.'
        )
      )
    )
  );
}

export async function renderAnnouncementEmail() {
  const html = await render(React.createElement(RebrandAnnouncementEmail));
  return html;
}
