/**
 * Criterio alineado con el orquestador de WhatsApp: registro "completo" para no forzar REGISTERING.
 *
 * Desde la unificación con el módulo de Promovidos, el registro se considera completo
 * con nombre + teléfono. Colonia, email e intereses quedan opcionales: un ciudadano
 * existente con esos dos datos no debe re-entrar al flujo de registro.
 */
export function citizenHasCompleteRegistrationProfile(citizen: {
  name: string | null | undefined;
  phone?: string | null | undefined;
  neighborhoodId?: string | null | undefined;
  neighborhood?: string | null | undefined;
}): boolean {
  return !!citizen.name?.trim() && !!citizen.phone?.trim();
}
