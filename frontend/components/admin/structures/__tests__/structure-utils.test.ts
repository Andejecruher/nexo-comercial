import {
  DEFAULT_STRUCTURE_COLOR,
  filterStructures,
  formatStructureManager,
  isHexColor,
} from '@/components/admin/structures/structure-utils';
import type { OrganizationalStructureDto } from '@/lib/structures-api';
import { describe, expect, it } from 'vitest';

const structures: OrganizationalStructureDto[] = [
  {
    id: 'st-1',
    slug: 'territorial',
    name: 'Territorial',
    color: '#10B981',
    managerFirstName: 'Ana',
    managerLastName: 'Torres',
    managerPhone: '+529611234567',
    isActive: true,
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
  },
  {
    id: 'st-2',
    slug: 'movil',
    name: 'Móvil',
    color: DEFAULT_STRUCTURE_COLOR,
    isActive: false,
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
  },
];

describe('filterStructures', () => {
  it('hides inactive structures unless the status filter includes them', () => {
    expect(filterStructures(structures, '', 'active')).toEqual([structures[0]]);
    expect(filterStructures(structures, '', 'inactive')).toEqual([structures[1]]);
    expect(filterStructures(structures, '', 'all')).toEqual(structures);
  });

  it('matches name, slug or encargado without depending on accents in the query', () => {
    expect(filterStructures(structures, 'movil', 'all')).toEqual([structures[1]]);
    expect(filterStructures(structures, 'Territorial', 'active')).toEqual([structures[0]]);
    expect(filterStructures(structures, 'torres', 'all')).toEqual([structures[0]]);
    expect(filterStructures(structures, '9611234567', 'all')).toEqual([structures[0]]);
  });
});

describe('structure color and manager helpers', () => {
  it('accepts 6-digit HEX colors and formats the encargado name', () => {
    expect(isHexColor('#10b981')).toBe(true);
    expect(isHexColor('#FFF')).toBe(false);
    expect(formatStructureManager(structures[0])).toBe('Ana Torres');
    expect(formatStructureManager(structures[1])).toBeNull();
  });
});
