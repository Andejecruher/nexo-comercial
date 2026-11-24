import { beforeEach, describe, expect, it } from 'vitest';
import { useConnectionStore } from '@/store/shared/use-connection-store';

describe('useConnectionStore', () => {
  beforeEach(() => {
    useConnectionStore.setState({
      status: 'disconnected',
      reconnectAttempt: 0,
      lastConnectedAt: undefined,
    });
  });

  it('starts disconnected with zero reconnect attempts and no lastConnectedAt', () => {
    const state = useConnectionStore.getState();
    expect(state.status).toBe('disconnected');
    expect(state.reconnectAttempt).toBe(0);
    expect(state.lastConnectedAt).toBeUndefined();
  });

  it('setStatus updates status through connecting and connected', () => {
    const { setStatus } = useConnectionStore.getState();

    setStatus('connecting');
    expect(useConnectionStore.getState().status).toBe('connecting');

    setStatus('connected');
    const state = useConnectionStore.getState();
    expect(state.status).toBe('connected');
    expect(state.reconnectAttempt).toBe(0);
    expect(state.lastConnectedAt).toBeDefined();
  });

  it('incrementReconnect increments the counter and resetReconnect clears it', () => {
    const { incrementReconnect, resetReconnect } = useConnectionStore.getState();

    incrementReconnect();
    incrementReconnect();
    expect(useConnectionStore.getState().reconnectAttempt).toBe(2);

    resetReconnect();
    expect(useConnectionStore.getState().reconnectAttempt).toBe(0);
  });

  it('connecting does not reset reconnectAttempt or update lastConnectedAt', () => {
    useConnectionStore.setState({ reconnectAttempt: 3 });

    useConnectionStore.getState().setStatus('connecting');

    const state = useConnectionStore.getState();
    expect(state.status).toBe('connecting');
    expect(state.reconnectAttempt).toBe(3);
    expect(state.lastConnectedAt).toBeUndefined();
  });
});
