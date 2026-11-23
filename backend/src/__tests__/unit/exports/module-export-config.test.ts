import { describe, expect, it } from '@jest/globals';
import { resolveExportModule } from '../../../services/exports/module-export-config';

describe('module export configuration', () => {
  const modules = ['promoted', 'leaders', 'coordinators', 'citizens'] as const;
  const paginationFields = ['take', 'skip', 'limit', 'cursor', 'page', 'pageSize', 'offset'];

  it('maps simpatizantes to promoted and rejects pagination filters', () => {
    expect(resolveExportModule('simpatizantes').module).toBe('promoted');
    expect(() => resolveExportModule('leaders').filterSchema.parse({ take: 100 })).toThrow();
  });

  it('rejects every pagination field across all modules', () => {
    for (const module of modules) {
      const schema = resolveExportModule(module).filterSchema;
      for (const field of paginationFields) {
        expect(() => schema.parse({ [field]: 1 })).toThrow();
      }
    }
  });

  it('accepts the exact promoted filter set including leaderId and sex', () => {
    const output = resolveExportModule('promoted').filterSchema.parse({
      q: 'ana',
      leaderId: '550e8400-e29b-41d4-a716-446655440000',
      sex: 'M',
    });
    expect(output).toEqual({
      q: 'ana',
      leaderId: '550e8400-e29b-41d4-a716-446655440000',
      sex: 'M',
    });
  });

  it('rejects unknown filters for citizens', () => {
    expect(() => resolveExportModule('citizens').filterSchema.parse({ unknownField: true })).toThrow();
  });

  it('rejects unknown filters for leaders and coordinators too', () => {
    expect(() => resolveExportModule('leaders').filterSchema.parse({ bogus: 1 })).toThrow();
    expect(() => resolveExportModule('coordinators').filterSchema.parse({ bogus: 1 })).toThrow();
  });
});