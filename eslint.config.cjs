const babelParser = require('@babel/eslint-parser');

const baseConfig = require('@nextcapital/eslint-config');
const jestConfig = require('@nextcapital/eslint-config/jest');
const jsdocConfig = require('@nextcapital/eslint-config/jsdoc');

module.exports = [
  ...baseConfig,
  ...jestConfig,
  ...jsdocConfig,
  {
    languageOptions: {
      parser: babelParser,
      parserOptions: {
        ecmaVersion: 2016,
        sourceType: 'module',

        requireConfigFile: false
      }
    },
    settings: {
      jest: {
        version: 29 // TODO: Fix and remove
      }
    }
  },
  {
    rules: {
      'import/extensions': 'off',

      'jsdoc/require-param-description': 'off',
      'jsdoc/require-returns-description': 'off',

      'jsdoc/require-param-type': 'off',
      'jsdoc/require-returns-type': 'off'
    }
  }
];
