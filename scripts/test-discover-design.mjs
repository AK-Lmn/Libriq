import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { chromium } from 'playwright';

const root = path.resolve('frontend');
const output = path.resolve(process.env.DISCOVER_SCREENSHOT_DIR || path.join(os.tmpdir(), 'libriq-discover-design'));
const css = await fs.readFile(path.join(root, 'css/features/discover.css'), 'utf8');
const source = await fs.readFile(path.join(root, 'js/features/recommendations/recommendationsPage.js'), 'utf8');
assert.doesNotMatch(css + source, /www\.figma\.com\/api\/mcp|onclick=|Sea of Tranquility|Piranesi/);
assert.match(css, /prefers-reduced-transparency/);
assert.match(css, /@supports not/);
assert.match(css, /prefers-reduced-motion/);
assert.match(css, /var\(--glass-solid-3\)/);
for (const file of await fs.readdir(path.join(root, 'assets/revamp/discover'))) {
  const svg = await fs.readFile(path.join(root, 'assets/revamp/discover', file), 'utf8');
  assert.ok(svg.length > 100 && svg.includes('<svg'), file);
}
const shell = (await fs.readFile(path.join(root, 'index.html'), 'utf8'))
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '')
  .replace('class="auth-booting"', 'class="discover-design-fixture"')
  .replace('</head>', '<link rel="stylesheet" href="css/features/discover.css"></head>');
