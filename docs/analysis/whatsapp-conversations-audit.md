# Conversaciones WhatsApp: auditoría e implementación

Fecha: 18 de octubre de 2026. Integración del PR actualizada con `main` (`8c679bd`), incluidos los cambios de medios/Drive y serialización JSON del PR #48. Alcance: conversaciones, detalle de tickets, medios, plantillas individuales, proyección de campañas y ventana de atención. Cambios locales; no se realizaron envíos a usuarios ni se modificó producción.

## Diagnóstico confirmado

La inspección siguió `WebhookController → InboundIngestionService / MessageOrchestrator → MessageRepository → REST / realtime → MessageBubble`.

| Causa inicial | Evidencia en el código | Corrección |
| --- | --- | --- |
| El ingreso guardaba principalmente `type` y `rawId`; los metadatos multimedia quedaban en InboxEvent | `inbound-ingestion.service.ts`, `message-orchestrator.service.ts` | Contrato compartido `message-content.ts`; recuperación acotada de registros antiguos desde InboxEvent |
| No existía `sticker` en MessageType | `prisma/schema.prisma` | Enum y migración aditiva; conservación de WebP y bandera animated |
| La consulta omitía adjuntos enlazados únicamente mediante attachmentId | `message.repository.ts` | Combina ambas relaciones sin exigir adjunto, ticket o remitente |
| El reproductor dependía de cdnUrl aunque algunos audios conservaban solo el ID de Meta | `MessageBubble.tsx`, `message.repository.ts` | Endpoint autenticado, recuperación desde Meta y almacenamiento privado |
| Realtime descartaba meta | `realtime-event.contracts.ts`, frontend `realtime/types.ts` y `patch-helpers.ts` | Mismo contenido multimedia en REST y eventos |
| Una vista pedía 100 mensajes y otras recorrían todas las páginas | Hooks de conversaciones y tickets | Hook común, 20 recientes y páginas anteriores por cursor |
| Campañas conservaba snapshots fuera del historial Message | Servicios de campañas | Proyección idempotente del envío aceptado y sus estados |
| El modal finalizaba al seleccionar/crear contacto | `start-conversation-dialog.tsx` | Configuración, previsualización y envío individual de plantilla |
| El envío libre del panel no comprobaba la ventana | `message.service.ts` | Validación de dominio antes de persistir y nuevamente antes del envío desde outbox |

No se encontró el botón «Plantilla» junto al input en la revisión auditada. Se integró su acceso en el modal y el banner sin introducir otro botón en el compositor. La base local inicial no contenía conversaciones de producción: los síntomas se verificaron por trazado del código y escenarios controlados; no se afirma haber reproducido conversaciones reales de usuarios.

## Cambios por área

### Backend y persistencia

- `services/message-content.ts`: representación común de contenido, contexto, timestamp del proveedor y metadatos de medios. Los tipos desconocidos conservan el contenido disponible y tienen representación tolerante.
- `repositories/message.repository.ts`: páginas con orden estable `(createdAt, id)`, validación de pertenencia del cursor, recuperación de metadatos antiguos, estados de procesamiento y ventana por última interacción entrante válida.
- `services/message.service.ts`: envío individual de plantillas, subida de encabezados, envío de archivos, acceso privado a medios y control de ventana. Texto, audio, archivos y plantillas se persisten junto con su outbox en transacción cuando se usa el servicio de producción. Claves de idempotencia y bloqueo transaccional evitan duplicados y se validan contra remitente/conversación.
- Controladores/rutas de conversaciones y mensajes: nuevos endpoints, permisos existentes y validación de entradas. `/messages/text` pasa por el mismo servicio y requiere conversación.
- `services/whatsapp/private-media.store.ts`: bytes sin conversión, clave de almacenamiento derivada de línea e ID, archivos privados y escritura atómica. No utiliza rutas proporcionadas por el cliente.
- Ingreso/orquestación: conserva medios aunque body esté vacío, relaciona la línea original y archiva los bytes. Un fallo de archivo no impide persistir el mensaje; la lectura intenta recuperarlo de Meta.
- `services/events/outbox-processor.service.ts`: comprueba nuevamente la ventana al despachar mensajes libres y diferencia rechazo de dominio, aceptación del proveedor y estados posteriores.
- `services/campaigns/campaign-message.service.ts`: proyecta mensajes aceptados, snapshot y estados en la conversación canónica con idempotencia; conserva acceptedAt/sentAt original cuando está disponible. Worker y webhook vuelven a intentar la proyección.
- `campaign-contract.ts`: validación compartida de variables posicionales/nombradas, encabezados y botón URL dinámica. No descarta silenciosamente componentes no admitidos.
- Migración `20261018000000_message_history_media`: añade sticker e índices de historial. No elimina ni reescribe mensajes históricos.
- Dockerfile y compose de producción: directorio privado con propietario de la aplicación y volumen compartido por API y worker.

### Frontend

