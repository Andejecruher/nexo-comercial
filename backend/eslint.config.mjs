import { FlatCompat } from '@eslint/eslintrc';
import js from '@eslint/js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
});

export default [
  {
    ignores: ['dist/', 'node_modules/', '*.js', '*.mjs', '**/*.mjs', '!.eslintrc.js', 'prisma/'],
  },
  ...compat.config({
    parser: '@typescript-eslint/parser',
    parserOptions: {
      project: [
        './tsconfig.json',
        './tsconfig.test.json',
        './prisma/seed/tsconfig.json',
        './scripts/tsconfig.json',
      ],
      tsconfigRootDir: __dirname,
      sourceType: 'module',
      ecmaVersion: 2021,
      ecmaFeatures: { jsx: true },
    },
    plugins: ['@typescript-eslint'],
    extends: [
      'eslint:recommended',
      'plugin:@typescript-eslint/recommended',
      'plugin:@typescript-eslint/recommended-type-checked',
    ],
    env: {
      node: true,
      es2021: true,
    },
    rules: {
      '@typescript-eslint/explicit-module-boundary-types': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      'no-unused-vars': 'off',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-require-imports': 'error',
      quotes: ['warn', 'single', { avoidEscape: true }],
      semi: ['warn', 'always'],
      'no-console': ['warn', { allow: ['warn', 'error', 'debug', 'log'] }],
      'no-eval': 'error',
      // Guard: nunca llamar deleteMany sin `where`. Un deleteMany sin filtro
      // vacía la tabla completa (incidente dev 2026-10-10 sobre messages).
      // En prod, el borrado masivo accidental es inaceptable y silencioso.
      'no-restricted-syntax': [
        'error',
        {
          selector: 'CallExpression[callee.property.name="deleteMany"][arguments.length=0]',
          message:
            'deleteMany() sin `where` está prohibido: puede vaciar la tabla completa. Pasá siempre un filtro `{ where: ... }` acotado.',
        },
        {
          selector:
            'CallExpression[callee.property.name="deleteMany"][arguments.0.type="ObjectExpression"]:not(:has(Property[key.name="where"]))',
          message:
            'deleteMany() sin `where` está prohibido: puede vaciar la tabla completa. Pasá siempre un filtro `{ where: ... }` acotado.',
        },
      ],
    },
    overrides: [
      {
        files: ['src/__tests__/**/*.{ts,tsx}', '**/*.test.ts', '**/*.spec.ts'],
        rules: {
          '@typescript-eslint/ban-ts-comment': 'off',
          '@typescript-eslint/no-require-imports': 'off',
          '@typescript-eslint/no-var-requires': 'off',
          '@typescript-eslint/require-await': 'off',
          '@typescript-eslint/no-unsafe-assignment': 'off',
          '@typescript-eslint/no-unsafe-member-access': 'off',
          '@typescript-eslint/no-unsafe-call': 'off',
          '@typescript-eslint/no-unsafe-return': 'off',
          '@typescript-eslint/no-unsafe-argument': 'off',
          '@typescript-eslint/no-explicit-any': 'off',
          '@typescript-eslint/no-unused-vars': 'off',
          'no-unused-vars': 'off',
        },
      },
    ],
  }),
];
