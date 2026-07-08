import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const port = Number(process.env.LIBRIQ_E2E_PORT || 4173);
const baseUrl = `http://127.0.0.1:${port}/?libriq_e2e_test_mode=1`;

function startServer() {
  const child = spawn(process.execPath, ['scripts/e2e-server.mjs'], { stdio: 'inherit', env: { ...process.env, LIBRIQ_E2E_PORT: String(port) } });
  return child;
}

async function setupPage(context, uid, email) {
  const page = await context.newPage();
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await delay(2000);
  await page.evaluate(({ uid, email }) => {
    window.LibriqE2E.seedAuth(uid, email, uid);
    window.LibriqE2E.enableAccountMode();
    window.dispatchEvent(new CustomEvent('libriq:auth-changed', { detail: window.LibriqFirebase.getState() }));
  }, { uid, email });
  await delay(2000);
  return page;
}

async function main() {
  const server = startServer();
  try {
    await delay(1500);
    await fetch(`http://127.0.0.1:${port}/__libriq_test_api/reset`, { method: 'POST' });
    const browser = await chromium.launch({ headless: true });
    const uid = 'goals-user';
    const email = 'goals@example.com';

    const context = await browser.newContext();
    const page = await setupPage(context, uid, email);

    await page.evaluate(() => {
      window.LibriqStorage.saveGoals({ yearly: 24, year: 2026 });
      window.LibriqStorage.saveStreak({ current: 7, longest: 19, lastRead: '2026-07-01T00:00:00.000Z' });
    });
    await delay(3000);

    const goalsRemote = await fetch(`http://127.0.0.1:${port}/__libriq_test_api/doc?path=${encodeURIComponent('users/goals-user/goals/current')}`).then(res => res.json());
    const streakRemote = await fetch(`http://127.0.0.1:${port}/__libriq_test_api/doc?path=${encodeURIComponent('users/goals-user/streak/current')}`).then(res => res.json());

    assert.equal(goalsRemote.year, 2026);
    assert.equal(goalsRemote.yearly, 24);
    assert.equal(goalsRemote.target, 24);
    assert.ok(goalsRemote.createdAt);
    assert.ok(goalsRemote.updatedAt);
    assert.equal(streakRemote.currentStreak, 7);
    assert.equal(streakRemote.longestStreak, 19);
    assert.equal(streakRemote.lastReadDate, '2026-07-01T00:00:00.000Z');
    assert.ok(streakRemote.createdAt);
    assert.ok(streakRemote.updatedAt);

    await page.evaluate(() => {
      localStorage.removeItem('libriq:users:goals-user:libriq_goals');
      localStorage.removeItem('libriq:users:goals-user:libriq_streak');
      localStorage.removeItem('libriq_goals');
      localStorage.removeItem('libriq_streak');
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await delay(2000);
    await page.evaluate(({ uid, email }) => {
      window.LibriqE2E.seedAuth(uid, email, uid);
      window.LibriqE2E.enableAccountMode();
      window.dispatchEvent(new CustomEvent('libriq:auth-changed', { detail: window.LibriqFirebase.getState() }));
    }, { uid, email });
    await delay(3000);

    const localGoals = await page.evaluate(() => window.LibriqStorage.getGoals());
    const localStreak = await page.evaluate(() => window.LibriqStorage.getStreak());
    assert.equal(localGoals.yearly, 24);
    assert.equal(localGoals.year, 2026);
    assert.equal(localStreak.current, 7);
    assert.equal(localStreak.longest, 19);
    assert.equal(localStreak.lastRead, '2026-07-01T00:00:00.000Z');

    await context.setOffline(true);
    await page.evaluate(() => {
      window.dispatchEvent(new Event('offline'));
      window.LibriqStorage.saveGoals({ yearly: 30, year: 2026 });
      window.LibriqStorage.saveStreak({ current: 8, longest: 19, lastRead: '2026-07-02T00:00:00.000Z' });
    });
    await delay(1000);
    const pendingGoals = await page.evaluate(() => localStorage.getItem('libriq_pending_goals_sync'));
    const pendingStreak = await page.evaluate(() => localStorage.getItem('libriq_pending_streak_sync'));
    assert.ok(pendingGoals);
    assert.ok(pendingStreak);
    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await delay(3000);

    const goalsRemoteAfter = await fetch(`http://127.0.0.1:${port}/__libriq_test_api/doc?path=${encodeURIComponent('users/goals-user/goals/current')}`).then(res => res.json());
    const streakRemoteAfter = await fetch(`http://127.0.0.1:${port}/__libriq_test_api/doc?path=${encodeURIComponent('users/goals-user/streak/current')}`).then(res => res.json());
    assert.equal(goalsRemoteAfter.yearly, 30);
    assert.equal(streakRemoteAfter.currentStreak, 8);

    await page.close();
    await context.close();
    await browser.close();
    console.log('goals/streak sync test passed');
  } finally {
    server.kill('SIGTERM');
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
