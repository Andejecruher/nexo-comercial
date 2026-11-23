'use client';

import { globalRealtimeManager } from '@/lib/realtime/global-manager';
import type { RealtimeManager } from '@/lib/realtime/realtime-manager';
import { createContext, useContext, useEffect, useRef, useState } from 'react';

interface RealtimeContextValue {
  manager: RealtimeManager | undefined;
}

const RealtimeContext = createContext<RealtimeContextValue>({ manager: undefined });

interface RealtimeProviderProps {
  children: React.ReactNode;
  manager?: RealtimeManager;
}

export function RealtimeProvider({ children, manager }: RealtimeProviderProps) {
  const [managerState] = useState(() => manager ?? globalRealtimeManager);
  const disconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (disconnectTimerRef.current !== null) {
      clearTimeout(disconnectTimerRef.current);
      disconnectTimerRef.current = null;
    }

    managerState.connect();

    return () => {
      // Strict Mode unmounts the effect before the handshake finishes.
      // An immediate remount cancels this timer; a real unmount still disconnects.
      disconnectTimerRef.current = setTimeout(() => {
        disconnectTimerRef.current = null;
        managerState.disconnect();
      }, 0);
    };
  }, [managerState]);

  return (
    <RealtimeContext.Provider value={{ manager: managerState }}>
      {children}
    </RealtimeContext.Provider>
  );
}

export function useRealtimeManager(): RealtimeManager | undefined {
  return useContext(RealtimeContext).manager;
}
