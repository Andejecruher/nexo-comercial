import { withRealtimeTransaction } from '../../services/realtime/realtime-transaction';
/**
 * FsmRouterV2 — orquesta la interacción FSM V2 + IA para cada mensaje inbound.
 *
 * FSM V2 (única versión activa):
 *  - assignDepartment → DEPARTMENT_ROUTING (IA permanece activa)
 *  - escalateToHuman es el ÚNICO setter de ESCALATED
 *  - Logging estructurado con evento fsm_v2.*
 *  - Métricas hooks: contadores de transiciones, bloqueos
 *
 * Sin Redis (serverless):
 *  - Lock de conversación → lease lock por columnas en `conversation_meta`
 *    (ConversationLeaseLock). El dedup por messageId es redundante con el claim
 *    del inbox event (wamid UNIQUE) y se eliminó.
 *  - Meta de conversación → lectura directa de PostgreSQL (una fila indexada).
 *  - Typing indicator → dedupe in-process con TTL (una instancia por API).
 */
import { randomUUID } from 'crypto';
import { PRISMA_INTERACTIVE_TRANSACTION_OPTIONS } from '../../database/transaction-options';
import { ConversationRepository } from '../../repositories/conversation.repository';
import { ConversationLeaseLock } from '../../services/fsm-lock.service';
import { ConversationStateMachine } from '../../services/orchestrator/conversation-state-machine';
import { PrismaService } from '../../services/prisma.service';
import {
  ConversationRealtimeAction,
  CriticalEventType,
  SocketEventName,
} from '../../services/realtime/realtime-event.contracts';
import { RealtimeNotifier } from '../../services/realtime/realtime-notifier.service';
import { WhatsAppProvider } from '../../services/whatsapp/whatsapp.provider';
import { ConversationFlowState } from '../../types/whatsapp.types';
import { createStructuredLogger } from '../../utils/structured-logger';
import { AIService } from '../services/ai.service';
import {
  buildBotBlockReason,
  DEFAULT_FSM_GUARDRAILS,
  FsmGuardrails,
  isBotAllowed,
} from './fsm-guards';
import type { FsmRouterInput, FsmRouterResult } from './fsm-router.types';
import {
  assertValidTransition,
  InvalidFsmTransitionError,
  resolveToolTransition,
} from './fsm-transitions';

// ─── Configuración ────────────────────────────────────────────────────────────

const MIN_LOCK_TTL_SECONDS = 30;
const LOCK_TIMEOUT_BUFFER_SECONDS = 30;
const TYPING_TTL_MS = 25_000;

// ─── Métricas hooks ───────────────────────────────────────────────────────────

interface FsmV2Metrics {
  transitionCount: number;
  invalidTransitionCount: number;
  blockedCount: number;
}

// In-process counters (replaceable by APM sink if needed)
const _metrics: FsmV2Metrics = {
  transitionCount: 0,
  invalidTransitionCount: 0,
  blockedCount: 0,
};

/** Expuesto para tests / monitoring hooks */
export function getFsmV2Metrics(): Readonly<FsmV2Metrics> {
  return { ..._metrics };
}

export function resetFsmV2Metrics(): void {
  _metrics.transitionCount = 0;
  _metrics.invalidTransitionCount = 0;
  _metrics.blockedCount = 0;
}

// ─── Logger estructurado ──────────────────────────────────────────────────────

const log = createStructuredLogger('FsmRouterV2', { fsmVersion: 'v2' });

// ─── Snapshot de meta de conversación ─────────────────────────────────────────

interface CachedConversationMeta {
  flowState: ConversationFlowState;
  version: number;
  attendanceMode?: string | null;
  botEnabled?: boolean | null;
}

// ─── FsmRouterV2 ──────────────────────────────────────────────────────────────

export class FsmRouterV2 {
  private readonly guardrails: FsmGuardrails;
  /** phone → expiración del typing indicator (dedupe in-process) */
  private readonly typingActive = new Map<string, number>();

