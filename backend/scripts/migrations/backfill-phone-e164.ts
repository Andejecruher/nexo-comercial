/**
 * backfill-phone-e164.ts — Migra números de teléfono legacy al canónico E.164.
 *
 * Canónico de DB: dígitos E.164 sin "+" (ej. "529611234567", prefijo país + número).
 * Este script convierte valores legacy (10 dígitos MX sin "52", con "+", espacios,
 * guiones) al canónico de 12 dígitos en:
 *   - citizens.phone
 *   - leaders.phone
 *   - coordinators.phone
 *   - promovidos.dataEncrypted (phone / manualPhone) + phoneFingerprint
 *   - upload_records.manual_phone_encrypted
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
import { decrypt, encrypt } from '../../src/utils/crypto';
import { fingerprint, normalizePhone } from '../../src/utils/hmac-index';

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

type PromovidoData = {
  phone?: string;
  manualPhone?: string;
};

async function main(): Promise<void> {
  log('info', 'migration.start');

  const stats = {
    citizens: 0,
    leaders: 0,
    coordinators: 0,
    promovidos: 0,
    promovidoFingerprints: 0,
    uploadRecords: 0,
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

  // ── leaders.phone ─────────────────────────────────────────────────────────
  const leaders = await prisma.leader.findMany({ select: { id: true, phone: true } });
  for (const l of leaders) {
    const canonical = normalizeLegacyPhone(l.phone);
    if (!canonical || canonical === l.phone) continue;
    log('warn', 'leader.phone.update', { id: l.id, from: l.phone, to: canonical });
    stats.leaders += 1;
    if (!DRY_RUN) {
      await prisma.leader.update({ where: { id: l.id }, data: { phone: canonical } });
    }
  }

  // ── coordinators.phone ────────────────────────────────────────────────────
  const coordinators = await prisma.coordinator.findMany({ select: { id: true, phone: true } });
  for (const co of coordinators) {
    const canonical = normalizeLegacyPhone(co.phone);
    if (!canonical || canonical === co.phone) continue;
    log('warn', 'coordinator.phone.update', { id: co.id, from: co.phone, to: canonical });
    stats.coordinators += 1;
    if (!DRY_RUN) {
      await prisma.coordinator.update({ where: { id: co.id }, data: { phone: canonical } });
    }
  }

  // ── promovidos.dataEncrypted + phoneFingerprint ──────────────────────────
  const promovidos = await prisma.promovido.findMany({
    select: { id: true, dataEncrypted: true, phoneFingerprint: true },
  });
  for (const p of promovidos) {
    let data: PromovidoData;
    try {
      data = JSON.parse(decrypt(p.dataEncrypted)) as PromovidoData;
    } catch (error) {
      log('error', 'promovido.decrypt.failed', {
        id: p.id,
        error: (error as Error).message,
      });
      continue;
    }

    const raw = data.manualPhone ?? data.phone;
    const canonical = normalizeLegacyPhone(raw);
    let persistData = false;

    if (canonical && canonical !== raw) {
      const next: PromovidoData = { ...data };
      if (canonical !== data.phone) next.phone = canonical;
      if (canonical !== data.manualPhone) next.manualPhone = canonical;
      data = next;
      persistData = true;
      stats.promovidos += 1;
    }

    const newFingerprint = fingerprint(canonical ?? undefined) ?? null;
    const fingerprintChanged = newFingerprint !== p.phoneFingerprint;
    if (fingerprintChanged) stats.promovidoFingerprints += 1;

    if ((persistData || fingerprintChanged) && !DRY_RUN) {
      await prisma.promovido.update({
        where: { id: p.id },
        data: {
          ...(persistData ? { dataEncrypted: encrypt(JSON.stringify(data)) } : {}),
          ...(fingerprintChanged ? { phoneFingerprint: newFingerprint } : {}),
        },
      });
    }

    if (persistData || fingerprintChanged) {
      log('warn', 'promovido.phone.update', {
        id: p.id,
        from: raw,
        to: canonical,
        fingerprintChanged,
      });
    }
  }

  // ── upload_records.manual_phone_encrypted ─────────────────────────────────
  const uploadRecords = await prisma.uploadRecord.findMany({
    select: { id: true, manualPhoneEncrypted: true },
    where: { manualPhoneEncrypted: { not: null } },
  });
  for (const u of uploadRecords) {
    if (!u.manualPhoneEncrypted) continue;
    let raw: string;
    try {
      raw = decrypt(u.manualPhoneEncrypted);
    } catch (error) {
      log('error', 'uploadRecord.decrypt.failed', {
        id: u.id,
        error: (error as Error).message,
      });
      continue;
    }
    const canonical = normalizeLegacyPhone(raw);
    if (!canonical || canonical === raw) continue;
    log('warn', 'uploadRecord.manualPhone.update', { id: u.id, from: raw, to: canonical });
    stats.uploadRecords += 1;
    if (!DRY_RUN) {
      await prisma.uploadRecord.update({
        where: { id: u.id },
        data: { manualPhoneEncrypted: encrypt(canonical) },
      });
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
