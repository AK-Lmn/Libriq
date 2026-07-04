import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import path from 'node:path';

const rootDir = process.cwd();
const configPath = path.join(rootDir, 'frontend', 'js', 'config.js');
const vendorDir = path.join(rootDir, 'frontend', 'vendor');
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

const configLines = [];
if (envKey) configLines.push(`  googleBooksApiKey: ${JSON.stringify(envKey)}`);
if (hasFirebaseConfig) configLines.push(`  firebase: ${JSON.stringify(firebaseConfig, null, 2).replace(/\n/g, '\n  ')}`);
const contents = `window.LibriqConfig = {\n${configLines.join(',\n')}${configLines.length ? '\n' : ''}};\n`;

await mkdir(vendorDir, { recursive: true });
await copyFile(path.join(rootDir, 'node_modules', 'firebase', 'firebase-app.js'), path.join(vendorDir, 'firebase-app.js'));
const authSource = await readFile(path.join(rootDir, 'node_modules', 'firebase', 'firebase-auth.js'), 'utf8');
await writeFile(path.join(vendorDir, 'firebase-auth.js'), authSource.replace('from"https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js"', 'from"./firebase-app.js"'), 'utf8');
const firestoreSource = await readFile(path.join(rootDir, 'node_modules', 'firebase', 'firebase-firestore.js'), 'utf8');
await writeFile(path.join(vendorDir, 'firebase-firestore.js'), firestoreSource
  .replace('from"https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js"', 'from"./firebase-app.js"')
  .replace('from"https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js"', 'from"./firebase-auth.js"'), 'utf8');

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
