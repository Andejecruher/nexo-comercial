import { create } from 'zustand';

export type PresenceStatus = 'online' | 'offline';

type PresenceEntry = {
  status: PresenceStatus;
  expiresAt: number;
};

interface PresenceState {
  users: Record<string, PresenceEntry>;
  apply: (userId: string, status: PresenceStatus, ttlMs?: number) => void;
  isOnline: (userId: string | undefined) => boolean;
}

const DEFAULT_TTL_MS = 30_000;

export const usePresenceStore = create<PresenceState>((set, get) => ({
  users: {},

  apply: (userId, status, ttlMs = DEFAULT_TTL_MS) =>
    set((state) => ({
      users: {
        ...state.users,
        [userId]: {
          status,
          expiresAt: status === 'online' ? Date.now() + ttlMs : 0,
        },
      },
    })),

  isOnline: (userId) => {
    if (!userId) return false;
    const entry = get().users[userId];
    if (!entry || entry.status !== 'online') return false;
    return entry.expiresAt > Date.now();
  },
}));
