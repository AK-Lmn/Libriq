import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const frontendRoot = path.join(repoRoot, 'frontend');
const screenshotsDir = path.join(repoRoot, 'docs', 'screenshots');

const SAMPLE_BOOKS = [
  {
    id: 'manual_seed_1',
    title: 'The Atlas of Quiet Things',
    author: 'Mara Ellison',
    coverUrl: null,
    isbn: null,
    pageCount: 384,
    publishYear: 2023,
    publisher: 'Northwind Press',
    description: 'A reflective guide to small rituals, memory, and the way ordinary places shape a reading life.',
    genres: ['Literary Fiction', 'Essays'],
    language: 'English',
    status: 'reading',
    dateAdded: '2026-06-10T08:00:00.000Z',
    dateStarted: '2026-06-12T08:00:00.000Z',
    dateFinished: null,
    currentPage: 154,
    rating: null,
    review: null,
    isFavorite: true,
    tags: ['screenshot', 'feature'],
    notes: 'A calm book for long-form reading.',
    notesUpdatedAt: '2026-06-20T08:00:00.000Z',
    source: 'manual',
    googleBooksId: null,
    openLibraryId: null,
  },
  {
    id: 'seed-1',
    title: 'The Name of the Wind',
    author: 'Patrick Rothfuss',
    coverUrl: 'https://covers.openlibrary.org/b/id/8352507-L.jpg',
    isbn: '9780756404741',
    pageCount: 662,
    publishYear: 2007,
    publisher: 'DAW Books',
    description: 'A gifted young musician recounts his beginnings, losses, and the winding road toward becoming a legend.',
    genres: ['Fantasy', 'Adventure'],
    language: 'English',
    status: 'finished',
    dateAdded: '2026-05-01T08:00:00.000Z',
    dateStarted: '2026-05-02T08:00:00.000Z',
    dateFinished: '2026-05-28T08:00:00.000Z',
    currentPage: 662,
    rating: 5,
    review: null,
    isFavorite: true,
    tags: ['favorites', 'series'],
    notes: 'Still one of the most striking fantasy reads.',
    notesUpdatedAt: '2026-06-01T08:00:00.000Z',
    source: 'merged',
    googleBooksId: 'gb_seed_1',
    openLibraryId: 'OL8352507M',
  },
  {
    id: 'api_seed_2',
    title: 'Thinking, Fast and Slow',
    author: 'Daniel Kahneman',
    coverUrl: 'https://covers.openlibrary.org/b/id/8303994-L.jpg',
    isbn: '9780374533557',
    pageCount: 499,
    publishYear: 2011,
    publisher: 'Farrar, Straus and Giroux',
    description: 'A wide-ranging look at how the mind uses fast and slow thinking to navigate decisions and uncertainty.',
    genres: ['Psychology', 'Non-Fiction'],
    language: 'English',
    status: 'reading',
    dateAdded: '2026-06-04T08:00:00.000Z',
    dateStarted: '2026-06-08T08:00:00.000Z',
    dateFinished: null,
    currentPage: 234,
    rating: null,
    review: null,
    isFavorite: false,
    tags: ['non-fiction', 'psychology'],
    notes: '',
    notesUpdatedAt: null,
    source: 'openlibrary',
    googleBooksId: null,
    openLibraryId: 'OL8303994M',
  },
  {
    id: 'api_seed_3',
    title: 'Dune',
    author: 'Frank Herbert',
    coverUrl: 'https://covers.openlibrary.org/b/id/8231432-L.jpg',
    isbn: '9780441172719',
    pageCount: 688,
    publishYear: 1965,
    publisher: 'Chilton Books',
    description: 'A sweeping science fiction classic about ecology, power, prophecy, and survival on a desert planet.',
    genres: ['Science Fiction'],
    language: 'English',
    status: 'wishlist',
    dateAdded: '2026-06-18T08:00:00.000Z',
    dateStarted: null,
    dateFinished: null,
    currentPage: 0,
    rating: null,
    review: null,
    isFavorite: false,
    tags: ['sci-fi', 'classics'],
    notes: '',
    notesUpdatedAt: null,
    source: 'google',
    googleBooksId: 'gb_seed_3',
    openLibraryId: 'OL8231432M',
  },
];

const SAMPLE_PROFILE = {
  name: 'Reader',
  theme: 'dark',
  bio: 'Local-first reader and screenshot seed profile.',
};

const SAMPLE_GOALS = { yearly: 24, year: 2026 };
const SAMPLE_STREAK = { current: 9, longest: 14, lastRead: '2026-06-30T08:00:00.000Z' };

async function main() {
  await fs.mkdir(screenshotsDir, { recursive: true });
  const server = await startServer();
  const browser = await chromium.launch({ headless: true });

  try {
    await captureDesktop(browser, server.url);
    await captureMobile(browser, server.url);
    console.log(`Screenshots saved to ${path.relative(repoRoot, screenshotsDir)}`);
  } finally {
    await browser.close();
    await shutdownServer(server.server);
  }
}

