# Template media upload audit and correction
Objective: repair evidenced upload defects without replacing architecture or authorization. Branch: fix/template-media-upload. Delivery: ask-on-risk; chain stacked-to-main (user selected "Cadena sobre main"); approximately 920 authored lines, mainly tests/documentation (advisory).
Runners: backend Jest, frontend Vitest, TypeScript and ESLint. Baseline: 3c0c922a6d856bbb3426bc90f89554a73854a65a. RDD: disabled by clone preference.

## Specs
- S1: "Reconstruye el flujo completo desde la selección de un archivo hasta su aceptación por Meta." "Comprueba la generación de `FormData`, los encabezados HTTP y la integridad de los archivos binarios."
- S2: "Investiga la expresión regular `uploadSessionIdPattern` y contrástala con los formatos actuales de respuesta de la API de cargas reanudables de Meta." "Creación de sesiones con IDs que contienen caracteres especiales." "Rechazo de IDs maliciosos o inesperados."
- S3: "Verifica el manejo del App ID, WABA ID, permisos y credenciales, sin imprimir secretos." "Comprueba la estructura de `HEADER.example.header_handle`." "Construcción del payload final con `header_handle`."
- S4: "Audita las validaciones de tipo MIME, firma binaria y tamaño." "Carga de JPEG, PNG, MP4 y PDF." "Rechazo de MIME incorrecto y archivos corruptos."
- S5: "Revisa los posibles errores por concurrencia, cancelación y cambio de tipo de encabezado." "Interrupción y cancelación de cargas."
- S6: "Identifica diferencias entre los medios utilizados para aprobar plantillas y los medios utilizados para enviar mensajes." "Incorpora registros estructurados y sanitizados para diagnosticar errores de Meta." "Manejo de errores HTTP 400, 401, 403, 413, 429 y 5xx cuando corresponda."
- S7: "Corrige únicamente los defectos comprobados o sustentados por pruebas." "Conserva la arquitectura, los contratos públicos y el sistema de autorización existentes." "Evita reemplazos extensos que no estén justificados." "Ejecuta las pruebas, comprobaciones de tipos y verificaciones pertinentes disponibles en el repositorio."
- S8: "Presenta primero un diagnóstico con los defectos confirmados, su evidencia y nivel de gravedad." "Archivos modificados." "Cambios realizados." "Pruebas ejecutadas y resultados." "Riesgos pendientes." "Procedimiento para verificar la carga con una cuenta real de Meta." "No modifiques credenciales, no publiques plantillas reales y no despliegues cambios sin autorización explícita."

## Tasks
- T1 [S1,S2,S3,S4,S6,S7]: inline, complete — preserve multipart bytes, accept safely addressed opaque sessions, add sanitized upstream diagnostics and focused regressions. RED 16 failures; final backend focused 72 passed. Risk: items 2 and 3 (session addressing and shared multipart helper). Commits: 4a61781 (multipart), 13d8f41 (Meta upload).
- T2 [S5,S7]: inline, complete — propagate disconnects and explicit cancellation; prove stale requests cannot populate the form. Explicit cancellation and disconnect RED observed; final frontend focused 16 passed. Risk: item 4 (async cancellation). Commits: 13d8f41 (server cancellation), b571f58 (form cancellation).
- T3 [S1-S8]: inline, complete — audit/real-account procedure documented; checks and independent verification complete, including one scoped correction/recheck. Existing OCR failure and live-account limitations disclosed. Commit: fix/template-media-04-audit (terminal documentation commit reference).

## Log
### L1 — Original request (verbatim)
# Auditoría y corrección de carga multimedia — Voz Ciudadana

Actúa como ingeniero senior especializado en TypeScript, Next.js, Express y Meta WhatsApp Business Cloud API.

**Objetivo:** Investigar y corregir los fallos de carga de archivos multimedia en la sección de creación y edición de plantillas de WhatsApp de Voz Ciudadana.

## Alcance

Analiza los siguientes archivos:

- `frontend/components/templates/TemplateForm.tsx`
- `frontend/lib/templates-api.ts`
- `frontend/lib/api-client.ts`
- `backend/src/routes/templates.routes.ts`
- `backend/src/utils/multipart.ts`
- `backend/src/services/templates/template-management.service.ts`
- `backend/src/services/templates/template.schemas.ts`

Inspecciona también los tests asociados y la documentación técnica existente.

## Investigación obligatoria

1. Reconstruye el flujo completo desde la selección de un archivo hasta su aceptación por Meta.
2. Comprueba la generación de `FormData`, los encabezados HTTP y la integridad de los archivos binarios.
3. Investiga la expresión regular `uploadSessionIdPattern` y contrástala con los formatos actuales de respuesta de la API de cargas reanudables de Meta.
4. Verifica el manejo del App ID, WABA ID, permisos y credenciales, sin imprimir secretos.
5. Comprueba la estructura de `HEADER.example.header_handle`.
6. Audita las validaciones de tipo MIME, firma binaria y tamaño.
7. Revisa los posibles errores por concurrencia, cancelación y cambio de tipo de encabezado.
8. Identifica diferencias entre los medios utilizados para aprobar plantillas y los medios utilizados para enviar mensajes.

## Implementación

Corrige únicamente los defectos comprobados o sustentados por pruebas.

Conserva la arquitectura, los contratos públicos y el sistema de autorización existentes.

Evita reemplazos extensos que no estén justificados.

Incorpora registros estructurados y sanitizados para diagnosticar errores de Meta.

## Pruebas requeridas

