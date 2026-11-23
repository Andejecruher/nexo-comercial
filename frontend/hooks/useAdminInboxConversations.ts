'use client';

import { useRealtimeManager } from '@/components/providers/realtime-provider';
import { CONVERSATION_OPEN_PARAM } from '@/lib/conversations-navigation';
import {
  mapConversationToInboxUi,
  messagingApi,
  type InboxConversation,
  type InboxStatus,
} from '@/lib/messaging-api';
import { applyInboxEvent } from '@/lib/realtime/inbox-sync';
import { isDurableEventPayload, type RealtimeInboxPatch } from '@/lib/realtime/types';
import { useActiveConversationStore } from '@/stores/use-active-conversation-store';
import { useConnectionStore } from '@/stores/use-connection-store';
import { useNotificationPreferencesStore } from '@/stores/use-notification-preferences-store';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';

const DEFAULT_LIMIT = 50;
const SEARCH_DEBOUNCE_MS = 400;
export const INBOX_FILTER_STORAGE_KEY = 'vc.admin.inbox.filters.v3';

export type InboxStatusTab = InboxStatus;

export interface InboxListFilters {
  inboxStatus: InboxStatusTab;
  communicationLineId?: string;
  departmentIds?: string[];
  search?: string;
  /**
   * IDs de agentes IA para filtrar conversaciones atendidas por bots.
   * `null` representa "todos los bots". Coexiste con departmentIds:
   * ambos grupos se combinan con OR en el backend.
   */
  botIds?: (string | null)[];
}

export const DEFAULT_INBOX_FILTERS: InboxListFilters = {
  inboxStatus: 'active',
};

/**
 * Array compartido e inmutable para el selector de zustand. Un `?? []` dentro
 * del selector crearía un array nuevo en cada render (zustand v5 +
 * useSyncExternalStore cachean por referencia), lo que dispara el bucle de
 * re-render "Maximum update depth exceeded".
 */
const NO_DEPARTMENT_IDS: string[] = [];

function isInboxStatus(value: string | null): value is InboxStatusTab {
  return value === 'active' || value === 'inactive';
}

function normalizeDepartmentIds(values: readonly string[]): string[] | undefined {
  const ids = Array.from(
    new Set(
      values
        .flatMap((value) => value.split(','))
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  );
  return ids.length > 0 ? ids : undefined;
}

/**
 * Normaliza una lista de botIds: `'all'` → `null`, dedupe y descarta vacíos.
 * Devuelve `undefined` cuando no queda ningún valor.
 */
function normalizeBotIds(
  values: readonly (string | null | undefined)[],
): (string | null)[] | undefined {
  const seen = new Set<string>();
  const ids: (string | null)[] = [];
  values.forEach((value) => {
    if (value === null || value === undefined) {
      if (!seen.has('\u0000null')) {
        seen.add('\u0000null');
        ids.push(null);
      }
      return;
    }
    const trimmed = value.trim();
    if (!trimmed) return;
    const normalized = trimmed === 'all' ? null : trimmed;
    const key = normalized === null ? '\u0000null' : normalized;
    if (seen.has(key)) return;
    seen.add(key);
    ids.push(normalized);
  });
  return ids.length > 0 ? ids : undefined;
}

/** Convierte el valor legacy `botFilter` ('all-bots' | agentId) a botIds. */
function legacyBotFilterToBotIds(value: string | null | undefined): (string | null)[] | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return trimmed === 'all-bots' ? [null] : [trimmed];
}

/**
 * Igualdad superficial de dos snapshots de conversación. Un campo ausente y
 * otro presente con `undefined` cuentan como el mismo valor efectivo.
 */
function isSameConversationSnapshot(a: InboxConversation, b: InboxConversation): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)] as Array<keyof InboxConversation>);
  for (const key of keys) {
    if (!Object.is(a[key], b[key])) return false;
  }
  return true;
}

export function parseInboxFilters(searchParams: URLSearchParams): InboxListFilters {
  const status = searchParams.get('status');
  const legacyBot = legacyBotFilterToBotIds(searchParams.get('bot'));
  return {
    inboxStatus: isInboxStatus(status) ? status : 'active',
    communicationLineId: searchParams.get('line')?.trim() || undefined,
    departmentIds: normalizeDepartmentIds(searchParams.getAll('dept')),
    search: searchParams.get('search')?.trim() || undefined,
    botIds: normalizeBotIds([...searchParams.getAll('bot_ids'), ...(legacyBot ?? [])]),
  };
}

