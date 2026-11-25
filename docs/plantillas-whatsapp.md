# Plantillas de WhatsApp — Nexo Comercial

Implementación integrada en `/admin/plantillas`, sobre Next.js 16, React 19, react-hook-form, Express y Prisma existentes. Las capturas se usan como referencia visual. No se agregaron dependencias.

## 1. Estructura de componentes y servicios

```text
frontend/
  app/(admin)/admin/plantillas/page.tsx       # Acceso con plantillas.view
  components/templates/
    TemplatesPage.tsx                       # Selector, carga, búsqueda y acciones
    TemplateTable.tsx                      # Tabla y TemplateRow con React.memo
    TemplateForm.tsx                       # react-hook-form, creación/edición/consulta
    VariableEditor.tsx                     # Editor de texto con variables atómicas
    MobilePreview.tsx                      # Vista móvil reactiva
  hooks/useTemplateUpdates.ts              # SSE autenticado, reconexión y cleanup
  lib/templates-api.ts                     # Contratos, servicios y conversión de datos
  lib/template-sse.ts                      # Parser SSE incremental
backend/
  src/routes/templates.routes.ts           # REST, muestras multimedia y SSE
  src/services/templates/
    template.schemas.ts                    # Validación y construcción de components
    template-management.service.ts         # Adaptador HTTP de Meta
    template-status.service.ts             # Parser, persistencia y replay de estados
  src/controllers/webhook.controller.ts    # Extensión del controlador existente
  src/middlewares/metaSignature.middleware.ts
  src/middlewares/idempotency.middleware.ts
  prisma/migrations/00000000000012_create_managed_templates/migration.sql
  prisma/migrations/00000000000022_create_template_status_events/migration.sql
```

Se reutilizan la autenticación Bearer, el refresco de sesión y los permisos `plantillas.view`, `plantillas.create`, `plantillas.update`, `plantillas.delete` del proyecto. La autorización de plantillas tiene alcance global, igual que el módulo ya definido en el catálogo de permisos. No se introduce un ACL por línea; si el proyecto incorpora restricciones por WABA, deben aplicarse tanto a REST como al stream.

El selector usa el ID interno de `CommunicationLine`. El servidor resuelve su WABA y sus credenciales. WABA ID y phone number ID son distintos: las plantillas pertenecen a la WABA y se comparten entre las líneas de esa cuenta. Los secretos permanecen en el servidor.

## 2. Frontend: listado, formulario y vista previa

La tabla incluye acciones para eliminar, consultar, editar y ver estadísticas; nombre, idioma, categoría, estado, calidad y fechas. La búsqueda filtra por nombre. Se recorren los cursores de Meta antes de mostrar la lista, de modo que la búsqueda cubre todas las páginas. Cambiar de línea cancela la carga anterior y abre una nueva suscripción.

`TemplateForm` utiliza `useForm`, `Controller`, `useFieldArray` y `useWatch`. Nombre, idioma, línea y formato de variables quedan bloqueados al editar. El formulario muestra errores de validación y de Meta y evita envíos duplicados mientras una operación está en curso.

`VariableEditor` conserva texto plano en react-hook-form y representa `{{1}}` o `{{nombre}}` mediante spans atómicos (`contentEditable=false`). Los valores siguen siendo cadenas de texto para la API, nunca HTML. Al seleccionar un badge se enfoca su muestra. El pegado se limita a texto plano y la vista de consulta bloquea el editor. Las muestras se envían como `BODY.example.body_text` o `BODY.example.body_text_named_params`.

```tsx
<Controller
  name="body"
  control={control}
  render={({ field }) => (
    <VariableEditor
      value={field.value}
      onChange={field.onChange}
      onBlur={field.onBlur}
      onVariable={(key) => setFocus(`examples.${key}`)}
    />
  )}
/>
```

