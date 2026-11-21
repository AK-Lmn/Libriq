// Goals polish: Save is a filled primary button (not a twin of the selected
// preset), the steppers are visible at a glance, the ring is readable, and
// the pace row reads "Pace: Behind" instead of "On track: Behind".
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startE2EServer, waitForServer, waitForAppReady, stopE2EServer, closePlaywright } from './e2e-test-utils.mjs';

const testName = 'goals-polish-browser';
let baseUrl;
const server = startE2EServer({ testName });

let browser;
try {
  baseUrl = await waitForServer(server, { testName });
  browser = await chromium.launch({ headless: true });
  for (const theme of ['dark', 'light']) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${baseUrl}/?libriq_e2e_test_mode=1`, { waitUntil: 'domcontentloaded' });
    await waitForAppReady(page, { testName });
    await page.evaluate(t => {
      window.LibriqE2E.seedAuth('goals', 'goals@example.test', 'Goals');
      window.LibriqE2E.enableAccountMode();
      window.LibriqSyncBeta.setEnabled(false);
      document.documentElement.dataset.theme = t;
      window.LibriqNavigation.goTo('goals');
    }, theme);
    await page.waitForSelector('#goalsForm');

    const m = await page.evaluate(() => {
      const css = el => getComputedStyle(el);
      const save = document.querySelector('#goalsForm button[type="submit"]');
      const pressed = document.querySelector('[data-goal-preset][aria-pressed="true"]');
      const indigo = getComputedStyle(document.documentElement).getPropertyValue('--indigo').trim();
      const probe = document.createElement('span');
      probe.style.color = indigo; document.body.append(probe);
      const indigoRgb = css(probe).color; probe.remove();
      const stepperIcon = document.querySelector('.goal-stepper img').getBoundingClientRect();
      const ring = document.querySelector('.goal-completion').getBoundingClientRect();
      const rows = [...document.querySelectorAll('#goalsPage .activity-item')].map(r => r.textContent.replace(/\s+/g, ' ').trim());
      return {
        saveBg: css(save).backgroundColor, saveText: save.textContent.trim(), pressedBg: css(pressed).backgroundColor, indigoRgb,
        stepperIcon: Math.round(stepperIcon.width), ring: Math.round(ring.width), rows,
      };
    });
    assert.equal(m.saveBg, m.indigoRgb, `${theme}: Save is filled with the primary colour`);
    assert.notEqual(m.saveBg, m.pressedBg, `${theme}: Save no longer matches the selected preset`);
    assert.ok(m.stepperIcon >= 20, `${theme}: stepper icons are ${m.stepperIcon}px`);
    assert.ok(m.ring >= 64, `${theme}: progress ring is ${m.ring}px`);
    assert.ok(m.rows.some(r => /^Pace (On track|Behind)$/.test(r)), JSON.stringify(m.rows));
    assert.ok(!m.rows.some(r => /^On track/.test(r)), 'old label gone');

    await page.screenshot({ path: `artifacts/ux/goals-after-${theme}.png`, fullPage: true });
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log('Goals polish browser test passed');
} finally {
  await closePlaywright(browser, [], { testName });
  await stopE2EServer(server, { testName });
}
