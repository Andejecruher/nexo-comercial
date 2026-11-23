/**
 * backfill-phone-e164.ts — Migra números de teléfono legacy al canónico E.164.
 *
 * Canónico de DB: dígitos E.164 sin "+" (ej. "529611234567", prefijo país + número).
 * Este script convierte valores legacy (10 dígitos MX sin "52", con "+", espacios,
 * guiones) al canónico de 12 dígitos en:
 *   - citizens.phone
 *
 * Idempotente y seguro:
 *  - Solo actualiza filas cuyo valor cambia tras normalizar.
 *  - DRY_RUN=true para simular sin escribir.
 *
 * Uso (desde backend/):
 *   pnpm ts-node --project scripts/tsconfig.json scripts/migrations/backfill-phone-e164.ts
 *   DRY_RUN=true pnpm ts-node --project scripts/tsconfig.json scripts/migrations/backfill-phone-e164.ts
 */
import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(__dirname, '../../.env') });

import { PrismaClient } from '@prisma/client';
import { normalizePhone } from '../../src/utils/hmac-index';

const prisma = new PrismaClient();
const DRY_RUN = process.env['DRY_RUN'] === 'true';

function log(level: 'info' | 'warn' | 'error', event: string, data?: object): void {
  console[level](
    JSON.stringify({
      ts: new Date().toISOString(),
      level,
      script: 'backfill-phone-e164',
      event,
      dryRun: DRY_RUN,
      ...data,
    }),
  );
}

/** Convierte a canónico E.164 los dígitos sin "+". Devuelve null si el valor
 * legacy tiene un formato que no resuelve (evita corromper lo desconocido). */
function toCanonical(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = normalizePhone(value);
  if (!normalized) return null;
  // No puede ser más corto que el propio E.164 base de un país de lada corta;
  // para el dominio MX el canónico válido tiene 12 dígitos con prefijo 52.
  if (!normalized.startsWith('52') || normalized.length < 12) return null;
  return normalized;
}

/**
 * Normaliza un `phone` legacy: agrega el prefijo país cuando el valor ya trae
 * 10 dígitos MX, y devuelve dígitos sin "+". NO intenta cambiar números que ya
 * tengan prefijo de otro país.
 */
export function normalizeLegacyPhone(value: string | null | undefined): string | null {
  if (!value) return null;
  return toCanonical(value);
}

async function main(): Promise<void> {
  log('info', 'migration.start');

  const stats = {
    citizens: 0,
  };

  // ── citizens.phone ────────────────────────────────────────────────────────
  const citizens = await prisma.citizen.findMany({
    select: { id: true, phone: true },
  });
  for (const c of citizens) {
    const canonical = normalizeLegacyPhone(c.phone);
    if (!canonical || canonical === c.phone) continue;
    log('warn', 'citizen.phone.update', { id: c.id, from: c.phone, to: canonical });
    stats.citizens += 1;
    if (!DRY_RUN) {
      await prisma.citizen.update({ where: { id: c.id }, data: { phone: canonical } });
    }
  }

  log('info', 'migration.complete', {
    stats,
    wrote: !DRY_RUN,
  });
}

main()
  .catch((error) => {
    console.error('Error inesperado:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
