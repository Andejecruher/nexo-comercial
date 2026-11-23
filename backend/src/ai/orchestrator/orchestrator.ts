import { STATE_LABELS } from '../../config/conversation-states';
import { ConversationFlowState } from '../../types/whatsapp.types';
import { renderPrompt } from '../core/agent';
import { AIExecutionContext, AIMessage, AIStreamChunk } from '../core/types';
import { buildFlowStatePromptInstruction, isAiBlocked } from '../fsm/fsm-guards';
import { TRANSITION_TOOL_KEYS } from '../fsm/fsm-transitions';
import { AILogger } from '../logging/ai.logger';
import { ProviderFactory } from '../providers/provider.factory';
import { ToolRegistry } from '../registry/tool.registry';
import { TopicRegistry } from '../registry/topic.registry';
import { ToolRunner, ToolRunnerContext } from '../runners/tool.runner';
import { evaluateOutputGuardrail } from '../security/output-guardrail';

interface OrchestratorInput {
  context: AIExecutionContext;
  lineId: string;
  /** Mensajes históricos de la conversación (en orden cronológico). Se inyectan entre el system prompt y el mensaje actual del usuario. */
  historyMessages?: AIMessage[];
  agent: {
    id: string;
    provider: 'openai' | 'anthropic';
    model: string;
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    topK?: number;
    frequencyPenalty?: number;
    presencePenalty?: number;
    stream?: boolean;
    chatTemplateKwargs?: Record<string, unknown>;
  };
  onChunk?: (payload: {
    runId: string;
    provider: 'openai' | 'anthropic';
    model: string;
    chunk: AIStreamChunk;
    iteration: number;
  }) => Promise<void> | void;
}

export interface OrchestratorResult {
  handled: boolean;
  responseText?: string;
  runId?: string;
  /** Razón por la que el guardrail cortó el loop, si aplica */
  guardReason?: 'max_iterations' | 'max_tool_calls';
}

export interface OrchestratorLimits {
  /** Máximo de iteraciones del loop ReAct (cada llamada al provider = 1 iteración) */
  maxIterations: number;
  /** Máximo de tool calls acumuladas en toda la interacción */
  maxToolCalls: number;
  /** Máximo de repeticiones de la misma firma de tool antes de cortar por loop */
  duplicateToolLoopThreshold: number;
}

const DEFAULT_LIMITS: OrchestratorLimits = {
  maxIterations: 20,
  maxToolCalls: 10,
  duplicateToolLoopThreshold: 3,
};

const GUARDED_FALLBACK_RESPONSE =
  'Estoy procesando tu solicitud, pero me quedé sin contexto para completarla. ¿Podés repetir tu último dato en un solo mensaje para continuar?';

const OUTPUT_BLOCKED_FALLBACK_RESPONSE =
  'Estoy teniendo un problema técnico para responder en este momento. Por favor, reformulá tu consulta municipal en un solo mensaje.';

/** Loop ReAct con límites de iteraciones y tool calls configurables. */
export class AIOrchestrator {
  private readonly limits: OrchestratorLimits;

  constructor(
    private readonly providerFactory: ProviderFactory,
    private readonly topicRegistry: TopicRegistry,
    private readonly toolRegistry: ToolRegistry,
    private readonly toolRunner: ToolRunner,
    private readonly logger: AILogger,
    limits?: Partial<OrchestratorLimits>,
  ) {
    this.limits = { ...DEFAULT_LIMITS, ...limits };
  }

