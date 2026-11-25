# CONTRIBUTING — Nexo Comercial

## Reglas de desarrollo

### R-UI-1 — Renderizado centralizado de entidades

Cada entidad de negocio con representación visual múltiple (Mensaje, Usuario/Agente, Ticket,
Conversación) se renderiza en **exactamente un componente de UI canónico**, ubicado en su carpeta
de dominio (`components/domain/<entidad>/`).

**Aplica a** toda entidad con más de una vista de lectura: Mensajes (`MessageBubble`), tickets,
conversaciones, usuarios.

**Obligatorio:**

- Cualquier vista nueva de solo lectura de la entidad **importa y reutiliza** el componente canónico.
- Está **prohibido**: renderizar la misma entidad inline en dos archivos, forkear clases Tailwind por
  superficie, o re-implementar detección de variantes (p. ej. remitente) con heurísticas propias.
- Cuando la entidad gana un campo (p. ej. `sendBy`/`sender`, avatares), el cambio se hace **una sola
  vez** en el componente canónico; los consumidores no cambian.
- Los knobs de configuración (animación, estados, formato de timestamp) son **props del componente
  canónico**, nunca renders paralelos.

**Justificación:** los mensajes se renderizaban en 3 lugares (`chat-window.tsx`, `ConversationThread.tsx`,
`tickets/MessageBubble.tsx`) con lógica divergente —uno detectaba "Bot" por `messageType`, otro por
`sender`—, multiplicando el mantenimiento y rompiendo la consistencia visual. La regla elimina esa
clase de bug de raíz.

**Definición de "done":**

- Un render nuevo de la entidad reutiliza el componente canónico (el grep de su nombre en vistas de
  UI solo encuentra el componente canónico y sus consumidores).
- Los knobs son props tipadas del componente canónico, no JSX duplicado.