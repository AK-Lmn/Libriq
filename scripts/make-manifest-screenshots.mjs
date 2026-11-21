// Captures the screenshots listed in manifest.json. Browsers show them in the
// richer install prompt: a wide one on desktop, a narrow one on phones.
// It uses a demo library of classic titles with the app's own placeholder
// covers, so no account data or publisher artwork ends up in them.
//
// Run: node scripts/make-manifest-screenshots.mjs
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { startE2EServer, waitForServer, waitForAppReady, stopE2EServer, closePlaywright } from './e2e-test-utils.mjs';

const testName = 'manifest-screenshots';
const port = 4175;
const baseUrl = `http://127.0.0.1:${port}`;
const outDir = path.join(process.cwd(), 'frontend', 'assets', 'screenshots');
const BOOKS = [
  { title: 'Middlemarch', author: 'George Eliot', status: 'reading', pageCount: 880, currentPage: 412, genre: 'Classics' },
  { title: 'Moby-Dick', author: 'Herman Melville', status: 'reading', pageCount: 635, currentPage: 120, genre: 'Adventure' },
  { title: 'Pride and Prejudice', author: 'Jane Austen', status: 'finished', pageCount: 432, currentPage: 432, rating: 5, genre: 'Classics' },
  { title: 'Frankenstein', author: 'Mary Shelley', status: 'finished', pageCount: 280, currentPage: 280, rating: 4, genre: 'Gothic' },
  { title: 'Jane Eyre', author: 'Charlotte Brontë', status: 'finished', pageCount: 532, currentPage: 532, rating: 5, genre: 'Classics' },
  { title: 'The Odyssey', author: 'Homer', status: 'wishlist', pageCount: 541, currentPage: 0, genre: 'Epic' },
  { title: 'Little Women', author: 'Louisa May Alcott', status: 'wishlist', pageCount: 759, currentPage: 0, genre: 'Classics' },
];

const server = startE2EServer({ port, testName });
let browser;
try {
  await waitForServer(baseUrl, { testName });
  await mkdir(outDir, { recursive: true });
  browser = await chromium.launch({ headless: true });
  for (const [name, width, height] of [['wide', 1280, 800], ['narrow', 412, 915]]) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    await page.goto(`${baseUrl}/?libriq_e2e_test_mode=1`, { waitUntil: 'domcontentloaded' });
    await waitForAppReady(page, { testName });
    await page.evaluate(books => {
      window.LibriqE2E.seedAuth('demo', 'reader@example.test', 'Ada');
      window.LibriqE2E.enableAccountMode();
      window.LibriqSyncBeta.setEnabled(false);
      localStorage.setItem('libriq_onboarding_dismissed', '1');
      document.documentElement.dataset.theme = 'dark';
      const added = books.map(book => window.LibriqE2E.addBook(book));
      // A little recent history, newest last, so Recent Activity isn't empty.
      const S = window.LibriqStorage;
      const hour = 3600 * 1000;
      [[added[3], 'book_finished', 30], [added[6], 'book_added', 20], [added[1], 'progress_updated', 3], [added[0], 'progress_updated', 1]]
        .forEach(([book, type, hoursAgo]) => {
          const event = S.buildActivityEvent(type, book);
          const when = new Date(Date.now() - hoursAgo * hour).toISOString();
          S.addActivityEvent({ ...event, timestamp: when, createdAt: when, updatedAt: when });
        });
      window.LibriqStorage.saveGoals({ ...window.LibriqStorage.getGoals(), yearly: 24 });
      window.LibriqNavigation.goTo('dashboard');
    }, BOOKS);
    await page.waitForSelector('#dashboardPage');
    // Hide one-off prompts (poll, install, onboarding) so the shot shows the app.
    await page.addStyleTag({ content: '.poll-card,[class*="poll"],.install-prompt,.onboarding-checklist,[class*="onboarding"],.toast-container{display:none!important}' });
    await page.waitForTimeout(800);
    const file = path.join(outDir, `dashboard-${name}.jpg`);
    await page.screenshot({ path: file, type: 'jpeg', quality: 85 });
    console.log(path.relative(process.cwd(), file));
    await page.close();
  }
} finally {
  await closePlaywright(browser, [], { testName });
  await stopE2EServer(server, { testName });
}