function startServer() {
  const server = http.createServer(async (req, res) => {
    try {
      const urlPath = new URL(req.url, `http://${req.headers.host}`).pathname;
      const filePath = urlPath === '/' ? path.join(frontendRoot, 'index.html') : path.join(frontendRoot, urlPath);
      const normalized = path.normalize(filePath);
      if (!normalized.startsWith(frontendRoot)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }

      const stat = await fs.stat(normalized);
      if (stat.isDirectory()) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }

      const ext = path.extname(normalized).toLowerCase();
      const contentType = {
        '.html': 'text/html; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.js': 'text/javascript; charset=utf-8',
        '.svg': 'image/svg+xml',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.webp': 'image/webp',
        '.ico': 'image/x-icon',
      }[ext] || 'application/octet-stream';

      res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-store' });
      fs.readFile(normalized).then(data => res.end(data));
    } catch (err) {
      res.writeHead(404);
      res.end('Not found');
    }
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 4173;
      resolve({ server, url: `http://127.0.0.1:${port}` });
    });
  });
}

async function shutdownServer(server) {
  if (!server) return;

  if (typeof server.close === 'function') {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    return;
  }

  if (typeof server.stop === 'function') {
    await server.stop();
  }
}

async function seedContext(context) {
  const seed = {
    libriq_installed: '2026-07-02T00:00:00.000Z',
    libriq_books: SAMPLE_BOOKS,
    libriq_profile: SAMPLE_PROFILE,
    libriq_goals: SAMPLE_GOALS,
    libriq_streak: SAMPLE_STREAK,
  };

  await context.addInitScript((payload) => {
    for (const [key, value] of Object.entries(payload)) {
      localStorage.setItem(key, JSON.stringify(value));
    }
    localStorage.setItem('libriq_seen_version', '2.9.0');
  }, seed);
}

async function preparePage(browser, viewport, baseUrl, isMobile = false) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    colorScheme: 'dark',
    locale: 'en-US',
  });
  await seedContext(context);
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    document.documentElement.setAttribute('data-theme', 'dark');
  });
  return { context, page, isMobile };
}

async function captureDesktop(browser, baseUrl) {
  const { context, page } = await preparePage(browser, { width: 1440, height: 900 }, baseUrl);
  try {
    await page.screenshot({ path: path.join(screenshotsDir, 'dashboard-desktop.png'), fullPage: true });

    await page.getByRole('button', { name: 'My Library' }).click();
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: path.join(screenshotsDir, 'library-desktop.png'), fullPage: true });

    await page.getByRole('button', { name: 'Search books' }).click();
    await page.waitForSelector('#searchModal:not([hidden])');
    await page.fill('#searchInput', 'dune');
    await page.waitForFunction(() => {
      const items = document.querySelectorAll('#searchResults .search-result-item');
      const spinner = document.querySelector('#searchSpinner');
      return items.length > 0 && (!spinner || spinner.offsetParent === null);
    });
    await page.waitForSelector('#searchResults .search-result-item');
    await page.screenshot({ path: path.join(screenshotsDir, 'search-modal-desktop.png'), fullPage: true });
    await page.keyboard.press('Escape');

    await page.getByText('The Name of the Wind').first().click();
    await page.waitForSelector('#bookDetailsModal:not([hidden])');
    await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(screenshotsDir, 'book-details-desktop.png'), fullPage: true });
    await page.locator('#bookDetailsModal .modal-close').click();

    await page.evaluate(() => Navigation.goTo('help'));
    await page.waitForFunction(() => {
      const title = document.querySelector('#helpPage .page-title');
      const intro = document.querySelector('#helpPage .help-intro-card');
      return title?.textContent?.trim() === 'Help & Guide Center' && !!intro;
    });
    await page.screenshot({ path: path.join(screenshotsDir, 'help-guide-desktop.png'), fullPage: true });

    await page.evaluate(() => Navigation.goTo('settings'));
    await page.waitForFunction(() => {
      const titles = Array.from(document.querySelectorAll('#mainContent .page-title'));
      return titles.some(el => el.textContent?.trim() === 'Settings');
    });
    await page.getByText('Export library', { exact: true }).waitFor();
    await page.getByText('Import library', { exact: true }).waitFor();
    await page.screenshot({ path: path.join(screenshotsDir, 'settings-backup-desktop.png'), fullPage: true });
  } finally {
    await context.close();
  }
}

async function captureMobile(browser, baseUrl) {
  const { context, page } = await preparePage(browser, { width: 390, height: 844 }, baseUrl, true);
  try {
    await page.screenshot({ path: path.join(screenshotsDir, 'dashboard-mobile.png'), fullPage: true });

    await page.evaluate(() => {
      document.getElementById('sidebar')?.classList.remove('open');
      document.getElementById('sidebarOverlay')?.classList.remove('visible');
      document.body.style.overflow = '';
    });
    await page.evaluate(() => Navigation.goTo('library'));
    await page.waitForFunction(() => {
      const title = document.querySelector('#libraryPage .page-title');
      const grid = document.getElementById('libraryGrid');
      return title?.textContent?.trim() === 'My Library' && grid && grid.children.length > 0;
    });
    await page.waitForSelector('#libraryPage .page-title');
    await page.waitForSelector('#libraryGrid .book-card');
    await page.screenshot({ path: path.join(screenshotsDir, 'library-mobile.png'), fullPage: true });

    await page.evaluate(() => Navigation.goTo('help'));
    await page.waitForFunction(() => {
      const title = document.querySelector('#helpPage .page-title');
      const intro = document.querySelector('#helpPage .help-intro-card');
      const sidebar = document.getElementById('sidebar');
      const overlay = document.getElementById('sidebarOverlay');
      return title?.textContent?.trim() === 'Help & Guide Center'
        && !!intro
        && !sidebar?.classList.contains('open')
        && !overlay?.classList.contains('visible');
    });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(screenshotsDir, 'help-guide-mobile.png') });
  } finally {
    await context.close();
  }
}

await main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
