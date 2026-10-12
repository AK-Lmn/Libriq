import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const root = path.resolve('frontend');
const output = path.resolve('docs/screenshots');
const html = (await fs.readFile(path.join(root, 'index.html'), 'utf8'))
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '')
  .replace('class="auth-booting"', 'class="dashboard-design-fixture"');
// Render the production shell/component in isolation, without changing production authentication.
const server = http.createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const file = path.resolve(root, `.${pathname}`);
  if (file !== root && !file.startsWith(`${root}${path.sep}`)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const body = pathname === '/' ? html : await fs.readFile(file);
    const type = { '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
      '.html': 'text/html', '.woff2': 'font/woff2', '.png': 'image/png' }[path.extname(file)] || 'text/html';
    res.writeHead(200, { 'Content-Type': type }).end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();
await fs.mkdir(output, { recursive: true });

try {
  for (const [name, width, theme, empty, reduced] of [
    ['dashboard-desktop', 1440, 'dark', false, false],
    ['dashboard-mobile', 390, 'dark', false, false],
    ['dashboard-light', 1440, 'light', false, false],
    ['dashboard-empty-solid', 390, 'dark', true, true],
    ['dashboard-light-solid', 390, 'light', false, true],
    ['dashboard-narrow', 320, 'dark', false, false],
  ]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base);
    if (reduced) {
      const cdp = await context.newCDPSession(page);
      await cdp.send('Emulation.setEmulatedMedia', { features: [
        { name: 'prefers-reduced-transparency', value: 'reduce' },
        { name: 'prefers-reduced-motion', value: 'reduce' },
      ] });
    }
    await page.evaluate(async ({ theme, empty }) => {
      localStorage.setItem('libriq_onboarding_dismissed', '1');
      document.documentElement.dataset.theme = theme;
      const { Storage } = await import('./js/storage.js');
      const { Dashboard } = await import('./js/dashboard.js');
      const books = empty ? [] : [
        { id: 'reading', title: 'The Midnight Library', author: 'Matt Haig', status: 'reading',
          genre: 'Contemporary fiction', currentPage: 192, pageCount: 304, quote: 'Between life and death there is a library.', dateAdded: '2026-10-12' },
        { id: 'wishlist', title: 'Piranesi', author: 'Susanna Clarke', status: 'wishlist', dateAdded: '2026-10-11' },
        { id: 'finished', title: 'The Creative Act', author: 'Rick Rubin', status: 'finished', dateAdded: '2026-10-10' },
        { id: 'reading-two', title: 'Tomorrow, and Tomorrow, and Tomorrow', author: 'Gabrielle Zevin', status: 'reading', dateAdded: '2026-10-09' },
      ];
      Object.assign(Storage, {
        getBooks: () => books,
        getBooksByStatus: status => books.filter(book => book.status === status),
        getProfile: () => ({ name: 'Alex' }),
        getGoals: () => ({ yearly: 24 }),
        getStreak: () => ({ current: 12 }),
        getStats: () => ({ total: books.length, reading: 2, finishedThisYear: 18, avgRating: 4.3,
          topGenres: empty ? [] : [['Fiction', 2], ['Nonfiction', 1], ['Fantasy', 1]] }),
        getActivityLog: () => empty ? [] : [
          { type: 'progress_updated', bookTitle: 'The Midnight Library', timestamp: new Date().toISOString(), payload: { currentPage: 192 } },
          { type: 'book_finished', bookTitle: 'The Creative Act', timestamp: new Date().toISOString(), payload: { rating: 4.5 } },
          { type: 'favorite_added', bookTitle: 'Tomorrow, and Tomorrow, and Tomorrow', timestamp: new Date().toISOString() },
        ],
      });
      Dashboard.render();
      document.getElementById('streakCount').textContent = '12';
    }, { theme, empty });
    await page.evaluate(() => document.fonts.ready);
    await page.locator('#dashboardPage').waitFor();
    assert.deepEqual(errors, [], name);
    const geometry = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth,
      columns: getComputedStyle(document.querySelector('.dashboard-layout')).gridTemplateColumns.split(' ').length,
      reduced: matchMedia('(prefers-reduced-transparency: reduce)').matches,
      fill: getComputedStyle(document.querySelector('.dashboard-feature-panel')).backgroundColor,
      blur: getComputedStyle(document.querySelector('.dashboard-feature-panel')).backdropFilter,
      assets: [...document.querySelectorAll('#dashboardPage img')].every(img => img.complete && img.naturalWidth > 0),
      font: document.fonts.check('14px Inter') && document.fonts.check('14px Lora'),
    }));
    assert.equal(geometry.scroll, geometry.width, `${name}: no horizontal overflow`);
    assert.equal(geometry.columns, width > 768 ? 2 : 1, `${name}: responsive columns`);
    assert.ok(geometry.assets, `${name}: local Figma assets loaded`);
    assert.ok(geometry.font, `${name}: local fonts loaded`);
    if (reduced) {
      assert.ok(geometry.reduced);
      assert.ok(geometry.fill.startsWith('rgb('), `${name}: opaque surface`);
      assert.equal(geometry.blur, 'none');
    }
    await page.screenshot({ path: path.join(output, `${name}.png`), fullPage: true });
    console.log(`${name}: passed`);
    await context.close();
  }
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
