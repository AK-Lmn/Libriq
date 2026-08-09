import assert from 'node:assert/strict';
import { createStatisticsPage } from '../frontend/js/features/statistics/statisticsPage.js';

const currentYear = new Date().getFullYear();
const listeners = new Map();
const selector = {
  addEventListener(type, handler) { listeners.set(type, handler); },
};
const main = {
  innerHTML: '',
  addEventListener(type, handler) { listeners.set(`main:${type}`, handler); },
};
globalThis.sessionStorage = {
  values: new Map(),
  getItem(key) { return this.values.get(key) || null; },
  setItem(key, value) { this.values.set(key, String(value)); },
};

let statsReads = 0;
const books = [{
  id: 'finished-1', title: 'Finished Book', author: 'Reader', status: 'finished',
  dateFinished: `${currentYear}-02-01T00:00:00Z`, pageCount: 240, rating: 5,
}];
const render = createStatisticsPage({
  storage: {
    getStats() {
      statsReads++;
      return {
        total: 1, finished: 1, reading: 0, wishlist: 0, favorites: 0,
        totalPages: 240, avgRating: '5.0', ratedCount: 1, finishedThisYear: 1,
        monthlyData: Array(12).fill(0), pagesByMonth: Array(12).fill(0), topGenres: [],
      };
    },
    getGoals: () => ({ yearly: 12 }),
    getStreak: () => ({ current: 2, longest: 4 }),
    getBooks: () => books,
  },
  utils: {
    formatNumber: value => String(value), sanitize: value => String(value),
    buildCover: () => '<div class="cover"></div>', buildStars: () => '<span>stars</span>',
  },
  constants: {
    STATUS: { FINISHED: 'finished' },
    MONTHS: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  },
  actions: {
    buildMonthlyChart: () => '<div id="monthlyChartStub"></div>',
    buildGenreRow: () => '',
    openSearch() {}, navigate() {},
  },
  documentRoot: {
    getElementById(id) {
      if (id === 'mainContent') return main;
      if (id === 'recapYearSelect') return selector;
      return null;
    },
  },
});

render();
assert.match(main.innerHTML, /id="statsPage"/);
assert.match(main.innerHTML, /Yearly Recap/);
assert.match(main.innerHTML, /Finished Book/);
assert.match(main.innerHTML, /stats-chart-grid/);
assert.match(main.innerHTML, /monthlyChartStub/);

listeners.get('change')({ target: { value: String(currentYear) } });
assert.equal(sessionStorage.getItem('libriq_stats_recap_year'), String(currentYear));
assert.equal(statsReads, 2);

console.log('Statistics page tests passed');
