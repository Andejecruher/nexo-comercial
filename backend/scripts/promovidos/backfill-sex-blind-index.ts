/**
 * backfill-sex-blind-index.ts — Popula `sexBlindIndex` de promovidos existentes.
 *
 * Es idempotente y seguro:
 *  - Solo toca registros con `sexBlindIndex` nulo.
 *  - Descifra `dataEncrypted` para leer `sex` y calcula el blind index HMAC.
 *  - NO modifica el JSON cifrado ni ningún otro campo.
 *  - Reporta los registros sin sexo o que no se pudieron descifrar.
 *
 * Uso (desde backend/):
 *   pnpm ts-node --project scripts/tsconfig.json scripts/promovidos/backfill-sex-blind-index.ts
 */
import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(__dirname, '../../.env') });

import { PrismaClient } from '@prisma/client';
import { sexBlindIndex } from '../../src/services/ine/promovido-validations';
import { decrypt } from '../../src/utils/crypto';

const prisma = new PrismaClient();

type PromovidoData = {
  sex?: string;
};

async function main(): Promise<void> {
  const promovidos = await prisma.promovido.findMany({
    where: { sexBlindIndex: null },
    select: { id: true, dataEncrypted: true },
  });

  console.log(`Registros pendientes: ${promovidos.length}`);

  let updatedCount = 0;
  let withoutSex = 0;
  let undecryptable = 0;

  for (const row of promovidos) {
    let data: PromovidoData = {};
    try {
      data = JSON.parse(decrypt(row.dataEncrypted)) as PromovidoData;
    } catch (error) {
      console.error(`[${row.id}] No se pudo descifrar dataEncrypted:`, (error as Error).message);
      undecryptable += 1;
      continue;
    }

    const hash = sexBlindIndex(data.sex);
    if (!hash) {
      withoutSex += 1;
      continue;
    }

    await prisma.promovido.update({
      where: { id: row.id },
      data: { sexBlindIndex: hash },
    });
    updatedCount += 1;
  }

  console.log(`\nActualizados: ${updatedCount}/${promovidos.length}`);
  console.log(`Sin sexo registrado (se dejan en null): ${withoutSex}`);
  console.log(`No descifrables: ${undecryptable}`);
}

main()
  .catch((error) => {
    console.error('Error inesperado:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
