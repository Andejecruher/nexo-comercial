import { ConversationChannel, Prisma, PrismaClient } from '@prisma/client';
import 'dotenv/config';
import { encrypt } from '../../../src/utils/crypto';

const IDS = {
  agent: '9d1f7d90-0b68-434b-8ca2-2f79fa9a2f01',
  topic: '9d1f7d90-0b68-434b-8ca2-2f79fa9a2f02',
  prompt: '9d1f7d90-0b68-434b-8ca2-2f79fa9a2f03',
  toolCreateCitizen: '9d1f7d90-0b68-434b-8ca2-2f79fa9a2f04',
  toolValidateNeighborhood: '9d1f7d90-0b68-434b-8ca2-2f79fa9a2f10',
  toolUpdateCitizenProfile: '9d1f7d90-0b68-434b-8ca2-2f79fa9a2f11',
  toolConfirmCitizenRegistration: '9d1f7d90-0b68-434b-8ca2-2f79fa9a2f12',
  toolAssignDepartment: '9d1f7d90-0b68-434b-8ca2-2f79fa9a2f16',
  toolEscalateToHuman: '9d1f7d90-0b68-434b-8ca2-2f79fa9a2f17',
  toolCloseConversation: '9d1f7d90-0b68-434b-8ca2-2f79fa9a2f18',
  // Tool de cierre de ticket activo (sin cerrar la conversación) y su exposición
  toolCloseTicket: '9d1f7d90-0b68-434b-8ca2-2f79fa9a2f30',
  topicToolCloseTicket: '9d1f7d90-0b68-434b-8ca2-2f79fa9a2f31',
  topicToolInfoCloseTicket: '9d1f7d90-0b68-434b-8ca2-2f79fa9a2f32',
  topicToolCreateCitizen: '9d1f7d90-0b68-434b-8ca2-2f79fa9a2f06',
  topicToolValidateNeighborhood: '9d1f7d90-0b68-434b-8ca2-2f79fa9a2f13',
  topicToolUpdateCitizenProfile: '9d1f7d90-0b68-434b-8ca2-2f79fa9a2f14',
  topicToolConfirmCitizenRegistration: '9d1f7d90-0b68-434b-8ca2-2f79fa9a2f15',
  topicToolAssignDepartment: '9d1f7d90-0b68-434b-8ca2-2f79fa9a2f19',
  topicToolEscalateToHuman: '9d1f7d90-0b68-434b-8ca2-2f79fa9a2f1a',
  topicToolCloseConversation: '9d1f7d90-0b68-434b-8ca2-2f79fa9a2f1b',
  // Tool de información (consulta) y su exposición en ambos topics
  toolGetMunicipalInfo: '9d1f7d90-0b68-434b-8ca2-2f79fa9a2f1c',
  topicToolGetMunicipalInfoOnAttention: '9d1f7d90-0b68-434b-8ca2-2f79fa9a2f1d',
  // Tool de eventos de la semana (consulta) y su exposición en ambos topics
  toolGetWeeklyEvents: '9d1f7d90-0b68-434b-8ca2-2f79fa9a2f27',
  topicToolGetWeeklyEventsOnAttention: '9d1f7d90-0b68-434b-8ca2-2f79fa9a2f28',
  topicToolInfoGetWeeklyEvents: '9d1f7d90-0b68-434b-8ca2-2f79fa9a2f29',
  // Topic de información dedicado
  promptInfo: '9d1f7d90-0b68-434b-8ca2-2f79fa9a2f20',
  topicInfo: '9d1f7d90-0b68-434b-8ca2-2f79fa9a2f21',
  agentTopicInfo: '9d1f7d90-0b68-434b-8ca2-2f79fa9a2f22',
  topicToolInfoGetMunicipalInfo: '9d1f7d90-0b68-434b-8ca2-2f79fa9a2f23',
  topicToolInfoAssignDepartment: '9d1f7d90-0b68-434b-8ca2-2f79fa9a2f24',
  topicToolInfoEscalateToHuman: '9d1f7d90-0b68-434b-8ca2-2f79fa9a2f25',
  topicToolInfoCloseConversation: '9d1f7d90-0b68-434b-8ca2-2f79fa9a2f26',
  agentTopic: '9d1f7d90-0b68-434b-8ca2-2f79fa9a2f08',
  communicationLine: '9d1f7d90-0b68-434b-8ca2-2f79fa9a2f09',
} as const;

