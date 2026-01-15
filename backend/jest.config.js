module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts'],
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.test.ts', '!src/index.ts'],
  moduleNameMapper: {
    '^@cedar-terrace/shared$': '<rootDir>/../shared/src',
  },
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        isolatedModules: true,
        diagnostics: {
          ignoreCodes: [2345, 2322], // Ignore type assignment errors in tests
        },
      },
    ],
  },
};
