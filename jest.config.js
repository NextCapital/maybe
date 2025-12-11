module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  collectCoverage: true,
  collectCoverageFrom: [
    "js/**/*.ts",
    '!js/index.ts',
    '!js/**/*.test.ts'
  ],
  coverageThreshold: {
    global: {
      statements: 100,
      branches: 100,
      functions: 100,
      lines: 100
    }
  },
  moduleFileExtensions: [
    'ts',
    'js',
    'json'
  ],
  moduleDirectories: [
    'node_modules',
    'js'
  ],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1'
  },
  testMatch: [
    "<rootDir>/js/**/*.test.ts"
  ],
  testResultsProcessor: "./node_modules/jest-junit-reporter",
  restoreMocks: true,
};