export function inboxFiltersFromUrl(searchParams: URLSearchParams): InboxListFilters | null {
  if (
    !searchParams.has('status') &&
    !searchParams.has('line') &&
    !searchParams.has('dept') &&
    !searchParams.has('bot') &&
    !searchParams.has('bot_ids') &&
    !searchParams.has('search')
  ) {
    return null;
  }
  return parseInboxFilters(searchParams);
}

export function writeInboxFiltersToParams(
  searchParams: URLSearchParams,
  filters: InboxListFilters,
): URLSearchParams {
  const next = new URLSearchParams(searchParams.toString());
  next.set('status', filters.inboxStatus);
  if (filters.communicationLineId) next.set('line', filters.communicationLineId);
  else next.delete('line');
  next.delete('dept');
  next.delete('bot');
  next.delete('bot_ids');
  filters.departmentIds?.forEach((departmentId) => next.append('dept', departmentId));
  filters.botIds?.forEach((botId) => next.append('bot_ids', botId ?? 'all'));
  if (filters.search) next.set('search', filters.search);
  else next.delete('search');
  return next;
}

export function readStoredInboxFilters(): InboxListFilters | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(INBOX_FILTER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Omit<InboxListFilters, 'botFilter'>> & {
      departmentId?: string;
      botFilter?: string;
    };
    const inboxStatus = parsed.inboxStatus ?? null;
    if (!isInboxStatus(inboxStatus)) return null;
    const legacyBot = legacyBotFilterToBotIds(parsed.botFilter);
    return {
      inboxStatus,
      communicationLineId: parsed.communicationLineId?.trim() || undefined,
      departmentIds: normalizeDepartmentIds([
        ...(parsed.departmentIds ?? []),
        ...(parsed.departmentId ? [parsed.departmentId] : []),
      ]),
      search: parsed.search?.trim() || undefined,
      botIds: normalizeBotIds([...(parsed.botIds ?? []), ...(legacyBot ?? [])]),
    };
  } catch {
    return null;
  }
}

/**
 * Combina filtros actuales con un parcial. departmentIds y botIds son
 * independientes: cada uno entra con OR en el backend (sin exclusión mutua).
 */
export function mergeInboxFilters(
  current: InboxListFilters,
  partial: Partial<InboxListFilters>,
): InboxListFilters {
  return {
    inboxStatus: partial.inboxStatus ?? current.inboxStatus,
    communicationLineId:
      'communicationLineId' in partial
        ? partial.communicationLineId?.trim() || undefined
        : current.communicationLineId,
    departmentIds:
      'departmentIds' in partial
        ? normalizeDepartmentIds(partial.departmentIds ?? [])
        : current.departmentIds,
    search: 'search' in partial ? partial.search?.trim() || undefined : current.search,
    botIds: 'botIds' in partial ? normalizeBotIds(partial.botIds ?? []) : current.botIds,
  };
}

export function storeInboxFilters(filters: InboxListFilters): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(INBOX_FILTER_STORAGE_KEY, JSON.stringify(filters));
  } catch {
    // private mode / quota — the URL still persists the selection
  }
}

/**
 * Evento `conversation.updated` del EventBus (FSM y acciones admin cuando el
 * pipeline durable no envuelve el payload). Incluye `state-transition`, que el
 * sobre durable no modela.
 */
const legacyConversationUpdatedSchema = z.object({
  conversationId: z.string().min(1),
  action: z.enum([
    'state-transition',
    'assign',
    'transfer',
    'handover',
    'close',
    'reopen',
    'message',
  ]),
  flowState: z.string().optional(),
  status: z.enum(['open', 'closed']).optional(),
  triggeredBy: z.enum(['bot', 'user', 'agent', 'system']).optional(),
  actorId: z.string().optional(),
  occurredAt: z.string().min(1),
});

export interface InboxSocketUpdate {
  conversationId: string;
  action?: string;
  inboxPatch?: RealtimeInboxPatch;
  eventId?: string;
}

function looksLikeDurableEnvelope(payload: unknown): boolean {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'eventId' in payload &&
    'schemaVersion' in payload &&
    'socketEventName' in payload
  );
}

