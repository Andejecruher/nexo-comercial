import { authStorage } from '@/lib/shared/auth-storage';
import { notificationPreferencesApi } from '@/lib/shared/notification-preferences-api';
import {
  broadcastScopeChange,
  listenToScopeChanges,
} from '@/lib/shared/notifications/scope-broadcaster';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type NotificationEventKey = 'newMessage' | 'departmentTransfer' | 'ticketClosed';
export type NotificationChannel = 'sound' | 'toast';
export type NotificationScopeMode = 'ALL' | 'SELECTED';

export interface NotificationEventChannels {
  sound: boolean;
  toast: boolean;
}

export interface NotificationScope {
  mode: NotificationScopeMode;
  departmentIds: string[];
  /** `null` = "Todos los bots" (líneas con agente IA activo). */
  agentIds: (string | null)[];
}

export interface UserNotificationPreferences {
  version: 1;
  enabled: boolean;
  soundEnabled: boolean;
  toastEnabled: boolean;
  events: Record<NotificationEventKey, NotificationEventChannels>;
  scope: NotificationScope;
}

export const DEFAULT_NOTIFICATION_PREFERENCES: UserNotificationPreferences = {
  version: 1,
  enabled: true,
  soundEnabled: true,
  toastEnabled: true,
  events: {
    newMessage: { sound: true, toast: true },
    departmentTransfer: { sound: true, toast: true },
    ticketClosed: { sound: false, toast: true },
  },
  scope: {
    mode: 'ALL',
    departmentIds: [],
    agentIds: [],
  },
};

interface PerUserPreferences {
  local: UserNotificationPreferences;
  server: UserNotificationPreferences | null;
}

interface NotificationPreferencesState {
  byUserId: Record<string, PerUserPreferences>;
  currentUserId: string | null;
  status: 'idle' | 'loading' | 'saving' | 'error';
  error: string | null;
  isHydrated: boolean;

  preferences: () => UserNotificationPreferences;
  serverPreferences: () => UserNotificationPreferences | null;
  setCurrentUserId: (userId: string | null) => void;
  setEnabled: (enabled: boolean) => void;
  setSoundEnabled: (enabled: boolean) => void;
  setToastEnabled: (enabled: boolean) => void;
  setEventChannel: (
    event: NotificationEventKey,
    channel: NotificationChannel,
    value: boolean,
  ) => void;
  setDepartmentIds: (departmentIds: string[]) => void;
  setAgentIds: (agentIds: (string | null)[]) => void;
  resetToServer: () => void;
  load: () => Promise<void>;
  save: () => Promise<boolean>;
  startCrossTabSync: () => () => void;
}

const STORAGE_KEY = 'vc-notification-preferences-v2';
const SCOPE_SAVE_DEBOUNCE_MS = 400;
let scopeSaveTimer: ReturnType<typeof setTimeout> | undefined;

function deriveScopeMode(
  departmentIds: string[],
  agentIds: (string | null)[],
): NotificationScopeMode {
  return departmentIds.length > 0 || agentIds.length > 0 ? 'SELECTED' : 'ALL';
}

function currentUserId(): string | null {
  return authStorage.getUser()?.id ?? null;
}

function getOrCreateUser(state: NotificationPreferencesState, userId: string): PerUserPreferences {
  if (!state.byUserId[userId]) {
    state.byUserId[userId] = {
      local: { ...DEFAULT_NOTIFICATION_PREFERENCES },
      server: null,
    };
  }
  return state.byUserId[userId];
}

