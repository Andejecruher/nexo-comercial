import { act, renderHook, waitFor } from '@testing-library/react';
import { ReadableStream } from 'node:stream/web';
import { TextEncoder, TextDecoder } from 'node:util';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useTemplateUpdates } from '@/hooks/plantillas/useTemplateUpdates';
vi.mock('@/lib/shared/auth-storage', () => ({
  authStorage: { getAccessToken: () => 'test-token' },
}));
vi.mock('@/lib/shared/api-client', () => ({ tryRefreshToken: vi.fn().mockResolvedValue(false) }));
const event = {
  id: '45',
  waba_id: '100',
  message_template_id: '1',
  message_template_name: 'saludo',
  event: 'APPROVED',
  occurred_at: '2026-10-13T00:00:00Z',
};
const frame = new TextEncoder().encode(
  `event: template_status_changed\ndata: ${JSON.stringify(event)}\n\n`,
);
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe('useTemplateUpdates', () => {
  it('authenticates with a header, aborts old lines and cleans up on unmount', async () => {
    const streams: Array<{ enqueue: (chunk: Uint8Array) => void }> = [];
    const signals: AbortSignal[] = [];
    vi.stubGlobal('TextDecoder', TextDecoder);
    const fetchMock = vi.fn((_url: string, options: RequestInit) => {
      signals.push(options.signal!);
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          streams.push(controller);
          options.signal!.addEventListener('abort', () => controller.close(), { once: true });
        },
      });
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'text/event-stream' }),
        body,
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    const update = vi.fn();
    const { rerender, unmount } = renderHook(({ line }) => useTemplateUpdates(line, '40', update), {
      initialProps: { line: 'line-a' },
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await act(async () => streams[0].enqueue(frame));
    expect(update).toHaveBeenCalledWith(event);
    expect(fetchMock.mock.calls[0][1].headers).toMatchObject({
      Authorization: 'Bearer test-token',
    });
    expect(fetchMock.mock.calls[0][0]).not.toContain('test-token');
    rerender({ line: 'line-b' });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(signals[0].aborted).toBe(true);
    unmount();
    expect(signals[1].aborted).toBe(true);
  });
  it('resumes from the last event after disconnect without fetching the list', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('TextDecoder', TextDecoder);
    const fetchMock = vi.fn((_url: string, _options: RequestInit) =>
      Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'text/event-stream' }),
        body: new ReadableStream<Uint8Array>({
          start(c) {
            c.enqueue(frame);
            c.close();
          },
        }),
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const update = vi.fn();
    const { unmount } = renderHook(() => useTemplateUpdates('line-a', '40', update));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(update).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(fetchMock.mock.calls[1]?.[0]).toContain('cursor=45');
    expect(
      fetchMock.mock.calls.every((call) => String(call[0]).includes('/templates/stream?')),
    ).toBe(true);
    unmount();
  });
});
