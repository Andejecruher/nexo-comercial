# Campañas de WhatsApp — entregables por fases

Implementación integrada en Nexo Comercial con Next.js/React, Express/TypeScript,
Prisma/PostgreSQL y **Google Cloud Tasks**, ya disponible en este repositorio.
En desarrollo también funciona el backend de ejecución `polling` existente.
No requiere Redis ni BullMQ.

## 1. Base de datos

Modelo ORM: `backend/prisma/schema.prisma`, modelos `Campaign`,
`CampaignRecipient` y `CampaignAttachment`. SQL completo:
`backend/prisma/migrations/20261014060000_whatsapp_campaigns/migration.sql` y
`backend/prisma/migrations/20261014080000_campaign_attachments/migration.sql`.

| Tabla | Información |
| --- | --- |
| `campaigns` | UUID, nombre, propósito, línea y número emisor, ID/copia de plantilla, reglas de mapeo, origen, estado, total, creador, confirmación de consentimiento, fecha, clave de idempotencia y hash de petición |
| `campaign_recipients` | UUID, FK de campaña/ciudadano, teléfono internacional, variables resueltas JSONB, `message_id` de Meta, estado exacto, estado de procesamiento, intentos, próximo intento, bloqueo, error y fechas de cada confirmación |

Hay unicidad en `(campaign_id, phone)`, `message_id` y
`(created_by, idempotency_key)`. Índices para listados, estados y trabajos pendientes;
FK para creador, línea, campaña y ciudadano. El teléfono se guarda como texto, con
código de país y sin `+`, nunca como número JavaScript.

Estados de mensaje: `pending`, `sent`, `delivered`, `read`, `failed`.
Son distintos del estado de procesamiento (`queued`, `sending`, `accepted`,
`finished`, `uncertain`). Una respuesta HTTP exitosa de Meta confirma aceptación,
pero el mensaje permanece `pending` hasta su webhook. Esto evita mostrar una
entrega que Meta todavía no confirmó.

Estado de campaña: `queued`, `running`, `completed`, `needs_review`.
`completed` significa que todos los intentos de envío finalizaron o fueron aceptados;
**no significa que todos los mensajes se entregaron**. Los webhooks siguen
actualizando resultados después de ese estado. Los fallos definitivos se cuentan
en el dashboard, aunque el procesamiento de la campaña haya terminado.

## 2. Frontend: listado, creación y resultados

Rutas:

- `/admin/campanas`: tabla paginada, estado, total y fecha; botón Nueva campaña.
- `/admin/campanas/nueva`: wizard de cuatro pasos.
- `/admin/campanas/[id]`: resultados, métricas y destinatarios paginados.

Código:

- `frontend/components/campanas/CampaignWizard.tsx`: configuración, audiencia,
  variables, resumen y lanzamiento.
- `frontend/components/shared/CsvAudienceMapping.tsx`: componentes reutilizables
  `CsvAudience` y `VariableMapping` (estático/dinámico por variable).
- `frontend/lib/shared/campaign-csv.ts`: lectura RFC 4180 con cabeceras, delimitadores
  coma/punto y coma, BOM UTF-8, comillas escapadas y campos multilínea.
- `frontend/components/campanas/CampaignPages.tsx`: listado y analítica.
- `frontend/lib/shared/campaigns-api.ts`: contratos y cliente HTTP autenticado.

El equivalente de `getTemplates` en el repositorio es `templatesApi.list`; el
wizard reutiliza ese servicio con búsqueda por nombre en Meta y páginas de 25 opciones;
solo solicita la página visible y conserva la plantilla elegida al buscar o cambiar de página. Solo ofrece plantillas
aprobadas compatibles. Se puede seleccionar una línea emisora específica.

CSV: máximo 2 MB, 100 columnas y 2000 destinatarios por petición; límite JSON de
8 MB específico de `/api/v1/campaigns`. Se rechazan cabeceras vacías/duplicadas,
filas desalineadas, teléfonos mal formados/duplicados y variables sin valor en
**cualquier fila**, no solo en la vista previa. Los números locales sin código de
país no se completan automáticamente. El servidor repite la validación.

Ciudadanos: reutiliza `CitizenTable`, con búsqueda por nombre completo/apellidos y
teléfono normalizado, debounce y cancelación de búsquedas anteriores. La selección
se conserva entre páginas y se puede seleccionar la página visible; solo muestra registros con teléfono y
`consentGiven=true`. El cliente envía IDs; el servidor vuelve a leer los datos,
comprueba consentimiento y resuelve únicamente `name`, `lastName`, `phone`,
`email`, `neighborhood`. El CSV requiere confirmación explícita de consentimiento,
registrada junto al usuario creador y la fecha.

