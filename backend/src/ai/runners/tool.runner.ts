import { ConversationFlowState } from '../../types/whatsapp.types';
import { AIToolCall, AIToolDefinition } from '../core/types';
import type { FsmRouterV2 } from '../fsm/fsm-router-v2';
import { TRANSITION_TOOL_KEYS } from '../fsm/fsm-transitions';
import { AILogger } from '../logging/ai.logger';
import { ExternalToolRunner } from './external-tool.runner';
import { InternalToolRunner } from './internal-tool.runner';

export interface ToolRunnerContext {
  conversationId: string;
  correlationId: string;
}

export class ToolRunner {
  private fsmRouter?: FsmRouterV2;

  constructor(
    private readonly internalRunner: InternalToolRunner,
    private readonly externalRunner: ExternalToolRunner,
    private readonly logger: AILogger,
    fsmRouter?: FsmRouterV2,
  ) {
    this.fsmRouter = fsmRouter;
  }

  /**
   * Inyecta FsmRouterV2 después de la construcción para romper la dependencia circular.
   * FsmRouterV2 → AIService → ToolRunner → FsmRouterV2
   */
  setFsmRouter(router: FsmRouterV2): void {
    this.fsmRouter = router;
  }

  async execute(
    runId: string,
    call: AIToolCall,
    allowedTools: AIToolDefinition[],
    context?: ToolRunnerContext,
  ): Promise<Record<string, unknown>> {
    const tool = allowedTools.find((candidate) => candidate.name === call.name);
    if (!tool) {
      throw new Error(`Tool ${call.name} is not allowed for current topic`);
    }

    const startedAt = Date.now();
    const callId = await this.logger.startToolCall(runId, tool.id, tool.name, call.input);
    const timeoutMs = tool.timeoutMs > 0 ? tool.timeoutMs : 30_000;

    try {
      const result = await this.executeWithTimeout(tool, call, timeoutMs);

      await this.logger.completeToolCall(callId, result, Date.now() - startedAt);

      // Post-ejecución: si la tool dispara una transición FSM y el resultado lo habilita,
      // ejecutarla y fusionar el flowState efectivo al resultado. El modelo debe ver el
      // estado resultante en el mensaje role:'tool' para dejar de re-invocar
      // transition-tools (incidente: closeConversation re-invocada sobre CLOSED).
      if (
        this.fsmRouter &&
        context &&
        TRANSITION_TOOL_KEYS.has(call.name) &&
        this.shouldTriggerTransition(call.name, result)
      ) {
        const flowState = await this.triggerFsmTransition(
          call.name,
          context,
          result,
          Date.now() - startedAt,
        );
        if (flowState !== undefined) {
          return { ...result, flowState };
        }
      }

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.logger.failToolCall(callId, message, Date.now() - startedAt);
      throw error;
    }
  }

  // ─── Timeout por tool ────────────────────────────────────────────────────────

  private async executeWithTimeout(
    tool: AIToolDefinition,
    call: AIToolCall,
    timeoutMs: number,
  ): Promise<Record<string, unknown>> {
    const executionPromise =
      tool.kind === 'internal'
        ? this.internalRunner.execute(tool.internalKey ?? '', call.input)
        : this.externalRunner.execute(tool, call.input);

    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(
        () => reject(new Error(`Tool '${call.name}' timed out after ${timeoutMs}ms`)),
        timeoutMs,
      );
    });

    try {
      return await Promise.race([executionPromise, timeoutPromise]);
    } finally {
      if (timeoutHandle !== undefined) {
        clearTimeout(timeoutHandle);
      }
    }
  }

  // ─── FSM transition post-tool ─────────────────────────────────────────────

  private shouldTriggerTransition(toolKey: string, result: Record<string, unknown>): boolean {
    // Hardening: confirmCitizenRegistration sólo debe transicionar cuando la tool
    // confirma explícitamente el registro completo.
    if (toolKey === 'confirmCitizenRegistration') {
      return result['confirmed'] === true;
    }

    // Hardening: assignDepartment sólo transiciona si la transferencia se concretó
    // (p. ej. NO ocurre si el departamento está fuera de horario laboral).
    if (toolKey === 'assignDepartment') {
      return result['assigned'] === true;
    }

    return true;
  }

  private async triggerFsmTransition(
    toolKey: string,
    context: ToolRunnerContext,
    result: Record<string, unknown>,
    elapsedMs: number,
  ): Promise<ConversationFlowState | undefined> {
    try {
      const departmentSlug =
        toolKey === 'assignDepartment' && typeof result['departmentSlug'] === 'string'
          ? (result['departmentSlug'] as string)
          : undefined;

      if (departmentSlug !== undefined) {
        return await this.fsmRouter!.executeToolTransition(
          context.conversationId,
          toolKey,
          context.correlationId,
          { departmentSlug },
        );
      }
      return await this.fsmRouter!.executeToolTransition(
        context.conversationId,
        toolKey,
        context.correlationId,
      );
    } catch (err) {
      // La transición FSM falla non-fatalmente: loguear y continuar.
      // El resultado de la tool ya fue entregado al orchestrador.
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        JSON.stringify({
          ts: new Date().toISOString(),
          level: 'error',
          service: 'ToolRunner',
          event: 'tool_runner.fsm_transition.failed',
          correlationId: context.correlationId,
          conversationId: context.conversationId,
          toolKey,
          elapsedMs,
          error: message,
        }),
      );
      return undefined;
    }
  }
}
