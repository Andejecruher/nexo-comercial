/**
 * `tsc` only emits JavaScript, so the inline logo attached to every transactional
 * email would be missing from dist/. Mirror the asset folder after each build.
 */
import { cpSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const source = fileURLToPath(new URL('../src/services/email/assets/', import.meta.url));
const target = fileURLToPath(new URL('../dist/services/email/assets/', import.meta.url));

if (!existsSync(source)) {
  console.error(`Missing email assets at ${source}. Run \`pnpm --dir frontend brand:icons\`.`);
  process.exit(1);
}

cpSync(source, target, { recursive: true });
console.log(`Copied email assets -> ${target}`);
