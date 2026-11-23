/**
 * Caché en proceso del `COUNT(*)` del listado de tickets.
 *
 * El count es la parte cara de la paginación: recorre todas las filas que
 * matchean el WHERE. Los datos cambian lento para el ojo humano y el cliente
 * refresca las filas por su cuenta (realtime + polling), así que un TTL corto
 * de 30 s evita repetir el count en cada cambio de página.
 *
 * Es un Map por proceso: con N réplicas hay hasta N counts cada 30 s. Si el
 * volumen lo justifica, sustituir por Redis manteniendo la misma interfaz.
 */

const TTL_MS = 30_000;
const MAX_ENTRIES = 500;

interface CacheEntry {
  total: number;
  expiresAt: number;
}

const store = new Map<string, CacheEntry>();

/** Filtros que afectan el total. No incluye page/limit/sort: no cambian el count. */
export function totalCacheKey(filters: {
  status?: string;
  priority?: string;
  departmentSlug?: string;
  assignedUserId?: string;
  citizenId?: string;
  search?: string;
}): string {
  return JSON.stringify([
    filters.status ?? '',
    filters.priority ?? '',
    filters.departmentSlug ?? '',
    filters.assignedUserId ?? '',
    filters.citizenId ?? '',
    filters.search?.trim().toLowerCase() ?? '',
  ]);
}

export function getCachedTotal(key: string): number | undefined {
  const hit = store.get(key);
  if (!hit) return undefined;

  if (hit.expiresAt <= Date.now()) {
    store.delete(key);
    return undefined;
  }

  return hit.total;
}

export function setCachedTotal(key: string, total: number): void {
  if (store.size >= MAX_ENTRIES) {
    // Descarte FIFO simple: suficiente para un caché de 30 s.
    const oldest = store.keys().next().value;
    if (oldest !== undefined) store.delete(oldest);
  }

  store.set(key, { total, expiresAt: Date.now() + TTL_MS });
}

/** Solo para tests. */
export function clearTotalCache(): void {
  store.clear();
}
