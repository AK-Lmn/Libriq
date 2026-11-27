// Source guards for the signed-in dashboard's design pass. The render itself is
// covered by scripts/test-dashboard-modules.mjs; these keep the stylesheet from
// drifting back to the things the pass removed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('the poll success banner stays hidden until a vote, because display must not beat [hidden]', async () => {
  const css = await read('frontend/css/features/dashboard.css');
  assert.match(css, /\.dashboard-poll-success\[hidden\]\s*\{\s*display:\s*none/);
});

test('dashboard text is never below 12px', async () => {
  const css = await read('frontend/css/features/dashboard.css');
  const sizes = [
    ...[...css.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)].map(m => ({ rule: m[0], px: Number(m[1]) })),
    ...[...css.matchAll(/font:\s*(?:(?:italic|\d{3})\s+)*(\d+(?:\.\d+)?)px/g)].map(m => ({ rule: m[0], px: Number(m[1]) })),
  ];
  assert.ok(sizes.length > 20, 'found the type sizes');
  const small = sizes.filter(s => s.px < 12);
  assert.deepEqual(small.map(s => s.rule), []);
});

test('the dashboard styles have no tracked uppercase, heavy weights or transition: all', async () => {
  const css = await read('frontend/css/features/dashboard.css');
  assert.doesNotMatch(css, /text-transform:\s*uppercase/);
  assert.doesNotMatch(css, /font-weight:\s*[6-9]00/);
  assert.doesNotMatch(css, /font:\s*(?:italic\s+)?[6-9]00\b/);
  assert.doesNotMatch(css, /transition:\s*all\b/);
  assert.doesNotMatch(css, /font:\s*italic/, 'no italic for emphasis');
});

test('every dashboard card shares one padding on desktop', async () => {
  const css = await read('frontend/css/features/dashboard.css');
  assert.match(css, /\.dashboard-panel\s*\{[^}]*padding:\s*24px/);
  assert.doesNotMatch(css, /\.dashboard-feature-panel\s*\{\s*padding:\s*24px/, 'no special-case padding left');
  assert.match(css, /\.dashboard-poll-card\s*\{[^}]*padding:\s*24px/);
  assert.match(css, /\.onboarding-checklist\s*\{[^}]*padding:\s*24px/);
});

test('hard-coded hex colours are gone from the poll card; it uses the palette', async () => {
  const css = await read('frontend/css/features/dashboard.css');
  const poll = css.slice(css.indexOf('/* Community Poll Card */'), css.indexOf('@media (min-width: 769px)'));
  assert.doesNotMatch(poll, /#[0-9a-f]{3,6}\b/i);
  assert.doesNotMatch(poll, /rgba\(16, 185, 129/);
});

test('the sidebar section labels are sentence case, not tracked uppercase', async () => {
  const css = await read('frontend/css/sidebar.css');
  const rules = [...css.matchAll(/\.nav-section-label\s*\{[^}]*\}/g)].map(m => m[0]).join('\n');
  assert.ok(rules.length > 0);
  assert.doesNotMatch(rules, /text-transform:\s*uppercase/);
  assert.doesNotMatch(rules, /letter-spacing:\s*(?:0?\.0[2-9]|[1-9])/);
});
