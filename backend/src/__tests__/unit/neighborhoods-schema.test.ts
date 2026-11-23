import { describe, expect, it } from '@jest/globals';
import {
  CreateNeighborhoodSchema,
  NeighborhoodListFiltersSchema,
  UpdateNeighborhoodSchema,
} from '../../services/neighborhoods.service';

describe('neighborhood schemas', () => {
  it.each([
    [CreateNeighborhoodSchema, { name: 'Centro', sectionId: crypto.randomUUID() }],
    [UpdateNeighborhoodSchema, { name: 'Centro', sectionId: crypto.randomUUID() }],
    [NeighborhoodListFiltersSchema, { sectionId: crypto.randomUUID() }],
  ])('rejects the removed electoral section contract', (schema, input) => {
    expect(schema.safeParse(input).success).toBe(false);
  });
});
