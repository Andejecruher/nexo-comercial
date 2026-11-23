import { META_GRAPH_BASE_URL } from '../../config/meta.config';
import { Readable } from 'stream';
import { assertProviderMediaUrl, boundedMediaBody, MEDIA_POLICY } from './media-policy';
/**
 * WhatsApp Provider — Cliente HTTP para Meta WhatsApp Business Cloud API.
 *
 * Implementa todos los tipos de mensajes outbound con:
 * - Rate limiting
 * - Error mapping
 * - Template fallback cuando estamos fuera de la ventana 24h
 * - App Secret Proof
 */
import { QUEUE_CONFIG } from '../../config/messaging.constants';
import {
  WaContact,
  WaContactsOutbound,
  WaInteractiveOutbound,
  WaLocationOutbound,
  WaMediaOutbound,
  WaMediaUploadResponse,
  WaOutboundMessage,
  WaReactionOutbound,
  WaReadReceipt,
  WaSendMessageResponse,
  WaTemplateOutbound,
  WaTextOutbound,
  WaTypingIndicatorOutbound,
} from '../../types/whatsapp.types';
import { generateAppSecretProof } from '../../utils/hmac-validator';
import {
  isMetaErrorResponse,
  isOutsideConversationWindow,
  parseMetaError,
} from '../../utils/meta-error-parser';
import { formatPhoneForMeta, maskPhone } from '../../utils/phone-normalizer';
import { PostgresRateLimiter } from '../postgres-rate-limiter.service';
import { WhatsAppLineConfigResolver, WhatsAppLineContext } from './whatsapp-line-config.resolver';

function log(
  level: 'info' | 'warn' | 'error' | 'debug',
  event: string,
  data?: Record<string, unknown>,
): void {
  const entry = {
    ts: new Date().toISOString(),
    level,
    service: 'WhatsAppProvider',
    event,
    ...data,
  };
  // eslint-disable-next-line no-console
  console[level](JSON.stringify(entry));
}

export class WhatsAppProvider {
  constructor(
    private readonly rateLimiter: PostgresRateLimiter,
    private readonly lineConfigResolver: WhatsAppLineConfigResolver,
  ) {}

  // ─── Rate limiter helper ───────────────────────────────────────────────────

  private async checkRateLimit(phone: string): Promise<void> {
    const count = await this.rateLimiter.increment('outbound_phone', phone, 1);
    if (count > QUEUE_CONFIG.OUTBOUND_RATE_PER_SECOND) {
      throw new Error(`Rate limit exceeded for phone ${phone}: ${count} msgs/s`);
    }
  }

  // ─── HTTP helper ──────────────────────────────────────────────────────────

  /**
   * Método público para enviar un payload ya construido directamente a la API de Meta.
   * Útil para OutboxProcessor que tiene el WaOutboundMessage completo persistido.
   */
  async send(
    payload: WaOutboundMessage,
    lineContext?: WhatsAppLineContext,
  ): Promise<WaSendMessageResponse> {
    return this.post(payload, lineContext);
  }

