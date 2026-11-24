import { beforeEach, describe, expect, it } from 'vitest';
import { useSubscriptionStore } from '@/store/shared/use-subscription-store';

describe('useSubscriptionStore', () => {
  beforeEach(() => {
    useSubscriptionStore.getState().clearRooms();
  });

  it('starts with no active rooms', () => {
    expect(useSubscriptionStore.getState().getActiveRooms()).toEqual([]);
  });

  it('subscribe adds a room and getActiveRooms returns it', () => {
    useSubscriptionStore.getState().subscribe('conv-123');

    const rooms = useSubscriptionStore.getState().getActiveRooms();
    expect(rooms).toContain('conv-123');
    expect(rooms).toHaveLength(1);
  });

  it('keeps a shared room until its last subscriber releases it', () => {
    const { subscribe } = useSubscriptionStore.getState();

    subscribe('conv-123');
    subscribe('conv-123');

    expect(useSubscriptionStore.getState().getActiveRooms()).toEqual(['conv-123']);
    useSubscriptionStore.getState().unsubscribe('conv-123');
    expect(useSubscriptionStore.getState().getActiveRooms()).toEqual(['conv-123']);
    useSubscriptionStore.getState().unsubscribe('conv-123');
    expect(useSubscriptionStore.getState().getActiveRooms()).toEqual([]);
  });

  it('unsubscribe removes a room but leaves other rooms intact', () => {
    const { subscribe, unsubscribe } = useSubscriptionStore.getState();

    subscribe('conv-123');
    subscribe('conv-456');
    unsubscribe('conv-123');

    expect(useSubscriptionStore.getState().getActiveRooms()).toEqual(['conv-456']);
  });

  it('unsubscribe is safe for unknown rooms', () => {
    expect(() => useSubscriptionStore.getState().unsubscribe('conv-unknown')).not.toThrow();
    expect(useSubscriptionStore.getState().getActiveRooms()).toEqual([]);
  });
});
