import { filterCoordinators } from '@/components/admin/coordinators/coordinator-utils';
import type { CoordinatorDto } from '@/lib/coordinators-api';
import { describe, expect, it } from 'vitest';

const coordinators: CoordinatorDto[] = [
  {
    id: 'c1',
    fullName: 'Ana Torres',
    email: 'ana@test.mx',
    sectionId: 'sec-1',
    structureId: 'st-1',
    isActive: true,
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
    section: { id: 'sec-1', sectionCode: '0042' },
    structure: { id: 'st-1', name: 'Territorial', slug: 'territorial', color: '#10B981' },
  },
  {
    id: 'c2',
    fullName: 'Luis Mora',
    email: 'luis@test.mx',
    sectionId: 'sec-2',
    structureId: null,
    isActive: true,
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
    section: { id: 'sec-2', sectionCode: '0099' },
  },
];

describe('filterCoordinators', () => {
  it('filters by structure and keeps unmatched names out', () => {
    expect(filterCoordinators(coordinators, '', 'all', 'st-1')).toEqual([coordinators[0]]);
    expect(filterCoordinators(coordinators, 'luis', 'all', 'all')).toEqual([coordinators[1]]);
  });
});
