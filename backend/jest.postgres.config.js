/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/src/__tests__/postgres'],
  testMatch: ['**/*.postgres.test.ts'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: './tsconfig.test.json',
        diagnostics: false,
      },
    ],
  },
  setupFiles: [
    '<rootDir>/src/__tests__/setup/postgres-env.ts',
    '<rootDir>/src/__tests__/setup/test-env.ts',
  ],
  // No moduleNameMapper for @prisma/client: tests use the real Prisma Client.
};