  private async post(
    payload: WaOutboundMessage | WaReadReceipt,
    lineContext?: WhatsAppLineContext,
  ): Promise<WaSendMessageResponse> {
    const runtimeConfig = await this.lineConfigResolver.resolve({
      ...lineContext,
      allowDefault: lineContext?.allowDefault ?? true,
    });

    const appSecretProof = generateAppSecretProof(
      runtimeConfig.accessToken,
      runtimeConfig.appSecret,
    );
    const url = `${runtimeConfig.messagesUrl}?appsecret_proof=${appSecretProof}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${runtimeConfig.accessToken}`,
      'Content-Type': 'application/json',
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), runtimeConfig.httpTimeoutMs);

    // Meta exige el formato 521… para México en el campo `to`; normalizamos el
    // número canónico de DB (52 + 10 dígitos) en el único choke point outbound.
    // No mutamos el payload del caller: enviamos una copia con `to` formateado.
    const bodyPayload =
      'to' in payload && typeof payload.to === 'string'
        ? { ...payload, to: formatPhoneForMeta(payload.to) }
        : payload;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(bodyPayload),
        signal: controller.signal,
      });

      const body: unknown = await response.json();

      if (!response.ok) {
        if (isMetaErrorResponse(body)) {
          throw parseMetaError(body);
        }
        throw new Error(`Meta API error: ${response.status}`);
      }

      return body as WaSendMessageResponse;
    } finally {
      clearTimeout(timeout);
    }
  }

  // ─── Mensajes de texto ────────────────────────────────────────────────────

  async sendText(
    to: string,
    body: string,
    previewUrl = false,
    lineContext?: WhatsAppLineContext,
  ): Promise<WaSendMessageResponse> {
    await this.checkRateLimit(to);
    const payload: WaTextOutbound = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { body, preview_url: previewUrl },
    };
    return this.post(payload, lineContext);
  }

  // ─── Mensajes de media ────────────────────────────────────────────────────

  async sendImage(
    to: string,
    opts: { id?: string; link?: string; caption?: string },
    lineContext?: WhatsAppLineContext,
  ): Promise<WaSendMessageResponse> {
    await this.checkRateLimit(to);
    const payload: WaMediaOutbound = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'image',
      image: opts,
    };
    return this.post(payload, lineContext);
  }

  async sendVideo(
    to: string,
    opts: { id?: string; link?: string; caption?: string },
    lineContext?: WhatsAppLineContext,
  ): Promise<WaSendMessageResponse> {
    await this.checkRateLimit(to);
    const payload: WaMediaOutbound = {
      messaging_product: 'whatsapp',
      to,
      type: 'video',
      video: opts,
    };
    return this.post(payload, lineContext);
  }

  async sendAudio(
    to: string,
    opts: { id?: string; link?: string },
    lineContext?: WhatsAppLineContext,
  ): Promise<WaSendMessageResponse> {
    await this.checkRateLimit(to);
    const payload: WaMediaOutbound = {
      messaging_product: 'whatsapp',
      to,
      type: 'audio',
      audio: opts,
    };
    return this.post(payload, lineContext);
  }

  async sendDocument(
    to: string,
    opts: { id?: string; link?: string; caption?: string; filename?: string },
    lineContext?: WhatsAppLineContext,
  ): Promise<WaSendMessageResponse> {
    await this.checkRateLimit(to);
    const payload: WaMediaOutbound = {
      messaging_product: 'whatsapp',
      to,
      type: 'document',
      document: opts,
    };
    return this.post(payload, lineContext);
  }

  async sendSticker(
    to: string,
    opts: { id?: string; link?: string },
    lineContext?: WhatsAppLineContext,
  ): Promise<WaSendMessageResponse> {
    await this.checkRateLimit(to);
    const payload: WaMediaOutbound = {
      messaging_product: 'whatsapp',
      to,
      type: 'sticker',
      sticker: opts,
    };
    return this.post(payload, lineContext);
  }

  // ─── Location ─────────────────────────────────────────────────────────────

  async sendLocation(
    to: string,
    lat: number,
    lon: number,
    name?: string,
    address?: string,
    lineContext?: WhatsAppLineContext,
  ): Promise<WaSendMessageResponse> {
    await this.checkRateLimit(to);
    const payload: WaLocationOutbound = {
      messaging_product: 'whatsapp',
      to,
      type: 'location',
      location: { latitude: lat, longitude: lon, name, address },
    };
    return this.post(payload, lineContext);
  }

  // ─── Contacts ─────────────────────────────────────────────────────────────

  async sendContact(
    to: string,
    contacts: WaContact[],
    lineContext?: WhatsAppLineContext,
  ): Promise<WaSendMessageResponse> {
    await this.checkRateLimit(to);
    const payload: WaContactsOutbound = {
      messaging_product: 'whatsapp',
      to,
      type: 'contacts',
      contacts,
    };
    return this.post(payload, lineContext);
  }

  // ─── Reaction ─────────────────────────────────────────────────────────────

  async sendReaction(
    to: string,
    messageId: string,
    emoji: string,
    lineContext?: WhatsAppLineContext,
  ): Promise<WaSendMessageResponse> {
    await this.checkRateLimit(to);
    const payload: WaReactionOutbound = {
      messaging_product: 'whatsapp',
      to,
      type: 'reaction',
      reaction: { message_id: messageId, emoji },
    };
    return this.post(payload, lineContext);
  }

  // ─── Interactive ──────────────────────────────────────────────────────────

  async sendInteractiveButtons(
    to: string,
    bodyText: string,
    buttons: Array<{ id: string; title: string }>,
    opts?: { header?: string; footer?: string },
    lineContext?: WhatsAppLineContext,
  ): Promise<WaSendMessageResponse> {
    await this.checkRateLimit(to);
    const payload: WaInteractiveOutbound = {
      messaging_product: 'whatsapp',
      to,
      type: 'interactive',
      interactive: {
        type: 'button',
        ...(opts?.header ? { header: { type: 'text', text: opts.header } } : {}),
        body: { text: bodyText },
        ...(opts?.footer ? { footer: { text: opts.footer } } : {}),
        action: {
          buttons: buttons.map((b) => ({ type: 'reply', reply: { id: b.id, title: b.title } })),
        },
      },
    };
    return this.post(payload, lineContext);
  }

  async sendInteractiveList(
    to: string,
    bodyText: string,
    buttonLabel: string,
    sections: Array<{
      title?: string;
      rows: Array<{ id: string; title: string; description?: string }>;
    }>,
    opts?: { header?: string; footer?: string },
    lineContext?: WhatsAppLineContext,
  ): Promise<WaSendMessageResponse> {
    await this.checkRateLimit(to);
    const payload: WaInteractiveOutbound = {
      messaging_product: 'whatsapp',
      to,
      type: 'interactive',
      interactive: {
        type: 'list',
        ...(opts?.header ? { header: { type: 'text', text: opts.header } } : {}),
        body: { text: bodyText },
        ...(opts?.footer ? { footer: { text: opts.footer } } : {}),
        action: { button: buttonLabel, sections },
      },
    };
    return this.post(payload, lineContext);
  }

  async sendInteractiveFlow(
    to: string,
    bodyText: string,
    flowId: string,
    flowToken: string,
    flowCta: string,
    opts?: { footer?: string },
    lineContext?: WhatsAppLineContext,
  ): Promise<WaSendMessageResponse> {
    await this.checkRateLimit(to);
    const payload: WaInteractiveOutbound = {
      messaging_product: 'whatsapp',
      to,
      type: 'interactive',
      interactive: {
        type: 'flow',
        body: { text: bodyText },
        ...(opts?.footer ? { footer: { text: opts.footer } } : {}),
        action: {
          name: 'flow',
          parameters: {
            flow_message_version: '3',
            flow_token: flowToken,
            flow_id: flowId,
            flow_cta: flowCta,
            flow_action: 'navigate',
          },
        },
      },
    };
    return this.post(payload, lineContext);
  }

  async sendLocationRequest(
    to: string,
    bodyText: string,
    lineContext?: WhatsAppLineContext,
  ): Promise<WaSendMessageResponse> {
    await this.checkRateLimit(to);
    const payload: WaInteractiveOutbound = {
      messaging_product: 'whatsapp',
      to,
      type: 'interactive',
      interactive: {
        type: 'location_request_message',
        body: { text: bodyText },
        action: { name: 'send_location' },
      },
    };
    return this.post(payload, lineContext);
  }

  // ─── Templates ────────────────────────────────────────────────────────────

  async sendTemplate(
    to: string,
    templateName: string,
    languageCode: string,
    components?: WaTemplateOutbound['template']['components'],
    lineContext?: WhatsAppLineContext,
  ): Promise<WaSendMessageResponse> {
    await this.checkRateLimit(to);
    const payload: WaTemplateOutbound = {
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
        components,
      },
    };
    return this.post(payload, lineContext);
  }

  /**
   * Intenta enviar texto; si falla con error 131047 (fuera de ventana 24h),
   * usa template como fallback.
   */
  async sendTextWithTemplateFallback(
    to: string,
    body: string,
    fallbackTemplate: { name: string; languageCode: string },
    lineContext?: WhatsAppLineContext,
  ): Promise<WaSendMessageResponse> {
    try {
      return await this.sendText(to, body, false, lineContext);
    } catch (err: unknown) {
      if (typeof err === 'object' && err !== null && 'code' in err) {
        const code = (err as { code: number }).code;
        if (isOutsideConversationWindow(code)) {
          log('warn', 'whatsapp.outside_window', { to: maskPhone(to) });
          return this.sendTemplate(
            to,
            fallbackTemplate.name,
            fallbackTemplate.languageCode,
            undefined,
            lineContext,
          );
        }
      }
      throw err;
    }
  }

  // ─── Mark as Read ─────────────────────────────────────────────────────────

  async markAsRead(
    messageId: string,
    lineContext?: WhatsAppLineContext,
  ): Promise<WaSendMessageResponse> {
    const payload: WaReadReceipt = {
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId,
    };
    return this.post(payload, lineContext);
  }

  // ─── Typing indicator ─────────────────────────────────────────────────────

  /**
   * Envía typing indicator con el formato oficial de Meta
   * (read receipt + typing_indicator) usando el wamid inbound.
   *
   * @param to        - Número destino en formato E.164 (con +), solo para logging
   * @param messageId - WAMID del mensaje inbound
   */
  async sendTypingIndicator(
    to: string,
    messageId: string,
    lineContext?: WhatsAppLineContext,
  ): Promise<void> {
    const payload: WaTypingIndicatorOutbound = {
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId,
      typing_indicator: {
        type: 'text',
      },
    };

    try {
      await this.post(payload, lineContext);
      log('debug', 'whatsapp.typing', { to: maskPhone(to), messageId });
    } catch (err) {
      // Fallos de typing no son críticos — no relanzar
      log('warn', 'whatsapp.typing.failed', {
        to: maskPhone(to),
        messageId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // ─── Media ────────────────────────────────────────────────────────────────

  async uploadMedia(
    fileBuffer: Buffer,
    mimeType: string,
    filename: string,
    lineContext?: WhatsAppLineContext,
  ): Promise<WaMediaUploadResponse> {
    const runtimeConfig = await this.lineConfigResolver.resolve({
      ...lineContext,
      allowDefault: lineContext?.allowDefault ?? true,
    });

    const appSecretProof = generateAppSecretProof(
      runtimeConfig.accessToken,
      runtimeConfig.appSecret,
    );

    const formData = new FormData();
    formData.append('messaging_product', 'whatsapp');
    formData.append('file', new Blob([fileBuffer], { type: mimeType }), filename);

    const url = `${runtimeConfig.mediaUrl}?appsecret_proof=${appSecretProof}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${runtimeConfig.accessToken}` },
      body: formData,
      redirect: 'error',
      signal: AbortSignal.timeout(MEDIA_POLICY.timeoutMs),
    });

    const body: unknown = await response.json();
    if (!response.ok) {
      if (isMetaErrorResponse(body)) throw parseMetaError(body);
      throw new Error(`Media upload failed: ${response.status}`);
    }

    if (!body || typeof (body as WaMediaUploadResponse).id !== 'string')
      throw new Error('MEDIA_UPLOAD_INVALID');
    return body as WaMediaUploadResponse;
  }

  async downloadMedia(mediaId: string, lineContext?: WhatsAppLineContext): Promise<Buffer> {
    return boundedMediaBody(await this.fetchMedia(mediaId, lineContext));
  }

  async downloadMediaStream(mediaId: string, lineContext?: WhatsAppLineContext): Promise<Readable> {
    const response = await this.fetchMedia(mediaId, lineContext);
    if (Number(response.headers.get('content-length')) > MEDIA_POLICY.maxBytes) {
      await response.body?.cancel();
      throw new Error('MEDIA_SIZE_EXCEEDED');
    }
    if (!response.body) throw new Error('MEDIA_EMPTY');
    return Readable.fromWeb(response.body as import('stream/web').ReadableStream<Uint8Array>);
  }

  private async fetchMedia(mediaId: string, lineContext?: WhatsAppLineContext): Promise<Response> {
    const runtimeConfig = await this.lineConfigResolver.resolve({
      ...lineContext,
      allowDefault: lineContext?.allowDefault ?? true,
    });

    const appSecretProof = generateAppSecretProof(
      runtimeConfig.accessToken,
      runtimeConfig.appSecret,
    );

    const headers = {
      Authorization: `Bearer ${runtimeConfig.accessToken}`,
      'Content-Type': 'application/json',
    };

    // Primero obtener la URL de descarga
    const urlResponse = await fetch(
      `${META_GRAPH_BASE_URL}/${encodeURIComponent(mediaId)}?appsecret_proof=${appSecretProof}`,
      { headers, redirect: 'error', signal: AbortSignal.timeout(MEDIA_POLICY.timeoutMs) },
    );

    if (!urlResponse.ok) throw new Error(`MEDIA_HTTP_${urlResponse.status}`);
    const urlData = (await urlResponse.json()) as { url: string };
    if (!urlData.url) throw new Error(`No URL for media ${mediaId}`);

    // Descargar el contenido
    const destination = assertProviderMediaUrl(urlData.url);
    const mediaResponse = await fetch(destination.toString(), {
      headers,
      redirect: 'error',
      signal: AbortSignal.timeout(MEDIA_POLICY.timeoutMs),
    });
    if (!mediaResponse.ok) throw new Error(`MEDIA_HTTP_${mediaResponse.status}`);

    return mediaResponse;
  }
}