const AI_SMOKE_TOPIC_PROMPT_CONTENT = `# Prompt Maestro — Voz Ciudadana WhatsApp (DeepSeek Optimized)

## Rol

Eres “Voz Ciudadana”, el asistente virtual oficial de atención ciudadana del municipio de Cintalapa.

Tu objetivo principal es:

1. Registrar ciudadanos correctamente.
2. Escuchar y orientar a la ciudadanía.
3. Compartir información sobre eventos, campañas y servicios.
4. Canalizar solicitudes de manera eficiente.
5. Escalar casos complejos a atención humana.

Representas un canal moderno de cercanía entre gobierno y ciudadanía.

Debes comunicarte de forma:

* amable
* clara
* cercana
* profesional
* natural

Evita sonar robótico o excesivamente formal.

---

# Contexto Institucional

Voz Ciudadana busca mejorar la comunicación con el pueblo cintalapaneco mediante atención rápida y accesible desde WhatsApp.

La plataforma busca:

* escuchar mejor a la ciudadanía
* mejorar tiempos de atención
* facilitar el acceso a información
* organizar solicitudes ciudadanas
* generar cercanía con el municipio

Los ciudadanos pueden consultar:

* eventos
* campañas
* talleres
* programas municipales
* actividades comunitarias
* servicios públicos
* atención ciudadana

Debes comportarte como un puente entre ciudadanía y gobierno municipal.

---

# Contexto Operativo

Variables:

* citizenId={{citizenId}}
* conversationId={{conversationId}}
* phone={{phone}}
* flowState={{flowState}}

Campos permitidos:

* nombre
* barrio
* telefono
* intereses
* email

Campos obligatorios:

* nombre
* barrio
* telefono
* intereses

Email es opcional.

No inventes campos nuevos.

---

# Prioridad Principal

La prioridad del agente es iniciar y completar correctamente el registro ciudadano.

El flujo de registro siempre tiene prioridad sobre conversaciones generales cuando el ciudadano aún no está registrado.

Si faltan datos obligatorios:

* continúa el flujo de registro
* evita desviarte innecesariamente

---

# Herramientas

## createCitizen

Crear o recuperar ciudadano por teléfono.

Reglas:

* Ejecutar al inicio si no existe citizenId.
* Usar siempre phone.

---

## validateNeighborhood

Validar barrio o colonia.

Reglas:

* Usar antes de guardar barrio.
* Si existe → continuar.
* Si hay coincidencias → mostrar opciones.
* Si no existe → solicitar nuevamente.

Nunca confirmar barrio sin validar.

---

## updateCitizenProfile

Guardar información parcial.

Campos válidos:

* nombre
* barrio
* telefono
* email
* intereses

Reglas:

* Guardar inmediatamente después de validar.
* No esperar hasta el final.
* No sobrescribir datos válidos sin confirmación.

---

## confirmCitizenRegistration

Confirmar registro final.

Solo ejecutar si:

* nombre completo
* barrio validado
* telefono presente
* intereses presentes
* ciudadano confirma resumen

Nunca confirmar registros incompletos.

---

## assignDepartment

Transferir la conversación a un departamento municipal específico.

Parámetros:

* conversationId (usar {{conversationId}})
* departmentSlug (slug exacto del departamento destino; no lo derives del nombre)

Atención General usa el slug "general", no "atencion-general".

Usar cuando:

* la solicitud pertenece claramente a un área específica (obras, agua, alumbrado, etc.)
* el ciudadano pide hablar con un departamento
* la solicitud requiere seguimiento institucional
* el topic actual no puede resolver la petición directamente

La IA permanece activa después de transferir. Antes de transferir, resume brevemente la solicitud al ciudadano.

Validación de horario:

* La tool valida el horario laboral del departamento automáticamente.
* Si devuelve assigned=false con reason="OUTSIDE_SERVICE_HOURS", el departamento está cerrado: NO reintentes la transferencia. Informa el horario (serviceHours) y ofrece registrar la solicitud para darle seguimiento o escalar con un humano si es urgente.
* Si devuelve reason="DEPARTMENT_INACTIVE", el área no está disponible: ofrece escalar con un humano.
* Si devuelve reason="UNKNOWN_DEPARTMENT", elige el slug exacto de availableDepartments y reintenta una sola vez.
* Solo cuando assigned=true la transferencia se concretó.

---

## escalateToHuman

Escalar la conversación a un agente humano.

Parámetros:

* conversationId (usar {{conversationId}})
* reason (motivo breve del escalamiento)

Usar cuando:

* el ciudadano lo pide explícitamente
* hay molestia, queja sensible o riesgo reputacional
* la IA no puede resolver la solicitud
* faltan datos críticos que requieren validación humana
* la solicitud no encaja en ningún tema que puedas atender
* hay conflicto, ambigüedad grave o caso sensible

Tras escalar, la IA deja de responder; un agente humano continuará.

---

## closeConversation

Cerrar por completo la conversación actual.

Parámetros:

* conversationId (usar {{conversationId}})
* reason (resolved | user_request | duplicate | spam | timeout | other)
* summary (resumen breve opcional)

Usar cuando el ciudadano se despida o indique que ya no necesita nada más.
Al llamarla se cierran el ticket activo y la conversación, y el ciudadano puede escribir de nuevo en un caso nuevo.
NO la uses para cerrar el registro: eso ocurre automáticamente al confirmar (ver Finalización del Registro).
---

## getWeeklyEvents

Consultar eventos publicados de la semana actual.

Parámetros:

* categoria (opcional): asamblea | comunidad | voluntariado | campana | mitin
* dia_semana (opcional): lunes | martes | miercoles | jueves | viernes | sabado | domingo
* ubicacion (opcional): nombre del lugar o barrio/colonia
* requiere_registro (opcional): true = solo eventos con cupo
* limite (opcional): máximo de resultados (por defecto 5)

Úsala para consultas de eventos de la semana actual o con cupo; para otras consultas informativas usa getMunicipalInfo.

---

# Flujo de Registro

## Inicio

Si no existe citizenId:

* ejecutar createCitizen usando phone

Después:

* identificar campos faltantes
* continuar desde el último paso pendiente

---

# Orden de Captura

Solicitar solo un dato por mensaje.

Orden recomendado:

1. nombre
2. barrio
3. intereses
4. email (opcional)

Telefono proviene del contexto.

---

# Validaciones

## Nombre

* Debe parecer un nombre real.
* No aceptar vacío.
* No aceptar símbolos extraños.

---

## Barrio

Siempre ejecutar validateNeighborhood antes de guardar.

Si hay coincidencias:

* mostrar opciones breves

Si no existe:

* pedir nuevamente

---

## Email

* Opcional.
* Validar formato correo.
* Si no quiere compartirlo, continuar.

---

## Intereses

Ejemplos válidos:

* cultura
* deportes
* salud
* educación
* empleo
* seguridad
* eventos
* talleres

Aceptar múltiples intereses.

---

# Confirmación Final

Cuando el perfil esté completo:

1. mostrar resumen
2. solicitar confirmación
3. ejecutar confirmCitizenRegistration

Ejemplo:

Nombre: Juan Pérez
Barrio: Centro
Teléfono: 5551234567
Intereses: cultura y deportes

¿Confirmas que la información es correcta?

---

# Finalización del Registro

Cuando el ciudadano confirme y ejecutes confirmCitizenRegistration con éxito:

1. Confirma brevemente que el registro quedó completado.
2. Pasa conversationId={{conversationId}} a confirmCitizenRegistration para que el cierre del ticket quede trazado.
3. El sistema cierra el ticket y la conversación automáticamente al confirmar el registro; no debes llamar closeConversation en este caso.
4. Informa al ciudadano que puede escribirte de nuevo si necesita algo más; eso abrirá un nuevo caso.
5. No sigas atendiendo solicitudes nuevas en este mismo hilo.

Ejemplo:
"¡Listo! Tu registro quedó completo. Si necesitas algo más, escríbeme de nuevo y con gusto te atiendo en un nuevo caso."

---

# Nueva Solicitud Después del Registro

Si el ciudadano ya está registrado (citizenId presente y perfil completo) y pide otra cosa:

1. No reinicies el flujo de registro ni pidas datos ya capturados.
2. Identifica la nueva intención (información, solicitud ciudadana, departamento, humano).
3. Si es informativa (eventos, servicios, horarios, ubicaciones, requisitos, contacto), respóndela directamente.
4. Si pertenece a un área específica o requiere seguimiento institucional → assignDepartment.
5. Si requiere atención humana o el ciudadano lo pide → escalateToHuman.
6. El sistema abre un ticket nuevo para esta solicitud automáticamente; no reutilices el de registro.

---

# Consultas Generales

Puedes responder preguntas relacionadas con:

* eventos
* campañas
* talleres
* convocatorias
* programas municipales
* actividades comunitarias
* servicios ciudadanos

Si el ciudadano pregunta por eventos de la semana, un día específico o cupos → getWeeklyEvents.

Si no tienes información suficiente:

* indica la limitación con honestidad
* si aplica un área específica → assignDepartment
* si el ciudadano necesita atención humana → escalateToHuman

---

# Estilo Conversacional

* mensajes cortos
* lenguaje simple
* tono humano
* respuestas naturales
* fácil lectura en WhatsApp

Evita:

* textos largos
* lenguaje burocrático
* tecnicismos
* múltiples preguntas complejas

---

# Reglas Inteligentes

* No repetir preguntas ya respondidas.
* Mantener contexto de conversación.
* Retomar desde el último dato faltante.
* Confirmar antes de modificar información.
* Priorizar precisión y ahorro de tokens.
* Usar herramientas únicamente cuando corresponda.

---

# Manejo de Errores

Si una herramienta falla:

1. informar brevemente
2. intentar continuar
3. si persiste → escalateToHuman

Ejemplo:
“Estoy teniendo un problema para completar el proceso. Voy a canalizarte con un agente para ayudarte.”

---

# Comportamiento Esperado

El agente debe sentirse:

* cercano
* útil
* organizado
* moderno
* confiable

No debe sentirse:

* frío
* mecánico
* agresivo
* excesivamente formal

---

# Ejemplos Naturales

## Registro

“Perfecto, ahora compárteme tu barrio o colonia.”

---

## Eventos

“Sí, esta semana habrá actividades culturales en el parque central.”

---

## Ayuda

“Puedo ayudarte con información, registro ciudadano y eventos municipales.”

---

## Escalamiento

“Voy a canalizar tu solicitud con un agente para brindarte mejor atención.”

---

# Prioridades del Agente

1. Completar registro correctamente.
2. Validar información antes de guardar.
3. Mantener experiencia simple y humana.
4. Reducir fricción conversacional.
5. Escalar casos complejos cuando sea necesario.
`;

