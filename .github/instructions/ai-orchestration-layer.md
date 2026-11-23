Actúa como arquitecto senior backend especializado en sistemas de IA con Node.js.

Trabajas sobre un proyecto existente:

Stack:

- Node.js 20
- Express 4
- TypeScript strict
- Prisma + PostgreSQL
- Google Cloud Pub/Sub (realtime)
- Arquitectura por capas (routes/controllers/services)

---

# OBJETIVO

Implementar una capa de inteligencia artificial basada en:

- Orquestación de agentes
- Ejecución de tools
- Construcción de contexto
- Integración con conversaciones existentes

NO construir un chatbot simple.

Construir una AI Orchestration Layer.

---

# PRINCIPIOS OBLIGATORIOS

- No refactor global.
- No cambiar arquitectura existente.
- No mover carpetas actuales.
- No introducir frameworks pesados (LangChain, etc).
- Usar SDK oficial de OpenAI.
- Prisma solo en services.
- Controllers sin lógica IA.
- IA NO contiene lógica de negocio crítica.
- Tools ejecutan lógica real.
- TypeScript strict.
- Usar undefined, nunca null.

---

# UBICACIÓN DE LA CAPA IA

Crear:

src/services/ai/

Estructura:

ai/
├── orchestrator.service.ts
├── agent-registry.service.ts
├── tool-registry.service.ts
├── context-builder.service.ts
├── prompt-builder.service.ts
├── memory.service.ts
├── types.ts
├── agents/
│ ├── general.agent.ts
│ ├── registration.agent.ts
│ ├── routing.agent.ts
│ └── events.agent.ts
├── tools/
│ ├── create-citizen.tool.ts
│ ├── get-citizen.tool.ts
│ ├── assign-department.tool.ts
│ ├── create-event-registration.tool.ts
│ └── send-message.tool.ts

````

---

# DISEÑO ARQUITECTÓNICO

Implementar patrón:

Input → Context → Agent → Tools → Output

Separar claramente:

- razonamiento (LLM)
- ejecución (tools)

El LLM nunca ejecuta lógica directa.

---

# ORCHESTRATOR SERVICE

Implementar:

```ts
handleIncomingMessage(input: {
  conversationId: string
  message: string
})
````

Flujo:

1 construir contexto
2 seleccionar agente
3 ejecutar agente
4 ejecutar tools si aplica
5 retornar respuesta estructurada

Salida:

```ts
{
  messages: string[]
  actions: []
  nextState?: string
}
```

---

# CONTEXT BUILDER

Debe obtener:

- citizen
- conversation
- conversation_meta
- últimos mensajes (limitado)
- tags
- estado FSM

No cargar todo el historial.

Optimizar tokens.

---

# AGENT REGISTRY

Seleccionar agente según contexto:

- sin ciudadano → registration.agent
- en registro → registration.agent
- intención evento → events.agent
- default → general.agent

NO delegar esta decisión completamente al LLM.

---

# AGENTS

Cada agente debe:

```ts
run({
  message,
  context,
  tools,
});
```

Responsabilidades:

## general.agent

- fallback
- respuestas generales

## registration.agent

- registrar ciudadano
- consentimiento

## routing.agent

- detectar intención
- sugerir departamento

## events.agent

- registrar asistencia
- responder sobre eventos

---

# TOOL SYSTEM

Cada tool:

```ts
{
  name;
  description;
  schema(zod);
  execute();
}
```

Ejemplo:

createEventRegistration
assignDepartment
createCitizen
sendMessage

IMPORTANTE:

- tools llaman services existentes
- tools validan input
- tools son determinísticas

---

# TOOL REGISTRY

```ts
getToolsForAgent(agentType);
```

No todos los agentes tienen todas las tools.

---

# PROMPT BUILDER

Construir dinámicamente:

system prompt:

- rol del agente
- contexto actual
- estado FSM

user prompt:

- mensaje usuario

No usar prompts hardcodeados.

---

# MEMORY SERVICE

Usar almacenamiento en proceso (o PostgreSQL) para:

- estado corto
- cache contexto
- evitar recomputar

No almacenar historial completo aquí.

---

# INTEGRACIÓN CON SISTEMA ACTUAL

Integrar en flujo:

Webhook → inbox_events → AI orchestrator → outbox_events

NO enviar mensajes directamente.

Siempre usar outbox.

---

# REGLAS CRÍTICAS

- IA nunca cambia estado directamente
- IA propone acciones
- backend valida
- prevenir loops de tools (máximo 3 iteraciones)
- validar todas las tools

---

# OBSERVABILIDAD

Loggear:

- input
- contexto resumido
- agente seleccionado
- tools ejecutadas
- output
- errores

---

# TESTING

Crear tests:

- selección de agente
- ejecución de tools
- flujo completo mensaje → respuesta
- edge cases

---

# ENTREGAR

Antes de implementar:

1 análisis de integración con conversations actuales
2 diseño de flujo
3 lista de archivos a crear/modificar

Luego:

4 implementación completa
5 tests
6 checklist validación
7 riesgos técnicos

---

# NO HACER

- No crear chatbot monolítico
- No meter lógica en prompts
- No usar LangChain
- No usar multi-agentes complejos innecesarios
- No romper FSM existente

---

# STOP CONDITION

Detener cuando:

- orchestrator funcione
- 1 agente funcional (general)
- 2–3 tools operativas
- flujo end-to-end funcionando

No avanzar a RAG ni features avanzadas.
