import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';

import type * as ExportsApi from '@/lib/ciudadanos/exports-api';
import {
  getExportDownloadToken,
  getExportJob,
  triggerDownload,
} from '@/lib/ciudadanos/exports-api';
import { useExportJob } from '@/hooks/ciudadanos/useExportJob';

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/lib/ciudadanos/exports-api', async (importOriginal) => {
  const actual = await importOriginal<typeof ExportsApi>();
  return {
    ...actual,
    getExportsFeatureFlag: vi.fn(async () => ({ ok: true, data: { enabled: true } })),
    createExportJob: vi.fn(async () => ({ ok: true, data: { jobId: 'job-1', status: 'queued' } })),
    getExportJob: vi.fn(),
    getExportDownloadToken: vi.fn(async () => ({ ok: true, data: { token: 'tok-1' } })),
    triggerDownload: vi.fn(),
  };
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  (getExportJob as ReturnType<typeof vi.fn>).mockResolvedValue({
    ok: true,
    data: { status: 'queued' },
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useExportJob download flow', () => {
  it('triggers the download once the job is ready and shows a success toast', async () => {
    const polls = [
      { ok: true, data: { status: 'queued' } },
      { ok: true, data: { status: 'ready' } },
    ];
    (getExportJob as ReturnType<typeof vi.fn>).mockResolvedValueOnce(polls[0]);

    const { result } = renderHook(() => useExportJob());
    await act(async () => {
      await result.current.start('citizens', { q: 'x' });
    });

    (getExportJob as ReturnType<typeof vi.fn>).mockResolvedValueOnce(polls[1]);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });

    expect(triggerDownload).toHaveBeenCalledWith('job-1', 'tok-1');
    expect(toast.success).toHaveBeenCalledWith(
      'Exportación completada. La descarga comenzó en tu navegador.',
    );
    expect(result.current.status).toBe('ready');
    expect(getExportJob).toHaveBeenCalledTimes(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(getExportJob).toHaveBeenCalledTimes(2);
  });

  it('REGression: still downloads when the token resolves after React flushes the status transition', async () => {
    let releaseToken!: (value: { ok: true; data: { token: string } }) => void;
    const tokenPromise = new Promise<{ ok: true; data: { token: string } }>((resolve) => {
      releaseToken = resolve;
    });
    (getExportJob as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      data: { status: 'ready' },
    });
    (getExportDownloadToken as ReturnType<typeof vi.fn>).mockReturnValueOnce(tokenPromise);

    const { result } = renderHook(() => useExportJob());
    await act(async () => {
      await result.current.start('citizens', { q: 'x' });
    });
    // El poll ve `ready` e inicia la solicitud de token. El token (un POST
    // real de red) tarda; mientras tanto React flushea el re-render y el
    // cleanup del efecto. Con el código viejo esto ponía `active=false` y
    // mataba la descarga antes de `triggerDownload`.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    await act(async () => {
      releaseToken({ ok: true, data: { token: 'tok-1' } });
    });

    expect(triggerDownload).toHaveBeenCalledWith('job-1', 'tok-1');
    expect(result.current.status).toBe('ready');
  });

  it('fails without triggering a download when the job poll reports an error', async () => {
    (getExportJob as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      message: 'Export failed',
    });

    const { result } = renderHook(() => useExportJob());
    await act(async () => {
      await result.current.start('citizens', { q: 'x' });
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(result.current.status).toBe('failed');
    expect(triggerDownload).not.toHaveBeenCalled();
  });

  it('fails without triggering a download when the token cannot be issued', async () => {
    (getExportJob as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      data: { status: 'ready' },
    });
    (getExportDownloadToken as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      message: 'Token refused',
    });

    const { result } = renderHook(() => useExportJob());
    await act(async () => {
      await result.current.start('citizens', { q: 'x' });
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(result.current.status).toBe('failed');
    expect(triggerDownload).not.toHaveBeenCalled();
  });

  it('stops polling once a poll reports a terminal failure', async () => {
    (getExportJob as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      message: 'Export failed',
    });

    const { result } = renderHook(() => useExportJob());
    await act(async () => {
      await result.current.start('citizens', { q: 'x' });
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(result.current.status).toBe('failed');
    expect(getExportJob).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(getExportJob).toHaveBeenCalledTimes(1);
    expect(triggerDownload).not.toHaveBeenCalled();
  });

  it('stops polling when a poll returns the terminal failed status', async () => {
    (getExportJob as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      data: { status: 'failed', errorCode: 'DRIVE_QUOTA' },
    });

    const { result } = renderHook(() => useExportJob());
    await act(async () => {
      await result.current.start('citizens', { q: 'x' });
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(getExportJob).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('failed');
    expect(triggerDownload).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(getExportJob).toHaveBeenCalledTimes(1);
  });

  it('triggers the token download without fetching any file blob', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    (getExportJob as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      data: { status: 'ready' },
    });

    const { result } = renderHook(() => useExportJob());
    await act(async () => {
      await result.current.start('citizens', { q: 'x' });
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(triggerDownload).toHaveBeenCalledWith('job-1', 'tok-1');
    expect(result.current.status).toBe('ready');
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
