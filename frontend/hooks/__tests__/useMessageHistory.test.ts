import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useMessageHistory } from '../useMessageHistory';
const message = (id: string) => ({
  id,
  createdAt: `2026-10-01T10:${id.padStart(2, '0')}:00Z`,
  body: id,
});
const page = (ids: string[], cursor?: string) => ({
  ok: true as const,
  data: { items: ids.map(message), meta: { hasNextPage: Boolean(cursor), nextCursor: cursor } },
});
describe('progressive message history', () => {
  it('deduplicates requests, merges pages and retains a realtime message during an older fetch', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(page(['20', '21'], '20'));
    const { result } = renderHook(() =>
      useMessageHistory<ReturnType<typeof message>>('conversation', fetch),
    );
    await act(async () => {
      await result.current.refreshHistory();
    });
    let finish!: (value: ReturnType<typeof page>) => void;
    fetch.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    act(() => {
      void result.current.loadOlder();
      void result.current.loadOlder();
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    act(() => {
      result.current.setMessages((current) => [...current, message('22')]);
    });
    await act(async () => {
      finish(page(['18', '19', '20']));
    });
    expect(result.current.messages.map((m) => m.id)).toEqual(['18', '19', '20', '21', '22']);
    expect(result.current.hasOlder).toBe(false);
  });
  it('ignores responses from a previous conversation and resets the cursor', async () => {
    let finish!: (value: ReturnType<typeof page>) => void;
    const fetch = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      )
      .mockResolvedValue(page(['25']));
    const view = renderHook(({ id }) => useMessageHistory<ReturnType<typeof message>>(id, fetch), {
      initialProps: { id: 'a' },
    });
    act(() => {
      void view.result.current.refreshHistory();
    });
    view.rerender({ id: 'b' });
    await act(async () => {
      await view.result.current.refreshHistory();
      finish(page(['1'], '1'));
    });
    await waitFor(() => expect(view.result.current.messages.map((m) => m.id)).toEqual(['25']));
    expect(view.result.current.hasOlder).toBe(false);
  });
  it('does not overwrite a status update that arrives during refresh', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(page(['20']));
    const { result } = renderHook(() => useMessageHistory<ReturnType<typeof message>>('a', fetch));
    await act(async () => {
      await result.current.refreshHistory();
    });
    let finish!: (value: ReturnType<typeof page>) => void;
    fetch.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    act(() => {
      void result.current.refreshHistory();
    });
    act(() =>
      result.current.setMessages((current) => current.map((m) => ({ ...m, body: 'read' }))),
    );
    await act(async () => {
      finish(page(['20']));
    });
    expect(result.current.messages[0].body).toBe('read');
  });
});
