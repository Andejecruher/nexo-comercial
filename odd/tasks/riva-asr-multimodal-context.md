# NVIDIA Riva ASR and multimodal context reliability
Branch: `main` | Delivery: `ask-on-risk` | Runner: `cd backend && npm test -- --runInBand <paths>`
Objective: Diagnose and correct NVIDIA Riva ASR, multimodal context delivery, observability, and regression coverage without changing unrelated worktree files.

## Specs

1. **S1 — Root-cause diagnosis and flow reconstruction**
   Authorized scope from the request:
   > Reconstruir el flujo completo desde la recepción del audio hasta su entrega a la IA.
   > Identificar el timeout efectivo y su alcance.
   > Revisar la propagación y limpieza de `AbortSignal`.
   > Identificar el código y mensaje gRPC originales.
   > Verificar credenciales, endpoint, modelo y configuración de idioma.
   > Verificar el formato real de los audios de WhatsApp y cualquier conversión.
   > Auditar `encoding`, `sample_rate_hertz`, número de canales, chunks, cierre del stream y resultados finales.
   > Determinar si se utiliza correctamente `Recognize` o `StreamingRecognize`.
   > Investigar si el procesamiento del audio ocurre antes o después de construir el contexto del agente.
   Acceptance: the final diagnosis distinguishes confirmed findings from hypotheses and cites repository paths and lines.

2. **S2 — Correct ASR behavior**
   Exact requested outcomes:
   > Resolver los errores demostrados por el análisis.
   > Hacer configurable el timeout de ASR, con valores razonables y documentados.
   > Evitar cancelaciones prematuras y fugas de streams o listeners.
   > Preservar el error original de gRPC en logs estructurados.
   > Implementar reintentos acotados únicamente para fallos transitorios.
   > Garantizar que la codificación de audio corresponda exactamente con la configuración enviada al proveedor.
   > Asegurar que el resultado final sea consolidado correctamente sin duplicados ni pérdida de fragmentos.
   > Mantener compatibilidad con la arquitectura y los contratos existentes.
   Acceptance: focused Riva tests cover timeout, external cancellation, permanent/transient gRPC errors, premature close, partial/final results, and stream cleanup.

3. **S3 — Safe AI context delivery**
   Exact requested outcomes:
   > Verificar que la transcripción completada sea la fuente utilizada por el agente.
   > Evitar presentar contenido inexistente como una transcripción válida.
   > Evitar que errores de ASR provoquen creación o modificación de tickets basados en información desconocida.
   > Definir un fallback controlado para audios que no puedan transcribirse.
   > Conservar trazabilidad entre mensaje original, transcripción y ejecución del agente.
   > Comprobar que mensajes consecutivos y procesos asíncronos no mezclen sus contextos.
   Acceptance: orchestration tests prove completed transcription is passed to the agent and ASR failure cannot invoke ticket-mutating tools.

4. **S4 — Observability**
   Exact requested events:
   > Inicio y fin de transcripción.
   > Descarga y conversión del audio.
   > Duración de cada etapa.
   > Configuración técnica no sensible del audio.
   > Timeout y causa de cancelación.
   > Código y detalle gRPC.
   > Resultado final y estado de transcripción.
   > Entrega confirmada del contexto al agente.
   Constraint:
   > No registrar credenciales, tokens, audios completos ni transcripciones sensibles.

5. **S5 — Tests and regression safety**
   Exact requested cases:
   > Audio válido y transcripción exitosa.
   > Audio de WhatsApp que requiere conversión.
   > Timeout.
   > Cancelación externa.
   > Error gRPC permanente.
   > Error gRPC transitorio recuperable.
   > Stream cerrado prematuramente.
   > Resultados parciales y finales.
   > Mensajes consecutivos en una misma conversación.
   > Fallo de transcripción sin modificación indebida de tickets.
    > Entrega correcta de la transcripción al agente.

