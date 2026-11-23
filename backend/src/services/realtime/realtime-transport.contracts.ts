import { RealtimeDurableEvent, RealtimeEphemeralEvent } from './realtime-event.contracts';

export type RealtimeTransportEvent = RealtimeDurableEvent | RealtimeEphemeralEvent;

/**
 * Transport contract shared by the worker-side publisher (Pub/Sub topic) and
 * any fake transport used in tests. Delivery to the API process happens via a
 * Google Pub/Sub push subscription, so transports only publish; there is no
 * in-process `subscribe` in the Redis-free architecture.
 */
export interface RealtimeTransport {
  publish(event: RealtimeTransportEvent): Promise<void>;
  dispose(): Promise<void>;
}