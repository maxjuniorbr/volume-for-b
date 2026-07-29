import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores: ['node_modules/', 'build/', '*.zip']
  },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        chrome: 'readonly',
        // Globals provided by constants.js (loaded via importScripts/<script>)
        VOLUME_MIN: 'readonly',
        VOLUME_MAX: 'readonly',
        VOLUME_DEFAULT: 'readonly',
        DOMAIN_MAX_AGE_DAYS: 'readonly',
        DOMAIN_KEY_PREFIX: 'readonly',
        CLEANUP_ALARM_NAME: 'readonly',
        CLEANUP_PERIOD_MINUTES: 'readonly',
        POPUP_PORT_NAME: 'readonly',
        SEND_MESSAGE_RETRIES: 'readonly',
        SEND_MESSAGE_BASE_DELAY_MS: 'readonly',
        ERROR_TOAST_MS: 'readonly',
        TAB_TITLE_MAX: 'readonly',
        FAVICON_URL_MAX: 'readonly',
        ErrorCodes: 'readonly',
        clampVolume: 'readonly',
        resolveGain: 'readonly',
        // SW-specific
        importScripts: 'readonly'
      }
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
      'no-console': 'off',
      'prefer-const': 'error',
      'no-var': 'error',
      eqeqeq: ['error', 'always'],
      curly: ['error', 'all'],
      'brace-style': ['error', '1tbs'],
      indent: ['error', 2],
      quotes: ['error', 'single', { avoidEscape: true }],
      semi: ['error', 'always'],
      'comma-dangle': ['error', 'never'],
      'no-trailing-spaces': 'error',
      'eol-last': ['error', 'always']
    }
  },
  {
    files: ['build-production.js', 'build.config.example.js'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.es2022
      }
    }
  },
  {
    // constants.js exposes top-level identifiers as globals via importScripts
    // and <script> tag inclusion. ESLint cannot see those cross-file uses.
    files: ['constants.js'],
    rules: {
      'no-unused-vars': 'off'
    }
  }
];