6. **S6 — Pipeline retry, fallback, and diagnostic integrity**
   Authorized scope from the current request:
   > Los deadlines y reintentos respetan el presupuesto global.
   > No existen ejecuciones redundantes injustificadas del mismo proveedor.
   > El manejo de errores gRPC conserva detalles diagnósticos.
   > El fallback funciona correctamente con los proveedores disponibles.
   > Se evita convertir el mismo audio varias veces innecesariamente.
   > Los logs no exponen el contenido del audio.
   > No aumentes los valores existentes sin evidencia.
   > No dependas de NVIDIA para ejecutar la suite automatizada.
   Acceptance: the pipeline keeps its global budget across technical attempts and provider fallback, records the causal gRPC error, and its deterministic tests prove the retry/fallback/cancellation contract without NVIDIA access.

## Tasks

- T1 — S1-S2-S4, inline, status: complete, commit: cfe24bc. Diagnose and harden Riva configuration, audio contract, deadline/abort lifecycle, error preservation, bounded transient retries, and structured ASR events.
- T2 — S3-S4, inline, status: complete, commit: cfe24bc. Preserve safe multimodal fallback, context lineage, and confirmed handoff ordering without ticket mutation on failed ASR.
- T3 — S5, inline, status: complete, commit: 4151ccb. Add/update focused regression tests, run typecheck and relevant suites, and record differential/regression evidence.
- T4 — S2-S4-S5-S6, inline, status: complete, route evidence: existing in-progress Riva changes and a bounded audit identified nested retry/budget defects; corrected only the affected Riva and multimodal pipeline paths, then added deterministic regression coverage. Commit: 5755392.

## Log

### L1 — Original user request

# Diagnóstico y corrección de NVIDIA Riva ASR en Voz Ciudadana

Actúa como ingeniero senior de backend especializado en NestJS, TypeScript, gRPC, NVIDIA Riva ASR y orquestación multimodal.

## Contexto

En Voz Ciudadana, los usuarios envían audios por WhatsApp que deben transcribirse y convertirse en contexto para el agente de IA.

Actualmente aparecen estos errores:

- `AI_ASR_CANCELLED`, HTTP 499, cancelación por `AbortController` activado desde `multimodal.service.ts:28`, aproximadamente a los 10 segundos.
- `AI_ASR_FAILED`, HTTP 502, error procedente de `ClientDuplexStreamImpl`, sin detalles gRPC visibles.
- `multimodal.satellite_failed`, seguido de `fsm_v2.ai_handled`.

## Archivos iniciales

- `backend/src/ai/services/nvidia-riva.service.ts`
- `backend/src/ai/services/multimodal.service.ts`

Localiza también los servicios relacionados con descarga de medios, conversión de audio, manejo de transcripciones, orquestación y construcción del contexto del agente.

## Objetivos

### 1. Investigar la causa raíz

- Reconstruir el flujo completo desde la recepción del audio hasta su entrega a la IA.
- Identificar el timeout efectivo y su alcance.
- Revisar la propagación y limpieza de `AbortSignal`.
- Identificar el código y mensaje gRPC originales.
- Verificar credenciales, endpoint, modelo y configuración de idioma.
- Verificar el formato real de los audios de WhatsApp y cualquier conversión.
- Auditar `encoding`, `sample_rate_hertz`, número de canales, chunks, cierre del stream y resultados finales.
- Determinar si se utiliza correctamente `Recognize` o `StreamingRecognize`.
- Investigar si el procesamiento del audio ocurre antes o después de construir el contexto del agente.

### 2. Corregir la transcripción

- Resolver los errores demostrados por el análisis.
- Hacer configurable el timeout de ASR, con valores razonables y documentados.
- Evitar cancelaciones prematuras y fugas de streams o listeners.
- Preservar el error original de gRPC en logs estructurados.
- Implementar reintentos acotados únicamente para fallos transitorios.
- Garantizar que la codificación de audio corresponda exactamente con la configuración enviada al proveedor.
- Asegurar que el resultado final sea consolidado correctamente sin duplicados ni pérdida de fragmentos.
- Mantener compatibilidad con la arquitectura y los contratos existentes.

### 3. Corregir la entrega de contexto a la IA