function mapLegacyConversationUpdated(
  payload: z.infer<typeof legacyConversationUpdatedSchema>,
): InboxSocketUpdate {
  const closed =
    payload.action === 'close' || payload.flowState === 'CLOSED' || payload.status === 'closed';
  const reopened = payload.action === 'reopen';
  const action =
    payload.action === 'state-transition' ? (closed ? 'close' : undefined) : payload.action;

  const actorId = z.string().uuid().safeParse(payload.actorId);
  const inboxPatch: RealtimeInboxPatch = {
    ...(payload.flowState ? { flowState: payload.flowState } : {}),
    ...(payload.status ? { status: payload.status } : {}),
    ...(closed ? { inboxStatus: 'inactive' as const, status: 'closed' as const } : {}),
    ...(reopened ? { inboxStatus: 'active' as const, status: 'open' as const } : {}),
    ...((payload.action === 'assign' ||
      payload.action === 'transfer' ||
      payload.action === 'handover') &&
    actorId.success
      ? { assignedUserId: actorId.data }
      : {}),
  };

  return {
    conversationId: payload.conversationId,
    action,
    inboxPatch,
  };
}

/**
 * Normaliza el payload de `conversation.updated` (sobre durable o evento legacy
 * del backend) para aplicarlo en la bandeja. Devuelve null si no se reconoce.
 */
export function resolveInboxSocketUpdate(payload: unknown): InboxSocketUpdate | null {
  if (isDurableEventPayload(payload)) {
    return {
      conversationId: payload.conversationId,
      action: payload.action,
      inboxPatch: payload.inboxPatch,
      eventId: payload.eventId,
    };
  }

  if (looksLikeDurableEnvelope(payload)) return null;

  const legacy = legacyConversationUpdatedSchema.safeParse(payload);
  if (!legacy.success) return null;
  return mapLegacyConversationUpdated(legacy.data);
}

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

/**
 * Listado de conversaciones para la bandeja admin clásica (`/admin` + InboxView).
 * Los filtros se resuelven en el backend (`GET /conversations`).
 */
