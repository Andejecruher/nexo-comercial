import { ineOcrApi } from '@/lib/ine-ocr-api';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('INE electoral catalog API', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('requests leaders for the selected section and creates a section with its hierarchy', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ leaders: [] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await ineOcrApi.catalog.listLeaders({ sectionId: 'section id' });
    expect(fetchMock.mock.calls[0]?.[0]).toContain('/ine-ocr/catalog/leaders?sectionId=section+id');

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ section: { id: 'section-1' } }), { status: 201 }),
    );
    await ineOcrApi.catalog.createSection({
      stateId: 'state-1',
      districtId: 'district-1',
      sectionCode: '42',
    });
    expect(fetchMock.mock.calls[1]?.[0]).toContain('/ine-ocr/catalog/sections');
    expect(fetchMock.mock.calls[1]?.[1]?.body).toBe(
      JSON.stringify({ stateId: 'state-1', districtId: 'district-1', sectionCode: '42' }),
    );
  });

  it('requests leaders with search, coordinator and pagination params', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ leaders: [] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await ineOcrApi.catalog.listLeaders({
      coordinatorId: 'coord-1',
      q: 'ana',
      includeInactive: true,
      page: 2,
      pageSize: 10,
    });
    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(url).toContain('/ine-ocr/catalog/leaders?');
    expect(url).toContain('coordinatorId=coord-1');
    expect(url).toContain('q=ana');
    expect(url).toContain('includeInactive=true');
    expect(url).toContain('page=2');
    expect(url).toContain('pageSize=10');
  });

  it('reinvites a leader through POST /catalog/leaders/:id/reinvite', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ invitation: { id: 'inv-1' } }), { status: 200 }),
      );
    vi.stubGlobal('fetch', fetchMock);

    await ineOcrApi.catalog.reinviteLeader('leader-1');
    expect(fetchMock.mock.calls[0]?.[0]).toContain('/ine-ocr/catalog/leaders/leader-1/reinvite');
  });
});
