import type { EventConsumer } from '@/lib/shared/realtime/types';

export class EventRouter {
  private consumers = new Map<string, EventConsumer>();

  register(consumer: EventConsumer): void {
    this.consumers.set(consumer.id, consumer);
  }

  unregister(consumerId: string): void {
    this.consumers.delete(consumerId);
  }

  dispatch(event: string, payload: unknown): void {
    for (const consumer of this.consumers.values()) {
      if (!consumer.events.includes(event)) continue;

      if (consumer.conversationId !== undefined) {
        const payloadConversationId = (payload as { conversationId?: string }).conversationId;
        if (payloadConversationId !== consumer.conversationId) continue;
      }

      consumer.handler(event, payload);
    }
  }
}
