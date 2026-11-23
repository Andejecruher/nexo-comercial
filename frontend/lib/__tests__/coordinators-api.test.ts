import { coordinatorsApi } from '@/lib/coordinators-api';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('coordinators API', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('lists coordinators for a section through the /api/v1/coordinators endpoint', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ coordinators: [] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await coordinatorsApi.list({ sectionId: 'section-1' });
    expect(fetchMock.mock.calls[0]?.[0]).toContain('/coordinators?sectionId=section-1');

    await coordinatorsApi.list({ structureId: 'struct-1' });
    expect(fetchMock.mock.calls[1]?.[0]).toContain('/coordinators?structureId=struct-1');
  });

  it('POSTs a new coordinator with section, name, phone and email', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          coordinator: { id: 'coord-1', userId: 'user-1' },
          invitation: { id: 'inv-1', status: 'sent', expiresAt: '2026-09-01T00:00:00Z' },
        }),
        { status: 201 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const res = await coordinatorsApi.create({
      sectionId: 'section-1',
      fullName: 'Ana Torres',
      phone: '9611234567',
      email: 'ana@example.mx',
    });

    expect(fetchMock.mock.calls[0]?.[0]).toContain('/coordinators');
    const init = fetchMock.mock.calls[0]?.[1];
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe(
      JSON.stringify({
        sectionId: 'section-1',
        fullName: 'Ana Torres',
        phone: '9611234567',
        email: 'ana@example.mx',
      }),
    );
    if (!res.ok) throw new Error(`create failed: ${res.message}`);
    expect(res.data.coordinator.id).toBe('coord-1');
  });

  it('PATCHes a coordinator update and POSTs re-invite to /:id/reinvite', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ coordinator: { id: 'coord-1' } }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ invitation: { id: 'inv-2', status: 'sent', expiresAt: 'x' } }),
          { status: 200 },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);

    await coordinatorsApi.update('coord-1', { phone: '9998887777' });
    expect(fetchMock.mock.calls[0]?.[0]).toContain('/coordinators/coord-1');
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('PATCH');

    await coordinatorsApi.reinvite('coord-1');
    expect(fetchMock.mock.calls[1]?.[0]).toContain('/coordinators/coord-1/reinvite');
    expect(fetchMock.mock.calls[1]?.[1]?.method).toBe('POST');
  });

  it('DELETE soft-removes a coordinator', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ coordinator: { id: 'coord-1' } }), { status: 200 }),
      );
    vi.stubGlobal('fetch', fetchMock);

    await coordinatorsApi.remove('coord-1');
    expect(fetchMock.mock.calls[0]?.[0]).toContain('/coordinators/coord-1');
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('DELETE');
  });
});
