import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createProfilePage } from '../frontend/js/features/profile/profilePage.js';
import { resolveAccountDisplayName } from '../frontend/js/accountDisplayName.js';

const listeners = new Map();
const fields = { profileName: { value: 'Updated Reader' }, profileBio: { value: 'Always reading.' } };
const main = { innerHTML: '', addEventListener(type, handler) { listeners.set(type, handler); } };
const saved = [];
const toasts = [];
const profilePage = createProfilePage({
  storage: {
    getProfile: () => ({ name: 'Signed In Reader', bio: 'Book lover' }),
    getStats: () => ({ total: 12, finished: 7, finishedThisYear: 3, totalPages: 3456, avgRating: 4.5, ratedCount: 6 }),
    getStreak: () => ({ best: 19 }),
    saveProfile: profile => saved.push(profile),
  },
  utils: {
    sanitize: value => String(value ?? ''), formatNumber: value => `formatted:${value}`,
    formatDisplayName: value => String(value || '').trim(),
    formatEmailPrefixName: email => String(email || '').split('@')[0] || '',
    toast: (message, type) => toasts.push([message, type]),
  },
  constants: { VERSION: '4.7.0' }, actions: {},
  documentRoot: { getElementById: id => id === 'mainContent' ? main : fields[id] || null },
});

profilePage();
assert.match(main.innerHTML, /id="profilePage"/);
assert.match(main.innerHTML, /value="Signed In Reader"/);
assert.match(main.innerHTML, /Book lover/);
assert.match(main.innerHTML, /<details class="profile-editor">/);
assert.match(main.innerHTML, /maxlength="40" aria-describedby="profileNameHelp"/);
assert.match(main.innerHTML, /maxlength="200" rows="4" aria-describedby="profileBioHelp"/);
assert.match(main.innerHTML, /class="profile-editor-body"/);
assert.doesNotMatch(main.innerHTML, /type="file"|name="email"|name="location"/);
assert.match(main.innerHTML, /formatted:3456/);
assert.match(main.innerHTML, /3 finished this year/);
assert.match(main.innerHTML, /6 rated books/);
assert.match(main.innerHTML, /Longest streak[\s\S]*19/);
assert.equal((main.innerHTML.match(/class="profile-stat"/g) || []).length, 5);
assert.match(main.innerHTML, /Account email unavailable/);
assert.match(main.innerHTML, /Join date unavailable/);
assert.doesNotMatch(main.innerHTML, /Eleanor Hayes|January 12, 2024|eleanor.hayes/);
assert.doesNotMatch(main.innerHTML, /onclick=|onsubmit=/);
assert.equal(profilePage.getDisplayNameForAccount({ displayName: 'Account Reader' }), 'Signed In Reader');

const accountNamePage = createProfilePage({
  storage: { getProfile: () => ({ name: 'Reader' }) },
  utils: {
    formatDisplayName: value => String(value || '').trim(),
    formatEmailPrefixName: email => String(email || '').split('@')[0] || '',
  },
});
assert.equal(accountNamePage.getDisplayNameForAccount({ displayName: 'Account Reader', email: 'reader@example.com' }), 'Account Reader');
assert.equal(accountNamePage.getDisplayNameForAccount({ displayName: '', email: 'email.reader@example.com' }), 'Email');
assert.equal(accountNamePage.getDisplayNameForAccount({}), 'Reader');
assert.equal(resolveAccountDisplayName({ name: 'Local Reader' }, { displayName: 'Account Reader', email: 'account@example.com' }), 'Local Reader');
assert.equal(resolveAccountDisplayName({ name: 'Reader' }, { displayName: 'Account Reader', email: 'account@example.com' }), 'Account Reader');
assert.equal(resolveAccountDisplayName({ name: 'Reader' }, { displayName: '', email: 'email.reader@example.com' }), 'Email');
assert.equal(resolveAccountDisplayName({ name: 'Reader' }, null), 'Reader');

const firebaseProfileMain = { innerHTML: '', addEventListener() {} };
const firebaseProfilePage = createProfilePage({
  storage: {
    getProfile: () => ({ name: 'Reader', bio: '' }),
    getStats: () => ({ total: 0, finished: 0, totalPages: 0, avgRating: 0 }),
  },
  utils: { sanitize: value => String(value ?? ''), formatNumber: value => String(value ?? 0) },
  actions: { getFirebaseState: () => ({ user: { displayName: 'Account Reader', email: 'account@example.com', metadata: { creationTime: '2025-06-17T12:00:00Z' } } }) },
  documentRoot: { getElementById: id => id === 'mainContent' ? firebaseProfileMain : null },
});
firebaseProfilePage();
assert.match(firebaseProfileMain.innerHTML, /value="Account Reader"/);
assert.match(firebaseProfileMain.innerHTML, /account@example\.com/);
assert.match(firebaseProfileMain.innerHTML, /Joined June 17, 2025/);
assert.match(firebaseProfileMain.innerHTML, /0 rated books/);

// Test numeric ms string creationTime
const numericProfileMain = { innerHTML: '', addEventListener() {} };
const numericProfilePage = createProfilePage({
  storage: { getProfile: () => ({ name: 'Reader' }), getStats: () => ({}) },
  utils: { sanitize: value => String(value ?? ''), formatNumber: value => String(value ?? 0) },
  actions: { getCurrentUser: () => ({ displayName: 'Numeric User', metadata: { creationTime: '1750161600000' } }) },
  documentRoot: { getElementById: id => id === 'mainContent' ? numericProfileMain : null },
});
numericProfilePage();
assert.match(numericProfileMain.innerHTML, /Joined June 17, 2025/);

// Test profile.createdAt fallback
const fallbackProfileMain = { innerHTML: '', addEventListener() {} };
const fallbackProfilePage = createProfilePage({
  storage: { getProfile: () => ({ name: 'Reader', createdAt: '2024-03-10T00:00:00Z' }), getStats: () => ({}) },
  utils: { sanitize: value => String(value ?? ''), formatNumber: value => String(value ?? 0) },
  actions: { getCurrentUser: () => null },
  documentRoot: { getElementById: id => id === 'mainContent' ? fallbackProfileMain : null },
});
fallbackProfilePage();
assert.match(fallbackProfileMain.innerHTML, /Joined March 10, 2024/);

const dashboardSource = fs.readFileSync('frontend/js/dashboard.js', 'utf8');
assert.match(dashboardSource, /resolveAccountDisplayName\(profile, LibriqFirebase\.getState\(\)\.user\)/);

let prevented = false;
listeners.get('submit')({
  target: { matches: selector => selector === '[data-action="save-profile"]' },
  preventDefault: () => { prevented = true; },
});
assert.equal(prevented, true);
assert.deepEqual(saved, [{ name: 'Updated Reader', bio: 'Always reading.' }]);
assert.deepEqual(toasts, [['Profile saved', 'success']]);
let focused = false;
const editor = { open: true, querySelector: () => ({ focus: () => { focused = true; } }) };
listeners.get('keydown')({ key: 'Escape', target: { closest: () => editor }, preventDefault() {} });
assert.equal(editor.open, false);
assert.equal(focused, true);
profilePage();
assert.equal(listeners.size, 2);
console.log('Profile page tests passed');
