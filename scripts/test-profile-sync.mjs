import { setTimeout as delay } from 'node:timers/promises';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { closePlaywright, phase, pollUntil, startE2EServer, stopE2EServer, waitForAppReady, waitForServer } from './e2e-test-utils.mjs';

const port = Number(process.env.LIBRIQ_E2E_PORT || 4173);
const baseUrl = `http://127.0.0.1:${port}/?libriq_e2e_test_mode=1`;

const testName = 'profile-sync';

async function setupPage(context, uid, email) {
  const page = await context.newPage();
  phase(testName, 'page created; opening application');
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await waitForAppReady(page, { testName });
  phase(testName, 'application boot complete; establishing mock session');
  await page.evaluate(async ({ uid, email }) => {
    window.LibriqE2E.seedAuth(uid, email, uid);
    window.LibriqE2E.enableAccountMode();
    window.dispatchEvent(new CustomEvent('libriq:auth-changed', { detail: window.LibriqFirebase.getState() }));
    await window.LibriqFirebase.syncProfileFromCloud(uid);
  }, { uid, email });
  await page.waitForFunction(() => window.LibriqFirebase.getState().ready && Boolean(window.LibriqFirebase.getState().user), null, { timeout: 10000 });
  phase(testName, 'Firebase mock session ready');
  return page;
}

async function main() {
  phase(testName, 'test setup begins');
  const server = startE2EServer({ port, testName });
  let browser = null;
  const contexts = [];
  try {
    await waitForServer(`http://127.0.0.1:${port}`, { testName });
    phase(testName, 'local server ready');
    await fetch(`http://127.0.0.1:${port}/__libriq_test_api/reset`, { method: 'POST' });
    phase(testName, 'launching browser');
    browser = await chromium.launch({ headless: true });
    phase(testName, 'browser launched');

    const uid = 'profile-user';
    const email = 'profile@example.com';

    const contextA = await browser.newContext();
    contexts.push(contextA);
    phase(testName, 'fresh browser context created');
    const pageA = await setupPage(contextA, uid, email);

    phase(testName, 'writing local profile mutation');
    await pageA.evaluate(() => {
      window.LibriqStorage.saveProfile({
        displayName: 'Profile Reader',
        bio: 'Testing cloud profile sync.',
        avatar: 'https://example.com/avatar.png',
      });
    });
    const profileDocUrl = `http://127.0.0.1:${port}/__libriq_test_api/doc?path=${encodeURIComponent('users/profile-user/profile/current')}`;
    const remote = await pollUntil(async () => {
      const value = await fetch(profileDocUrl).then(res => res.json());
      return value?.displayName === 'Profile Reader' ? value : null;
    }, { testName, description: 'the profile write to reach the remote test store' });
    assert.equal(remote.displayName, 'Profile Reader');
    assert.equal(remote.bio, 'Testing cloud profile sync.');
    assert.equal(remote.avatar, 'https://example.com/avatar.png');
    assert.ok(remote.createdAt);
    assert.ok(remote.updatedAt);
    phase(testName, 'remote profile write observed');

    await pageA.evaluate(() => {
      localStorage.removeItem('libriq:users:profile-user:libriq_profile');
      localStorage.removeItem('libriq_profile');
    });
    await pageA.reload({ waitUntil: 'domcontentloaded' });
    await delay(2000);
    await pageA.evaluate(async ({ uid, email }) => {
      window.LibriqE2E.seedAuth(uid, email, uid);
      window.LibriqE2E.enableAccountMode();
      window.dispatchEvent(new CustomEvent('libriq:auth-changed', { detail: window.LibriqFirebase.getState() }));
      await window.LibriqFirebase.syncProfileFromCloud(uid);
    }, { uid, email });
    await delay(3000);

    const restored = await pageA.evaluate(() => window.LibriqStorage.getProfile());
    assert.equal(restored.displayName, 'Profile Reader');
    assert.equal(restored.bio, 'Testing cloud profile sync.');
    assert.equal(restored.avatar, 'https://example.com/avatar.png');
    phase(testName, 'profile restored after reload');

    await contextA.setOffline(true);
    await pageA.evaluate(() => {
      window.dispatchEvent(new Event('offline'));
      window.LibriqStorage.saveProfile({
        displayName: 'Offline Profile',
        bio: 'Queued offline.',
      });
    });
    await delay(1000);
    const pendingProfile = await pageA.evaluate(() => localStorage.getItem('libriq_pending_profile_sync'));
    assert.ok(pendingProfile);
    await contextA.setOffline(false);
    await pageA.evaluate(() => window.LibriqFirebase.syncProfileFromCloud());
    const reconnectState = await pageA.evaluate(() => ({
      pending: Boolean(localStorage.getItem('libriq_pending_profile_sync')),
      localDisplayName: window.LibriqStorage.getProfile()?.displayName || null,
    }));
    const reconnectRemote = await fetch(profileDocUrl).then(res => res.json());
    phase(testName, `reconnect sync returned (pending=${reconnectState.pending}, local=${reconnectState.localDisplayName || 'none'}, remote=${reconnectRemote?.displayName || 'none'})`);
    const remoteAfterOffline = await pollUntil(async () => {
      const value = await fetch(profileDocUrl).then(res => res.json());
      return value?.displayName === 'Offline Profile' ? value : null;
    }, { testName, description: 'the queued offline profile write to flush after reconnect' });
    assert.equal(remoteAfterOffline.displayName, 'Offline Profile');
    assert.equal(remoteAfterOffline.bio, 'Queued offline.');
    phase(testName, 'offline queue flushed and assertions complete');
    console.log('profile sync test passed');
  } finally {
    await closePlaywright(browser, contexts, { testName });
    await stopE2EServer(server, { testName });
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
