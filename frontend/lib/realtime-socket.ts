'use client';

import { type Socket } from 'socket.io-client';
import { globalRealtimeManager } from './realtime/global-manager';

const WS_ENABLED = process.env.NEXT_PUBLIC_WS_ENABLED !== 'false';

/**
 * @deprecated Use the global RealtimeProvider, useRealtimeManager(), and the
 * Zustand realtime stores instead. This function is kept for backward
 * compatibility during migration and delegates to the shared
 * RealtimeManager instance.
 */
export function getAdminSocket(): Socket | undefined {
  if (typeof window === 'undefined' || !WS_ENABLED) return undefined;

  globalRealtimeManager.connect();
  return globalRealtimeManager.getSocket();
}

export function isRealtimeEnabled(): boolean {
  return WS_ENABLED;
}