  constructor(
    private readonly conversationRepo: ConversationRepository,
    private readonly stateMachine: ConversationStateMachine,
    private readonly fsmLock: ConversationLeaseLock,
    private readonly aiService: AIService,
    guardrails?: Partial<FsmGuardrails>,
    private readonly whatsappProvider?: WhatsAppProvider,
    private readonly realtimeNotifier?: RealtimeNotifier,
    private readonly prisma?: PrismaService,
  ) {
    this.guardrails = { ...DEFAULT_FSM_GUARDRAILS, ...guardrails };
  }

  /**
   * Punto de entrada: procesa un mensaje aplicando FSM V2 + IA.
   */
  async handle(input: FsmRouterInput): Promise<FsmRouterResult> {
    const start = Date.now();

    log('info', 'fsm_v2.handle.start', input.correlationId, {
      conversationId: input.conversationId,
      messageId: input.messageId,
    });

    // 1. Adquirir lock de conversación (lease lock en conversation_meta)
    const leaseSeconds = Math.max(
      MIN_LOCK_TTL_SECONDS,
      Math.ceil(this.guardrails.aiTimeoutMs / 1000) + LOCK_TIMEOUT_BUFFER_SECONDS,
    );
    const lockToken = await this.fsmLock.acquire(input.conversationId, leaseSeconds);
    if (!lockToken) {
      log('warn', 'fsm_v2.lock_conflict', input.correlationId, {
        conversationId: input.conversationId,
      });
      const meta = await this.readMeta(input.conversationId);
      return {
        decision: { kind: 'lock_conflict', conversationId: input.conversationId },
        flowState: meta?.flowState ?? 'BOT_FLOW',
        transitioned: false,
        durationMs: Date.now() - start,
      };
    }

    try {
      return await this.processWithLock(input, start);
    } finally {
      await this.fsmLock.release(input.conversationId, lockToken);
    }
  }

  private async processWithLock(input: FsmRouterInput, start: number): Promise<FsmRouterResult> {
    const meta = input.metaOverride
      ? {
          flowState: input.metaOverride.flowState,
          version: input.metaOverride.version,
          attendanceMode: input.metaOverride.attendanceMode,
          botEnabled: input.metaOverride.botEnabled,
        }
      : await this.readMeta(input.conversationId);

    if (!meta) {
      log('warn', 'fsm_v2.no_meta', input.correlationId, {
        conversationId: input.conversationId,
      });
      const defaultMeta = await this.ensureMetaExists(input.conversationId);
      return this.processWithMeta(input, defaultMeta, start);
    }

    return this.processWithMeta(input, meta, start);
  }

  private async processWithMeta(
    input: FsmRouterInput,
    meta: CachedConversationMeta,
    start: number,
  ): Promise<FsmRouterResult> {
    const { flowState, version } = meta;

    log('info', 'fsm_v2.state_read', input.correlationId, {
      conversationId: input.conversationId,
      flowState,
      version,
    });

    // ── Guard: ¿puede el bot operar en V2? ────────────────────────────────────
    // Evalúa flowState + attendanceMode + botEnabled (isBotAllowed). El
    // DEPARTMENT_ROUTING de un transfer de plataforma (attendanceMode=human)
    // silencia a la IA aunque flowState sea AI-active.
    if (
      !isBotAllowed({ flowState, attendanceMode: meta.attendanceMode, botEnabled: meta.botEnabled })
    ) {
      const blockReason = buildBotBlockReason({
        flowState,
        attendanceMode: meta.attendanceMode,
        botEnabled: meta.botEnabled,
      });
      _metrics.blockedCount++;
      log('info', 'fsm_v2.ai_blocked', input.correlationId, {
        conversationId: input.conversationId,
        flowState,
        attendanceMode: meta.attendanceMode ?? undefined,
        botEnabled: meta.botEnabled ?? undefined,
        reason: blockReason.reason,
        fsmVersion: 'v2',
      });
      return {
        decision: { kind: 'ai_blocked', reason: blockReason },
        flowState,
        transitioned: false,
        durationMs: Date.now() - start,
      };
    }

    // ── Invocar IA con guardrails ─────────────────────────────────────────────
    log('info', 'fsm_v2.ai_invoke', input.correlationId, {
      conversationId: input.conversationId,
      flowState,
      guardrails: this.guardrails,
    });

    await this.activateTypingIndicator(
      input.phone,
      input.conversationId,
      input.correlationId,
      input.waMessageId,
      input.lineExternalIdentifier,
    );

    let aiResult: { handled: boolean; runId?: string };

    try {
      aiResult = await this.invokeAiWithTimeout(input, flowState);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      log('error', 'fsm_v2.ai_error', input.correlationId, {
        conversationId: input.conversationId,
        flowState,
        error,
      });
      return {
        decision: { kind: 'error', error },
        flowState,
        transitioned: false,
        durationMs: Date.now() - start,
      };
    } finally {
      this.deactivateTypingIndicator(input.phone, input.conversationId, input.correlationId);
    }

    if (!aiResult.handled) {
      log('info', 'fsm_v2.ai_no_agent', input.correlationId, {
        conversationId: input.conversationId,
        flowState,
      });
      return {
        decision: { kind: 'no_agent' },
        flowState,
        transitioned: false,
        durationMs: Date.now() - start,
      };
    }

    log('info', 'fsm_v2.ai_handled', input.correlationId, {
      conversationId: input.conversationId,
      flowState,
      runId: aiResult.runId,
    });

    return {
      decision: { kind: 'ai_handled', runId: aiResult.runId },
      flowState,
      transitioned: false,
      durationMs: Date.now() - start,
    };
  }

