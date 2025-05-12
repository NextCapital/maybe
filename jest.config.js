module.exports = {
  collectCoverage: true,
  collectCoverageFrom: [
    "js/**/*.js",
    "js/**/*.ts",
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
    'json',
    'ts'
  ],
  moduleDirectories: [
    'node_modules',
    'js'
  ],
  restoreMocks: true,
  testMatch: [
    "<rootDir>/js/**/*.test.js",
    "<rootDir>/js/**/*.test.ts"
  ],
  testResultsProcessor: "./node_modules/jest-junit-reporter",
  transform: {
    '^.+\.tsx?$': ['ts-jest',{}]
  }
};
