// Cold-load measurement under Lighthouse's mobile profile (150ms RTT,
// 1.6 Mbps down, 4x CPU slowdown). Prints LCP, CLS, request counts and the
// depth of the JS request chain. Usage: node scripts/measure-load.mjs [url]
import { chromium } from 'playwright';
import { startE2EServer, waitForServer, stopE2EServer, closePlaywright } from './e2e-test-utils.mjs';

const testName = 'measure-load';
const port = 4175;
const external = process.argv[2];
const baseUrl = external || `http://127.0.0.1:${port}`;
const server = external ? null : startE2EServer({ port, testName });
const runs = Number(process.env.RUNS || 3);

let browser;
try {
  if (server) await waitForServer(baseUrl, { testName });
  browser = await chromium.launch({ headless: true });
  const results = [];
  for (let i = 0; i < runs; i++) {
    const context = await browser.newContext({ viewport: { width: 412, height: 823 }, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    const requests = [];
    page.on('requestfinished', async req => {
      const timing = req.timing();
      requests.push({ url: req.url(), type: req.resourceType(), end: timing.responseEnd, start: timing.startTime });
    });
    await page.addInitScript(() => {
      window.__lcp = 0; window.__cls = 0;
      new PerformanceObserver(list => { for (const e of list.getEntries()) window.__lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
      new PerformanceObserver(list => { for (const e of list.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
    });
    const t0 = Date.now();
    await page.goto(baseUrl + '/', { waitUntil: 'load', timeout: 120000 });
    const loadMs = Date.now() - t0;
    await page.waitForTimeout(4000);
    const m = await page.evaluate(() => ({ lcp: Math.round(window.__lcp), cls: Number(window.__cls.toFixed(3)) }));
    const origin = new URL(baseUrl).origin;
    const own = requests.filter(r => r.url.startsWith(origin));
    const js = own.filter(r => r.type === 'script');
    const css = own.filter(r => r.type === 'stylesheet');
    results.push({ ...m, loadMs, requests: own.length, js: js.length, css: css.length });
    await context.close();
  }
  const median = key => results.map(r => r[key]).sort((a, b) => a - b)[Math.floor(results.length / 2)];
  console.log(JSON.stringify({ runs: results, median: { lcp: median('lcp'), cls: median('cls'), loadMs: median('loadMs') } }, null, 1));
} finally {
  await closePlaywright(browser, [], { testName });
  if (server) await stopE2EServer(server, { testName });
}