  // ─── Tool transition (V2 semantics) ──────────────────────────────────────

  /**
   * Ejecuta una transición de estado originada por una tool (V2 semantics).
   * assignDepartment → DEPARTMENT_ROUTING (no HUMAN_FLOW).
   * escalateToHuman → ESCALATED (único setter).
   *
   * @returns El estado de flujo efectivo tras la ejecución de la tool:
   *          `toState` en una transición aplicada, `currentState` cuando la
   *          re-invocación es un no-op idempotente, o `undefined` cuando la
   *          tool no produce transición desde el estado actual.
   */
  async executeToolTransition(
    conversationId: string,
    toolKey: string,
    correlationId: string,
    opts?: { departmentSlug?: string },
  ): Promise<ConversationFlowState | undefined> {
    const meta = await this.readMeta(conversationId);
    if (!meta) {
      log('error', 'fsm_v2.tool_transition.no_meta', correlationId, {
        conversationId,
        toolKey,
      });
      throw new Error(`No se encontró meta para conversación ${conversationId}`);
    }

    const { flowState: currentState, version } = meta;

    // assignDepartment conserva semántica re-asignable (sin validación estricta de grafo):
    // puede fijar DEPARTMENT_ROUTING y actualizar departmentSlug incluso si ya está en ese estado.
    if (toolKey === 'assignDepartment') {
      return this.applyAssignDepartmentTransition(
        conversationId,
        currentState,
        version,
        correlationId,
        opts?.departmentSlug,
      );
    }

    const transitionResult = resolveToolTransition(toolKey, currentState);

    if (!transitionResult.shouldTransition) {
      log('debug', 'fsm_v2.tool_transition.no_op', correlationId, {
        conversationId,
        toolKey,
        currentState,
      });
      return undefined;
    }

    const { toState } = transitionResult;

    // Idempotencia: si la tool ya produjo el estado actual, la re-invocación
    // es un no-op exitoso — no es una transición inválida ni un error operacional.
    if (toState === currentState) {
      log('info', 'fsm_v2.tool_transition.idempotent', correlationId, {
        conversationId,
        toolKey,
        currentState,
      });
      return currentState;
    }

    try {
      assertValidTransition(currentState, toState, toolKey);
    } catch (err) {
      if (err instanceof InvalidFsmTransitionError) {
        _metrics.invalidTransitionCount++;
        log('error', 'fsm_v2.tool_transition.invalid', correlationId, {
          conversationId,
          toolKey,
          fromState: currentState,
          toState,
          error: err.message,
        });
        throw err;
      }
      throw err;
    }

    log('info', 'fsm_v2.tool_transition.execute', correlationId, {
      conversationId,
      toolKey,
      fromState: currentState,
      toState,
      version,
    });

    await this.stateMachine.transition(conversationId, toState, version, {
      triggeredBy: 'system',
    });

    // NOTA: al alcanzar CLOSED, ConversationStateMachine cierra también el
    // status de la entidad y los tickets activos (punto único de cierre). El
    // recontacto posterior reactiva la MISMA fila: findOrCreateCanonical la
    // pasa de CLOSED a BOT_FLOW y crea el ticket nuevo.

    _metrics.transitionCount++;

    log('info', 'fsm_v2.tool_transition.complete', correlationId, {
      conversationId,
      toolKey,
      fromState: currentState,
      toState,
    });

    return toState;
  }

