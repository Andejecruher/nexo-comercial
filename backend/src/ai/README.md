# AI Module (backend/src/ai)

Middleware multimedia (audio/imágenes → texto → Nemotron):
[configuración y contratos](../../docs/multimodal-middleware.md).

## 1) Proposito y arquitectura

Este modulo implementa una capa de orquestacion AI para conversaciones en `HUMAN_FLOW/ESCALATED`, desacoplando:

- razonamiento LLM (providers)
- seleccion de contexto/tema/prompts (registries)
- ejecucion de herramientas reales (tool runners)
- persistencia operativa/observabilidad (`ai_runs`, `ai_tool_calls`)

Arquitectura principal:

- `AIService` coordina entrada/salida con el sistema actual (`backend/src/ai/services/ai.service.ts`).
- `AIOrchestrator` ejecuta loop ReAct con limites (`backend/src/ai/orchestrator/orchestrator.ts`).
- `AgentRegistry`, `TopicRegistry`, `ToolRegistry` resuelven configuracion dinamica desde DB.
- `ProviderFactory` abstrae OpenAI/Anthropic.
- `ToolRunner` enruta tools internas/externas y loggea llamadas.
- `AILogger` persiste ejecuciones y tool calls.

## 2) Flujo end-to-end

Flujo operativo actual:

1. Webhook ingresa por `inbox_events` y el worker arma `MessageOrchestratorService`.
2. Si la conversacion esta en `HUMAN_FLOW` o `ESCALATED`, se invoca `AIService.handleMessage`.
3. `AgentRegistry` resuelve linea y agente AI activo (`communication_lines` + `ai_agents`).
4. `TopicRegistry` selecciona topic/prompt por preferencia, keywords y fallback default.
5. `AIOrchestrator` crea `ai_run`, renderiza prompt, llama provider y ejecuta tools permitidas.
6. `ToolRunner` registra cada tool call en `ai_tool_calls`.
7. Respuesta final se encola via `OutboxProcessorService.enqueue` (no envio directo).
8. Mensaje outbound AI queda persistido en `messages` con `meta.source = "ai"`.

Evidencia de integracion:

- `backend/src/services/events/inbox-processor.service.ts`
- `backend/src/services/orchestrator/message-orchestrator.service.ts`
- `backend/src/ai/services/ai.service.ts`
- `backend/src/services/events/outbox-processor.service.ts`

## 3) Provider abstraction

Implementacion:

- `ProviderFactory` selecciona provider por `ai_agents.provider`.
- `BaseProvider` centraliza normalizacion de texto/tool-calls y manejo de unavailable.
- `OpenAIProvider` usa SDK oficial `openai` por import dinamico.
- `AnthropicProvider` usa `@anthropic-ai/sdk` cuando esta disponible.

Comportamiento importante:

- si falta API key/SDK, provider retorna `providerUnavailable` y run queda `skipped`.
- el orquestador no rompe el flujo general del sistema ante indisponibilidad de provider.
- en arranque de `server` y `worker`, `logLlmSdkReadiness()` (`src/ai/health/llm-sdk.readiness.ts`) intenta importar SDKs y loguea el resultado (sin red); si falla el import, el mensaje incluye la causa (no solo "not installed").
- errores de import en `OpenAIProvider` / `AnthropicProvider` propagan el mensaje real de `Error` para facilitar diagnostico en Docker/volumenes.

### 3.1) Metadata de agentes (admin)

`ai_agents.metadata` permite defaults avanzados por linea/agente. Se aceptan claves camelCase o snake_case:

| Clave camelCase      | Alias snake_case       | Tipo    | Rango / regla      |
| -------------------- | ---------------------- | ------- | ------------------ |
| `topP`               | `top_p`                | number  | `0 <= value <= 1`  |
| `topK`               | `top_k`                | number  | `integer >= 1`     |
| `frequencyPenalty`   | `frequency_penalty`    | number  | `-2 <= value <= 2` |
| `presencePenalty`    | `presence_penalty`     | number  | `-2 <= value <= 2` |
| `stream`             | -                      | boolean | `true/false`       |
| `chatTemplateKwargs` | `chat_template_kwargs` | object  | objeto JSON        |

Reglas de validacion en API admin:

- Si se envian camelCase y snake_case del mismo campo, deben tener el mismo valor.
- `stream` solo acepta booleano real o string `'true'/'false'`.
- `chatTemplateKwargs`/`chat_template_kwargs` deben ser objetos JSON (no arrays ni strings).

Referencia de implementacion:

- `backend/src/ai/config/agent-metadata.ts`
- `backend/src/controllers/admin-ai.controller.ts`

El endpoint `GET /api/v1/admin/ai/agents/:id/detail` incluye `metadataGuide` para que frontend/admin panel pueda renderizar ayuda contextual.

### 3.2) Conectar una línea, un agente, sus tópicos y prompts

La cadena que utiliza el motor es `CommunicationLine → AiAgent → AiAgentTopic → AiTopic + AiPrompt`.
Crear los registros por separado o guardar `metadata.topicIds` / `metadata.promptIds` no crea estas relaciones.
Sin un vínculo activo y un prompt activo, el orquestador devuelve `handled: false`.

En **Canales de IA → Agentes → detalle del agente → Tópicos**, selecciona cada tópico,
su prompt, la prioridad y un único predeterminado; pulsa **Guardar asignaciones**.
Los prompts pueden ser del propio tópico o globales (sin `topicId`). Las herramientas se
configuran desde **Editar tópico y herramientas** y se resuelven mediante `AiTopicTool`.
La pestaña General muestra relaciones efectivas y avisa si falta una línea activa con IA habilitada.

`PUT /api/v1/admin/ai/agents/:id/topics` recibe:

```json
{
  "assignments": [
    {
      "topicId": "UUID del tópico",
      "promptId": "UUID del prompt",
      "priority": 100,
      "isDefault": true
    }
  ]
}
```

Requiere `ai.view` y `ai.create`. Valida todos los vínculos y los guarda en una transacción;
los omitidos se desactivan solo para ese agente. Una lista vacía quita todos sus tópicos.
El detalle devuelve `topicAssignments`, separado de los catálogos de tópicos y prompts disponibles.
No requiere migración: utiliza la tabla `ai_agent_topics` existente. Las selecciones antiguas
en metadata deben conectarse explícitamente en esta pantalla, sin inferir pares ambiguos.

En esta versión, el valor interno de proveedor `openai` se conecta a NVIDIA NIM y usa
`NVIDIA_API_KEY`. El catálogo del formulario sugiere `nvidia/nemotron-3.5-lightning-30b-a3b`
(el modelo del seed) y `openai/gpt-oss-20b` (el del smoke check). Un modelo personalizado
debe estar disponible en ese endpoint; los formularios conservan las selecciones existentes.

Para comprobar una línea en producción también hay que verificar su `externalIdentifier`
(Phone Number ID de Meta), `isActive`, `aiEnabled`, agente activo, credenciales por línea,
suscripción del webhook, workers/outbox y disponibilidad del proveedor/modelo. Esta configuración
no envía mensajes de prueba ni confirma por sí sola la entrega en WhatsApp.

## 4) Tool system (internal/external)

Diseno:

- `ToolRegistry` trae tools permitidas por topic desde `ai_topic_tools` + `ai_tools`.
- `ToolRunner` valida pertenencia de la tool al topic activo antes de ejecutar.
- `InternalToolRunner` ejecuta llaves internas reales (`createCitizen`, `assignDepartment`, `escalateToHuman`).
- `ExternalToolRunner` ejecuta HTTP tool con politicas de seguridad y timeout.

Validaciones:

- input de tools internas con Zod en `backend/src/ai/validators/tool.schemas.ts`.
- input de tools externas restringido a objeto JSON.

## 5) Seguridad

Controles implementados:

- SSRF guard: bloqueo de localhost/IP privadas (`backend/src/ai/security/http-safety.ts`).
- allowlist de dominios opcional por tool (`allowlist_domains`).
- timeout acotado entre 250ms y 15000ms (`ToolPolicy`).
- auth bearer por `external_auth_env_key` sin hardcode de secretos.
- validacion de payload con Zod antes de ejecutar tools.

Limitaciones de seguridad abiertas:

- no hay aun politica explicita de redaccion de PII en prompts/logs.
- no hay sandbox adicional para tool externa mas alla de HTTP policy.

