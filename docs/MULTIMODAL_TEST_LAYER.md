# Multimodal Test Layer

Decoupled multimodal processing layer for **audio, documents, images, and video**, designed to be tested independently of the conversational agent, WhatsApp, FSM, orchestrator, and realtime flow. Production services (Riva STT, NVIDIA vision, Google Document AI OCR, ffmpeg) are reused through adapters; no production file's behavior changed.

## Architecture (3 layers)

```
POST /api/v1/internal/*  (multipart/form-data)
        │
        ▼
┌─ Orchestration ──────────────────────────────────────────────┐
│ MultimodalTestOrchestrator: detect/validate kind, size cap,  │
│ dispatch → per-kind pipeline, standard result envelope        │
└──────────────┬───────────────────────────────────────────────┘
               ▼
┌─ Pure processing ───────────────────────────────────────────┐
│ AudioTestPipeline / DocumentTestPipeline / ImageTestPipeline │
│ / VideoTestPipeline  → stages through PipelineRunner          │
│ (per-step trace, timings, normalized per-stage errors)       │
│ ProviderRegistry: ordered providers per capability,          │
│ fallback between providers, per-type timeout/retry policies  │
└──────────────┬───────────────────────────────────────────────┘
               ▼
┌─ Agent adaptation ───────────────────────────────────────────┐
│ buildAgentContext(result) → { attachments, combinedContextText }│
│ (audio→transcript, document→extracted/summary, image→OCR+desc,│
│  video→transcript+visual summary) — consumed without knowing  │
│ how it was produced.                                          │
└──────────────────────────────────────────────────────────────┘
```

Source: `backend/src/services/multimodal-test/` (contracts, pipeline-runner, provider-registry, pipelines/, providers/, orchestrator, options, multipart-parser, agent-context.builder).

## Endpoints

All mounted under the existing `/api/v1` router with JWT and role `SUPER_ADMIN|COORDINADOR`. All accept ONE file via `multipart/form-data` (any field name; first file wins). Options come from the query string. Responses always include the full trace, even on failure.

| Endpoint | Purpose |
| --- | --- |
| `POST /api/v1/internal/test/audio/transcribe` | Audio → transcript (validation, metadata, conversion, STT) |
| `POST /api/v1/internal/test/document/extract` | Document → native text / OCR, normalization, chunks, summary |
| `POST /api/v1/internal/test/image/analyze` | Image → OCR + visual description + labels + dimensions |
| `POST /api/v1/internal/test/video/process` | Video → metadata, audio extraction, transcript, optional frames |
| `POST /api/v1/internal/multimodal/test` | Unified: auto-detects the kind and runs the right pipeline |

### curl examples

```bash
BASE=http://localhost:8000/api/v1
TOKEN=<your JWT>

# Audio → transcript (with a provider forced and a bigger timeout)
curl -X POST "$BASE/internal/test/audio/transcribe?provider=riva&timeoutMs=60000" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@nota-de-voz.ogg"

# PDF → text (native first, OCR fallback; force OCR; chunk the text)
curl -X POST "$BASE/internal/test/document/extract?forceOcr=true&chunkText=true&chunkSize=1200" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@documento.pdf"

# Image → OCR + visual description
curl -X POST "$BASE/internal/test/image/analyze" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@foto.png"

# Video → transcript + metadata + frames
curl -X POST "$BASE/internal/test/video/process?extractFrames=true&maxFrames=3" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@clip.mp4"

# Unified (auto-detect)
curl -X POST "$BASE/internal/multimodal/test?summary=true" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@cualquier-archivo-soportado.pdf"
```

## Query options

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `forceOcr` | bool | `false` | Document/image: run OCR even if native text exists |
| `ocrFallback` | bool | `true` | Document: OCR when native extraction is empty |
| `extractFrames` | bool | `false` | Video: extract key frames |
| `maxFrames` | int 1–10 | `3` | Video: frame cap |
| `chunkText` | bool | `false` | Document: split normalized text into chunks |
| `chunkSize` | int 200–8000 | `1000` | Document: chunk size in characters |
| `summary` | bool | `false` | Document/video: summarize when a summarizer is registered |
| `provider` | string | — | Force a provider id for the primary capability |
| `timeoutMs` | int 1000–600000 | per-kind env | Override the per-kind pipeline budget |
| `includeRawProviderResponse` | bool | `false` | Include sanitized raw provider response |

Invalid values are silently dropped (defaults apply), so a bad query never blocks a test upload.

## Result envelope

