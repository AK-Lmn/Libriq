import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { startE2EServer, waitForServer, stopE2EServer, closePlaywright } from './e2e-test-utils.mjs';

const testName = 'api-browser-smoke';
const port = 4174;
const baseUrl = `http://127.0.0.1:${port}`;
const { version: appVersion } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const server = startE2EServer({ port, testName });
let browser;
let context;

try {
  await waitForServer(baseUrl, { testName });
  browser = await chromium.launch({ headless: true });
  context = await browser.newContext();
  await context.addInitScript((version) => {
    localStorage.setItem('libriq_seen_version', version);
    window.__libriqAppReadyCount = 0;
    window.addEventListener('libriq:app-ready', () => {
      window.__libriqAppReadyCount += 1;
    });
  }, appVersion);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.route('https://openlibrary.org/**', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ docs: [], works: [] }),
  }));
  await page.route('https://openlibrary.org/subjects/**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      works: [{
        key: '/works/OLSMOKEW', title: 'Subject Smoke Book',
        authors: [{ name: 'Subject Author' }], subject: ['Fiction'], cover_id: 123,
      }],
    }),
  }));
  await page.route('https://gutendex.com/books**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      results: [{
        id: 321, title: 'Classic Smoke Book', authors: [{ name: 'Classic Author' }],
        languages: ['en'], bookshelves: ['Classics'],
        summaries: ['A sufficiently detailed English summary for this controlled classic book.'],
        formats: { 'text/html': 'https://www.gutenberg.org/ebooks/321.html.images' },
      }],
    }),
  }));
  await page.route('https://www.googleapis.com/books/v1/volumes**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      items: [{
        id: 'smoke-google-id',
        volumeInfo: {
          title: 'Smoke Test Book', authors: ['LibriQ Tester'], publishedDate: '2026',
          description: 'A sufficiently detailed English description for the browser smoke test result.',
          industryIdentifiers: [{ type: 'ISBN_13', identifier: '9781234567890' }],
        },
      }],
    }),
  }));
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.Navigation && window.LibriqNavigation));
  assert.equal(await page.evaluate(() => window.__libriqAppReadyCount), 1);
  assert.equal(await page.evaluate(() => window.__LIBRIQ_APP_READY__), true);
  assert.equal(await page.evaluate(() => window.LIBRIQ), undefined);
  assert.equal(await page.evaluate(() => typeof window.Utils?.sanitize), 'function');
  assert.equal(await page.evaluate(() => typeof window.LibriqStorage?.bootstrap), 'function');
  assert.equal(await page.evaluate(() => window.createBook), undefined);
  assert.equal(await page.evaluate(() => window.createProfile), undefined);
  assert.equal(await page.evaluate(() => window.SEED_BOOKS), undefined);
  assert.equal(await page.evaluate(() => typeof window.LibriqSyncBeta?.getState === 'function'), true);
  assert.equal(await page.evaluate(() => window.BookAPI), undefined);
  assert.equal(await page.evaluate(() => window.Dashboard), undefined);
  assert.equal(await page.evaluate(() => window.Navigation === window.LibriqNavigation), true);
  const utilitySecurity = await page.evaluate(() => {
    window.__utilsXssExecutions = 0;
    window.alert = () => { window.__utilsXssExecutions += 1; };

    const unsafeCover = document.createElement('div');
    unsafeCover.innerHTML = window.Utils.buildCover({
      title: '<script>window.__utilsXssExecutions += 1</script>',
      coverUrl: 'javascript:alert(1)',
    });
    document.body.appendChild(unsafeCover);

    const fallbackCover = document.createElement('div');
    fallbackCover.innerHTML = window.Utils.buildCover({
      title: `');window.__utilsXssExecutions += 1;//`,
      coverUrl: 'https://example.invalid/cover.jpg',
    });
    document.body.appendChild(fallbackCover);
    fallbackCover.querySelector('img')?.dispatchEvent(new Event('error'));

    window.Utils.toast('<img src=x onerror=alert(1)><script>alert(2)</script>', 'warning');
    const toast = document.querySelector('#toastContainer .toast:last-child');

    const stars = document.createElement('div');
    stars.innerHTML = window.Utils.buildStars(3, true, `book');window.__utilsXssExecutions += 1;//`);
    document.body.appendChild(stars);
    stars.querySelector('.star')?.click();

    return {
      executions: window.__utilsXssExecutions,
      unsafeImageCount: unsafeCover.querySelectorAll('img').length,
      fallbackHasPlaceholder: Boolean(fallbackCover.querySelector('.book-cover-placeholder')),
      toastImageCount: toast?.querySelectorAll('img').length || 0,
      toastScriptCount: toast?.querySelectorAll('script').length || 0,
    };
  });
  assert.deepEqual(utilitySecurity, {
    executions: 0,
    unsafeImageCount: 0,
    fallbackHasPlaceholder: true,
    toastImageCount: 0,
    toastScriptCount: 0,
  });
  for (const route of ['dashboard', 'library', 'reading', 'wishlist', 'finished', 'favorites', 'activity', 'stats', 'goals', 'help', 'profile', 'settings']) {
    await page.evaluate(pageName => Navigation.goTo(pageName), route);
    await page.waitForFunction(pageName => Navigation.currentPage === pageName && Boolean(document.querySelector('#mainContent .page')), route);
  }
  const initialTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  await page.evaluate(() => Navigation.toggleTheme());
  assert.notEqual(await page.evaluate(() => document.documentElement.getAttribute('data-theme')), initialTheme);
  await page.evaluate(() => document.getElementById('mobileMenuBtn')?.click());
  assert.equal(await page.locator('#sidebar').evaluate(node => node.classList.contains('open')), true);
  await page.evaluate(() => document.getElementById('sidebarOverlay')?.click());
  assert.equal(await page.locator('#sidebar').evaluate(node => node.classList.contains('open')), false);
  await page.evaluate(() => Navigation.goTo('dashboard'));
  await page.waitForSelector('.dashboard-page');
  await page.waitForSelector('.dashboard-hero-card-empty');
  await page.evaluate(() => document.querySelector('.dashboard-add-book')?.click());
  await page.waitForFunction(() => !document.querySelector('#searchModal')?.hasAttribute('hidden'));
  await page.evaluate(() => Search.close());
  await page.evaluate(() => Search.openManualEntry());
  await page.waitForFunction(() => !document.querySelector('#addBookModal')?.hasAttribute('hidden'));
  await page.evaluate(() => Library.closeAddModal());
  await page.evaluate(() => Search.open());
  await page.fill('#searchInput', 'smoke test');
  await page.waitForSelector('.search-result-item');
  assert.equal(await page.locator('.search-result-title').first().textContent(), 'Smoke Test Book');
  await page.locator('[data-add-book]').first().click();
  await page.waitForFunction(() => !document.querySelector('#addBookModal')?.hasAttribute('hidden'));
  await page.locator('#addBookForm').evaluate(form => form.requestSubmit());
  await page.waitForFunction(() => window.LibriqStorage.getBooks().some(book => book.title === 'Smoke Test Book'));
  await page.evaluate(() => {
    const book = window.LibriqStorage.getBooks().find(candidate => candidate.title === 'Smoke Test Book');
    Library.setStatus(book.id, 'reading');
    Navigation.goTo('dashboard');
  });
  await page.waitForSelector('.dashboard-hero-card:not(.dashboard-hero-card-empty)');
  await page.evaluate(() => document.querySelector('.dashboard-hero-actions .btn-primary')?.click());
  await page.waitForFunction(() => !document.querySelector('#addBookModal')?.hasAttribute('hidden'));
  await page.evaluate(() => Library.closeAddModal());
  assert.equal(await page.evaluate(() => {
    const book = window.LibriqStorage.getBooks().find(candidate => candidate.title === 'Smoke Test Book');
    Library.toggleFavorite(book.id);
    return window.LibriqStorage.getBookById(book.id).isFavorite;
  }), true);
  await page.evaluate(() => document.querySelector('.dashboard-recent-card')?.click());
  await page.waitForFunction(() => !document.querySelector('#bookDetailsModal')?.hasAttribute('hidden'));
  await page.evaluate(() => Library.closeDetailsModal());
  await page.evaluate(() => Navigation.goTo('library'));
  await page.waitForSelector('.book-card');
  assert.equal(await page.locator('.book-card-title').first().textContent(), 'Smoke Test Book');
  await page.locator('.book-card').first().click({ force: true });
  await page.waitForFunction(() => !document.querySelector('#bookDetailsModal')?.hasAttribute('hidden'));
  await page.evaluate(() => Library.closeDetailsModal());
  await page.evaluate(() => Navigation.goTo('recommendations'));
  await page.waitForSelector('.recommendations-page');
  assert.ok(await page.locator('.recommendation-card-grid').count() > 0);
  await page.waitForSelector('[data-subject-key] .recommendation-card');
  await page.waitForSelector('[data-gutendex-rail] .recommendation-card');
  await page.evaluate(() => Navigation.goTo('profile'));
  await page.waitForSelector('#profilePage');
  await page.evaluate(() => Navigation.goTo('settings'));
  await page.waitForSelector('#settingsPage');
  await page.goto(`${baseUrl}/?libriq_e2e_test_mode=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.LibriqFirebase?.isTestMode?.() && window.__LIBRIQ_APP_READY__);
  const authSmoke = await page.evaluate(async () => {
    const google = await window.LibriqFirebase.signInWithGoogle();
    await window.LibriqFirebase.sendVerificationEmailToCurrentUser();
    await window.LibriqFirebase.sendPasswordResetToEmail('smoke@example.com');
    await window.LibriqFirebase.requestEmailChange('smoke-updated@example.com');
    await window.LibriqFirebase.signOut();
    const email = await window.LibriqFirebase.signInWithEmail('email-smoke@example.com', 'test-password');
    await window.LibriqFirebase.signOut();
    const created = await window.LibriqFirebase.createAccountWithEmail('created-smoke@example.com', 'test-password');
    await window.LibriqFirebase.signOut();
    return {
      googleUid: google.user.uid,
      email: email.user.email,
      createdEmail: created.user.email,
      signedOut: window.LibriqFirebase.getState().signedOutConfirmed,
    };
  });
  assert.equal(authSmoke.googleUid, 'test-uid');
  assert.equal(authSmoke.email, 'email-smoke@example.com');
  assert.equal(authSmoke.createdEmail, 'created-smoke@example.com');
  assert.equal(authSmoke.signedOut, true);
  await page.waitForFunction(() => window.LibriqNavigation.currentPage === 'session');
  assert.deepEqual(errors.filter(error => /ReferenceError|module|Failed to load/i.test(error)), []);
  console.log('API browser smoke test passed');
} finally {
  await closePlaywright(browser, context ? [context] : [], { testName });
  await stopE2EServer(server, { testName });
}
