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
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: name === 'dashboard-narrow' ? 'reduce' : 'no-preference' });
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
    await page.waitForLoadState('networkidle');
    const maskAssets = await page.locator('.dashboard-icon').evaluateAll(icons => [...new Set(icons.map(icon => getComputedStyle(icon).maskImage))]);
    for (const mask of maskAssets) {
      assert.notEqual(mask, 'none');
      const url = mask.match(/url\("([^"]+)"\)/)?.[1];
      assert.ok(url && url.includes('/assets/dashboard/'));
      assert.equal((await page.request.get(url)).status(), 200);
    }
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
    const contrastFailures = await page.evaluate(() => {
      const rgba = color => color.match(/[\d.]+/g).map(Number);
      const blend = (front, back) => front.slice(0, 3).map((v, i) => v * (front[3] ?? 1) + back[i] * (1 - (front[3] ?? 1)));
      const luminance = color => color.reduce((sum, value, i) => {
        const v = value / 255;
        return sum + (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4) * [0.2126, 0.7152, 0.0722][i];
      }, 0);
      const selectors = '.dashboard-mini-label, .dashboard-mini-value small, .dashboard-recent-status, .activity-subtitle, .activity-time, .dashboard-privacy, .greeting-subtitle, .dashboard-progress-meta, .dashboard-page-count, .dashboard-goal-copy p, .dashboard-hero-quote, .section-action';
      return [...document.querySelectorAll(`#dashboardPage :is(${selectors})`)].filter(el => el.getClientRects().length).flatMap(el => {
        let background = [255, 255, 255];
        const ancestors = [];
        for (let node = el; node; node = node.parentElement) ancestors.unshift(node);
        for (const node of ancestors) background = blend(rgba(getComputedStyle(node).backgroundColor), background);
        const foreground = blend(rgba(getComputedStyle(el).color), background);
        const levels = [luminance(background), luminance(foreground)].sort((a, b) => a - b);
        const ratio = (levels[1] + 0.05) / (levels[0] + 0.05);
        return ratio < 4.5 ? [`${el.className}: ${ratio.toFixed(2)}:1`] : [];
      });
    });
    assert.deepEqual(contrastFailures, [], `${name}: WCAG AA body text`);
    assert.equal(await page.locator('.dashboard-add-book').evaluate(el => getComputedStyle(el).backgroundImage), 'none');
    if (reduced) {
      assert.ok(geometry.reduced);
      assert.ok(geometry.fill.startsWith('rgb('), `${name}: opaque surface`);
      assert.equal(geometry.blur, 'none');
    }
    await page.screenshot({ path: path.join(output, `${name}.png`), fullPage: true });
    console.log(`${name}: passed`);
    await context.close();
  }
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await page.goto(base);
    await page.evaluate(async () => {
      const { buildMonthlyChart } = await import('./js/dashboard.js');
      const charts = [buildMonthlyChart([12, 6, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0]), buildMonthlyChart([300, 150, 75, 0, 0, 0, 0, 0, 0, 0, 0, 0])];
      document.getElementById('mainContent').innerHTML = `<div class="page" id="statsPage"><div class="dashboard-grid stats-layout"><div class="stats-chart-grid">${charts.map(chart => `<div class="goal-widget">${chart}</div>`).join('')}</div><aside>Summary</aside></div></div>`;
    });
    const result = await page.evaluate(() => ({
      grid: getComputedStyle(document.querySelector('.stats-layout')).display,
      columns: getComputedStyle(document.querySelector('.stats-layout')).gridTemplateColumns.split(' ').length,
      charts: [...document.querySelectorAll('.monthly-chart')].map(chart => ({
        display: getComputedStyle(chart).display,
        bars: chart.querySelectorAll('.chart-bar').length,
        first: chart.querySelector('.chart-bar').getBoundingClientRect().height,
        second: chart.querySelectorAll('.chart-bar')[1].getBoundingClientRect().height,
      })),
    }));
    assert.equal(result.grid, 'grid');
    assert.equal(result.columns, width > 1100 ? 2 : 1);
    for (const chart of result.charts) {
      assert.equal(chart.display, 'flex');
      assert.equal(chart.bars, 12);
      assert.ok(chart.first > chart.second && chart.second > 4);
    }
    console.log(`Statistics shared CSS at ${width}px: passed`);
    await page.close();
  }
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
