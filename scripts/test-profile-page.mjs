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
    getStats: () => ({ total: 12, finished: 7, totalPages: 3456, avgRating: 4.5 }),
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
assert.match(main.innerHTML, /formatted:3456/);
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
  actions: { getFirebaseState: () => ({ user: { displayName: 'Account Reader', email: 'account@example.com' } }) },
  documentRoot: { getElementById: id => id === 'mainContent' ? firebaseProfileMain : null },
});
firebaseProfilePage();
assert.match(firebaseProfileMain.innerHTML, /value="Account Reader"/);
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
console.log('Profile page tests passed');
