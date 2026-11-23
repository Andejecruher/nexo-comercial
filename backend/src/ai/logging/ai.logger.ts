import { PrismaService } from '../../services/prisma.service';

export interface CreateRunInput {
  conversationId: string;
  citizenId: string;
  communicationLineId: string;
  agentId: string;
  topicId: string;
  promptId: string;
  provider: 'openai' | 'anthropic';
  model: string;
  inputMessage: string;
  promptSnapshot: string;
  maxSteps: number;
  correlationId: string;
}

export class AILogger {
  constructor(private readonly prisma: PrismaService) {}

  async startRun(input: CreateRunInput): Promise<string> {
    const run = await this.prisma.aiRun.create({
      data: {
        conversationId: input.conversationId,
        citizenId: input.citizenId,
        communicationLineId: input.communicationLineId,
        agentId: input.agentId,
        topicId: input.topicId,
        promptId: input.promptId,
        provider: input.provider,
        model: input.model,
        status: 'running',
        inputMessage: input.inputMessage,
        promptSnapshot: input.promptSnapshot,
        maxSteps: input.maxSteps,
        correlationId: input.correlationId,
      },
    });

    return run.id;
  }

  async completeRun(
    runId: string,
    outputText: string,
    steps: number,
    toolCalls: number,
  ): Promise<void> {
    await this.prisma.aiRun.update({
      where: { id: runId },
      data: {
        status: 'completed',
        modelResponse: outputText,
        steps,
        toolCallsCount: toolCalls,
        finishedAt: new Date(),
      },
    });
  }

  async failRun(
    runId: string,
    errorMessage: string,
    steps: number,
    toolCalls: number,
  ): Promise<void> {
    await this.prisma.aiRun.update({
      where: { id: runId },
      data: {
        status: 'failed',
        errorMessage,
        steps,
        toolCallsCount: toolCalls,
        finishedAt: new Date(),
      },
    });
  }

  async skipRun(runId: string, reason: string): Promise<void> {
    await this.prisma.aiRun.update({
      where: { id: runId },
      data: {
        status: 'skipped',
        errorMessage: reason,
        finishedAt: new Date(),
      },
    });
  }

  async markOutputGuardrail(runId: string, reason: string): Promise<void> {
    await this.prisma.aiRun.update({
      where: { id: runId },
      data: {
        errorMessage: `[output_guardrail_blocked] ${reason}`,
      },
    });
  }

  async startToolCall(
    runId: string,
    toolId: string,
    toolName: string,
    inputPayload: Record<string, unknown>,
  ): Promise<string> {
    const call = await this.prisma.aiToolCall.create({
      data: {
        runId,
        toolId,
        toolName,
        status: 'running',
        inputPayload: inputPayload as object,
      },
    });

    return call.id;
  }

  async completeToolCall(
    toolCallId: string,
    outputPayload: Record<string, unknown>,
    durationMs: number,
  ): Promise<void> {
    await this.prisma.aiToolCall.update({
      where: { id: toolCallId },
      data: {
        status: 'completed',
        outputPayload: outputPayload as object,
        durationMs,
        finishedAt: new Date(),
      },
    });
  }

  async failToolCall(toolCallId: string, errorMessage: string, durationMs: number): Promise<void> {
    await this.prisma.aiToolCall.update({
      where: { id: toolCallId },
      data: {
        status: 'failed',
        errorMessage,
        durationMs,
        finishedAt: new Date(),
      },
    });
  }

  async blockToolCall(toolCallId: string, errorMessage: string): Promise<void> {
    await this.prisma.aiToolCall.update({
      where: { id: toolCallId },
      data: {
        status: 'blocked',
        errorMessage,
        finishedAt: new Date(),
      },
    });
  }
}