```jsonc
{
  "correlationId": "uuid",
  "kind": "audio",                    // audio | document | image | video
  "filename": "nota.ogg", "mimeType": "audio/ogg",
  "status": "completed",              // completed | partial | failed
  "startedAt": "…", "endedAt": "…", "durationMs": 1234,
  "steps": [
    { "stage": "validation", "status": "ok", "startedAt": "…", "endedAt": "…", "durationMs": 0 },
    { "stage": "conversion", "status": "skipped", "metadata": { "reason": "format already accepted by provider" } },
    { "stage": "stt", "status": "ok", "durationMs": 900, "metadata": { "provider": "riva", "attempt": 1 } }
  ],
  "errors": [],                       // normalized per-stage errors (never "prepare failed")
  "payload": { "transcript": "…" },   // transcript / extractedText / ocrText / normalizedText /
                                      // chunks / summaryText / description / labels / pages / confidence
  "metadata": { "bytes": 1234, "durationSeconds": 8.2, "sampleRateHz": 16000 },
  "providersUsed": ["riva"],
  "agentContext": {                   // ready for the agent without re-running
    "attachments": [{ "type": "AUDIO_TRANSCRITO", "text": "…" }],
    "combinedContextText": "[CONTEXTO DEL SISTEMA]…"
  }
}
```

Stage codes distinguish: `validation`, `metadata`, `conversion`, `native_text`, `ocr`, `stt`, `parser`, `audio_extraction`, `frame_extraction`, `visual_analysis`, `summary`, plus `PROVIDER_TIMEOUT`, `<CAPABILITY>_FALLBACK_EXHAUSTED`, `<CAPABILITY>_NO_PROVIDER`, `PIPELINE_BUDGET_EXHAUSTED`.

## Configuration (env)

| Variable | Default | Meaning |
| --- | --- | --- |
| `MULTIMODAL_TEST_ENABLED` | `true` | Enables the internal endpoints (404 when off) |
| `MULTIMODAL_TEST_AUDIO_TIMEOUT_MS` | `120000` | Audio pipeline budget |
| `MULTIMODAL_TEST_DOCUMENT_TIMEOUT_MS` | `120000` | Document pipeline budget |
| `MULTIMODAL_TEST_IMAGE_TIMEOUT_MS` | `60000` | Image pipeline budget |
| `MULTIMODAL_TEST_VIDEO_TIMEOUT_MS` | `300000` | Video pipeline budget |
| `MULTIMODAL_TEST_MAX_RETRIES` | `1` | Retries per provider |
| `MULTIMODAL_TEST_RETRY_DELAY_MS` | `100` | Delay between retries |
| `MULTIMODAL_TEST_MAX_FILE_MB` | `25` | Max upload size |

## Agent integration seam

`AIService` already accepts `Pick<MultimodalService, 'prepare'>` (backend/src/ai/services/ai.service.ts). To reuse test-layer results in the agent flow later: run the pipeline (or call the internal endpoint), keep the `MultimodalTestResult`, and feed `buildAgentContext([result]).attachments` into the existing `buildMultimodalPayload` path — the agent consumes the same `[TIPO: …]` context format it already understands, without knowing how it was produced.

## Extending with new providers

Implement the port from `contracts.ts` (`SttProvider`, `OcrProvider`, `DocumentTextExtractor`, `ImageAnalysisProvider`, `VideoFrameExtractor`, `VideoAudioExtractor`, `MediaMetadataProvider`, `TextSummarizerProvider`) and register it in the composition factory (`multimodal-test.factory.ts`). First registration per capability is primary; the rest are fallbacks in order.

## Assumptions / TODOs (manual integration points)

- **ffmpeg / ffprobe binaries** must be available (`FFMPEG_PATH` / `FFPROBE_PATH` overrides). ffprobe does NOT support ffmpeg's `-nostdin` flag — args differ per tool. Used by: audio conversion, video metadata/audio/frames.
- **NVIDIA_API_KEY** (Riva STT + Llama Vision) — without it those providers throw 503 `AI_PROVIDER_UNAVAILABLE`.
- **Google Document AI credentials** (`GOOGLE_CLOUD_PROJECT_ID`, `DOCUMENT_AI_LOCATION`, `DOCUMENT_AI_PROCESSOR_ID`) — the OCR adapter uses the shared Document AI provider; JPEG/PNG/PDF only.
- **Native document text extraction** is a stub (`native-document-text.stub.ts` returns null → OCR fallback). Real native extraction needs a lib (pdf-parse/mammoth) — intentionally not added (no invented dependencies).
- **Text summarizer** is not registered yet (`summary=true` skips with a reason until one is).
- **Structured labels** for images are parsed heuristically from the vision description; a labels-native provider would improve them.
- The shared Document AI provider does not accept `AbortSignal`; strict OCR deadlines rely on the step timeout, not cancellation propagation.
- Riva/transcoder internal limit is 16 MB per audio buffer even though uploads up to 25 MB are accepted.