- `MessageContent.tsx` centraliza renderizado por tipo; `MessageBubble` conserva alineación, remitente, hora y estados.
- `MessageHistory.tsx` y `useMessageHistory.ts` se reutilizan en bandeja, conversación y ticket. Eliminan la descarga completa del historial.
- `message-dates.ts`: fechas y separadores en `NEXT_PUBLIC_TIME_ZONE` (por defecto America/Mexico_City), Hoy/Ayer y formato es-MX.
- `start-conversation-dialog.tsx` reutiliza `CampaignTemplatePicker` y `VariableMapping`; el modo estático individual no cambia el mapeo dinámico de campañas. Incluye contacto existente/nuevo, línea, plantilla/idioma, variables, archivo y previsualización.
- `useCustomerWindow.ts` y `CustomerWindowBanner.tsx`: estado autoritativo del servidor, temporizador al vencimiento, refresco periódico/al recuperar visibilidad/al recibir entradas y apertura del mismo modal con contacto precargado.
- Composer/uploader: conserva el File seleccionado y lo envía realmente por multipart; reintentos mantienen claves por operación/archivo.
- `api-client.ts`: descarga autenticada de blobs; los object URLs se liberan al desmontar. No se colocan tokens en URLs.

## Contrato y flujos finales

### Consulta y paginación

`GET /conversations/:id/messages?limit=20` y el historial del ticket devuelven `items` cronológicos con `meta.hasNextPage` y `meta.nextCursor`. El cursor corresponde al mensaje más antiguo de la página. La base consulta en orden descendente con límite + 1 y devuelve la página invertida; no carga toda la conversación. Empates se resuelven por ID. Un cursor de otra conversación/ticket se rechaza.

La interfaz abre abajo; al acercarse al inicio pide otra página. Guarda el elemento visible y su desplazamiento para compensar el prepend. Los medios reservan espacio. Deduplica por ID, evita solicitudes repetidas, conserva eventos recibidos durante la consulta y descarta respuestas de otra conversación. Los estados se actualizan por realtime y refresco periódico de la página reciente.

Cada mensaje mantiene `id`, `conversationId`, `ticketId` opcional, `direction`, `messageType`, `body`, `createdAt`, remitente y estados. `meta` transporta `type`, `eventAt/eventTimestamp`, `context`, `media` y/o `templateSnapshot`. `media` conserva ID de Meta, MIME, filename, caption, animated y voice cuando existen; la respuesta añade una URL relativa autenticada. Las relaciones antiguas se normalizan sin publicar storageKey.

### Renderizado

| Tipo | Presentación |
| --- | --- |
| Texto | Contenido con saltos de línea y burbuja común |
| Plantilla | Snapshot de header, body, footer, botones y valores históricos; aviso cuando solo hay representación parcial |
| Imagen | Miniatura, carga/error y apertura ampliada |
| Audio/nota de voz | Control nativo accesible de reproducción, pausa, progreso y duración; estado de formato no reproducible |
| Documento | Nombre, MIME/tamaño cuando existen, apertura/descarga y vista previa de PDF/imágenes en iframe aislado |
| Sticker | WebP original sin optimización/conversión que elimine animación |
| Video | Reproductor nativo con controles |

La referencia a un mensaje previo se conserva cuando existe. Los botones históricos de plantilla se muestran como información, sin ejecutar acciones del mensaje desde el panel. Si no existen bytes/metadatos recuperables, se muestra un error/representación parcial; no se inventa contenido.

### Compatibilidad con la actualización de main

Se conservaron los workers de archivo privado en Drive, los checkpoints de integridad, las rutas de lectura autenticada de attachments y el parser/estados de entrega existentes. El contrato enriquecido añade fechas fiables y admite tanto el MIME histórico `mime_type` como `mimeType`. La lectura recupera copias Drive ya archivadas. Los snapshots previos con `schemaVersion/resolved` y los nuevos con componentes/valores se representan sin consultar el catálogo actual. El envío de contactos y las rutas antiguas siguen disponibles, con la validación de ventana aplicada a los mensajes libres. Los archivos conservan la comprobación de formato real incorporada en main. El compositor lleva el envío de plantillas al modal compartido.

### Medios privados

`GET /messages/:id/media` exige JWT y permiso de lectura de conversaciones o tickets, conforme al modelo de acceso actual. El attachmentId opcional debe pertenecer al mensaje. Se usa la línea original registrada; se descarga desde Meta solo si faltan los bytes locales. La respuesta es privada/no-store y no expone credenciales. La URL temporal del proveedor no se persiste como enlace público. Los uploads individuales requieren permiso de actualización y validan tipo/tamaño antes de enviarse.

### Inicio mediante plantilla y snapshot

Seleccionar/registrar contacto → verificar número → seleccionar línea y plantilla aprobada → completar valores reales y encabezado requerido → previsualizar → confirmar. El backend verifica pertenencia, estado aprobado, compatibilidad, parámetros y archivo; persiste snapshot y outbox y devuelve el mensaje en cola. El modal abre la conversación. Un reintento de la misma operación no crea otro mensaje.

El snapshot almacena componentes, nombre, idioma y valores resueltos; no depende de consultar la plantilla actual para pintar el historial. La cola transmite los mismos parámetros. La aceptación se reconoce por wamid, y sent/delivered/read provienen de los estados del proveedor. Enviar una plantilla no abre por sí solo la ventana de texto libre.