Las claves de variables incluyen componente: `header.1` y `body.1` son distintos.
Se admiten variables posicionales y nombradas. El cambio de plantilla/origen/CSV
reinicia los mapeos para evitar referencias a columnas obsoletas. La vista previa
muestra el primer destinatario. Todas las filas se validan antes de lanzar.

**Alcance:** plantillas aprobadas con encabezado de texto, imagen, video o PDF,
cuerpo, pie y botones estáticos. Carruseles, OTP y botones con URL dinámica se
rechazan explícitamente. El Stepper permite volver a pasos anteriores mediante
botones accesibles en escritorio y móvil; avanzar sigue validando los pasos.
Durante creación o carga de adjuntos se bloquea la navegación.

## 3. POST de creación y cola

Controlador HTTP: `backend/src/routes/campaigns.routes.ts`.
Lógica/transacción: `backend/src/services/campaigns/campaign.service.ts`.
Validación y payload: `backend/src/services/campaigns/campaign-contract.ts`.

Ejemplo (IDs ilustrativos; usar una línea y plantilla reales):

```http
POST /api/v1/campaigns
Authorization: Bearer <access-token>
Idempotency-Key: 7038b1f3-0491-4074-a437-8f6d94335022
Content-Type: application/json
```

```json
{
  "name": "Aviso de servicios",
  "purpose": "Informar el horario de atención",
  "lineId": "9d8d4a8c-5124-4c3b-95e7-f187f2d6d738",
  "templateId": "123456789",
  "consentConfirmed": true,
  "mappings": {
    "body.1": { "mode": "dynamic", "field": "nombre" },
    "body.2": { "mode": "static", "value": "09:00 a 17:00" }
  },
  "audience": {
    "source": "csv",
    "phoneColumn": "telefono",
    "rows": [
      { "telefono": "+525512345678", "nombre": "Ana" },
      { "telefono": "+525512345679", "nombre": "Luis" }
    ]
  }
}
```

Para ciudadanos, sustituir `audience` por:

```json
{ "source": "citizen", "citizenIds": ["9d8d4a8c-5124-4c3b-95e7-f187f2d6d739"] }
```

Usar `field: "name"` en el mapeo correspondiente.

El endpoint valida en Meta la propiedad y aprobación de la plantilla; guarda
campaña y todos sus destinatarios `pending` en una transacción (inserciones de
500 filas). Los valores dinámicos se resuelven y congelan en ese momento, para
que un cambio posterior de ciudadano o plantilla no altere la campaña aceptada.
Después hace un despacho breve a Cloud Tasks y responde:

```json
{ "id": "<uuid-campaña>", "total": 2, "status": "queued" }
```

HTTP `202 Accepted`, sin esperar a enviar los mensajes. La latencia incluye
validación de plantilla, persistencia y despacho inicial; no es un envío
sincrónico masivo. Repetir exactamente el mismo payload con la misma clave
recupera la campaña existente. Cambiar el payload con esa clave devuelve `409`.
El wizard conserva la clave durante un reintento en la misma sesión montada.

Permisos: `campanas_whatsapp.view`, `campanas_whatsapp.create`, `plantillas.view`;
para usar ciudadanos también `ciudadanos.view`. Se reutiliza el RBAC existente.

Las filas pendientes en PostgreSQL son el registro durable de trabajo. Si el
proceso cae entre el commit y la creación de Cloud Task, o la cola está caída,
`reconcilePendingBackgroundTasks` vuelve a encolar campañas pendientes. Por eso
un fallo de despacho no convierte una campaña ya guardada en una creación fallida.
Cloud Tasks solo lleva el UUID, sin teléfonos ni variables.

## 4. Worker por lotes

`backend/src/services/campaigns/campaign-worker.service.ts`, integrado en
`backend/src/worker.ts` y `backend/src/worker-app.ts`.

1. Busca hasta 25 destinatarios pendientes y vencidos.
2. Resuelve credenciales de la línea en el servidor y verifica el número emisor.
3. Trabaja en grupos de hasta 5 solicitudes concurrentes.
4. Consume un presupuesto distribuido en PostgreSQL por número emisor.
5. Reclama cada destinatario con un `UPDATE` condicional: solo un worker puede
   pasar de `queued` a `sending`.
6. Construye componentes de Meta a partir de los valores congelados. Envía una
   petición HTTP por destinatario; el lote es una estrategia del worker, no un
   envío grupal de la API de Meta.
7. Persiste el `wamid` y programa continuación si quedan pendientes.

`CAMPAIGN_MESSAGES_PER_SECOND=5` es un valor conservador configurable, compartido
entre todas las instancias de campañas para ese número. Es una ventana fija y
puede concentrar solicitudes cerca del cambio de segundo. Ajustarlo a la cuota
real de la línea y reservar capacidad para los otros emisores de la aplicación;
no representa ni descubre automáticamente el límite de Meta.

