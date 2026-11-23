import type { ApiResponse } from '@/lib/api-client';

/**
 * Mensajes de error amigables para el registro público (MVP).
 */
export function mapRegistroApiError(result: Extract<ApiResponse<unknown>, { ok: false }>): string {
  if (result.status === 0) {
    return 'No se pudo conectar con el servidor.';
  }
  if (result.status === 409) {
    return 'Este número ya está registrado.';
  }
  if (result.status === 400) {
    return result.message || 'Revisa los datos ingresados.';
  }
  if (result.status === 429) {
    return result.message || 'Demasiadas solicitudes. Intenta nuevamente en unos minutos.';
  }
  return result.message || 'Ocurrió un error. Intenta nuevamente.';
}
