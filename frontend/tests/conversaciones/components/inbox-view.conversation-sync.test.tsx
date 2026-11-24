import { InboxView } from '@/components/conversaciones/inbox-view';
import type { CommunicationLine } from '@/lib/shared/ai-api';
import type { InboxConversation } from '@/lib/shared/messaging-api';
import type * as MessagingApiModule from '@/lib/shared/messaging-api';
import { useActiveConversationStore } from '@/store/shared/use-active-conversation-store';
import { useNotificationPreferencesStore } from '@/store/shared/use-notification-preferences-store';
import { act, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Harness de router asíncrono.
 *
 * Emula el comportamiento del App Router de Next.js ante `router.replace`:
 * la navegación es una transición de baja prioridad que se compromete de
 * forma ASÍNCRONA. Mientras un cascade de actualizaciones síncronas siga
 * llegando, `useSearchParams` conserva el valor anterior. Los tests
 * anteriores mockeaban un router que actualizaba `searchParams` dentro de
 * `act`, por lo que rompían el ciclo en la primera iteración y no podían
 * detectar el bug de profundidad de actualización.
 */
const routerHarness = vi.hoisted(() => {
  const instances = new Map<string, URLSearchParams>();
  const state = {
    committedSearch: '',
    pendingSearch: undefined as string | undefined,
    listeners: new Set<() => void>(),
    replaceCalls: [] as string[],
    snapshot: undefined as URLSearchParams | undefined,
  };

  function instanceFor(search: string): URLSearchParams {
    let instance = instances.get(search);
    if (!instance) {
      instance = new URLSearchParams(search);
      instances.set(search, instance);
    }
    return instance;
  }

  return {
    getSnapshot: (): URLSearchParams => state.snapshot as URLSearchParams,
    subscribe(listener: () => void): () => void {
      state.listeners.add(listener);
      return () => {
        state.listeners.delete(listener);
      };
    },
    replace(href: string): void {
      state.replaceCalls.push(href);
      const [search] = href.split('?').slice(1);
      state.pendingSearch = search ?? '';
    },
    /** Compromete la navegación pendiente (como haría el router al completar la transición). */
    commitPendingNavigation(): boolean {
      if (state.pendingSearch === undefined) return false;
      state.committedSearch = state.pendingSearch;
      state.pendingSearch = undefined;
      state.snapshot = instanceFor(state.committedSearch);
      state.listeners.forEach((listener) => listener());
      return true;
    },
    calls(): string[] {
      return [...state.replaceCalls];
    },
    committed(): string {
      return state.committedSearch;
    },
    reset(initialSearch: string): void {
      state.replaceCalls = [];
      state.pendingSearch = undefined;
      state.committedSearch = initialSearch;
      state.snapshot = instanceFor(initialSearch);
    },
  };
});

vi.mock('next/navigation', async () => {
  const { useSyncExternalStore } = await import('react');
  const routerInstance = {
    replace: (href: string) => routerHarness.replace(href),
    push: (href: string) => routerHarness.replace(href),
    back: () => undefined,
    forward: () => undefined,
    refresh: () => undefined,
    prefetch: () => undefined,
  };
  return {
    useRouter: () => routerInstance,
    usePathname: () => '/admin/conversaciones',
    useSearchParams: () => useSyncExternalStore(routerHarness.subscribe, routerHarness.getSnapshot),
  };
});

const apiMocks = vi.hoisted(() => ({
  listConversations: vi.fn(),
  getConversation: vi.fn(),
  markConversationRead: vi.fn(),
}));

vi.mock('@/lib/shared/messaging-api', async (importOriginal) => {
  const actual = await importOriginal<typeof MessagingApiModule>();
  return {
    ...actual,
    mapConversationToInboxUi: (row: unknown) => row as never,
    messagingApi: {
      ...actual.messagingApi,
      listConversations: apiMocks.listConversations,
      getConversation: apiMocks.getConversation,
      markConversationRead: apiMocks.markConversationRead,
    },
  };
});

vi.mock('@/components/conversaciones/start-conversation-dialog', () => ({
  StartConversationDialog: () => null,
}));
vi.mock('@/components/conversaciones/citizen-profile', () => ({
  CitizenProfile: ({ citizenId }: { citizenId?: string }) => <div>Ciudadano {citizenId}</div>,
}));
vi.mock('@/components/conversaciones/MessageComposer', () => ({
  MessageComposer: () => <div />,
}));

let phoneLines: CommunicationLine[] = [];
vi.mock('@/hooks/conversaciones/usePhoneLines', () => ({
  usePhoneLines: () => ({ lines: phoneLines, loading: false, error: undefined }),
}));
vi.mock('@/hooks/shared/useAiAgents', () => ({ useAiAgents: () => [] }));
vi.mock('@/hooks/shared/useDepartments', () => ({
  useDepartments: () => ({ departments: [], loading: false, error: undefined }),
}));
vi.mock('@/hooks/shared/useAuth', () => ({ useAuth: () => ({ user: { id: 'agent-1' } }) }));
vi.mock('@/hooks/shared/usePermissions', () => ({
  usePermissions: () => ({
    roles: [],
    can: () => false,
    guards: { can: () => false },
  }),
}));

const emptyMessages = {
  messages: [],
  loading: false,
  sending: false,
  error: undefined,
  botTyping: false,
  socketConnected: false,
  refresh: () => Promise.resolve(),
  sendMessageSafe: () => Promise.resolve({ ok: false as const, message: 'Sin conversación' }),
  sendAudioSafe: () => Promise.resolve({ ok: false as const, message: 'Sin conversación' }),
};
vi.mock('@/hooks/conversaciones/useConversationMessages', () => ({
  useConversationMessages: () => emptyMessages,
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

const lineOne: CommunicationLine = {
  id: 'line-1',
  channel: 'whatsapp',
  externalIdentifier: 'phone-id-1',
  phoneNumber: '529661234567',
  displayName: 'Atención Ciudadana',
  isActive: true,
  isDefault: true,
  aiEnabled: true,
  metadata: {},
  createdAt: '2026-09-20T00:00:00.000Z',
  updatedAt: '2026-09-20T00:00:00.000Z',
};

const lineTwo: CommunicationLine = {
  ...lineOne,
  id: 'line-2',
  externalIdentifier: 'phone-id-2',
  phoneNumber: '529669876543',
  displayName: 'Segunda Línea',
  isDefault: false,
};

const conversation: InboxConversation = {
  id: 'conv-1',
  citizen: {
    id: 'cit-1',
    name: 'María González',
    phone: '9661234567',
    colonia: 'Centro',
    interests: [],
    registeredAt: '2026-09-20T10:00:00.000Z',
  },
  inboxStatus: 'active',
  conversationStatus: 'open',
  lastMessage: 'Hola',
  lastTime: '10:00',
  unread: 1,
  updatedAt: '2026-09-20T18:00:00.000Z',
  canClose: true,
};

async function settle(rounds = 6): Promise<void> {
  for (let i = 0; i < rounds; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

function renderInbox() {
  return render(<InboxView />, {
    wrapper: ({ children }) => <StrictMode>{children}</StrictMode>,
  });
}

beforeEach(() => {
  window.localStorage.clear();
  vi.clearAllMocks();
  phoneLines = [];
  apiMocks.listConversations.mockResolvedValue({
    ok: true as const,
    data: {
      items: [conversation],
      meta: { nextCursor: undefined, hasNextPage: false },
    },
  });
  apiMocks.getConversation.mockResolvedValue({
    ok: true as const,
    data: { conversation },
  });
  apiMocks.markConversationRead.mockResolvedValue({ ok: true as const, data: {} });
  useActiveConversationStore.setState({ activeConversationId: undefined });
  useNotificationPreferencesStore.setState({
    byUserId: {},
    currentUserId: 'user-without-entry',
    isHydrated: true,
  });
  routerHarness.reset('status=active&line=line-1&conversation=conv-1');
  vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
});

afterEach(() => {
  useNotificationPreferencesStore.setState({
    byUserId: {},
    currentUserId: null,
    isHydrated: false,
  });
});

describe('InboxView — ?conversation= con transición de URL asíncrona', () => {
  /**
   * Regresión del "Maximum update depth exceeded" de `/admin/conversaciones`.
   *
   * Cadena del bug: el efecto `?conversation=` de InboxView re-ejecuta
   * `handleSelectChat` en cada cambio de identidad de `conversations`, y
   * `upsertConversation` devolvía SIEMPRE un array nuevo aunque la
   * conversación ya estuviera presente con contenido idéntico. El único
   * finalizador del ciclo era limpiar `?conversation=` vía `router.replace`,
   * cuyo commit es asíncrono y no puede avanzar mientras React encadena
   * actualizaciones sincrónicas → bucle infinito.
   */
  it('selecciona la conversación pedida sin ciclar mientras la navegación sigue pendiente', async () => {
    const view = renderInbox();
    await settle();

    // La conversación quedó seleccionada y marcada como leída.
    expect(useActiveConversationStore.getState().activeConversationId).toBe('conv-1');
    expect(apiMocks.markConversationRead).toHaveBeenCalledWith('conv-1');

    // Pidió limpiar ?conversation= un número acotado de veces…
    const callsAfterSettle = routerHarness.calls();
    expect(callsAfterSettle.length).toBeGreaterThan(0);
    expect(callsAfterSettle.length).toBeLessThanOrEqual(6);
    expect(callsAfterSettle.every((href) => href.includes('conversation=conv-1') === false)).toBe(
      true,
    );

    // …y el sistema se estabiliza: rondas extra no generan nuevas escrituras.
    await settle();
    expect(routerHarness.calls().length).toBe(callsAfterSettle.length);

    // Cuando la transición compromete, ?conversation= desaparece y la línea explícita se conserva.
    act(() => {
      routerHarness.commitPendingNavigation();
    });
    await settle();
    expect(routerHarness.committed()).not.toContain('conversation=');
    expect(routerHarness.committed()).toContain('line=line-1');

    const callsAfterCommit = routerHarness.calls().length;
    await settle();
    expect(routerHarness.calls().length).toBe(callsAfterCommit);

    // Traer por id ocurrió como mucho una vez (el guard de en vuelo evita
    // consultas repetidas aunque el efecto se re-ejecute).
    expect(apiMocks.getConversation.mock.calls.length).toBeLessThanOrEqual(1);

    view.unmount();
  });

  it('conserva la línea explícita cuando el catálogo de líneas llega después del montaje', async () => {
    const view = renderInbox();
    await settle();

    // El catálogo llega tarde y trae OTRA línea como primera opción.
    act(() => {
      phoneLines = [lineTwo, lineOne];
    });
    view.rerender(<InboxView />);
    await settle();

    // La auto-selección no pisa la línea explícita de la URL.
    expect(routerHarness.calls().some((href) => href.includes('line=line-2'))).toBe(false);
    expect(routerHarness.committed()).toContain('line=line-1');

    // El selector de líneas refleja la catálogo cargado.
    expect(await screen.findByLabelText('Línea telefónica')).toBeInTheDocument();

    view.unmount();
  });
});