const AI_INFORMATION_TOPIC_PROMPT_CONTENT = `# Prompt — Información Ciudadana (Voz Ciudadana)

## Rol

Eres “Voz Ciudadana”, el asistente virtual del municipio de Cintalapa.
Este modo atiende CONSULTAS INFORMATIVAS: eventos, servicios, departamentos
(con su horario de atención), horarios, requisitos, canales de contacto y dudas frecuentes.

No estás en flujo de registro. No pidas datos de registro aquí.

Comunícate de forma amable, clara, cercana y breve (estilo WhatsApp).

---

# Contexto Operativo

Variables:

* citizenId={{citizenId}}
* conversationId={{conversationId}}
* phone={{phone}}
* flowState={{flowState}}

---

# Herramientas

## getWeeklyEvents

Consulta eventos publicados de la SEMANA ACTUAL (lunes a domingo).

Parámetros:

* categoria (opcional): asamblea | comunidad | voluntariado | campana | mitin
* dia_semana (opcional): lunes | martes | miercoles | jueves | viernes | sabado | domingo
* ubicacion (opcional): nombre del lugar o barrio/colonia
* requiere_registro (opcional): true = solo eventos con cupo
* limite (opcional): máximo de resultados (por defecto 5)

Reglas:

* Úsala cuando la consulta tiene horizonte temporal (esta semana, hoy, mañana,
  un día de la semana) o pide cupo/aforo/registro previo de un evento.
* Úsala SIEMPRE antes de afirmar fecha, horario, lugar o cupo de un evento de la semana.
* Si devuelve found=false, dilo con honestidad y ofrece transferir o escalar.
* No inventes datos que la tool no devolvió.

## getMunicipalInfo

Consulta información municipal GENERAL (sin horizonte temporal): servicios,
departamentos, horarios de oficina, requisitos de trámites, contacto y FAQ.
Usa category=eventos solo para "¿hay eventos próximos?" sin fecha específica.
Si la consulta es de eventos Y menciona un día o la semana → usa getWeeklyEvents.

## Decisión entre herramientas (orden de prioridad)

1. ¿Eventos de la semana / un día / con cupo o registro? → getWeeklyEvents.
2. ¿Evento sin fecha específica u otra categoría informativa? → getMunicipalInfo.
3. ¿Solicitud formal, queja o atención humana? → escalateToHuman.
4. ¿Despedida o confirmación de que ya no necesita nada? → closeConversation.

## Regla de cierre de conversación (obligatoria)

- closeConversation se llama EXACTAMENTE UNA VEZ por conversación: cuando el
  ciudadano se despide o confirma que ya no necesita nada más.
- Si ya llamaste closeConversation en esta conversación y recibiste
  {"closed": true}, la conversación está CERRADA. NO la llames de nuevo bajo
  ninguna circunstancia, ni siquiera con otros argumentos.
- Tras recibir {"closed": true} (o ver "flowState": "CLOSED" en el resultado
  de una tool), NO invoques ninguna otra herramienta. Escribe únicamente tu
  mensaje final de despedida al ciudadano y terminá tu turno.

## Formato de respuesta para eventos

Organiza la información, mensajes cortos estilo WhatsApp:

* 📅 Día y fecha · 🕐 horario de inicio–fin
* 📍 Lugar (nombre y dirección)
* 🎟️ Cupo: "entrada libre" o "X lugares disponibles de Y" o "cupo lleno"
* ℹ️ Solo si la tool lo devolvió: requisitos, costo o público objetivo

Si el ciudadano quiere apartar lugar en un evento con cupo:
1. Informa los lugares disponibles.
2. Pregunta si quiere que lo conecten con el área responsable.
3. Si acepta → escalateToHuman (motivo: registro al evento).
No confirmes registro por tu cuenta.

---

# Ejemplos

## Ejemplo 1 — Pregunta semanal general

Ciudadano: "Hola, ¿qué eventos hay esta semana?"

Llamada:
getWeeklyEvents({ limite: 5 })

Respuesta:
"¡Con gusto! Esta semana tenemos:
📅 Martes 15 · Feria de la Salud, 9:00 a 14:00 hrs · 📍 Parque Central · entrada libre
📅 Jueves 17 · Audiencia Pública Presupuesto 2027, 10:00 hrs · 📍 Palacio Municipal · cupo 12 de 80 (requiere registro)
¿Te doy más detalles de alguno?"

## Ejemplo 2 — Cupo y registro

Ciudadano: "¿Ya hay lugar para la audiencia del jueves?"

Llamada:
getWeeklyEvents({ dia_semana: "jueves", categoria: "asamblea", requiere_registro: true })

Respuesta:
"La audiencia del jueves aún tiene 12 lugares de 80. Para apartar tu lugar te conecto con el área responsable, ¿te parece?"

(Si el ciudadano acepta → escalateToHuman con motivo de registro.)

## Ejemplo 3 — Sin resultados

Ciudadano: "¿Hay algo el sábado?"

Llamada:
getWeeklyEvents({ dia_semana: "sabado" })

Respuesta:
"Esta semana no hay eventos programados para el sábado. ¿Quieres que te cuente los que hay entre semana, o te conecto con alguien del municipio para más opciones?"

## assignDepartment

Transferir a un departamento municipal.

Parámetros: conversationId (usar {{conversationId}}), departmentSlug exacto.

No inventes ni derives slugs desde el nombre. Atención General usa "general", no
"atencion-general".

Usar cuando la consulta requiere atención especializada o seguimiento institucional
(p. ej. un reporte de obras o de servicios públicos).

La tool valida el horario laboral del departamento:

* Si devuelve assigned=false con reason="OUTSIDE_SERVICE_HOURS", está cerrado: informa el horario (serviceHours) y ofrece registrar la solicitud o escalar si es urgente. No reintentes.
* Si devuelve reason="UNKNOWN_DEPARTMENT", elige el slug exacto de availableDepartments y reintenta una sola vez.
* Solo con assigned=true la transferencia se concretó.

---

## escalateToHuman

Escalar a un agente humano.

Parámetros: conversationId (usar {{conversationId}}), reason.

Usar cuando:

* el ciudadano lo pide explícitamente
* la información no está disponible y el caso lo requiere
* hay molestia, queja sensible o caso fuera de tu alcance

---

## closeConversation

Cerrar la conversación.

Parámetros: conversationId (usar {{conversationId}}), reason, summary.

Usar cuando el ciudadano se despida o confirme que ya no necesita nada más.
Al llamarla se cierran el ticket activo y la conversación; el ciudadano puede escribir de nuevo en un caso nuevo.
---

# Flujo de Atención Informativa

1. Identifica qué información pide el ciudadano.
2. Llama getMunicipalInfo con la category o query adecuada.
3. Responde de forma breve y clara con lo que devolvió la tool.
4. Si la consulta se convierte en una solicitud formal o requiere un área:
   * transfiere con assignDepartment, o
   * escala con escalateToHuman.
5. Si no hay información y no puedes resolver, ofrece escalar con un humano.

---

# Reglas

* No mezcles este flujo con el registro ciudadano.
* No pidas nombre, barrio ni intereses aquí.
* Usa herramientas solo cuando corresponda.
* Mensajes cortos, humanos y sin tecnicismos.
* Deja trazabilidad: motivo claro al transferir, escalar o cerrar.
`;

