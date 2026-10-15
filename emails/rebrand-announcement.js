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
  Img,
  render,
} from '@react-email/components';

export function RebrandAnnouncementEmail() {
  const e = React.createElement;

  return e(
    Html,
    { lang: 'en' },
    e(
      Head,
      null,
      e('style', null, `
        @media only screen and (max-width: 600px) {
          .email-container { padding: 24px 18px !important; }
          .headline { font-size: 22px !important; }
          .shelf-spine { height: 48px !important; }
        }
      `)
    ),
    e(
      Body,
      {
        style: {
          backgroundColor: '#07080c',
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
          margin: 0,
          padding: '40px 0',
          WebkitFontSmoothing: 'antialiased',
        },
      },
      e(
        Container,
        {
          className: 'email-container',
          style: {
            maxWidth: '560px',
            margin: '0 auto',
            backgroundColor: '#0d1017',
            border: '1px solid #1c2333',
            borderRadius: '12px',
            padding: '40px 36px',
            color: '#e2e8f0',
            boxShadow: '0 20px 40px rgba(0,0,0,0.6)',
          },
        },

        // --- MASTHEAD ---
        e(
          Section,
          { style: { textAlign: 'center', marginBottom: '24px' } },
          e(Img, {
            src: 'https://www.libriq.app/assets/icons/icon-192.png',
            width: '42',
            height: '42',
            alt: 'LibriQ',
            style: {
              margin: '0 auto 10px auto',
              borderRadius: '9px',
              border: '1px solid #2d3748',
              display: 'block',
            },
          }),
          e(
            Text,
            {
              style: {
                fontSize: '15px',
                fontWeight: '700',
                letterSpacing: '4px',
                color: '#f8fafc',
                textTransform: 'uppercase',
                margin: '0 0 4px 0',
              },
            },
            'L I B R I Q'
          ),
          e(
            Text,
            {
              style: {
                fontSize: '11px',
                fontWeight: '500',
                letterSpacing: '1.5px',
                color: '#d4a373',
                textTransform: 'uppercase',
                margin: 0,
              },
            },
            'LibriQ v4.8 Update'
          )
        ),

        // Hairline Divider
        e(
          Section,
          { style: { textAlign: 'center', margin: '0 0 28px 0' } },
          e('div', {
            style: {
              borderTop: '1px solid #1c2333',
              height: '1px',
              width: '100%',
            },
          })
        ),

        // --- HEADLINE ---
        e(
          Heading,
          {
            as: 'h1',
            className: 'headline',
            style: {
              fontFamily: 'Georgia, Cambria, serif',
              fontSize: '26px',
              fontWeight: '400',
              color: '#ffffff',
              lineHeight: '1.3',
              letterSpacing: '-0.3px',
              margin: '0 0 18px 0',
              textAlign: 'center',
            },
          },
          'A quiet, private place for your reading.'
        ),

        // --- PULL QUOTE MANIFESTO ---
        e(
          Section,
          {
            style: {
              backgroundColor: '#121622',
              borderLeft: '3px solid #d4a373',
              borderRadius: '0 8px 8px 0',
              padding: '14px 18px',
              margin: '0 0 24px 0',
            },
          },
          e(
            Text,
            {
              style: {
                fontSize: '14px',
                lineHeight: '22px',
                color: '#cbd5e1',
                margin: 0,
              },
            },
            'We started LibriQ because we wanted a clean way to track books without ads, social media feeds, or pressure. Just your shelves, your notes, and your reading pace.'
          )
        ),

        // --- INTRO COPY ---
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
          'Over the last couple of weeks, we made some big improvements to the app. Here is a quick look at what is new:'
        ),

        // --- 3D BOOKSHELF MINIATURE ---
        e(
          Section,
          {
            style: {
              backgroundColor: '#090b10',
              border: '1px solid #1a202c',
              borderRadius: '8px',
              padding: '20px 16px 14px 16px',
              margin: '0 0 32px 0',
              textAlign: 'center',
            },
          },
          // Spines table simulation
          e(
            'table',
            {
              role: 'presentation',
              border: '0',
              cellPadding: '0',
              cellSpacing: '0',
              style: { margin: '0 auto', borderCollapse: 'collapse' },
            },
            e(
              'tr',
              null,
              e(
                'td',
                {
                  valign: 'bottom',
                  style: { padding: '0 3px' },
                },
                e('div', {
                  className: 'shelf-spine',
                  style: {
                    width: '20px',
                    height: '62px',
                    backgroundColor: '#831843',
                    borderLeft: '2px solid #be185d',
                    borderRadius: '2px 2px 0 0',
                  },
                })
              ),
              e(
                'td',
                {
                  valign: 'bottom',
                  style: { padding: '0 3px' },
                },
                e('div', {
                  className: 'shelf-spine',
                  style: {
                    width: '24px',
                    height: '74px',
                    backgroundColor: '#1e3a8a',
                    borderLeft: '2px solid #3b82f6',
                    borderRadius: '2px 2px 0 0',
                  },
                })
              ),
              e(
                'td',
                {
                  valign: 'bottom',
                  style: { padding: '0 3px' },
                },
                e('div', {
                  className: 'shelf-spine',
                  style: {
                    width: '28px',
                    height: '80px',
                    backgroundColor: '#14532d',
                    borderLeft: '2px solid #22c55e',
                    borderRadius: '2px 2px 0 0',
                  },
                })
              ),
              e(
                'td',
                {
                  valign: 'bottom',
                  style: { padding: '0 3px' },
                },
                e('div', {
                  className: 'shelf-spine',
                  style: {
                    width: '22px',
                    height: '68px',
                    backgroundColor: '#78350f',
                    borderLeft: '2px solid #d97706',
                    borderRadius: '2px 2px 0 0',
                  },
                })
              ),
              e(
                'td',
                {
                  valign: 'bottom',
                  style: { padding: '0 3px' },
                },
                e('div', {
                  className: 'shelf-spine',
                  style: {
                    width: '26px',
                    height: '76px',
                    backgroundColor: '#4c1d95',
                    borderLeft: '2px solid #8b5cf6',
                    borderRadius: '2px 2px 0 0',
                  },
                })
              ),
              e(
                'td',
                {
                  valign: 'bottom',
                  style: { padding: '0 3px' },
                },
                e('div', {
                  className: 'shelf-spine',
                  style: {
                    width: '22px',
                    height: '64px',
                    backgroundColor: '#0f172a',
                    borderLeft: '2px solid #64748b',
                    borderRadius: '2px 2px 0 0',
                  },
                })
              )
            )
          ),
          // Cedar Wood Shelf Plinth
          e('div', {
            style: {
              height: '7px',
              backgroundColor: '#573318',
              borderTop: '2px solid #854d0e',
              borderBottom: '2px solid #271406',
              borderRadius: '2px',
              margin: '0 auto 10px auto',
              maxWidth: '220px',
            },
          }),
          e(
            Text,
            {
              style: {
                fontSize: '11px',
                letterSpacing: '1px',
                textTransform: 'uppercase',
                color: '#d4a373',
                fontWeight: '600',
                margin: 0,
              },
            },
            'The 3D Bookshelf View'
          )
        ),

        // --- FEATURE LIST ---
        e(
          Text,
          {
            style: {
              fontSize: '11px',
              fontWeight: '700',
              letterSpacing: '1.5px',
              textTransform: 'uppercase',
              color: '#d4a373',
              margin: '0 0 16px 0',
            },
          },
          'What is new in v4.8'
        ),

        // Feature 1
        e(
          Section,
          { style: { marginBottom: '20px' } },
          e(
            Text,
            {
              style: {
                fontFamily: 'Georgia, serif',
                fontSize: '16px',
                fontWeight: '700',
                color: '#f8fafc',
                margin: '0 0 4px 0',
              },
            },
            '1. The 3D Bookshelf'
          ),
          e(
            Text,
            {
              style: {
                fontSize: '13px',
                lineHeight: '21px',
                color: '#94a3b8',
                margin: 0,
              },
            },
            'You can now see your books standing on virtual wooden shelves. Rotate and browse through your collection like a physical bookcase, or tap a book to inspect its details. Press "V" on desktop or use the switcher icon in your library to try it.'
          )
        ),

        e(Hr, { style: { borderColor: '#1c2333', margin: '16px 0' } }),

        // Feature 2
        e(
          Section,
          { style: { marginBottom: '20px' } },
          e(
            Text,
            {
              style: {
                fontFamily: 'Georgia, serif',
                fontSize: '16px',
                fontWeight: '700',
                color: '#f8fafc',
                margin: '0 0 4px 0',
              },
            },
            '2. A Darker, Cleaner Look'
          ),
          e(
            Text,
            {
              style: {
                fontSize: '13px',
                lineHeight: '21px',
                color: '#94a3b8',
                margin: 0,
              },
            },
            'We refreshed the entire app with a deep indigo dark mode. It has clear contrast that stays comfortable on your eyes during late-night reading sessions.'
          )
        ),

        e(Hr, { style: { borderColor: '#1c2333', margin: '16px 0' } }),

        // Feature 3
        e(
          Section,
          { style: { marginBottom: '20px' } },
          e(
            Text,
            {
              style: {
                fontFamily: 'Georgia, serif',
                fontSize: '16px',
                fontWeight: '700',
                color: '#f8fafc',
                margin: '0 0 4px 0',
              },
            },
            '3. Works Completely Offline'
          ),
          e(
            Text,
            {
              style: {
                fontSize: '13px',
                lineHeight: '21px',
                color: '#94a3b8',
                margin: 0,
              },
            },
            'Your library now loads straight from your device. You can log pages or add notes on the train or without Wi-Fi, and your progress syncs automatically when you are back online.'
          )
        ),

        e(Hr, { style: { borderColor: '#1c2333', margin: '16px 0' } }),

        // Feature 4
        e(
          Section,
          { style: { marginBottom: '24px' } },
          e(
            Text,
            {
              style: {
                fontFamily: 'Georgia, serif',
                fontSize: '16px',
                fontWeight: '700',
                color: '#f8fafc',
                margin: '0 0 4px 0',
              },
            },
            '4. Faster Book Info & Better Help'
          ),
          e(
            Text,
            {
              style: {
                fontSize: '13px',
                lineHeight: '21px',
                color: '#94a3b8',
                margin: 0,
              },
            },
            'Book summaries and cover art now load faster using Wikipedia, Open Library, and Google Books. We also added instant search in the Help Center so you can look up keyboard shortcuts and tips anytime.'
          )
        ),

        // --- CALL TO ACTION FRAME ---
        e(
          Section,
          {
            style: {
              backgroundColor: '#121622',
              border: '1px solid #252e42',
              borderRadius: '8px',
              padding: '24px 20px',
              textAlign: 'center',
              margin: '28px 0 24px 0',
            },
          },
          e(
            Text,
            {
              style: {
                fontFamily: 'Georgia, serif',
                fontSize: '17px',
                color: '#ffffff',
                margin: '0 0 4px 0',
              },
            },
            'Your books are waiting.'
          ),
          e(
            Text,
            {
              style: {
                fontSize: '13px',
                color: '#94a3b8',
                margin: '0 0 18px 0',
              },
            },
            'Your shelves, reading logs, and private notes are right where you left them.'
          ),
          e(
            Button,
            {
              href: 'https://libriq.app',
              style: {
                backgroundColor: '#4338ca',
                border: '1px solid #6366f1',
                color: '#ffffff',
                fontSize: '13px',
                fontWeight: '600',
                letterSpacing: '0.5px',
                padding: '12px 28px',
                borderRadius: '6px',
                textDecoration: 'none',
                display: 'inline-block',
              },
            },
            'Open LibriQ →'
          )
        ),

        // --- SIGN OFF ---
        e(
          Section,
          { style: { textAlign: 'center', margin: '20px 0 24px 0' } },
          e(
            Text,
            {
              style: {
                fontSize: '13px',
                color: '#94a3b8',
                margin: '0 0 4px 0',
              },
            },
            'Happy reading,'
          ),
          e(
            Text,
            {
              style: {
                fontSize: '13px',
                fontWeight: '600',
                color: '#cbd5e1',
                margin: 0,
              },
            },
            'The LibriQ Team'
          )
        ),

        // Hairline Divider
        e(
          Section,
          { style: { textAlign: 'center', margin: '0 0 20px 0' } },
          e('div', {
            style: {
              borderTop: '1px solid #1c2333',
              height: '1px',
              width: '100%',
            },
          })
        ),

        // --- FOOTER ---
        e(
          Section,
          { style: { textAlign: 'center' } },
          e(
            Text,
            {
              style: {
                fontSize: '11px',
                lineHeight: '18px',
                color: '#64748b',
                margin: '0 0 4px 0',
              },
            },
            'LibriQ • ',
            e(
              Link,
              {
                href: 'https://libriq.app',
                style: { color: '#d4a373', textDecoration: 'none' },
              },
              'libriq.app'
            )
          ),
          e(
            Text,
            {
              style: {
                fontSize: '11px',
                lineHeight: '18px',
                color: '#475569',
                margin: '0 0 6px 0',
              },
            },
            'Private by design. No tracking pixels, no ads, ever.'
          ),
          e(
            Text,
            {
              style: {
                fontSize: '10px',
                lineHeight: '16px',
                color: '#475569',
                margin: 0,
              },
            },
            'To unsubscribe or manage your account, simply reply to this email or visit Settings in the app.'
          )
        )
      )
    )
  );
}

export async function renderAnnouncementEmail() {
  const html = await render(React.createElement(RebrandAnnouncementEmail));
  return html;
}
