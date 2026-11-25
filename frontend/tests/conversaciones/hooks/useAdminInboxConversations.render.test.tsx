import { useAdminInboxConversations } from '@/hooks/conversaciones/useAdminInboxConversations';
import type * as MessagingApiModule from '@/lib/shared/messaging-api';
import { useNotificationPreferencesStore } from '@/store/shared/use-notification-preferences-store';
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listConversations: vi.fn(),
  replace: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace, push: vi.fn() }),
  usePathname: () => '/admin/conversaciones',
  useSearchParams: () => new URLSearchParams('status=active'),
}));

vi.mock('@/lib/shared/messaging-api', async (importOriginal) => {
  const actual = await importOriginal<typeof MessagingApiModule>();
  return {
    ...actual,
    mapConversationToInboxUi: (row: unknown) => row as never,
    messagingApi: {
      ...actual.messagingApi,
      listConversations: mocks.listConversations,
      getConversation: vi.fn(),
    },
  };
});

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

const listRow = { id: 'conv-1' };

/**
 * Repro del "Maximum update depth exceeded" de `/admin/conversaciones`:
 * el selector del store de preferencias devolvía `?? []` (array nuevo por
 * snapshot) y con zustand v5 + React 19 eso provoca un bucle de re-render
 * cuando la entrada del usuario NO existe en `byUserId`.
 */
describe('useAdminInboxConversations — estabilidad del selector', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
    mocks.listConversations.mockResolvedValue({
      ok: true as const,
      data: { items: [listRow], meta: { nextCursor: undefined, hasNextPage: false } },
    });
  });

  afterEach(() => {
    useNotificationPreferencesStore.setState({
      byUserId: {},
      currentUserId: null,
      isHydrated: false,
    });
  });

  it('asienta sin bucle cuando el store hidrató sin entrada para el usuario actual', async () => {
    // Escenario exacto del bug: hidratado, pero sin entrada para el usuario.
    useNotificationPreferencesStore.setState({
      byUserId: {},
      currentUserId: 'user-without-entry',
      isHydrated: true,
    });

    const { result } = renderHook(() => useAdminInboxConversations());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.conversations).toHaveLength(1);
    expect(result.current.error).toBeUndefined();
  });

  it('usa el array de departamentos del store sin re-render infinito cuando hay entrada', async () => {
    useNotificationPreferencesStore.setState({
      byUserId: {
        'user-1': {
          local: {
            ...useNotificationPreferencesStore.getState().preferences(),
            scope: {
              mode: 'SELECTED',
              departmentIds: ['dept-1'],
              agentIds: [],
            },
          },
          server: null,
        },
      },
      currentUserId: 'user-1',
      isHydrated: true,
    });

    const { result } = renderHook(() => useAdminInboxConversations());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.filters.departmentIds).toEqual(['dept-1']);
  });
});