Los rechazos explícitos de rate limit (HTTP 429 y códigos reconocidos) reciben
backoff exponencial con jitter, `Retry-After` y hasta cinco intentos por
destinatario. Otros rechazos definitivos terminan `failed` con código de error.

**Timeouts, errores de transporte, HTTP 5xx y respuestas exitosas sin `wamid`
quedan `uncertain`.** Meta puede haber aceptado el mensaje antes de perder la
respuesta. No existe aquí una garantía de envío exactamente una vez: reintentar
esos casos ciegamente puede duplicar mensajes. Tampoco se reenvían leases
`sending` vencidos; pasan a revisión. Una confirmación posterior de Meta resuelve
la incertidumbre. Si nunca llega, se requiere revisión operacional; esta versión
no incluye una acción de reenvío manual.

Para Cloud Tasks se usa `/tasks/process-campaign` y la cola de delivery existente,
con OIDC/IAM del worker privado. El reconciliador incluye campañas en cola,
procesamiento o revisión. **Mantener activo el scheduler existente que invoca
`POST /tasks/reconcile`**, además de la reconciliación de inicio; recupera trabajos
sin tarea y bloqueos abandonados. La cola debe tener reintentos configurados para
fallos internos/DB. Para despliegues sin Cloud Tasks, `polling` ejecuta el mismo
procesador desde el worker de Node.js.

## 5. Webhooks y métricas

Integración antes de responder `200`:
`backend/src/controllers/webhook.controller.ts` llama a
`backend/src/services/campaigns/campaign-status.service.ts`.
Se conserva el middleware existente de firma HMAC sobre el cuerpo original.

- Recorre todas las entradas, cambios y estados del payload.
- Busca por `message_id`, limitado al número emisor y destinatario.
- El envío incluye `biz_opaque_callback_data=recipient.id`; su eco en el webhook
  permite correlacionar incluso antes de recibir la respuesta HTTP con el wamid.
- Actualiza `sent`, `delivered`, `read`, `failed` con escrituras condicionales.
- Un evento tardío `sent` no reduce `read`/`delivered`; una confirmación de entrega
  o lectura tiene precedencia sobre un fallo. Repetir eventos no suma contadores.
- Guarda cada hito temporal por separado. Errores de persistencia devuelven `500`
  para que Meta reintente. El middleware de deduplicación permite pasar estados
  nuevos aunque vengan junto con mensajes entrantes ya procesados.

`GET /api/v1/campaigns/:id?page=1` consulta agregados de destinatarios y la página
actual en una transacción `RepeatableRead`. Los buckets exactos suman el total.
Las tarjetas acumulativas definen entregados = `delivered + read` y enviados =
`sent + delivered + read`; no deben sumarse entre sí. La interfaz carga al entrar
y cambiar de página. El botón **Actualizar Resultados**, en ambas cabeceras, hace
un refetch manual con spinner y se deshabilita durante la petición. Si falla,
conserva los resultados anteriores y muestra el error. No hay temporizadores
para actualizar listado ni dashboard.

## Arranque y validación

Revisar y aplicar la migración en el entorno de destino; luego generar cliente y
reiniciar API/worker:

```bash
pnpm --dir backend exec prisma migrate deploy
pnpm --dir backend exec prisma generate
pnpm --dir backend dev:api
# En otro proceso, con la configuración existente de PostgreSQL/Meta/colas:
pnpm --dir backend dev:worker
pnpm --dir frontend dev
```

La configuración de Meta reside en las líneas existentes, no en el navegador.
No se han enviado mensajes reales ni aplicado esta migración a la base de datos
de la aplicación como parte de la generación del código.

Pruebas relevantes:

```bash
pnpm --dir backend typecheck
pnpm --dir frontend typecheck
pnpm --dir backend test --runTestsByPath src/__tests__/unit/campaigns.test.ts src/__tests__/unit/template-webhook.test.ts src/__tests__/unit/webhook-controller.test.ts
pnpm --dir frontend test --run lib/campaign-csv.test.ts components/campaigns/CsvAudienceMapping.test.tsx
```

Las pruebas unitarias usan respuestas simuladas de Meta y dobles de la persistencia/cola.
Además, `backend/src/__tests__/postgres/campaigns.postgres.test.ts` aplica la
migración en un esquema temporal de PostgreSQL y comprueba concurrencia de
workers, estados fuera de orden y recuperación de envíos inciertos. Ese esquema
se elimina al terminar; las tablas de la aplicación no se modifican.
Antes de habilitar envíos reales, validar el recorrido con la base migrada,
Cloud Tasks/IAM y una línea de prueba autorizada. El módulo necesita ampliación
para importaciones mayores de 2000 registros (carga a almacenamiento y
procesamiento de importación asíncrono) y reenvíos manuales.

