import { env } from '../../../config/env.config';

/**
 * Paleta corporativa. Espejo de las variables de `frontend/app/globals.css`;
 * los clientes de correo no soportan custom properties, así que se replica
 * como literales y debe actualizarse junto con la web.
 */
export const brand = {
  primary: '#711B2C',
  primaryDark: '#5A1522',
  primaryDeep: '#3D0D16',
  primaryLight: '#9B3244',
  onPrimary: '#FFFFFF',
  secondary: '#374151',
  accent: '#B8973A',
  text: '#111827',
  muted: '#6B7280',
  mutedSurface: '#F3F4F6',
  surface: '#FFFFFF',
  border: '#E5E7EB',
  danger: '#B91C1C',
} as const;

/** Montserrat no es una fuente segura en clientes de correo. */
export const fontStack = 'Arial, Helvetica, sans-serif';

export const CONTENT_WIDTH = 600;

export const BRAND_NAME = 'Nexo Comercial';
export const BRAND_LOCATION = 'Canales y operación';

/** `Content-ID` del logo adjunto en línea. */
export const LOGO_CID = 'brand-logo';
export const LOGO_FILENAME = 'email-logo.png';
export const LOGO_SIZE = 48;

const stripTrailingSlash = (value: string): string => value.replace(/\/$/, '');

export function frontendUrl(path = '/'): string {
  return new URL(path, `${stripTrailingSlash(env.FRONTEND_URL)}/`).toString();
}

/**
 * Fallback HTTP para clientes que descartan adjuntos inline. El `src` primario
 * sigue siendo `cid:brand-logo`, que no depende de que el frontend esté arriba.
 */
export function logoHttpUrl(): string {
  return env.MAIL_LOGO_URL ?? frontendUrl('/images/email-logo.png');
}
