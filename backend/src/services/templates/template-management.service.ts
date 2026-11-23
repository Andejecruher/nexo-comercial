import { DEFAULT_META_HTTP_TIMEOUT_MS } from '../../config/meta.config';
import { AppError } from '../../utils/app-error';
import type { MultipartFilePart } from '../../utils/multipart';
import { createStructuredLogger } from '../../utils/structured-logger';
import type { PrismaService } from '../prisma.service';
import {
  WhatsAppLineConfigResolver,
  type WhatsAppLineRuntimeConfig,
} from '../whatsapp/whatsapp-line-config.resolver';
import { buildTemplatePayload, isMetaAssetHandle, type TemplateInput } from './template.schemas';

// Keep template API version configurable without changing the existing message sender.
const templateVersion = process.env.META_TEMPLATES_API_VERSION ?? 'v23.0';
if (!/^v\d+\.0$/.test(templateVersion)) throw new Error('META_TEMPLATES_API_VERSION inválida');
const META_GRAPH_BASE_URL = `https://graph.facebook.com/${templateVersion}`;
// Support opaque base64 session tokens and a single optional signature query.
const uploadSessionIdPattern =
  /^upload:([A-Za-z0-9_+/-]+={0,2})(?:\?sig=([A-Za-z0-9_+/-]+={0,2}))?$/;
const log = createStructuredLogger('TemplateManagementService');

function metaFailure(
  stage: string,
  response: globalThis.Response,
  data: unknown,
  message?: string,
): AppError {
  const error = data && typeof data === 'object' && 'error' in data ? data.error : undefined;
  const details = error && typeof error === 'object' ? (error as Record<string, unknown>) : {};
  log('warn', 'meta_template.request_failed', undefined, {
    stage,
    metaStatus: response.status,
    metaCode: typeof details.code === 'number' ? details.code : undefined,
    metaSubcode: typeof details.error_subcode === 'number' ? details.error_subcode : undefined,
    metaTraceId:
      typeof details.fbtrace_id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(details.fbtrace_id)
        ? details.fbtrace_id
        : undefined,
  });
  return new AppError(
    message ?? 'Meta rechazó la operación. Verifica los datos y permisos de la cuenta.',
    response.status === 429 ? 429 : 502,
    'META_ERROR',
  );
}

