import {
  AIStreamPubSubPublisher,
  AIStreamChunkPubSubEvent,
  AIStreamDonePubSubEvent,
} from './ai-stream-pubsub.service';

type Chunk = Omit<AIStreamChunkPubSubEvent, 'kind' | 'ts'>;
type BufferState = {
  chunk: Chunk;
  timer?: ReturnType<typeof setTimeout>;
  pending: Promise<void>;
  publishing: boolean;
};

/** One ordered publisher chain per run, bounded drafts; never waits for an RPC per token. */
export class AIStreamCoalescer {
  private readonly buffers = new Map<string, BufferState>();
  constructor(
    private readonly publisher: AIStreamPubSubPublisher,
    private readonly intervalMs = 40,
  ) {}

  push(chunk: Chunk): void {
    let state = this.buffers.get(chunk.runId);
    if (!state) {
      if (this.buffers.size >= 128) return; // Streaming is best effort; the final reply is durable.
      state = { chunk, pending: Promise.resolve(), publishing: false };
      this.buffers.set(chunk.runId, state);
    } else state.chunk = { ...chunk, textDelta: state.chunk.textDelta + chunk.textDelta };
    if (!state.timer) state.timer = setTimeout(() => this.flush(state!), this.intervalMs);
  }

  private flush(state: BufferState): void {
    if (state.timer) clearTimeout(state.timer);
    state.timer = undefined;
    if (state.publishing) return;
    const chunk = state.chunk;
    state.chunk = { ...chunk, textDelta: '' };
    if (!chunk.textDelta) return;
    state.publishing = true;
    state.pending = this.publisher
      .publishChunk(chunk)
      .catch((error: unknown) => {
        console.warn('[AIStreamCoalescer] chunk publish failed', {
          runId: chunk.runId,
          error: String(error),
        });
      })
      .finally(() => {
        state.publishing = false;
        if (state.chunk.textDelta) this.flush(state);
      });
  }

  async finish(done: Omit<AIStreamDonePubSubEvent, 'kind' | 'ts'>): Promise<void> {
    const state = done.runId ? this.buffers.get(done.runId) : undefined;
    if (state) {
      while (state.chunk.textDelta || state.publishing) {
        this.flush(state);
        await state.pending;
      }
      this.buffers.delete(done.runId!);
    }
    await this.publisher.publishDone(done);
  }
}
