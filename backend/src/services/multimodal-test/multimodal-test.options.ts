/**
 * multimodal-test.options.ts — Query-string option parsing for the internal
 * test endpoints. Never throws: unknown or invalid values are dropped per
 * field and defaults apply, so a bad query never blocks a test upload.
 */
import { z } from 'zod';
import { MultimodalTestOptions } from './contracts';

/** Booleans accepted as 1/true/yes/on and 0/false/no/off (case-insensitive). */
const looseBoolean = z.preprocess((value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized.length === 0) return undefined;
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
  return undefined;
}, z.boolean().optional());

/** Bounded integer: junk values become undefined instead of failing the parse. */
const boundedInt = (min: number, max: number) =>
  z.preprocess(
    (value) => {
      if (typeof value !== 'string' && typeof value !== 'number') return undefined;
      const num = Number(value);
      return Number.isFinite(num) ? num : undefined;
    },
    z.coerce.number().int().min(min).max(max).optional(),
  );

const optionsSchema = z
  .object({
    forceOcr: looseBoolean,
    ocrFallback: looseBoolean,
    extractFrames: looseBoolean,
    maxFrames: boundedInt(1, 10),
    chunkText: looseBoolean,
    chunkSize: boundedInt(200, 8000),
    summary: looseBoolean,
    provider: z.preprocess(
      (value) => (typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined),
      z.string().min(1).max(64).optional(),
    ),
    timeoutMs: boundedInt(1_000, 600_000),
    includeRawProviderResponse: looseBoolean,
  })
  .strip();

/**
 * Parses MultimodalTestOptions from an Express query object.
 * Invalid or unknown values are silently dropped.
 */
export function parseMultimodalTestOptions(
  query: Record<string, unknown> | undefined,
): MultimodalTestOptions {
  if (!query) return {};
  const parsed = optionsSchema.safeParse(query);
  return parsed.success ? parsed.data : {};
}
