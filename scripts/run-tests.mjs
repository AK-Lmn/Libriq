// Runs every scripts/test-*.mjs, split into two tiers:
//   unit    — plain Node, no browser
//   browser — imports Playwright (needs `npx playwright install chromium`)
// Usage: node scripts/run-tests.mjs --tier unit|browser|all [--retries N]
// Scripts run one at a time: several browser tests bind fixed ports.
import { spawn } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TIMEOUT_MS = 5 * 60 * 1000;

export function classifyScript(source) {
  return /from ['"]playwright['"]|require\(['"]playwright['"]\)/.test(source) ? 'browser' : 'unit';
}

export function selectScripts(scripts, tier) {
  return tier === 'all' ? scripts : scripts.filter(script => script.tier === tier);
}

async function discover(dir) {
  const names = (await readdir(dir)).filter(name => /^test-.*\.mjs$/.test(name)).sort();
  return Promise.all(names.map(async name => ({
    name,
    tier: classifyScript(await readFile(path.join(dir, name), 'utf8')),
  })));
}

function runOnce(file) {
  return new Promise(resolve => {
    let output = '';
    const child = spawn(process.execPath, [file], { stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });
    const timer = setTimeout(() => { output += `\n[timed out after ${TIMEOUT_MS / 1000}s]`; child.kill('SIGKILL'); }, TIMEOUT_MS);
    child.on('close', code => { clearTimeout(timer); resolve({ ok: code === 0, output }); });
  });
}

async function main(argv) {
  const arg = (flag, fallback) => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : fallback; };
  const tier = arg('--tier', 'all');
  const retries = Number(arg('--retries', '0'));
  if (!['unit', 'browser', 'all'].includes(tier)) throw new Error(`Unknown tier: ${tier}`);

  const dir = path.dirname(fileURLToPath(import.meta.url));
  const scripts = selectScripts(await discover(dir), tier);
  const failed = [];
  const flaky = [];
  const started = Date.now();

  for (const script of scripts) {
    const file = path.join(dir, script.name);
    let result = await runOnce(file);
    let attempts = 1;
    while (!result.ok && attempts <= retries) {
      attempts += 1;
      result = await runOnce(file);
    }
    if (result.ok && attempts > 1) flaky.push(script.name);
    console.log(`${result.ok ? (attempts > 1 ? 'FLAKY' : 'PASS ') : 'FAIL '} ${script.name}`);
    if (!result.ok) {
      failed.push(script.name);
      console.log(result.output.trim().split('\n').slice(-25).map(line => `    ${line}`).join('\n'));
    }
  }

  const seconds = Math.round((Date.now() - started) / 1000);
  console.log(`\n${scripts.length - failed.length}/${scripts.length} ${tier} scripts passed in ${seconds}s` +
    (flaky.length ? `; passed on retry: ${flaky.join(', ')}` : ''));
  return failed.length ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
