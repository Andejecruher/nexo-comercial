# Runbook: FSM V2 Operations

## Overview

El backend usa **únicamente FSM V2** para enrutar conversaciones:

- `assignDepartment -> DEPARTMENT_ROUTING` (IA sigue activa)
- `escalateToHuman -> ESCALATED`
- `confirmCitizenRegistration -> BOT_FLOW`

No existe feature flag para alternar versiones.

---

## Deployment checklist

- [ ] `prisma migrate deploy`
- [ ] `pnpm --filter backend test -- src/__tests__/unit/fsm/fsm-router-v2.test.ts`
- [ ] `pnpm --filter backend test -- src/__tests__/integration/fsm-v2-routing.test.ts`
- [ ] Verificar logs `fsm_v2.*` sin errores de transición inválida

---

## Monitoring events

| Log Event | Meaning |
|---|---|
| `fsm_v2.handle.start` | mensaje entrando al router FSM |
| `fsm_v2.ai_blocked` | IA bloqueada por estado |
| `fsm_v2.ai_handled` | IA respondió correctamente |
| `fsm_v2.tool_transition.execute` | tool disparó transición |
| `fsm_v2.tool_transition.complete` | transición persistida |
| `fsm_v2.tool_transition.invalid` | intento de transición inválida |
| `fsm_v2.tool_transition.idempotent` | re-invocación de transition-tool sobre el estado destino — tratada como no-op idempotente |

---

## Relevant files

- `src/ai/fsm/fsm-router-v2.ts`
- `src/ai/fsm/fsm-guards.ts`
- `src/ai/fsm/fsm-transitions.ts`
- `src/config/conversation-states.ts`
- `src/services/events/inbox-processor.service.ts`
- `src/services/orchestrator/message-orchestrator.service.ts`
