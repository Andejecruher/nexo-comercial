import { env } from '../../config/env.config';
import {
  createPubSubClient,
  ensureTopicOnce,
  publishJsonMessage,
  PubSubClientLike,
} from './pubsub.util';

export const AI_STREAM_TOPIC = 'ai-stream';

export interface AIStreamChunkPubSubEvent {
  kind: 'chunk';
  conversationId: string;
  citizenId: string;
  correlationId: string;
  runId: string;
  provider: 'openai' | 'anthropic';
  model: string;
  iteration: number;
  textDelta: string;
  accumulatedText: string;
  ts: string;
}

export interface AIStreamDonePubSubEvent {
  kind: 'done';
  conversationId: string;
  citizenId: string;
  correlationId: string;
  runId?: string;
  handled: boolean;
  ts: string;
}

export type AIStreamPubSubEvent = AIStreamChunkPubSubEvent | AIStreamDonePubSubEvent;

/**
 * Publishes AI streaming chunks/done events to the `ai-stream` Pub/Sub topic,
 * ordered per conversation so chunk deltas reach the dashboard in order.
 * API instances receive them through a push subscription and forward them to the
 * WebSocket gateway.
 */
export class AIStreamPubSubPublisher {
  constructor(
    private readonly pubsub: PubSubClientLike = createPubSubClient(),
    private readonly options: { topicName?: string; ensureTopic?: boolean; enabled?: boolean } = {},
  ) {}

  isEnabled(): boolean {
    return this.options.enabled ?? true;
  }

  private get topicName(): string {
    return this.options.topicName ?? AI_STREAM_TOPIC;
  }

  async publishChunk(event: Omit<AIStreamChunkPubSubEvent, 'kind' | 'ts'>): Promise<void> {
    if (!this.isEnabled()) return;
    const payload: AIStreamChunkPubSubEvent = {
      kind: 'chunk',
      ts: new Date().toISOString(),
      ...event,
    };
    await this.ensureTopic();
    await publishJsonMessage(this.pubsub, {
      topicName: this.topicName,
      payload: payload as unknown as Record<string, unknown>,
      orderingKey: payload.conversationId,
    });
  }

  async publishDone(event: Omit<AIStreamDonePubSubEvent, 'kind' | 'ts'>): Promise<void> {
    if (!this.isEnabled()) return;
    const payload: AIStreamDonePubSubEvent = {
      kind: 'done',
      ts: new Date().toISOString(),
      ...event,
    };
    await this.ensureTopic();
    await publishJsonMessage(this.pubsub, {
      topicName: this.topicName,
      payload: payload as unknown as Record<string, unknown>,
      orderingKey: payload.conversationId,
    });
  }

  private ensureTopic(): Promise<void> {
    if (!(this.options.ensureTopic ?? env.NODE_ENV !== 'production')) return Promise.resolve();
    return ensureTopicOnce(this.pubsub, this.topicName);
  }
}
