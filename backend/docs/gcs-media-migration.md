# Archivos en Google Cloud Storage

El bucket predeterminado es `voz_ciudadana`. API y worker utilizan ADC mediante
`new Storage()`; `GCS_MEDIA_BUCKET` permite configurar el bucket y
`GOOGLE_APPLICATION_CREDENTIALS` permite seleccionar las credenciales.

## Persistencia y prefijos

| Módulo        | Nombre del objeto                                            | Persistencia                                        |
| ------------- | ------------------------------------------------------------ | --------------------------------------------------- |
| INE           | `INE/<upload_id>/<nombre_archivo>`                           | Rutas relativas en `StoredFile`                     |
| WhatsApp      | `conversations/<line_id>/<conversation_id>/<nombre_archivo>` | Ruta relativa en `storageKey` y `cdnUrl`            |
| Exportaciones | `exports/<tabla>/<nombre_archivo>`                           | Ruta relativa en `ExportJob.filePath` (`file_path`) |
| Campañas      | `campanas/<nombre_campana>/<nombre_archivo>`                 | URL pública permanente en `url` y `viewUrl`         |

Los nombres de WhatsApp y campañas incluyen el UUID del adjunto para evitar
sobrescrituras. Nunca se guardan Signed URLs en la BD. Los IDs de Meta permanecen
en `providerMediaId`; los registros pendientes pueden conservarlos en `storageKey`
hasta que el worker complete el archivado.

## Caché local de media de WhatsApp

`WHATSAPP_MEDIA_DIR` (por defecto `<cwd>/storage/whatsapp`) es una caché de
lectura, no el archivo durable. `PrivateMediaStore` guarda cada descarga con un
nombre derivado de `sha256(line_id:media_id)`, sirve el turno en curso y recurre a
`attachments.storage_key` (solo filas `stored`) cuando la entrada fue podada. Tras
archivar en GCS, `MessageMediaService` elimina la copia local; además, un barrido
oportunista aplica `WHATSAPP_MEDIA_CACHE_TTL_MS` (7 días) y
`WHATSAPP_MEDIA_CACHE_MAX_BYTES` (256 MiB). El directorio nunca se sirve
estáticamente.

INE y WhatsApp conservan sus validaciones de MIME, tamaño y checksum. WhatsApp usa
`pipeline(source, validator, file.createWriteStream())`, CRC32C y una precondición
de creación. La recuperación mediante nombre determinista permite reintentar un
commit de BD fallido sin volver a descargar el archivo de Meta. Un objeto sin
metadatos de validación se descarta utilizando su generación exacta.

## Lecturas y firma al vuelo

El historial de conversaciones y tickets utiliza `Promise.all(registros.map(...))`
y firma cada adjunto en paralelo. Cada firma tiene su propio `try/catch`: si falla,
la URL es `null` y los demás mensajes siguen disponibles. Las URLs V4 de lectura
duran 15 minutos. La serialización oculta `storageKey`, `cdnUrl` y referencias de
Drive. Las respuestas tienen `Cache-Control: private, no-store`.

`GET /api/v1/conversations/:id/attachments/:attachmentId/signed-url` permite renovar
URLs tras comprobar JWT, permisos, conversación y estado `stored`. Los nombres se
obtienen de la BD. La ruta de contenido redirige a GCS; las antiguas referencias
`gs://voz_ciudadana/messages/<id>` y los archivos de Drive siguen legibles.

`GET /api/v1/exports?limit=50` devuelve los trabajos del usuario autenticado,
filtrados por su alcance vigente. La lista y el estado individual inyectan
`cdn_url`, firmada V4 durante 2 horas, solo para trabajos listos y vigentes.
`Promise.all(jobs.map(...))` aísla los errores por registro y devuelve `cdn_url: null`
cuando falla una firma. No se envían `filePath` ni IDs de Drive al frontend.
La descarga con token mantiene sus comprobaciones y redirige a GCS para archivos
nuevos; los históricos conservan la lectura por Drive.

El worker de exportación sube XLSX por stream y guarda su ruta después de completar
la subida. Si falla la persistencia, elimina el objeto subido. La reconciliación
elimina archivos expirados según su referencia de GCS o Drive.

## Campañas públicas y permisos

Solo campañas ejecuta `file.makePublic()` antes de guardar la URL absoluta
`https://storage.googleapis.com/<bucket>/<objeto>`. Si falla la publicación o la
persistencia, elimina el objeto y devuelve un error de subida. Los adjuntos
privados nunca se publican.

La identidad de ejecución necesita crear, leer, actualizar metadatos y eliminar
objetos. Para firmar, ADC debe disponer de una clave de cuenta de servicio o de
`iam.serviceAccounts.signBlob`, con IAM Credentials API habilitada. Un ADC de
usuario que funciona con OCR no necesariamente puede firmar.

El bucket debe permitir las ACL de objeto necesarias para `makePublic()`; el acceso
uniforme y la prevención de acceso público pueden bloquear esa operación. La
identidad también necesita permiso para actualizar las ACL del objeto de campaña.

## Despliegue y migración histórica

Antes de arrancar el código nuevo:

```bash
pnpm --dir backend migrate:deploy
pnpm --dir backend prisma:generate
```

La migración añade `export_jobs.file_path` y amplía las referencias de campañas
para admitir nombres de objetos largos. No mueve archivos históricos.

El script independiente de Drive a GCS usa la nueva estructura relativa y no borra
los originales. Desde `backend/`, con Node 20+, las dependencias instaladas,
`DATABASE_URL`, las credenciales OAuth de Drive existentes y ADC para GCS:

```bash
# Inspección: no escribe en GCS ni modifica la BD.
node scripts/migrations/drive-media-to-gcs.mjs --folder=ID_CARPETA_DRIVE_REAL

# Transferencia y actualización de cada registro verificado.
node scripts/migrations/drive-media-to-gcs.mjs --folder=ID_CARPETA_DRIVE_REAL --apply
```

Procesa lotes por cursor, comprueba carpeta de origen, tamaño y MD5 y actualiza la
BD mediante comparación del estado original. Los registros sin conversación o
línea se rechazan. Los fallos se registran por ID sin tokens ni URLs; el script
continúa y termina con código 1 si hubo errores. Puede reintentarse: excluye los
registros migrados y recupera subidas completadas. Las credenciales de Drive se
conservan para esta migración y para la lectura histórica.
