const baseTSConfig = require('@nextcapital/eslint-config-typescript');
const jestTSConfig = require('@nextcapital/eslint-config-typescript/jest');
const jsdocTSConfig = require('@nextcapital/eslint-config-typescript/jsdoc');

const tsParser = require('@typescript-eslint/parser');

module.exports = [
  ...baseTSConfig,
  ...jestTSConfig,
  ...jsdocTSConfig,
  {
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2016,
        sourceType: 'module'
      }
    },
    settings: {
      jest: {
        version: 29
      }
    }
  },
  {
    rules: {
      '@stylistic/jsx-props-no-multi-spaces': 'off',

      'class-methods-use-this': 'off',

      'import/extensions': ['error', 'ignorePackages', {
        'ts': 'never'
      }],

      'jsdoc/require-param': 'off',
      'jsdoc/require-returns': 'off',

      'jsdoc/require-param-description': 'off',
      'jsdoc/require-returns-description': 'off',
      'jsdoc/valid-types': 'off',

      'no-template-curly-in-string': 'off'
    }
  },
  {
    files: ['js/**/*.test.ts'],
    rules: {
      'jsdoc/require-jsdoc': 'off'
    }
  }
];
