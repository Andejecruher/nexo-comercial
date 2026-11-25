import { RealtimeManager } from '@/lib/shared/realtime/realtime-manager';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RealtimeProvider } from '@/components/shared/providers/realtime-provider';

function createMockManager(): RealtimeManager {
  return {
    connect: vi.fn(),
    disconnect: vi.fn(),
    router: { register: vi.fn(), unregister: vi.fn(), dispatch: vi.fn() },
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    getConnectionStatus: vi.fn(() => 'disconnected'),
    onStatusChange: vi.fn(() => vi.fn()),
  } as unknown as RealtimeManager;
}

describe('RealtimeProvider', () => {
  it('calls connect on mount', () => {
    const manager = createMockManager();

    render(<RealtimeProvider manager={manager}>children</RealtimeProvider>);

    expect(manager.connect).toHaveBeenCalledTimes(1);
  });

  it('calls disconnect on unmount', () => {
    vi.useFakeTimers();
    const manager = createMockManager();

    try {
      const { unmount } = render(<RealtimeProvider manager={manager}>children</RealtimeProvider>);
      unmount();
      expect(manager.disconnect).not.toHaveBeenCalled();
      vi.runAllTimers();
      expect(manager.disconnect).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('renders children without connecting when no auth token exists', () => {
    localStorage.removeItem('vc_access_token');
    const manager = new RealtimeManager();

    const { getByText } = render(<RealtimeProvider manager={manager}>children</RealtimeProvider>);

    expect(getByText('children')).toBeInTheDocument();
    expect(manager.getSocket()).toBeUndefined();
  });
});
