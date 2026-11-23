import {
  templateInputSchema,
  buildTemplatePayload,
} from '../../services/templates/template.schemas';
import {
  parseTemplateStatusUpdates,
  TemplateStatusService,
} from '../../services/templates/template-status.service';
import { TemplateManagementService } from '../../services/templates/template-management.service';
import { WhatsAppLineConfigResolver } from '../../services/whatsapp/whatsapp-line-config.resolver';
const base = {
  name: 'saludo',
  category: 'UTILITY',
  language: 'es_MX',
  parameterFormat: 'POSITIONAL',
  headerType: 'NONE',
  body: 'Hola {{1}}, tu folio es {{2}}.',
  examples: { '1': 'Ana', '2': '123' },
  buttons: [],
};
const validPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const payload = (id = '998877') => ({
  object: 'whatsapp_business_account',
  entry: [
    {
      id,
      time: 1720000000,
      changes: [
        { field: 'messages', value: {} },
        {
          field: 'message_template_status_update',
          value: {
            message_template_id: 456789,
            message_template_name: 'saludo',
            event: 'REJECTED',
            reason: 'INVALID_FORMAT',
          },
        },
      ],
    },
  ],
});
describe('Template payloads', () => {
  it('builds positional samples and strips untrusted input fields', () => {
    const data = templateInputSchema.parse({ ...base, accessToken: 'not-used' });
    expect(buildTemplatePayload(data)).toEqual({
      name: 'saludo',
      category: 'UTILITY',
      language: 'es_MX',
      parameter_format: 'POSITIONAL',
      components: [{ type: 'BODY', text: base.body, example: { body_text: [['Ana', '123']] } }],
    });
    expect(data).not.toHaveProperty('accessToken');
  });
  it('builds named variables and media handles', () => {
    const v = templateInputSchema.parse({
      ...base,
      parameterFormat: 'NAMED',
      body: 'Hola {{nombre}}',
      examples: { nombre: 'Ana' },
      headerType: 'IMAGE',
      mediaHandle: '4:upload-handle',
    });
    expect(buildTemplatePayload(v).components).toEqual([
      { type: 'HEADER', format: 'IMAGE', example: { header_handle: ['4:upload-handle'] } },
      {
        type: 'BODY',
        text: 'Hola {{nombre}}',
        example: { body_text_named_params: [{ param_name: 'nombre', example: 'Ana' }] },
      },
    ]);
  });
  it('sends WhatsApp syntax as plain text and only current named samples', () => {
    const body = 'Hola *{{ciudadano}}* 👩🏽‍💻\n1. Revisar\n> _Importante_';
    const input = templateInputSchema.parse({
      ...base,
      parameterFormat: 'NAMED',
      body,
      examples: { ciudadano: 'María', nombre: 'obsoleto' },
    });
    expect(buildTemplatePayload(input).components).toContainEqual({
      type: 'BODY',
      text: body,
      example: { body_text_named_params: [{ param_name: 'ciudadano', example: 'María' }] },
    });
    expect(
      templateInputSchema.safeParse({
        ...base,
        body: '<u>Hola</u> {{1}}',
        examples: { '1': 'Ana' },
      }).success,
    ).toBe(false);
    expect(
      templateInputSchema.safeParse({
        ...base,
        body: 'Hola <img src=x> {{1}}',
        examples: { '1': 'Ana' },
      }).success,
    ).toBe(false);
  });
  it.each(['upload:123', 'https://storage.example/sample.png?sig=secret', '4:sample?sig=secret'])(
    'rejects an unsafe media handle %s',
    (mediaHandle) => {
      expect(
        templateInputSchema.safeParse({ ...base, headerType: 'IMAGE', mediaHandle }).success,
      ).toBe(false);
    },
  );
  it.each([
    { body: 'Hola {{2}}' },
    { body: 'Hola {{nombre}}' },
    { examples: {} },
    { name: 'Hola Mundo' },
    { body: '' },
    { headerType: 'VIDEO' },
    { body: 'Hola {{1}' },
    { buttons: [{ type: 'URL', text: 'Abrir', url: 'javascript:alert(1)' }] },
  ])('rejects invalid input %j', (patch) => {
    expect(templateInputSchema.safeParse({ ...base, ...patch }).success).toBe(false);
  });
  it('builds authentication components without free-form text', () => {
    const v = templateInputSchema.parse({
      ...base,
      category: 'AUTHENTICATION',
      body: '',
      examples: {},
    });
    expect(buildTemplatePayload(v).components).toEqual([
      { type: 'BODY', add_security_recommendation: true },
      { type: 'FOOTER', code_expiration_minutes: 10 },
      { type: 'BUTTONS', buttons: [{ type: 'OTP', otp_type: 'COPY_CODE', text: 'Copiar código' }] },
    ]);
  });
});
describe('Durable status events', () => {
  it('extracts all WABAs, normalizes IDs and retains reason', () => {
    const events = parseTemplateStatusUpdates({
      ...payload(),
      entry: [...payload().entry, ...payload('887766').entry],
    });
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      templateId: '456789',
      wabaId: '998877',
      status: 'REJECTED',
      reason: 'INVALID_FORMAT',
    });
    expect(events[0].dedupeKey).toBe(parseTemplateStatusUpdates(payload())[0].dedupeKey);
    expect(events[1].wabaId).toBe('887766');
  });
  it('serializes writes, deduplicates and propagates persistence failures', async () => {
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(0),
      templateStatusEvent: { upsert: jest.fn().mockResolvedValue({}) },
    };
    const prisma = { $transaction: jest.fn((fn) => fn(tx)) };
    const service = new TemplateStatusService(prisma as never);
    await service.ingest(payload());
    expect(tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.templateStatusEvent.upsert.mock.invocationCallOrder[0],
    );
    expect(tx.templateStatusEvent.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: {}, where: { dedupeKey: expect.any(String) } }),
    );
    tx.templateStatusEvent.upsert.mockRejectedValueOnce(new Error('DB down'));
    await expect(service.ingest(payload())).rejects.toThrow('DB down');
  });
  it('scopes SSE replay to the selected WABA and cursor', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    await new TemplateStatusService({ templateStatusEvent: { findMany } } as never).since(
      '998877',
      '42',
    );
    expect(findMany).toHaveBeenCalledWith({
      where: { wabaId: '998877', id: { gt: 42n } },
      orderBy: { id: 'asc' },
      take: 100,
    });
  });
});
describe('Meta management', () => {
  const mockFetch = jest.fn();
  beforeEach(() => {
    jest
      .spyOn(WhatsAppLineConfigResolver.prototype, 'resolve')
      .mockResolvedValue({ businessAccountId: '998877', accessToken: 'server-only' } as never);
    global.fetch = mockFetch;
    mockFetch.mockReset();
  });
  afterEach(() => jest.restoreAllMocks());
  it('uses Bearer auth and returns safe pagination cursors, not token-bearing URLs', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ id: '123' }],
        paging: {
          cursors: { after: 'cursor-2' },
          next: 'https://graph.facebook.com/?access_token=secret',
        },
      }),
    });
    const result = await new TemplateManagementService({
      managedTemplate: { findMany: async () => [] },
    } as never).list('line-1');
    expect(mockFetch.mock.calls[0][1].headers.Authorization).toBe('Bearer server-only');
    expect(result).toEqual({
      data: [{ id: '123', createdAt: undefined, updatedAt: undefined }],
      nextCursor: 'cursor-2',
    });
  });
  it('forwards a name filter and a bounded page without scanning other pages', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ data: [] }) });
    await new TemplateManagementService({
      managedTemplate: { findMany: async () => [] },
    } as never).list('line-1', 'next-page', { name: 'aviso', limit: 25 });
    const query = new URL(mockFetch.mock.calls[0][0]).searchParams;
    expect(query.get('name')).toBe('aviso');
    expect(query.get('limit')).toBe('25');
    expect(query.get('after')).toBe('next-page');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
  it('does not edit a template outside the selected WABA', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ data: [] }) });
    await expect(
      new TemplateManagementService({
        managedTemplate: { findMany: async () => [] },
      } as never).edit('line-1', '999', templateInputSchema.parse(base)),
    ).rejects.toThrow('no pertenece');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
  it('deletes by encoded name under the resolved WABA', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ success: true }) });
    await new TemplateManagementService({} as never).remove('line-1', 'saludo');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/998877/message_templates?name=saludo'),
      expect.objectContaining({ method: 'DELETE' }),
    );
  });
  it('uploads a sample through the resumable API and returns its handle', async () => {
    jest.spyOn(WhatsAppLineConfigResolver.prototype, 'resolve').mockResolvedValue({
      businessAccountId: '998877',
      appId: '445566',
      accessToken: 'server-only',
    } as never);
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'upload:123' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ h: '4::c2FtcGxl==' }) });
    const result = await new TemplateManagementService({} as never).uploadSample('line-1', {
      filename: 'sample.png',
      mimeType: 'image/png',
      buffer: validPng,
    });
    expect(result).toEqual({ handle: '4::c2FtcGxl==' });
    expect(mockFetch.mock.calls[0][0]).toContain('/445566/uploads?');
    expect(mockFetch.mock.calls[1][1].headers).toMatchObject({
      Authorization: 'OAuth server-only',
      file_offset: '0',
    });
  });
  it.each(['upload:123', 'https://storage.example/sample.png?sig=secret', '4:sample?sig=secret'])(
    'rejects an unsafe handle returned by Meta: %s',
    async (h) => {
      jest.spyOn(WhatsAppLineConfigResolver.prototype, 'resolve').mockResolvedValue({
        businessAccountId: '998877',
        appId: '445566',
        accessToken: 'server-only',
      } as never);
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'upload:123' }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ h }) });

      await expect(
        new TemplateManagementService({} as never).uploadSample('line-1', {
          filename: 'sample.png',
          mimeType: 'image/png',
          buffer: validPng,
        }),
      ).rejects.toThrow('handle de muestra inválido');
    },
  );
  it('rejects a file whose bytes do not match its declared MIME type before contacting Meta', async () => {
    jest.spyOn(WhatsAppLineConfigResolver.prototype, 'resolve').mockResolvedValue({
      businessAccountId: '998877',
      appId: '445566',
      accessToken: 'server-only',
    } as never);

    await expect(
      new TemplateManagementService({} as never).uploadSample('line-1', {
        filename: 'sample.png',
        mimeType: 'image/png',
        buffer: Buffer.from('not-a-png'),
      }),
    ).rejects.toThrow('Muestra inválida');
    expect(mockFetch).not.toHaveBeenCalled();
  });
  it('logs an invalid Meta handle without exposing it', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation();
    jest.spyOn(WhatsAppLineConfigResolver.prototype, 'resolve').mockResolvedValue({
      businessAccountId: '998877',
      appId: '445566',
      accessToken: 'server-only',
    } as never);
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'upload:123' }) })
      .mockResolvedValueOnce({
        ok: true,
        status: 400,
        json: async () => ({ h: '4:sample?sig=secret' }),
      });

    await expect(
      new TemplateManagementService({} as never).uploadSample('line-1', {
        filename: 'sample.png',
        mimeType: 'image/png',
        buffer: validPng,
      }),
    ).rejects.toThrow('handle de muestra inválido');

    const logs = warn.mock.calls.flat().join('\n');
    expect(logs).toContain('meta_template_sample.invalid_handle');
    expect(logs).not.toContain('sig=secret');
  });
  it('rejects unsupported media before contacting Meta', async () => {
    await expect(
      new TemplateManagementService({} as never).uploadSample('line-1', {
        filename: 'x.svg',
        mimeType: 'image/svg+xml',
        buffer: Buffer.from('sample'),
      }),
    ).rejects.toThrow('Muestra inválida');
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
