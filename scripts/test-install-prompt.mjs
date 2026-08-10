import assert from 'node:assert/strict';

const windowListeners = new Map();
const buttonListeners = new Map();
const prompt = { hidden: true };
const install = { addEventListener: (type, handler) => buttonListeners.set(`install:${type}`, handler) };
const dismiss = { addEventListener: (type, handler) => buttonListeners.set(`dismiss:${type}`, handler) };

globalThis.window = globalThis;
globalThis.addEventListener = (type, handler) => windowListeners.set(type, handler);
globalThis.document = {
  getElementById(id) {
    if (id === 'installPrompt') return prompt;
    if (id === 'installPromptAction') return install;
    if (id === 'installPromptDismiss') return dismiss;
    return null;
  },
};
globalThis.localStorage = {
  values: new Map(),
  getItem(key) { return this.values.get(key) || null; },
  setItem(key, value) { this.values.set(key, String(value)); },
  removeItem(key) { this.values.delete(key); },
};

const { initInstallPrompt } = await import('../frontend/js/installPrompt.js');
initInstallPrompt();

let prevented = false;
let prompted = false;
windowListeners.get('beforeinstallprompt')({
  preventDefault() { prevented = true; },
  async prompt() { prompted = true; },
});
assert.equal(prevented, true);
assert.equal(prompt.hidden, false);

await buttonListeners.get('install:click')();
assert.equal(prompted, true);
assert.equal(prompt.hidden, true);

prompt.hidden = false;
buttonListeners.get('dismiss:click')();
assert.equal(prompt.hidden, true);
assert.equal(localStorage.getItem('libriq_install_prompt_dismissed'), '1');

localStorage.removeItem('libriq_install_prompt_dismissed');
windowListeners.get('appinstalled')();
assert.equal(prompt.hidden, true);

console.log('Install prompt tests passed');
