// Runs every scripts/test-*.mjs, split into two tiers:
//   unit    — plain Node, no browser
//   browser — imports Playwright (needs `npx playwright install chromium`)
// Usage: node scripts/run-tests.mjs --tier unit|browser|all [--retries N] [--jobs N]
// Scripts run in parallel, --jobs at a time (default: half the CPU cores, at
// most 4). Browser tests start their server on a free port, so they don't clash.
import { spawn } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TIMEOUT_MS = 5 * 60 * 1000;

const PLAYWRIGHT_IMPORT = /from ['"]playwright['"]|require\(['"]playwright['"]\)/;
// Static imports of another script in scripts/ ('./name.mjs').
const SIBLING_IMPORT = /(?:from|import)\s*['"]\.\/([\w.-]+\.mjs)['"]/g;

// A script needs a browser if it, or any sibling script it imports, uses
// Playwright. readSibling(name) returns that script's source, or null.
export function classifyScript(source, readSibling = () => null, seen = new Set()) {
  if (PLAYWRIGHT_IMPORT.test(source)) return 'browser';
  for (const [, name] of source.matchAll(SIBLING_IMPORT)) {
    if (seen.has(name)) continue;
    seen.add(name);
    const sibling = readSibling(name);
    if (sibling && classifyScript(sibling, readSibling, seen) === 'browser') return 'browser';
  }
  return 'unit';
}

export function selectScripts(scripts, tier) {
  return tier === 'all' ? scripts : scripts.filter(script => script.tier === tier);
}

async function discover(dir) {
  const all = (await readdir(dir)).filter(name => name.endsWith('.mjs'));
  const sources = new Map(await Promise.all(all.map(async name => [name, await readFile(path.join(dir, name), 'utf8')])));
  const readSibling = name => sources.get(name) ?? null;
  return all.filter(name => /^test-.*\.mjs$/.test(name)).sort()
    .map(name => ({ name, tier: classifyScript(sources.get(name), readSibling) }));
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
  const defaultJobs = Math.min(4, Math.max(1, Math.floor(os.availableParallelism() / 2)));
  const jobs = Math.max(1, Number(arg('--jobs', String(defaultJobs))) || 1);
  if (!['unit', 'browser', 'all'].includes(tier)) throw new Error(`Unknown tier: ${tier}`);

  const dir = path.dirname(fileURLToPath(import.meta.url));
  const scripts = selectScripts(await discover(dir), tier);
  const failed = [];
  const flaky = [];
  const started = Date.now();

  async function runScript(script) {
    const file = path.join(dir, script.name);
    let result = await runOnce(file);
    let attempts = 1;
    while (!result.ok && attempts <= retries) {
      attempts += 1;
      result = await runOnce(file);
    }
    if (result.ok && attempts > 1) flaky.push(script.name);
    // Print each script's lines together, when it finishes.
    let report = `${result.ok ? (attempts > 1 ? 'FLAKY' : 'PASS ') : 'FAIL '} ${script.name}`;
    if (!result.ok) {
      failed.push(script.name);
      report += '\n' + result.output.trim().split('\n').slice(-25).map(line => `    ${line}`).join('\n');
    }
    console.log(report);
  }

  const queue = [...scripts];
  const worker = async () => { while (queue.length) await runScript(queue.shift()); };
  await Promise.all(Array.from({ length: Math.min(jobs, scripts.length) }, worker));

  const seconds = Math.round((Date.now() - started) / 1000);
  console.log(`\n${scripts.length - failed.length}/${scripts.length} ${tier} scripts passed in ${seconds}s (${jobs} at a time)` +
    (flaky.length ? `; passed on retry: ${flaky.join(', ')}` : ''));
  return failed.length ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