## 6) Logging y observabilidad

Tablas operativas:

- `ai_runs`: inicio/fin/error de cada corrida AI, prompt snapshot, provider/model, correlacion.
- `ai_tool_calls`: ciclo por llamada de tool, payloads, duracion, estado.

Puntos de escritura:

- `backend/src/ai/logging/ai.logger.ts`
- `backend/src/ai/runners/tool.runner.ts`

Estados:

- run: `running | completed | failed | skipped`
- tool call: `running | completed | failed | blocked`

## 7) Cumplimiento de requerimientos originales

Referencia base: `.github/instructions/ai-orchestration-layer.md`.

| Requerimiento original                                                    | Estado   | Evidencia                                                                                                                                                              |
| ------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AI orchestration layer (no chatbot simple)                                | Cumplido | `backend/src/ai/orchestrator/orchestrator.ts`, `backend/src/ai/services/ai.service.ts`                                                                                 |
| Integracion `Webhook -> inbox_events -> AI orchestrator -> outbox_events` | Cumplido | `backend/src/services/events/inbox-processor.service.ts`, `backend/src/services/orchestrator/message-orchestrator.service.ts`, `backend/src/ai/services/ai.service.ts` |
| No envio directo (usar outbox)                                            | Cumplido | `backend/src/ai/services/ai.service.ts`, `backend/src/services/events/outbox-processor.service.ts`                                                                     |
| Abstraccion provider + uso SDK oficial OpenAI                             | Cumplido | `backend/src/ai/providers/provider.factory.ts`, `backend/src/ai/providers/openai.provider.ts`                                                                          |
| Tools ejecutan logica real y con validacion                               | Cumplido | `backend/src/ai/runners/internal-tool.runner.ts`, `backend/src/ai/validators/tool.schemas.ts`                                                                          |
| Prisma en services, controllers sin logica AI                             | Parcial  | sin AI en controllers (OK), pero acceso Prisma directo en registries/logger: `backend/src/ai/registry/*.ts`, `backend/src/ai/logging/ai.logger.ts`                     |
| Estructura exacta propuesta en `src/services/ai`                          | Parcial  | implementado en `backend/src/ai/*` (misma idea, ubicacion distinta)                                                                                                    |
| Context builder + memory service explicitos                               | Parcial  | hay resolucion de topic/agent por DB, pero no `context-builder.service.ts` ni un cache de contexto dedicado                                                                   |
| Seleccion de agente por reglas de contexto                                | Parcial  | seleccion por `communication_lines` (`AgentRegistry`) y topic por keywords/default (`TopicRegistry`)                                                                   |
| Limite de loops de tools (max 3)                                          | Parcial  | existe limite, pero configurado en `maxToolCalls = 6` y `maxSteps = 4`                                                                                                 |
| Testing AI (seleccion agente, tools, flujo completo)                      | Parcial  | no hay suite AI dedicada en `backend/src/__tests__`                                                                                                                    |

## 8) Mapeo campos solicitados vs esquema enriquecido

Se conserva esquema enriquecido actual (sin simplificar). El siguiente mapeo aclara correspondencia funcional.

### ai_agents

| Solicitado (minimo) | Enriquecido en esquema actual          |
| ------------------- | -------------------------------------- |
| `id`                | `id`                                   |
| `name`              | `name`, `slug` (identificador estable) |
| `provider`          | `provider` (enum `openai/anthropic`)   |
| `model`             | `model`, `temperature`, `max_tokens`   |
| activo/inactivo     | `is_active`                            |
| metadata            | `metadata`, `created_at`, `updated_at` |

### ai_prompts

| Solicitado (minimo)    | Enriquecido en esquema actual                       |
| ---------------------- | --------------------------------------------------- |
| `id`                   | `id`                                                |
| prompt content         | `content`                                           |
| tipo de prompt         | `type` (`system/tool/topic`)                        |
| asociacion topic/agent | `topic_id` + enlace via `ai_agent_topics.prompt_id` |
| versionado             | `version`, `is_active`, `metadata`, timestamps      |

### ai_topics

