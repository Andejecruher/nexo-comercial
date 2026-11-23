import { precampanaApi } from '@/lib/precampana-api';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('precampana API', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('serializes coordinatorId and dates on the dashboard query string', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ total: 0 }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await precampanaApi.dashboard({
      coordinatorId: 'coord-1',
      from: '2026-08-01T00:00:00.000Z',
      to: '2026-08-15T00:00:00.000Z',
    });

    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(url).toContain('/analytics/precampana/dashboard?');
    expect(url).toContain('coordinatorId=coord-1');
    expect(url).toContain('from=2026-08-01T00%3A00%3A00.000Z');
    expect(url).toContain('to=2026-08-15T00%3A00%3A00.000Z');
  });

  it('keeps sectionId as the canonical section filter', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ total: 0 }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await precampanaApi.dashboard({ sectionId: 'section-1' });
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('sectionId=section-1');
    expect(String(fetchMock.mock.calls[0]?.[0])).not.toContain('sectionCode=');
  });

  it('loads filter-options from the precampana catalog endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          sections: [{ id: 'section-1', sectionCode: '2401' }],
          coordinators: [{ id: 'coord-1', fullName: 'Ana Torres' }],
          leaders: [{ id: 'leader-1', fullName: 'Juan Pérez' }],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const res = await precampanaApi.filterOptions();
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/analytics/precampana/filter-options');
    if (!res.ok) throw new Error(res.message);
    expect(res.data.coordinators[0]?.fullName).toBe('Ana Torres');
  });
});
