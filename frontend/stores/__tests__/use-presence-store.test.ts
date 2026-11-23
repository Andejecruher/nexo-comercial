import { describe, expect, it } from 'vitest';
import { usePresenceStore } from '../use-presence-store';

describe('usePresenceStore', () => {
  it('marks a user online until the TTL expires', () => {
    usePresenceStore.setState({ users: {} });
    usePresenceStore.getState().apply('user-1', 'online', 30_000);
    expect(usePresenceStore.getState().isOnline('user-1')).toBe(true);

    usePresenceStore.getState().apply('user-1', 'offline');
    expect(usePresenceStore.getState().isOnline('user-1')).toBe(false);
  });
});
