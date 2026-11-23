import type { OrganizationalStructureDto } from '@/lib/structures-api';

export type StructureStatusFilter = 'all' | 'active' | 'inactive';

export const DEFAULT_STRUCTURE_COLOR = '#64748B';
export const HEX_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;

export function isHexColor(value: string): boolean {
  return HEX_COLOR_PATTERN.test(value.trim());
}

export function normalizeHexColor(value: string): string {
  return value.trim().toUpperCase();
}

export function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export function formatStructureManager(structure: OrganizationalStructureDto): string | null {
  const fullName = [structure.managerFirstName, structure.managerLastName]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' ');
  return fullName.length > 0 ? fullName : null;
}

export function filterStructures(
  structures: OrganizationalStructureDto[],
  search: string,
  statusFilter: StructureStatusFilter,
): OrganizationalStructureDto[] {
  const query = search.trim().toLowerCase();
  return structures.filter((structure) => {
    if (statusFilter === 'active' && !structure.isActive) return false;
    if (statusFilter === 'inactive' && structure.isActive) return false;
    if (!query) return true;
    const managerName = formatStructureManager(structure)?.toLowerCase() ?? '';
    const managerPhone = structure.managerPhone?.toLowerCase() ?? '';
    return (
      structure.name.toLowerCase().includes(query) ||
      structure.slug.toLowerCase().includes(query) ||
      managerName.includes(query) ||
      managerPhone.includes(query)
    );
  });
}
