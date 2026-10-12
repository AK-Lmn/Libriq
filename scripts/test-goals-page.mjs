import assert from 'node:assert/strict';
import { createGoalsPage } from '../frontend/js/features/goals/goalsPage.js';

const listeners = new Map();
const input = { value: '24' };
const form = {
  addEventListener(type, handler) { listeners.set(type, handler); },
  querySelector: selector => selector === '#yearlyGoalInput' ? input : null,
};
const main = {
  innerHTML: '',
  querySelector: selector => selector === '#goalsForm' ? form : null,
};
const presetCalls = [];

const render = createGoalsPage({
  storage: {
    getGoals: () => ({ yearly: 24 }),
    getStats: () => ({ finishedThisYear: 10 }),
    saveGoals() {},
  },
  utils: { toast() {} },
  actions: {
    setGoalPreset(target, yearly) {
      presetCalls.push(yearly);
      target.value = yearly;
    },
  },
  documentRoot: { getElementById: id => id === 'mainContent' ? main : null },
});

render();
assert.match(main.innerHTML, /Reading Goals/);
assert.match(main.innerHTML, /value="24"/);
assert.match(main.innerHTML, /Completed[\s\S]*10 books/);
assert.match(main.innerHTML, /Remaining[\s\S]*14 books/);
assert.doesNotMatch(main.innerHTML, /onclick=/);
assert.match(main.innerHTML, /aria-valuenow="42"/);
assert.match(main.innerHTML, /data-action="step-goal"/);

listeners.get('click')({
  target: { closest: () => ({ dataset: { goalPreset: '52' } }) },
});
assert.deepEqual(presetCalls, [52]);
assert.equal(input.value, 52);
listeners.get('click')({ target: { closest: selector => selector.includes('step-goal') ? { dataset: { step: '1' } } : null } });
assert.equal(input.value, 53);
input.value = 365;
listeners.get('click')({ target: { closest: selector => selector.includes('step-goal') ? { dataset: { step: '1' } } : null } });
assert.equal(input.value, 365);

const zeroMain = { innerHTML: '', querySelector: () => null };
createGoalsPage({
  storage: { getGoals: () => ({ yearly: 0 }), getStats: () => ({ finishedThisYear: 10 }) },
  utils: {}, documentRoot: { getElementById: () => zeroMain },
})();
assert.match(zeroMain.innerHTML, /aria-valuenow="0"/);
assert.match(zeroMain.innerHTML, /Set a goal/);
assert.doesNotMatch(zeroMain.innerHTML, /NaN|Infinity/);

console.log('Goals page tests passed');
