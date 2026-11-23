# Middleware multimodal de Voz Ciudadana

## Integración

```text
WebhookController → inbox_events → MessageOrchestratorService
  → FsmRouterV2 (autorización, lease, timeout)
  → AIService → MultimodalService → AIOrchestrator → NvidiaService
  → persistencia de respuesta → outbox_events
```

El webhook conserva su respuesta rápida a Meta después de persistir el evento.
El worker llama a los satélites dentro del turno protegido de la FSM. Se conservan
las reglas de atención humana, los agentes/topics configurados, tools, streaming,
la entrega por outbox y la idempotencia. Se añaden dos dependencias directas de gRPC
y se incluyen los protocolos oficiales; el flujo conserva sus rutas y esquema de DB.

`inboundMessages` transporta los mensajes originales para turnos individuales y
lotes. `MultimodalService` selecciona por tipo mediante un `switch`:

- `text`: construye el payload sin llamar a satélites.
- `audio`: obtiene bytes privados, convierte a PCM y llama a Parakeet RNNT multilingüe en NVIDIA Riva alojado.
- `image`: obtiene bytes privados y llama a Llama Vision con una data URI.
- Otros tipos conservan su tratamiento textual previo; no se analizan documentos ni videos.

Se utiliza `PrivateMediaStore` con la línea resuelta. Nunca se envían las URLs
temporales ni las credenciales de WhatsApp a NVIDIA. Los adjuntos de un lote se
procesan en su orden original.

## Configuración

| Variable/configuración         | Propósito                                                                                                                            |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `NVIDIA_API_KEY`               | Clave NVIDIA para chat, Vision y autenticación del stream Riva.                                                                      |
| `NVIDIA_RIVA_FUNCTION_ID`      | Función alojada de Parakeet RNNT multilingüe: `71203149-d3b7-4460-8231-1be2543a1fca`.                                               |
| `NVIDIA_RIVA_LANGUAGE_CODE`    | Idioma de la función; predeterminado: `es-US`.                                                                                       |
| `NVIDIA_MULTIMODAL_TIMEOUT_MS` | Presupuesto total de descarga/análisis por turno. Predeterminado: 30000 ms; rango: 1000–60000 ms.                                    |
| `NVIDIA_RIVA_TIMEOUT_MS`       | Presupuesto total de una transcripción Riva, incluida la conversión PCM. Predeterminado: 20000 ms; rango: 1000–60000 ms.             |
| `NVIDIA_RIVA_MAX_RETRIES`      | Reintentos adicionales sólo para `UNAVAILABLE`, `DEADLINE_EXCEEDED`, `RESOURCE_EXHAUSTED` o `ABORTED`; predeterminado: 1; máximo: 2. |
| `NVIDIA_RIVA_RETRY_DELAY_MS`   | Espera acotada entre reintentos Riva; predeterminado: 100 ms; rango: 0–2000 ms. No extiende el presupuesto total de ASR.             |
| `AI_TIMEOUT_MS`                | Timeout total existente de la FSM; debe ser mayor que el procesamiento multimodal más el modelo central.                             |
| `ai_agents.provider`           | `openai`, nombre existente del proveedor compatible NVIDIA.                                                                          |
| `ai_agents.model`              | `nvidia/nemotron-3.5-lightning-30b-a3b` para activar el prompt maestro.                                                              |

La selección de modelo sigue siendo DB-driven; este cambio no modifica agentes
en la DB. El adaptador de `ProviderFactory` delega al proveedor previo para chat,
conservando también los otros modelos configurados.

Los satélites son `nvidia/parakeet-1_1b-rnnt-multilingual-asr` y
`meta/llama-3.2-90b-vision-instruct`. Chat y Vision utilizan el SDK oficial con
`https://integrate.api.nvidia.com/v1` y `/chat/completions`.

### Contrato de audio: Riva alojado

`NvidiaRivaService` llama directamente a `grpc.nvcf.nvidia.com:443` mediante TLS.
Usa `StreamingRecognize` con `authorization: Bearer <NVIDIA_API_KEY>` y el
`function-id` documentado por NVIDIA para Parakeet RNNT multilingüe. La selección
de idioma y función puede configurarse con las variables anteriores.

