import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { EmailAttachment } from '../email.types';
import { LOGO_CID, LOGO_FILENAME } from './templates/branding';

/**
 * Adjuntar el logo en línea evita que los clientes que bloquean imágenes remotas
 * muestren el encabezado roto, y desacopla el correo de la disponibilidad del
 * frontend. `scripts/copy-email-assets.mjs` replica el archivo en `dist/`.
 */
const logoPath = path.join(__dirname, 'assets', LOGO_FILENAME);

let cached: EmailAttachment | null | undefined;

export function loadLogoAttachment(): EmailAttachment | null {
  if (cached !== undefined) return cached;

  try {
    cached = {
      filename: LOGO_FILENAME,
      content: readFileSync(logoPath).toString('base64'),
      type: 'image/png',
      disposition: 'inline',
      contentId: LOGO_CID,
    };
  } catch (error) {
    console.error('[Email] No se pudo leer el logo inline; se usará el fallback HTTP.', {
      logoPath,
      error: error instanceof Error ? error.message : String(error),
    });
    cached = null;
  }

  return cached;
}