interface InternalToolSeed {
  name: string;
  description: string;
  internalKey: string;
  inputSchema: Prisma.InputJsonValue;
  outputSchema: Prisma.InputJsonValue;
}

/**
 * Construye los argumentos de `aiTool.upsert` para una tool interna FSM V2.
 * Estas tools ya existen y están registradas en InternalToolRunner; el seed
 * únicamente las expone al topic para que la IA pueda invocarlas.
 */
function buildInternalToolSeed(id: string, tool: InternalToolSeed) {
  const body = {
    name: tool.name,
    description: tool.description,
    type: 'internal' as const,
    kind: 'internal' as const,
    executionType: 'function' as const,
    internalKey: tool.internalKey,
    timeoutMs: 8000,
    allowlistDomains: [] as string[],
    inputSchema: tool.inputSchema,
    outputSchema: tool.outputSchema,
    config: { type: 'internal', internalKey: tool.internalKey },
    isActive: true,
  };

  return {
    where: { id },
    update: { ...body },
    create: { id, ...body },
  };
}

const ASSIGN_DEPARTMENT_TOOL: InternalToolSeed = {
  name: 'assignDepartment',
  description:
    'Transfiere la conversación a un departamento municipal usando su slug exacto (Atención General usa "general").',
  internalKey: 'assignDepartment',
  inputSchema: {
    type: 'object',
    properties: {
      conversationId: { type: 'string' },
      departmentSlug: {
        type: 'string',
        description:
          'Slug exacto almacenado en el catálogo; no derivarlo del nombre. Atención General usa "general".',
      },
    },
    required: ['conversationId', 'departmentSlug'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      assigned: { type: 'boolean' },
      departmentSlug: { type: 'string' },
      flowState: { type: 'string' },
      reason: {
        type: 'string',
        enum: ['OUTSIDE_SERVICE_HOURS', 'DEPARTMENT_INACTIVE', 'UNKNOWN_DEPARTMENT'],
      },
      availableDepartments: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            slug: { type: 'string' },
            name: { type: 'string' },
          },
          required: ['slug', 'name'],
        },
      },
    },
  },
};

const ESCALATE_TO_HUMAN_TOOL: InternalToolSeed = {
  name: 'escalateToHuman',
  description: 'Escala la conversación a un agente humano (ESCALATED).',
  internalKey: 'escalateToHuman',
  inputSchema: {
    type: 'object',
    properties: {
      conversationId: { type: 'string' },
      reason: { type: 'string' },
    },
    required: ['conversationId'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      escalated: { type: 'boolean' },
      flowState: { type: 'string' },
      reason: { type: 'string' },
    },
  },
};

const GET_MUNICIPAL_INFO_TOOL: InternalToolSeed = {
  name: 'getMunicipalInfo',
  description:
    'Consulta información municipal (eventos, servicios, departamentos, horarios, ubicaciones, requisitos, contacto, FAQ).',
  internalKey: 'getMunicipalInfo',
  inputSchema: {
    type: 'object',
    properties: {
      category: {
        type: 'string',
        enum: [
          'eventos',
          'servicios',
          'departamentos',
          'horarios',
          'requisitos',
          'contacto',
          'faq',
          'general',
        ],
      },
      query: { type: 'string' },
    },
  },
  outputSchema: {
    type: 'object',
    properties: {
      found: { type: 'boolean' },
      source: { type: 'string' },
      category: { type: 'string' },
      items: { type: 'array' },
      availableCategories: { type: 'array' },
      message: { type: 'string' },
    },
  },
};

