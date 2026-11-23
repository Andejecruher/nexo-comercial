export type DepartmentSlugCandidate = {
  slug: string;
  name: string;
};

export type DepartmentSlugResolution =
  | { status: 'matched'; slug: string }
  | { status: 'unknown'; candidates: [] }
  | { status: 'ambiguous'; candidates: string[] };

/**
 * Normaliza nombres y slugs para comparar variantes producidas por personas o IA.
 * Acentos, guiones, guiones bajos y espacios no afectan la comparación.
 */
export function normalizeDepartmentIdentifier(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[-_\s]+/g, ' ')
    .trim();
}

/**
 * Devuelve exclusivamente el slug canónico de una coincidencia única.
 * La coincidencia exacta por slug tiene prioridad sobre las variantes normalizadas.
 */
export function resolveCanonicalDepartmentSlug(
  value: string,
  departments: DepartmentSlugCandidate[],
): DepartmentSlugResolution {
  const exact = departments.find((department) => department.slug === value);
  if (exact) {
    return { status: 'matched', slug: exact.slug };
  }

  const normalizedValue = normalizeDepartmentIdentifier(value);
  const matchingSlugs = [
    ...new Set(
      departments
        .filter(
          (department) =>
            normalizeDepartmentIdentifier(department.slug) === normalizedValue ||
            normalizeDepartmentIdentifier(department.name) === normalizedValue,
        )
        .map((department) => department.slug),
    ),
  ];

  if (matchingSlugs.length === 1) {
    return { status: 'matched', slug: matchingSlugs[0] };
  }
  if (matchingSlugs.length > 1) {
    return { status: 'ambiguous', candidates: matchingSlugs };
  }
  return { status: 'unknown', candidates: [] };
}
