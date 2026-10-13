import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const root = path.resolve('frontend');
const output = path.resolve(process.env.INSIGHTS_SCREENSHOTS || 'docs/screenshots/insights');
const html = (await fs.readFile(path.join(root, 'index.html'), 'utf8'))
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '')
  .replace('class="auth-booting"', 'class="insights-design-fixture"')
  .replace('</head>', '<link rel="stylesheet" href="css/features/goals.css" /></head>');
// Only the isolated renderer response changes; production authentication stays untouched.
const server = http.createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const file = path.resolve(root, `.${pathname}`);
  if (file !== root && !file.startsWith(`${root}${path.sep}`)) return res.writeHead(403).end();
  if (pathname === '/fixture-cover.svg') {
    return res.writeHead(200, { 'Content-Type': 'image/svg+xml' }).end('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="300" viewBox="0 0 200 300"><rect width="200" height="300" fill="#29334b"/><rect x="16" y="16" width="168" height="268" fill="none" stroke="#7c8cf8"/></svg>');
  }
  try {
    const body = pathname === '/' ? html : await fs.readFile(file);
    const type = { '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png' }[path.extname(file)] || 'text/html';
    res.writeHead(200, { 'Content-Type': type }).end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();
await fs.mkdir(output, { recursive: true });

async function renderFixture(page, unit, theme, empty, zero, missing) {
  await page.evaluate(async ({ unit, theme, empty, zero, missing }) => {
    document.documentElement.dataset.theme = theme;
    const { Storage } = await import('./js/storage.js');
    const { Utils } = await import('./js/utils.js');
    const { LIBRIQ } = await import('./js/data.js');
    const { buildMonthlyChart, buildGenreRow } = await import('./js/dashboard.js');
    const { createStatisticsPage } = await import('./js/features/statistics/statisticsPage.js');
    const { createGoalsPage } = await import('./js/features/goals/goalsPage.js');
    const { createActivityPage } = await import('./js/features/activity/activityPage.js');
    const books = empty ? [] : Array.from({ length: 24 }, (_, index) => ({
      id: `book-${index}`, title: index === 0 ? 'The Shape of Tides' : index === 1 ? 'The Quiet Orbit' : `Reading volume ${index + 1}`,
      author: index === 0 ? 'Mira Solen' : 'Elias Venn', status: 'finished', pageCount: 180 + index * 12,
      rating: index % 4 === 0 ? 5 : 4, genres: [index % 2 ? 'Science Fiction' : 'Literary Fiction'], tags: ['Owned'],
      dateFinished: missing ? null : `2026-${String(index % 10 + 1).padStart(2, '0')}-01T12:00:00Z`,
      updatedAt: '2026-10-01T12:00:00Z', coverUrl: '/fixture-cover.svg',
    }));
    if (!empty) books.push({ id: 'reading', title: 'A deliberately very long book title to verify narrow layouts without horizontal overflow', author: 'Reading author', status: 'reading', genres: ['Fantasy'], pageCount: 304 });
    let goals = { yearly: zero ? 0 : 30, year: 2026 };
    const events = empty ? [] : [
      { type: 'progress_updated', bookId: 'reading', bookTitle: books.at(-1).title, bookAuthor: 'Reading author', timestamp: '2026-10-12T12:30:00Z', payload: { currentPage: 192, pageCount: 304 } },
      { type: 'note_saved', bookId: 'book-0', bookTitle: 'The Shape of Tides', bookAuthor: 'Mira Solen', timestamp: '2026-10-12T11:15:00Z' },
      { type: 'book_finished', bookId: 'book-1', bookTitle: 'The Quiet Orbit', bookAuthor: 'Elias Venn', timestamp: '2026-10-12T10:00:00Z' },
      { type: 'book_added', bookId: 'book-0', bookTitle: 'The Shape of Tides', timestamp: '2026-10-11T12:00:00Z' },
      { type: 'backup_exported', timestamp: '2026-10-11T08:00:00Z' },
      { type: 'metadata_refreshed', bookId: 'book-1', bookTitle: 'The Quiet Orbit', timestamp: '2026-10-10T10:00:00Z' },
    ];
    window.fixtureCalls = [];
    Storage.setActiveAccountUid('insights-render-fixture');
    Storage.saveBooks(books);
    Object.assign(Storage, {
      getBooks: () => books, getGoals: () => goals, getStreak: () => ({ current: empty ? 0 : 8, longest: empty ? 0 : 21 }),
      getActivityLog: () => events, saveGoals: value => { goals = value; window.fixtureCalls.push(['save', value]); },
    });
    const utils = { ...Utils, toast: (...args) => window.fixtureCalls.push(['toast', ...args]) };
    const actions = { buildMonthlyChart, buildGenreRow, navigate: target => window.fixtureCalls.push(['navigate', target]), openSearch: () => window.fixtureCalls.push(['search']), setGoalPreset: (input, value) => { input.value = value; } };
    const dependencies = { storage: Storage, utils, constants: LIBRIQ, actions, documentRoot: document, session: sessionStorage };
    const render = unit === 'statistics' ? createStatisticsPage(dependencies) : unit === 'goals' ? createGoalsPage(dependencies) : createActivityPage(dependencies);
    render();
    window.fixtureRender = render;
    const activePage = { statistics: 'stats', goals: 'goals', activity: 'activity' }[unit];
    document.querySelectorAll('[data-page]').forEach(el => {
      el.classList.toggle('active', el.dataset.page === activePage || (unit !== 'statistics' && el.dataset.page === 'stats' && el.classList.contains('mobile-bottom-item')));
    });
  }, { unit, theme, empty, zero, missing });
}

function checkContrast() {
  const rgba = color => color.match(/[\d.]+/g).map(Number);
  const blend = (front, back) => front.slice(0, 3).map((v, i) => v * (front[3] ?? 1) + back[i] * (1 - (front[3] ?? 1)));
  const luminance = color => color.reduce((sum, value, i) => {
    const v = value / 255;
    return sum + (v <= 0.04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4) * [.2126, .7152, .0722][i];
  }, 0);
  return [...document.querySelectorAll('#mainContent .page *')].filter(el =>
    el.getClientRects().length && !el.classList.contains('sr-only') &&
    ([...el.childNodes].some(node => node.nodeType === 3 && node.textContent.trim()) || el.matches('input, select'))
  ).flatMap(el => {
    let background = [255, 255, 255];
    const ancestors = [];
    for (let node = el; node; node = node.parentElement) ancestors.unshift(node);
    for (const node of ancestors) background = blend(rgba(getComputedStyle(node).backgroundColor), background);
    const foreground = blend(rgba(getComputedStyle(el).color), background);
    const levels = [luminance(background), luminance(foreground)].sort((a, b) => a - b);
    const ratio = (levels[1] + .05) / (levels[0] + .05);
    return ratio < 4.5 ? [`${el.tagName}.${el.className}: ${ratio.toFixed(2)}:1`] : [];
  });
}

try {
  for (const unit of ['statistics', 'goals', 'activity']) {
    for (const [state, width, theme, empty, reduced, zero, missing] of [
      ['desktop-dark', 1440, 'dark', false, false, false, false],
      ['mobile-dark', 390, 'dark', false, false, false, false],
      ['desktop-light', 1440, 'light', false, false, false, false],
      ['mobile-light', 390, 'light', false, false, false, false],
      ['empty-solid', 390, 'dark', true, true, false, false],
      ['light-solid', 390, 'light', false, true, false, false],
      ['narrow-zero', 320, 'dark', false, true, true, false],
      ...(unit === 'statistics' ? [['missing-dates', 1440, 'dark', false, false, false, true]] : []),
    ]) {
      const name = `${unit}-${state}`;
      const context = await browser.newContext({ viewport: { width, height: 900 }, timezoneId: 'UTC', locale: 'en-US', reducedMotion: 'reduce' });
      const page = await context.newPage();
      const errors = [];
      const failedAssets = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('response', response => { if (response.url().includes('/assets/revamp/insights/') && !response.ok()) failedAssets.push(response.url()); });
      await page.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
      await page.clock.install({ time: new Date('2026-10-12T13:52:00Z') });
      await page.goto(base);
      if (reduced) {
        const cdp = await context.newCDPSession(page);
        await cdp.send('Emulation.setEmulatedMedia', { features: [
          { name: 'prefers-reduced-transparency', value: 'reduce' }, { name: 'prefers-reduced-motion', value: 'reduce' },
        ] });
      }
      await renderFixture(page, unit, theme, empty, zero, missing);
      await page.locator('#mainContent .page img').evaluateAll(images => images.forEach(img => { img.loading = 'eager'; }));
      await page.evaluate(() => document.fonts.ready);
      await page.waitForLoadState('networkidle');
      const geometry = await page.evaluate(() => {
        const root = document.querySelector('#mainContent .page');
        const card = root.querySelector('.goal-widget, .activity-list, .activity-empty-state');
        return {
          width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth,
          pageOverflow: root.scrollWidth > root.clientWidth + 1, pageWidth: root.clientWidth, pageScroll: root.scrollWidth,
          assets: [...root.querySelectorAll('img')].every(img => img.complete && img.naturalWidth > 0),
          fonts: ['Inter', 'Lora', 'IBM Plex Mono'].every(font => document.fonts.check(`14px "${font}"`)),
          background: getComputedStyle(card).backgroundColor, blur: getComputedStyle(card).backdropFilter,
          cardWidths: [...root.querySelectorAll('.goal-widget')].map(el => Math.round(el.getBoundingClientRect().width)),
          navs: root.querySelectorAll('nav, .sidebar, .mobile-bottom-nav').length,
          mobileNav: getComputedStyle(document.querySelector('.mobile-bottom-nav')).position,
          badges: !!document.getElementById('badge-library') && !!document.getElementById('badge-reading'),
        };
      });
      assert.deepEqual(errors, [], name);
      assert.deepEqual(failedAssets, [], name);
      assert.equal(geometry.scroll, geometry.width, `${name}: no horizontal overflow`);
      if (geometry.pageOverflow) {
        console.log(name, geometry, await page.evaluate(() => {
          const root = document.querySelector('#mainContent .page').getBoundingClientRect();
          return [...document.querySelectorAll('#mainContent .page *')].filter(el => el.scrollWidth > el.clientWidth + 1).map(el => ({ tag: el.tagName, class: el.className, width: el.getBoundingClientRect().width, right: el.getBoundingClientRect().right, scroll: el.scrollWidth, client: el.clientWidth }));
        }));
        await page.screenshot({ path: path.join(output, `${name}-overflow.png`), fullPage: true });
      }
      assert.equal(geometry.pageOverflow, false, `${name}: feature root fits`);
      assert.ok(geometry.assets && geometry.fonts, `${name}: assets and local fonts loaded`);
      assert.equal(geometry.navs, 0, `${name}: no duplicate chrome`);
      assert.ok(geometry.badges, `${name}: shell badge contracts preserved`);
      if (width < 768) assert.equal(geometry.mobileNav, 'fixed', `${name}: existing bottom navigation retained`);
      if (reduced) {
        assert.ok(geometry.background.startsWith('rgb('), `${name}: opaque fallback`);
        assert.equal(geometry.blur, 'none', `${name}: no fallback blur`);
      }
      assert.deepEqual(await page.evaluate(checkContrast), [], `${name}: all visible feature text >=4.5:1`);
      assert.doesNotMatch(await page.locator('#mainContent').innerHTML(), /NaN|Infinity|undefined/);
      if (unit === 'statistics' && !empty) {
        const bars = await page.locator('.monthly-chart').evaluateAll(charts => charts.map(chart => [...chart.querySelectorAll('.chart-bar')].map(bar => ({ value: parseFloat(bar.style.height), height: bar.getBoundingClientRect().height }))));
        assert.equal(bars.length, 2);
        for (const chart of bars) {
          assert.equal(chart.length, 12);
          assert.ok(chart.some(bar => bar.value === 100));
          const full = chart.find(bar => bar.value === 100);
          for (const bar of chart) assert.ok(Math.abs(bar.height / full.height * 100 - bar.value) < 1, `${name}: percentage-height geometry`);
        }
        if (missing) assert.ok(await page.getByText(/missing a finish date/).count());
      }
      if (unit === 'goals') {
        if (width > 768) assert.equal(geometry.cardWidths[0], 480, 'Figma 480px goal card width');
        const progress = Number(await page.locator('.goal-completion').getAttribute('aria-valuenow'));
        assert.ok(progress >= 0 && progress <= 100);
        if (zero) assert.equal(progress, 0);
      }
      await page.screenshot({ path: path.join(output, `${name}.png`), fullPage: true });

      if (state === 'desktop-dark' || state === 'mobile-dark') {
        if (unit === 'goals') {
          await page.locator('[data-goal-preset="52"]').click();
          assert.equal(await page.locator('#yearlyGoalInput').inputValue(), '52');
          assert.equal(await page.locator('[data-goal-preset="52"]').getAttribute('aria-pressed'), 'true');
          await page.getByLabel('Increase goal').click();
          assert.equal(await page.locator('#yearlyGoalInput').inputValue(), '53');
          await page.getByRole('button', { name: 'Save Goal' }).click();
          assert.deepEqual((await page.evaluate(() => window.fixtureCalls))[0], ['save', { yearly: 53, year: 2026 }]);
          await page.locator('#yearlyGoalInput').fill('366');
          await page.getByRole('button', { name: 'Save Goal' }).click();
          assert.equal((await page.evaluate(() => window.fixtureCalls.filter(call => call[0] === 'save'))).length, 1);
        }
        if (unit === 'activity') {
          await page.locator('.activity-filter-menu summary').click();
          assert.deepEqual(await page.evaluate(checkContrast), [], `${name}: open filter menu AA contrast`);
          await page.locator('[data-filter="notes"]').click();
          assert.equal(await page.locator('.activity-row').count(), 1);
          await page.locator('.activity-filter-menu summary').click();
          await page.locator('[data-filter="all"]').click();
          await page.locator('#activityBookFilter').selectOption('book-1');
          assert.equal(await page.locator('.activity-row').count(), 2);
          await page.locator('#activitySort').selectOption('oldest');
          assert.match(await page.locator('.activity-history').innerText(), /Metadata refreshed[\s\S]*Finished book/);
          await page.evaluate(() => window.fixtureRender());
          assert.equal(await page.locator('#activityBookFilter').inputValue(), 'book-1');
          assert.equal(await page.locator('#activitySort').inputValue(), 'oldest');
        }
        if (unit === 'statistics') {
          await page.locator('.stats-more-ratings').first().evaluate(details => { details.open = true; });
          assert.equal(await page.locator('.stats-recap .rated-book-row:visible').count(), 5);
          await page.locator('.stats-more-ratings').first().evaluate(details => { details.open = false; });
          await page.locator('.chart-bar-wrap').nth(11).hover();
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width, `${name}: last-bar tooltip fits`);
          await page.locator('#recapYearSelect').selectOption('2026');
          assert.equal(await page.evaluate(() => sessionStorage.getItem('libriq_stats_recap_year')), '2026');
        }
      }
      if (empty && (unit === 'statistics' || unit === 'activity')) {
        await page.locator('[data-action="open-library"]').click();
        await page.locator('[data-action="open-search"]').click();
        assert.deepEqual(await page.evaluate(() => window.fixtureCalls), [['navigate', 'library'], ['search']]);
      }
      console.log(`${name}: passed (geometry, assets, contrast, fallbacks${state.endsWith('dark') ? ', interactions' : ''})`);
      await context.close();
    }
  }
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
