# Feature: Filtro multi-select con OR (deptos + agentes IA) y dedup del selector

## Objective

Convertir el filtro de la bandeja (departamentos + agentes IA) de selección única mutuamente excluyente a **multi-selección con semántica OR** (dentro de cada grupo y entre grupos), y eliminar el duplicado real detectado en Fase 0: el selector de departamentos vive dos veces (`department-multi-select.tsx` y el popover inline de `chat-list.tsx`).

## Decisiones de Fase 0 (confirmadas por el usuario 2026-10-12)

- **Premisa corregida**: `notification-settings-modal.tsx` NO renderiza filas de conversación (es un diálogo de configuración de alertas). La fila de conversación existe SOLO en `chat-list.tsx:406-493`. No hay segundo consumidor → **NO se crea `ConversationListItem.tsx` ni `ConversationList.tsx`** (nada que compartir; prohibido extraer componentes especulativos).
- **El duplicado real** es el selector de departamentos: `department-multi-select.tsx` (115 líneas) ≈ popover inline de `chat-list.tsx:291-315` (~90% idéntico, mismas clases/estructura). Se unifica.
- El filtro de conversaciones vive **solo en chat-list**; el modal no filtra conversaciones. El acople al `useNotificationPreferencesStore.scope.departmentIds` se **preserva** (hook líneas 289-301, 354-355, 421-431; solo departamentos).
- El "view model" ya existe de facto: `InboxConversation` + `mapConversationToInboxUi` + `resolveInboxAttendant` (frontend/lib/messaging-api.ts:222-305). No se crea un mapper nuevo.
- Recordatorio de dominio: NO existe `conversations.bot_id`; "botIds" son ids de **agentes IA** (derivados línea→agente); `null` en el array = "todos los bots" (líneas con agente activo).
- Entrega: **un solo PR** (decisión del usuario: "Hacerlo en un solo PR"). Delivery strategy: `single-pr`. Push/PR final siguen siendo decisión del usuario.

## Modelo de filtro (reemplaza a `botFilter`/exclusión mutua)

```ts
// Sin filtros == { departmentIds: [], botIds: [] }
type Filter = {
  departmentIds: string[];    // [] = sin restricción de depto
  botIds: (string | null)[];  // [] = sin restricción de bot; null dentro = "todos los bots"
};
```

Semántica: OR dentro de cada grupo y OR entre grupos. Conversación incluida si `department ∈ departmentIds` OR `bot ∈ botIds` OR (`null ∈ botIds` AND atendida por bot). Nunca AND entre grupos. Sin filtros → todas (comportamiento actual).

## Fase 1 — Backend (T1)

### Controller (`conversations.controller.ts`)
1. Query params nuevos: `department_ids` (repetido/CSV, alias del actual `department_id`) y `bot_ids` (repetido/CSV; acepta `all` → se traduce a incluir `null`).
2. Deprecados que siguen funcionando (mapear a array de 1): `departmentId`, `departmentSlug`, `dept` (hint), `bot_id` → `[uuid]`, `attended_by=bot` → `['all']`.
3. **QUITAR la exclusión mutua 400** (líneas ~110-115 actuales): deptos y bots pueden coexistir. Mantener 400 solo para valores inválidos (`bot_ids` con valores que no sean uuid ni `all`; `attended_by` ≠ bot).
4. NOTA compat: NO re-mapear `department_id` a singular — hoy es lista repetible y la usan consumidores legacy; `department_id` y `department_ids` son ambos alias de la lista.

### Repository (`conversation.repository.ts`)
- `ConversationListQuery` → agregar `botIds?: (string | null)[]`.
- Reusar/extender los métodos existentes `findBotLineIds`/`findBotAgentsByLineIds` (creados en 6132bba): resolver el set de `communicationLineId` cuyas líneas tienen agente activo, opcionalmente filtrado por ids de agentes seleccionados, más TODAS las líneas con agente activo cuando `null ∈ botIds`. Unión de ambos.
- `buildConversationListWhere`: recibir `botIds`; construir `botCond = { meta: { is: { communicationLineId: { in: botLineIds } } } }`. Semántica: sin deptos ni bots → sin WHERE extra; solo deptos → condición actual; solo bots → `botCond`; ambos → **`{ OR: [deptCond, botCond] }`** (un solo elemento en el `and[]`).
- `listWithContext`: si `botIds` seleccionados resuelven a cero líneas → `{ items: [], hasNextPage: false }` (early return, sin query a conversations), igual que el manejo actual de departamentos.
- Facet counts: **NO** (dejar TODO comentado si aporta; no bloquear).

