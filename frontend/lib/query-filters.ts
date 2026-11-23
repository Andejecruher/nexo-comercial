/**
 * Query Filters Utilities — Client-side filtering, sorting, pagination
 *
 * Utilidades para normalización de búsqueda, sorting y paginación client-side.
 * Preparadas para reutilización en múltiples vistas de catálogos.
 */

// ─── Search Normalization ────────────────────────────────────────────────────

/**
 * Normaliza un string de búsqueda (trim, lowercase, elimina acentos)
 */
export function normalizeSearch(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, ''); // Elimina acentos
}

/**
 * Verifica si un texto contiene el término de búsqueda (case-insensitive, sin acentos)
 */
export function matchesSearch(text: string, search: string): boolean {
  if (!search.trim()) return true;
  return normalizeSearch(text).includes(normalizeSearch(search));
}

// ─── Sorting ─────────────────────────────────────────────────────────────────

export type SortDirection = 'asc' | 'desc';

/**
 * Compara dos valores para sorting (strings, numbers, dates)
 */
export function compareValues<T>(a: T, b: T, direction: SortDirection = 'asc'): number {
  // Handle undefined/null
  if (a === undefined || a === null) return direction === 'asc' ? 1 : -1;
  if (b === undefined || b === null) return direction === 'asc' ? -1 : 1;

  // String comparison (case-insensitive)
  if (typeof a === 'string' && typeof b === 'string') {
    const comparison = a.toLowerCase().localeCompare(b.toLowerCase());
    return direction === 'asc' ? comparison : -comparison;
  }

  // Number comparison
  if (typeof a === 'number' && typeof b === 'number') {
    return direction === 'asc' ? a - b : b - a;
  }

  // Date comparison
  if (a instanceof Date && b instanceof Date) {
    return direction === 'asc' ? a.getTime() - b.getTime() : b.getTime() - a.getTime();
  }

  // Fallback: convert to string
  const strA = String(a);
  const strB = String(b);
  const comparison = strA.toLowerCase().localeCompare(strB.toLowerCase());
  return direction === 'asc' ? comparison : -comparison;
}

/**
 * Ordena un array por una key con dirección especificada
 */
export function sortByKey<T>(items: T[], key: keyof T, direction: SortDirection = 'asc'): T[] {
  return [...items].sort((a, b) => compareValues(a[key], b[key], direction));
}

// ─── Pagination ──────────────────────────────────────────────────────────────

export interface PaginationOptions {
  page: number;
  pageSize: number;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

/**
 * Aplica paginación client-side a un array
 */
export function paginateItems<T>(items: T[], options: PaginationOptions): PaginatedResult<T> {
  const { page, pageSize } = options;
  const total = items.length;
  const totalPages = Math.ceil(total / pageSize);
  const startIndex = (page - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedItems = items.slice(startIndex, endIndex);

  return {
    items: paginatedItems,
    total,
    page,
    pageSize,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
  };
}

// ─── Array Utilities ─────────────────────────────────────────────────────────

/**
 * Extrae valores únicos de un array (case-insensitive para strings)
 */
export function uniqueValues<T>(items: T[], key: keyof T): Array<T[keyof T]> {
  const seen = new Set<string>();
  const result: Array<T[keyof T]> = [];

  for (const item of items) {
    const value = item[key];
    if (value === undefined || value === null) continue;

    const normalized = typeof value === 'string' ? value.toLowerCase() : String(value);
    if (!seen.has(normalized)) {
      seen.add(normalized);
      result.push(value);
    }
  }

  return result;
}

/**
 * Filtra items que tengan un valor específico en una key (case-insensitive para strings)
 */
export function filterByValue<T>(items: T[], key: keyof T, value: T[keyof T] | undefined): T[] {
  if (value === undefined) return items;

  return items.filter((item) => {
    const itemValue = item[key];
    if (typeof itemValue === 'string' && typeof value === 'string') {
      return itemValue.toLowerCase() === value.toLowerCase();
    }
    return itemValue === value;
  });
}
