import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';

const repoRoot = process.cwd();
const navPath = path.join(repoRoot, 'frontend/js/navigation.js');
const htmlPath = path.join(repoRoot, 'frontend/index.html');

const navSource = fs.readFileSync(navPath, 'utf8');
const htmlSource = fs.readFileSync(htmlPath, 'utf8');

function extractFunctionBlock(source, startToken, endToken) {
  const start = source.indexOf(startToken);
  if (start === -1) throw new Error(`Missing ${startToken}`);
  const end = endToken ? source.indexOf(endToken, start) : -1;
  if (endToken && end === -1) throw new Error(`Missing ${endToken}`);
  return source.slice(start, endToken ? end : undefined);
}

function createElement(id) {
  return {
    id,
    hidden: true,
    textContent: '',
    value: '',
    disabled: false,
    placeholder: '',
    onclick: null,
    oninput: null,
    className: '',
    style: {},
    _html: '',
    setAttribute(name, value) {
      if (name === 'hidden') this.hidden = true;
      else this[name] = value;
    },
    removeAttribute(name) {
      if (name === 'hidden') this.hidden = false;
      else delete this[name];
    },
    hasAttribute(name) {
      return name === 'hidden' ? this.hidden : false;
    },
    focus() {
      this.focused = true;
    },
    click() {
      if (typeof this.onclick === 'function') this.onclick({ target: this });
    },
    triggerInput() {
      if (typeof this.oninput === 'function') this.oninput({ target: this });
    },
  };
}

function createDangerDom() {
  const elements = new Map([
    ['dangerConfirmModal', createElement('dangerConfirmModal')],
    ['dangerConfirmTitle', createElement('dangerConfirmTitle')],
    ['dangerConfirmBody', createElement('dangerConfirmBody')],
    ['dangerConfirmBodyCopy', createElement('dangerConfirmBodyCopy')],
    ['dangerConfirmPrompt', createElement('dangerConfirmPrompt')],
    ['dangerConfirmInput', createElement('dangerConfirmInput')],
    ['dangerConfirmAction', createElement('dangerConfirmAction')],
    ['dangerConfirmCancel', createElement('dangerConfirmCancel')],
    ['closeDangerConfirm', createElement('closeDangerConfirm')],
    ['dangerConfirmError', createElement('dangerConfirmError')],
  ]);
  elements.get('dangerConfirmModal').hidden = true;
  const body = elements.get('dangerConfirmBody');
  body.innerHTML = '';
  return {
    elements,
    body,
    getElementById(id) {
      return elements.get(id) || null;
    },
    queryDangerInputs() {
      return [elements.get('dangerConfirmInput')].filter(Boolean);
    },
  };
}

function createContext() {
  const dom = createDangerDom();
  const windowObj = {
    document: dom,
    console,
    setTimeout,
    clearTimeout,
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {},
    LibriqFirebase: {
      getState: () => ({ user: { uid: 'uid-1' } }),
    },
    LibriqSyncBeta: {
      detachForAccountSwitch() {},
    },
  };
  const context = {
    window: windowObj,
    document: dom,
    console,
    setTimeout,
    clearTimeout,
    Storage: {
      clearAccountScopedData() { return true; },
    },
    Navigation: {
      renderCurrentPage() {},
      updateBadges() {},
      goTo() {},
    },
    Utils: {
      toast() {},
      sanitize: (value) => String(value ?? ''),
    },
    LIBRIQ: {},
  };
  windowObj.window = windowObj;
  windowObj.Storage = context.Storage;
  windowObj.Navigation = context.Navigation;
  windowObj.Utils = context.Utils;
  return { context, dom };
}

function loadModalFns(context) {
  const snippet = [
    extractFunctionBlock(navSource, 'function _dangerConfirmElements()', 'function confirmDangerAction'),
    extractFunctionBlock(navSource, 'function confirmDangerAction(', 'async function clearLocalCache'),
    extractFunctionBlock(navSource, 'async function clearLocalCache()', 'async function confirmDeleteLibraryData'),
    extractFunctionBlock(navSource, 'async function confirmDeleteLibraryData()', 'async function confirmDeleteAccount'),
    extractFunctionBlock(navSource, 'async function confirmDeleteAccount()', 'function clearAllData'),
  ].join('\n');
  vm.runInNewContext(snippet, context, { filename: 'navigation-danger-modal-snippet.js' });
}