| Solicitado (minimo) | Enriquecido en esquema actual |
| ------------------- | ----------------------------- |
| `id`                | `id`                          |
| nombre/topic        | `name`, `slug`, `description` |
| prompt principal    | `system_prompt_id`            |
| matcher/intencion   | `matcher_keywords`            |
| activo/inactivo     | `is_active`, timestamps       |

### ai_tools

| Solicitado (minimo)   | Enriquecido en esquema actual                                                                  |
| --------------------- | ---------------------------------------------------------------------------------------------- |
| `id`                  | `id`                                                                                           |
| `name`, `description` | `name`, `description`                                                                          |
| tipo tool             | `kind` + `type`                                                                                |
| schema input/output   | `input_schema`, `output_schema`                                                                |
| execute config        | `internal_key`, `external_url`, `external_method`, `external_headers`, `external_auth_env_key` |
| seguridad/operacion   | `allowlist_domains`, `timeout_ms`, `execution_type`, `config`, `is_active`, timestamps         |

### ai_topic_tools

| Solicitado (minimo)    | Enriquecido en esquema actual                          |
| ---------------------- | ------------------------------------------------------ |
| `topic_id`, `tool_id`  | `topic_id`, `tool_id`                                  |
| habilitacion por topic | `is_active`, `sort_order`, `is_required`, `created_at` |

### ai_agent_topics

| Solicitado (minimo)         | Enriquecido en esquema actual                     |
| --------------------------- | ------------------------------------------------- |
| `agent_id`, `topic_id`      | `agent_id`, `topic_id`                            |
| prompt para ese agent/topic | `prompt_id`                                       |
| prioridad/default           | `priority`, `is_default`, `is_active`, timestamps |

### communication_lines

| Solicitado (minimo)          | Enriquecido en esquema actual                                    |
| ---------------------------- | ---------------------------------------------------------------- |
| identificador de linea/canal | `channel`, `external_identifier`, `phone_number`, `display_name` |
| habilitacion AI en linea     | `ai_enabled`                                                     |
| agente asociado              | `agent_id` (principal) y `ai_agent_id` (legacy compat)           |
| estado operativo             | `is_active`, `is_default`, `provider`, `metadata`, timestamps    |

## 9) Migraciones del modulo AI (alineado a flujo containerizado)

Estado: el esquema efectivo del módulo IA forma parte de la línea base consolidada para instalaciones nuevas.

- Tablas de IA: `backend/prisma/migrations/00000000000001_create_ai_agents/migration.sql` y las migraciones por tabla relacionadas.
- Claves cíclicas: `backend/prisma/migrations/00000000000059_add_shared_constraints/migration.sql`.

Convencion del proyecto:

- En Docker Compose, las migraciones se ejecutan con el servicio `migrator` (`prisma migrate deploy`).
- La API y el worker dependen de que `migrator` termine OK antes de levantar.

Migraciones via contenedor (recomendado):

```bash
# Dev
make migrate-dev

# Prod
make migrate-prod
```

Equivalente explicito con Docker Compose:

```bash
# Dev
docker compose -f docker-compose.dev.yml run --rm migrator

# Prod
docker compose -f docker-compose.prod.yml run --rm migrator
```

Alternativa local (sin contenedor, util para desarrollo puntual):

```bash
# Crea/aplica migracion en entorno de desarrollo
pnpm --dir backend prisma:migrate

# Aplica migraciones versionadas (modo deploy)
pnpm --dir backend prisma:migrate:prod
```

Nota: esta migracion crea objetos AI y `communication_lines`; no simplifica ni elimina campos enriquecidos.

## 10) Seeds (general y AI)

Script agregado:

- `backend/prisma/seed/dev/ai-module.seed.ts`

Incluye (idempotente por `upsert`):

- 1 agent activo
- 1 prompt de topic
- 1 topic
- tools internas de registro y routing (`createCitizen`, `assignDepartment`, `escalateToHuman`)
- relaciones `ai_agent_topics` y `ai_topic_tools`
- 1 `communication_line` activa con AI habilitada

Ejecucion recomendada via contenedor:

```bash
# Seed general
docker compose -f docker-compose.dev.yml run --rm migrator pnpm run prisma:seed

# Seed AI
docker compose -f docker-compose.dev.yml run --rm migrator pnpm run prisma:seed:ai
```

