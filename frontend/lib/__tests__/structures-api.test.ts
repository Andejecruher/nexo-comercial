import { getStructureApiErrorMessage, structuresApi } from '@/lib/structures-api';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('structures API', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('lists structures and can include inactive ones', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ structures: [] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await structuresApi.list();
    expect(fetchMock.mock.calls[0]?.[0]).toContain('/structures');

    await structuresApi.list({ includeInactive: true });
    expect(fetchMock.mock.calls[1]?.[0]).toContain('/structures?includeInactive=true');
  });

  it('creates a structure by name', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          structure: { id: 'struct-1', name: 'Territorial', slug: 'territorial', isActive: true },
        }),
        { status: 201 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const res = await structuresApi.create({ name: 'Territorial', color: '#10B981' });
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('POST');
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(
      JSON.stringify({ name: 'Territorial', color: '#10B981' }),
    );
    if (!res.ok) throw new Error(res.message);
    expect(res.data.structure.slug).toBe('territorial');
  });

  it('PATCHes a structure name and DELETE soft-deactivates it', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            structure: { id: 'struct-1', name: 'Zona norte', slug: 'territorial', isActive: true },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            structure: { id: 'struct-1', name: 'Zona norte', slug: 'territorial', isActive: false },
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);

    await structuresApi.update('struct-1', { name: 'Zona norte' });
    expect(fetchMock.mock.calls[0]?.[0]).toContain('/structures/struct-1');
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('PATCH');
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(JSON.stringify({ name: 'Zona norte' }));

    await structuresApi.remove('struct-1');
    expect(fetchMock.mock.calls[1]?.[0]).toContain('/structures/struct-1');
    expect(fetchMock.mock.calls[1]?.[1]?.method).toBe('DELETE');
  });
});

describe('getStructureApiErrorMessage', () => {
  it('surfaces the backend 409 message so deactivation conflicts stay readable', () => {
    expect(
      getStructureApiErrorMessage(
        409,
        'No se puede desactivar la estructura mientras tenga coordinadores activos',
      ),
    ).toBe('No se puede desactivar la estructura mientras tenga coordinadores activos');
  });

  it('maps auth and not-found statuses without hiding the fallback', () => {
    expect(getStructureApiErrorMessage(403, 'x')).toBe(
      'No tenés permisos para gestionar estructuras.',
    );
    expect(getStructureApiErrorMessage(404, 'x')).toBe(
      'La estructura solicitada no existe o ya no está disponible.',
    );
  });
});
