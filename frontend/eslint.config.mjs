import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTypeScript from 'eslint-config-next/typescript';
import prettierConfig from 'eslint-config-prettier';
import prettierPlugin from 'eslint-plugin-prettier';
import { defineConfig, globalIgnores } from 'eslint/config';

/** @type {import('eslint').Linter.Config[]} */
const config = defineConfig([
  ...nextVitals,
  ...nextTypeScript,

  // TypeScript overrides
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      prettier: prettierPlugin,
    },
    rules: {
      'prettier/prettier': 'error',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      'react/self-closing-comp': 'warn',
    },
  },

  // Prettier last — disables conflicting rules
  prettierConfig,

  // Overrides: silence rules that don't apply in this project context
  {
    rules: {
      // react-compiler plugin is not installed; disable its rules to avoid "not found" errors
      'react-compiler/react-compiler': 'off',
      // These patterns are intentional (shadcn/ui components, mock data components)
      'react/no-unstable-nested-components': 'off',
      // setState inside effects is a valid pattern for syncing derived state
      'react-hooks/set-state-in-effect': 'off',
      // Nested component definitions are acceptable for small UI helpers
      'react-hooks/static-components': 'off',
      // Math.random() in useMemo is intentional for skeleton width variation
      'react-hooks/purity': 'off',
    },
  },

  // Ignores
  globalIgnores([
    '.next/**',
    'node_modules/**',
    'dist/**',
    'out/**',
    'public/**',
    'next-env.d.ts',
    'next.config.mjs',
    'postcss.config.mjs',
  ]),
]);

export default config;