- Creación de sesiones con IDs que contienen caracteres especiales.
- Rechazo de IDs maliciosos o inesperados.
- Carga de JPEG, PNG, MP4 y PDF.
- Rechazo de MIME incorrecto y archivos corruptos.
- Interrupción y cancelación de cargas.
- Construcción del payload final con `header_handle`.
- Manejo de errores HTTP 400, 401, 403, 413, 429 y 5xx cuando corresponda.

Ejecuta las pruebas, comprobaciones de tipos y verificaciones pertinentes disponibles en el repositorio.

## Entregables

Presenta primero un diagnóstico con los defectos confirmados, su evidencia y nivel de gravedad.

Después implementa las correcciones y documenta:

- Archivos modificados.
- Cambios realizados.
- Pruebas ejecutadas y resultados.
- Riesgos pendientes.
- Procedimiento para verificar la carga con una cuenta real de Meta.

No modifiques credenciales, no publiques plantillas reales y no despliegues cambios sin autorización explícita.

### L2 — Evidence and routing
- Diagnostic delivered before implementation. Binary boundary-in-data reproducer: 28 bytes become 10. Existing session regex rejects synthetic base64 and signed session IDs; official Graph upload guide specifies opaque upload IDs, not a formal alphabet. No real account request captured.
- Preserve unrelated `.atl` modifications. Replace pre-existing raw Response console log only as part of requested sanitized diagnostics; exclude it from work-unit commits if safe separation is needed.
- Mapping delegated once because end-to-end evidence exceeded inline budget. Implementation stays inline: no parallel writer reason. Independent verification required for security, shared parser behavior and cancellation.
- Existing MIME limits and minimal signatures are deliberate local policy; full decoding and real token permissions remain unverified. No credentials inspected, no Meta account operations authorized.

### L3 — Implementation and verification
- Parent implemented inline, normalized source before final checks, and added regression tests. Raw Response log disappeared externally before source writes; not restored. Concurrent OCR test edits are excluded from this work.
- Backend full run: 161 suites passed, 1 failed, 1 skipped; tests 1638 passed, 1 failed, 2 skipped. OCR folder-path assertion failure reproduced identically against baseline and candidate in isolated scratch; not caused by this feature. Frontend full run: 108 files / 665 tests passed.
- Backend source/test typechecks, frontend nonincremental typecheck, full lint and final targeted lint passed. One targeted backend lint attempt lacked the configured heap limit and ran out of memory; configured 6144 MiB retry passed. Build/live account/PostgreSQL-specific checks not run.
- Independent verifier (items 2,3,4) tested immutable scratch base/candidate. One blocker found: global JSON normalization changed list error response 500 -> 502. One correction scoped recovery to upload sessions; retained public HTTP regression added; targeted independent recheck 1/1 passed, no new sweep. Final focused backend72/frontend16 passed; full suite counts above predate correction.
- Independent useful probes incorporated into existing tests: all 256 byte values, signed token/signature containing + and /, successful replacement upload followed by header reset. Existing legacy-list HTTP probe retained as a dedicated regression.
- Verifier's initial pnpm invocation unexpectedly resolved packages/touched shared store; no tracked workspace changes. Further isolated checks used direct executables without installation/network. No automatic cleanup of external shared cache attempted.
- Documentation records modified files, sources, proof limits and operator-only real Meta verification stopping before Publish/Save without explicit separate permission. Delivery strategy decision remains before local commits; no push/PR/merge authorized.
- Cleanup exposed a verified isolation side effect: 135 workspace dependency symlinks and 33 ignored launchers pointed at scratch. Parent mapped each exact package target back to the existing root store (zero missing targets), restored links/launchers without installation/version changes, checked module metadata and reran direct checks successfully (backend72/frontend16, all types and targeted backend lint). No tracked source or dependency manifest changed during recovery. Scratch removed; shared caches preserved.

### L4 — Delivery choice (verbatim)
Cadena sobre main

- Plan: four sequential local commits/branch boundaries targeting future main deliveries: multipart framing, backend Meta upload, frontend cancellation, audit/tracking. Each later slice builds on its predecessor and targets main only after predecessor integration; no PRs/push/merge authorized. No draft tracker or feature-branch PR chain.
- Slice 1: baseline..4a61781, branch fix/template-media-01-multipart, 55 authored lines, parser code/tests/docs together; rollback touches only those three files. Slice 2: 4a61781..13d8f41, branch fix/template-media-02-meta-upload, 399 authored lines, Meta upload code/tests/docs together; rollback excludes the parser. Both risk-bearing units were independently verified at feature end. RDD disabled/unmanaged; no native assessment/review started. Parent focused backend proof: 72 passed; later frontend edits cannot affect these backend tests.
- Slice 3: 13d8f41..b571f58, branch fix/template-media-03-form-cancellation, 163 authored lines, form code/transport tests/docs together; rollback excludes server/parser behavior. Commit-hook diff hash exactly matched the verified staged bytes (no normalization change). Parent focused frontend proof: 16 passed; full suite 665 passed before the final scoped backend-only correction.
- Slice 4: b571f58..fix/template-media-04-audit, audit/tracking only, structural readback and whitespace checks. Branch references are local commit boundaries, not published PRs. All future PRs target main in sequence only after predecessor integration; no source bytes changed while slicing.
- Closure: all S1-S8 have local proof or explicitly documented live-account/decoder limitations. The unrelated OCR failure remains a follow-up. Actual full terminal commit identity and slice counts are also retained in the Engram mirror locator metadata. No staging or commits include unrelated registry/OCR edits; main remains unchanged.
