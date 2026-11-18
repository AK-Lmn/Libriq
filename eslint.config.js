import js from '@eslint/js';
import globals from 'globals';

// Bug-catching rules only. Style is left alone; the goal is to stop
// undefined names, unreachable code and unused leftovers reaching main.
export default [
  {
    ignores: [
      'frontend/vendor/**',
      'frontend/js/config.local.js',
      'node_modules/**',
      'artifacts/**',
      'docs/**',
      '.claude/**',
      '.impeccable/**',
    ],
  },
  js.configs.recommended,
  {
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    rules: {
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none', ignoreRestSiblings: true }],
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-irregular-whitespace': ['error', { skipComments: true }],
    },
  },
  {
    files: ['frontend/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.browser },
    },
  },
  {
    files: ['frontend/service-worker.js'],
    languageOptions: { sourceType: 'script', globals: { ...globals.serviceworker } },
  },
  {
    files: ['scripts/**/*.{js,mjs}', 'tests/**/*.js', 'tests-emulator/**/*.mjs', 'server/**/*.{js,mjs}', 'api/**/*.js', 'emails/**/*.js', 'eslint.config.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      // Playwright scripts run page.evaluate() bodies in the browser.
      globals: { ...globals.node, ...globals.browser },
    },
  },
  {
    // page.evaluate() bodies read globals the page itself defines (fixtures,
    // LIBRIQ, Library), which no static scope can see.
    files: ['scripts/**/*.{js,mjs}'],
    rules: { 'no-undef': 'off' },
  },
];
