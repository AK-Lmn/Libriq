const { chromium } = require('@playwright/test');
const http = require('http');
const handler = require('serve-handler');
const path = require('path');
const fs = require('fs');

const PORT = 3000;
const HOST = `http://localhost:${PORT}`;

// Sample data to inject into localStorage
const SAMPLE_DATA = {
  libriq_installed: new Date().toISOString(),
  libriq_profile: JSON.stringify({
    name: 'Reader',
    theme: 'dark',
    yearlyGoal: 12,
  }),
  libriq_streak: JSON.stringify({
    current: 12,
    longest: 15,
    lastRead: new Date().toISOString(),
  }),
  libriq_goals: JSON.stringify({
    yearly: 24,
    year: new Date().getFullYear(),
  }),
  libriq_books: JSON.stringify([
    {
      id: 'seed-1',
      title: 'The Name of the Wind',
      author: 'Patrick Rothfuss',
      coverUrl: 'https://covers.openlibrary.org/b/id/8352507-M.jpg',
      pageCount: 662,
      publishYear: 2007,
      genres: ['Fantasy', 'Adventure'],
      status: 'finished',
      currentPage: 662,
      rating: 5,
      review: 'An extraordinary piece of fantasy writing.',
      isFavorite: true,
      dateAdded: new Date(Date.now() - 90 * 86400000).toISOString(),
      dateStarted: new Date(Date.now() - 80 * 86400000).toISOString(),
      dateFinished: new Date(Date.now() - 60 * 86400000).toISOString(),
    },
    {
      id: 'seed-2',
      title: 'Thinking, Fast and Slow',
      author: 'Daniel Kahneman',
      coverUrl: 'https://covers.openlibrary.org/b/id/8303994-M.jpg',
      pageCount: 499,
      publishYear: 2011,
      genres: ['Psychology', 'Non-Fiction'],
      status: 'reading',
      currentPage: 234,
      rating: null,
      isFavorite: false,
      dateAdded: new Date(Date.now() - 30 * 86400000).toISOString(),
      dateStarted: new Date(Date.now() - 20 * 86400000).toISOString(),
    },
    {
      id: 'seed-3',
      title: 'Dune',
      author: 'Frank Herbert',
      coverUrl: 'https://covers.openlibrary.org/b/id/8231432-M.jpg',
      pageCount: 688,
      publishYear: 1965,
      genres: ['Science Fiction'],
      status: 'wishlist',
      currentPage: 0,
      rating: null,
      isFavorite: false,
      dateAdded: new Date(Date.now() - 10 * 86400000).toISOString(),
    }
  ])
};

async function setupServer() {
  return new Promise((resolve) => {
    const server = http.createServer((request, response) => {
      // Serve the frontend directory
      return handler(request, response, {
        public: path.join(__dirname, '../frontend')
      });
    });

    server.listen(PORT, () => {
      console.log(`Server running at ${HOST}`);
      resolve(server);
    });
  });
}

async function run() {
  console.log('Starting screenshot capture process...');
  const server = await setupServer();

  // Ensure output directory exists
  const outputDir = path.join(__dirname, '../docs/screenshots');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Setup Playwright
  const browser = await chromium.launch();

  // Desktop Setup
  const desktopContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2, // for high-res screenshots
  });

  // Inject data into the page before it loads
  await desktopContext.addInitScript((data) => {
    window.addEventListener('DOMContentLoaded', () => {
      // Clean up any existing data first
      localStorage.clear();
      // Inject sample data
      for (const [key, value] of Object.entries(data)) {
        localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
      }
    });
  }, SAMPLE_DATA);

  const page = await desktopContext.newPage();

  const waitOptions = { waitUntil: 'networkidle' };

  // 1. Dashboard Desktop
  console.log('Capturing Desktop Dashboard...');
  await page.goto(HOST, waitOptions);
  // Wait for some render time just to be sure animations/fonts settle
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(outputDir, 'desktop-dashboard.png') });

  // 2. Library Desktop
  console.log('Capturing Desktop Library...');
  await page.click('button[data-page="library"]');
  await page.waitForTimeout(1000); // wait for fade transition
  await page.screenshot({ path: path.join(outputDir, 'desktop-library.png') });

  // 3. Search Modal Desktop
  console.log('Capturing Desktop Search Modal...');
  await page.waitForSelector('#openSearch', { state: 'visible', timeout: 5000 });
  await page.click('#openSearch');
  await page.waitForTimeout(500); // wait for modal animation
  await page.waitForSelector('#searchInput', { state: 'visible', timeout: 5000 });
  await page.fill('#searchInput', 'Dune');
  await page.waitForTimeout(2000); // Wait for mock or real API if it were alive, or just the state
  await page.screenshot({ path: path.join(outputDir, 'desktop-search-modal.png') });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500); // wait for modal to close

  // 4. Book Details Desktop
  console.log('Capturing Desktop Book Details...');
  // Click the first book in the library view (should be The Name of the Wind based on our seed data)
  await page.waitForSelector('.book-card', { state: 'visible', timeout: 5000 });
  await page.click('.book-card');
  await page.waitForTimeout(500); // wait for modal animation
  await page.screenshot({ path: path.join(outputDir, 'desktop-book-details.png') });
  // Need to use the close button as Esc might be swallowed or modal remains
  await page.click('.book-details-modal .modal-close');
  await page.waitForTimeout(500);

  // 5. Settings / Import Export Backup area Desktop
  console.log('Capturing Desktop Settings...');
  await page.waitForSelector('button[data-page="settings"]', { state: 'visible', timeout: 5000 });
  await page.click('button[data-page="settings"]');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(outputDir, 'desktop-settings.png') });

  console.log('Desktop captures complete.');
  await desktopContext.close();

  // Mobile Setup
  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'
  });

  await mobileContext.addInitScript((data) => {
    window.addEventListener('DOMContentLoaded', () => {
      localStorage.clear();
      for (const [key, value] of Object.entries(data)) {
        localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
      }
    });
  }, SAMPLE_DATA);

  const mobilePage = await mobileContext.newPage();

  // 6. Dashboard Mobile
  console.log('Capturing Mobile Dashboard...');
  await mobilePage.goto(HOST, waitOptions);
  await mobilePage.waitForTimeout(1000);
  await mobilePage.screenshot({ path: path.join(outputDir, 'mobile-dashboard.png') });

  // 7. Library Mobile
  console.log('Capturing Mobile Library...');
  // Since it's mobile, we need to open the hamburger menu first to click library,
  // or simply execute the navigation script if available
  const hasMenuBtn = await mobilePage.$('#mobileMenuBtn');
  if (hasMenuBtn) {
    await mobilePage.click('#mobileMenuBtn');
    await mobilePage.waitForTimeout(500);
  }
  await mobilePage.waitForSelector('button[data-page="library"]', { state: 'visible', timeout: 5000 });
  await mobilePage.click('button[data-page="library"]');
  await mobilePage.waitForTimeout(1000); // wait for side menu to close and fade transition
  await mobilePage.screenshot({ path: path.join(outputDir, 'mobile-library.png') });

  console.log('Mobile captures complete.');

  await browser.close();
  server.close();
}

run().catch(console.error);
