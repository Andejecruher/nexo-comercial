# Auditoría y corrección del aislamiento de WhatsApp

Base: `main` obtenido antes de revisar código, commit `846ac775b9e03bb76b0d2a34c6d379f7ef619301`. El árbol inicial estaba limpio. Validación exclusivamente local; no se consultaron datos de producción, enviaron mensajes a Meta ni ejecutaron despliegues o reparaciones históricas.

## A. Diagnóstico y evidencia

La causa está en persistencia y resolución de dominio. Antes del cambio, `ConversationRepository.findOrCreateCanonical(citizenId)` y `resolveExistingCycle` buscaban por ciudadano sin línea. `bindCommunicationLine` actualizaba `ConversationMeta.communicationLineId` tanto si era nulo como si era diferente. El segundo mensaje del mismo contacto a B recuperaba la conversación de A, sustituía la línea por B y añadía el mensaje al mismo historial. La consulta de bandeja, que sí filtra por la línea en meta, dejaba de encontrarla en A. No era necesario un error de React para producir el síntoma.

Dos restricciones SQL reforzaban la identidad incorrecta: `uq_conversations_canonical_per_citizen` y `uq_conversations_active_per_citizen_channel`. Cambiar solo el filtro de la bandeja o la consulta del resolver no bastaba.

Además, las ventanas de batching se identifican por teléfono. El worker entregaba todos sus fragmentos al mismo `handleInboundBatch`; este elegía una sola conversación y podía enviar mensajes de A y B al mismo turno de IA. El worker no pasaba el identificador receptor como argumento separado, aunque cada fragmento lo conservaba. Por último, `AgentRegistry.resolveLineAgent` podía priorizar una coincidencia del teléfono del contacto sobre el receptor explícito, o caer en el agente por defecto si el receptor explícito no se resolvía.

### Componentes y recorridos reales

| Operación | Archivos y métodos |
| --- | --- |
| Líneas y agentes | `prisma/schema.prisma`: `CommunicationLine`, `AiAgent`; `repositories/admin-ai.repository.ts`: `findLinesByAgentId`; `services/templates/template-management.service.ts`: listado de líneas; `services/whatsapp/whatsapp-line-config.resolver.ts`: credenciales/configuración para envío |
| Entrada y normalización | `routes/webhook.routes.ts`, `controllers/webhook.controller.ts`; `utils/wa-message-parser.ts`: conserva `phoneNumberId` por mensaje; middleware de firma Meta conserva sus comprobaciones |
| Contacto compartido | `repositories/citizen.repository.ts`: `findOrCreate`, normalización del teléfono y perfil; el contacto puede seguir siendo uno para todas sus líneas |
| Ingesta visible | `services/ingress/inbound-ingestion.service.ts`: `ingest`; InboxEvent, conversación, ticket, mensaje y realtime en una transacción |
| Resolución del chat | `repositories/conversation.repository.ts`: `findOrCreateCanonical`, `resolveExistingCycle`, `promoteToCanonical`, `reactivateCycle`, `bindCommunicationLine` |
| Persistencia, adjuntos, lectura y contexto | `repositories/message.repository.ts`: `createInTransaction`, `listByConversation`, `findRecentForAiContext`, `customerWindow`; consultas por `conversationId`; `externalMessageId` e idempotency key únicos |
| Workers y batching | `services/events/inbox-processor.service.ts`: `processEventById`, `processBatch`, `upsertBatchWindow`, `recoverBatchWindows`; generación/claim SQL y Cloud Tasks existentes |
| Procesamiento del turno | `services/orchestrator/message-orchestrator.service.ts`: `handleInboundMessage`, `handleInboundBatch`, enlace de línea, archivo multimedia y llamada al FSM |
| Agente, memoria y herramientas | `ai/registry/agent.registry.ts`: `resolveLineAgent`; `ai/services/ai.service.ts`: `handleMessage`, historial por conversación; `ai/fsm/fsm-router-v2.ts`; `services/fsm-lock.service.ts`: lease por UUID de conversación; herramientas `send-message` y `create-citizen` |
| Salida del panel | `services/message.service.ts`: `sendMessage`, `sendTemplate`, audio, medios y contactos; `repositories/outbox-message.repository.ts`; `services/events/outbox-processor.service.ts`: resolución de línea y ventana antes de enviar; `whatsapp.provider.ts` |
| Campañas | `services/campaigns/campaign-message.service.ts`: `sync`; proyección de envíos aceptados e idempotencia por destinatario, conservando snapshot y línea de campaña |
| Atención, estados y asignaciones | `services/conversations.service.ts`, repositorio de conversaciones y servicios/repositorio de tickets: referencias a conversación, no reasignación por teléfono |
| Listado y serialización | `controllers/conversations.controller.ts`, `services/conversations.service.ts`: `list`; repositorio: `buildConversationListWhere`, `listWithContext`, `countUnreadByConversationIds`, `markConversationRead` |
| Frontend | `lib/messaging-api.ts`, `lib/conversations-api.ts`; `components/admin/start-conversation-dialog.tsx`, `inbox-view.tsx`, `chat-list.tsx`; hooks de conversaciones, stores de conversación activa y `lib/realtime/patch-helpers.ts` |
| Realtime | Builders de eventos, `RealtimeNotifier.notifyCritical`, `withRealtimeTransaction`, outbox/relay, gateway y consumidor frontend; IDs y versiones por conversación; patch helpers rechazan mensajes de otra conversación |
| Caché y medios | `communication-line-cache.service.ts`: claves por ID/externalIdentifier de línea; `whatsapp/private-media.store.ts`: hash de línea + media ID; servicios multimedia conservan referencias a mensajes/conversación |

