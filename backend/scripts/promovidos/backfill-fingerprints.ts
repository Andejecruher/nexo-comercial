/**
 * backfill-fingerprints.ts — Popula fingerprints de promovidos existentes.
 *
 * Es idempotente y seguro:
 *  - Descifra `dataEncrypted` de cada promovido.
 *  - Calcula HMACs de clave de elector, CURP y teléfono.
 *  - Genera tokens de búsqueda del nombre.
 *  - Detecta duplicados históricos de clave de elector y los reporta.
 *  - NO resuelve ni elimina duplicados automáticamente.
 *
 * Uso (desde backend/):
 *   pnpm ts-node --project scripts/tsconfig.json scripts/promovidos/backfill-fingerprints.ts
 */
import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(__dirname, '../../.env') });

import { PrismaClient } from '@prisma/client';
import { decrypt } from '../../src/utils/crypto';
import { fingerprint, nameSearchTokens, normalizePhone } from '../../src/utils/hmac-index';

const prisma = new PrismaClient();

type PromovidoData = {
  firstName?: string;
  paternalLastName?: string;
  maternalLastName?: string;
  voterKey?: string;
  curp?: string;
  manualPhone?: string;
  phone?: string;
};

function fullNameFrom(data: PromovidoData): string {
  return [data.firstName, data.paternalLastName, data.maternalLastName].filter(Boolean).join(' ');
}

async function main(): Promise<void> {
  const promovidos = await prisma.promovido.findMany({
    select: { id: true, dataEncrypted: true },
  });

  console.log(`Registros encontrados: ${promovidos.length}`);

  const byFingerprint = new Map<string, string[]>();
  const updates: Array<{
    id: string;
    voterKeyFingerprint: string | null;
    curpFingerprint: string | null;
    phoneFingerprint: string | null;
    nameSearchTokens: string[];
  }> = [];

  for (const row of promovidos) {
    let data: PromovidoData = {};
    try {
      data = JSON.parse(decrypt(row.dataEncrypted)) as PromovidoData;
    } catch (error) {
      console.error(`[${row.id}] No se pudo descifrar dataEncrypted:`, (error as Error).message);
      continue;
    }

    const voterKeyFingerprint = fingerprint(data.voterKey);
    const curpFingerprint = fingerprint(data.curp);
    const phoneFingerprint = fingerprint(
      normalizePhone(data.manualPhone ?? data.phone) ?? undefined,
    );
    const tokens = nameSearchTokens(fullNameFrom(data));

    if (voterKeyFingerprint) {
      const bucket = byFingerprint.get(voterKeyFingerprint) ?? [];
      bucket.push(row.id);
      byFingerprint.set(voterKeyFingerprint, bucket);
    }

    updates.push({
      id: row.id,
      voterKeyFingerprint,
      curpFingerprint,
      phoneFingerprint,
      nameSearchTokens: tokens,
    });
  }

  const duplicates: Array<{ fingerprint: string; ids: string[] }> = [];
  for (const [fingerprintValue, ids] of byFingerprint.entries()) {
    if (ids.length > 1) duplicates.push({ fingerprint: fingerprintValue, ids });
  }

  if (duplicates.length > 0) {
    console.warn('\n⚠️  Duplicados históricos de clave de elector detectados:');
    for (const dup of duplicates) {
      console.warn(`  fingerprint=${dup.fingerprint} -> ids=${dup.ids.join(', ')}`);
    }
    console.warn(
      '\nNo se aplicarán actualizaciones a registros con clave duplicada. ' +
        'Resolvé los conflictos manualmente y volvé a ejecutar el script.',
    );
  }

  const duplicateIds = new Set(duplicates.flatMap((dup) => dup.ids));
  let updatedCount = 0;

  for (const update of updates) {
    if (duplicateIds.has(update.id)) continue;

    await prisma.promovido.update({
      where: { id: update.id },
      data: {
        voterKeyFingerprint: update.voterKeyFingerprint,
        curpFingerprint: update.curpFingerprint,
        phoneFingerprint: update.phoneFingerprint,
        nameSearchTokens: update.nameSearchTokens,
      },
    });
    updatedCount += 1;
  }

  console.log(`\nActualizados: ${updatedCount}/${promovidos.length}`);
  console.log(`Omitidos por duplicado: ${duplicateIds.size}`);
}

main()
  .catch((error) => {
    console.error('Error inesperado:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
