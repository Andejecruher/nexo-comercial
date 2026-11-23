import { apiClient, type ApiResponse } from './api-client';
import type { MessageTemplate } from './templates-api';
export type Mapping = { mode: 'static'; value: string } | { mode: 'dynamic'; field: string };
export type Row = Record<string, string>;
export type Campaign = {
  id: string;
  name: string;
  purpose: string;
  status: string;
  total: number;
  createdAt: string;
};
export type CampaignDetail = Campaign & {
  counts: Record<'pending' | 'sent' | 'delivered' | 'read' | 'failed', number>;
  deliveredTotal: number;
  sentTotal: number;
  uncertain: number;
  recipients: Array<{
    id: string;
    phone: string;
    status: string;
    dispatchState: string;
    errorCode: string | null;
    messageId: string | null;
  }>;
  page: number;
  pageSize: number;
};
export type CampaignAttachment = {
  id: string;
  filename: string;
  mediaType: 'IMAGE' | 'VIDEO' | 'DOCUMENT';
  url: string;
  viewUrl: string;
};
export function campaignMediaType(
  template?: MessageTemplate,
): CampaignAttachment['mediaType'] | undefined {
  const format = template?.components.find((c) => c.type === 'HEADER')?.format;
  return ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(format ?? '')
    ? (format as CampaignAttachment['mediaType'])
    : undefined;
}
export type CreateCampaign = {
  attachmentId?: string;
  name: string;
  purpose: string;
  lineId: string;
  templateId: string;
  consentConfirmed: true;
  mappings: Record<string, Mapping>;
  audience:
    | { source: 'citizen'; citizenIds: string[] }
    | { source: 'csv'; phoneColumn: string; rows: Row[] };
};
async function unwrap<T>(promise: Promise<ApiResponse<T>>): Promise<T> {
  const result = await promise;
  if (!result.ok) throw new Error(result.message);
  return result.data;
}
export const campaignsApi = {
  uploadMedia: (
    file: File,
    input: { name: string; lineId: string; templateId: string },
    signal?: AbortSignal,
  ) => {
    const form = new FormData();
    form.append('file', file);
    for (const [key, value] of Object.entries(input)) form.append(key, value);
    return unwrap(apiClient.post<CampaignAttachment>('/campaigns/media', form, { signal }));
  },
  list: (page: number) =>
    unwrap(
      apiClient.get<{ rows: Campaign[]; total: number; pageSize: number }>(
        `/campaigns?page=${page}`,
      ),
    ),
  detail: (id: string, page: number) =>
    unwrap(apiClient.get<CampaignDetail>(`/campaigns/${encodeURIComponent(id)}?page=${page}`)),
  create: (body: CreateCampaign, key: string) =>
    unwrap(
      apiClient.post<{ id: string }>('/campaigns', body, { headers: { 'Idempotency-Key': key } }),
    ),
};
export function campaignVariables(template?: MessageTemplate) {
  return (template?.components ?? []).flatMap((c) => {
    if (c.type === 'BUTTONS')
      return (c.buttons ?? []).flatMap((button, index) =>
        button.type === 'URL' && button.url?.includes('{{1}}')
          ? [{ key: `button.${index}.1`, parameter: '1', component: `BUTTON ${index + 1}` }]
          : [],
      );
    if (!['HEADER', 'BODY'].includes(c.type)) return [];
    const keys = [
      ...new Set([...String(c.text ?? '').matchAll(/\{\{([^{}]+)\}\}/g)].map((m) => m[1])),
    ];
    if (template?.parameter_format !== 'NAMED') keys.sort((a, b) => Number(a) - Number(b));
    return keys.map((parameter) => ({
      key: `${c.type.toLowerCase()}.${parameter}`,
      parameter,
      component: c.type,
    }));
  });
}

/**
 * Hidrata el texto de un componente de plantilla con las reglas de mapeo ya
 * configuradas para un destinatario concreto. Las claves de `mappings` siguen
 * el formato `${componente}.${parametro}` (p. ej. `body.1`).
 */
export function renderMappedText(
  text: string | undefined,
  component: string,
  mappings: Record<string, Mapping>,
  row: Row,
): string {
  return String(text ?? '').replace(/\{\{([^{}]+)\}\}/g, (token, parameter: string) => {
    const rule = mappings[`${component.toLowerCase()}.${parameter}`];
    if (rule?.mode === 'static') return rule.value;
    if (rule?.mode === 'dynamic') return row[rule.field] ?? '';
    return token;
  });
}
export function supportsCampaign(template: MessageTemplate) {
  return (
    template.status === 'APPROVED' &&
    template.components.every(
      (c) =>
        ['HEADER', 'BODY', 'FOOTER', 'BUTTONS'].includes(c.type) &&
        (c.type !== 'HEADER' || ['TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT'].includes(c.format ?? '')) &&
        (c.buttons ?? []).every(
          (b) =>
            ['URL', 'PHONE_NUMBER', 'QUICK_REPLY'].includes(b.type) &&
            (!b.url?.includes('{{') ||
              (b.url.endsWith('{{1}}') && b.url.match(/\{\{/g)?.length === 1)),
        ),
    )
  );
}
export const campaignStatus: Record<string, string> = {
  queued: 'En cola',
  running: 'Procesando',
  completed: 'Envíos procesados',
  needs_review: 'Requiere revisión',
  pending: 'Pendiente',
  sent: 'Enviado',
  delivered: 'Entregado',
  read: 'Leído',
  failed: 'Fallido',
  sending: 'Enviando',
  accepted: 'Aceptado por Meta',
  finished: 'Finalizado',
  uncertain: 'Resultado incierto',
};
