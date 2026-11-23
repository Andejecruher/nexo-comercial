# Decoupled multimodal test layer (audio / document / image / video)

Branch: `feat/multimodal-test-layer` (from `fix/gcs-iam-signed-urls` HEAD; foreign uncommitted GCS-IAM changes stay unstaged) | Delivery: `ask-on-risk` | Runner: `cd backend && npm test -- --runInBand <paths>`
Objective: Build an independent multimodal testing layer (pure pipelines, orchestrator, internal test endpoints, agent-context adapter) that can process audio, documents, images, and video without the conversational agent, WhatsApp, FSM, orchestrator, or realtime flow.

## Specs

1. **S1 — Pure processing layer, agent-independent**
   Authorized scope:
   > probar audio, documentos, imágenes y video de forma independiente
   > Servicios independientes por tipo de archivo, sin dependencia del agente.
   > Debe existir una abstracción clara para: transcripción de audio, extracción de texto de documentos, OCR / análisis de imágenes, procesamiento de video
   Acceptance: each pipeline is a class with injected provider ports; it imports nothing from the agent/FSM/WhatsApp flow.

2. **S2 — Multimodal orchestration layer**
   > Un servicio que reciba un archivo, detecte/valide su tipo, ejecute el pipeline correcto y devuelva un resultado estándar.
   Acceptance: one orchestrator detects file kind (by mimetype + optional content sniffing) and dispatches to the matching pipeline, returning the standard result envelope.

3. **S3 — Agent adaptation layer**
   > Crea una capa que transforme el resultado multimodal a un formato como: attachments, combinedContextText
   > El agente debe poder consumir esto sin saber cómo fue generado.
   Acceptance: `AgentContextBuilder` maps audio→transcript, document→extracted text/summary, image→OCR+descripción, video→transcript+resumen visual into `{ attachments, combinedContextText }`.

4. **S4 — Internal test endpoints**
   > POST /internal/test/audio/transcribe
   > POST /internal/test/document/extract
   > POST /internal/test/image/analyze
   > POST /internal/test/video/process
   > opcionalmente POST /internal/multimodal/test como endpoint unificado
   > Todos deben aceptar archivos vía multipart/form-data.
   Acceptance: routes mounted under the existing `/api/v1` router as `/internal/test/...` plus unified `/internal/multimodal/test`, guarded with the existing JWT + role guard pattern (INE OCR precedent), reusing the existing multipart raw-body parsing approach.

5. **S5 — Strongly typed contracts**
   > Debes crear contratos fuertemente tipados
   > tipo de archivo, nombre, mimeType, buffer, opciones, pasos ejecutados, tiempos por etapa, metadata técnica, texto extraído, transcript, resumen, OCR, labels, errores, respuesta cruda opcional del proveedor
   Acceptance: `contracts.ts` defines input/result/step/error/provider-port types covering every listed field; no `any` in public contracts.

6. **S6 — Per-step traceability**
   > Cada ejecución debe devolver: correlationId, lista de pasos, estado por paso, startedAt, endedAt, durationMs, metadata técnica, errores normalizados
   Acceptance: every result carries `correlationId`, `steps[]` with per-step status/timestamps/duration/metadata, and normalized errors.

7. **S7 — Per-stage error separation**
   > No quiero errores genéricos tipo “prepare failed”. Quiero saber si falló: validación, descarga, conversión, OCR, STT, parser, extracción de frames, resumen, timeout del proveedor, fallback
   Acceptance: a `MultimodalStage` enum/code set with one code per named stage (including provider timeout and fallback); errors map to the stage where they occurred.