Flujo entrante: webhook firmado → parser conserva receptor → `ingest` resuelve línea activa → ciudadano → conversación de esa línea → ticket y mensaje con metadatos → outbox realtime, publicado después del commit → inbox worker → fragmentos separados por receptor → FSM/IA con UUID, historial y agente propios.

Flujo saliente: conversación seleccionada → `MessageService` lee su meta/línea y teléfono del contacto → persistencia + outbox → worker verifica ventana de esa conversación → proveedor resuelve la configuración de esa línea → estados por wamid y actualización del mensaje. Campañas proyectan el envío aceptado en la conversación de la línea de campaña.

Flujo de consulta: línea seleccionada → parámetro `communicationLineId` → filtro `meta.communicationLineId` más canónica/estado/departamento/bot/búsqueda → orden estable y cursor → DTO → lista con `key={chat.id}`. Los patches realtime y el historial también usan IDs de conversación. No se encontró agrupación por teléfono que explicara el traslado. El perfil ciudadano y su resumen «última conversación» siguen siendo globales al contacto, intencionalmente; no se usan para resolver el historial de una línea.

### Modelo real e invariantes

Se conserva la regla existente: una conversación canónica reutilizable por contacto, canal y línea, que se reactiva al recontactar. Los casos/tickets históricos siguen siendo múltiples; no se impone un `UNIQUE(contacto, línea)` absoluto sobre todas las conversaciones históricas. No hay ámbito tenant/organización en estos modelos que deba añadirse a la clave. Los permisos y autorización existentes se conservan.

Una conversación con línea no se reasigna. Cada mensaje, ticket, lectura, asignación, lease y contexto sigue perteneciendo a su UUID. Eventos duplicados se deduplican por wamid y mensajes salientes por clave de idempotencia. La clave de respuesta de IA ya incluye conversación + generación del lote, por lo que las líneas no comparten respuestas aunque tengan el mismo número de generación.

## B. Corrección implementada

