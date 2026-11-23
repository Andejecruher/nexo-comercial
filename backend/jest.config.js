/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/src/__tests__'],
  testMatch: ['**/*.test.ts'],
  testPathIgnorePatterns: ['<rootDir>/src/__tests__/postgres/'],
  // isolatedModules lives in tsconfig.test.json (ts-jest v30 drops the option here).
  // Typecheck stays in `pnpm typecheck`; Jest only transpiles.
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: './tsconfig.test.json',
        diagnostics: false,
      },
    ],
  },
  setupFiles: ['<rootDir>/src/__tests__/setup/test-env.ts'],
  // Setup global para todos los tests (silencia logs, helpers de aserción)
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup/jest.setup.ts'],
  moduleNameMapper: {
    '^@prisma/client$': '<rootDir>/src/__tests__/__mocks__/@prisma/client.ts',
  },
  collectCoverageFrom: [
    'src/services/**/*.ts',
    'src/middlewares/**/*.ts',
    'src/utils/**/*.ts',
    '!src/services/prisma.service.ts',
  ],
  workerIdleMemoryLimit: '512MB',
  // clearMocks: limpia historial de llamadas. No usar resetMocks: true —
  // jest.resetAllMocks() elimina mockImplementation/mockReturnValue de
  // jest.fn(() => ...) y de fábricas jest.mock(), y deja 403/undefined en
  // tests que configuran el mock una sola vez al cargar el archivo.
  clearMocks: true,
  collectCoverage: false,
};