  /**
   * Aplica la asignación de departamento como única autoridad de estado.
   * - Desde un estado distinto a DEPARTMENT_ROUTING: transición validada vía state machine.
   * - Desde DEPARTMENT_ROUTING (re-asignación): actualiza departmentSlug con optimistic
   *   locking sin volver a validar el grafo, preservando la semántica previa re-asignable.
   *
   * Además, y por opción A, el handoff de la IA deja la conversación en atención
   * HUMANA: `transferToDepartment` fija `attendanceMode=human` + `botEnabled=false`
   * (con bloqueo por fila y evento de auditoría). El estado sigue siendo
   * DEPARTMENT_ROUTING para conservar el contexto de routing.
   *
   * @returns 'DEPARTMENT_ROUTING' — el estado efectivo que fija la asignación.
   */
  private async applyAssignDepartmentTransition(
    conversationId: string,
    currentState: ConversationFlowState,
    version: number,
    correlationId: string,
    departmentSlug?: string,
  ): Promise<ConversationFlowState> {
    const toState: ConversationFlowState = 'DEPARTMENT_ROUTING';

    if (currentState === toState) {
      await this.conversationRepo.updateFlowState(conversationId, toState, version, {
        ...(departmentSlug !== undefined ? { departmentSlug } : {}),
      });
    } else {
      await this.stateMachine.transition(conversationId, toState, version, {
        triggeredBy: 'system',
        ...(departmentSlug !== undefined ? { departmentSlug } : {}),
      });
    }

    // Opción A: el handoff a departamento silencia al bot (atención humana).
    await this.conversationRepo.transferToDepartment({
      conversationId,
      ...(departmentSlug !== undefined ? { departmentSlug } : {}),
      transferredBy: 'bot',
      reason: 'assignDepartment',
    });

    // Gap histórico: el path bot NO emitía eventos realtime. Emitir handover
    // durable para que la UI (inbox/ticket) refleje la asignación a departamento.
    await this.emitDepartmentHandover(conversationId, toState, correlationId, departmentSlug);

    _metrics.transitionCount++;

    log('info', 'fsm_v2.tool_transition.complete', correlationId, {
      conversationId,
      toolKey: 'assignDepartment',
      fromState: currentState,
      toState,
      departmentSlug,
    });

    return toState;
  }

  /**
   * Emite `conversation.handover` durable cuando el bot asigna a un departamento.
   * At-least-once vía outbox (mismo patrón que message-orchestrator con ticket.created):
   * el cambio de estado ya persistió; el outbox se escribe en transacción propia.
   */
  private async emitDepartmentHandover(
    conversationId: string,
    toState: ConversationFlowState,
    correlationId: string,
    departmentSlug?: string,
  ): Promise<void> {
    if (!this.realtimeNotifier?.isEnabled() || !this.prisma) {
      return;
    }

    const occurredAt = new Date().toISOString();
    await withRealtimeTransaction(
      this.prisma,
      this.realtimeNotifier,
      async (tx) => {
        await this.realtimeNotifier!.notifyCritical(
          tx as unknown as Parameters<RealtimeNotifier['notifyCritical']>[0],
          {
            eventId: randomUUID(),
            correlationId,
            schemaVersion: 1,
            eventType: CriticalEventType.ConversationHandover,
            socketEventName: SocketEventName.ConversationHandover,
            occurredAt,
            source: 'fsm-router-v2.assignDepartment',
            conversationId,
            action: ConversationRealtimeAction.Handover,
            conversationPatch: {
              id: conversationId,
              flowState: toState,
              assignedUserId: null,
              ...(departmentSlug ? { assignedDept: departmentSlug } : {}),
              updatedAt: occurredAt,
            },
            inboxPatch: {
              flowState: toState,
              assignedUserId: null,
              ...(departmentSlug ? { assignedDept: departmentSlug } : {}),
            },
            notificationPatch: {
              type: 'conversation.handover',
              conversationId,
              ...(departmentSlug ? { departmentSlug } : {}),
            },
          },
        );
      },
      PRISMA_INTERACTIVE_TRANSACTION_OPTIONS,
    );
  }

