/**
 * update-neighborhoods-geo.ts — Ensures geo-spatial/admin defaults on neighborhoods.
 *
 * Idempotent one-shot:
 *  - Sets `state='Chiapas'` and `stateCode='CHP'` on every row.
 *  - Leaves `postalCode`/`municipality` untouched (populated by the seeder).
 *  - Reports how many rows still lack postalCode/municipality.
 *
 * Uso (desde backend/):
 *   pnpm ts-node --project scripts/tsconfig.json prisma/scripts/update-neighborhoods-geo.ts
 */
import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(__dirname, '../../.env') });

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const total = await prisma.neighborhood.count();
  console.log(`Barrios encontrados: ${total}`);

  if (total === 0) {
    console.log('No hay filas que actualizar.');
    return;
  }

  const result = await prisma.neighborhood.updateMany({
    where: { OR: [{ state: { not: 'Chiapas' } }, { stateCode: { not: 'CHP' } }] },
    data: { state: 'Chiapas', stateCode: 'CHP' },
  });

  const missingPostalCode = await prisma.neighborhood.count({
    where: { OR: [{ postalCode: null }, { postalCode: '' }] },
  });
  const missingMunicipality = await prisma.neighborhood.count({
    where: { OR: [{ municipality: null }, { municipality: '' }] },
  });

  console.log(`\nFilas con state/stateCode corregidos: ${result.count}`);
  console.log(`Filas sin postalCode: ${missingPostalCode}`);
  console.log(`Filas sin municipality: ${missingMunicipality}`);
  console.log('\nLos campos faltantes se completan con el seeder (seedNeighborhoods).');
}

main()
  .catch((error) => {
    console.error('Error inesperado:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
