/**
 * Datos configurables de los documentos legales (Aviso de Privacidad y
 * Términos y Condiciones). Centralizados aquí para poder actualizarlos sin
 * tocar el contenido de las páginas.
 *
 * LFPDPPP: el domicilio del responsable debe ser lo más completo posible.
 * Mientras no se cuente con calle y número, se publica la localidad.
 */
export const legalConfig = {
  /** Fecha visible de última actualización de ambos documentos. */
  lastUpdated: '21 de agosto de 2026',

  /** Responsable del tratamiento: organización / movimiento ciudadano. */
  responsibleName:
    'Voz Ciudadana, movimiento ciudadano e iniciativa de servicio social impulsada por el equipo KAB',

  /** Domicilio del responsable. Completar con calle y número cuando exista. */
  address: 'Cintalapa de Figueroa, Chiapas, México',

  /** Correo para el ejercicio de derechos ARCO. */
  arcoEmail: 'datos@voz-ciudadana.com.mx',
} as const;

/** Rutas públicas de los documentos legales. */
export const legalRoutes = {
  privacy: '/politica-y-privacidad',
  terms: '/terminos-y-condiciones',
} as const;

/** Entrada de la tabla de contenidos: ancla + título de la sección. */
export type LegalTocItem = {
  id: string;
  label: string;
};
