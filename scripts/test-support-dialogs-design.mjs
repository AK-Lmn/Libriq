import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve('frontend');

export async function startSupportFixture() {
  const html = (await fs.readFile(path.join(root, 'index.html'), 'utf8'))
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '')
    .replace('</head>', '<link rel="stylesheet" href="css/features/support-dialogs.css"></head>');
  const server = http.createServer(async (req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    const file = path.resolve(root, `.${pathname}`);
    if (file !== root && !file.startsWith(`${root}${path.sep}`)) return res.writeHead(403).end();
    try {
      const content = pathname === '/' ? html : await fs.readFile(file);
      res.writeHead(200, { 'Content-Type': { '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png' }[path.extname(file)] || 'text/html' }).end(content);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise(resolve => server.close(resolve)) };
}

export async function initializeSupportPage(page) {
  await page.evaluate(async () => {
    // Read-only renderer: no app bootstrap, account fixtures, providers or storage.
    const ids = ['whatsNewModal', 'backupImportModal', 'dangerConfirmModal'];
    const modals = ids.map(id => document.getElementById(id));
    const app = document.createElement('div');
    app.id = 'app';
    const trigger = document.createElement('button');
    trigger.id = 'fixtureTrigger';
    trigger.textContent = 'Open supporting window';
    app.append(trigger);
    document.body.replaceChildren(app, ...modals);
    document.body.className = '';
    const { Utils } = await import('./js/utils.js');
    const { confirmAction, confirmTypedAction } = await import('./js/components/ui/confirmation.js');
    window.supportFixture = { Utils, confirmAction, confirmTypedAction };
  });
}

async function render(page, kind, theme, state) {
  await page.evaluate(({ kind, theme, state }) => {
    const { Utils, confirmAction, confirmTypedAction } = window.supportFixture;
    document.documentElement.dataset.theme = theme;
    document.getElementById('fixtureTrigger').focus();
    const long = state === 'long' ? ' with a deliberately long filename café 日本語 '.repeat(12) : '';
    if (kind === 'whats-new') {
      if (state === 'long') document.querySelectorAll('#whatsNewBody p').forEach(el => { el.textContent += long.repeat(2); });
      if (state === 'empty') document.getElementById('whatsNewBody').replaceChildren();
      Utils.show(document.getElementById('whatsNewModal'));
    } else if (['local-import', 'cloud-restore', 'cloud-merge', 'legacy-backup'].includes(kind)) {
      const cloud = kind.startsWith('cloud');
      const merge = kind === 'cloud-merge';
      const count = state === 'empty' ? 0 : 24;
      const title = cloud ? merge ? 'Review before merging' : 'Review before restoring' : 'Import Backup Preview';
      const subtitle = cloud ? merge
        ? "Merge adds safe cloud-only items without replacing local conflicts. Export a JSON copy first if you want a safety copy."
        : 'Cloud restore replaces the library on this device. Export a JSON copy first if you want a safety copy.'
        : 'Choose how to apply this backup to your local library.';
      document.getElementById('backupImportTitle').textContent = title;
      document.getElementById('backupImportSubtitle').textContent = subtitle;
      const summary = (label, counts, metadata = []) => `<section class="whats-new-item"><h3 class="whats-new-item-title">${label}</h3><dl class="backup-review-summary">${counts.map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join('')}</dl><dl class="backup-review-metadata">${metadata.map(([label, value]) => `<div><dt>${label}</dt><dd>${Utils.sanitize(value)}</dd></div>`).join('')}</dl></section>`;
      const cloudCounts = [['Books', count], ['Reading', count ? 8 : 0], ['Finished', count ? 12 : 0], ['Notes', count ? 10 : 0], ['Quotes', count ? 32 : 0], ['Activity', count ? 48 : 0]];
      const metadata = [['Last updated', 'Oct 12, 2026'], ['Backup version', '4.7.0'], ['App version', '4.7.0'], ['Schema', '1'], ['Device ID', `fixture-device${long}`]];
      const context = `<div class="backup-review-context"><span>${cloud ? 'Cloud backup' : 'Local JSON file'}</span><span>${Utils.sanitize(cloud ? 'This device' : `reading-backup.json${long}`)}</span></div>`;
      let sections = cloud
        ? summary('Local library', cloudCounts) + summary('Cloud backup', cloudCounts, metadata)
        : summary('Contents', [['Books in backup', count], ['Current local books', count ? 12 : 0], ['Backup activity events', count ? 48 : 0]]) + summary('Backup details', [], [['Exported', 'Oct 12, 2026'], ['Version', `4.7.0${long}`]]);
      sections += `<section class="whats-new-item"><h3 class="whats-new-item-title">${cloud ? merge ? 'Merge result preview' : 'Warning' : 'What happens next'}</h3><p>${cloud ? merge
        ? `New books to add from cloud: ${count}<br>Local books kept: 12<br>Duplicates skipped: 4<br>Possible conflicts: 2<br>Notes to add safely: 6<br>Quotes to add safely: 8<br>Items unchanged: 4<br>Some items looked different on this device and in your cloud backup. LibriQ kept this device's version for now.`
        : 'This cloud backup may be older than your current library.'
        : 'Replace swaps your local library with the backup. Merge keeps your current data and combines obvious duplicates safely.'}</p></section>`;
      if (kind === 'legacy-backup') sections = '<section class="whats-new-item"><div class="whats-new-item-title">Backup details</div><p>Exported: Oct 12, 2026<br>Version: 4.7.0</p></section><section class="whats-new-item"><div class="whats-new-item-title">Contents</div><p>24 books in backup<br>12 current local books<br>48 backup activity events</p></section><section class="whats-new-item"><div class="whats-new-item-title">What happens next</div><p>Replace swaps your local library with the backup. Merge keeps your current data and combines obvious duplicates safely.</p></section>';
      document.getElementById('backupImportBody').innerHTML = `${kind === 'legacy-backup' ? '' : context}<div class="whats-new-list">${sections}</div>`;
      document.getElementById('backupImportMerge').textContent = cloud ? merge ? 'Merge cloud with this device' : 'Export local JSON first' : 'Merge with current library';
      document.getElementById('backupImportReplace').textContent = cloud ? merge ? 'Export local JSON first' : 'Restore cloud backup' : 'Replace local library';
      Utils.show(document.getElementById('backupImportModal'));
    } else if (kind.startsWith('danger-')) {
      const variant = kind.slice(7);
      const expected = { cache: 'CLEAR CACHE', library: 'DELETE', account: 'DELETE ACCOUNT' }[variant];
      const body = { cache: "This will remove this device's local cache only. It will not delete your cloud library or account.", library: 'This permanently removes your books, notes, progress, activity, streak, and cloud backup for this account. This cannot be undone.', account: 'This permanently deletes your LibriQ account and all reading data connected to it. This cannot be undone.' }[variant];
      window.fixtureResult = confirmTypedAction({ title: { cache: 'Clear local cache?', library: 'Delete library data?', account: 'Delete account?' }[variant], body: body + long, expected, prompt: `Type ${expected} to continue`, actionLabel: { cache: 'Clear cache', library: 'Delete library data', account: 'Delete account' }[variant] });
      if (state === 'error') {
        const error = document.getElementById('dangerConfirmError');
        error.hidden = false;
        error.textContent = variant === 'account' ? 'For security, please sign in again before deleting your account.' : 'Something went wrong. Please try again.';
        document.getElementById('dangerConfirmInput').setAttribute('aria-invalid', 'true');
      }
    } else {
      const options = {
        remove: [`Remove "The Midnight Library${long}" from your library?`, { title: 'Remove book?', confirmLabel: 'Remove book' }],
        quote: ['Delete this private quote?', { title: 'Delete private quote?', confirmLabel: 'Delete quote' }],
        restore: ["Restoring will replace this device's current library with the cloud backup. Continue?", { title: 'Restore cloud backup?', confirmLabel: 'Continue' }],
        merge: ["Merge cloud with this device? LibriQ will add safe cloud-only items and keep this device's version for conflicts.", { title: 'Merge cloud backup?', confirmLabel: 'Continue', tone: 'default' }],
        'export-first': ['This cloud restore will overwrite your local library. Export first if you want a safety copy. Restore now?', { title: 'Review before restoring', confirmLabel: 'Restore now' }],
      }[kind];
      window.fixtureResult = confirmAction(...options);
    }
  }, { kind, theme, state });
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
}

async function inspect(page) {
  return page.evaluate(() => {
    const overlay = [...document.querySelectorAll('[role="dialog"]')].find(el => !el.hidden);
    const panel = overlay.firstElementChild;
    const visible = el => el.getClientRects().length && !el.closest('[hidden]');
    const parse = value => {
      const parts = value.match(/[\d.]+/g)?.map(Number) || [0, 0, 0, 0];
      if (value.startsWith('color(srgb ')) parts.splice(0, 3, ...parts.slice(0, 3).map(n => n * 255));
      return [...parts.slice(0, 3), parts[3] ?? 1];
    };
    const compose = (fg, bg) => [...fg.slice(0, 3).map((n, i) => n * fg[3] + bg[i] * (1 - fg[3])), 1];
    const background = el => {
      if (!el) return [255, 255, 255, 1];
      const style = getComputedStyle(el);
      let color = compose(parse(style.backgroundColor), background(el.parentElement));
      // The baseline's uniform token gradient sits over the opaque base.
      if (el === panel && style.backgroundImage.startsWith('linear-gradient')) color = compose(parse(style.getPropertyValue('--glass-fill-2')), color);
      return color;
    };
    const luminance = rgb => rgb.slice(0, 3).map(n => { n /= 255; return n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4; }).reduce((v, n, i) => v + n * [.2126, .7152, .0722][i], 0);
    const contrast = [];
    for (const el of panel.querySelectorAll('*')) {
      if (!visible(el) || el.matches(':disabled') || ![...el.childNodes].some(node => node.nodeType === 3 && node.textContent.trim()) && !el.matches('input')) continue;
      const style = getComputedStyle(el);
      const colors = [style.color];
      if (el.matches('input[placeholder]')) colors.push(getComputedStyle(el, '::placeholder').color);
      for (const color of colors) {
        const bg = background(el), a = luminance(compose(parse(color), bg)), b = luminance(bg);
        const ratio = (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
        const large = parseFloat(style.fontSize) >= 24 || parseFloat(style.fontSize) >= 18.66 && Number(style.fontWeight) >= 700;
        if (ratio < (large ? 3 : 4.5)) contrast.push(`${el.id || el.className}: ${ratio.toFixed(2)}`);
      }
    }
    const rect = panel.getBoundingClientRect();
    const actions = [...panel.querySelectorAll('button')].filter(visible).map(el => {
      const r = el.getBoundingClientRect();
      return { text: el.textContent || el.getAttribute('aria-label'), width: r.width, height: r.height, reachable: r.left >= 0 && r.right <= innerWidth + 1 && r.top >= rect.top && r.bottom <= rect.bottom + 1 };
    });
    return { contrast, actions, overflow: document.documentElement.scrollWidth > innerWidth || panel.scrollWidth > panel.clientWidth + 1,
      inside: rect.top >= 0 && rect.bottom <= innerHeight + 1, backdrop: getComputedStyle(panel).backdropFilter, background: getComputedStyle(panel).backgroundColor,
      animation: getComputedStyle(panel).animationName, icons: [...panel.querySelectorAll('i')].map(el => getComputedStyle(el).maskImage) };
  });
}

export async function runSupportDesignTests() {
  const css = await fs.readFile(path.join(root, 'css/features/support-dialogs.css'), 'utf8');
  assert.doesNotMatch(css, /var\(--gold|figma\.com|193,\s*156,\s*88/);
  assert.match(css, /prefers-reduced-transparency/);
  assert.match(css, /@supports not/);
  for (const match of css.matchAll(/url\(['"]?([^)'"\s]+)/g)) assert.ok((await fs.stat(path.resolve(root, 'css/features', match[1]))).size);
  const output = process.env.LIBRIQ_SUPPORT_ARTIFACTS;
  if (output) await fs.mkdir(output, { recursive: true });
  const server = await startSupportFixture();
  const browser = await chromium.launch({ headless: true });
  const report = [];
  const errors = [];
  const failed = [];
  const variants = [['desktop-dark', 1440, 900, 'dark', false, 'ready'], ['mobile-dark', 390, 844, 'dark', false, 'ready'], ['desktop-light', 1440, 900, 'light', false, 'ready'], ['mobile-light', 390, 844, 'light', false, 'ready'], ['desktop-solid', 1440, 900, 'dark', true, 'ready'], ['mobile-light-solid', 390, 844, 'light', true, 'ready'], ['narrow-empty', 320, 640, 'dark', true, 'empty'], ['narrow-long', 320, 640, 'light', false, 'long'], ['mobile-error', 390, 844, 'dark', false, 'error']];
  try {
    for (const [variant, width, height, theme, solid, state] of variants) {
      const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(error.message));
      page.on('response', response => { if (response.status() >= 400) failed.push(response.url()); });
      await context.route('**/*', route => new URL(route.request().url()).origin === server.url ? route.continue() : route.abort());
      if (solid) await (await context.newCDPSession(page)).send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }, { name: 'prefers-reduced-motion', value: 'reduce' }] });
      for (const kind of ['whats-new', 'local-import', 'cloud-restore', 'cloud-merge', 'legacy-backup', 'danger-cache', 'danger-library', 'danger-account', 'remove', 'quote', 'restore', 'merge', 'export-first']) {
        await page.goto(server.url);
        await initializeSupportPage(page);
        await render(page, kind, theme, state);
        const name = `${kind}-${variant}`;
        const result = await inspect(page);
        if (output) await page.screenshot({ path: path.join(output, `${name}.png`) });
        assert.deepEqual(result.contrast, [], `${name}: AA text and placeholder contrast`);
        assert.equal(result.overflow, false, `${name}: no horizontal overflow`);
        assert.equal(result.inside, true, `${name}: panel within viewport`);
        assert.ok(result.actions.every(action => action.width >= 43.5 && action.height >= 43.5 && action.reachable), `${name}: reachable touch targets ${JSON.stringify(result.actions)}`);
        assert.equal(result.animation, 'none', `${name}: reduced motion`);
        assert.ok(result.icons.every(mask => mask.includes('assets/revamp/')), `${name}: local icons`);
        if (solid) { assert.ok(['none', 'blur(0px)'].includes(result.backdrop), `${name}: no blur`); assert.ok(!result.background.startsWith('rgba'), `${name}: opaque panel`); }
        report.push({ name, ...result });
        if (kind.startsWith('danger-') || ['remove', 'quote', 'restore', 'merge', 'export-first'].includes(kind)) {
          await page.keyboard.press('Escape');
          assert.equal(await page.evaluate(() => window.fixtureResult), false, `${name}: safe cancellation`);
        }
      }
      await context.close();
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(failed, []);
    if (output) await fs.writeFile(path.join(output, 'support-dialogs-report.json'), JSON.stringify(report, null, 2));
    console.log(`Supporting dialog design checks passed (${report.length} renders; dark/light/solid, desktop/mobile/320px, long/empty/error).`);
  } finally { await browser.close(); await server.close(); }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) await runSupportDesignTests();