### Service (`conversations.service.ts`)
- `ConversationListParams` → agregar `botIds?: (string | null)[]`; propagar a `ConversationListQuery`. DTO `botAgent` sin cambios.

## Fase 1 — Frontend estado/API (T2)

### `messaging-api.ts`
- `ListConversationsParams`: reemplazar `attendedBy`+`botId` por `botIds?: (string | null)[]` (null → `'all'` en el query).
- `buildQuery` en el fetch: `department_ids: params.departmentIds` (o mantener `department_id`; backend acepta ambos), `bot_ids: params.botIds` (valores `'all'` para null).

### `useAdminInboxConversations.ts`
- `InboxListFilters`: reemplazar `botFilter?: InboxBotFilter | null` por `botIds?: (string | null)[]`.
- URL params: `dept` (repetido, sin cambios) + `bot_ids` (repetido, `all`|uuid) — reemplaza a `bot`. Leer `bot` legacy como deprecated (migrar a bot_ids).
- `mergeInboxFilters`: **quitar la exclusión mutua** — ambos grupos se fusionan independientemente.
- `readStoredInboxFilters`/`storeInboxFilters`: migrar `botFilter` legacy ('all-bots'|agentId) → `botIds`; guardar el nuevo shape (misma storage key v3).
- `fetchPage`: mandar siempre `departmentIds` y `botIds` (sin el `filters.botFilter ? undefined :` de la línea 379).
- `applyFilters`: sincronizar notification store SOLO cuando cambia `departmentIds` (quitar `|| 'botFilter' in partial` de la línea 444). El acople de la línea 445 se conserva para departamentos.
- `botIds` NO entra en la hidratación del notification store ni en `urlSeeded` (solo departamentos, sin cambios).

## Fase 2/3 — UI (T3)

1. **`DepartmentCheckboxGroup.tsx`** (nuevo, presentacional en `frontend/components/admin/`): el listado interior de checkboxes (props: `value: string[]`, `onChange`, `disabled?`, `emptyText?`) extraído de `department-multi-select.tsx:89-111`. Sin Popover, sin fetch propio.
2. **`department-multi-select.tsx`**: refactor para usar `DepartmentCheckboxGroup` (comportamiento del modal idéntico).
3. **`ConversationFilter.tsx`** (nuevo, en `frontend/components/admin/`): el trigger + Popover con DOS grupos de checkboxes (Departamentos vía `DepartmentCheckboxGroup`; "Agentes de IA" con checkboxes `role="checkbox"` + `aria-checked`, opción "Todos los bots" = null + uno por agente activo). El Popover NO se cierra al marcar (Radix ya no cierra con clicks internos; cerrar solo con click fuera o Escape). Resumen del trigger: `Todos` / `Ventas` / `Ventas +2` / bot: `Todos los bots` / `Nombre` / `N bots`; combinado: resumen deptos + conteo de bots.
4. **`ActiveFilterChips.tsx`** (nuevo, presentacional): un chip por `departmentId` (nombre) y por `botId` (nombre del agente o "Todos los bots"); X individual con `aria-label="Quitar filtro X"`; botón "Limpiar todo" cuando hay ≥1.
5. **`chat-list.tsx`**: reemplazar trigger+popover inline (líneas 249-357) por `<ConversationFilter />`; renderizar `<ActiveFilterChips />` arriba de la lista; quitar exclusión mutua (`toggleDepartment`/`selectBotFilter`/`clearBotFilter`/`clearDepartments` → operaciones por array); estado local `localDepartmentIds` + `localBotIds`. Fila sin cambios (BotIcon ya presente). Empty state: si hay filtros activos → "Sin conversaciones para los filtros seleccionados" + botón limpiar; sin filtros → "Sin resultados". Orphans: eliminar imports/markup que queden sin uso.

## Criterios de aceptación

Filtro: sin selección → mismas conversaciones que hoy; solo "Ventas" → solo Ventas (sin bots); Ventas + Soporte → unión; bot "Trámites" → solo ese bot; Ventas + Bot Trámites → unión; "Todos los bots" + Ventas → unión; chips reflejan selección y permiten quitar ítems; "Limpiar todo" resetea; sin regresiones de selección única previa (el caso simple sigue funcionando).
Refactor: sin markup de fila duplicado (no aplica — ver Fase 0); el selector de departamentos existe UNA sola vez; `DepartmentMultiSelect` (modal) visual/behav identico; chat-list filtra y navega igual que antes; cero regresiones funcionales; test mínimo de los componentes nuevos (con/sin selección, chips, resumen, checkboxes).
Accesibilidad: checkboxes navegables por teclado + labels + aria-checked; chips removibles con aria-label; dropdown con teclado (patrón existente).