8. **S8 — Audio pipeline**
   > valide el mimetype, lea metadata si es posible, convierta a formato aceptado si aplica, invoque el servicio de transcripción, devuelva transcript, metadata y tiempos
   > Debe quedar preparado para múltiples proveedores de transcripción.
   Acceptance: audio pipeline validates mimetype (reuse Riva's allowed set), probes metadata, converts via existing `FfmpegAudioTranscoder` (PCM16k), calls STT through a `SttProvider` port with fallback support, returns transcript + step timings.

9. **S9 — Document pipeline**
   > detecte tipo de documento, intente extraer texto nativo, use OCR si el documento no tiene texto o si se solicita, genere texto normalizado, opcionalmente haga chunking y summary
   Acceptance: document pipeline tries native text extraction (port + stub, TODO pdf-parse), falls back to / optionally forces OCR (Google Document AI via existing `ine/ocr.provider` port), returns normalized text; chunking/summary marked optional with TODO for summarizer provider.

10. **S10 — Image pipeline**
    > valide formato, lea dimensiones y metadata, ejecute OCR si aplica, ejecute análisis visual si existe proveedor, devuelva descripción, OCR, labels y metadata
    Acceptance: image pipeline validates format (NVIDIA vision allowed set), reads dimensions/metadata (no new deps — basic header parse or ffprobe via ffmpeg), OCR via Document AI when applicable, visual analysis via `NvidiaService.analyzeImage` wrapped in a port.

11. **S11 — Video pipeline**
    > valide formato, extraiga metadata, extraiga audio, transcriba audio, opcionalmente extraiga frames, genere un resultado resumido y reutilizable
    Acceptance: video pipeline validates mimetype, probes metadata (ffprobe or ffmpeg), extracts audio track to WAV via ffmpeg, transcribes via `SttProvider` port; frame extraction optional behind a port with stub/TODO; result summarized and reusable.

12. **S12 — Extensibility**
    > nuevos proveedores de STT, nuevos proveedores OCR, nuevos analizadores de imagen, nuevos procesadores de video, fallback por proveedor, políticas de timeout y retry por tipo
    > Quiero interfaces o puertos claros para cada proveedor.
    Acceptance: one port per capability (`SttProvider`, `OcrProvider`, `ImageAnalysisProvider`, `DocumentTextExtractor`, `VideoFrameExtractor`); a provider registry with ordered providers per capability + per-type timeout policy; adding a provider = implementing the port + registering it.

13. **S13 — Safety and scope**
    > no rompas el flujo actual de producción, agrega esto como módulo nuevo o refactor incremental, si necesitas reutilizar servicios existentes, hazlo con wrappers o adapters, evita duplicar lógica si ya existen piezas útiles, protege los endpoints internos si el proyecto ya tiene mecanismos de auth/guards, documenta supuestos y TODOs
    Acceptance: no edits to production multimodal/FSM/orchestrator files; existing services reused through adapters; internal endpoints guarded; TODOs documented in code + module README.

14. **S14 — Implementation requirements**
    > agrega logs estructurados, agrega timeouts configurables, agrega manejo de errores consistente, si es posible, agrega pruebas unitarias básicas de los servicios puros
    Acceptance: structured logs via `createStructuredLogger`; timeouts configurable via `env.config.ts` (zod, defaults); errors via `AppError` + normalized stage errors; Jest unit tests for pure pipelines with injected fake providers.

## Tasks

| ID | Spec | Route | Status | Commit / Evidence |
| --- | --- | --- | --- | --- |
| T1 | all | inline: feature doc + branch `feat/multimodal-test-layer` | done | branch created from fa83779 |
| T2 | S5,S6,S7,S12 | inline: `contracts.ts`, `pipeline-runner.ts`, `provider-registry.ts`, env vars | done | GREEN: 14/14 tests `src/__tests__/unit/multimodal-test/` (runner + registry); typecheck clean |
| T3 | S8 | writer W1: audio pipeline + Riva STT adapter + tests | pending | — |
| T4 | S9 | writer W2: document pipeline + DocumentAI OCR adapter + native-text stub + tests | pending | — |
| T5 | S10 | writer W3: image pipeline + NVIDIA vision adapter + tests | pending | — |
| T6 | S11 | writer W4: video pipeline + ffmpeg media tools + tests | pending | — |
| T7 | S2,S3,S4,S13 | writer W5: orchestrator + controller + routes + agent-context builder + docs + tests | pending | — |
| T8 | S13,S14 | inline: wiring `routes/index.ts` + composition root, seam check (full suite), review assess, close | pending | — |

Route notes: T3–T6 run as parallel writers (Writer trigger a: independent units, disjoint edit surfaces, each several files/100+ lines). T2 must land first (shared contracts). T8 is parent-owned (touches shared file `routes/index.ts` and the composition root).

## Log

- **L1 (2026-10-24, user request, verbatim):** "Actúa como un arquitecto de software senior y desarrollador backend full-stack, experto en NestJS, TypeScript, pipelines multimodales, observabilidad, refactor seguro y diseño desacoplado. Necesito que implementes en mi proyecto una capa de pruebas multimodales independientes para procesar audio, documentos, imágenes y video sin depender del flujo del agente conversacional, WhatsApp, FSM, Orchestrator ni realtime. [...] Prioridad de implementación: audio, documento, imagen, video, endpoint unificado, adapter para contexto del agente, tests. Si faltan detalles del proyecto, primero infiérelos de la estructura del código existente y deja claramente marcados los puntos donde necesites ajuste manual." (Full request preserved in session history; key verbatim fragments quoted per spec above.)
- **L2 (2026-10-24, environment findings):** Repo is Express + TS + Zod + Prisma (NOT NestJS despite request framing) — follow repo conventions. Existing reusable pieces: `NvidiaRivaService` (STT + PCM16k transcode), `FfmpegAudioTranscoder`, `NvidiaService.analyzeImage` (vision), `ine/ocr.provider.ts` + Google Document AI (JPEG/PNG/PDF OCR), manual multipart raw-body parsing in `ine-ocr.controller.ts`, guards `authMiddleware` + `requireRole` (INE precedent: JWT + SUPER_ADMIN|COORDINADOR), Jest with DI style tests, `createStructuredLogger`, `AppError`. No multer, no pdf-parse/mammoth/sharp — native document text extraction will be a port + stub. Agent integration seam: `AIServiceDeps` takes `Pick<MultimodalService,'prepare'>` (ai.service.ts:34-36).
- **L3 (2026-10-24, repo state):** Working tree on `fix/gcs-iam-signed-urls` has foreign uncommitted changes (GCS IAM fix: workflows, seeds, multimodal.service.ts, message-orchestrator, docs). Decision: create `feat/multimodal-test-layer` from HEAD, stage only this feature's files, leave foreign changes untouched.
