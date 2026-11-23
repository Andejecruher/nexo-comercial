/**
 * Shared test helpers for environment variable mocking.
 *
 * Provides a consistent pattern for patching `process.env` in tests, replacing
 * the manual save/restore boilerplate scattered across test files.
 *
 * Usage:
 * ```ts
 * const restore = withEnv({ LOG_LEVEL: 'debug' });
 * try {
 *   // test code
 * } finally {
 *   restore();
 * }
 * ```
 *
 * For tests that need to patch the typed `env` config object, use
 * `withEnvConfig` instead.
 */

/**
 * Patches `process.env` with the given values and returns a restore function.
 *
 * - Keys set to `undefined` are **deleted** (simulating an unset variable).
 * - The original values are captured before patching and restored exactly.
 * - Safe to call multiple times; each call returns an independent restore.
 *
 * @example
 * const restore = withEnv({ LOG_LEVEL: 'debug', FEATURE_ENABLED: 'true' });
 * try {
 *   // code under test reads process.env.LOG_LEVEL
 * } finally {
 *   restore();
 * }
 */
export function withEnv(values: Record<string, string | undefined>): () => void {
  const original: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(values)) {
    original[key] = process.env[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  return () => {
    for (const [key, origValue] of Object.entries(original)) {
      if (origValue === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = origValue;
      }
    }
  };
}

/**
 * Patches the **typed env config object** (the zod-parsed `env` export from
 * `config/env.config.ts`) and returns a restore function.
 *
 * Use this when the code under test reads from the imported `env` object rather
 * than `process.env` directly.
 *
 * @example
 * import { env } from '../../config/env.config';
 * const restore = withEnvConfig(env, { LOG_LEVEL: 'debug' });
 * try {
 *   // code under test reads env.LOG_LEVEL
 * } finally {
 *   restore();
 * }
 */
export function withEnvConfig<T extends Record<string, unknown>>(
  target: T,
  values: Partial<T>,
): () => void {
  const original = { ...target };
  Object.assign(target, values);
  return () => Object.assign(target, original);
}
