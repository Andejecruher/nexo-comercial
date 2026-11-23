import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { AIStreamCoalescer } from '../../../services/realtime/ai-stream-coalescer';
import { AIStreamPubSubPublisher } from '../../../services/realtime/ai-stream-pubsub.service';

describe('AI streaming with a slow publisher', () => {
  afterEach(() => {
    jest.useRealTimers();
  });
  it('coalesces pending tokens while one publish is in flight, and flushes before done', async () => {
    jest.useFakeTimers();
    let release!: () => void;
    const publishChunk = jest
      .fn<AIStreamPubSubPublisher['publishChunk']>()
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            release = resolve;
          }),
      )
      .mockResolvedValue(undefined);
    const publishDone = jest
      .fn<AIStreamPubSubPublisher['publishDone']>()
      .mockResolvedValue(undefined);
    const coalescer = new AIStreamCoalescer({
      publishChunk,
      publishDone,
    } as unknown as AIStreamPubSubPublisher);
    const context = {
      conversationId: 'conversation',
      citizenId: 'citizen',
      correlationId: 'correlation',
      runId: 'run',
      provider: 'openai' as const,
      model: 'test',
      iteration: 1,
    };
    coalescer.push({ ...context, textDelta: 'a', accumulatedText: 'a' });
    await jest.advanceTimersByTimeAsync(40);
    coalescer.push({ ...context, textDelta: 'b', accumulatedText: 'ab' });
    coalescer.push({ ...context, textDelta: 'c', accumulatedText: 'abc' });
    await jest.advanceTimersByTimeAsync(40);
    expect(publishChunk).toHaveBeenCalledTimes(1);
    const finished = coalescer.finish({
      conversationId: 'conversation',
      citizenId: 'citizen',
      correlationId: 'correlation',
      runId: 'run',
      handled: true,
    });
    expect(publishDone).not.toHaveBeenCalled();
    release();
    await finished;
    expect(publishChunk).toHaveBeenCalledTimes(2);
    expect(publishChunk.mock.calls[1][0]).toMatchObject({
      textDelta: 'bc',
      accumulatedText: 'abc',
    });
    expect(publishDone).toHaveBeenCalledTimes(1);
  });
});