const GET_WEEKLY_EVENTS_TOOL: InternalToolSeed = {
  name: 'getWeeklyEvents',
  description:
    'Consulta eventos publicados de la semana actual (filtros por categoría, día, ubicación y registro).',
  internalKey: 'getWeeklyEvents',
  inputSchema: {
    type: 'object',
    properties: {
      categoria: {
        type: 'string',
        enum: ['asamblea', 'comunidad', 'voluntariado', 'campana', 'mitin'],
      },
      dia_semana: {
        type: 'string',
        enum: ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'],
      },
      ubicacion: { type: 'string', maxLength: 120 },
      requiere_registro: { type: 'boolean' },
      limite: { type: 'integer', minimum: 1, maximum: 10 },
    },
  },
  outputSchema: {
    type: 'object',
    properties: {
      found: { type: 'boolean' },
      source: { type: 'string' },
      semana: { type: 'object' },
      items: { type: 'array' },
      message: { type: 'string' },
    },
  },
};

const CLOSE_CONVERSATION_TOOL: InternalToolSeed = {
  name: 'closeConversation',
  description: 'Cierra por completo la conversación y su ticket activo (CLOSED).',
  internalKey: 'closeConversation',
  inputSchema: {
    type: 'object',
    properties: {
      conversationId: { type: 'string' },
      reason: {
        type: 'string',
        enum: ['resolved', 'spam', 'duplicate', 'timeout', 'user_request', 'other'],
      },
      summary: { type: 'string' },
    },
    required: ['conversationId'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      closed: { type: 'boolean' },
      reason: { type: 'string' },
    },
  },
};

const CLOSE_TICKET_TOOL: InternalToolSeed = {
  name: 'closeTicket',
  description:
    'Cierra el ticket activo de la conversación (o un ticket por id) sin cerrar la conversación. Devuelve el folio.',
  internalKey: 'closeTicket',
  inputSchema: {
    type: 'object',
    properties: {
      ticketId: { type: 'string' },
      conversationId: { type: 'string' },
      reason: {
        type: 'string',
        enum: ['resolved', 'spam', 'duplicate', 'timeout', 'user_request', 'other'],
      },
      summary: { type: 'string' },
    },
  },
  outputSchema: {
    type: 'object',
    properties: {
      ticketId: { type: 'string' },
      conversationId: { type: 'string' },
      folio: { type: 'string' },
      closedAt: { type: 'string' },
      error: { type: 'string' },
      message: { type: 'string' },
    },
  },
};

async function runSeedStep<T>(label: string, action: () => Promise<T>): Promise<T> {
  const startedAt = Date.now();

  try {
    const result = await action();
    // eslint-disable-next-line no-console
    console.log(`✓ ${label} (${Date.now() - startedAt}ms)`);
    return result;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(`✗ ${label} failed after ${Date.now() - startedAt}ms`);
    throw error;
  }
}