- **Esquema/migración `20261102000000_conversation_line_scope`**: añade `Conversation.communicationLineId` como ámbito indexable y copia exclusivamente la asociación actualmente registrada en meta. Sustituye los dos índices parciales por sus equivalentes con ciudadano + canal + línea. El ámbito nulo se trata como un ámbito legacy/borrador separado, mediante `COALESCE`, evitando duplicados concurrentes con NULL.
- **Trigger sobre meta**: mantiene el ámbito indexado sincronizado con el contrato existente en meta. Bloquea la fila de conversación y rechaza sustituir una línea ya establecida; permite el primer enlace de un borrador. Protege también los envíos de plantilla que ya actualizaban meta dentro de su transacción. No modifica texto, adjuntos, relaciones ni estados históricos.
- **Repositorio**: todas las etapas de búsqueda, promoción y recuperación de carreras reciben el ámbito. Promover A no degrada B. Cerrar/reactivar sigue reutilizando la misma fila en esa línea. El método obsoleto `findOrCreateOpen` delega al mismo resolver. Sin línea explícita, una sola línea activa se resuelve automáticamente; varias líneas requieren selección. Cero líneas mantiene el ámbito legacy para instalaciones que aún usan la configuración anterior.
- **Ingreso/orquestador**: resuelven el receptor antes de crear/buscar la conversación. Un receptor explícito desconocido o inactivo falla antes de persistir el mensaje; no se envía al agente predeterminado. Un replay con un historial incompatible tampoco cambia la línea.
- **Lotes**: `handleInboundBatch` divide por `phoneNumberId` antes de resolver conversaciones, conserva orden dentro de cada línea y pasa el receptor al FSM. Rechaza fragmentos ya persistidos en otra conversación. Las ventanas y claims siguen por teléfono para conservar los contratos de jobs y serialización; pueden compartir demora de scheduling, pero no contexto ni historial.
- **Agentes**: el receptor explícito tiene prioridad y no cae en un agente de otra línea si no existe. No se cambian proveedores, prompts ni procesamiento de IA.
- **Campañas y salida**: `CampaignMessageService.sync` usa la línea de campaña; la consulta legacy de ventana en outbox incluye la línea resuelta. Los envíos del panel ya usaban la línea de la conversación y se mantienen.
- **Inicio de conversación**: POST `/conversations` acepta opcionalmente `communicationLineId`, validado contra líneas activas. El modal permite elegir otra línea y resuelve la conversación destino antes de cargar medios/enviar la plantilla; abre el ID devuelto. La forma previa sin línea sigue disponible para preparar un borrador, que no se considera comodín de otras líneas.
- **Pruebas y fixtures**: regresión de lotes mixtos; suite PostgreSQL de aislamiento; fixtures de ingreso con receptores configurados; la prueba de campaña consulta la conversación de su línea, conservando la fila legacy sin atribuirle mensajes ajenos.

No se añadieron dependencias ni se reconfiguraron líneas, credenciales, multimedia o proveedores de IA.

## C. Compatibilidad y datos existentes

Los datos anteriores no se separan automáticamente. La migración conserva la línea que actualmente consta en meta, pero eso no demuestra que todos los mensajes históricos pertenezcan a ella. Las filas legacy no canónicas conservan sus flags y sus mensajes; no se promueven por suposición. La separación se aplica al nuevo tráfico y a las conversaciones que se resuelven con evidencia de receptor.

El trigger impide borrar/desenlazar una línea referenciada si la FK intenta poner su meta en NULL. Para retirarla de operación, usar `isActive=false` y conservar la referencia histórica. Conviene comprobar cualquier integración externa que intentara cambiar una conversación de línea: ahora debe resolver otra conversación. Las herramientas sin `conversationId` no pueden escoger implícitamente entre varias líneas activas; deben usar la conversación explícita en el flujo multínea.

El script `backend/scripts/diagnostics/whatsapp-conversation-line-audit.sql` es exclusivamente de lectura. Detecta historiales con más de un receptor/lineId, discrepancias con la línea actual, ámbitos nulos y filas no canónicas. No muestra texto ni números del contacto. Es un inventario de candidatos, no una autorización de reparación ni prueba definitiva de corrupción. No se ha ejecutado contra datos reales.

Procedimiento separado de reparación: obtener snapshot aprobado; ejecutar el inventario; resolver evidencia por mensaje mediante `meta.lineId`, InboxEvent/wamid y `phoneNumberId` cotejado con configuración histórica; producir un manifiesto revisable con IDs origen/destino, mensajes, tickets, asignaciones, lecturas y eventos afectados. No trasladar un ticket que contenga mensajes de varias líneas sin revisar su semántica. Registros sin evidencia o con configuraciones históricas ambiguas requieren revisión manual. Solo después de aprobación explícita preparar/aplicar transacciones idempotentes y conciliación de contadores. No basta el teléfono ni la línea actual del contacto para atribuir mensajes.

## D. Validación

Resultados verificados con los comandos indicados al final. No hubo llamadas reales a WhatsApp ni a modelos de IA: se verifica selección/configuración/contexto y la línea encolada, con transporte externo sustituido.

