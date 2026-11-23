# Infraestructura del módulo de IA (Voz Ciudadana)

> Documento de arquitectura funcional del módulo IA en backend: cómo se conecta una línea con un agente, cómo se resuelven topics/prompts, cómo se habilitan tools y cómo corre el flujo end-to-end.

---

## 1) Vista general

El módulo de IA está construido en 3 capas:

1. **Configuración en base de datos (Prisma/Postgres)**
   - Define agentes, topics, prompts y tools.
2. **Orquestación de runtime (servicios TS)**
   - Resuelve qué agente/prompt/tool usar para cada mensaje.
3. **Ejecución controlada (FSM + guardrails + tool runner)**
   - Ejecuta IA y tools de forma acotada, con transición de estado explícita.

---

## 2) Modelo de datos y relaciones

Archivo fuente: `backend/prisma/schema.prisma`

## 2.1 Relación Línea ↔ Agente

- Tabla/modelo: `CommunicationLine`
- Campos clave:
  - `aiEnabled` (si la línea permite IA)
  - `agentId` (principal)
  - `aiAgentId` (fallback legacy)

Una línea de WhatsApp activa con `aiEnabled=true` se vincula a un `AiAgent`.

## 2.2 Relación Agente ↔ Topic ↔ Prompt

- `AiAgentTopic` (tabla puente)
  - une `agentId + topicId + promptId`
  - `priority`, `isDefault`, `isActive`
- `AiTopic`
  - `slug`, `matcherKeywords`, `systemPromptId`
- `AiPrompt`
  - `content`, `version`, `isActive`, `type`

Regla práctica:
- Un agente puede tener varios topics.
- Cada topic puede resolver su prompt por link directo (`AiAgentTopic.promptId`) o por `AiTopic.systemPromptId`.

## 2.3 Relación Topic ↔ Tools

- `AiTool` define la tool (internal/external, schemas, timeout, config).
- `AiTopicTool` habilita qué tools puede usar cada topic (y orden).

Esto implementa **allowlist por topic** (muy importante para seguridad).

## 2.4 Trazabilidad operativa

- `AiRun` registra cada corrida del agente.
- `AiToolCall` registra cada tool call con resultado/error/latencia.
- `ConversationMeta` guarda `flowState` + `version` (FSM).

---

## 3) Cómo se vincula una línea a un agente (runtime)

Archivo: `backend/src/ai/registry/agent.registry.ts`

Método clave: `resolveLineAgent()`

Flujo de resolución:

1. Busca `CommunicationLine` por `phoneNumber` o `externalIdentifier`.
2. Si no hay match, usa línea default.
3. Valida `aiEnabled=true`.
4. Toma `agentId` (o fallback `aiAgentId`).
5. Carga `AiAgent` activo.

Resultado: `lineId + agent` resuelto para ejecutar IA.

---

## 4) Cómo se resuelve Topic + Prompt

Archivo: `backend/src/ai/registry/topic.registry.ts`

Método clave: `resolve()`

Orden de decisión:

1. **Preferred topic** (si se envía `preferredTopicSlug`).
2. **Keywords** (`matcherKeywords`) contra texto del usuario.
3. **Default topic** (`isDefault=true`).

Prompt final:

- Prioridad 1: `AiAgentTopic.prompt` (link directo).
- Prioridad 2: `AiTopic.systemPrompt`.

Luego el prompt se renderiza con placeholders (`{{citizenId}}`, `{{conversationId}}`, etc.) en:
- `backend/src/ai/core/agent.ts` (`renderPrompt`).

---

## 5) Cómo se habilitan y ejecutan Tools

## 5.1 Selección de tools permitidas

Archivo: `backend/src/ai/registry/tool.registry.ts`

Método: `getToolsForTopic(topicId)`

- Trae tools activas desde `AiTopicTool + AiTool`.
- Devuelve solo las permitidas para ese topic.

## 5.2 Ejecución de tools

Archivo: `backend/src/ai/runners/tool.runner.ts`

Método: `execute(runId, call, allowedTools, context)`

Controles aplicados:

1. Verifica que la tool esté en `allowedTools`.
2. Ejecuta con timeout (`timeoutMs`).
3. Loguea inicio/fin/error en `AiToolCall`.
4. Si la tool es de transición FSM, dispara transición post-tool.

Dispatch interno/externo:

- Internas: `backend/src/ai/runners/internal-tool.runner.ts`
- Externas HTTP: `backend/src/ai/runners/external-tool.runner.ts`

---

## 6) FSM + orquestación de mensajes

## 6.1 Entrada principal de WhatsApp

Archivo: `backend/src/services/orchestrator/message-orchestrator.service.ts`

Método: `handleInboundMessage()`

