import { act, renderHook, waitFor } from '@testing-library/react';
import type { RealtimeManager } from '@/lib/realtime/realtime-manager';
import { useConnectionStore } from '@/stores/use-connection-store';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConversationDetailDto } from '@/lib/conversations-api';
import { useConversationThread } from '../useConversationThread';

const mocks = vi.hoisted(() => {
  const callbacks = {
    getById: vi.fn(),
    getMessages: vi.fn(),
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

vi.mock('@/components/providers/realtime-provider', () => ({
  useRealtimeManager: () => mocks.manager as unknown as RealtimeManager,
}));

vi.mock('@/lib/conversations-api', async () => {
  const actual = (await vi.importActual('@/lib/conversations-api')) as {
    conversationsApi: Record<string, unknown>;
  };

  return {
    ...actual,
    conversationsApi: {
      ...actual.conversationsApi,
      getById: (...args: unknown[]) => mocks.getById(...args),
      getMessages: (...args: unknown[]) => mocks.getMessages(...args),
    },
  };
});

const conversationId = '550e8400-e29b-41d4-a716-446655440001';

function buildConversation(): ConversationDetailDto {
  return {
    id: conversationId,
    citizenId: 'citizen-1',
    status: 'open',
    channel: 'whatsapp',
    assignedDept: undefined,
    assignedUserId: undefined,
    createdAt: '2026-06-27T10:00:00.000Z',
    updatedAt: '2026-06-27T10:00:00.000Z',
    meta: {
      id: 'meta-1',
      conversationId,
      flowState: 'BOT_FLOW',
      version: 1,
      createdAt: '2026-06-27T10:00:00.000Z',
      updatedAt: '2026-06-27T10:00:00.000Z',
    },
    citizen: {
      id: 'citizen-1',
      phone: '+5491111111111',
      name: 'Citizen',
    },
  };
}

describe('useConversationThread reconnect fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useConnectionStore.setState({
      status: 'disconnected',
      reconnectAttempt: 0,
      lastConnectedAt: undefined,
    });

    mocks.getById.mockResolvedValue({
      ok: true,
      data: { conversation: buildConversation() },
    });
    mocks.getMessages.mockResolvedValue({
      ok: true,
      data: {
        items: [],
        meta: { hasNextPage: false, nextCursor: undefined },
      },
    });
  });

  it('refetches conversation and messages when socket transitions from disconnected to connected', async () => {
    renderHook(() => useConversationThread(conversationId));

    await waitFor(() => {
      expect(mocks.getById).toHaveBeenCalledTimes(1);
      expect(mocks.getMessages).toHaveBeenCalledTimes(1);
    });

    act(() => {
      useConnectionStore.getState().setStatus('connected');
    });

    await waitFor(() => {
      expect(mocks.getById).toHaveBeenCalledTimes(2);
      expect(mocks.getMessages).toHaveBeenCalledTimes(2);
    });
  });

  it('does not run an extra reconnect refetch when already connected on mount', async () => {
    useConnectionStore.setState({
      status: 'connected',
      reconnectAttempt: 0,
      lastConnectedAt: undefined,
    });

    renderHook(() => useConversationThread(conversationId));

    await waitFor(() => {
      expect(mocks.getById).toHaveBeenCalledTimes(1);
      expect(mocks.getMessages).toHaveBeenCalledTimes(1);
    });
  });
});