// Both documents isolate the renderer; neither changes production authentication.
const fixture = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="assets/fonts/fonts.css"><link rel="stylesheet" href="css/tokens.css"><link rel="stylesheet" href="css/reset.css"><link rel="stylesheet" href="css/base.css"><link rel="stylesheet" href="css/components.css"><link rel="stylesheet" href="css/features/discover.css"><style>
.fixture-header { height:88px;padding:24px 64px;display:flex;align-items:center;justify-content:space-between;background:var(--glass-fill-2);border-top:1px solid var(--glass-highlight);color:var(--text-strong); }
.fixture-brand {font:28px var(--font-display)} .fixture-tabs {display:flex;gap:28px;font-size:14px;color:var(--text-muted)} .fixture-tabs b {font-weight:400;color:var(--text-strong)}
.fixture-bottom {display:none} @media(max-width:767px){.fixture-header{height:72px;padding:20px}.fixture-brand{font-size:24px}.fixture-tabs{display:none}.fixture-bottom{display:flex;justify-content:space-around;align-items:center;height:85px;padding-bottom:env(safe-area-inset-bottom,0px);background:var(--glass-fill-3);border-top:1px solid var(--glass-highlight);color:var(--text-muted);font-size:12px}.fixture-bottom b{font-weight:400;color:var(--text-strong)}}
</style></head><body><header class="fixture-header"><span class="fixture-brand">LibriQ</span><span class="fixture-tabs"><span>My library</span><b>Discover</b><span>Reading journal</span></span><span aria-hidden="true">Search</span></header><main id="mainContent"></main><footer class="fixture-bottom"><span>Library</span><b>Discover</b><span>Journal</span></footer></body></html>`;
const server = http.createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const file = path.resolve(root, '.' + pathname);
  if (file !== root && !file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  try {
    if (pathname.startsWith('/fixture-cover-')) {
      const number = Number(pathname.match(/(\d+)/)?.[1] || 0);
      const colors = ['#18273d', '#aebccc', '#66809b', '#20334b', '#345a63', '#314760'];
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="262" height="340"><rect width="262" height="340" fill="' + colors[number % colors.length] + '"/><circle cx="131" cy="162" r="68" fill="#d4deed"/><path d="M0 285 Q130 260 262 285" stroke="#d4deed" fill="none"/></svg>';
      res.writeHead(200, { 'Content-Type': 'image/svg+xml' }).end(svg);
      return;
    }
    const body = pathname === '/' ? fixture : pathname === '/shell' ? shell : await fs.readFile(file);
    const mime = { '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' }[path.extname(file)] || 'text/html';
    res.writeHead(200, { 'Content-Type': mime }).end(body);
  } catch { res.writeHead(404).end(); }
});
await fs.mkdir(output, { recursive: true });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch();
const report = [];

async function mount(page, theme, empty, longTitles = false) {
  await page.evaluate(async ({ theme, empty, longTitles }) => {
    document.documentElement.dataset.theme = theme;
    const { createRecommendationsPage } = await import('./js/features/recommendations/recommendationsPage.js');
    const { Utils } = await import('./js/utils.js');
    const { LIBRIQ } = await import('./js/data.js');
    window.Utils = Utils;
    const saved = [
      { id: 'saved-1', title: 'A Psalm for the Wild-Built', author: 'Becky Chambers', status: 'wishlist', coverUrl: '/fixture-cover-4.svg' },
      { id: 'saved-2', title: 'The Left Hand of Darkness', author: 'Ursula K. Le Guin', status: 'wishlist', coverUrl: '/fixture-cover-5.svg' },
      ...Array.from({ length: 40 }, (_, i) => ({ id: 'saved-' + (i + 3), title: 'Library signal ' + i, author: 'Reader favorite', status: 'finished', genres: [i % 2 ? 'Speculative' : 'Reflective'], rating: 4.2, isFavorite: i < 8 })),
    ];
    const books = empty ? [{ id: 'first', title: 'My first book', author: '', status: 'finished' }] : saved;
    const next = [
      { id: 'new-0', title: 'Sea of Tranquility', author: 'Emily St. John Mandel' },
      { id: 'new-1', title: 'Piranesi', author: 'Susanna Clarke' },
      { id: 'new-2', title: 'The Memory Police', author: 'Yoko Ogawa' },
      { id: 'new-3', title: 'The Dispossessed', author: 'Ursula K. Le Guin' },
    ].map((book, i) => ({ ...book, title: longTitles ? ('VeryLongUnbrokenBookTitle'.repeat(4) + i) : book.title, coverUrl: '/fixture-cover-' + i + '.svg', sources: ['openlibrary'] }));
    window.fixtureCalls = [];
    window.providerCalls = 0;
    window.renderDiscover = createRecommendationsPage({
      storage: { getBooks: () => books, getBookById: id => books.find(book => book.id === id) },
      library: { showAddModal: book => window.fixtureCalls.push(['add', book.title]), showDetailsModal: id => window.fixtureCalls.push(['details', id]) },
      bookApi: {
        isSameBook: (a, b) => a.id === b.id,
        buildSourceBadgeData: book => ({ sources: book.sources || [], sourceBadges: [] }),
        searchBySubject: async key => { window.providerCalls++; return key === 'reflective' ? [next[0], next[2]] : key === 'speculative' ? [next[1], next[3]] : []; },
        searchCuratedClassics: async () => { window.providerCalls++; return []; },
      },
      utils: Utils, constants: LIBRIQ,
      actions: { isOnline: () => true, openSearch: () => window.fixtureCalls.push(['search']), navigate: hub => window.fixtureCalls.push(['navigate', hub]) },
      documentRoot: document,
    });
    await window.renderDiscover();
    await document.fonts.ready;
  }, { theme, empty, longTitles });
}

try {
  const cases = [];
  for (const width of [1440, 390]) {
    for (const theme of ['dark', 'light']) {
      for (const mode of ['glass', 'solid', 'empty', 'empty-solid']) cases.push({ width, theme, mode });
    }
  }
  cases.push({ width: 320, theme: 'dark', mode: 'long' }, { width: 768, theme: 'light', mode: 'glass' }, { width: 1440, theme: 'dark', mode: 'unsupported' });
  for (const { width, theme, mode } of cases) {
    const name = 'discover-' + width + '-' + theme + '-' + mode;
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    if (mode.includes('solid')) {
      await (await context.newCDPSession(page)).send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }, { name: 'prefers-reduced-motion', value: 'reduce' }] });
    }
    await page.goto(base);
    await mount(page, theme, mode.includes('empty'), mode === 'long');
    if (mode === 'unsupported') {
      const fallback = await page.evaluate(() => [...document.styleSheets].flatMap(sheet => [...sheet.cssRules].filter(rule => rule.conditionText?.startsWith('not') && rule.conditionText.includes('backdrop-filter')).flatMap(rule => [...rule.cssRules].map(child => child.cssText))).join('\n'));
      assert.ok(fallback.includes('--glass-solid-3'), 'native unsupported-backdrop fallback rules found');
      await page.addStyleTag({ content: fallback });
    }
    await page.locator('.discover-private-note').scrollIntoViewIfNeeded();
    await page.evaluate(async () => {
      await Promise.all([...document.querySelectorAll('#recommendationsPage img')].map(img => {
        img.loading = 'eager';
        return img.decode().catch(() => {});
      }));
      scrollTo(0, 0);
    });
    const metrics = await page.evaluate(() => {
      const root = document.getElementById('recommendationsPage');
      const card = document.querySelector('.discover-card');
      const glass = document.querySelector('.discover-glass');
      return {
        overflow: document.documentElement.scrollWidth > innerWidth || root.scrollWidth > root.clientWidth,
        columns: document.querySelector('.discover-grid') ? getComputedStyle(document.querySelector('.discover-grid')).gridTemplateColumns.split(' ').length : 0,
        assets: [...root.querySelectorAll('img')].every(img => img.complete && img.naturalWidth > 0),
        icons: [...root.querySelectorAll('.discover-icon img')].every(img => Math.abs(img.naturalWidth / img.naturalHeight - Number(img.getAttribute('width')) / Number(img.getAttribute('height'))) < 0.01) && [...root.querySelectorAll('.discover-icon')].every(icon => [...icon.querySelectorAll('img')].filter(img => getComputedStyle(img).display !== 'none').length === 1),
        coverWidth: card?.querySelector('.book-cover').getBoundingClientRect().width,
        cardWidth: card?.getBoundingClientRect().width,
        blur: getComputedStyle(glass).backdropFilter,
        fill: getComputedStyle(glass).backgroundColor,
        fonts: document.fonts.check('14px Inter') && document.fonts.check('14px Lora') && document.fonts.check('12px "IBM Plex Mono"'),
      };
    });
    assert.deepEqual(errors, [], name);
    assert.equal(metrics.overflow, false, name + ': horizontal overflow');
    assert.equal(metrics.columns, mode.includes('empty') ? 0 : width < 1200 ? 2 : 4, name + ': grid');
    assert.ok(metrics.assets && metrics.icons && metrics.fonts, name + ': local assets, native icon proportions and fonts');
    if (!mode.includes('empty')) assert.ok(metrics.coverWidth > metrics.cardWidth / 2, name + ': cover not shrunk by legacy card styles');
    if (mode.includes('solid') || mode === 'unsupported') {
      assert.equal(metrics.blur, 'none', name + ': blur disabled');
      assert.doesNotMatch(metrics.fill, /rgba/, name + ': opaque fallback');
    } else if (width < 768) assert.equal(metrics.blur, 'blur(6px)', name + ': mobile blur capped');
    const failures = await page.evaluate(() => {
      const rgba = color => color.match(/[\d.]+/g).map(Number);
      const blend = (front, back) => front.slice(0, 3).map((v, i) => v * (front[3] ?? 1) + back[i] * (1 - (front[3] ?? 1)));
      const luminance = color => color.reduce((sum, value, i) => {
        const v = value / 255;
        return sum + (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4) * [0.2126, 0.7152, 0.0722][i];
      }, 0);
      return [...document.querySelectorAll('#recommendationsPage *')].filter(el => el.getClientRects().length && !el.closest('.discover-sr-only') && [...el.childNodes].some(node => node.nodeType === 3 && node.textContent.trim())).flatMap(el => {
        let background = [255, 255, 255];
        const ancestors = [];
        for (let node = el; node; node = node.parentElement) ancestors.unshift(node);
        for (const node of ancestors) background = blend(rgba(getComputedStyle(node).backgroundColor), background);
        const levels = [luminance(background), luminance(blend(rgba(getComputedStyle(el).color), background))].sort((a,b) => a-b);
        const ratio = (levels[1] + .05) / (levels[0] + .05);
        return ratio < 4.5 ? [el.className + ': ' + ratio.toFixed(2)] : [];
      });
    });
    assert.deepEqual(failures, [], name + ': AA text contrast');
    if (mode === 'glass') {
      await page.locator('.discover-grid [data-book-id="new-0"]').click();
      await page.locator('.discover-saved-card').first().click();
      assert.deepEqual(await page.evaluate(() => window.fixtureCalls), [['add', 'Sea of Tranquility'], ['details', 'saved-1']]);
      const calls = await page.evaluate(() => window.providerCalls);
      await page.getByRole('button', { name: 'Refresh', exact: true }).click();
      await page.waitForFunction(expected => window.providerCalls === expected, calls * 2);
      await page.waitForFunction(() => document.getElementById('subjectDiscoveryRoot').getAttribute('aria-busy') === 'false');
      assert.equal(await page.locator('.discover-grid .discover-card').count(), 4);
      await page.getByRole('button', { name: 'Free classics', exact: true }).click();
      await page.getByRole('button', { name: 'Search books', exact: true }).click();
      assert.deepEqual(await page.evaluate(() => window.fixtureCalls.at(-1)), ['search']);
      await page.getByRole('button', { name: 'For you', exact: true }).click();
    }
    if (mode.includes('empty')) {
      await page.getByRole('button', { name: 'Add a book', exact: true }).click();
      await page.getByRole('button', { name: 'Open Library', exact: true }).click();
      assert.deepEqual(await page.evaluate(() => window.fixtureCalls), [['search'], ['navigate', 'library']]);
    }
    await page.mouse.move(0, 0);
    await page.evaluate(() => { document.activeElement?.blur(); scrollTo(0,0); });
    await page.screenshot({ path: path.join(output, name + '.png'), fullPage: true });
    report.push({ name, status: 'passed', ...metrics });
    await context.close();
  }
  // The unmodified production shell also renders the feature without overflow.
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    await page.goto(base + '/shell');
    await mount(page, 'dark', false);
    await page.evaluate(() => document.fonts.ready);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'production shell overflow');
    await page.screenshot({ path: path.join(output, 'discover-shell-' + width + '.png'), fullPage: true });
    const geometry = await page.locator('#recommendationsPage').boundingBox();
    report.push({ name: 'production-shell-' + width, status: 'passed', geometry });
    await page.close();
  }
  await fs.writeFile(path.join(output, 'results.json'), JSON.stringify(report, null, 2));
  console.log('Discover design checks passed: 19 reference-shell cases (including forced unsupported-backdrop rules) and 2 production-shell fixtures. Screenshots: ' + output);
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
