# Video FFmpeg diagnostics and controlled correction

Objective: diagnose and minimally correct the multimedia video pipeline without changing existing public contracts or unrelated flows.
Branch: `fix/video-ffmpeg-diagnostics`. Delivery strategy: ask-on-risk. Test runner: backend npm/Jest commands from `backend/package.json`.

## Specs

S1. "Primero analiza el código y reproduce el fallo. Después corrige únicamente lo necesario."

S2. "corregir el error sin alterar los flujos que actualmente funcionan." Preserve public contracts, provider architecture, configuration strategy, multimodal, WhatsApp, and AI-agent flows.

S3. Investigate the exact failures "FFPROBE_FAILED" and "VIDEO_AUDIO_EXTRACTION_INPUT_FAILED", including their commands, arguments, source-buffer handling, temporary storage (if any), executable availability, error normalization, and the relationship between failures.

S4. Preserve public messages and codes where applicable while internally logging, when available: "correlationId", "stage", "provider", "executable", "exitCode", "signal", "stderr", "errorCode", "durationMs", "inputBytes", and "inputExists". Do not expose internal paths, traces, file contents, credentials, or tokens.

S5. Cover the requested regression scenarios: valid MP4 with audio; valid MP4 without audio; corrupt MP4; missing input; missing FFprobe; missing FFmpeg; FFprobe process error; timeout; and no regressions in audio, images, or documents. Do not claim unexecuted checks as passed.

S6. "No reescribir el pipeline completo." "No introducir fallbacks silenciosos." "No ocultar errores de infraestructura." "No implementar funcionalidades nuevas que no estén directamente relacionadas con la causa raíz."

## Tasks

- T1 — S1,S3 — inline — completed — Audited code, Docker/configuration, fixture availability, and reproducible local failure modes. Commit: `671f4c7`.
- T2 — S2,S3,S4,S6 — inline — completed — Added runner FFmpeg dependency and safe internal diagnostics while preserving public contracts. Risk: item 5 (runtime image dependency). Commit: `671f4c7`.
- T3 — S5 — inline — partial — Added focused diagnostic regressions and passed declared local checks; exact fixture and host binaries remain unavailable. Commit: `671f4c7`.
- T4 — S1-S6 — inline — completed — Recorded evidence, completed the bounded independent recheck, and committed the work unit. Risk: item 5 (runtime image dependency). Commit: `671f4c7`.

## Log

L1 (2026-10-31): Original user request: "Diagnóstico y corrección controlada del procesamiento de videos en Voz Ciudadana". The request requires a code-first audit and reproduction of `FFPROBE_FAILED` / `VIDEO_AUDIO_EXTRACTION_INPUT_FAILED`, a minimal evidence-based fix only, internal diagnostic logging without altering public responses, regression coverage for the enumerated multimedia cases, project validation using repository-defined commands, a final diff review, and a technical report covering root cause, modified files, compatibility, tests, residual risks, and deployment. The supplied reproduction input is `istockphoto-104602262-640_adpp_is.mp4`, `video/mp4`, 3,280,382 bytes; the observed result has metadata `FFPROBE_FAILED` and audio extraction `VIDEO_AUDIO_EXTRACTION_INPUT_FAILED` within 116 ms.
L2 (2026-10-31): Initial inspection found `ffmpeg-media.tools.ts` pipes the input Buffer directly to both binaries; no temporary-file service is involved. Its runner discards stderr and collapses child `error`, stdin errors, nonzero exits, timeout, and signals to coarse tokens. The host has neither `ffmpeg` nor `ffprobe`; container evidence and the original fixture are not yet available.
L3 (2026-10-31): Audit confirmed production and QA compose targets use the `runner` Docker stage, which previously omitted FFmpeg/FFprobe. `backend/Dockerfile` now installs `ffmpeg` in that stage. This is a confirmed missing runtime dependency, but it does not by itself prove the observed `VIDEO_AUDIO_EXTRACTION_INPUT_FAILED` root cause.
L4 (2026-10-31): Restored the minimal candidate after removing an accidental whole-file Prettier rewrite. `FfmpegMediaTools` now retains bounded stderr only for a failure, sanitizes paths and sensitive tokens, and logs safe internal context; public AppError messages and codes remain unchanged. Process regressions cover actual child stderr, credentials, path spaces, and executable paths with trailing slashes.
L5 (2026-10-31): Observed checks: `pnpm typecheck` passed; `pnpm lint` passed; `pnpm exec jest src/__tests__/unit/multimodal-test/audio-test.pipeline.test.ts src/__tests__/unit/multimodal-test/document-test.pipeline.test.ts src/__tests__/unit/multimodal-test/image-test.pipeline.test.ts src/__tests__/unit/multimodal-test/video-test.pipeline.test.ts --runInBand --silent` passed (4 suites, 117 tests); `docker compose -f docker-compose.prod.yml config --quiet` and `docker compose -f docker-compose.qa.yml config --quiet` passed; `git diff --check` passed. Exact reproduction remains unavailable because the provided MP4 fixture and host FFmpeg binaries are absent, and no running target container was inspected.
L6 (2026-11-01): Independent verification found unsafe handling of quoted paths, Basic authorization credentials, and secrets near the prior stderr tail bound. The bounded correction captures the stderr prefix before sanitization, redacts those forms, and adds a combined actual-process regression. Rechecks passed: focused video suite (45 tests), all four multimedia suites (118 tests), typecheck, lint, and an independent scratch-only recheck of the three original blockers. Unrelated frontend files remain explicitly preserved and unstaged.
