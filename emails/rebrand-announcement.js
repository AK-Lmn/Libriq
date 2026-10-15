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
            'Georgia, Cambria, "Times New Roman", Times, serif',
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
            maxWidth: '580px',
            margin: '0 auto',
            backgroundColor: '#0d1017',
            border: '1px solid #1c2333',
            borderRadius: '14px',
            padding: '44px 38px',
            color: '#e2e8f0',
            boxShadow: '0 20px 40px rgba(0,0,0,0.6)',
          },
        },

        // --- MASTHEAD ---
        e(
          Section,
          { style: { textAlign: 'center', marginBottom: '28px' } },
          e(Img, {
            src: 'https://www.libriq.app/assets/icons/icon-192.png',
            width: '44',
            height: '44',
            alt: 'LibriQ Crest',
            style: {
              margin: '0 auto 12px auto',
              borderRadius: '10px',
              border: '1px solid #2d3748',
              display: 'block',
            },
          }),
          e(
            Text,
            {
              style: {
                fontFamily:
                  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                fontSize: '15px',
                fontWeight: '700',
                letterSpacing: '5px',
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
                fontFamily:
                  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                fontSize: '10px',
                fontWeight: '600',
                letterSpacing: '2.5px',
                color: '#d4a373',
                textTransform: 'uppercase',
                margin: 0,
              },
            },
            'DISPATCH • EDITION 4.8 • AUTUMN 2026'
          )
        ),

        // Double Hairline Divider
        e(
          Section,
          { style: { textAlign: 'center', margin: '0 0 32px 0' } },
          e('div', {
            style: {
              borderTop: '1px solid #222b3d',
              borderBottom: '1px solid #222b3d',
              height: '3px',
              width: '100%',
            },
          })
        ),

        // --- HERO HEADLINE ---
        e(
          Heading,
          {
            as: 'h1',
            className: 'headline',
            style: {
              fontFamily: 'Georgia, Cambria, serif',
              fontSize: '28px',
              fontWeight: '400',
              color: '#ffffff',
              lineHeight: '1.3',
              letterSpacing: '-0.3px',
              margin: '0 0 20px 0',
              textAlign: 'center',
            },
          },
          'A quiet sanctuary for your reading life.'
        ),

        // --- PULL QUOTE MANIFESTO ---
        e(
          Section,
          {
            style: {
              backgroundColor: '#121622',
              borderLeft: '3px solid #d4a373',
              borderRadius: '0 8px 8px 0',
              padding: '16px 20px',
              margin: '0 0 28px 0',
            },
          },
          e(
            Text,
            {
              style: {
                fontFamily: 'Georgia, serif',
                fontStyle: 'italic',
                fontSize: '15px',
                lineHeight: '24px',
                color: '#cbd5e1',
                margin: 0,
              },
            },
            '“We built LibriQ with a simple conviction: reading is sacred. It deserves an intimate space free from algorithmic feeds, social performance, and commercial noise.”'
          )
        ),

        // --- INTRO COPY ---
        e(
          Text,
          {
            style: {
              fontFamily:
                '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
              fontSize: '14px',
              lineHeight: '23px',
              color: '#94a3b8',
              margin: '0 0 28px 0',
            },
          },
          'Over the past weeks, we have rebuilt the platform from the foundation up. LibriQ v4.8 introduces a tactile, three-dimensional reading environment crafted specifically for deep focus and book lovers.'
        ),

        // --- BESPOKE 3D BOOKSHELF MINIATURE ---
        e(
          Section,
          {
            style: {
              backgroundColor: '#090b10',
              border: '1px solid #1a202c',
              borderRadius: '10px',
              padding: '24px 20px 16px 20px',
              margin: '0 0 36px 0',
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
                    width: '22px',
                    height: '66px',
                    backgroundColor: '#831843',
                    borderLeft: '2px solid #be185d',
                    borderRadius: '2px 2px 0 0',
                    boxShadow: 'inset 0 0 6px rgba(0,0,0,0.5)',
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
                    height: '78px',
                    backgroundColor: '#1e3a8a',
                    borderLeft: '2px solid #3b82f6',
                    borderRadius: '2px 2px 0 0',
                    boxShadow: 'inset 0 0 6px rgba(0,0,0,0.5)',
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
                    width: '30px',
                    height: '84px',
                    backgroundColor: '#14532d',
                    borderLeft: '2px solid #22c55e',
                    borderRadius: '2px 2px 0 0',
                    boxShadow: 'inset 0 0 6px rgba(0,0,0,0.5)',
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
                    height: '72px',
                    backgroundColor: '#78350f',
                    borderLeft: '2px solid #d97706',
                    borderRadius: '2px 2px 0 0',
                    boxShadow: 'inset 0 0 6px rgba(0,0,0,0.5)',
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
                    backgroundColor: '#4c1d95',
                    borderLeft: '2px solid #8b5cf6',
                    borderRadius: '2px 2px 0 0',
                    boxShadow: 'inset 0 0 6px rgba(0,0,0,0.5)',
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
                    height: '68px',
                    backgroundColor: '#0f172a',
                    borderLeft: '2px solid #64748b',
                    borderRadius: '2px 2px 0 0',
                    boxShadow: 'inset 0 0 6px rgba(0,0,0,0.5)',
                  },
                })
              )
            )
          ),
          // Cedar Wood Shelf Plinth
          e('div', {
            style: {
              height: '8px',
              backgroundColor: '#573318',
              borderTop: '2px solid #854d0e',
              borderBottom: '2px solid #271406',
              borderRadius: '2px',
              margin: '0 auto 12px auto',
              maxWidth: '240px',
              boxShadow: '0 4px 10px rgba(0,0,0,0.7)',
            },
          }),
          e(
            Text,
            {
              style: {
                fontFamily:
                  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                fontSize: '11px',
                letterSpacing: '1.5px',
                textTransform: 'uppercase',
                color: '#d4a373',
                margin: 0,
              },
            },
            'Virtual Cedar Shelf Architecture'
          )
        ),

        // --- CHAPTER / MONOGRAPH SECTIONS ---
        e(
          Text,
          {
            style: {
              fontFamily:
                '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
              fontSize: '11px',
              fontWeight: '700',
              letterSpacing: '2px',
              textTransform: 'uppercase',
              color: '#d4a373',
              margin: '0 0 16px 0',
            },
          },
          'The v4.8 Monograph'
        ),

        // Monograph I
        e(
          Section,
          { style: { marginBottom: '22px' } },
          e(
            Text,
            {
              style: {
                fontFamily: 'Georgia, serif',
                fontSize: '16px',
                fontWeight: '700',
                color: '#f8fafc',
                margin: '0 0 6px 0',
              },
            },
            'I. The 3D Digital Bookshelf'
          ),
          e(
            Text,
            {
              style: {
                fontFamily:
                  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                fontSize: '13px',
                lineHeight: '21px',
                color: '#94a3b8',
                margin: 0,
              },
            },
            'Your library visualized on rich virtual cedar planks. Orbit with your mouse or finger, illuminate titles with interactive spine hover, and pull volumes into drawer view. Tap the switcher or press "V" on desktop to enter.'
          )
        ),

        e(Hr, { style: { borderColor: '#1c2333', margin: '16px 0' } }),

        // Monograph II
        e(
          Section,
          { style: { marginBottom: '22px' } },
          e(
            Text,
            {
              style: {
                fontFamily: 'Georgia, serif',
                fontSize: '16px',
                fontWeight: '700',
                color: '#f8fafc',
                margin: '0 0 6px 0',
              },
            },
            'II. Nocturne: Deep Indigo Identity'
          ),
          e(
            Text,
            {
              style: {
                fontFamily:
                  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                fontSize: '13px',
                lineHeight: '21px',
                color: '#94a3b8',
                margin: 0,
              },
            },
            'Calibrated specifically for night readers. High-contrast typography resting against velvet-dark slate, removing glare without dimming legibility.'
          )
        ),

        e(Hr, { style: { borderColor: '#1c2333', margin: '16px 0' } }),

        // Monograph III
        e(
          Section,
          { style: { marginBottom: '22px' } },
          e(
            Text,
            {
              style: {
                fontFamily: 'Georgia, serif',
                fontSize: '16px',
                fontWeight: '700',
                color: '#f8fafc',
                margin: '0 0 6px 0',
              },
            },
            'III. Local-First Offline Speed'
          ),
          e(
            Text,
            {
              style: {
                fontFamily:
                  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                fontSize: '13px',
                lineHeight: '21px',
                color: '#94a3b8',
                margin: 0,
              },
            },
            'Zero loading spinners. Your shelves and reading logs are stored directly on your device via IndexedDB, syncing silently in the background when connectivity returns.'
          )
        ),

        e(Hr, { style: { borderColor: '#1c2333', margin: '16px 0' } }),

        // Monograph IV
        e(
          Section,
          { style: { marginBottom: '28px' } },
          e(
            Text,
            {
              style: {
                fontFamily: 'Georgia, serif',
                fontSize: '16px',
                fontWeight: '700',
                color: '#f8fafc',
                margin: '0 0 6px 0',
              },
            },
            'IV. Silent Enrichment & Guides'
          ),
          e(
            Text,
            {
              style: {
                fontFamily:
                  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                fontSize: '13px',
                lineHeight: '21px',
                color: '#94a3b8',
                margin: 0,
              },
            },
            'Automated synopsis and cover retrieval via Open Library, Google Books, and Wikipedia, accompanied by a new in-guide instant topic and shortcut search engine.'
          )
        ),

        // --- CALL TO ACTION FRAME ---
        e(
          Section,
          {
            style: {
              backgroundColor: '#121622',
              border: '1px solid #252e42',
              borderRadius: '10px',
              padding: '28px 24px',
              textAlign: 'center',
              margin: '32px 0 28px 0',
            },
          },
          e(
            Text,
            {
              style: {
                fontFamily: 'Georgia, serif',
                fontSize: '18px',
                fontWeight: '400',
                color: '#ffffff',
                margin: '0 0 6px 0',
              },
            },
            'Your shelves are waiting.'
          ),
          e(
            Text,
            {
              style: {
                fontFamily:
                  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                fontSize: '13px',
                color: '#94a3b8',
                margin: '0 0 20px 0',
              },
            },
            'All your reading history, private notes, and custom categories remain safe and untouched.'
          ),
          e(
            Button,
            {
              href: 'https://libriq.app',
              style: {
                backgroundColor: '#3730a3',
                backgroundImage: 'linear-gradient(180deg, #4338ca 0%, #312e81 100%)',
                border: '1px solid #6366f1',
                color: '#ffffff',
                fontFamily:
                  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                fontSize: '13px',
                fontWeight: '700',
                letterSpacing: '1.5px',
                textTransform: 'uppercase',
                padding: '13px 32px',
                borderRadius: '6px',
                textDecoration: 'none',
                display: 'inline-block',
                boxShadow: '0 4px 14px rgba(67, 56, 202, 0.4)',
              },
            },
            'Return to Your Sanctuary →'
          )
        ),

        // --- SIGN OFF ---
        e(
          Section,
          { style: { textAlign: 'center', margin: '24px 0 28px 0' } },
          e(
            Text,
            {
              style: {
                fontFamily: 'Georgia, serif',
                fontStyle: 'italic',
                fontSize: '14px',
                color: '#94a3b8',
                margin: '0 0 4px 0',
              },
            },
            'Curated with patience and craft.'
          ),
          e(
            Text,
            {
              style: {
                fontFamily:
                  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                fontSize: '12px',
                fontWeight: '600',
                color: '#cbd5e1',
                letterSpacing: '1px',
                textTransform: 'uppercase',
                margin: 0,
              },
            },
            'The LibriQ Keepers'
          )
        ),

        // Bottom Double Hairline
        e(
          Section,
          { style: { textAlign: 'center', margin: '0 0 24px 0' } },
          e('div', {
            style: {
              borderTop: '1px solid #1c2333',
              height: '1px',
              width: '100%',
            },
          })
        ),

        // --- COLOPHON FOOTER ---
        e(
          Section,
          { style: { textAlign: 'center' } },
          e(
            Text,
            {
              style: {
                fontFamily:
                  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                fontSize: '11px',
                lineHeight: '18px',
                color: '#64748b',
                margin: '0 0 6px 0',
              },
            },
            'Ex Libris LibriQ • ',
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
                fontFamily:
                  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                fontSize: '11px',
                lineHeight: '18px',
                color: '#475569',
                margin: '0 0 8px 0',
              },
            },
            'Private by design: zero tracking pixels, zero analytics sale, zero advertisements.'
          ),
          e(
            Text,
            {
              style: {
                fontFamily:
                  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                fontSize: '10px',
                lineHeight: '16px',
                color: '#475569',
                margin: 0,
              },
            },
            'To adjust preferences or unsubscribe, reply to this dispatch or visit Settings in the app.'
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
