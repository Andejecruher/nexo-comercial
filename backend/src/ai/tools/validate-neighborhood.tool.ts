import { z } from 'zod';
import type { NeighborhoodRepository } from '../../repositories';

const validateNeighborhoodSchema = z.object({
  query: z.string().trim().min(2).max(120),
});

function normalizeNeighborhood(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export class ValidateNeighborhoodTool {
  readonly key = 'validateNeighborhood';

  constructor(private readonly neighborhoods: NeighborhoodRepository) {}

  async execute(input: unknown): Promise<unknown> {
    const parsed = validateNeighborhoodSchema.safeParse(input);
    if (!parsed.success) {
      return { error: 'INVALID_INPUT', details: parsed.error.issues };
    }

    const { query } = parsed.data;
    const normalized = normalizeNeighborhood(query);

    const exact = await this.neighborhoods.findByNameInsensitiveOrNameLower({
      name: query,
      nameLower: normalized,
    });

    if (exact) {
      return {
        valid: true,
        neighborhoodId: exact.id,
        neighborhoodName: exact.name,
        suggestions: [],
      };
    }

    const suggestions = await this.neighborhoods.listSuggestions({
      query,
      normalizedQuery: normalized,
      limit: 5,
    });

    return {
      valid: false,
      neighborhoodId: null,
      neighborhoodName: null,
      suggestions,
    };
  }
}
