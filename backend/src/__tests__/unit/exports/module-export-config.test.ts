import { describe, expect, it, jest } from '@jest/globals';
import { resolveExportModule } from '../../../services/exports/module-export-config';

describe('module export configuration', () => {
  const paginationFields = ['take', 'skip', 'limit', 'cursor', 'page', 'pageSize', 'offset'];

  it.each(['promoted', 'simpatizantes', 'leaders', 'coordinators'])(
    'rejects removed export module %s',
    (module) => {
      expect(() => resolveExportModule(module)).toThrow('Unsupported export module');
    },
  );

  it('resolves citizens as the only export module', () => {
    expect(resolveExportModule('citizens').module).toBe('citizens');
  });

  it('rejects every pagination field for citizens', () => {
    const schema = resolveExportModule('citizens').filterSchema;
    for (const field of paginationFields) {
      expect(() => schema.parse({ [field]: 1 })).toThrow();
    }
  });

  it('rejects unknown filters for citizens', () => {
    expect(() => resolveExportModule('citizens').filterSchema.parse({ unknownField: true })).toThrow();
  });

  it('queries citizens without a promoted territorial relation', async () => {
    const findMany = jest.fn(async () => []);
    const config = resolveExportModule('citizens');

    await config.fetchPage(
      { citizen: { findMany } } as never,
      { kind: 'admin' },
      { search: 'Ana' },
    );

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { name: { contains: 'Ana', mode: 'insensitive' } },
            { lastName: { contains: 'Ana', mode: 'insensitive' } },
            { email: { contains: 'Ana', mode: 'insensitive' } },
          ],
        },
      }),
    );
  });
});