// Runs every browser-free scripts/test-*.mjs under `node --test`, one subtest
// per script, so `npm test` reports the whole unit tier in one place. The
// scripts are still plain Node scripts; each runs in its own process, and a
// failure shows the end of that script's output. `npm run test:unit` runs
// the same scripts through scripts/run-tests.mjs, which is handy locally.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { discover } from '../scripts/run-tests.mjs';

const scriptsDir = fileURLToPath(new URL('../scripts/', import.meta.url));
const TIMEOUT_MS = 5 * 60 * 1000;
const unitScripts = (await discover(scriptsDir)).filter(script => script.tier === 'unit');

function runScript(file) {
  return new Promise(resolve => {
    let output = '';
    const child = spawn(process.execPath, [file], { stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });
    const timer = setTimeout(() => { output += `\n[timed out after ${TIMEOUT_MS / 1000}s]`; child.kill('SIGKILL'); }, TIMEOUT_MS);
    child.on('close', code => { clearTimeout(timer); resolve({ code, output }); });
  });
}

describe('unit test scripts', { concurrency: 4 }, () => {
  it('finds the unit tier', () => {
    assert.ok(unitScripts.length >= 40, `expected the full unit tier, found ${unitScripts.length}`);
  });

  for (const script of unitScripts) {
    it(script.name, async () => {
      const { code, output } = await runScript(path.join(scriptsDir, script.name));
      assert.equal(code, 0, `${script.name} exited with ${code}\n${output.trim().split('\n').slice(-25).join('\n')}`);
    });
  }
});