## Fuera de alcance

- AND entre grupos (no aplica al modelo de datos).
- Presets/vistas guardadas (follow-up).
- Virtualización nueva.
- Rediseño visual de la fila (solo unificar selector).
- Facet counts (TODO si aporta, no bloquear).
- Estado global/fetch de conversaciones (fuera del filter shape).

## Fase 4 — Dedup del selector en el modal (pre-PR, decisión del usuario 2026-10-12)

Consigna: `chat-list.tsx` y `notification-settings-modal.tsx` deben usar el MISMO componente (el `ConversationFilter` de chat-list). Elimina las chips y el botón "Limpiar filtros" de chat-list (ya cubiertos por el popover), y centra el empty state "Sin conversaciones para los filtros seleccionados". El scope de notificaciones gana `agentIds` (persistido + validado en backend) pero el filtrado realtime **sigue siendo solo por departamento** (el evento no porta el agente; filtrado por agente = PR de dominio aparte).

1. **`conversation-filter.tsx`**: parametrizar `id` / `ariaLabel` / `idPrefix` (default = actual) para reuso seguro en el modal sin colisiones de ids.
2. **`useAiAgents.ts`** (nuevo hook en `frontend/hooks/`): fetch compartido de agentes activos (antes inline en chat-list). Lo usan chat-list y el modal.
3. **`chat-list.tsx`**: quitar `ActiveFilterChips` + `clearAllFilters` + botón "Limpiar filtros"; centrar ventana/loading/empty con `flex-1 items-center justify-center` (contenedor `flex-1 flex flex-col`).
4. **Store notificaciones**: `NotificationScope.agentIds: (string | null)[]` (mismo shape que `botIds`: `null` = "Todos los bots"); `setAgentIds`; modo derivado compartido (`deriveScopeMode`: SELECTED si departmentIds O agentIds no vacíos); persist `version: 1 → 2` con `migrate` (backfill `agentIds: []`).
5. **`scope-broadcaster.ts`**: mensaje + firma con `agentIds`.
6. **`useNotificationSettings.ts`**: exponer `setAgentIds`.
7. **`notification-settings-modal.tsx`**: reemplazar `DepartmentMultiSelect` por `ConversationFilter` (id `notification-scope-filter`), `botIds={scope.agentIds}` + `onBotIdsChange={setAgentIds}`, usa `useAiAgents`. Copy honesto: "Alcance por áreas y agentes de IA".
8. **Eliminados**: `active-filter-chips.tsx` (+ test) y `department-multi-select.tsx` (sin más consumidores).
9. **Backend**: `NotificationScopeSchema.agentIds` (`z.string().uuid().nullable()`); `AiAgentRepository.findActiveByIds` (nuevo repo); validación de activos en `update` (solo ids no-null); wiring en `users.routes.ts`.
10. **`should-notify.ts`**: comentario NOTA sobre agentIds (persistido/validado, filtrado realtime por agente pendiente de portar el agente en el evento).
11. Tests: store (modo con solo agentes, conservar SELECTED al limpiar deptos), scope-broadcaster (agentIds + default `[]`), should-notify (scope con `agentIds: []`), chat-list (sin chips/limpiar; empty centrado), backend (constructor 3 args + validación de agentes).

## Tasks

- [x] T1 (backend): params multi + OR en WHERE + tests. Commit `e589092`.
- [x] T2 (frontend estado/API): messaging-api + hook + adaptación chat-list al contrato `botIds` (multi-select sin exclusión) + tests. Commit `219fde7`.
- [x] T3 (frontend UI): DepartmentCheckboxGroup + refactor department-multi-select + ConversationFilter + ActiveFilterChips + chat-list + tests. Commit `028974b`.
- [x] T4 (pre-PR): dedup selector en el modal (ConversationFilter compartido), scope.agentIds persistido/validado, remoción de chips + "Limpiar filtros", empty centrado. Commit `32d5787` (este trabajo).

## Verification

