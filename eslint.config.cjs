const babelParser = require('@babel/eslint-parser');
const typescriptParser = require('@typescript-eslint/parser');
const typescriptPlugin = require('@typescript-eslint/eslint-plugin');

const baseConfig = require('@nextcapital/eslint-config');
const jestConfig = require('@nextcapital/eslint-config/jest');
const jsdocConfig = require('@nextcapital/eslint-config/jsdoc');

module.exports = [
  ...baseConfig,
  ...jestConfig,
  ...jsdocConfig,
  {
    files: ['**/*.js', '**/*.cjs', '**/*.mjs'],
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
        version: 29
      }
    }
  },
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module',
        project: ['./tsconfig.json', './tsconfig.test.json']
      }
    },
    plugins: {
      '@typescript-eslint': typescriptPlugin
    },
    rules: {
      ...typescriptPlugin.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { 
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_'
      }]
    },
    settings: {
      jest: {
        version: 29
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