function hasExpectedMediaSignature(file: MultipartFilePart): boolean {
  if (file.mimeType === 'image/png')
    return file.buffer
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (file.mimeType === 'image/jpeg')
    return file.buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
  if (file.mimeType === 'application/pdf')
    return file.buffer.subarray(0, 5).equals(Buffer.from('%PDF-'));
  return file.mimeType === 'video/mp4' && file.buffer.subarray(4, 8).equals(Buffer.from('ftyp'));
}
export interface MetaTemplate {
  id: string;
  name: string;
  language: string;
  category: string;
  status: string;
  parameter_format?: string;
  components: Array<Record<string, unknown>>;
  quality_score?: { score: string };
  rejected_reason?: string;
}
interface TemplateLineSummary {
  id: string;
  name: string;
  phone: string | null;
  wabaId: string | null;
}
interface TemplatePage {
  data: Array<MetaTemplate & { createdAt?: Date; updatedAt?: Date }>;
  nextCursor?: string;
}
export class TemplateManagementService {
  private readonly resolver: WhatsAppLineConfigResolver;
  constructor(private readonly prisma: PrismaService) {
    this.resolver = new WhatsAppLineConfigResolver(prisma);
  }
  async lines(): Promise<TemplateLineSummary[]> {
    const rows = await this.prisma.communicationLine.findMany({
      where: { channel: 'whatsapp', isActive: true, whatsappBusinessAccountId: { not: null } },
      select: { id: true, displayName: true, phoneNumber: true, whatsappBusinessAccountId: true },
      orderBy: { displayName: 'asc' },
    });
    return rows.map((r) => ({
      id: r.id,
      name: r.displayName,
      phone: r.phoneNumber,
      wabaId: r.whatsappBusinessAccountId,
    }));
  }
  async config(lineId: string): Promise<WhatsAppLineRuntimeConfig> {
    const config = await this.resolver.resolve({ lineId, allowDefault: false });
    if (!config.businessAccountId || !/^\d+$/.test(config.businessAccountId))
      throw AppError.badRequest('Configura el WABA ID de la línea');
    return config;
  }
  private async graph<T>(
    token: string,
    path: string,
    method = 'GET',
    body?: unknown,
    signal?: AbortSignal,
    stage = 'graph',
  ): Promise<T> {
    signal?.throwIfAborted();
    let response: globalThis.Response;
    try {
      response = await fetch(`${META_GRAPH_BASE_URL}/${path}`, {
        method,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(DEFAULT_META_HTTP_TIMEOUT_MS)])
          : AbortSignal.timeout(DEFAULT_META_HTTP_TIMEOUT_MS),
      });
    } catch {
      signal?.throwIfAborted();
      log('warn', 'meta_template.transport_failed', undefined, { stage });
      throw new AppError(
        'No fue posible conectar con Meta. Intenta de nuevo.',
        502,
        'META_UNAVAILABLE',
      );
    }
    // Upload failures are normalized; keep legacy management JSON behavior intact.
    const data = (await (stage === 'session'
      ? response.json().catch(() => undefined)
      : response.json())) as
      | (T & {
          error?: { message?: string; error_user_msg?: string; code?: number };
        })
      | undefined;
    if (!response.ok || (stage === 'session' && !data) || data!.error)
      throw metaFailure(
        stage,
        response,
        data,
        stage === 'graph' ? data?.error?.error_user_msg : undefined,
      );
    return data as T;
  }
  async list(
    lineId: string,
    after?: string,
    options: { name?: string; limit?: number } = {},
  ): Promise<TemplatePage> {
    const c = await this.config(lineId);
    const query = new URLSearchParams({
      fields:
        'id,name,language,category,status,quality_score,components,parameter_format,rejected_reason',
      limit: String(options.limit ?? 100),
    });
    if (after) query.set('after', after);
    if (options.name) query.set('name', options.name);
    const result = await this.graph<{
      data: MetaTemplate[];
      paging?: { cursors?: { after?: string }; next?: string };
    }>(c.accessToken, `${c.businessAccountId}/message_templates?${query.toString()}`);
    const metadata = await this.prisma.managedTemplate.findMany({
      where: { wabaId: c.businessAccountId, templateId: { in: result.data.map((t) => t.id) } },
    });
    return {
      data: result.data.map((t) => {
        const dates = metadata.find((m) => m.templateId === t.id);
        return {
          ...t,
          createdAt: dates?.createdAt ?? undefined,
          updatedAt: dates?.updatedAt ?? undefined,
        };
      }),
      nextCursor: result.paging?.next ? result.paging.cursors?.after : undefined,
    };
  }
  async create(lineId: string, input: TemplateInput): Promise<{ id: string; status: string }> {
    const c = await this.config(lineId);
    const result = await this.graph<{ id: string; status: string }>(
      c.accessToken,
      `${c.businessAccountId}/message_templates`,
      'POST',
      buildTemplatePayload(input),
    );
    await this.prisma.managedTemplate.upsert({
      where: { templateId: result.id },
      create: {
        templateId: result.id,
        wabaId: c.businessAccountId!,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      update: {},
    });
    return result;
  }
  async assertOwnership(lineId: string, templateId: string): Promise<MetaTemplate> {
    if (!/^\d+$/.test(templateId)) throw AppError.badRequest('ID de plantilla inválido');
    let after: string | undefined;
    do {
      const page = await this.list(lineId, after);
      const match = page.data.find((t) => t.id === templateId);
      if (match) return match;
      after = page.nextCursor;
    } while (after);
    throw AppError.notFound('La plantilla no pertenece a la cuenta seleccionada');
  }
  async edit(lineId: string, templateId: string, input: TemplateInput): Promise<unknown> {
    const existing = await this.assertOwnership(lineId, templateId);
    if (
      existing.name !== input.name ||
      existing.language !== input.language ||
      (existing.parameter_format ?? 'POSITIONAL') !== input.parameterFormat
    )
      throw AppError.badRequest('Nombre, idioma y formato de variables no pueden cambiarse');
    const c = await this.config(lineId);
    const payload = buildTemplatePayload(input);
    const result = await this.graph(c.accessToken, templateId, 'POST', {
      category: payload.category,
      components: payload.components,
    });
    await this.prisma.managedTemplate.upsert({
      where: { templateId },
      create: { templateId, wabaId: c.businessAccountId!, updatedAt: new Date() },
      update: { updatedAt: new Date() },
    });
    return result;
  }
  async remove(lineId: string, name: string): Promise<unknown> {
    const c = await this.config(lineId);
    if (!/^[a-z0-9_]+$/.test(name)) throw AppError.badRequest('Nombre inválido');
    return this.graph(
      c.accessToken,
      `${c.businessAccountId}/message_templates?${new URLSearchParams({ name }).toString()}`,
      'DELETE',
    );
  }
  async uploadSample(
    lineId: string,
    file: MultipartFilePart,
    signal?: AbortSignal,
  ): Promise<{ handle: string }> {
    signal?.throwIfAborted();
    const limits: Record<string, number> = {
      'image/jpeg': 5,
      'image/png': 5,
      'video/mp4': 16,
      'application/pdf': 16,
    };
    const max = limits[file.mimeType];
    if (
      !max ||
      !file.buffer.length ||
      file.buffer.length > max * 1024 * 1024 ||
      !hasExpectedMediaSignature(file)
    )
      throw AppError.badRequest('Muestra inválida. Imágenes: hasta 5 MB; MP4/PDF: hasta 16 MB.');
    const c = await this.config(lineId);
    if (!c.appId || !/^\d+$/.test(c.appId))
      throw AppError.badRequest('Configura el App ID de Meta en la línea para subir muestras');
    const query = new URLSearchParams({
      file_name: file.filename.slice(0, 255),
      file_length: String(file.buffer.length),
      file_type: file.mimeType,
    });
    const session = await this.graph<{ id: string }>(
      c.accessToken,
      `${c.appId}/uploads?${query.toString()}`,
      'POST',
      undefined,
      signal,
      'session',
    );
    const match =
      typeof session.id === 'string' && session.id.length <= 4096
        ? uploadSessionIdPattern.exec(session.id)
        : null;
    if (!match) {
      log('warn', 'meta_template_sample.invalid_session', undefined, { idType: typeof session.id });
      throw new AppError('Meta no creó la sesión de carga', 502);
    }
    // Keep the token in one path segment; only the known sig query is permitted.
    const sessionPath = `upload:${encodeURIComponent(match[1])}${match[2] ? `?sig=${encodeURIComponent(match[2])}` : ''}`;
    signal?.throwIfAborted();
    let response: globalThis.Response;
    try {
      response = await fetch(`${META_GRAPH_BASE_URL}/${sessionPath}`, {
        method: 'POST',
        headers: {
          Authorization: `OAuth ${c.accessToken}`,
          file_offset: '0',
          'Content-Type': file.mimeType,
        },
        body: new Uint8Array(file.buffer),
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(60_000)])
          : AbortSignal.timeout(60_000),
      });
    } catch {
      signal?.throwIfAborted();
      log('warn', 'meta_template.transport_failed', undefined, {
        stage: 'binary',
        bytes: file.buffer.length,
        mimeType: file.mimeType,
      });
      throw new AppError('No se pudo subir la muestra a Meta', 502);
    }
    const data = (await response.json().catch(() => undefined)) as { h?: unknown } | undefined;
    if (!response.ok || (data && typeof data === 'object' && 'error' in data))
      throw metaFailure('binary', response, data);
    const handle = typeof data?.h === 'string' ? data.h : '';
    if (!response.ok || !isMetaAssetHandle(handle)) {
      log('warn', 'meta_template_sample.invalid_handle', undefined, {
        bytes: file.buffer.length,
        handleType: typeof data?.h,
        metaStatus: response.status,
        mimeType: file.mimeType,
      });
      throw new AppError(
        'Meta devolvió un handle de muestra inválido',
        502,
        'META_INVALID_UPLOAD_HANDLE',
      );
    }
    log('info', 'meta_template_sample.uploaded', undefined, {
      bytes: file.buffer.length,
      handleLength: handle.length,
      metaStatus: response.status,
      mimeType: file.mimeType,
    });
    return { handle };
  }
  async analytics(lineId: string, templateId: string): Promise<unknown> {
    await this.assertOwnership(lineId, templateId);
    const c = await this.config(lineId);
    const end = Math.floor(Date.now() / 86400000) * 86400;
    const query = new URLSearchParams({
      start: String(end - 7 * 86400),
      end: String(end),
      granularity: 'DAILY',
      template_ids: JSON.stringify([templateId]),
      metric_types: JSON.stringify(['SENT', 'DELIVERED', 'READ']),
    });
    return this.graph(
      c.accessToken,
      `${c.businessAccountId}/template_analytics?${query.toString()}`,
    );
  }
}
