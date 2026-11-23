const CLAIM_PREFIX = 'vc:notify-claim:';
const CLAIM_TTL_MS = 5_000;
const CLEANUP_INTERVAL_MS = 30_000;

function isStorageAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const testKey = `${CLAIM_PREFIX}__test__`;
    window.localStorage.setItem(testKey, '1');
    window.localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

function nowMs(): number {
  return Date.now();
}

function readClaimTimestamp(key: string): number | undefined {
  if (!isStorageAvailable()) return undefined;
  const raw = window.localStorage.getItem(key);
  if (!raw) return undefined;
  const parsed = Number.parseInt(raw, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function writeClaimTimestamp(key: string, timestamp: number): void {
  if (!isStorageAvailable()) return;
  try {
    window.localStorage.setItem(key, timestamp.toString());
  } catch {
    // private mode / quota — no bloquear la entrega.
  }
}

function cleanupExpiredClaims(): void {
  if (!isStorageAvailable()) return;
  const now = nowMs();
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    if (!key?.startsWith(CLAIM_PREFIX)) continue;
    const ts = readClaimTimestamp(key);
    if (ts !== undefined && now - ts > CLAIM_TTL_MS) {
      try {
        window.localStorage.removeItem(key);
      } catch {
        // ignorar
      }
    }
  }
}

let cleanupStarted = false;
function ensureCleanupLoop(): void {
  if (cleanupStarted || typeof window === 'undefined') return;
  cleanupStarted = true;
  window.setInterval(cleanupExpiredClaims, CLEANUP_INTERVAL_MS);
}

function stableClaimKey(eventStableId: string): string {
  return `${CLAIM_PREFIX}${eventStableId}`;
}

function attemptClaim(eventStableId: string): boolean {
  ensureCleanupLoop();
  const key = stableClaimKey(eventStableId);
  const now = nowMs();
  const existing = readClaimTimestamp(key);
  if (existing !== undefined && now - existing < CLAIM_TTL_MS) {
    return false;
  }
  writeClaimTimestamp(key, now);
  // Doble lectura para reducir carrera entre pestañas (best-effort).
  const afterWrite = readClaimTimestamp(key);
  return afterWrite === now;
}

/**
 * Reclama la entrega de una notificación para esta pestaña.
 *
 * Usa Web Locks API cuando está disponible para serializar el reclamo entre
 * pestañas del mismo origen; si no, cae a localStorage con marca TTL.
 *
 * @returns `true` si esta pestaña debe entregar sonido/toast; `false` si otra
 *          pestaña ya lo está haciendo.
 */
export async function claimNotificationDelivery(eventStableId: string): Promise<boolean> {
  if (typeof window === 'undefined') return true;

  const locks = (window.navigator as Navigator & { locks?: LockManager }).locks;
  if (!locks) {
    return attemptClaim(eventStableId);
  }

  try {
    return await locks.request(
      `vc-notify-${eventStableId}`,
      { ifAvailable: true },
      async (lock) => {
        if (!lock) return false;
        return attemptClaim(eventStableId);
      },
    );
  } catch {
    return attemptClaim(eventStableId);
  }
}

/**
 * Genera un identificador estable para un evento notificable.
 * - Eventos durables: usa su `eventId`.
 * - Admin notifications: usa tipo + conversationId + occurredAt.
 */
export function buildEventStableId(eventType: string, payload: unknown): string {
  const typed = payload as { eventId?: string; conversationId?: string; occurredAt?: string };
  if (typed.eventId) return typed.eventId;
  return `${eventType}:${typed.conversationId ?? 'unknown'}:${typed.occurredAt ?? nowMs()}`;
}
