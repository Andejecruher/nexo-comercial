# Voz Ciudadana — Arquitectura simplificada FSM V2

## Componentes clave

1. **WebhookController**: recibe WhatsApp y persiste `InboxEvent`.
2. **InboxProcessorService**: consume eventos y arma el orquestador.
3. **MessageOrchestratorService**: prepara contexto ciudadano/conversación y persiste inbound.
4. **AiConversationPipelineService**: fachada única para llamar FSM+IA desde el orquestador.
5. **FsmRouterV2**: aplica dedupe + lock + guardrails + invocación IA.
6. **AIService / AIOrchestrator**: resuelve agente, tools y respuesta.
7. **ToolRunner**: ejecuta tools y dispara `executeToolTransition`.
8. **ConversationStateMachine**: valida y persiste transiciones FSM.
9. **OutboxProcessorService**: garantiza envío outbound.

## Flujo de datos

1. Llega mensaje de WhatsApp.
2. Se deduplica por `wamid` y se encola inbox.
3. Se resuelve ciudadano (`findOrCreate`) y conversación activa (`findOrCreateOpen`).
4. `AiConversationPipelineService.handleInbound` centraliza la llamada FSM+IA.
5. `FsmRouterV2.handle` valida estado y decide si IA puede operar.
6. IA responde y/o llama tools.
7. Si una tool es de transición, `ToolRunner` llama `executeToolTransition`.
8. Se persiste outbound en outbox y luego se envía.

## Estados FSM activos

- `BOT_FLOW`
- `REGISTERING`
- `DEPARTMENT_ROUTING`
- `HUMAN_FLOW`
- `ESCALATED`
- `CLOSED`

## Reglas críticas

- Registro confirmado: `REGISTERING -> BOT_FLOW`.
- Routing de departamento: `assignDepartment -> DEPARTMENT_ROUTING` (IA sigue activa).
- Escalado humano: `escalateToHuman -> ESCALATED`.
- No existe fallback alternativo de FSM.

## Integraciones

- **Prisma/Postgres**: estado conversacional, inbox/outbox, citizens/messages.
- **PostgreSQL**: lease lock FSM en `conversation_meta` y dedup por `inbox_events.wamid` (UNIQUE).
- **WhatsApp Cloud API**: inbound/outbound.
- **OpenAI/Anthropic**: providers para ejecución del agente.
