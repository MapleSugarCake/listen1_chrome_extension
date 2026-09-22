import { createRequire } from 'node:module';
import js from '@eslint/js';
import globals from 'globals';
import importPlugin from 'eslint-plugin-import-x';
import prettier from 'eslint-config-prettier';
const require = createRequire(import.meta.url);
const legacyRules = require('./config/legacy-rules.json');

export default [
  { ignores: ['node_modules/**', 'js/vendor/**', 'vendor/**'] },
  {
    files: ['js/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        ...globals.browser,
        axios: 'readonly',
        browser: 'readonly',
        chrome: 'readonly',
      },
    },
    // The alias preserves existing focused import/* inline directives.
    plugins: { import: importPlugin },
    rules: { ...js.configs.recommended.rules, ...legacyRules },
  },
  {
    files: ['scripts/**/*.cjs', 'test/**/*.cjs', 'eslint.config.mjs'],
    languageOptions: { ecmaVersion: 2022, globals: globals.node },
    rules: js.configs.recommended.rules,
  },
  prettier,
];
