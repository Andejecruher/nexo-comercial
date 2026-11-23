import type { ConnectionStatus } from '@/lib/realtime/types';
import { create } from 'zustand';

interface ConnectionState {
  status: ConnectionStatus;
  reconnectAttempt: number;
  lastConnectedAt: string | undefined;
  setStatus: (status: ConnectionStatus) => void;
  incrementReconnect: () => void;
  resetReconnect: () => void;
}

export const useConnectionStore = create<ConnectionState>((set) => ({
  status: 'disconnected',
  reconnectAttempt: 0,
  lastConnectedAt: undefined,

  setStatus: (status) =>
    set(() =>
      status === 'connected'
        ? {
            status,
            reconnectAttempt: 0,
            lastConnectedAt: new Date().toISOString(),
          }
        : { status },
    ),

  incrementReconnect: () => set((state) => ({ reconnectAttempt: state.reconnectAttempt + 1 })),

  resetReconnect: () => set({ reconnectAttempt: 0 }),
}));