- Verificar que la transcripción completada sea la fuente utilizada por el agente.
- Evitar presentar contenido inexistente como una transcripción válida.
- Evitar que errores de ASR provoquen creación o modificación de tickets basados en información desconocida.
- Definir un fallback controlado para audios que no puedan transcribirse.
- Conservar trazabilidad entre mensaje original, transcripción y ejecución del agente.
- Comprobar que mensajes consecutivos y procesos asíncronos no mezclen sus contextos.

### 4. Observabilidad

Agregar eventos estructurados para:

- Inicio y fin de transcripción.
- Descarga y conversión del audio.
- Duración de cada etapa.
- Configuración técnica no sensible del audio.
- Timeout y causa de cancelación.
- Código y detalle gRPC.
- Resultado final y estado de transcripción.
- Entrega confirmada del contexto al agente.

No registrar credenciales, tokens, audios completos ni transcripciones sensibles.

### 5. Pruebas

Agregar o actualizar pruebas para:

- Audio válido y transcripción exitosa.
- Audio de WhatsApp que requiere conversión.
- Timeout.
- Cancelación externa.
- Error gRPC permanente.
- Error gRPC transitorio recuperable.
- Stream cerrado prematuramente.
- Resultados parciales y finales.
- Mensajes consecutivos en una misma conversación.
- Fallo de transcripción sin modificación indebida de tickets.
- Entrega correcta de la transcripción al agente.

## Condiciones

No aplicar cambios superficiales aumentando simplemente el timeout.

Primero identificar y documentar las causas comprobadas. Diferenciar hallazgos confirmados de hipótesis.

Aplicar las correcciones necesarias respetando los contratos, la arquitectura y las convenciones existentes.

Ejecutar las pruebas pertinentes y verificar que no existan regresiones.

## Resultado esperado

Entregar:

1. Diagnóstico de causa raíz con referencias a archivos y líneas.
2. Explicación del flujo anterior y el flujo corregido.
3. Relación de archivos modificados.
4. Cambios implementados y justificación técnica.
5. Resultados de las pruebas ejecutadas.
6. Problemas pendientes que requieran infraestructura, credenciales o configuración externa.

### L2 — Confirmed diagnosis and implementation evidence

- Confirmed in `backend/src/config/env.config.ts:210-216`: the prior 10000 ms `NVIDIA_MULTIMODAL_TIMEOUT_MS` was the total budget for download, conversion, and recognition, and the same value was also used as the Riva deadline. The corrected configuration separates a 30000 ms multimodal budget from a 20000 ms Riva budget; both remain bounded and configurable.
- Confirmed in `backend/src/ai/services/multimodal.service.ts:25-98` and `backend/src/ai/services/nvidia-riva.service.ts:124-200`: parent cancellation and internal timeout are propagated through one signal, timers/listeners are cleaned up, and timeout/cancellation causes are logged without audio or transcript contents.
- Confirmed in `backend/src/ai/services/nvidia-riva.service.ts:243-400`: the service still uses the valid StreamingRecognize contract (config first, raw mono PCM16LE 16 kHz chunks, drain backpressure, end), now preserves gRPC code/details, retries only bounded transient statuses, rejects premature close, and de-duplicates repeated final segments.
- Confirmed in `backend/src/ai/services/ai.service.ts:125-139`: multimodal preparation completes before the orchestrator; only a ready result with completed media context is marked as delivered. A failed satellite returns the existing deterministic fallback before model/tool execution.
- Hypothesis retained: the deployed Riva function, credentials, endpoint reachability, and actual WhatsApp codec distribution still require an environment-backed reproduction; repository tests cannot prove NVIDIA infrastructure availability.

### L3 — Verification evidence

- `cd backend && npm run typecheck`: passed.
- `cd backend && npm run typecheck:test`: passed.
- Focused ASR/multimodal/env suite: 4 suites, 69 tests passed.
- Relevant provider/orchestration/FSM/integration suite: 4 suites, 50 tests passed.
- Full backend suite: 177 suites passed, 1 skipped; 1762 tests passed, 2 skipped.
- `prettier --check` on all changed source/tests/docs: passed; `git diff --check`: passed.

### L4 — Delivery evidence

