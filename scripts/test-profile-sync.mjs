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

    const uid = 'profile-user';
    const email = 'profile@example.com';

    const contextA = await browser.newContext();
    const pageA = await setupPage(contextA, uid, email);

    await pageA.evaluate(() => {
      window.LibriqStorage.saveProfile({
        displayName: 'Profile Reader',
        bio: 'Testing cloud profile sync.',
        avatar: 'https://example.com/avatar.png',
      });
    });
    await delay(3000);

    const remote = await fetch(`http://127.0.0.1:${port}/__libriq_test_api/doc?path=${encodeURIComponent('users/profile-user/profile/current')}`).then(res => res.json());
    assert.equal(remote.displayName, 'Profile Reader');
    assert.equal(remote.bio, 'Testing cloud profile sync.');
    assert.equal(remote.avatar, 'https://example.com/avatar.png');
    assert.ok(remote.createdAt);
    assert.ok(remote.updatedAt);

    await pageA.evaluate(() => {
      localStorage.removeItem('libriq:users:profile-user:libriq_profile');
      localStorage.removeItem('libriq_profile');
    });
    await pageA.reload({ waitUntil: 'domcontentloaded' });
    await delay(2000);
    await pageA.evaluate(({ uid, email }) => {
      window.LibriqE2E.seedAuth(uid, email, uid);
      window.LibriqE2E.enableAccountMode();
      window.dispatchEvent(new CustomEvent('libriq:auth-changed', { detail: window.LibriqFirebase.getState() }));
    }, { uid, email });
    await delay(3000);

    const restored = await pageA.evaluate(() => window.LibriqStorage.getProfile());
    assert.equal(restored.displayName, 'Profile Reader');
    assert.equal(restored.bio, 'Testing cloud profile sync.');
    assert.equal(restored.avatar, 'https://example.com/avatar.png');

    await pageA.evaluate(() => {
      window.LibriqStorage.saveProfile({
        displayName: 'Offline Profile',
        bio: 'Queued offline.',
      });
    });
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
    await pageA.evaluate(() => window.dispatchEvent(new Event('online')));
    await delay(3000);

    const remoteAfterOffline = await fetch(`http://127.0.0.1:${port}/__libriq_test_api/doc?path=${encodeURIComponent('users/profile-user/profile/current')}`).then(res => res.json());
    assert.equal(remoteAfterOffline.displayName, 'Offline Profile');
    assert.equal(remoteAfterOffline.bio, 'Queued offline.');

    await pageA.close();
    await contextA.close();
    await browser.close();
    console.log('profile sync test passed');
  } finally {
    server.kill('SIGTERM');
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