El encabezado admite texto, JPG/PNG, MP4 y PDF. El formulario sube el archivo de muestra mediante el backend a la API de cargas reanudables de Meta y utiliza el handle resultante. Requiere `whatsappAppId` configurado en la línea. Se admiten imágenes de hasta 5 MB y video/PDF de hasta 16 MB. Las vistas previas de archivos recién elegidos usan URLs locales que se liberan al desmontar. Al consultar una plantilla de Meta sin archivo local, se muestra el tipo de adjunto.

El parser multipart compartido reconoce delimitadores completos, no coincidencias aisladas dentro de los bytes del archivo. Conserva los datos binarios y rechaza cuerpos interrumpidos antes de enviar archivos truncados a Meta; este comportamiento también protege sus consumidores de mensajería y campañas.

Durante la transferencia, el botón «Cancelar carga» permite recuperar el formulario y volver a seleccionar el mismo archivo. Una respuesta tardía de una carga cancelada no registra su handle ni altera una carga posterior; cambiar el tipo de encabezado elimina la muestra anterior.

Se soportan respuestas rápidas, enlaces HTTPS estáticos y teléfono internacional: hasta tres botones, con máximo dos enlaces y un teléfono. Los formatos avanzados que el editor no puede conservar fielmente (por ejemplo, carruseles, enlaces con variables u OTP one-tap) tienen la edición deshabilitada.

`AUTHENTICATION` usa componentes OTP: recomendación de seguridad, vencimiento y botón `COPY_CODE`. Meta genera/localiza el cuerpo; la vista previa es ilustrativa. No se envía texto libre como una plantilla de Marketing.

## 3. Servicios de Meta y contratos REST

Base del backend: `/api/v1/templates`.

| Endpoint del backend                 | Operación en Meta                                                     |
| ------------------------------------ | --------------------------------------------------------------------- |
| `GET /lines`                         | Líneas activas configuradas, sin secretos                             |
| `GET /:lineId?after=...`             | `GET /{waba_id}/message_templates`                                    |
| `POST /:lineId`                      | `POST /{waba_id}/message_templates`                                   |
| `POST /:lineId/:templateId`          | `POST /{template_id}`                                                 |
| `DELETE /:lineId?name=...`           | `DELETE /{waba_id}/message_templates?name=...`                        |
| `POST /:lineId/samples`              | `POST /{app_id}/uploads`, seguido de carga binaria                    |
| `GET /:lineId/:templateId/analytics` | `GET /{waba_id}/template_analytics`, últimos siete días completos UTC |
| `GET /stream?lineId=...&cursor=...`  | SSE sobre el registro persistente local                               |

La edición y consulta de estadísticas comprueban que el ID pertenece a la WABA seleccionada. La eliminación por nombre afecta **todos los idiomas** de ese nombre; la confirmación de la UI lo indica explícitamente.

Las peticiones de gestión usan `Authorization: Bearer`, timeout y una versión Graph configurable mediante `META_TEMPLATES_API_VERSION` (predeterminada `v23.0`). La carga binaria reanudable usa `Authorization: OAuth` y `file_offset: 0`. No se modificó la versión del proveedor de envío de mensajes existente. No se reintentan automáticamente escrituras en Meta.

La validación de sesiones permite tokens base64 y una firma opcional `sig`, con longitud limitada y codificación del token como un único segmento de ruta; rechaza URLs y parámetros arbitrarios. Los errores de carga conservan 429 o usan 502 para fallos de Meta. El diagnóstico estructurado registra únicamente la etapa, el estado HTTP, los códigos numéricos y un identificador de traza acotado, sin mensajes remotos, tokens, handles ni contenido de archivos.

Al cerrarse la conexión del cliente, el servidor cancela las solicitudes pendientes a Meta tanto al crear la sesión como al transferir el binario. Esto no revierte una carga que Meta ya haya aceptado; los reintentos del usuario crean sesiones nuevas, sin reanudación persistida automática.

Ejemplo de entrada al backend:

