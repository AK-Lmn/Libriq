import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const rootDir = process.cwd();
const configPath = path.join(rootDir, 'frontend', 'js', 'config.js');
const envKey = String(process.env.GOOGLE_BOOKS_API_KEY || '').trim();

const contents = envKey
  ? `window.LibriqConfig = {\n  googleBooksApiKey: ${JSON.stringify(envKey)}\n};\n`
  : 'window.LibriqConfig = window.LibriqConfig || {};\n';

await writeFile(configPath, contents, 'utf8');

try {
  const written = await readFile(configPath, 'utf8');
  if (!written.includes('window.LibriqConfig')) {
    throw new Error('Generated config missing LibriqConfig assignment.');
  }
} catch (err) {
  console.error('[Libriq] Failed to verify generated config:', err.message);
  process.exitCode = 1;
  throw err;
}

console.log(`[Libriq] Wrote ${path.relative(rootDir, configPath)}${envKey ? ' with Google Books key' : ' with empty config'}.`);
