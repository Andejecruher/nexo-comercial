import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  AIStreamPubSubPublisher,
  AI_STREAM_TOPIC,
} from '../../../services/realtime/ai-stream-pubsub.service';
import type { PubSubClientLike } from '../../../services/realtime/pubsub.util';

function createPubSubMock(): {
  client: PubSubClientLike;
  publishMessage: ReturnType<typeof jest.fn>;
  topic: jest.MockedFunction<PubSubClientLike['topic']>;
  topicCreate: ReturnType<typeof jest.fn>;
} {
  const publishMessage = jest.fn(async () => 'message-1');
  const topicCreate = jest.fn(async () => undefined);
  const topic = jest.fn(() => ({
    publishMessage,
    create: topicCreate,
  })) as unknown as jest.MockedFunction<PubSubClientLike['topic']>;
  const client = { topic } as PubSubClientLike;
  return { client, publishMessage, topic, topicCreate };
}

describe('AIStreamPubSubPublisher', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('publica eventos chunk y done en el topic esperado con ordering key', async () => {
    const { client, publishMessage, topic } = createPubSubMock();

    const publisher = new AIStreamPubSubPublisher(client);

    await publisher.publishChunk({
      conversationId: 'conv-1',
      citizenId: 'citizen-1',
      correlationId: 'corr-1',
      runId: 'run-1',
      provider: 'openai',
      model: 'gpt-4o-mini',
      iteration: 1,
      textDelta: 'Ho',
      accumulatedText: 'Ho',
    });

    await publisher.publishDone({
      conversationId: 'conv-1',
      citizenId: 'citizen-1',
      correlationId: 'corr-1',
      runId: 'run-1',
      handled: true,
    });

    expect(topic).toHaveBeenCalledWith(
      AI_STREAM_TOPIC,
      expect.objectContaining({ messageOrdering: true }),
    );
    expect(publishMessage).toHaveBeenCalledTimes(2);

    const first = publishMessage.mock.calls[0]?.[0] as {
      data: Buffer;
      orderingKey?: string;
    };
    const second = publishMessage.mock.calls[1]?.[0] as {
      data: Buffer;
      orderingKey?: string;
    };

    expect(first.orderingKey).toBe('conv-1');
    expect(second.orderingKey).toBe('conv-1');

    const firstPayload = JSON.parse(first.data.toString()) as Record<string, unknown>;
    const secondPayload = JSON.parse(second.data.toString()) as Record<string, unknown>;

    expect(firstPayload).toEqual(
      expect.objectContaining({
        kind: 'chunk',
        conversationId: 'conv-1',
        textDelta: 'Ho',
      }),
    );
    expect(typeof firstPayload.ts).toBe('string');

    expect(secondPayload).toEqual(
      expect.objectContaining({
        kind: 'done',
        conversationId: 'conv-1',
        handled: true,
      }),
    );
    expect(typeof secondPayload.ts).toBe('string');
  });

  it('usa el topic configurable y respeta ensureTopic=false', async () => {
    const { client, publishMessage, topic, topicCreate } = createPubSubMock();

    const publisher = new AIStreamPubSubPublisher(client, {
      topicName: 'custom-stream',
      ensureTopic: false,
    });

    await publisher.publishChunk({
      conversationId: 'conv-2',
      citizenId: 'citizen-2',
      correlationId: 'corr-2',
      runId: 'run-2',
      provider: 'anthropic',
      model: 'claude-3-5-sonnet',
      iteration: 1,
      textDelta: 'Hi',
      accumulatedText: 'Hi',
    });

    expect(topicCreate).not.toHaveBeenCalled();
    expect(client.topic).toHaveBeenCalledWith(
      'custom-stream',
      expect.objectContaining({ messageOrdering: true }),
    );
    expect(publishMessage).toHaveBeenCalledTimes(1);
  });

  it('publica al topic por defecto cuando no se provee topicName', async () => {
    const { client, publishMessage } = createPubSubMock();

    const publisher = new AIStreamPubSubPublisher(client);

    await publisher.publishDone({
      conversationId: 'conv-3',
      citizenId: 'citizen-3',
      correlationId: 'corr-3',
      handled: false,
    });

    expect(client.topic).toHaveBeenCalledWith(
      AI_STREAM_TOPIC,
      expect.objectContaining({ messageOrdering: true }),
    );
    expect(publishMessage).toHaveBeenCalledTimes(1);
  });

  it('no publica ni crea el topic cuando está deshabilitado', async () => {
    const { client, publishMessage, topic, topicCreate } = createPubSubMock();

    const publisher = new AIStreamPubSubPublisher(client, { enabled: false });

    expect(publisher.isEnabled()).toBe(false);

    await publisher.publishChunk({
      conversationId: 'conv-4',
      citizenId: 'citizen-4',
      correlationId: 'corr-4',
      runId: 'run-4',
      provider: 'openai',
      model: 'gpt-4o-mini',
      iteration: 1,
      textDelta: 'Ho',
      accumulatedText: 'Ho',
    });
    await publisher.publishDone({
      conversationId: 'conv-4',
      citizenId: 'citizen-4',
      correlationId: 'corr-4',
      handled: true,
    });

    expect(topicCreate).not.toHaveBeenCalled();
    expect(topic).not.toHaveBeenCalled();
    expect(publishMessage).not.toHaveBeenCalled();
  });

  it('está habilitado por defecto', () => {
    const { client } = createPubSubMock();
    expect(new AIStreamPubSubPublisher(client).isEnabled()).toBe(true);
  });
});
