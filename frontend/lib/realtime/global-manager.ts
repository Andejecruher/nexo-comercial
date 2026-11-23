import { RealtimeManager } from './realtime-manager';

/**
 * Singleton RealtimeManager used by the provider and by the deprecated
 * getAdminSocket() fallback. Keeping a single instance guarantees only one
 * Socket.IO connection is open at a time.
 */
export const globalRealtimeManager = new RealtimeManager();