export const useNotificationPreferencesStore = create<NotificationPreferencesState>()(
  persist(
    (set, get) => ({
      byUserId: {},
      currentUserId: currentUserId(),
      status: 'idle',
      error: null,
      isHydrated: false,

      preferences: () => {
        const userId = get().currentUserId;
        if (!userId) return { ...DEFAULT_NOTIFICATION_PREFERENCES };
        return { ...(get().byUserId[userId]?.local ?? DEFAULT_NOTIFICATION_PREFERENCES) };
      },

      serverPreferences: () => {
        const userId = get().currentUserId;
        if (!userId) return null;
        return get().byUserId[userId]?.server ?? null;
      },

      setCurrentUserId: (userId) => {
        set((state) => {
          if (state.currentUserId === userId) return state;
          return { currentUserId: userId };
        });
      },

      setEnabled: (enabled) => {
        const userId = get().currentUserId;
        if (!userId) return;
        set((state) => {
          const user = getOrCreateUser(state, userId);
          return {
            byUserId: {
              ...state.byUserId,
              [userId]: { ...user, local: { ...user.local, enabled } },
            },
          };
        });
      },

      setSoundEnabled: (soundEnabled) => {
        const userId = get().currentUserId;
        if (!userId) return;
        set((state) => {
          const user = getOrCreateUser(state, userId);
          return {
            byUserId: {
              ...state.byUserId,
              [userId]: { ...user, local: { ...user.local, soundEnabled } },
            },
          };
        });
      },

      setToastEnabled: (toastEnabled) => {
        const userId = get().currentUserId;
        if (!userId) return;
        set((state) => {
          const user = getOrCreateUser(state, userId);
          return {
            byUserId: {
              ...state.byUserId,
              [userId]: { ...user, local: { ...user.local, toastEnabled } },
            },
          };
        });
      },

      setEventChannel: (event, channel, value) => {
        const userId = get().currentUserId;
        if (!userId) return;
        set((state) => {
          const user = getOrCreateUser(state, userId);
          return {
            byUserId: {
              ...state.byUserId,
              [userId]: {
                ...user,
                local: {
                  ...user.local,
                  events: {
                    ...user.local.events,
                    [event]: { ...user.local.events[event], [channel]: value },
                  },
                },
              },
            },
          };
        });
      },

      setDepartmentIds: (departmentIds) => {
        const userId = get().currentUserId;
        if (!userId) return;

        const nextIds = Array.from(new Set(departmentIds));
        set((state) => {
          const user = getOrCreateUser(state, userId);
          const scope = {
            mode: deriveScopeMode(nextIds, user.local.scope.agentIds),
            departmentIds: nextIds,
            agentIds: user.local.scope.agentIds,
          };
          return {
            byUserId: {
              ...state.byUserId,
              [userId]: {
                ...user,
                local: { ...user.local, scope },
              },
            },
          };
        });

        broadcastScopeChange(userId, nextIds, get().preferences().scope.agentIds);

        if (scopeSaveTimer) {
          clearTimeout(scopeSaveTimer);
        }
        scopeSaveTimer = setTimeout(() => {
          scopeSaveTimer = undefined;
          void get().save();
        }, SCOPE_SAVE_DEBOUNCE_MS);
      },

      setAgentIds: (agentIds) => {
        const userId = get().currentUserId;
        if (!userId) return;

        const nextIds = Array.from(new Set(agentIds));
        set((state) => {
          const user = getOrCreateUser(state, userId);
          const scope = {
            mode: deriveScopeMode(user.local.scope.departmentIds, nextIds),
            departmentIds: user.local.scope.departmentIds,
            agentIds: nextIds,
          };
          return {
            byUserId: {
              ...state.byUserId,
              [userId]: {
                ...user,
                local: { ...user.local, scope },
              },
            },
          };
        });

        broadcastScopeChange(userId, get().preferences().scope.departmentIds, nextIds);

        if (scopeSaveTimer) {
          clearTimeout(scopeSaveTimer);
        }
        scopeSaveTimer = setTimeout(() => {
          scopeSaveTimer = undefined;
          void get().save();
        }, SCOPE_SAVE_DEBOUNCE_MS);
      },

      resetToServer: () => {
        const userId = get().currentUserId;
        if (!userId) return;
        set((state) => {
          const user = state.byUserId[userId];
          if (!user || !user.server) return state;
          return {
            byUserId: {
              ...state.byUserId,
              [userId]: { ...user, local: { ...user.server } },
            },
          };
        });
      },

      load: async () => {
        const userId = currentUserId();
        set({ currentUserId: userId, status: 'loading', error: null });
        if (!userId) {
          set({ status: 'idle', isHydrated: true });
          return;
        }

        try {
          const res = await notificationPreferencesApi.get();
          if (!res.ok) {
            set({ status: 'error', error: res.message, isHydrated: true });
            return;
          }

          const prefs = res.data.preferences;
          set((state) => ({
            byUserId: {
              ...state.byUserId,
              [userId]: {
                local: { ...prefs },
                server: { ...prefs },
              },
            },
            status: 'idle',
            isHydrated: true,
            error: null,
          }));
        } catch {
          set({ status: 'error', error: 'Error cargando preferencias', isHydrated: true });
        }
      },

      save: async () => {
        const userId = get().currentUserId;
        if (!userId) return false;
        const prefs = get().preferences();
        set({ status: 'saving', error: null });

        try {
          const res = await notificationPreferencesApi.put(prefs);
          if (!res.ok) {
            set({ status: 'error', error: res.message });
            return false;
          }

          const saved = res.data.preferences;
          set((state) => ({
            byUserId: {
              ...state.byUserId,
              [userId]: {
                local: { ...saved },
                server: { ...saved },
              },
            },
            status: 'idle',
            error: null,
          }));
          return true;
        } catch {
          set({ status: 'error', error: 'Error guardando preferencias' });
          return false;
        }
      },

      startCrossTabSync: () => {
        return listenToScopeChanges((message) => {
          const userId = get().currentUserId;
          if (!userId || message.userId !== userId) return;

          set((state) => {
            const user = state.byUserId[userId];
            if (!user) return state;
            return {
              byUserId: {
                ...state.byUserId,
                [userId]: {
                  ...user,
                  local: {
                    ...user.local,
                    scope: {
                      mode: deriveScopeMode(message.departmentIds, message.agentIds),
                      departmentIds: message.departmentIds,
                      agentIds: message.agentIds,
                    },
                  },
                },
              },
            };
          });
        });
      },
    }),
    {
      name: STORAGE_KEY,
      version: 2,
      partialize: (state) => ({
        byUserId: state.byUserId,
        currentUserId: state.currentUserId,
      }),
      migrate: (persistedState, version) => {
        if (version >= 2) return persistedState as unknown as NotificationPreferencesState;
        const state = (persistedState ?? {}) as {
          byUserId?: Record<
            string,
            {
              local?: Partial<UserNotificationPreferences>;
              server?: Partial<UserNotificationPreferences> | null;
            }
          >;
          currentUserId?: string | null;
        };
        const byUserId: NotificationPreferencesState['byUserId'] = {};
        for (const [userId, user] of Object.entries(state.byUserId ?? {})) {
          const migrateScope = (prefs?: Partial<UserNotificationPreferences> | null) => ({
            ...DEFAULT_NOTIFICATION_PREFERENCES,
            ...prefs,
            scope: {
              mode: 'ALL',
              departmentIds: [],
              agentIds: [],
              ...prefs?.scope,
            },
          });
          const local = migrateScope(user?.local) as UserNotificationPreferences;
          const server = user?.server
            ? (migrateScope(user.server) as UserNotificationPreferences)
            : null;
          byUserId[userId] = { local, server };
        }
        return {
          byUserId,
          currentUserId: state.currentUserId ?? null,
        } as unknown as NotificationPreferencesState;
      },
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.isHydrated = true;
          state.currentUserId = currentUserId();
        }
      },
    },
  ),
);
