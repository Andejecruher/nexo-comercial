import { create } from 'zustand';

interface SubscriptionState {
  activeRooms: Set<string>;
  roomReferences: Map<string, number>;
  subscribe: (conversationId: string) => void;
  unsubscribe: (conversationId: string) => void;
  clearRooms: () => void;
  getActiveRooms: () => string[];
}

export const useSubscriptionStore = create<SubscriptionState>((set, get) => ({
  activeRooms: new Set(),
  roomReferences: new Map(),

  subscribe: (conversationId) =>
    set((state) => {
      const refs = new Map(state.roomReferences);
      refs.set(conversationId, (refs.get(conversationId) ?? 0) + 1);
      return { roomReferences: refs, activeRooms: new Set(refs.keys()) };
    }),
  unsubscribe: (conversationId) =>
    set((state) => {
      const refs = new Map(state.roomReferences);
      const count = (refs.get(conversationId) ?? 1) - 1;
      if (count > 0) refs.set(conversationId, count);
      else refs.delete(conversationId);
      return { roomReferences: refs, activeRooms: new Set(refs.keys()) };
    }),
  clearRooms: () => set({ activeRooms: new Set(), roomReferences: new Map() }),

  getActiveRooms: () => Array.from(get().activeRooms),
}));
