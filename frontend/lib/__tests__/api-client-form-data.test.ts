import { apiClient } from '@/lib/api-client';
import { templatesApi } from '@/lib/templates-api';
import { authStorage } from '@/lib/auth-storage';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('apiClient FormData transport', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('transports a template sample as a File with auth and cancellation, not JSON', async () => {
    vi.spyOn(authStorage, 'getAccessToken').mockReturnValue('synthetic-token');
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ handle: '4::c2FtcGxl==' })));
    vi.stubGlobal('fetch', fetchMock);
    const selected = new File([new Uint8Array([0, 128, 255])], 'sample.png', { type: 'image/png' });
    const controller = new AbortController();
    await expect(
      templatesApi.uploadSample('line/id', selected, controller.signal),
    ).resolves.toEqual({ handle: '4::c2FtcGxl==' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/templates\/line%2Fid\/samples$/);
    expect(init.body.get('file')).toBe(selected);
    expect(init.headers.Authorization).toBe('Bearer synthetic-token');
    expect(init.headers).not.toHaveProperty('Content-Type');
    expect(init.signal).toBe(controller.signal);
  });

  it('keeps browser multipart boundaries while using the normal request path', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ upload: { id: 'upload-1' } }), { status: 201 }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const form = new FormData();
    form.append('front', new File(['synthetic'], 'front.png', { type: 'image/png' }));

    const response = await apiClient.post<{ upload: { id: string } }>('/ine-ocr/uploads', form);

    expect(response).toEqual({ ok: true, data: { upload: { id: 'upload-1' } } });
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(form);
    expect(fetchMock.mock.calls[0]?.[1]?.headers).not.toHaveProperty('Content-Type');
  });
});