### Ventana y banner

`GET /conversations/:id/window` devuelve última entrada válida, vencimiento, isOpen y serverNow. Se toma el máximo timestamp fiable del evento entrante pertinente, incluyendo medios; se excluyen salientes, estados y fechas del ticket. Eventos inválidos/futuros no habilitan envíos. Se contempla la línea de comunicación registrada y el payload histórico conservado.

Al vencer, se deshabilita envío libre y aparece el banner. Su botón abre el modal compartido con contacto/número precargados; cancelar mantiene el chat. Una nueva entrada refresca la ventana. El backend responde `409 WHATSAPP_WINDOW_CLOSED` si el cliente está obsoleto; el worker vuelve a verificar antes de contactar Meta.

## Validación

Los logs de esta ejecución están en `/workspace/validation` (fuera del repositorio).

| Comando | Resultado observado |
| --- | --- |
| `pnpm --dir frontend exec vitest run` | 104 archivos, 624 pruebas aprobadas |
| `pnpm --dir backend test` (repetición completa) | 157 suites y 1.564 pruebas aprobadas; una suite/dos pruebas omitidas por la configuración existente |
| `pnpm --dir backend test` (primera pasada) | Primera pasada: 152 suites aprobadas, una omitida y un timeout en la prueba existente XLSX de 20.000 filas; 1.520 pruebas aprobadas, dos omitidas |
| `pnpm --dir backend test --runTestsByPath src/__tests__/unit/exports/xlsx-export.writer.test.ts` | 10/10 aprobadas al repetir el fallo aisladamente, sin modificar esa prueba |
| `DATABASE_URL=<base local> pnpm --dir backend migrate:deploy` | Todas las migraciones aplicadas sobre PostgreSQL 17 local aislado, incluida la nueva migración |
| `DATABASE_URL=<base local> pnpm --dir backend test:postgres --runTestsByPath src/__tests__/postgres/message-history.postgres.test.ts src/__tests__/postgres/campaigns.postgres.test.ts` | Tres suites, 13/13 pruebas aprobadas (incluida `message-media-history.postgres.test.ts` de main) |
| `pnpm --dir backend typecheck` | Aprobado |
| `pnpm --dir backend typecheck:test` | Aprobado |
| `pnpm --dir frontend typecheck` | Aprobado |
| `pnpm build` | Backend TypeScript/assets y frontend Next.js aprobados |
| `git diff --check` | Aprobado |
| `pnpm lint` | Backend y frontend: validación inicial aprobada; se ejecutó una nueva pasada después de integrar main |

La ejecución inicial simultánea de varias comprobaciones agotó memoria y terminó lint sin diagnóstico; se repitió con menos carga. No se cambiaron reglas ni timeouts para ocultar fallos.

Tras integrar main se repitieron las suites completas (backend/frontend), tipos de código/tests, build y las tres suites PostgreSQL. Se conservaron también los tests de compatibilidad de snapshots y acceso privado que llegaron a main.

Las pruebas PostgreSQL usan Prisma real, consultas, migraciones y transacciones reales. Solo se sustituyen los límites de Meta/dispatch para impedir envíos externos. Las pruebas React/jsdom verifican estructura, controles, errores, paginación, anclaje de scroll, carreras, timer, modal precargado, previsualización y claves de reintento; no equivalen a reproducción audiovisual en un navegador físico.

## Despliegue y límites

1. Aplicar `pnpm --dir backend migrate:deploy` y regenerar Prisma antes de iniciar el código que escribe sticker. La migración se probó localmente; producción no fue migrada.
2. Configurar línea/WABA, credenciales válidas, permisos Meta, webhooks de mensajes/estados y plantillas aprobadas. No se verificó la aceptación real de Meta ni se enviaron mensajes a usuarios.
3. Configurar almacenamiento privado persistente compartido mediante `WHATSAPP_MEDIA_DIR`. Compose incluye volumen; Cloud Run y otros despliegues con réplicas necesitan un montaje duradero compartido. El filesystem efímero no garantiza conservación cuando Meta deja de retener el archivo. No se desplegó infraestructura cloud.
4. Verificar en los navegadores objetivo PDF, codecs de audio/video y WebP animado con archivos reales; los tests automatizados no decodifican estos formatos.
5. Los registros antiguos solo pueden reconstruirse con los payloads/adjuntos/snapshots aún disponibles. Una plantilla antigua sin snapshot se representa parcialmente; un archivo ya borrado del proveedor y no archivado no puede recuperarse. Campañas se proyecta al procesar worker/webhooks; no se ejecutó un backfill masivo de campañas históricas terminadas.
6. El catálogo limita el envío a componentes compatibles con el contrato implementado (header texto/imagen/video/documento, body, footer, botones estándar y URL dinámica final). Componentes especiales no soportados se rechazan explícitamente.
7. Esta implementación no añadió dependencias de aplicación; la integración conserva las dependencias y detección de formatos que llegaron a main. No se ejecutó despliegue ni pruebas destructivas de producción. El usuario solicitó después publicar estos cambios en un PR.