export async function seedAiModule(prisma: PrismaClient): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to run seed in production environment.');
  }

  // Interactive transactions default to a five-second timeout in Prisma.  Keep
  // every idempotent phase independent so latency on a remote database cannot
  // invalidate a transaction used by a later phase.
  // eslint-disable-next-line no-console
  console.log('🌱 Seeding AI module...');

  await runSeedStep('AI agents: 1 synchronized', async () => {
    await prisma.aiAgent.upsert({
      where: { id: IDS.agent },
      update: {
        slug: 'ai-smoke-agent',
        name: 'AI Smoke Agent',
        description: 'Agente minimo para smoke test E2E del modulo AI.',
        provider: 'openai',
        model: 'nvidia/nemotron-3.5-lightning-30b-a3b',
        temperature: '1',
        maxTokens: 16384,
        isActive: true,
        metadata: {
          seededBy: 'ai-module.seed.ts',
          purpose: 'smoke-test',
        },
      },
      create: {
        id: IDS.agent,
        slug: 'ai-smoke-agent',
        name: 'AI Smoke Agent',
        description: 'Agente minimo para smoke test E2E del modulo AI.',
        provider: 'openai',
        model: 'nvidia/nemotron-3.5-lightning-30b-a3b',
        temperature: '1',
        maxTokens: 16384,
        isActive: true,
        metadata: {
          seededBy: 'ai-module.seed.ts',
          purpose: 'smoke-test',
        },
      },
    });
  });

  await runSeedStep('AI prompts and topics: primary synchronized', async () => {
    await prisma.aiPrompt.upsert({
      where: { id: IDS.prompt },
      update: {
        name: 'Atención y Registro WhatsApp v2',
        type: 'topic',
        version: 1,
        isActive: true,
        content: AI_SMOKE_TOPIC_PROMPT_CONTENT,
        metadata: {
          seededBy: 'ai-module.seed.ts',
          purpose: 'smoke-test',
        },
      },
      create: {
        id: IDS.prompt,
        name: 'Atención y Registro WhatsApp v2',
        type: 'topic',
        version: 1,
        isActive: true,
        content: AI_SMOKE_TOPIC_PROMPT_CONTENT,
        metadata: {
          seededBy: 'ai-module.seed.ts',
          purpose: 'smoke-test',
        },
      },
    });

    await prisma.aiTopic.upsert({
      where: { id: IDS.topic },
      update: {
        slug: 'atencion-ciudadana-whatsapp',
        name: 'Atención Ciudadana WhatsApp',
        description:
          'Topic operativo para atención general y registro ciudadano por IA en WhatsApp.',
        matcherKeywords: [
          'hola',
          'ayuda',
          'consulta',
          'registro',
          'registrar',
          'barrio',
          'intereses',
        ],
        systemPromptId: IDS.prompt,
        isActive: true,
      },
      create: {
        id: IDS.topic,
        slug: 'atencion-ciudadana-whatsapp',
        name: 'Atención Ciudadana WhatsApp',
        description:
          'Topic operativo para atención general y registro ciudadano por IA en WhatsApp.',
        matcherKeywords: [
          'hola',
          'ayuda',
          'consulta',
          'registro',
          'registrar',
          'barrio',
          'intereses',
        ],
        systemPromptId: IDS.prompt,
        isActive: true,
      },
    });

    await prisma.aiPrompt.update({
      where: { id: IDS.prompt },
      data: { topicId: IDS.topic },
    });
  });

  await runSeedStep('AI tools: 9 synchronized', async () => {
    await prisma.aiTool.upsert({
      where: { id: IDS.toolCreateCitizen },
      update: {
        name: 'createCitizen',
        description: 'Crea o recupera un ciudadano por telefono.',
        type: 'internal',
        kind: 'internal',
        executionType: 'function',
        internalKey: 'createCitizen',
        timeoutMs: 8000,
        allowlistDomains: [],
        inputSchema: {
          type: 'object',
          properties: {
            phone: { type: 'string' },
            profileName: { type: 'string' },
            consentGiven: { type: 'boolean' },
            openConversation: { type: 'boolean' },
          },
          required: ['phone'],
        },
        outputSchema: {
          type: 'object',
          properties: {
            citizenId: { type: 'string' },
            phone: { type: 'string' },
            name: { type: 'string' },
            lastName: { type: 'string' },
            created: { type: 'boolean' },
            alreadyExists: { type: 'boolean' },
            conversationId: { type: ['string', 'null'] },
            guidance: { type: 'string' },
          },
        },
        config: {
          type: 'internal',
          internalKey: 'createCitizen',
        },
        isActive: true,
      },
      create: {
        id: IDS.toolCreateCitizen,
        name: 'createCitizen',
        description: 'Crea o recupera un ciudadano por telefono.',
        type: 'internal',
        kind: 'internal',
        executionType: 'function',
        internalKey: 'createCitizen',
        timeoutMs: 8000,
        allowlistDomains: [],
        inputSchema: {
          type: 'object',
          properties: {
            phone: { type: 'string' },
            profileName: { type: 'string' },
            consentGiven: { type: 'boolean' },
            openConversation: { type: 'boolean' },
          },
          required: ['phone'],
        },
        outputSchema: {
          type: 'object',
          properties: {
            citizenId: { type: 'string' },
            phone: { type: 'string' },
            name: { type: 'string' },
            lastName: { type: 'string' },
            created: { type: 'boolean' },
            alreadyExists: { type: 'boolean' },
            conversationId: { type: ['string', 'null'] },
            guidance: { type: 'string' },
          },
        },
        config: {
          type: 'internal',
          internalKey: 'createCitizen',
        },
        isActive: true,
      },
    });

    await prisma.aiTool.upsert({
      where: { id: IDS.toolValidateNeighborhood },
      update: {
        name: 'validateNeighborhood',
        description: 'Valida barrio/colonia contra catalogo oficial.',
        type: 'internal',
        kind: 'internal',
        executionType: 'function',
        internalKey: 'validateNeighborhood',
        timeoutMs: 8000,
        allowlistDomains: [],
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string' },
          },
          required: ['query'],
        },
        outputSchema: {
          type: 'object',
          properties: {
            valid: { type: 'boolean' },
            neighborhoodId: { type: ['string', 'null'] },
            neighborhoodName: { type: ['string', 'null'] },
            suggestions: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                },
              },
            },
          },
        },
        config: {
          type: 'internal',
          internalKey: 'validateNeighborhood',
        },
        isActive: true,
      },
      create: {
        id: IDS.toolValidateNeighborhood,
        name: 'validateNeighborhood',
        description: 'Valida barrio/colonia contra catalogo oficial.',
        type: 'internal',
        kind: 'internal',
        executionType: 'function',
        internalKey: 'validateNeighborhood',
        timeoutMs: 8000,
        allowlistDomains: [],
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string' },
          },
          required: ['query'],
        },
        outputSchema: {
          type: 'object',
          properties: {
            valid: { type: 'boolean' },
            neighborhoodId: { type: ['string', 'null'] },
            neighborhoodName: { type: ['string', 'null'] },
            suggestions: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                },
              },
            },
          },
        },
        config: {
          type: 'internal',
          internalKey: 'validateNeighborhood',
        },
        isActive: true,
      },
    });

    await prisma.aiTool.upsert({
      where: { id: IDS.toolUpdateCitizenProfile },
      update: {
        name: 'updateCitizenProfile',
        description: 'Guarda datos parciales de registro ciudadano.',
        type: 'internal',
        kind: 'internal',
        executionType: 'function',
        internalKey: 'updateCitizenProfile',
        timeoutMs: 8000,
        allowlistDomains: [],
        inputSchema: {
          type: 'object',
          properties: {
            citizenId: { type: 'string', format: 'uuid' },
            phone: { type: 'string' },
            name: { type: 'string' },
            neighborhood: { type: 'string' },
            email: { type: 'string' },
            interests: {
              type: 'array',
              items: { type: 'string' },
            },
          },
        },
        outputSchema: {
          type: 'object',
          properties: {
            updated: { type: 'boolean' },
            citizen: { type: 'object' },
          },
        },
        config: {
          type: 'internal',
          internalKey: 'updateCitizenProfile',
        },
        isActive: true,
      },
      create: {
        id: IDS.toolUpdateCitizenProfile,
        name: 'updateCitizenProfile',
        description: 'Guarda datos parciales de registro ciudadano.',
        type: 'internal',
        kind: 'internal',
        executionType: 'function',
        internalKey: 'updateCitizenProfile',
        timeoutMs: 8000,
        allowlistDomains: [],
        inputSchema: {
          type: 'object',
          properties: {
            citizenId: { type: 'string', format: 'uuid' },
            phone: { type: 'string' },
            name: { type: 'string' },
            neighborhood: { type: 'string' },
            email: { type: 'string' },
            interests: {
              type: 'array',
              items: { type: 'string' },
            },
          },
        },
        outputSchema: {
          type: 'object',
          properties: {
            updated: { type: 'boolean' },
            citizen: { type: 'object' },
          },
        },
        config: {
          type: 'internal',
          internalKey: 'updateCitizenProfile',
        },
        isActive: true,
      },
    });

    await prisma.aiTool.upsert({
      where: { id: IDS.toolConfirmCitizenRegistration },
      update: {
        name: 'confirmCitizenRegistration',
        description: 'Confirma registro ciudadano cuando el perfil esta completo.',
        type: 'internal',
        kind: 'internal',
        executionType: 'function',
        internalKey: 'confirmCitizenRegistration',
        timeoutMs: 8000,
        allowlistDomains: [],
        inputSchema: {
          type: 'object',
          properties: {
            citizenId: { type: 'string', format: 'uuid' },
            phone: { type: 'string' },
            conversationId: { type: 'string' },
          },
        },
        outputSchema: {
          type: 'object',
          properties: {
            confirmed: { type: 'boolean' },
            ticketClosed: { type: 'boolean' },
            closeReason: { type: 'string' },
            citizen: { type: 'object' },
            error: { type: 'string' },
          },
        },
        config: {
          type: 'internal',
          internalKey: 'confirmCitizenRegistration',
        },
        isActive: true,
      },
      create: {
        id: IDS.toolConfirmCitizenRegistration,
        name: 'confirmCitizenRegistration',
        description: 'Confirma registro ciudadano cuando el perfil esta completo.',
        type: 'internal',
        kind: 'internal',
        executionType: 'function',
        internalKey: 'confirmCitizenRegistration',
        timeoutMs: 8000,
        allowlistDomains: [],
        inputSchema: {
          type: 'object',
          properties: {
            citizenId: { type: 'string', format: 'uuid' },
            phone: { type: 'string' },
            conversationId: { type: 'string' },
          },
        },
        outputSchema: {
          type: 'object',
          properties: {
            confirmed: { type: 'boolean' },
            ticketClosed: { type: 'boolean' },
            closeReason: { type: 'string' },
            citizen: { type: 'object' },
            error: { type: 'string' },
          },
        },
        config: {
          type: 'internal',
          internalKey: 'confirmCitizenRegistration',
        },
        isActive: true,
      },
    });

    await prisma.aiTool.upsert(
      buildInternalToolSeed(IDS.toolAssignDepartment, ASSIGN_DEPARTMENT_TOOL),
    );
    await prisma.aiTool.upsert(
      buildInternalToolSeed(IDS.toolEscalateToHuman, ESCALATE_TO_HUMAN_TOOL),
    );
    await prisma.aiTool.upsert(
      buildInternalToolSeed(IDS.toolCloseConversation, CLOSE_CONVERSATION_TOOL),
    );
    await prisma.aiTool.upsert(buildInternalToolSeed(IDS.toolCloseTicket, CLOSE_TICKET_TOOL));
    await prisma.aiTool.upsert(
      buildInternalToolSeed(IDS.toolGetMunicipalInfo, GET_MUNICIPAL_INFO_TOOL),
    );
    await prisma.aiTool.upsert(
      buildInternalToolSeed(IDS.toolGetWeeklyEvents, GET_WEEKLY_EVENTS_TOOL),
    );
  });

  await runSeedStep('AI agent-topic relationships: primary synchronized', async () => {
    await prisma.aiAgentTopic.upsert({
      where: { id: IDS.agentTopic },
      update: {
        agentId: IDS.agent,
        topicId: IDS.topic,
        promptId: IDS.prompt,
        priority: 10,
        isDefault: true,
        isActive: true,
      },
      create: {
        id: IDS.agentTopic,
        agentId: IDS.agent,
        topicId: IDS.topic,
        promptId: IDS.prompt,
        priority: 10,
        isDefault: true,
        isActive: true,
      },
    });
  });

  await runSeedStep('AI primary topic-tool relationships: 9 synchronized', async () => {
    await prisma.aiTopicTool.upsert({
      where: { id: IDS.topicToolCreateCitizen },
      update: {
        topicId: IDS.topic,
        toolId: IDS.toolCreateCitizen,
        sortOrder: 10,
        isRequired: false,
        isActive: true,
      },
      create: {
        id: IDS.topicToolCreateCitizen,
        topicId: IDS.topic,
        toolId: IDS.toolCreateCitizen,
        sortOrder: 10,
        isRequired: false,
        isActive: true,
      },
    });

    await prisma.aiTopicTool.upsert({
      where: { id: IDS.topicToolValidateNeighborhood },
      update: {
        topicId: IDS.topic,
        toolId: IDS.toolValidateNeighborhood,
        sortOrder: 20,
        isRequired: false,
        isActive: true,
      },
      create: {
        id: IDS.topicToolValidateNeighborhood,
        topicId: IDS.topic,
        toolId: IDS.toolValidateNeighborhood,
        sortOrder: 20,
        isRequired: false,
        isActive: true,
      },
    });

    await prisma.aiTopicTool.upsert({
      where: { id: IDS.topicToolUpdateCitizenProfile },
      update: {
        topicId: IDS.topic,
        toolId: IDS.toolUpdateCitizenProfile,
        sortOrder: 30,
        isRequired: false,
        isActive: true,
      },
      create: {
        id: IDS.topicToolUpdateCitizenProfile,
        topicId: IDS.topic,
        toolId: IDS.toolUpdateCitizenProfile,
        sortOrder: 30,
        isRequired: false,
        isActive: true,
      },
    });

    await prisma.aiTopicTool.upsert({
      where: { id: IDS.topicToolConfirmCitizenRegistration },
      update: {
        topicId: IDS.topic,
        toolId: IDS.toolConfirmCitizenRegistration,
        sortOrder: 40,
        isRequired: false,
        isActive: true,
      },
      create: {
        id: IDS.topicToolConfirmCitizenRegistration,
        topicId: IDS.topic,
        toolId: IDS.toolConfirmCitizenRegistration,
        sortOrder: 40,
        isRequired: false,
        isActive: true,
      },
    });

    const topicToolLinks: { id: string; toolId: string; sortOrder: number }[] = [
      { id: IDS.topicToolAssignDepartment, toolId: IDS.toolAssignDepartment, sortOrder: 50 },
      { id: IDS.topicToolEscalateToHuman, toolId: IDS.toolEscalateToHuman, sortOrder: 60 },
      { id: IDS.topicToolCloseConversation, toolId: IDS.toolCloseConversation, sortOrder: 70 },
      { id: IDS.topicToolCloseTicket, toolId: IDS.toolCloseTicket, sortOrder: 75 },
      {
        id: IDS.topicToolGetMunicipalInfoOnAttention,
        toolId: IDS.toolGetMunicipalInfo,
        sortOrder: 80,
      },
      {
        id: IDS.topicToolGetWeeklyEventsOnAttention,
        toolId: IDS.toolGetWeeklyEvents,
        sortOrder: 85,
      },
    ];

    for (const link of topicToolLinks) {
      await prisma.aiTopicTool.upsert({
        where: { id: link.id },
        update: {
          topicId: IDS.topic,
          toolId: link.toolId,
          sortOrder: link.sortOrder,
          isRequired: false,
          isActive: true,
        },
        create: {
          id: link.id,
          topicId: IDS.topic,
          toolId: link.toolId,
          sortOrder: link.sortOrder,
          isRequired: false,
          isActive: true,
        },
      });
    }
  });

  await runSeedStep('AI prompts and topics: information synchronized', async () => {
    await prisma.aiPrompt.upsert({
      where: { id: IDS.promptInfo },
      update: {
        name: 'Información Ciudadana WhatsApp',
        type: 'topic',
        version: 1,
        isActive: true,
        content: AI_INFORMATION_TOPIC_PROMPT_CONTENT,
        metadata: { seededBy: 'ai-module.seed.ts', purpose: 'information' },
      },
      create: {
        id: IDS.promptInfo,
        name: 'Información Ciudadana WhatsApp',
        type: 'topic',
        version: 1,
        isActive: true,
        content: AI_INFORMATION_TOPIC_PROMPT_CONTENT,
        metadata: { seededBy: 'ai-module.seed.ts', purpose: 'information' },
      },
    });

    await prisma.aiTopic.upsert({
      where: { id: IDS.topicInfo },
      update: {
        slug: 'informacion-ciudadana-whatsapp',
        name: 'Información Ciudadana WhatsApp',
        description: 'Topic para consultas informativas (eventos, servicios, horarios, etc.).',
        matcherKeywords: [
          'evento',
          'eventos',
          'horario',
          'horarios',
          'servicio',
          'servicios',
          'informacion',
          'información',
          'requisito',
          'requisitos',
          'contacto',
          'departamento',
        ],
        systemPromptId: IDS.promptInfo,
        isActive: true,
      },
      create: {
        id: IDS.topicInfo,
        slug: 'informacion-ciudadana-whatsapp',
        name: 'Información Ciudadana WhatsApp',
        description: 'Topic para consultas informativas (eventos, servicios, horarios, etc.).',
        matcherKeywords: [
          'evento',
          'eventos',
          'horario',
          'horarios',
          'servicio',
          'servicios',
          'informacion',
          'información',
          'requisito',
          'requisitos',
          'contacto',
          'departamento',
        ],
        systemPromptId: IDS.promptInfo,
        isActive: true,
      },
    });

    await prisma.aiPrompt.update({
      where: { id: IDS.promptInfo },
      data: { topicId: IDS.topicInfo },
    });
  });

  await runSeedStep('AI agent-topic relationships: information synchronized', async () => {
    await prisma.aiAgentTopic.upsert({
      where: { id: IDS.agentTopicInfo },
      update: {
        agentId: IDS.agent,
        topicId: IDS.topicInfo,
        promptId: IDS.promptInfo,
        priority: 20,
        isDefault: false,
        isActive: true,
      },
      create: {
        id: IDS.agentTopicInfo,
        agentId: IDS.agent,
        topicId: IDS.topicInfo,
        promptId: IDS.promptInfo,
        priority: 20,
        isDefault: false,
        isActive: true,
      },
    });
  });

  await runSeedStep('AI information topic-tool relationships: 6 synchronized', async () => {
    const infoTopicToolLinks: { id: string; toolId: string; sortOrder: number }[] = [
      { id: IDS.topicToolInfoGetMunicipalInfo, toolId: IDS.toolGetMunicipalInfo, sortOrder: 10 },
      { id: IDS.topicToolInfoGetWeeklyEvents, toolId: IDS.toolGetWeeklyEvents, sortOrder: 15 },
      { id: IDS.topicToolInfoAssignDepartment, toolId: IDS.toolAssignDepartment, sortOrder: 20 },
      { id: IDS.topicToolInfoEscalateToHuman, toolId: IDS.toolEscalateToHuman, sortOrder: 30 },
      { id: IDS.topicToolInfoCloseConversation, toolId: IDS.toolCloseConversation, sortOrder: 40 },
      { id: IDS.topicToolInfoCloseTicket, toolId: IDS.toolCloseTicket, sortOrder: 45 },
    ];

    for (const link of infoTopicToolLinks) {
      await prisma.aiTopicTool.upsert({
        where: { id: link.id },
        update: {
          topicId: IDS.topicInfo,
          toolId: link.toolId,
          sortOrder: link.sortOrder,
          isRequired: false,
          isActive: true,
        },
        create: {
          id: link.id,
          topicId: IDS.topicInfo,
          toolId: link.toolId,
          sortOrder: link.sortOrder,
          isRequired: false,
          isActive: true,
        },
      });
    }
  });

  await runSeedStep('AI communication line: 1 synchronized', async () => {
    const activeDepartments = await prisma.department.findMany({
      where: { isActive: true },
      select: { id: true },
    });
    const departmentIds = activeDepartments.map((department) => department.id);

    const channel = ConversationChannel.whatsapp;
    const externalIdentifier = process.env.WHATSAPP_PHONE_NUMBER_ID ?? '';

    const lineData = {
      channel,
      externalIdentifier,
      phoneNumber: '+1 555-193-9427',
      provider: 'meta-whatsapp',
      displayName: 'Linea AI Smoke',
      isActive: true,
      isDefault: true,
      aiEnabled: true,
      agentId: IDS.agent,
      aiAgentId: IDS.agent,
      whatsappAppSecret: process.env.WHATSAPP_APP_SECRET
        ? encrypt(process.env.WHATSAPP_APP_SECRET)
        : null,
      whatsappAccessToken: process.env.WHATSAPP_ACCESS_TOKEN
        ? encrypt(process.env.WHATSAPP_ACCESS_TOKEN)
        : null,
      whatsappBusinessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID ?? null,
      whatsappPhoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID ?? null,
      whatsappAppId: process.env.WHATSAPP_APP_ID ?? null,
      metadata: {
        seededBy: 'ai-module.seed.ts',
        purpose: 'smoke-test',
        departmentIds,
      },
    } satisfies Prisma.CommunicationLineUncheckedUpdateInput;

    // `communication_lines` enforces UNIQUE(channel, external_identifier)
    // independently of the fixed seed id. A line created from the admin UI (or
    // an older phone number id) may already own that pair, so resolve the
    // natural key first and never move an external identifier between rows.
    const lineByExternalIdentifier = externalIdentifier
      ? await prisma.communicationLine.findUnique({
          where: {
            channel_externalIdentifier: { channel, externalIdentifier },
          },
          select: { id: true },
        })
      : null;

    if (lineByExternalIdentifier) {
      await prisma.communicationLine.update({
        where: { id: lineByExternalIdentifier.id },
        data: lineData,
      });
      return;
    }

    await prisma.communicationLine.upsert({
      where: { id: IDS.communicationLine },
      update: lineData,
      create: { id: IDS.communicationLine, ...lineData },
    });
  });

  // eslint-disable-next-line no-console
  console.log('✅ AI module seed completed');
}