```json
{
  "name": "seguimiento_ciudadano",
  "language": "es_MX",
  "category": "UTILITY",
  "parameterFormat": "POSITIONAL",
  "headerType": "TEXT",
  "header": "Seguimiento de tu solicitud",
  "mediaHandle": "",
  "body": "Hola {{1}}, tu solicitud {{2}} está en revisión.",
  "footer": "Nexo Comercial",
  "examples": { "1": "Ana", "2": "VC-123" },
  "buttons": [{ "type": "QUICK_REPLY", "text": "Consultar solicitud" }],
  "addSecurityRecommendation": true,
  "codeExpirationMinutes": 10
}
```

El servicio construye `HEADER`, `BODY`, `FOOTER` y `BUTTONS`. Al editar envía únicamente `category` y `components`, sin intentar modificar nombre, idioma o formato de variables.

Meta no proporciona fechas de creación y actualización para este listado de forma equivalente a las capturas. `ManagedTemplate` guarda las fechas de creaciones/ediciones realizadas por esta aplicación. Las demás se muestran como `—`; no se inventan fechas ni se usa la hora de carga de la tabla. Las modificaciones realizadas directamente en Meta no actualizan estas fechas locales. Las operaciones remotas y la escritura de metadatos no forman una transacción distribuida: si Meta acepta una escritura pero falla la persistencia local, revisar la lista antes de reintentar.

## 4. Webhook existente y SSE

Se conserva `POST /api/v1/webhook` y el procesamiento de mensajes/delivery statuses. La extensión recorre todas las entradas y cambios para extraer:

- `entry.id` → WABA.
- `message_template_id`, normalizado a string.
- `message_template_name`.
- `event` → estado.
- `reason`.
- `entry.time` → fecha del evento cuando está disponible.

Los eventos de plantilla no incluyen necesariamente `metadata.phone_number_id`. La validación HMAC ahora resuelve el App Secret por WABA en esos lotes y exige una firma válida para cada cuenta incluida. La firma sigue validándose sobre los bytes originales capturados en `server.ts`.

La idempotencia de mensajes ya no descarta lotes mixtos con estados de plantillas. Se persisten los estados **antes** del HTTP 200; un fallo de base de datos devuelve 500 para permitir que Meta reintente.

`TemplateStatusEvent` es un log compartido en PostgreSQL. La huella del evento deduplica reintentos con timestamp. Si falta `entry.time`, se conserva la hora de recepción y no se puede distinguir con certeza un reintento de una nueva transición idéntica. Un advisory lock de transacción serializa la asignación/commit de IDs para que los cursores no salten eventos de escrituras concurrentes.

SSE consulta el log por WABA y cursor cada dos segundos (latencia aproximada de 0–2 segundos), envía heartbeats, deshabilita el buffering y cierra conexiones lentas. No necesita un EventEmitter en memoria ni que webhook y SSE lleguen a la misma instancia. Cada conexión se renueva al minuto para volver a validar sesión y permisos. Al desconectar se libera su temporizador.

```text
id: 43
event: template_status_changed
data: {"id":"43","waba_id":"123456","message_template_id":"789012","message_template_name":"seguimiento_ciudadano","event":"APPROVED","reason":"NONE","occurred_at":"2026-10-13T18:00:00.000Z"}

```

El log no tiene borrado automático. Antes de incorporar una política de retención deben definirse el período de reconexión soportado y el mecanismo de recuperación cuando un cursor haya expirado.

## 5. Hook integrado y renderizado de una sola fila

`GET /:lineId` toma un cursor **antes** de consultar Meta. Después de cargar todas las páginas, el frontend abre el stream desde ese primer cursor. Así recibe también cambios ocurridos durante la carga.

`useTemplateUpdates` usa `fetch` con lectura incremental de SSE porque el `EventSource` nativo no permite añadir el header Bearer que utiliza esta aplicación. Implementa refresco de token ante 401, reconexión con espera progresiva y cursor, `AbortController` al cambiar de línea/desmontar y parser de frames fragmentados/CRLF/UTF-8. Los tokens nunca viajan en parámetros de URL.

La tabla filtra por WABA, descarta eventos más antiguos que el último aplicado a cada ID y cambia **solo `status`**. `reason` se conserva en el log y viaja en el evento, pero no reemplaza las otras propiedades de la fila.