export function useAdminInboxConversations() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const hydrated = useRef(false);
  const urlSeeded = useRef(false);
  const requestSeq = useRef(0);

  // Selector con retorno estable: la referencia solo cambia cuando el store lo
  // hace; `undefined` y NO_DEPARTMENT_IDS son valores con identidad fija.
  const storedDepartmentIds = useNotificationPreferencesStore(
    (state) => state.byUserId[state.currentUserId ?? '']?.local.scope.departmentIds,
  );
  const notificationDepartmentIds = storedDepartmentIds ?? NO_DEPARTMENT_IDS;
  const isNotificationStoreHydrated = useNotificationPreferencesStore((state) => state.isHydrated);

  const filters = useMemo(() => {
    const parsed = parseInboxFilters(new URLSearchParams(searchParams.toString()));
    return {
      ...parsed,
      departmentIds: isNotificationStoreHydrated
        ? notificationDepartmentIds.length > 0
          ? notificationDepartmentIds
          : undefined
        : parsed.departmentIds,
    };
  }, [searchParams, notificationDepartmentIds, isNotificationStoreHydrated]);
  const filtersRef = useRef(filters);

  const [searchInput, setSearchInput] = useState(filters.search ?? '');
  const debouncedSearch = useDebouncedValue(searchInput, SEARCH_DEBOUNCE_MS);

  useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);

  const [conversations, setConversations] = useState<InboxConversation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [nextCursor, setNextCursor] = useState<string | undefined>(undefined);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [closingId, setClosingId] = useState<string | undefined>(undefined);
  const conversationsRef = useRef<InboxConversation[]>([]);
  const selectedIdRef = useRef<string | undefined>(undefined);
  const requestedChatRef = useRef<InboxConversation | undefined>(undefined);
  const requestedResolvedRef = useRef<string | undefined>(undefined);
  const requestedInFlightRef = useRef<string | undefined>(undefined);
  const realtimeSeq = useRef(0);
  const refetchTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const manager = useRealtimeManager();
  const socketConnected = useConnectionStore((state) => state.status === 'connected');

  const persistFilters = useCallback(
    (nextFilters: InboxListFilters) => {
      storeInboxFilters(nextFilters);
      const next = writeInboxFiltersToParams(
        new URLSearchParams(searchParams.toString()),
        nextFilters,
      );
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const requestedConversationId = searchParams.get(CONVERSATION_OPEN_PARAM)?.trim() || undefined;

  /** Saca `?conversation=` de la URL una vez que la bandeja ya la seleccionó. */
  const clearRequestedConversation = useCallback(() => {
    requestedChatRef.current = undefined;
    const next = new URLSearchParams(searchParams.toString());
    if (!next.has(CONVERSATION_OPEN_PARAM)) return;
    next.delete(CONVERSATION_OPEN_PARAM);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;

    const fromUrl = inboxFiltersFromUrl(new URLSearchParams(searchParams.toString()));
    if (fromUrl) {
      storeInboxFilters(fromUrl);
      setSearchInput(fromUrl.search ?? '');
      return;
    }

    const stored = readStoredInboxFilters();
    if (
      stored &&
      (stored.inboxStatus !== DEFAULT_INBOX_FILTERS.inboxStatus ||
        stored.communicationLineId ||
        stored.departmentIds?.length ||
        stored.botIds?.length ||
        stored.search)
    ) {
      setSearchInput(stored.search ?? '');
      persistFilters(stored);
    }
  }, [persistFilters, searchParams]);

  useEffect(() => {
    const nextSearch = debouncedSearch.trim() || undefined;
    if (nextSearch === (filtersRef.current.search ?? undefined)) return;
    persistFilters({ ...filtersRef.current, search: nextSearch });
  }, [debouncedSearch, persistFilters]);

  const fetchPage = useCallback(
    async (cursor?: string, append = false) => {
      const seq = ++requestSeq.current;
      const liveSeqAtFetch = realtimeSeq.current;
      setLoading(true);
      setError(undefined);

      const result = await messagingApi.listConversations({
        cursor,
        limit: DEFAULT_LIMIT,
        status: filters.inboxStatus,
        departmentIds: filters.departmentIds,
        botIds: filters.botIds,
        communicationLineId: filters.communicationLineId,
        search: filters.search,
      });

      if (seq !== requestSeq.current) return;

      if (result.ok) {
        const mapped = result.data.items.map(mapConversationToInboxUi);
        setConversations((prev) => {
          const live = new Map(prev.map((row) => [row.id, row]));
          const rows = mapped.map((row) =>
            realtimeSeq.current !== liveSeqAtFetch && live.has(row.id) ? live.get(row.id)! : row,
          );
          const next = append ? [...prev, ...rows.filter((row) => !live.has(row.id))] : rows;
          // Mantiene visible la conversación pedida por query param aunque la
          // página recién traída no la incluya (p. ej. al alinear la línea).
          const pinned = requestedChatRef.current;
          const withPinned =
            pinned && !next.some((row) => row.id === pinned.id) ? [pinned, ...next] : next;
          conversationsRef.current = withPinned;
          return withPinned;
        });
        setNextCursor(result.data.meta.nextCursor);
        setHasNextPage(result.data.meta.hasNextPage);
      } else {
        setError(result.message);
        toast.error('No se pudieron cargar las conversaciones', { description: result.message });
      }

      setLoading(false);
    },
    [filters],
  );

  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  useEffect(() => {
    void fetchPage(undefined, false);
  }, [fetchPage]);

  // Sync URL/localStorage from the unified store once it is hydrated.
  useEffect(() => {
    if (!isNotificationStoreHydrated) return;
    const nextDepartmentIds =
      notificationDepartmentIds.length > 0 ? notificationDepartmentIds : undefined;
    if (nextDepartmentIds === filtersRef.current.departmentIds) return;
    persistFilters({ ...filtersRef.current, departmentIds: nextDepartmentIds });
  }, [isNotificationStoreHydrated, notificationDepartmentIds, persistFilters]);

  // One-time seed: if the URL contained departments before the store hydrated,
  // copy them to the unified store.
  useEffect(() => {
    if (!isNotificationStoreHydrated || urlSeeded.current) return;
    urlSeeded.current = true;

    const fromUrl = parseInboxFilters(new URLSearchParams(searchParams.toString())).departmentIds;
    if (fromUrl && fromUrl.length > 0 && notificationDepartmentIds.length === 0) {
      useNotificationPreferencesStore.getState().setDepartmentIds(fromUrl);
    }
  }, [isNotificationStoreHydrated, notificationDepartmentIds, searchParams]);

  const loadMore = useCallback(() => {
    if (!hasNextPage || !nextCursor || loading) return;
    void fetchPage(nextCursor, true);
  }, [fetchPage, hasNextPage, nextCursor, loading]);

  const applyFilters = useCallback(
    (partial: Partial<InboxListFilters>) => {
      const next = mergeInboxFilters(filters, partial);

      // El alcance de departamentos vive en el store unificado (conversaciones ↔
      // notificaciones): mantenerlo sincronizado con el resultado fusionado.
      // Los botIds son un filtro exclusivo de la bandeja y no tocan el store.
      if ('departmentIds' in partial) {
        useNotificationPreferencesStore.getState().setDepartmentIds(next.departmentIds ?? []);
      }

      persistFilters(next);
    },
    [filters, persistFilters],
  );

  /**
   * Inserta o actualiza una conversación en el listado.
   *
   * Si la conversación ya está presente y la fusión no cambia ningún valor
   * efectivo, devuelve la referencia previa: devolver siempre un array nuevo
   * re-ejecutaba el efecto `?conversation=` de InboxView (que llama a
   * `handleSelectChat` → `upsertConversation` en cada cambio de
   * `conversations`) en un bucle síncrono cuyo único finalizador — limpiar
   * la URL vía `router.replace` — es asíncrono. React detectaba más de 50
   * actualizaciones anidadas y lanzaba "Maximum update depth exceeded".
   */
  const upsertConversation = useCallback((chat: InboxConversation) => {
    setConversations((prev) => {
      const idx = prev.findIndex((item) => item.id === chat.id);
      if (idx === -1) return [chat, ...prev];
      const existing = prev[idx];
      const merged = { ...existing, ...chat };
      if (isSameConversationSnapshot(existing, merged)) return prev;
      const next = [...prev];
      next[idx] = merged;
      return next;
    });
  }, []);

  /**
   * Abre una conversación pedida por query param (`?conversation=<id>`), el
   * mecanismo con el que los toasts realtime y las notificaciones piden abrir
   * un chat desde cualquier ruta del admin.
   *
   * - Si la conversación no está en la página cargada, la trae por id
   *   (`GET /conversations/:id`) y la inserta en el sidebar.
   * - Si la URL no trae `?line=`, alinea el filtro de línea con
   *   `communicationLineId` de la conversación para que la URL termine en
   *   `?status=active&line=<lineId>`. Si la navegación ya trajo una línea
   *   explícita (evento realtime), ésta tiene prioridad sobre la derivada.
   */
  useEffect(() => {
    if (!requestedConversationId) {
      requestedResolvedRef.current = undefined;
      return;
    }
    if (requestedResolvedRef.current === requestedConversationId) return;
    if (requestedInFlightRef.current === requestedConversationId) return;

    const existing = conversationsRef.current.find(
      (chatItem) => chatItem.id === requestedConversationId,
    );
    if (existing) {
      requestedResolvedRef.current = requestedConversationId;
      // Solo alinear cuando no hay línea explícita: `?line=` del evento gana
      // sobre la derivada del DTO.
      if (!filtersRef.current.communicationLineId && existing.communicationLineId) {
        persistFilters({
          ...filtersRef.current,
          communicationLineId: existing.communicationLineId,
        });
      }
      return;
    }

    requestedInFlightRef.current = requestedConversationId;
    let cancelled = false;
    void (async () => {
      const result = await messagingApi.getConversation(requestedConversationId);
      if (cancelled) return;
      requestedInFlightRef.current = undefined;
      if (!result.ok) {
        toast.error('No se pudo abrir la conversación', { description: result.message });
        return;
      }

      requestedResolvedRef.current = requestedConversationId;
      const dto = result.data.conversation;
      const mapped = mapConversationToInboxUi(dto);
      const chat: InboxConversation = {
        ...mapped,
        inboxStatus:
          dto.status === 'closed' || dto.meta?.flowState === 'CLOSED' ? 'inactive' : 'active',
      };
      requestedChatRef.current = chat;
      upsertConversation(chat);
      if (!filtersRef.current.communicationLineId && chat.communicationLineId) {
        persistFilters({ ...filtersRef.current, communicationLineId: chat.communicationLineId });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [requestedConversationId, persistFilters, upsertConversation]);

  const closeConversation = useCallback(
    async (conversationId: string) => {
      setClosingId(conversationId);
      setError(undefined);
      try {
        const result = await messagingApi.closeConversation(conversationId);
        if (!result.ok) {
          setError(result.message);
          toast.error('No se pudo cerrar la conversación', { description: result.message });
          return false;
        }

        setConversations((prev) => prev.filter((item) => item.id !== conversationId));
        toast.success('Conversación cerrada');
        void fetchPage(undefined, false);
        return true;
      } finally {
        setClosingId(undefined);
      }
    },
    [fetchPage],
  );

  const setSelectedConversationId = useCallback((id?: string) => {
    selectedIdRef.current = id;
    useActiveConversationStore.getState().setActiveConversation(id);
  }, []);

  const markConversationRead = useCallback(async (conversationId: string) => {
    selectedIdRef.current = conversationId;
    setConversations((prev) => {
      const target = prev.find((item) => item.id === conversationId);
      if (!target || target.unread === 0) return prev;
      return prev.map((item) => (item.id === conversationId ? { ...item, unread: 0 } : item));
    });
    const result = await messagingApi.markConversationRead(conversationId);
    if (!result.ok) {
      toast.error('No se pudo marcar como leída', { description: result.message });
    }
  }, []);

  const scheduleCoalescedRefetch = useCallback(() => {
    if (refetchTimerRef.current) return;
    refetchTimerRef.current = setTimeout(() => {
      refetchTimerRef.current = undefined;
      void fetchPage(undefined, false);
    }, 300);
  }, [fetchPage]);

  useEffect(() => {
    return () => {
      if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!manager) return;

    const consumerId = 'admin-inbox-list';
    const handler = (event: string, payload: unknown) => {
      const update = event === 'conversation.updated' ? resolveInboxSocketUpdate(payload) : null;
      const durable = isDurableEventPayload(payload) ? payload : undefined;
      const resolved =
        update ??
        (durable
          ? {
              conversationId: durable.conversationId,
              action: durable.action,
              inboxPatch: durable.inboxPatch,
              eventId: durable.eventId,
            }
          : null);

      if (!resolved) {
        console.warn(
          JSON.stringify({
            ts: new Date().toISOString(),
            component: 'useAdminInboxConversations',
            status: 'fallback_refetch',
            event,
            reason: 'incompatible_payload',
          }),
        );
        scheduleCoalescedRefetch();
        return;
      }

      realtimeSeq.current++;
      const result = applyInboxEvent({
        conversations: conversationsRef.current,
        conversationId: resolved.conversationId,
        action: resolved.action,
        inboxPatch: resolved.inboxPatch,
        selectedId: selectedIdRef.current,
        filters: {
          inboxStatus: filters.inboxStatus,
          departmentIds: filters.departmentIds,
          communicationLineId: filters.communicationLineId,
        },
      });

      conversationsRef.current = result.conversations;
      setConversations(result.conversations);

      const legacyMessageWithoutPreview =
        resolved.action === 'message' && !resolved.inboxPatch?.lastMessagePreview;
      if (result.needsRefetch || legacyMessageWithoutPreview) {
        console.warn(
          JSON.stringify({
            ts: new Date().toISOString(),
            component: 'useAdminInboxConversations',
            status: 'fallback_refetch',
            event,
            reason: legacyMessageWithoutPreview
              ? 'legacy_message_without_preview'
              : (resolved.action ?? 'schema_or_filter_change'),
            eventId: resolved.eventId,
            conversationId: resolved.conversationId,
          }),
        );
        scheduleCoalescedRefetch();
      }
    };

    manager.router.register({
      id: consumerId,
      events: ['conversation.updated', 'conversation.handover', 'conversation.message.new'],
      handler,
    });

    return () => {
      manager.router.unregister(consumerId);
    };
  }, [filters, manager, scheduleCoalescedRefetch]);

  const prevSocketConnected = useRef(socketConnected);
  useEffect(() => {
    if (!prevSocketConnected.current && socketConnected) {
      scheduleCoalescedRefetch();
    }
    prevSocketConnected.current = socketConnected;
  }, [scheduleCoalescedRefetch, socketConnected]);

  return {
    conversations,
    loading,
    error,
    hasNextPage,
    filters,
    searchInput,
    setSearchInput,
    closingId,
    applyFilters,
    upsertConversation,
    closeConversation,
    markConversationRead,
    setSelectedConversationId,
    requestedConversationId,
    clearRequestedConversation,
    refresh: () => void fetchPage(undefined, false),
    loadMore,
  };
}
