/** Tests run against a real PostgreSQL: TEST_DATABASE_URL if set (CI), otherwise an embedded one. */
module.exports = {
  rootDir: '.',
  testEnvironment: 'node',
  moduleFileExtensions: ['ts', 'js', 'json'],
  testRegex: '(test|src)/.*\.(spec|e2e-spec)\.ts$',
  transform: { '^.+\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json', isolatedModules: false }] },
  globalSetup: '<rootDir>/test/setup/global-setup.mjs',
  globalTeardown: '<rootDir>/test/setup/global-teardown.mjs',
  setupFiles: ['<rootDir>/test/setup/env.ts'],
  testTimeout: 30000,
};
