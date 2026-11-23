export function formatLeaderDate(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' }).format(date);
}

export function getLeaderApiErrorMessage(status: number, fallback: string): string {
  if (status === 0) return 'No se pudo conectar con el servidor.';
  if (status === 401) return 'Tu sesión expiró. Iniciá sesión nuevamente.';
  if (status === 403) return 'No tenés permisos para gestionar líderes.';
  if (status === 404) return 'El líder solicitado no existe o ya no está disponible.';
  if (status === 409) return fallback || 'El cambio entra en conflicto con un registro existente.';
  if (status === 429) return 'Se alcanzó el límite de reenvíos. Intentá nuevamente más tarde.';
  if (status === 400 || status === 422) return fallback || 'Los datos enviados no son válidos.';
  if (status >= 500) return 'Ocurrió un error en el servidor. Intentá nuevamente.';
  return fallback;
}
