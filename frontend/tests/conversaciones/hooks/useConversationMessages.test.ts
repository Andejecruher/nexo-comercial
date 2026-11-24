import type { RealtimeManager } from '@/lib/shared/realtime/realtime-manager';
import { apiClient } from '@/lib/shared/api-client';
import { useConnectionStore } from '@/store/shared/use-connection-store';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useConversationMessages } from '@/hooks/conversaciones/useConversationMessages';

const mocks = vi.hoisted(() => {
  const callbacks = {
    listMessages: vi.fn(),
    sendMessage: vi.fn(),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    register: vi.fn(),
    unregister: vi.fn(),
  };
  return {
    ...callbacks,
    manager: {
      subscribe: callbacks.subscribe,
      unsubscribe: callbacks.unsubscribe,
      router: { register: callbacks.register, unregister: callbacks.unregister },
    },
  };
});

vi.mock('@/components/shared/providers/realtime-provider', () => ({
  useRealtimeManager: () => mocks.manager as unknown as RealtimeManager,
}));

vi.mock('@/lib/shared/api-client', () => ({
  apiClient: { get: vi.fn(), post: vi.fn() },
}));

vi.mock('@/lib/shared/messaging-api', async () => {
  const actual = (await vi.importActual('@/lib/shared/messaging-api')) as {
    messagingApi: Record<string, unknown>;
  };

  return {
    ...actual,
    messagingApi: {
      ...actual.messagingApi,
      listMessages: (...args: unknown[]) => mocks.listMessages(...args),
      sendMessage: (...args: unknown[]) => mocks.sendMessage(...args),
    },
  };
});

const conversationId = '550e8400-e29b-41d4-a716-446655440001';
const messageId = '550e8400-e29b-41d4-a716-446655440002';

