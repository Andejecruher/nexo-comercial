import { TemplateManagementService } from '../../services/templates/template-management.service';
import { WhatsAppLineConfigResolver } from '../../services/whatsapp/whatsapp-line-config.resolver';
import {
  buildTemplatePayload,
  templateInputSchema,
} from '../../services/templates/template.schemas';

const file = {
  filename: 'sample.png',
  mimeType: 'image/png',
  buffer: Buffer.from('89504e470d0a1a0a', 'hex'),
};
const reply = (data: unknown, status = 200) => ({
  ok: status < 400,
  status,
  json: async () => data,
});
describe('Template sample upload boundary', () => {
  const fetchMock = jest.fn();
  const service = new TemplateManagementService({} as never);
  beforeEach(() => {
    jest.spyOn(WhatsAppLineConfigResolver.prototype, 'resolve').mockResolvedValue({
      businessAccountId: '998877',
      appId: '445566',
      accessToken: 'private-token',
    } as never);
    jest.spyOn(global, 'fetch').mockImplementation(fetchMock);
    fetchMock.mockReset();
  });
  afterEach(() => jest.restoreAllMocks());

  it.each([
    'upload:abc_123==',
    'upload:ab+c/def==',
    'upload:abc_123==?sig=AR_test-123',
    'upload:ab+C/D==?sig=Z+Y/==',
  ])('addresses session %s without changing its token or origin', async (id) => {
    fetchMock
      .mockResolvedValueOnce(reply({ id }))
      .mockResolvedValueOnce(reply({ h: '4::c2FtcGxl==' }));
    await expect(service.uploadSample('line', file)).resolves.toEqual({
      handle: '4::c2FtcGxl==',
    });
    const url = new URL(fetchMock.mock.calls[1][0]);
    expect(url.origin).toBe('https://graph.facebook.com');
    expect(decodeURIComponent(url.pathname.split('/').at(-1)!)).toBe(id.split('?')[0]);
    expect(url.searchParams.get('sig')).toBe(id.includes('?') ? id.split('?sig=')[1] : null);
    expect(fetchMock.mock.calls[1][1].body).toEqual(new Uint8Array(file.buffer));
  });

  it.each([
    'https://evil.test',
    'upload:../me',
    'upload:x?access_token=bad',
    'upload:x?sig=a&other=b',
    'upload:x#fragment',
    'upload:x\r\nHeader: bad',
    'upload:abc\n',
    'upload:%2e%2e',
    'upload:',
    null,
    'upload:' + 'a'.repeat(4096),
  ])('rejects unexpected session IDs before binary transfer: %j', async (id) => {
    fetchMock.mockResolvedValueOnce(reply({ id }));
    await expect(service.uploadSample('line', file)).rejects.toThrow('sesión de carga');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['image/jpeg', Buffer.from('ffd8ffe000104a464946', 'hex')],
    ['image/png', file.buffer],
    ['video/mp4', Buffer.from('000000186674797069736f6d', 'hex')],
    ['application/pdf', Buffer.from('%PDF-1.7\nexample')],
  ])('uploads %s bytes and builds the final HEADER sample', async (mimeType, buffer) => {
    fetchMock
      .mockResolvedValueOnce(reply({ id: 'upload:abc' }))
      .mockResolvedValueOnce(reply({ h: '4::c2FtcGxl==' }));
    const { handle } = await service.uploadSample('line', { ...file, mimeType, buffer });
    const query = new URL(fetchMock.mock.calls[0][0]);
    expect(query.pathname).toMatch(/\/445566\/uploads$/);
    expect(query.searchParams.get('file_length')).toBe(String(buffer.length));
    expect(query.searchParams.get('file_type')).toBe(mimeType);
    expect(fetchMock.mock.calls[1][1]).toMatchObject({
      body: new Uint8Array(buffer),
      headers: { Authorization: 'OAuth private-token', file_offset: '0' },
    });
    const headerType = mimeType.startsWith('image/')
      ? 'IMAGE'
      : mimeType === 'video/mp4'
        ? 'VIDEO'
        : 'DOCUMENT';
    expect(
      buildTemplatePayload(
        templateInputSchema.parse({
          name: 'sample',
          category: 'UTILITY',
          language: 'es_MX',
          parameterFormat: 'POSITIONAL',
          headerType,
          mediaHandle: handle,
          body: 'Hello',
          examples: {},
          buttons: [],
        }),
      ).components[0],
    ).toEqual({ type: 'HEADER', format: headerType, example: { header_handle: [handle] } });
  });

  it.each([
    { ...file, mimeType: 'text/plain' },
    { ...file, mimeType: 'image/jpeg' },
    { ...file, buffer: Buffer.alloc(0) },
    { ...file, buffer: Buffer.from('corrupt') },
    { ...file, buffer: Buffer.alloc(5 * 1024 * 1024 + 1) },
  ])('rejects invalid MIME, corrupt/empty bytes or excessive size', async (invalid) => {
    await expect(service.uploadSample('line', invalid)).rejects.toThrow('Muestra inválida');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([400, 401, 403, 413, 429, 500, 503])(
    'diagnoses upstream HTTP %i at both upload stages without leaking secrets',
    async (status) => {
      const warn = jest.spyOn(console, 'warn').mockImplementation();
      for (const stage of ['session', 'binary']) {
        fetchMock.mockReset();
        if (stage === 'binary') fetchMock.mockResolvedValueOnce(reply({ id: 'upload:abc' }));
        fetchMock.mockResolvedValueOnce(
          reply(
            {
              error: {
                code: 190,
                error_subcode: 463,
                fbtrace_id: 'trace-safe',
                message: 'private-token',
                error_user_msg: 'private-token',
              },
            },
            status,
          ),
        );
        await expect(service.uploadSample('line', file)).rejects.toMatchObject({
          statusCode: status === 429 ? 429 : 502,
          code: 'META_ERROR',
        });
      }
      const logs = warn.mock.calls.flat().join('\n');
      expect(logs).toContain(`"metaStatus":${status}`);
      expect(logs).toContain('trace-safe');
      expect(logs).not.toContain('private-token');
    },
  );

  it('normalizes non-JSON session errors to a controlled upstream error', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: async () => {
        throw new SyntaxError('HTML');
      },
    });
    await expect(service.uploadSample('line', file)).rejects.toMatchObject({
      statusCode: 502,
      code: 'META_ERROR',
    });
  });

  it('stops after a cancelled session and never starts the binary upload', async () => {
    const controller = new AbortController();
    fetchMock.mockImplementationOnce(async () => {
      controller.abort();
      return reply({ id: 'upload:abc' });
    });
    await expect(service.uploadSample('line', file, controller.signal)).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('propagates cancellation to an in-flight binary request', async () => {
    const controller = new AbortController();
    fetchMock.mockResolvedValueOnce(reply({ id: 'upload:abc' })).mockImplementationOnce(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
          controller.abort();
        }),
    );
    await expect(service.uploadSample('line', file, controller.signal)).rejects.toThrow();
    expect(fetchMock.mock.calls[1][1].signal.aborted).toBe(true);
  });
});
