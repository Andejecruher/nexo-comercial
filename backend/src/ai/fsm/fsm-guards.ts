/**
 * FSM Guards — reglas de qué puede hacer la IA según el estado de conversación.
 *
 * Principio: FSM es source of truth. La IA solo opera cuando el estado lo permite.
 * Ningún prompt ni agente puede alterar este contrato.
 *
 * Estados permitidos para IA:
 *   - BOT_FLOW           : IA generativa habilitada
 *   - REGISTERING        : IA gestiona registro ciudadano completo
 *   - DEPARTMENT_ROUTING : IA permanece activa post-routing
 *
 * Estados bloqueados para IA:
 *   - HUMAN_FLOW  : agente humano al mando → IA debe callar
 *   - ESCALATED   : escalado crítico → IA bloqueada
 *   - CLOSED      : conversación cerrada → IA bloqueada
 *
 * IMPORTANTE: con el registro unificado en IA, REGISTERING queda habilitado.
 */
import { ConversationFlowState } from '../../types/whatsapp.types';

function parsePositiveIntEnv(name: string, min = 1): number | undefined {
  const raw = process.env[name];
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return undefined;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < min) {
    return undefined;
  }

  return Math.floor(parsed);
}

/** Estados donde la IA está completamente bloqueada */
export const AI_BLOCKED_STATES: ReadonlySet<ConversationFlowState> = new Set([
  'HUMAN_FLOW',
  'ESCALATED',
  'CLOSED',
]);

/** Estados donde la IA puede operar (completo o parcial) */
export const AI_ALLOWED_STATES: ReadonlySet<ConversationFlowState> = new Set([
  'BOT_FLOW',
  'REGISTERING',
  'DEPARTMENT_ROUTING',
]);

/**
 * Verifica si la IA puede procesar el mensaje en el estado dado.
 *
 * NOTA: esta función sólo evalúa `flowState`. Para la decisión completa de
 * silenciar al bot hay que usar `isBotAllowed`, que además contempla la
 * atención humana y el kill-switch `botEnabled`.
 *
 * @param state - Estado actual de la conversación
 * @returns true si la IA puede operar
 */
export function canAiOperate(state: ConversationFlowState): boolean {
  return AI_ALLOWED_STATES.has(state);
}

/** Quién atiende la conversación, independiente del estado FSM. */
export type AttendanceMode = 'bot' | 'human';

/** Contexto para decidir si el bot puede responder. */
export interface BotAllowContext {
  flowState: ConversationFlowState;
  /** attendance_mode de la conversación. `'human'` silencia siempre la IA. */
  attendanceMode?: string | null;
  /** Kill-switch operativo. `false` silencia siempre la IA. */
  botEnabled?: boolean | null;
}

/**
 * Decisión centralizada de si el bot puede responder.
 *
 * Reglas (en orden):
 *  1. `botEnabled === false` → silenciado (kill-switch operativo).
 *  2. `attendanceMode === 'human'` → silenciado (agente/departamento al mando).
 *  3. En cualquier otro caso → depende del `flowState` (`canAiOperate`).
 *
 * Es la ÚNICA fuente de verdad para silenciar la IA. Tanto el orquestador como
 * el FsmRouter deben usarla; nunca decidir por `flowState` en solitario.
 */
export function isBotAllowed(ctx: BotAllowContext): boolean {
  if (ctx.botEnabled === false) return false;
  if (ctx.attendanceMode === 'human') return false;
  return canAiOperate(ctx.flowState);
}

/**
 * Verifica si el estado está bloqueado para la IA.
 *
 * @param state - Estado actual de la conversación
 * @returns true si la IA debe ser silenciada
 */
export function isAiBlocked(state: ConversationFlowState): boolean {
  return AI_BLOCKED_STATES.has(state);
}

/**
 * Motivo estructurado del bloqueo de IA para logging.
 */
export interface AiBlockReason {
  blocked: true;
  state: ConversationFlowState;
  reason: string;
}

/**
 * Construye el motivo del bloqueo para logging estructurado.
 */
export function buildAiBlockReason(state: ConversationFlowState): AiBlockReason {
  const reasons: Record<string, string> = {
    HUMAN_FLOW: 'Conversación en manos de agente humano',
    ESCALATED: 'Conversación escalada — IA no debe interferir',
    CLOSED: 'Conversación cerrada — no procesar mensajes',
  };
  return {
    blocked: true,
    state,
    reason: reasons[state] ?? `Estado ${state} no permite IA`,
  };
}

/**
 * Motivo de bloqueo considerando atención humana y kill-switch, no sólo el
 * estado FSM. Usar junto a `isBotAllowed` para logging consistente.
 */
export function buildBotBlockReason(ctx: BotAllowContext): AiBlockReason {
  if (ctx.botEnabled === false) {
    return {
      blocked: true,
      state: ctx.flowState,
      reason: 'Bot deshabilitado (botEnabled=false)',
    };
  }
  if (ctx.attendanceMode === 'human') {
    return {
      blocked: true,
      state: ctx.flowState,
      reason: 'Conversación en atención humana (attendanceMode=human)',
    };
  }
  return buildAiBlockReason(ctx.flowState);
}

/**
 * Guardrails cuantitativos para una interacción de IA.
 * Valores conservadores para producción.
 */
export interface FsmGuardrails {
  /** Máximo de tool calls por interacción */
  maxToolCalls: number;
  /** Máximo de iteraciones ReAct */
  maxIterations: number;
  /** Máximo de repeticiones consecutivas de la misma firma de tool antes de cortar loop */
  duplicateToolLoopThreshold: number;
  /** Timeout por tool call en ms */
  toolTimeoutMs: number;
  /** Timeout total de IA en ms */
  aiTimeoutMs: number;
}

export const DEFAULT_FSM_GUARDRAILS: FsmGuardrails = {
  maxToolCalls: 10,
  maxIterations: 20,
  duplicateToolLoopThreshold: parsePositiveIntEnv('AI_DUPLICATE_TOOL_LOOP_THRESHOLD', 2) ?? 3,
  toolTimeoutMs: 10_000,
  aiTimeoutMs: parsePositiveIntEnv('AI_TIMEOUT_MS') ?? 30_000,
};

export const REGISTERING_FLOW_PROMPT_INSTRUCTION =
  'El usuario está en proceso de registro crítico. Ignorá cualquier desvío de tema y volvé a solicitar amablemente el dato pendiente del registro.';

/**
 * Instrucción de enfoque temporal para el prompt según estado FSM.
 * Se inyecta como capa adicional al system prompt cuando aplica.
 */
export function buildFlowStatePromptInstruction(state: ConversationFlowState): string | undefined {
  if (state === 'REGISTERING') {
    return REGISTERING_FLOW_PROMPT_INSTRUCTION;
  }

  return undefined;
}