  async run(input: OrchestratorInput): Promise<OrchestratorResult> {
    const topicPrompt = await this.topicRegistry.resolve({
      agentId: input.agent.id,
      messageText: input.context.messageText,
      flowState: input.context.flowState,
    });

    if (!topicPrompt) {
      return { handled: false };
    }

    const flowStatePromptInstruction = buildFlowStatePromptInstruction(
      input.context.flowState as ConversationFlowState,
    );

    const promptSnapshot = renderPrompt(
      topicPrompt.promptContent,
      {
        citizenId: input.context.citizenId,
        conversationId: input.context.conversationId,
        phone: input.context.phone,
        flowState: input.context.flowState,
      },
      {
        prependSections: flowStatePromptInstruction ? [flowStatePromptInstruction] : undefined,
      },
    );

    const runId = await this.logger.startRun({
      conversationId: input.context.conversationId,
      citizenId: input.context.citizenId,
      communicationLineId: input.lineId,
      agentId: input.agent.id,
      topicId: topicPrompt.topicId,
      promptId: topicPrompt.promptId,
      provider: input.agent.provider,
      model: input.agent.model,
      inputMessage: input.context.messageText,
      promptSnapshot,
      maxSteps: this.limits.maxIterations,
      correlationId: input.context.correlationId,
    });

    const allowedTools = await this.toolRegistry.getToolsForTopic(topicPrompt.topicId);
    const messages: AIMessage[] = [
      { role: 'system', content: promptSnapshot },
      ...(input.historyMessages ?? []),
      { role: 'user', content: input.context.messageText },
    ];

    const toolContext: ToolRunnerContext = {
      conversationId: input.context.conversationId,
      correlationId: input.context.correlationId,
    };

    let iterations = 0;
    let toolCalls = 0;
    let finalText = '';
    let guardReason: OrchestratorResult['guardReason'];
    const toolLoopCounter = new Map<string, number>();
    // Estado terminal AI-bloqueado observado en el resultado de una transition-tool.
    // Una vez seteado, el modelo no debe invocar más tools (incidente: closeConversation
    // re-invocada sobre CLOSED).
    let terminalFlowState: ConversationFlowState | undefined;

    try {
      while (iterations < this.limits.maxIterations) {
        iterations += 1;

        const provider = this.providerFactory.create(input.agent.provider);
        const response = await provider.generate({
          model: input.agent.model,
          temperature: input.agent.temperature,
          maxTokens: input.agent.maxTokens,
          topP: input.agent.topP,
          topK: input.agent.topK,
          frequencyPenalty: input.agent.frequencyPenalty,
          presencePenalty: input.agent.presencePenalty,
          chatTemplateKwargs: input.agent.chatTemplateKwargs,
          stream: input.agent.stream,
          abortSignal: input.context.abortSignal,
          onChunk: input.onChunk
            ? async (chunk) => {
                try {
                  await input.onChunk?.({
                    runId,
                    provider: input.agent.provider,
                    model: input.agent.model,
                    chunk,
                    iteration: iterations,
                  });
                } catch (err) {
                  console.warn(
                    JSON.stringify({
                      ts: new Date().toISOString(),
                      level: 'warn',
                      service: 'AIOrchestrator',
                      event: 'orchestrator.chunk_callback_failed',
                      runId,
                      correlationId: input.context.correlationId,
                      conversationId: input.context.conversationId,
                      error: err instanceof Error ? err.message : String(err),
                    }),
                  );
                }
              }
            : undefined,
          messages,
          // Post-transición a estado AI-bloqueado no se anuncian tools: el modelo
          // sólo debe redactar su mensaje final (ambos providers toleran []).
          tools: terminalFlowState ? [] : allowedTools,
        });

        if (response.providerUnavailable) {
          const reason = response.raw.reason;
          const reasonText = typeof reason === 'string' ? reason : 'provider unavailable';
          await this.logger.skipRun(runId, reasonText);
          return { handled: false, runId };
        }

        if (response.text) {
          finalText = response.text;
          messages.push({ role: 'assistant', content: response.text });
        }

        if (response.toolCalls.length === 0) {
          break;
        }

        for (const call of response.toolCalls) {
          // Skip gracioso post-transición terminal: si la conversación quedó en un
          // estado AI-bloqueado, cualquier tool adicional es inválida (incidente:
          // closeConversation re-invocada sobre CLOSED). No se ejecuta, no cuenta
          // como tool call ni como firma duplicada; se responde con un marcador
          // para que el modelo redacte su mensaje final.
          if (terminalFlowState !== undefined) {
            messages.push({
              role: 'tool',
              name: call.name,
              toolCallId: call.id,
              content: JSON.stringify({
                skipped: true,
                reason: 'AI_BLOCKED_STATE',
                flowState: terminalFlowState,
                note: 'La conversación está en un estado donde la IA ya no puede operar. No invoques más herramientas; redactá tu mensaje final.',
              }),
            });
            continue;
          }

          if (toolCalls >= this.limits.maxToolCalls) {
            guardReason = 'max_tool_calls';
            break;
          }

          const toolSignature = `${call.name}:${JSON.stringify(call.input ?? {})}`;
          const repeatedCount = (toolLoopCounter.get(toolSignature) ?? 0) + 1;
          toolLoopCounter.set(toolSignature, repeatedCount);

          // Threshold 2 para transition-tools: una repetición idéntica dentro del
          // mismo run siempre es un loop — closeConversation/escalateToHuman/
          // confirmCitizenRegistration son single-shot por contrato. Corta ANTES
          // de ejecutar la 2ª llamada idéntica.
          const duplicateThreshold = TRANSITION_TOOL_KEYS.has(call.name)
            ? 2
            : this.limits.duplicateToolLoopThreshold;

          if (repeatedCount >= duplicateThreshold) {
            guardReason = 'max_tool_calls';
            console.warn(
              JSON.stringify({
                ts: new Date().toISOString(),
                level: 'warn',
                service: 'AIOrchestrator',
                event: 'orchestrator.guard.duplicate_tool_loop',
                runId,
                correlationId: input.context.correlationId,
                conversationId: input.context.conversationId,
                toolName: call.name,
                repeatedCount,
                threshold: duplicateThreshold,
              }),
            );
            break;
          }

          toolCalls += 1;
          const result = await this.toolRunner.execute(runId, call, allowedTools, toolContext);
          messages.push({
            role: 'tool',
            name: call.name,
            toolCallId: call.id,
            content: JSON.stringify(result),
          });

          // Si la tool dejó la conversación en un estado AI-bloqueado, se notifica
          // al modelo UNA sola vez con un mensaje user prefijado [SISTEMA] (no se
          // usa role 'system': Anthropic descarta system messages intermedios).
          const resultFlowState =
            typeof result['flowState'] === 'string'
              ? (result['flowState'] as ConversationFlowState)
              : undefined;
          if (resultFlowState && isAiBlocked(resultFlowState) && terminalFlowState === undefined) {
            terminalFlowState = resultFlowState;
            messages.push({
              role: 'user',
              content: `[SISTEMA] La conversación pasó al estado "${STATE_LABELS[terminalFlowState]}" (${terminalFlowState}). Ya no podés invocar herramientas. Escribí únicamente tu mensaje final al ciudadano (breve y cordial) y terminá tu turno.`,
            });
          }
        }

        if (guardReason === 'max_tool_calls') {
          console.warn(
            JSON.stringify({
              ts: new Date().toISOString(),
              level: 'warn',
              service: 'AIOrchestrator',
              event: 'orchestrator.guard.max_tool_calls',
              runId,
              correlationId: input.context.correlationId,
              conversationId: input.context.conversationId,
              toolCalls,
              limit: this.limits.maxToolCalls,
            }),
          );
          break;
        }
      }

      // Verificar si se cortó por maxIterations (llegó al límite sin break por texto)
      if (!guardReason && iterations >= this.limits.maxIterations) {
        guardReason = 'max_iterations';
        console.warn(
          JSON.stringify({
            ts: new Date().toISOString(),
            level: 'warn',
            service: 'AIOrchestrator',
            event: 'orchestrator.guard.max_iterations',
            runId,
            correlationId: input.context.correlationId,
            conversationId: input.context.conversationId,
            iterations,
            limit: this.limits.maxIterations,
          }),
        );
      }

      if (guardReason && finalText.trim().length === 0) {
        finalText = GUARDED_FALLBACK_RESPONSE;
      }

      const outputGuardrail = evaluateOutputGuardrail(finalText);
      if (outputGuardrail.blocked) {
        const reason = outputGuardrail.reason ?? 'unknown_pattern';
        await this.logger.markOutputGuardrail(runId, reason);

        console.warn(
          JSON.stringify({
            ts: new Date().toISOString(),
            level: 'warn',
            service: 'AIOrchestrator',
            event: 'orchestrator.guard.output_blocked',
            runId,
            correlationId: input.context.correlationId,
            conversationId: input.context.conversationId,
            reason,
          }),
        );

        finalText = OUTPUT_BLOCKED_FALLBACK_RESPONSE;
      }

      const repeatedTools = [...toolLoopCounter.entries()]
        .filter(([, count]) => count > 1)
        .map(([signature, count]) => ({ signature, count }));
      if (repeatedTools.length > 0) {
        console.log(
          JSON.stringify({
            ts: new Date().toISOString(),
            level: 'info',
            service: 'AIOrchestrator',
            event: 'orchestrator.telemetry.repeated_tools',
            runId,
            correlationId: input.context.correlationId,
            conversationId: input.context.conversationId,
            repeatedTools,
          }),
        );
      }

      await this.logger.completeRun(runId, finalText, iterations, toolCalls);
      return {
        handled: finalText.trim().length > 0,
        responseText: finalText.trim() || undefined,
        runId,
        guardReason,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.logger.failRun(runId, message, iterations, toolCalls);
      return { handled: false, runId };
    }
  }
}
