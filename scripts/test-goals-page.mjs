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

listeners.get('click')({
  target: { closest: () => ({ dataset: { goalPreset: '52' } }) },
});
assert.deepEqual(presetCalls, [52]);
assert.equal(input.value, 52);

console.log('Goals page tests passed');