- Backend completo: **1.944 pruebas pasan; 2 omitidas por la suite existente**, 186 suites pasan.
- PostgreSQL real, base nueva `whatsapp_line_validation`: **54 pruebas pasan; 1 omitida**, las 10 suites pasan. Incluye ingreso A/B/A, multimedia, idempotencia/concurrencia, creación simultánea en una y dos líneas, cierre/reapertura, bloqueo de reasignación, eventos/listados, agentes diferentes, contexto SQL y respuestas del panel.
- Frontend completo: **693 pruebas pasan**, 114 archivos. Después se añadió la regresión del cambio de línea en el modal y se ejecutó su archivo actualizado: **2/2 pasan**, incluida la prueba nueva.
- Migraciones: las 72 migraciones se aplicaron desde cero en una base local aislada. Se conservan los índices de tickets y de mensajes existentes.
- Typecheck del backend y sus tests: pasan con heap de 6 GB y ejecución secuencial; el límite reducido de 1,5 GB resultó insuficiente. Typecheck del frontend: pasa tras regenerar cachés de Next. Lint y formato: véase cierre de validación al final.

El typecheck inicial del frontend encontró tipos generados obsoletos que apuntaban a una ruta eliminada. Se regeneraron los tipos de Next y se apartó la caché obsoleta de desarrollo; no se cambió código de producto para resolverlo. Los archivos generados versionados se restauraron para no incluirlos en el cambio.

## E. Despliegue, pendientes y reversión

No se desplegó ni se ejecutó la migración en datos reales. Hace falta aprobación explícita para esas acciones, según el alcance solicitado.

Antes de desplegar: respaldo/snapshot y revisión del inventario histórico con autorización; comprobar que cada `phoneNumberId` corresponde a una línea activa y que workers/API usan la misma versión. Pausar el consumo de trabajos durante la migración y el cambio coordinado de API/workers; el nuevo código requiere el campo nuevo y el código anterior intentaría reasignaciones que el trigger rechaza. Comprobar A/B/A, plantilla y respuesta por ambas líneas en staging y monitorear errores de línea desconocida, P2002 y rechazos del trigger. Los trabajos existentes conservan sus contratos y payloads.

Reversión: detener consumidores, preservar snapshot posterior y restaurar coordinadamente aplicación y base desde respaldo si fuera necesario. Una vez que existan dos conversaciones del mismo contacto en líneas distintas, **no** recrear los índices antiguos ni fusionar filas para hacerlos caber. Un rollback solo de código deja comportamiento incompatible con la nueva integridad; preferir corrección hacia adelante. La reparación histórica es una operación independiente con su propio manifiesto/reversión.

### Cierre de validación

- `pnpm --dir backend test`: suite completa aprobada; posteriormente se repitió el archivo del orquestador tras ajustar una anotación de prueba para lint, 23/23 aprobadas.
- `pnpm --dir backend test:postgres` con `DATABASE_URL` apuntando únicamente a la base local aislada: las 10 suites aprobadas.
- `pnpm --dir frontend test`: suite completa aprobada; `pnpm --dir frontend exec vitest run components/admin/__tests__/start-conversation-dialog.test.tsx`: 2/2 aprobadas tras añadir la regresión de selección de línea.
- `NODE_OPTIONS=--max-old-space-size=6144 pnpm --dir backend typecheck` y `typecheck:test`: aprobados.
- `pnpm --dir frontend typecheck`: aprobado, también tras la nueva prueba del modal.
- `pnpm lint`: backend y frontend aprobados. Se corrigió una interpolación de tipo `unknown` en la prueba nueva, sin cambiar su comportamiento.
- Prettier sobre todos los archivos TS/TSX modificados y la nueva suite PostgreSQL: aprobado. `git diff --check`: aprobado.
- Script SQL de diagnóstico ejecutado satisfactoriamente en la base de pruebas, dentro de una transacción de solo lectura. No se ejecutó sobre datos reales.

Las omisiones pertenecen a las suites existentes; no se cuentan como pruebas aprobadas. No se ejecutó un despliegue ni una prueba extremo a extremo contra Meta/modelos externos. El build de producción no forma parte de esta validación; se comprobaron tipos, lint, formato, suites funcionales y migraciones locales.
