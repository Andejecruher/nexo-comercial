import { env } from '../../config/env.config';

export type FormattedExpiration = { expirationDate: string; expirationTime: string };

/** Formatea vencimientos de tokens en la zona horaria configurada para correos. */
export function formatExpiration(expiration: Date): FormattedExpiration {
  return {
    expirationDate: new Intl.DateTimeFormat('es-MX', {
      dateStyle: 'long',
      timeZone: env.MAIL_TIME_ZONE,
    }).format(expiration),
    expirationTime: new Intl.DateTimeFormat('es-MX', {
      timeStyle: 'short',
      timeZone: env.MAIL_TIME_ZONE,
    }).format(expiration),
  };
}