```tsx
export function applyTemplateStatus(rows, event) {
  const index = rows.findIndex((row) => row.id === event.message_template_id);
  if (index < 0 || rows[index].status === event.event) return rows;
  const next = rows.slice();
  next[index] = { ...rows[index], status: event.event };
  return next;
}
```

`TemplateRow` usa `React.memo`, recibe el objeto original para filas no afectadas y callbacks estables. El contenedor se reconcilia, pero solamente se vuelve a ejecutar/renderizar la fila modificada. Un evento no dispara un refetch. Crear/editar y el botón explícito de actualizar sí recargan la lista.

## 6. Puesta en marcha

### Editor y vista previa de formato

El cuerpo de la plantilla se guarda y se envía a Meta como texto plano. El toolbar escribe los
marcadores que WhatsApp reconoce: `*negrita*`, `_cursiva_`, `~tachado~`, tres acentos graves para
monoespaciado, `1. ` para listas numeradas, `- ` para viñetas y `> ` para citas. La vista previa
interpreta esos marcadores únicamente al renderizar y escapa todo texto restante mediante React.
Los marcadores incompletos o escapados se muestran literalmente. La sustitución de variables por
muestras ocurre antes del renderizado, sin modificar el texto guardado.

WhatsApp no ofrece subrayado nativo estándar. Se retiró el control que generaba `<u>` y el backend
rechaza etiquetas HTML en el cuerpo de nuevas plantillas. No se envía HTML para simular formato.
El catálogo de emojis utiliza las 3773 secuencias `fully-qualified` de Unicode Emoji 15.1,
incluidas combinaciones y tonos de piel. Se generó a partir de `emoji-test.txt` del sistema y no
añade dependencias de ejecución.

Desde la raíz del repositorio:

```bash
pnpm --dir backend exec prisma generate
pnpm --dir backend exec prisma migrate deploy
pnpm --dir backend dev
pnpm --dir frontend dev
```

Aplicar la migración antes de iniciar esta versión del backend. El código y la migración están preparados; no se aplicó una migración sobre la base de datos de la aplicación durante este trabajo.

Configurar una línea WhatsApp activa con WABA ID, phone number ID, App Secret, access token con `whatsapp_business_management` y, para muestras, App ID. Configurar `NEXT_PUBLIC_API_URL` y `CORS_ORIGIN` como en el resto del proyecto. El backend permite `Authorization` en CORS; el hook usa el cursor en la query y no necesita añadir `Last-Event-ID` a los headers del navegador.

En Meta, suscribir la aplicación al campo `message_template_status_update` para la WABA. Meta necesita alcanzar una URL HTTPS pública que llegue al webhook: su servidor no puede llamar al `localhost` de tu equipo. Mantener la ruta interna existente `/api/v1/webhook` detrás de ese acceso público.

Si hay proxy HTTP delante de SSE, deshabilitar buffering/compresión de esa ruta y permitir conexiones de al menos 60 segundos. La autorización del usuario se vuelve a comprobar al reconectar. Las métricas dependen de su disponibilidad y habilitación en Meta; los errores se muestran sin fabricar resultados.

## 7. Verificación

```bash
pnpm --dir backend exec tsc --noEmit
pnpm --dir frontend exec tsc --noEmit
pnpm --dir backend exec jest --runInBand template-management template-webhook template-stream webhook-controller webhook-parser
pnpm --dir frontend exec vitest run components/templates hooks/useTemplateUpdates.test.tsx
```

Las pruebas verifican payloads posicionales/nombrados/OTP, validación, muestras multimedia, pertenencia a la cuenta, firmas WABA, durabilidad antes del 200, replay SSE, aislamiento por cuenta, limpieza, reconexión y preservación de las referencias de filas no afectadas. Meta se simula en las pruebas: la publicación y aprobación reales necesitan una prueba con la cuenta configurada. No se publicaron ni eliminaron plantillas reales.
