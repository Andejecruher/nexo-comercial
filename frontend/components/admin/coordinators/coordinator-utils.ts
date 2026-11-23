import type { CoordinatorDto } from '@/lib/coordinators-api';

export function formatCoordinatorDate(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' }).format(date);
}

export function getCoordinatorStatus(coordinator: CoordinatorDto): 'active' | 'inactive' {
  return coordinator.isActive ? 'active' : 'inactive';
}

export function filterCoordinators(
  coordinators: CoordinatorDto[],
  search: string,
  sectionId: string,
  structureId = 'all',
) {
  const query = search.trim().toLowerCase();
  return coordinators.filter((coordinator) => {
    const matchesQuery =
      !query ||
      coordinator.fullName.toLowerCase().includes(query) ||
      coordinator.email.toLowerCase().includes(query) ||
      (coordinator.section?.sectionCode ?? '').toLowerCase().includes(query) ||
      (coordinator.structure?.name ?? '').toLowerCase().includes(query);
    const matchesSection = !sectionId || sectionId === 'all' || coordinator.sectionId === sectionId;
    const matchesStructure =
      !structureId || structureId === 'all' || coordinator.structureId === structureId;
    return matchesQuery && matchesSection && matchesStructure;
  });
}
