import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/shared/api-client';
import { useCustomerWindow } from '@/hooks/conversaciones/useCustomerWindow';
afterEach(() => {
  vi.useRealTimers();
});
describe('customer service window', () => {
  it('uses server time and expires while the conversation remains open', async () => {
    vi.useFakeTimers();
    vi.spyOn(apiClient, 'get')
      .mockResolvedValueOnce({
        ok: true,
        data: {
          isOpen: true,
          expiresAt: '2026-10-01T10:00:01Z',
          serverNow: '2026-10-01T10:00:00Z',
        },
      })
      .mockResolvedValue({
        ok: true,
        data: { isOpen: false, expiresAt: null, serverNow: '2026-10-01T10:00:01Z' },
      });
    const { result } = renderHook(() => useCustomerWindow('a', []));
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.isOpen).toBe(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1001);
    });
    expect(result.current.isOpen).toBe(false);
  });
  it('refreshes on inbound media and discards the previous conversation response', async () => {
    let finish!: (value: unknown) => void;
    const request = vi
      .spyOn(apiClient, 'get')
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve as (value: unknown) => void;
          }),
      )
      .mockResolvedValue({
        ok: true,
        data: { isOpen: false, expiresAt: null, serverNow: new Date().toISOString() },
      });
    const view = renderHook(({ id }) => useCustomerWindow(id, []), { initialProps: { id: 'a' } });
    view.rerender({ id: 'b' });
    await act(async () => {
      finish({
        ok: true,
        data: {
          isOpen: true,
          expiresAt: '2099-01-01T00:00:00Z',
          serverNow: '2098-12-31T23:59:59Z',
        },
      });
    });
    await waitFor(() => expect(view.result.current.loading).toBe(false));
    expect(view.result.current.isOpen).toBe(false);
    expect(request).toHaveBeenCalledTimes(2);
  });
});