- Work-unit commit: `cfe24bc fix(ai): harden NVIDIA Riva transcription flow`.
- Regression commit: `4151ccb test(ai): guard ticket state on ASR fallback`.
- The commit contains only this feature's source, tests, documentation, and ODD task document; unrelated pre-existing worktree changes remain unstaged.

Risk: item 4 (gRPC stream cancellation, retry, and listener ordering can leak or duplicate work).

### L5 — Native review state

- `gentle-ai review assess --cwd <repo> --agent opencode --json` classified the candidate as `high_risk` but returned `unassessable` because the pre-existing untracked `scripts/` inventory was not declared.
- Selectorless native STATUS then returned terminal `rdd_disabled`; no review START was executed, and the user-owned review preference was not changed.

### L6 — Local environment evidence

- A secret-safe check found `NVIDIA_API_KEY` present in `backend/.env`; the Riva function, language, timeout, and retry variables are not set there, so the validated schema defaults apply locally. The key value was not printed.
- This does not prove hosted NVIDIA reachability, function authorization, or production WhatsApp codec distribution; those remain external verification items.

### L7 — Current user request

The user requested a root-cause audit and minimal correction for NVIDIA Riva STT failures with OGG/Opus input, including the observed `grpcCode: 4`, `failed to establish link to worker`, duplicate transcription attempts, nested retry/fallback behavior, global timeout accounting, structured secret-safe logging, deterministic gRPC mocks, and validation without claiming NVIDIA availability. T4 reopens the feature for that bounded scope.

### L8 — Audit evidence for T4

- Confirmed by current code: `PipelineRunner.runStep` aborts the runner-wide `AbortController` at a per-step timeout (`backend/src/services/multimodal-test/pipeline-runner.ts:148-165`), making every later retry/fallback inherit an aborted signal.
- Confirmed by current code: `runWithFallback` retries every retriable `StageError` and has no knowledge of internal Riva retries (`backend/src/services/multimodal-test/provider-registry.ts:129-171`), so a Riva technical retry can be multiplied by a pipeline retry of the same provider.
- Confirmed by current code: the current uncommitted Riva deadline split divides the remaining Riva budget by remaining attempts (`backend/src/ai/services/nvidia-riva.service.ts:317-333`), reducing an approximately 30-second global budget to approximately 15 seconds for each of two gRPC attempts.
- Confirmed by current code: raw `console.log` statements still emit the input object containing the audio Buffer (`backend/src/ai/services/nvidia-riva.service.ts:140,200`).
- Confirmed by logs supplied in the current request: an RPC first failed around 29.857 seconds with gRPC code 4, then a later attempt failed to establish a worker link. This establishes the observed behavior, not a root cause in NVIDIA infrastructure.
- Hypothesis pending environment evidence: the NVCF worker-link error can be a remote cold-start/capacity issue, but endpoint/function/language/credential compatibility and local cancellation behavior must remain independently checked.

### L9 — T4 correction and verification evidence

- Regression tests now prove that an oversized retry delay does not prevent the first Riva RPC, an already-aborted pipeline gives each new attempt an aborted signal, and a provider that owns transport retries records its sole outer attempt as one.
- The loopback gRPC integration expectation now matches the preserved gRPC `UNAVAILABLE` classification: `AI_RIVA_UNAVAILABLE`, HTTP 503. It does not call NVIDIA.
- Focused checks passed: 5 suites, 75 tests; `npm run typecheck`; `npm run lint -- --quiet`; `npm run build`; Prettier check; and `git diff --check`.
- The independent recheck in an isolated scratch candidate reproduced no remaining blocker: 3 suites, 48 tests and 1 integration suite, 2 tests passed. Scratch cleanup completed.
- `npm run typecheck:test` remains blocked only by pre-existing errors in `src/__tests__/unit/exports/drive-task.test.ts:10` and `src/__tests__/unit/multimodal-test/document-test.pipeline.test.ts:128`; T4 changed neither file.
- Risk: item 4 (gRPC stream cancellation, retry, and listener ordering can leak or duplicate work). Scope complete; work-unit commit: `5755392 fix(ai): harden Riva retry budgets` on `main`, retained by explicit user decision after safely aborting an incompatible historical feature-branch transfer.
