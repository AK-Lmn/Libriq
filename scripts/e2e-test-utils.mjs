import { spawn } from 'node:child_process';

export function phase(testName, message) {
  console.log(`[${testName}] ${message}`);
}

export function startE2EServer({ port, testName }) {
  const child = spawn(process.execPath, ['scripts/e2e-server.mjs'], {
    stdio: 'inherit',
    env: { ...process.env, LIBRIQ_E2E_PORT: String(port) },
  });
  child.once('error', error => {
    console.error(`[${testName}] local server process error:`, error.message);
  });
  return child;
}

export async function waitForServer(baseUrl, { testName, timeoutMs = 10000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastError = '';
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/__libriq_test_api/health`);
      if (response.ok) return;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error.message;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`[${testName}] local server did not become ready within ${timeoutMs}ms (${lastError || 'no response'})`);
}

export async function pollUntil(check, { description, testName, timeoutMs = 10000, intervalMs = 100 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastValue;
  while (Date.now() < deadline) {
    lastValue = await check();
    if (lastValue) return lastValue;
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
  throw new Error(`[${testName}] timed out waiting for ${description} after ${timeoutMs}ms`);
}

export async function stopE2EServer(child, { testName, timeoutMs = 5000 } = {}) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  phase(testName, 'stopping local server');
  const exited = new Promise(resolve => child.once('exit', resolve));
  child.kill('SIGTERM');
  const result = await Promise.race([
    exited.then(() => 'exited'),
    new Promise(resolve => setTimeout(() => resolve('timeout'), timeoutMs)),
  ]);
  if (result === 'timeout' && child.exitCode === null) {
    phase(testName, 'local server did not stop gracefully; forcing shutdown');
    child.kill('SIGKILL');
    await Promise.race([
      exited,
      new Promise(resolve => setTimeout(resolve, 2000)),
    ]);
  }
}

export async function closePlaywright(browser, contexts, { testName } = {}) {
  phase(testName, 'closing pages, contexts, and browser');
  await Promise.allSettled((contexts || []).map(context => context?.close()));
  if (browser) await browser.close().catch(() => {});
}

export async function waitForAppReady(page, { testName, timeoutMs = 10000 } = {}) {
  await page.waitForFunction(
    () => Boolean(
      window.LibriqE2E
      && window.LibriqFirebase?.isTestMode?.()
      && window.LibriqFirebase?.getState?.().ready
      && window.LibriqStorage
      && window.LibriqNavigation
    ),
    null,
    { timeout: timeoutMs },
  ).catch(error => {
    throw new Error(`[${testName}] application test hooks did not become ready within ${timeoutMs}ms: ${error.message}`);
  });
}