## Refactorización: elección de actualización manual

La arquitectura admite Socket.IO en otros dominios, pero Campañas aún no publica
sus cambios a través del outbox/relay: las escrituras proceden de API, webhook y
workers separados. Reutilizar un emisor en memoria no cubriría réplicas ni workers.
El SSE de Plantillas consulta PostgreSQL cada dos segundos por conexión; copiarlo
solo trasladaría el polling al servidor. Por eso esta entrega usa el fallback
manual autorizado, eliminando las consultas periódicas de estas dos vistas.
Una futura implementación push debe añadir eventos durables en esas escrituras,
autorización `campanas_whatsapp.view`, distribución por Pub/Sub y recuperación
tras reconexión. El procesamiento de envíos/conciliación del worker sigue su ciclo
actual: es distinto del polling de lectura de la interfaz.

## Adjuntos de campañas en Google Drive

- Servicio: `backend/src/services/campaigns/campaign-media.service.ts`.
- Frontend: `CampaignMediaUpload.tsx`, en Variables, con dropzone y selector accesible.
- `POST /api/v1/campaigns/media`: multipart con `file`, `name`, `lineId`, `templateId`.
  Requiere sesión y permisos `campanas_whatsapp.view`, `campanas_whatsapp.create`,
  `plantillas.view`; valida propiedad/estado de plantilla antes de subir.
- JPEG/PNG hasta 5 MB; MP4 hasta 16 MB; PDF hasta 16 MB (límite propio de esta app).
  Se comprueban MIME y firma básica en servidor. MP4 debe contener H.264/AAC;
  no se transcodifica ni se verifica el códec completo localmente.
- Crea `campaigns/<nombre> - <UUID>` bajo `GOOGLE_DRIVE_FOLDER_ID` y publica **solo
  el archivo** con `anyone/reader`, sin indexación. No publica la carpeta raíz ni
  otros documentos. Retorna `id`, `filename`, `mediaType`, `url` y `viewUrl`.
- `viewUrl` sirve para abrir Drive; `url` usa `webContentLink` para que Meta obtenga
  los bytes. La URL de visualización no se envía como adjunto a Meta.
- El POST de creación acepta `attachmentId`. Revalida usuario, línea, plantilla,
  tipo y que el archivo esté libre. La transacción crea la campaña usando ese UUID,
  asocia el adjunto y guarda su URL como `header.media` en cada destinatario. El
  worker genera `{ type: "image", image: { link } }`, `video` o `document` más las
  variables de texto. No acepta URLs arbitrarias del navegador.
- Si falla compartir o guardar el registro, intenta borrar el archivo subido.
  Las cargas abandonadas/reemplazadas permanecen registradas con `campaign_id IS NULL`;
  no hay borrado automático en esta entrega. Se pueden revisar por `created_at` y
  eliminar de Drive cuando se determine que el borrador fue abandonado. No borrar
  archivos asociados a campañas mientras Meta pueda necesitarlos.

Aplicar también `20261014080000_campaign_attachments/migration.sql` con el comando
habitual `prisma migrate deploy` y regenerar Prisma antes de iniciar API/worker.
Se reutilizan las credenciales existentes, exclusivamente en backend:
`GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_DRIVE_REFRESH_TOKEN`
y `GOOGLE_DRIVE_FOLDER_ID`. La cuenta OAuth debe poder crear archivos en esa carpeta
y compartirlos públicamente. No hace falta instalar un conector de Drive en el navegador.

Las pruebas automatizadas simulan Drive/Meta. Validar con una línea de prueba que
`webContentLink` entrega bytes sin autenticación ni páginas de confirmación; las
restricciones de la organización, cuotas o avisos de Drive pueden impedir que Meta
descargue un archivo público. Esta entrega no hace envíos ni cargas reales.

### Verificación de la refactorización

- Frontend: 579 pruebas aprobadas, incluidas ausencia de polling, refetch manual,
  selección entre páginas, búsqueda remota, respuestas obsoletas y navegación.
- Backend: 49 pruebas unitarias focalizadas de campañas, adjuntos, plantillas y
  proveedor de Drive; cuatro pruebas con PostgreSQL real en esquema temporal,
  incluida la nueva migración y la asociación concurrente del adjunto.
- Typecheck de frontend/backend; lint de los archivos modificados.
- No se aplicaron migraciones a las tablas de la aplicación ni se llamaron servicios
  reales de Drive/Meta. Aplicar la migración de adjuntos al desplegar.
