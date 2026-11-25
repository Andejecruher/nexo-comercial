export interface ScopeBroadcastMessage {
  userId: string;
  departmentIds: string[];
  /** `null` = "Todos los bots" (líneas con agente IA activo). */
  agentIds: (string | null)[];
  updatedAt: number;
}

const CHANNEL_NAME = 'vc-notification-scope';
const STORAGE_KEY = 'vc:notification-scope-broadcast';

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

export function broadcastScopeChange(
  userId: string,
  departmentIds: string[],
  agentIds: (string | null)[] = [],
): void {
  if (!isBrowser()) return;
  const message: ScopeBroadcastMessage = { userId, departmentIds, agentIds, updatedAt: Date.now() };

  try {
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.postMessage(message);
    channel.close();
  } catch {
    // BroadcastChannel no disponible; el fallback de localStorage actuará.
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(message));
  } catch {
    // private mode / quota.
  }
}

export function listenToScopeChanges(
  callback: (message: ScopeBroadcastMessage) => void,
): () => void {
  if (!isBrowser()) return () => {};

  let channel: BroadcastChannel | undefined;
  const handleStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY || !event.newValue) return;
    try {
      const message = JSON.parse(event.newValue) as ScopeBroadcastMessage;
      callback(message);
    } catch {
      // ignorar payload corrupto
    }
  };

  try {
    channel = new BroadcastChannel(CHANNEL_NAME);
    channel.onmessage = (event) => callback(event.data as ScopeBroadcastMessage);
  } catch {
    channel = undefined;
  }

  window.addEventListener('storage', handleStorage);

  return () => {
    if (channel) {
      channel.onmessage = null;
      channel.close();
    }
    window.removeEventListener('storage', handleStorage);
  };
}
