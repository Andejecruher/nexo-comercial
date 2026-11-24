import { describe, expect, it, vi } from 'vitest';
import { EventRouter } from '@/lib/shared/realtime/event-router';

describe('EventRouter', () => {
  it('delivers a matching event to a registered consumer', () => {
    const router = new EventRouter();
    const handler = vi.fn();

    router.register({
      id: 'c1',
      conversationId: 'conv-1',
      events: ['conversation.message.new'],
      handler,
    });

    router.dispatch('conversation.message.new', { conversationId: 'conv-1', text: 'hello' });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith('conversation.message.new', {
      conversationId: 'conv-1',
      text: 'hello',
    });
  });

  it('ignores events for a different conversationId', () => {
    const router = new EventRouter();
    const handler = vi.fn();

    router.register({
      id: 'c1',
      conversationId: 'conv-1',
      events: ['conversation.message.new'],
      handler,
    });

    router.dispatch('conversation.message.new', { conversationId: 'conv-2', text: 'hello' });

    expect(handler).not.toHaveBeenCalled();
  });

  it('ignores events the consumer did not subscribe to', () => {
    const router = new EventRouter();
    const handler = vi.fn();

    router.register({
      id: 'c1',
      conversationId: 'conv-1',
      events: ['conversation.message.new'],
      handler,
    });

    router.dispatch('conversation.updated', { conversationId: 'conv-1' });

    expect(handler).not.toHaveBeenCalled();
  });

  it('unregister removes the consumer so later events are not delivered', () => {
    const router = new EventRouter();
    const handler = vi.fn();

    router.register({
      id: 'c1',
      conversationId: 'conv-1',
      events: ['conversation.message.new'],
      handler,
    });
    router.unregister('c1');

    router.dispatch('conversation.message.new', { conversationId: 'conv-1' });

    expect(handler).not.toHaveBeenCalled();
  });

  it('global consumers receive events for any conversationId', () => {
    const router = new EventRouter();
    const handler = vi.fn();

    router.register({
      id: 'global',
      events: ['conversation.message.new'],
      handler,
    });

    router.dispatch('conversation.message.new', { conversationId: 'conv-99' });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('supports multiple consumers for the same event', () => {
    const router = new EventRouter();
    const handlerA = vi.fn();
    const handlerB = vi.fn();

    router.register({
      id: 'a',
      conversationId: 'conv-1',
      events: ['conversation.message.new'],
      handler: handlerA,
    });
    router.register({
      id: 'b',
      conversationId: 'conv-1',
      events: ['conversation.message.new'],
      handler: handlerB,
    });

    router.dispatch('conversation.message.new', { conversationId: 'conv-1' });

    expect(handlerA).toHaveBeenCalledTimes(1);
    expect(handlerB).toHaveBeenCalledTimes(1);
  });
});
