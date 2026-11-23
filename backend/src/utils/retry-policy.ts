/**
 * Política de reintentos para workers que consumen eventos durables.
 *
 * No todo fallo merece un reintento. Un error determinista (violación de
 * constraint, dato inválido, regla de negocio) va a fallar EXACTAMENTE igual en
 * cada reintento y, mientras tanto, bloquea la cola: es una "poison pill".
 *
 * Prisma envuelve los fallos de `$executeRaw`/`$queryRaw` como `P2010` y deja
 * el SQLSTATE real de PostgreSQL en `meta.code`. Por eso NO alcanza con mirar
 * `err.code`: hay que clasificar también el SQLSTATE. Las clases 22 (data
 * exception), 23 (integrity constraint) y 42 (syntax/access rule) son
 * deterministas; las clases 08 (conexión), 40 (rollback de transacción) y 53
 * (recursos) son transitorias y SÍ deben reintentarse.
 */
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { AppError } from './app-error';

/** Clases SQLSTATE que ningún reintento puede resolver. */
const NON_RETRYABLE_SQLSTATE_CLASSES = new Set(['22', '23', '28', '3D', '3F', '42']);

/**
 * Errores del query builder de Prisma que representan datos/contratos
 * inválidos. Se excluyen a propósito los transitorios (P2024 pool timeout,
 * P2028 transaction timeout, P2034 deadlock/serialization, P1001-P1017).
 */
const NON_RETRYABLE_PRISMA_CODES = new Set([
  'P2000', // valor demasiado largo para la columna
  'P2001', // registro inexistente en where
  'P2002', // unique constraint
  'P2003', // foreign key constraint
  'P2004', // constraint del motor
  'P2005', // valor inválido para el tipo de la columna
  'P2006', // valor inválido para el campo
  'P2007', // error de validación de datos
  'P2009', // fallo de validación de query
  'P2011', // null constraint
  'P2012', // variable requerida ausente
  'P2013', // argumento requerido ausente
  'P2014', // relación requerida violada
  'P2015', // registro relacionado no encontrado
  'P2018', // registros relacionados requeridos no encontrados
  'P2019', // error de input
  'P2020', // valor fuera de rango para el tipo
  'P2022', // columna no existe en la BD
  'P2023', // representación inconsistente de columna
  'P2025', // registro requerido no encontrado
]);

/** HTTP transitorios: aunque son 4xx, reintentar sí puede ayudar. */
const TRANSIENT_HTTP_STATUS = new Set([408, 429]);

/**
 * `true` cuando reintentar el mismo evento no puede cambiar el resultado.
 * El llamador debe mover el evento a la DLQ en lugar de reprogramarlo.
 */
export function isNonRetryableError(err: unknown): boolean {
  if (err instanceof AppError) {
    return (
      err.statusCode >= 400 && err.statusCode < 500 && !TRANSIENT_HTTP_STATUS.has(err.statusCode)
    );
  }

  if (err instanceof PrismaClientKnownRequestError) {
    if (NON_RETRYABLE_PRISMA_CODES.has(err.code)) return true;

    if (err.code === 'P2010') {
      const sqlState = sqlStateOf(err);
      // Sin SQLSTATE no hay evidencia de transitoriedad: se trata como
      // determinista para no dejar la cola en un ciclo infinito. El evento
      // queda en DLQ y puede reprocesarse manualmente (system.reprocessInboxEvent).
      if (!sqlState) return true;
      return NON_RETRYABLE_SQLSTATE_CLASSES.has(sqlState.slice(0, 2).toUpperCase());
    }
  }

  return false;
}

/**
 * Razón persistible en `last_error`: incluye el código Prisma y el SQLSTATE
 * para que la DLQ sea diagnosticable sin volver a reproducir el fallo.
 */
export function persistenceErrorReason(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (err instanceof PrismaClientKnownRequestError) {
    const sqlState = sqlStateOf(err);
    return sqlState ? `[${err.code}/${sqlState}] ${message}` : `[${err.code}] ${message}`;
  }
  if (err instanceof AppError && err.code) {
    return `[${err.code}] ${message}`;
  }
  return message;
}

function sqlStateOf(err: PrismaClientKnownRequestError): string | undefined {
  const value = err.meta?.['code'];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