describe('useConversationMessages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useConnectionStore.setState({
      status: 'disconnected',
      reconnectAttempt: 0,
      lastConnectedAt: undefined,
    });
    mocks.listMessages.mockResolvedValue({
      ok: true,
      data: { items: [], meta: { hasNextPage: false } },
    });
  });

  it('subscribes to the selected conversation room', async () => {
    renderHook(() => useConversationMessages(conversationId));

    await waitFor(() => {
      expect(mocks.subscribe).toHaveBeenCalledWith(conversationId);
      expect(mocks.register).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId,
          events: [
            'conversation.subscribed',
            'conversation.message.new',
            'conversation.updated',
            'conversation.typing',
            'message.status.changed',
          ],
        }),
      );
    });
  });

  it('refetches messages when the socket reconnects', async () => {
    renderHook(() => useConversationMessages(conversationId));

    await waitFor(() => {
      expect(mocks.listMessages).toHaveBeenCalledTimes(1);
    });

    act(() => {
      useConnectionStore.getState().setStatus('connected');
    });

    await waitFor(() => {
      expect(mocks.listMessages).toHaveBeenCalledTimes(2);
    });
  });

  it('upserts a durable message patch without refetching', async () => {
    const { result } = renderHook(() => useConversationMessages(conversationId));

    await waitFor(() => {
      expect(mocks.register).toHaveBeenCalled();
    });

    const handler = mocks.register.mock.calls[0]?.[0]?.handler as (
      event: string,
      payload: unknown,
    ) => void;

    act(() => {
      handler('conversation.message.new', {
        eventId: '550e8400-e29b-41d4-a716-446655440000',
        correlationId: 'corr-1',
        schemaVersion: 1,
        eventType: 'message.created',
        socketEventName: 'conversation.message.new',
        occurredAt: '2026-09-23T18:00:00.000Z',
        source: 'test',
        conversationId,
        action: 'message',
        messagePatch: {
          id: messageId,
          conversationId,
          body: 'Hola en vivo',
          direction: 'inbound',
          createdAt: '2026-09-23T18:00:00.000Z',
        },
      });
    });

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0]?.body).toBe('Hola en vivo');
    expect(mocks.listMessages).toHaveBeenCalledTimes(1);
  });

  it('falls back to REST when the realtime payload is incompatible', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    renderHook(() => useConversationMessages(conversationId));

    await waitFor(() => {
      expect(mocks.register).toHaveBeenCalled();
    });

    const handler = mocks.register.mock.calls[0]?.[0]?.handler as (
      event: string,
      payload: unknown,
    ) => void;

    act(() => {
      handler('conversation.message.new', { conversationId, body: 'sin contrato' });
    });

    await waitFor(() => {
      expect(mocks.listMessages).toHaveBeenCalledTimes(2);
    });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  const videoAttachment = () => ({
    file: new File([new Blob(['video-bytes'])], 'clip.mp4', { type: 'video/mp4' }),
    storageKey: '',
    mimeType: 'video/mp4',
    fileSizeBytes: '11',
    originalFilename: 'clip.mp4',
  });

  it('sends a single video with its caption instead of a separate text message', async () => {
    mocks.sendMessage.mockResolvedValueOnce({ ok: true, data: { message: { id: messageId } } });
    vi.mocked(apiClient.post).mockResolvedValueOnce({
      ok: true,
      data: { message: { id: messageId } },
    });
    const { result } = renderHook(() => useConversationMessages(conversationId));

    let response: { ok: boolean } | undefined;
    await act(async () => {
      response = await result.current.sendMessageSafe('A succulent eclipse!', [videoAttachment()]);
    });

    expect(response?.ok).toBe(true);
    expect(mocks.sendMessage).not.toHaveBeenCalled();
    expect(apiClient.post).toHaveBeenCalledTimes(1);
    const [url, form] = vi.mocked(apiClient.post).mock.calls[0] as unknown as [string, FormData];
    expect(url).toBe(`/conversations/${conversationId}/messages/media`);
    expect(form.get('caption')).toBe('A succulent eclipse!');
    expect((form.get('file') as File).name).toBe('clip.mp4');
  });

  it('truncates the video caption to 1024 characters', async () => {
    mocks.sendMessage.mockResolvedValueOnce({ ok: true, data: { message: { id: messageId } } });
    vi.mocked(apiClient.post).mockResolvedValueOnce({
      ok: true,
      data: { message: { id: messageId } },
    });
    const { result } = renderHook(() => useConversationMessages(conversationId));

    await act(async () => {
      const res = await result.current.sendMessageSafe('x'.repeat(1500), [videoAttachment()]);
      expect(res.ok).toBe(true);
    });

    expect(mocks.sendMessage).not.toHaveBeenCalled();
    const [, form] = vi.mocked(apiClient.post).mock.calls[0] as unknown as [string, FormData];
    expect(form.get('caption')).toHaveLength(1024);
  });

  it('does not split a surrogate pair when truncating the video caption', async () => {
    mocks.sendMessage.mockResolvedValueOnce({ ok: true, data: { message: { id: messageId } } });
    vi.mocked(apiClient.post).mockResolvedValueOnce({
      ok: true,
      data: { message: { id: messageId } },
    });
    const { result } = renderHook(() => useConversationMessages(conversationId));

    // The 1024th code point is the emoji, so a naive slice would cut it in half
    // and send a lone surrogate (serialized as U+FFFD) to WhatsApp.
    const text = `${'x'.repeat(1023)}😀${'y'.repeat(10)}`;

    await act(async () => {
      const res = await result.current.sendMessageSafe(text, [videoAttachment()]);
      expect(res.ok).toBe(true);
    });

    const [, form] = vi.mocked(apiClient.post).mock.calls[0] as unknown as [string, FormData];
    const caption = form.get('caption') as string;
    expect(caption).toBe(`${'x'.repeat(1023)}😀`);
    expect(caption).not.toContain('\uFFFD');
    const units = caption.split('').map((c) => c.charCodeAt(0));
    expect(
      units.some(
        (unit, i) =>
          unit >= 0xd800 && unit <= 0xdbff && !(units[i + 1] >= 0xdc00 && units[i + 1] <= 0xdfff),
      ),
    ).toBe(false);
  });

  it('keeps sending text separately when the single attachment is an image', async () => {
    mocks.sendMessage.mockResolvedValueOnce({ ok: true, data: { message: { id: messageId } } });
    vi.mocked(apiClient.post).mockResolvedValueOnce({
      ok: true,
      data: { message: { id: messageId } },
    });
    const { result } = renderHook(() => useConversationMessages(conversationId));

    await act(async () => {
      const res = await result.current.sendMessageSafe('Mira esta foto', [
        {
          file: new File([new Blob(['img'])], 'photo.jpg', { type: 'image/jpeg' }),
          storageKey: '',
          mimeType: 'image/jpeg',
          fileSizeBytes: '3',
          originalFilename: 'photo.jpg',
        },
      ]);
      expect(res.ok).toBe(true);
    });

    expect(mocks.sendMessage).toHaveBeenCalledTimes(1);
    const [, form] = vi.mocked(apiClient.post).mock.calls[0] as unknown as [string, FormData];
    expect(form.get('caption')).toBeNull();
  });
});