function assertSingleInputInMarkup() {
  const matches = htmlSource.match(/id="dangerConfirmInput"/g) || [];
  assert.equal(matches.length, 1, 'danger modal markup should contain exactly one confirmation input');
}

async function testAction(context, dom, config) {
  const { confirmDangerAction } = context;
  assert.equal(typeof confirmDangerAction, 'function', 'confirmDangerAction should be available');

  const promise = confirmDangerAction(config);
  await Promise.resolve();

  const modal = dom.getElementById('dangerConfirmModal');
  const title = dom.getElementById('dangerConfirmTitle');
  const bodyCopy = dom.getElementById('dangerConfirmBodyCopy');
  const prompt = dom.getElementById('dangerConfirmPrompt');
  const input = dom.getElementById('dangerConfirmInput');
  const action = dom.getElementById('dangerConfirmAction');
  const cancel = dom.getElementById('dangerConfirmCancel');
  const close = dom.getElementById('closeDangerConfirm');
  const error = dom.getElementById('dangerConfirmError');

  assert.equal(modal.hidden, false, `${config.title} modal should be visible`);
  assert.equal(title.textContent, config.title);
  assert.equal(bodyCopy.textContent, config.body);
  assert.equal(prompt.textContent, config.prompt);
  assert.equal(input.value, '');
  assert.equal(action.disabled, true);
  assert.equal(dom.queryDangerInputs().length, 1, 'danger modal should contain exactly one input');
  assert.equal(error.hidden, true);

  input.value = config.expected.slice(0, Math.max(1, config.expected.length - 1));
  input.triggerInput();
  assert.equal(action.disabled, true);

  input.value = config.expected;
  input.triggerInput();
  assert.equal(action.disabled, false);

  cancel.click();
  await promise;
  assert.equal(modal.hidden, true, 'cancel should close the modal');

  const reopen = confirmDangerAction(config);
  await Promise.resolve();
  assert.equal(modal.hidden, false);
  assert.equal(input.value, '', 'reopen should reset input');
  assert.equal(action.disabled, true, 'reopen should reset disabled state');
  assert.equal(prompt.textContent, config.prompt, 'reopen should reset prompt text');
  assert.equal(title.textContent, config.title, 'reopen should reset title');
  assert.equal(error.hidden, true, 'reopen should reset error slot');
  close.click();
  await reopen;
  assert.equal(modal.hidden, true, 'close button should close the modal');
}

async function main() {
  assertSingleInputInMarkup();
  assert.equal(navSource.includes('window.prompt'), false, 'danger modal code should not use window.prompt');
  assert.equal(navSource.includes('Danger modal unavailable for confirmation dialog'), true, 'danger modal guard should exist');

  const { context, dom } = createContext();
  loadModalFns(context);
  context.confirmDangerAction = context.confirmDangerAction || context.window.confirmDangerAction;

  await testAction(context, dom, {
    title: 'Delete library data?',
    body: 'This permanently removes your books, notes, progress, activity, streak, and cloud backup for this account. This cannot be undone.',
    prompt: 'Type DELETE to continue',
    expected: 'DELETE',
    actionLabel: 'Delete library data',
  });

  await testAction(context, dom, {
    title: 'Delete account?',
    body: 'This permanently deletes your LibriQ account and all reading data connected to it. This cannot be undone.',
    prompt: 'Type DELETE ACCOUNT to continue',
    expected: 'DELETE ACCOUNT',
    actionLabel: 'Delete account',
  });

  await testAction(context, dom, {
    title: 'Clear local cache?',
    body: 'This will remove this device\'s local cache only. It will not delete your cloud library or account.',
    prompt: 'Type CLEAR CACHE to continue',
    expected: 'CLEAR CACHE',
    actionLabel: 'Clear cache',
  });

  console.log('Modal regression test passed.');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