Alternativa local (sin contenedor):

```bash
# Seed general
pnpm --dir backend prisma:seed

# Seed AI
pnpm --dir backend prisma:seed:ai
```

## 11) Proximo paso #3 - playbook manual E2E (inbound -> orchestrator -> AI -> outbox)

Precondiciones:

1. Migraciones aplicadas.
2. Seed AI ejecutado.
3. Variables de entorno minimas:
   - `DATABASE_URL`
   - `OPENAI_API_KEY` (si agent usa OpenAI) o `ANTHROPIC_API_KEY`.
4. Backend API + worker en ejecucion.

Pasos:

1. Asegurar conversacion objetivo en estado `HUMAN_FLOW` o `ESCALATED`.
2. Enviar mensaje inbound por webhook para el telefono de la linea seed.
3. Confirmar que `MessageOrchestratorService` deriva a `AIService`.
4. Confirmar creacion de `ai_runs` y, si aplica, `ai_tool_calls`.
5. Confirmar evento en `outbox_events` y posterior envio por worker.
6. Confirmar mensaje outbound persistido en `messages` con `meta.source = 'ai'`.

SQL de verificacion (`ai_runs`):

```sql
SELECT
  ar.id,
  ar.status,
  ar.provider,
  ar.model,
  ar.input_message,
  ar.model_response,
  ar.error_message,
  ar.steps,
  ar.tool_calls_count,
  ar.correlation_id,
  ar.created_at,
  ar.finished_at
FROM ai_runs ar
ORDER BY ar.created_at DESC
LIMIT 20;
```

SQL de verificacion (`ai_tool_calls`):

```sql
SELECT
  atc.id,
  atc.run_id,
  atc.tool_name,
  atc.status,
  atc.input_payload,
  atc.output_payload,
  atc.error_message,
  atc.duration_ms,
  atc.created_at,
  atc.finished_at
FROM ai_tool_calls atc
ORDER BY atc.created_at DESC
LIMIT 50;
```

SQL de traza cruzada run + tools:

```sql
SELECT
  ar.id AS run_id,
  ar.status AS run_status,
  ar.created_at AS run_created_at,
  atc.tool_name,
  atc.status AS tool_status,
  atc.duration_ms
FROM ai_runs ar
LEFT JOIN ai_tool_calls atc ON atc.run_id = ar.id
ORDER BY ar.created_at DESC, atc.created_at ASC
LIMIT 100;
```

## 13) NVIDIA NIM provider — referencia rápida

### Variables y valores esperados

- **API key var**: `NVIDIA_API_KEY` (prefijo `nvapi-...`)
- **baseURL exacta**: `https://integrate.api.nvidia.com/v1`
- **Modelo soportado (preferido)**: `openai/gpt-oss-120b`
- **Modelo fallback público**: `meta/llama-3-70b-instruct`
- **Stream**: respeta `input.stream`; no fuerza `true`
- **reasoning_content**: emitido antes que `content` en streaming

### Checklist pre-CI (5 puntos)

1. `NVIDIA_API_KEY` definida en `.env` con prefijo `nvapi-`.
2. `baseURL` NO configurada (se usa el default `https://integrate.api.nvidia.com/v1`).
3. Modelo configurado en `ai_agents.model` coincide con el allowlist NVIDIA NIM.
4. Tests unitarios pasan con `pnpm --dir backend test -- openai.provider`.
5. `logLlmSdkReadiness()` en arranque no muestra warning de `NVIDIA_API_KEY`.

### Health check manual

```ts
import { smokeCheckNvidiaProvider } from 'src/ai/providers/openai.provider.health';
await smokeCheckNvidiaProvider(); // lanza si el endpoint no responde
```

Decisiones tomadas:

- se mantuvo esquema enriquecido de AI para trazabilidad y gobernanza operativa.
- se mantuvo integracion via outbox para consistencia con arquitectura actual.
- se priorizo configuracion DB-driven (agentes/topics/tools) sobre hardcode.

Limitaciones abiertas:

- faltan tests dedicados del modulo AI (unit + integration).
- no existe aun playbook automatizado de smoke (solo manual).
- `.env.example` no expone explicitamente llaves `OPENAI_API_KEY/ANTHROPIC_API_KEY`.
