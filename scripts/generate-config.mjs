import { mkdir, readFile, readdir, writeFile, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { validateConfig } from '../server/config.js';

const rootDir = process.cwd();
const configPath = path.join(rootDir, 'frontend', 'js', 'config.js');
const localConfigPath = path.join(rootDir, 'frontend', 'js', 'config.local.js');
const vendorDir = path.join(rootDir, 'frontend', 'vendor');
const packageJson = JSON.parse(await readFile(path.join(rootDir, 'package.json'), 'utf8'));
const appVersion = String(packageJson.version || '').trim();
if (!appVersion) throw new Error('package.json version is required.');
await writeFile(
  path.join(rootDir, 'frontend', 'js', 'version.js'),
  `export const APP_VERSION = ${JSON.stringify(appVersion)};\n`,
  'utf8',
);
// Every deploy needs its own service-worker cache, or a deploy without a
// version bump keeps the old cache and refreshes files into it one by one.
// On Vercel: the commit SHA, or a hash of the shipped source if the SHA isn't
// exposed. Local builds use a fixed id so the tracked file doesn't churn.
async function hashShippedSource() {
  const hash = createHash('sha256');
  const skip = /(?:^|\/)(?:version|version-classic|config|config\.local)\.js$|(?:^|\/)components\.css$/;
  for (const dir of ['js', 'css']) {
    const entries = (await readdir(path.join(rootDir, 'frontend', dir), { recursive: true }))
      .map(entry => entry.split(path.sep).join('/'))
      .filter(entry => /\.(?:js|css)$/.test(entry) && !skip.test(entry))
      .sort();
    for (const entry of entries) {
      hash.update(`${dir}/${entry}\0`);
      hash.update(await readFile(path.join(rootDir, 'frontend', dir, entry)));
    }
  }
  for (const file of ['index.html', 'service-worker.js']) hash.update(await readFile(path.join(rootDir, 'frontend', file)));
  return hash.digest('hex').slice(0, 12);
}
const onVercel = Boolean(String(process.env.VERCEL || process.env.VERCEL_ENV || '').trim());
const buildId = onVercel
  ? (String(process.env.VERCEL_GIT_COMMIT_SHA || '').trim().slice(0, 12) || await hashShippedSource())
  : 'local';
await writeFile(
  path.join(rootDir, 'frontend', 'js', 'version-classic.js'),
  `self.LIBRIQ_APP_VERSION = ${JSON.stringify(appVersion)};\nself.LIBRIQ_BUILD_ID = ${JSON.stringify(buildId)};\n`,
  'utf8',
);

await loadLocalEnvFile(path.join(rootDir, '.env'));

const envValidation = validateConfig(process.env);
if (!envValidation.valid) {
  console.warn(`[Libriq] Environment validation warnings:\n  - ${envValidation.errors.join('\n  - ')}`);
}

const envKey = String(process.env.GOOGLE_BOOKS_API_KEY || '').trim();
const firebaseConfig = {
  apiKey: String(process.env.FIREBASE_API_KEY || '').trim(),
  authDomain: String(process.env.FIREBASE_AUTH_DOMAIN || '').trim(),
  projectId: String(process.env.FIREBASE_PROJECT_ID || '').trim(),
  storageBucket: String(process.env.FIREBASE_STORAGE_BUCKET || '').trim(),
  messagingSenderId: String(process.env.FIREBASE_MESSAGING_SENDER_ID || '').trim(),
  appId: String(process.env.FIREBASE_APP_ID || '').trim(),
};

const hasFirebaseConfig = Object.values(firebaseConfig).every(Boolean);
const isVercelBuild = Boolean(String(process.env.VERCEL || process.env.VERCEL_ENV || '').trim());

if (isVercelBuild && !hasFirebaseConfig) {
  // Names only: never echo values into build logs.
  const envNames = {
    apiKey: 'FIREBASE_API_KEY',
    authDomain: 'FIREBASE_AUTH_DOMAIN',
    projectId: 'FIREBASE_PROJECT_ID',
    storageBucket: 'FIREBASE_STORAGE_BUCKET',
    messagingSenderId: 'FIREBASE_MESSAGING_SENDER_ID',
    appId: 'FIREBASE_APP_ID',
  };
  const missing = Object.keys(firebaseConfig).filter(key => !firebaseConfig[key]).map(key => envNames[key]);
  throw new Error(`[Libriq] Vercel build is missing required Firebase env vars: ${missing.join(', ')}. Set them in the Vercel project settings.`);
}

const appCheckSiteKey = String(process.env.FIREBASE_APPCHECK_SITE_KEY || '').trim();
const clientFirebaseConfig = appCheckSiteKey ? { ...firebaseConfig, appCheckSiteKey } : firebaseConfig;

const configLines = [];
if (envKey) configLines.push(`  googleBooksApiKey: ${JSON.stringify(envKey)}`);
if (hasFirebaseConfig) configLines.push(`  firebase: ${JSON.stringify(clientFirebaseConfig, null, 2).replace(/\n/g, '\n  ')}`);
const contents = `window.LibriqConfig = {\n${configLines.join(',\n')}${configLines.length ? '\n' : ''}};\n`;

await mkdir(vendorDir, { recursive: true });
await vendorFirebaseSdk();

await bundleCss();

if (isVercelBuild) {
  await writeFile(configPath, contents, 'utf8');
} else {
  await writeFile(localConfigPath, contents, 'utf8');
  if (!await fileExists(configPath)) {
    await writeFile(configPath, 'window.LibriqConfig = {};\n', 'utf8');
  }
}

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

console.log(`[Libriq] Wrote ${isVercelBuild ? path.relative(rootDir, configPath) : path.relative(rootDir, localConfigPath)}${envKey ? ' with Google Books key' : ' with empty config'}.`);

async function vendorFirebaseSdk() {
  const firebaseDir = path.join(rootDir, 'node_modules', 'firebase');
  const firebasePkg = JSON.parse(await readFile(path.join(firebaseDir, 'package.json'), 'utf8'));
  const sdkVersion = String(firebasePkg.version || '').trim();
  if (!sdkVersion) throw new Error('[Libriq] Could not read firebase version from node_modules/firebase/package.json.');
  const cdnAppImport = `from"https://www.gstatic.com/firebasejs/${sdkVersion}/firebase-app.js"`;

  await copyFile(path.join(firebaseDir, 'firebase-app.js'), path.join(vendorDir, 'firebase-app.js'));

  // Each SDK module imports firebase-app from the CDN; point it at the vendored copy instead.
  for (const file of ['firebase-auth.js', 'firebase-firestore.js', 'firebase-app-check.js']) {
    const source = await readFile(path.join(firebaseDir, file), 'utf8');
    if (!source.includes(cdnAppImport)) {
      throw new Error(`[Libriq] ${file} does not contain the expected import ${cdnAppImport}; update the vendoring rewrite for firebase ${sdkVersion}.`);
    }
    const rewritten = source.split(cdnAppImport).join('from"./firebase-app.js"');
    if (/from"https:\/\/www\.gstatic\.com\//.test(rewritten)) {
      throw new Error(`[Libriq] ${file} still imports from www.gstatic.com after vendoring; add a rewrite for it.`);
    }
    await writeFile(path.join(vendorDir, file), rewritten, 'utf8');
  }
}

async function bundleCss() {
  const cssDir = path.join(rootDir, 'frontend', 'css');
  const files = [
    'components/button.css',
    'components/card.css',
    'components/toast.css',
    'components/form.css',
    'components/polish.css',
    'components/utilities.css',
    'components/dialog.css',
    'features/settings.css',
    'features/library.css',
    'features/insights.css',
    'features/session.css',
    'features/goals.css',
    'features/discover.css',
    'features/profile.css',
    'features/help.css',
    'features/book-details.css',
    'features/book-dialogs.css',
    'features/quotes.css',
    'features/kindle-import.css',
    'features/goodreads-import.css',
    'features/support-dialogs.css',
    // Last, so the shared header wins over older per-page header rules.
    'components/page-header.css',
  ];
  // Strip a leading byte-order mark: mid-bundle it would glue onto the next selector and void that rule.
  // Rebase relative url()s: they are written relative to each source file, but the bundle lives in css/.
  const contents = await Promise.all(files.map(async (f) => {
    const css = (await readFile(path.join(cssDir, f), 'utf8')).replace(/^\uFEFF/, '');
    return rebaseCssUrls(css, path.posix.dirname(f));
  }));
  const bundled = `/* Auto-bundled components & features to eliminate @import render-blocking waterfall */\n` + contents.join('\n\n');
  await writeFile(path.join(cssDir, 'components.css'), bundled, 'utf8');
}

function rebaseCssUrls(css, fromDir) {
  return css.replace(/url\(\s*(['"]?)([^'"()\s]+)\1\s*\)/g, (match, quote, ref) => {
    if (/^(?:data:|https?:|\/\/|\/|#|var\()/i.test(ref)) return match;
    const rebased = path.posix.normalize(path.posix.join(fromDir, ref));
    return `url(${quote}${rebased}${quote})`;
  });
}

async function loadLocalEnvFile(envPath) {
  try {
    const raw = await readFile(envPath, 'utf8');
    raw.split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;

      const eqIndex = line.indexOf('=');
      if (eqIndex === -1) return;

      const key = line.slice(0, eqIndex).trim();
      let value = line.slice(eqIndex + 1).trim();
      if (!key || Object.prototype.hasOwnProperty.call(process.env, key)) return;

      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith('\'') && value.endsWith('\''))
      ) {
        value = value.slice(1, -1);
      }

      value = value
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r');
      process.env[key] = value;
    });
  } catch (err) {
    if (err?.code !== 'ENOENT') throw err;
  }
}

async function fileExists(filePath) {
  try {
    await readFile(filePath, 'utf8');
    return true;
  } catch (err) {
    if (err?.code === 'ENOENT') return false;
    throw err;
  }
}
