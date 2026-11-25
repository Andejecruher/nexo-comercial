import { apiClient, type ApiResponse } from '@/lib/shared/api-client';
export interface TemplateLine {
  id: string;
  name: string;
  phone?: string;
  wabaId: string;
}
export interface TemplateButton {
  type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER' | 'OTP';
  text: string;
  url?: string;
  phone_number?: string;
  otp_type?: string;
}
export interface TemplateComponent {
  type: string;
  text?: string;
  format?: string;
  buttons?: TemplateButton[];
  add_security_recommendation?: boolean;
  code_expiration_minutes?: number;
  example?: {
    header_handle?: string[];
    body_text?: string[][];
    body_text_named_params?: { param_name: string; example: string }[];
  };
}
export interface MessageTemplate {
  id: string;
  name: string;
  language: string;
  category: string;
  status: string;
  quality_score?: { score: string };
  components: TemplateComponent[];
  parameter_format?: 'POSITIONAL' | 'NAMED';
  createdAt?: string;
  updatedAt?: string;
  rejected_reason?: string;
}
export interface TemplateFormValues {
  name: string;
  language: string;
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
  parameterFormat: 'POSITIONAL' | 'NAMED';
  headerType: 'NONE' | 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT';
  header: string;
  mediaHandle: string;
  body: string;
  footer: string;
  examples: Record<string, string>;
  buttons: TemplateButton[];
  addSecurityRecommendation: boolean;
  codeExpirationMinutes: number;
}
export interface TemplateStatusUpdate {
  id: string;
  waba_id: string;
  message_template_id: string;
  message_template_name: string;
  event: string;
  reason?: string;
  occurred_at: string;
}
export const EMPTY_TEMPLATE: TemplateFormValues = {
  name: '',
  language: 'es_MX',
  category: 'UTILITY',
  parameterFormat: 'POSITIONAL',
  headerType: 'NONE',
  header: '',
  mediaHandle: '',
  body: '',
  footer: '',
  examples: {},
  buttons: [],
  addSecurityRecommendation: true,
  codeExpirationMinutes: 10,
};
export const variableKeys = (body: string) => [
  ...new Set([...body.matchAll(/\{\{([^{}]+)\}\}/g)].map((m) => m[1])),
];
/**
 * Sustituye cada token `{{clave}}` por el valor devuelto por `resolve`.
 * Si `resolve` no devuelve un valor, el token se conserva tal cual.
 */
export function renderTemplateText(text: string, resolve: (key: string) => string) {
  return text.replace(/\{\{([^{}]+)\}\}/g, (token, key: string) => resolve(key) || token);
}
export function templateToForm(t: MessageTemplate): TemplateFormValues {
  const header = t.components.find((c) => c.type === 'HEADER');
  const body = t.components.find((c) => c.type === 'BODY');
  const footer = t.components.find((c) => c.type === 'FOOTER');
  const examples: Record<string, string> = {};
  body?.example?.body_text?.[0]?.forEach((text, i) => {
    examples[String(i + 1)] = text;
  });
  body?.example?.body_text_named_params?.forEach((p) => {
    examples[p.param_name] = p.example;
  });
  return {
    ...EMPTY_TEMPLATE,
    name: t.name,
    language: t.language,
    category: t.category as TemplateFormValues['category'],
    parameterFormat: t.parameter_format ?? 'POSITIONAL',
    headerType: (header?.format ?? 'NONE') as TemplateFormValues['headerType'],
    header: header?.text ?? '',
    mediaHandle: header?.example?.header_handle?.[0] ?? '',
    body: body?.text ?? '',
    footer: footer?.text ?? '',
    examples,
    buttons:
      t.category === 'AUTHENTICATION'
        ? []
        : (t.components.find((c) => c.type === 'BUTTONS')?.buttons ?? []),
    addSecurityRecommendation: body?.add_security_recommendation ?? true,
    codeExpirationMinutes: footer?.code_expiration_minutes ?? 10,
  };
}
// Only forms that this editor can reproduce faithfully may be saved.
export function canEditTemplate(t: MessageTemplate) {
  return (
    ['MARKETING', 'UTILITY', 'AUTHENTICATION'].includes(t.category) &&
    ['es', 'es_MX', 'en_US', 'pt_BR'].includes(t.language) &&
    t.components.every(
      (c) =>
        ['HEADER', 'BODY', 'FOOTER', 'BUTTONS'].includes(c.type) &&
        (!c.format || ['TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT'].includes(c.format)) &&
        (c.type === 'BODY' || !c.text?.includes('{{')) &&
        (c.buttons ?? []).length <= 3 &&
        (c.buttons ?? []).every(
          (b) =>
            (['QUICK_REPLY', 'URL', 'PHONE_NUMBER'].includes(b.type) && !b.url?.includes('{{')) ||
            (b.type === 'OTP' && b.otp_type === 'COPY_CODE'),
        ),
    )
  );
}
async function unwrap<T>(promise: Promise<ApiResponse<T>>): Promise<T> {
  const r = await promise;
  if (!r.ok) throw new Error(r.message);
  return r.data;
}
const path = (line: string) => `/templates/${encodeURIComponent(line)}`;
export const templatesApi = {
  uploadSample: (line: string, file: File, signal?: AbortSignal) => {
    const form = new FormData();
    form.append('file', file);
    return unwrap(apiClient.post<{ handle: string }>(`${path(line)}/samples`, form, { signal }));
  },
  lines: () => unwrap(apiClient.get<TemplateLine[]>('/templates/lines')),
  list: (line: string, after?: string, signal?: AbortSignal, name?: string, limit?: number) =>
    unwrap(
      apiClient.get<{ data: MessageTemplate[]; nextCursor?: string; cursor: string }>(
        `${path(line)}?${new URLSearchParams({ ...(after ? { after } : {}), ...(name ? { name } : {}), ...(limit ? { limit: String(limit) } : {}) })}`,
        { signal },
      ),
    ),
  create: (line: string, data: TemplateFormValues) => unwrap(apiClient.post(path(line), data)),
  edit: (line: string, id: string, data: TemplateFormValues) =>
    unwrap(apiClient.post(`${path(line)}/${encodeURIComponent(id)}`, data)),
  remove: (line: string, name: string) =>
    unwrap(apiClient.delete(`${path(line)}?name=${encodeURIComponent(name)}`)),
  analytics: (line: string, id: string) =>
    unwrap(
      apiClient.get<{
        data?: {
          data_points?: { start: number; sent?: number; delivered?: number; read?: number }[];
        }[];
      }>(`${path(line)}/${encodeURIComponent(id)}/analytics`),
    ),
};
