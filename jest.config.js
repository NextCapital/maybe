module.exports = {
  collectCoverage: true,
  collectCoverageFrom: [
    "js/**/*.js",
    '!js/index.js'
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
    'js',
    'json'
  ],
  moduleDirectories: [
    'node_modules',
    'js'
  ],
  testMatch: [
    "<rootDir>/js/**/*.test.js"
  ],
  testResultsProcessor: "./node_modules/jest-junit-reporter",
  restoreMocks: true,
};
