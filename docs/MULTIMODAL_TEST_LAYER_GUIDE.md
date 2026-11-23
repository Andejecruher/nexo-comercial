# Guía para probar la Multimodal Test Layer

Esta guía explica cómo probar los endpoints internos de la capa multimodal con curl o Postman, sin afectar el flujo de producción.

## 1) Requisitos

- Backend corriendo localmente: `http://localhost:8000`
- JWT válido con rol `SUPER_ADMIN` o `COORDINADOR` (obligatorio)
- `MULTIMODAL_TEST_ENABLED=true` (por defecto)
- Para algunos casos: `ffmpeg`/`ffprobe` disponibles, credenciales de NVIDIA Riva/Vision o Google Document AI según el pipeline

## 2) Obtener token JWT

Puedes obtenerlo vía login o desde tests. Ejemplo con endpoint de auth (ajusta según tu entorno):

```bash
curl -X POST "http://localhost:8000/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@vozcuidadana.mx","password":"changeme_in_production_123!"}'
# Copia el token del response
TOKEN="eyJhbGci..."
```

## 3) Endpoints disponibles

Todos bajo `/api/v1/internal`:
- `POST /api/v1/internal/test/audio/transcribe` (audio/*)
- `POST /api/v1/internal/test/document/extract` (pdf/docx/txt)
- `POST /api/v1/internal/test/image/analyze` (image/jpeg, image/png)
- `POST /api/v1/internal/test/video/process` (video/*)
- `POST /api/v1/internal/multimodal/test` (auto-detecta por mimetype)

## 4) Ejemplos con curl

### Audio (transcribir)
```bash
BASE=http://localhost:8000/api/v1
TOKEN="TU_TOKEN_AQUI"

curl -X POST "$BASE/internal/test/audio/transcribe" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@./samples/nota.ogg"
```

Con opciones:
```bash
curl -X POST "$BASE/internal/test/audio/transcribe?provider=riva&timeoutMs=60000" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@./samples/nota.mp3"
```

### Documento (extraer)
```bash
curl -X POST "$BASE/internal/test/document/extract" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@./samples/documento.pdf"
```

Con OCR forzado, chunking y resumen:
```bash
curl -X POST "$BASE/internal/test/document/extract?forceOcr=true&chunkText=true&chunkSize=1200&summary=true" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@./samples/documento.pdf"
```

### Imagen (analizar)
```bash
curl -X POST "$BASE/internal/test/image/analyze" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@./samples/foto.jpg"
```

Con OCR forzado:
```bash
curl -X POST "$BASE/internal/test/image/analyze?forceOcr=true" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@./samples/foto.png"
```

### Video (procesar)
```bash
curl -X POST "$BASE/internal/test/video/process" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@./samples/clip.mp4"
```

Con extracción de frames:
```bash
curl -X POST "$BASE/internal/test/video/process?extractFrames=true&maxFrames=3" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@./samples/clip.mp4"
```

### Unificado (auto-detect)
```bash
curl -X POST "$BASE/internal/multimodal/test" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@./samples/cualquier_archivo.pdf"
```

## 5) Probar con Postman

1. Crear request `POST` a `http://localhost:8000/api/v1/internal/test/audio/transcribe`
2. En `Headers`: `Authorization: Bearer <TU_TOKEN>`
3. En `Body` seleccionar `form-data`
4. Agregar key `file` (tipo File) y seleccionar archivo
5. Agregar query params en `Params` si necesitas opciones (`provider`, `forceOcr`, etc.)
6. Enviar request

## 6) Opciones de query

| Param                        | Tipo               | Default  | Notas                                       |
| ---------------------------- | ------------------ | -------- | ------------------------------------------- |
| `forceOcr`                   | boolean            | false    | Fuerza OCR aunque exista texto nativo       |
| `ocrFallback`                | boolean            | true     | Usa OCR si extracción nativa falla/vacía    |
| `extractFrames`              | boolean            | false    | Extrae frames del video                     |
| `maxFrames`                  | number 1-10        | 3        | Máximo de frames a extraer                  |
| `chunkText`                  | boolean            | false    | Divide texto normalizado en chunks          |
| `chunkSize`                  | number 200-8000    | 1000     | Tamaño de chunk en caracteres               |
| `summary`                    | boolean            | false    | Genera resumen si hay summarizer registrado |
| `provider`                   | string             | -        | Fuerza provider por id (ej. `riva`)         |
| `timeoutMs`                  | number 1000-600000 | por tipo | Timeout personalizado                       |
| `includeRawProviderResponse` | boolean            | false    | Incluye respuesta cruda sanitizada          |

## 7) Respuesta esperada

Siempre retorna envelope completo con `correlationId`, `steps` (trazabilidad por etapa), `errors` normalizados, `payload`, `metadata`, `providersUsed`, y opcionalmente `agentContext`.

Ejemplo:
```json
{
  "correlationId": "e7f3...",
  "kind": "audio",
  "filename": "nota.ogg",
  "mimeType": "audio/ogg",
  "status": "completed",
  "startedAt": "...",
  "endedAt": "...",
  "durationMs": 1234,
  "steps": [
    {"stage": "validation", "status": "ok", "...": "..."},
    {"stage": "conversion", "status": "skipped", "metadata": {"reason": "format already accepted by provider"}},
    {"stage": "stt", "status": "ok", "metadata": {"provider": "riva", "attempt": 1}}
  ],
  "errors": [],
  "payload": {"transcript": "..."},
  "metadata": {"bytes": 12345},
  "providersUsed": ["riva"],
  "agentContext": {
    "attachments": [{"type": "AUDIO_TRANSCRITO", "text": "..."}],
    "combinedContextText": "[CONTEXTO DEL SISTEMA]..."
  }
}
```

## 8) Troubleshooting

| Error                                             | Causa                           | Solución                                               |
| ------------------------------------------------- | ------------------------------- | ------------------------------------------------------ |
| `401 Invalid token` / `403`                       | Token inválido o sin rol        | Usar token con rol `SUPER_ADMIN` o `COORDINADOR`       |
| `404 Not found`                                   | `MULTIMODAL_TEST_ENABLED=false` | Poner `MULTIMODAL_TEST_ENABLED=true` en `.env`         |
| `413 MULTIMODAL_FILE_TOO_LARGE`                   | Archivo > límite                | Reducir tamaño o ajustar `MULTIMODAL_TEST_MAX_FILE_MB` |
| `503 ..._NO_PROVIDER` / `AI_PROVIDER_UNAVAILABLE` | Falta proveedor/credenciales    | Configurar NVIDIA/Google o usar mocks en tests         |
| `VALIDATION_UNSUPPORTED_MIME`                     | Formato no soportado            | Usar formatos soportados por el pipeline               |