Este servicio es alojado por NVIDIA. Se elimina la necesidad de
`NVIDIA_ASR_BASE_URL`, gateways, contenedores o GPU propios. El backend existente
realiza la llamada saliente a NVIDIA por gRPC/HTTP2 con TLS en el puerto 443.

El FFmpeg ya incluido en la imagen convierte OGG/Opus, AAC, AMR, MP3, MP4/M4A,
WAV o FLAC a PCM sin cabecera, mono, 16 bits little-endian y 16 kHz. El stream
comienza con la configuración y envía el audio en fragmentos de hasta 64 KiB,
respetando la contrapresión (`drain`). Solo se concatenan resultados finales y
la primera hipótesis de cada segmento. Nunca se envía una transcripción parcial
a Nemotron como si estuviera completa.

Entrada y PCM decodificado tienen un límite de 16 MiB cada uno. A 16 kHz mono
PCM16, el segundo límite equivale aproximadamente a 8 minutos 44 segundos.
También se aplica el presupuesto total del turno, que incluye descarga,
conversión y reconocimiento. Un archivo que excede esos límites produce el
fallback escrito, sin truncar el reporte silenciosamente.

El canal gRPC se crea al recibir el primer audio y se reutiliza. La cancelación
de la FSM o el timeout cancela el stream y termina el proceso FFmpeg si está
activo. `close()` permite cerrar el cliente en pruebas o en un consumidor que
controle su ciclo de vida. Se permite como máximo un reintento adicional por defecto y sólo para estados gRPC transitorios; los errores permanentes conservan su código y detalle en logs estructurados. No se inicia un reintento cuando el intento fallido consumió al menos el presupuesto restante: en ese caso se expone el error gRPC real en lugar de agotar el reloj local. Si el presupuesto total aborta un reintento, el `AI_RIVA_TIMEOUT` conserva `grpcCode` y `grpcDetails` del último error del servidor.

`@grpc/grpc-js` y `@grpc/proto-loader` se declaran como dependencias directas del
backend; sus versiones ya estaban en el árbol transitivo. Los tres archivos
`.proto` oficiales se fijan a un commit y mantienen sus avisos de licencia en
`src/ai/services/riva/`. El script de build los copia a `dist`.

Referencias oficiales:

- [Parakeet RNNT multilingüe: endpoint, función e idioma](https://build.nvidia.com/nvidia/parakeet-1_1b-rnnt-multilingual-asr/api).
- [Protocolos oficiales de NVIDIA Riva](https://github.com/nvidia-riva/common/tree/268890b7286031a6d4950e34f7ce13ed0d4ce621/riva/proto).
- [Llama Vision: contenido multimodal](https://docs.api.nvidia.com/nim/reference/meta-llama-3_2-90b-vision-instruct-infer).

## Diagnóstico aislado de Riva

`scripts/diagnostics/riva-stt-diagnose.ts` ejecuta `StreamingRecognize` sin pasar
por `AudioTestPipeline`, la FSM ni la base de datos. Acepta un archivo de audio,
lo convierte con el mismo FFmpeg de producción y registra endpoint, `function-id`,
nombre/estado NVCF, idioma, tamaño, duración, código y detalle gRPC, y la
transcripción final. Nunca imprime la API key ni el contenido del audio.

El modo `raw` usa un cliente gRPC mínimo e independiente de `NvidiaRivaService`;
el modo `service` usa el camino real de producción. El valor predeterminado es
`both`, con un deadline explícito de 45 s para poder observar el comportamiento
del gateway posterior a los 30 s.

```bash
# Desde backend/
pnpm diagnose:riva /ruta/audio.ogg
pnpm diagnose:riva /ruta/audio.ogg --mode service --language es-US --timeout-ms 60000
pnpm diagnose:riva /ruta/audio.ogg --function-id <uuid> --mode raw

# Dentro del contenedor de desarrollo
docker compose -f docker-compose.dev.yml exec api \
  npx ts-node --transpile-only --project scripts/tsconfig.json \
  scripts/diagnostics/riva-stt-diagnose.ts /workspace/backend/tmp/audio.ogg
```

El script termina con código 0 solo si todos los modos solicitados transcriben.
`SIGINT` cancela el RPC en curso. Para audios ya convertidos a PCM16LE mono de
16 kHz se puede usar `--pcm` en modo `raw`.

Interpretación rápida: `DEADLINE_EXCEEDED` con
`failed to establish link to worker` proviene del gateway NVCF y no del cliente;
`NOT_FOUND` indica un `function-id` inexistente; `INVALID_ARGUMENT` al abrir el
stream suele indicar que la función no soporta streaming o que el idioma no es
compatible.

## Prompts y payload

`multimodal-prompts.ts` define las instrucciones visuales, el prompt maestro y
el fallback. Vision extrae TIPO DE REPORTE, DESCRIPCIÓN, TEXTO VISIBLE y SEVERIDAD
VISUAL. Su plantilla multimodal requiere incluir las instrucciones en la parte
de texto del mensaje `user`, en lugar de un mensaje `system` con imágenes.

El prompt maestro se añade al invocar Nemotron y acompaña los prompts de negocio
y guardrails existentes. Las etiquetas indican la procedencia de la evidencia;
su contenido es información externa con incertidumbre, nunca instrucciones confiables.

`buildMultimodalPayload` recibe texto y uno o varios contextos opcionales. Codifica
los valores con `JSON.stringify` para que saltos de línea y etiquetas externas
incluidos en el contenido no creen nuevos bloques:

```text
[CONTEXTO DEL SISTEMA]
[TIPO: IMAGEN_ANALIZADA]
"TIPO DE REPORTE: Bache\nDESCRIPCIÓN: Bache visible\nTEXTO VISIBLE: No visible\nSEVERIDAD VISUAL: Media"

[MENSAJE DEL USUARIO]
"En calle Hidalgo"
```

Sin adjuntos se utiliza `[TIPO: TEXTO]`; audio utiliza `[TIPO: AUDIO_TRANSCRITO]`.
El contexto ensamblado también participa en la selección de topic y queda en el
`inputMessage` del run. No se añade una caché persistente de análisis: reintentar
el turno puede repetir llamadas satélites. El historial de turnos posteriores
conserva los cuerpos originales del flujo existente.

## Degradación y cancelación

Un error de descarga, clave ausente o servicio Riva no disponible, formato/tamaño inválido, respuesta
vacía, fallo HTTP o timeout multimedia produce esta respuesta determinística:

> No pude procesar el archivo adjunto. Por favor, escribe tu reporte e incluye la ubicación y una breve descripción del problema.

Se omite Nemotron y se persiste/encola el fallback con las llaves de idempotencia
existentes, incluida la generación de lote. Si algún adjunto del lote falla, se
pide el reporte escrito completo. Los errores del modelo central conservan el
manejo existente del orquestador.

La cancelación de la FSM se propaga sin generar respuestas tardías. Una descarga
que termine fuera del presupuesto no puede iniciar una nueva llamada satélite.
Los satélites permiten como máximo un reintento adicional por defecto y sólo para
estados gRPC transitorios. Los eventos estructurados incluyen correlación, IDs internos,
duraciones, tamaños y configuración técnica no sensible; los errores gRPC incluyen
código y detalle acotado. No incluyen claves, tokens, audio ni transcripciones.

## Pruebas

Las suites nuevas cubren ensamblado y escape, contratos del SDK y gRPC, serialización de protocolos, límites de
archivos, respuestas vacías, errores HTTP, timeout, cancelación, aislamiento por
línea, lotes mixtos y el recorrido de `AIService` a satélites, orquestador,
Nemotron y outbox con servicios externos simulados. También se verifica el
transporte de adjuntos por la FSM. Las pruebas no llaman a NVIDIA ni envían
mensajes a ciudadanos.