- Backend: `pnpm test -- src/__tests__/unit/conversation-repository.test.ts`, `pnpm test -- src/__tests__/unit/conversations-bot-filter.test.ts` (actualizar: exclusión mutua 400 ya no aplica), `pnpm typecheck`, `pnpm lint` (en `backend/`).
- Frontend: `pnpm test -- hooks/__tests__/useAdminInboxConversations.test.ts`, `pnpm test -- lib/__tests__/messaging-api.inbox.test.ts`, `pnpm test -- components/admin/__tests__/chat-list.filters.test.tsx`, `pnpm typecheck`, `pnpm lint` (en `frontend/`).
- RDD: off (clone-local) → tras cada writer, parent corre `gentle-ai review assess` y aplica tier.

## Progress log

- 2026-10-12: Fase 0 completada (inventario inline tras timeout del explorador delegado). Premisa (B) corregida con evidencia; decisiones confirmadas por el usuario. Doc creado.
- 2026-10-12: T1 backend delegado (gentle-ai-worker) → entregado; corrección inline de early-return OR combinado (grupo muerto no vacía cuando el otro está activo; tests RED 2 fallos → GREEN); mock faltante `findBotAgentsByLineIds` en conversations.actions.test.ts reparado (suite completa 1448/1450 passed en 144 suites, 2 skipped pre-existentes; typecheck/lint 0). Commit `e589092` (6 archivos, +404/−78). Assess offline: medium / `slice_budget_reached` / 482 líneas → tier satisfecho con self-verification + spot check parent (RDD off, sin ciclo nativo).
- 2026-10-12: T2 frontend estado/API inline (Big Pickle). RED 15 tests actualizados al contrato `botIds` (URL `bot_ids` + legacy `bot`, localStorage legacy `botFilter` → `botIds`, merge sin exclusión, messaging-api `bot_ids` con `all` para null) → GREEN. chat-list adaptado al multi-select mínimo (radios → checkboxes `role="checkbox"`, toggle por array, empty state unificado "Sin conversaciones para los filtros seleccionados" cuando hay filtros activos). Frontend completo 543/543 (81 suites), typecheck/lint 0. Commit `219fde7` (7 archivos, +317/−158) + feature doc trackeada. Assess: medium / `slice_budget_reached` / 475 líneas → tier satisfecho (self-verification + spot check parent 39/39).
- 2026-10-12: T3 frontend UI inline (Big Pickle). Nuevos componentes presentacionales: `DepartmentCheckboxGroup` (extraído de department-multi-select), `ConversationFilter` (trigger + Popover con ambos grupos), `ActiveFilterChips` (chips + Limpiar todo). `department-multi-select.tsx` ahora compone DepartmentCheckboxGroup (modal idéntico). chat-list reemplaza el popover inline (radios/checkboxes duplicados) por ConversationFilter + chips arriba de la lista; empty state con botón "Limpiar filtros"; resumen combinado "Ventas · 2 bots" en el trigger. Tests: 20/20 focused (incluye 2 suites nuevas), full 552/552 (83 suites), typecheck/lint 0. Commit `028974b` (9 archivos, +493/−196). Assess: medium / `slice_budget_reached` / 693 líneas → tier satisfecho (self-verification + spot check parent 18/18).
- Route: delegated (T1 writer) → inline (corrección, por cancelación del subagente y directiva de modelo único del usuario). T2/T3 inline por directiva "solo Big Pickle". Forecast ~850 líneas → doc señala single-pr.
- 2026-10-12: T4 frontend+backend inline (Big Pickle, pre-PR). `ConversationFilter` parametrizado (id/ariaLabel/idPrefix) para reuso; hook `useAiAgents` compartido (chat-list + modal); chat-list sin chips/"Limpiar filtros" y con empty/loading centrados; `scope.agentIds` en store (persist migrate v2 + `deriveScopeMode` + `setAgentIds`) y scope-broadcaster con agentIds; modal reemplaza `DepartmentMultiSelect` por `ConversationFilter` (id `notification-scope-filter`); backend: `NotificationScopeSchema.agentIds` + `AiAgentRepository.findActiveByIds` + validación de activos; muertos eliminados (`active-filter-chips.tsx`+test, `department-multi-select.tsx`). Tests: 34/34 focused, frontend completo 550/550 (82 suites), backend 1435/1450 (14 fallos email pre-existentes ajenos), typecheck/lint 0 en ambos. Commit `32d5787` + feature doc actualizada + doc commit `2cfaaa5`. Assess: medium / `slice_budget_reached` / 678 líneas → tier satisfecho con self-verification + spot check parent (RDD off).