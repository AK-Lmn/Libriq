import { spawn } from 'node:child_process';

export function phase(testName, message) {
  console.log(`[${testName}] ${message}`);
}

// Starts scripts/e2e-server.mjs. By default it listens on port 0, so the OS
// picks a free port and browser tests can run in parallel. The server prints
// its real address; `child.origin` resolves to it ("http://127.0.0.1:PORT").
export function startE2EServer({ port = 0, testName } = {}) {
  const child = spawn(process.execPath, ['scripts/e2e-server.mjs'], {
    stdio: ['ignore', 'pipe', 'inherit'],
    env: { ...process.env, LIBRIQ_E2E_PORT: String(port), LIBRIQ_ENABLE_TEST_API: '1' },
  });
  child.origin = new Promise((resolve, reject) => {
    let buffered = '';
    child.stdout.on('data', chunk => {
      process.stdout.write(chunk);
      buffered += chunk;
      const match = buffered.match(/running at (http:\/\/[\d.]+:\d+)/);
      if (match) resolve(match[1]);
    });
    child.once('exit', code => reject(new Error(`[${testName}] local server exited (${code}) before it was ready`)));
  });
  child.origin.catch(() => {});
  child.once('error', error => {
    console.error(`[${testName}] local server process error:`, error.message);
  });
  return child;
}

// Waits until the server answers its health check and returns its origin.
// Pass the child from startE2EServer, or an origin string.
export async function waitForServer(serverOrOrigin, { testName, timeoutMs = 10000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  const baseUrl = typeof serverOrOrigin === 'string'
    ? serverOrOrigin
    : await Promise.race([
      serverOrOrigin.origin,
      new Promise((_, reject) => setTimeout(() => reject(new Error(`[${testName}] local server did not print its address within ${timeoutMs}ms`)), timeoutMs)),
    ]);
  let lastError = '';
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/__libriq_test_api/health`);
      if (response.ok) return baseUrl;
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