  // ─── Meta de conversación (lectura directa de PostgreSQL) ─────────────────

  private async readMeta(conversationId: string): Promise<CachedConversationMeta | undefined> {
    const ctx = await this.conversationRepo.getConversationContext(conversationId);
    if (!ctx?.meta) {
      return undefined;
    }

    return {
      flowState: ctx.meta.flowState as ConversationFlowState,
      version: ctx.meta.version,
      attendanceMode: ctx.attendanceMode,
      botEnabled: ctx.botEnabled,
    };
  }

  private async ensureMetaExists(conversationId: string): Promise<CachedConversationMeta> {
    const meta = await this.readMeta(conversationId);
    return meta ?? { flowState: 'BOT_FLOW', version: 0, attendanceMode: 'bot', botEnabled: true };
  }

  // ─── Invocación IA con timeout ────────────────────────────────────────────

  private async invokeAiWithTimeout(
    input: FsmRouterInput,
    flowState: ConversationFlowState,
  ): Promise<{ handled: boolean; runId?: string }> {
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const abortController = new AbortController();

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        abortController.abort();
        reject(new Error(`AI timeout after ${this.guardrails.aiTimeoutMs}ms`));
      }, this.guardrails.aiTimeoutMs);
    });

    try {
      const result = await Promise.race([
        this.aiService.handleMessage({
          conversationId: input.conversationId,
          citizenId: input.citizenId,
          phone: input.phone,
          lineExternalIdentifier: input.lineExternalIdentifier,
          messageId: input.messageId,
          messageText: input.messageText,
          inboundMessages: input.inboundMessages,
          flowState,
          correlationId: input.correlationId,
          excludeMessageIds: input.excludeMessageIds,
          batchGeneration: input.batchGeneration,
          abortSignal: abortController.signal,
        }),
        timeoutPromise,
      ]);
      return result;
    } finally {
      if (timeoutHandle !== undefined) {
        clearTimeout(timeoutHandle);
      }
    }
  }

  // ─── Typing indicator (dedupe in-process) ─────────────────────────────────

  private async activateTypingIndicator(
    phone: string,
    conversationId: string,
    correlationId: string,
    waMessageId: string,
    lineExternalIdentifier?: string,
  ): Promise<void> {
    if (!this.whatsappProvider) return;

    if (!waMessageId) {
      log('warn', 'fsm_v2.typing.skipped_missing_wamid', correlationId, { conversationId, phone });
      return;
    }

    const now = Date.now();
    const activeUntil = this.typingActive.get(phone);
    if (activeUntil !== undefined && activeUntil > now) {
      log('debug', 'fsm_v2.typing.already_active', correlationId, { conversationId, phone });
      return;
    }

    this.typingActive.set(phone, now + TYPING_TTL_MS);
    await this.whatsappProvider.sendTypingIndicator(phone, waMessageId, {
      ...(lineExternalIdentifier ? { lineExternalIdentifier } : {}),
      allowDefault: true,
    });
    log('debug', 'fsm_v2.typing.activated', correlationId, { conversationId, phone, waMessageId });
  }

  private deactivateTypingIndicator(
    phone: string,
    conversationId: string,
    correlationId: string,
  ): void {
    if (!this.whatsappProvider) return;

    this.typingActive.delete(phone);
    log('debug', 'fsm_v2.typing.deactivated', correlationId, { conversationId, phone });
  }
}
