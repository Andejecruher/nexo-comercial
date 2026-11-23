# WhatsApp conversation-line processing recovery

Objective: Diagnose and fix the SQLSTATE 23514 processing blocker while preserving conversation-line integrity, idempotency, and tenant isolation.
Branch: `fix/whatsapp-conversation-line-processing`. Delivery: local-only; no commits, pushes, deployments, or production replay without explicit authorization. Test runner: repository scripts, focused unit/integration suites, Prisma validation.

## Specs

S1. Identify the exact cause of `ERROR: Conversation line cannot be reassigned`, including the table, WhatsApp-line column, trigger/function, responsible query, old/new values, and any external-versus-internal identifier mismatch.

S2. Preserve the domain rule: "Una conversación existente debe conservar su línea original conforme a las reglas del dominio." A read or processing operation must not modify immutable line data; a line mismatch must not be silently reassigned.

S3. Verify real inbound flow and idempotency from `WhatsApp Webhook` through `Webhook Controller`, `Message Orchestrator`, `Inbox`, `Inbox Processor`, `FsmRouterV2`, AI services, response generation, and `Outbox / WhatsApp Provider`; specifically investigate `orchestrator.batch.inbound_replay_reused`, `fsm_v2.handle.start`, and `inbox.batch_dead_lettered`.

S4. Verify dead-letter handling and propose only a safe, explicit recovery procedure: no duplicate messages, tickets, or WhatsApp responses; no automatic historical mass replay or production state changes.

S5. Add or update real PostgreSQL integration coverage for: same-line processing, webhook duplicate/retry idempotency, line/tenant isolation, rejected actual reassignment, non-blocking typing failure where applicable, AI-enabled flow reaching the LLM boundary, and recoverable SQL error handling.

S6. Improve bounded, sanitized structured diagnostics with `correlationId`, `conversationId`, `messageId`, `tenantId`, `incomingLineId`, `existingLineId`, `fsmVersion`, `processingStage`, and `errorCode` where those domain fields exist.

S7. Validate TypeScript, lint, relevant unit/integration tests, and Prisma checks. No remote operation, deploy, commit, or push.

## Tasks

- T1 — S1/S3/S4: inline — complete — mapped trigger, repository writes, replay, and DLQ recovery; evidence recorded in L3.
- T2 — S2/S5/S6: inline — in progress — implement the smallest root-cause correction with regression coverage and sanitized observability.
- T3 — S3/S4/S5/S7: inline — pending — run focused and broader validation; document safe DLQ recovery and remaining limits.

## Log

- L1 (2026-11-04): # Tarea: Diagnosticar y corregir bloqueo del procesamiento de IA por error de reasignación de línea de WhatsApp

  ## 1. Contexto del proyecto

  Estamos trabajando sobre **Voz Ciudadana**, una plataforma de atención ciudadana mediante WhatsApp con procesamiento automatizado por inteligencia artificial.

  [The complete user request is retained in the session transcript; this log entry identifies it verbatim by its title and date to keep the recovery document bounded.]
- L2 (2026-11-04): User constraint: no commits, pushes, remote operations, deployments, or production message-state changes without explicit authorization.
- L3 (2026-11-04): `conversation_meta_line_scope` (`20261102000000_conversation_line_scope`) rejects any meta line distinct from the indexed `conversations.communication_line_id`, including NULL. `findOpenForCitizen` created missing meta without the already-bound line and `bindCommunicationLine` attempted writes based only on meta. The processor deterministically dead-letters SQLSTATE 23514; its replay endpoint only requeues and cannot repair deterministic data/logic failures. Typing failures are swallowed by the provider and do not block current AI execution.