Hace:

1. `findOrCreate` de ciudadano.
2. `findOrCreate` de conversación.
3. Persiste mensaje inbound.
4. Ejecuta FSM Router (si hay texto).
5. Marca leído en WhatsApp.
6. Emite eventos internos.

## 6.2 Router FSM

Archivos:
- `backend/src/ai/fsm/fsm-router-v2.ts`

Responsabilidades:

- Deduplicación por mensaje.
- Lock distribuido por conversación.
- Guard de estados permitidos para IA.
- Invocación de IA con timeout.
- Transiciones FSM por tools.

Reglas de estados: `backend/src/ai/fsm/fsm-guards.ts`
Transiciones por tool: `backend/src/ai/fsm/fsm-transitions.ts`

---

## 7) Flujo end-to-end (resumido)

1. Llega mensaje inbound WhatsApp.
2. `MessageOrchestratorService` prepara contexto y guarda inbound.
3. `FsmRouterV2` valida estado y guardrails.
4. `AIService` resuelve línea→agente.
5. `AIOrchestrator` resuelve topic/prompt/tools.
6. Provider genera respuesta + posibles tool calls.
7. `ToolRunner` ejecuta tools permitidas.
8. Se persiste `AiRun/AiToolCall`.
9. Se encola outbound y se envía por outbox.

---

## 8) Módulo de registro ciudadano dentro de IA (actual)

### Tools de registro incorporadas

- `createCitizen` (bootstrap por teléfono)
- `validateNeighborhood`
- `updateCitizenProfile`
- `confirmCitizenRegistration`

Archivos:
- `backend/src/ai/tools/create-citizen.tool.ts`
- `backend/src/ai/tools/validate-neighborhood.tool.ts`
- `backend/src/ai/tools/update-citizen-profile.tool.ts`
- `backend/src/ai/tools/confirm-citizen-registration.tool.ts`

### Cierre de registro

La transición `REGISTERING -> BOT_FLOW` se dispara con:
- `confirmCitizenRegistration` (no con `createCitizen`).

---

## 9) Seed y configuración inicial del módulo IA

Archivo: `backend/prisma/seed/dev/ai-module.seed.ts`

Qué inicializa:

- Agente IA
- Topic default
- Prompt del topic
- Tools internas
- Asociación Topic↔Tools
- Asociación Línea WhatsApp↔Agente

Comando:

```bash
npm run prisma:seed:ai
```

---

## 10) Archivos clave (mapa rápido)

| Capa | Archivo | Rol |
|---|---|---|
| DB | `backend/prisma/schema.prisma` | Modelos y relaciones AI/FSM/mensajería |
| Seed | `backend/prisma/seed/dev/ai-module.seed.ts` | Alta inicial de agente/topic/prompt/tools/línea |
| Runtime | `backend/src/ai/services/ai.service.ts` | Entry point del servicio IA |
| Orquestación | `backend/src/ai/orchestrator/orchestrator.ts` | Loop principal de IA + tools |
| Agent resolution | `backend/src/ai/registry/agent.registry.ts` | Línea → agente |
| Topic/prompt | `backend/src/ai/registry/topic.registry.ts` | Selección de topic y prompt |
| Tool policy | `backend/src/ai/registry/tool.registry.ts` | Tools habilitadas por topic |
| Tool execution | `backend/src/ai/runners/tool.runner.ts` | Ejecuta calls y transiciones FSM |
| Internal tools | `backend/src/ai/runners/internal-tool.runner.ts` | Dispatcher de tools internas |
| FSM | `backend/src/ai/fsm/fsm-router-v2.ts` | Router de estado + guardrails |
| Inbound orchestration | `backend/src/services/orchestrator/message-orchestrator.service.ts` | Flujo inbound WhatsApp |

---

## 11) Consideraciones operativas

1. **No mezclar tools entre topics sin control**: cada topic debe exponer solo lo necesario.
2. **Prompt y tools deben estar alineados**: si el prompt pide una tool no habilitada, falla ejecución.
3. **Cuidar PII en logs** (`AiRun.promptSnapshot`, `inputMessage`).
4. **FSM V2** es la única ruta activa en runtime.

---

## 12) Checklist de verificación rápida

- [ ] La línea tiene `aiEnabled=true`.
- [ ] La línea apunta a `agentId` válido.
- [ ] El agente tiene `AiAgentTopic` activo y default.
- [ ] El topic tiene prompt activo resoluble.
- [ ] El topic tiene tools necesarias (`createCitizen`, `validateNeighborhood`, `updateCitizenProfile`, `confirmCitizenRegistration`).
- [ ] El seed AI fue aplicado en el entorno (`npm run prisma:seed:ai`).
