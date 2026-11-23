import { z } from 'zod';
import type { MetaTemplate } from '../templates/template-management.service';
import { AppError } from '../../utils/app-error';
import { formatPhoneForMeta } from '../../utils/phone-normalizer';

export const MAX_RECIPIENTS = 2000;
export const citizenFields = ['name', 'lastName', 'phone', 'email', 'neighborhood'] as const;
const mapping = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('static'), value: z.string().trim().min(1).max(1024) }).strict(),
  z.object({ mode: z.literal('dynamic'), field: z.string().min(1).max(100) }).strict(),
]);
export const createCampaignSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    purpose: z.string().trim().min(1).max(1000),
    lineId: z.string().uuid(),
    templateId: z.string().regex(/^\d+$/).max(100),
    consentConfirmed: z.literal(true),
    attachmentId: z.string().uuid().optional(),
    mappings: z.record(z.string().max(100), mapping),
    audience: z.discriminatedUnion('source', [
      z
        .object({
          source: z.literal('citizen'),
          citizenIds: z.array(z.string().uuid()).min(1).max(MAX_RECIPIENTS),
        })
        .strict(),
      z
        .object({
          source: z.literal('csv'),
          phoneColumn: z.string().min(1).max(100),
          rows: z
            .array(z.record(z.string().max(100), z.string().max(2048)))
            .min(1)
            .max(MAX_RECIPIENTS),
        })
        .strict(),
    ]),
  })
  .strict();
export type CampaignInput = z.infer<typeof createCampaignSchema>;
export type Variable = {
  key: string;
  component: 'header' | 'body' | 'button';
  parameter: string;
  index?: string;
};

export type CampaignMediaType = 'IMAGE' | 'VIDEO' | 'DOCUMENT';
export function campaignMediaType(template: MetaTemplate): CampaignMediaType | undefined {
  const format = template.components.find((c) => c.type === 'HEADER')?.format;
  return ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(String(format))
    ? (format as CampaignMediaType)
    : undefined;
}
// Unsupported components/buttons must never be silently dropped.
export function templateVariables(template: MetaTemplate): Variable[] {
  if (template.status !== 'APPROVED') throw AppError.badRequest('La plantilla debe estar aprobada');
  if (!['POSITIONAL', 'NAMED'].includes(template.parameter_format ?? 'POSITIONAL'))
    throw AppError.badRequest('Formato de parámetros no soportado');
  const variables: Variable[] = [];
  for (const c of template.components) {
    if (!['HEADER', 'BODY', 'FOOTER', 'BUTTONS'].includes(String(c.type)))
      throw AppError.badRequest('Componente de plantilla no soportado');
    if (c.type === 'HEADER' && !['TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT'].includes(String(c.format)))
      throw AppError.badRequest('Encabezado no soportado');
    if (c.type === 'HEADER' && c.format !== 'TEXT') continue;
    if (c.type === 'BUTTONS') {
      const buttons = c.buttons as Array<{ type: string; url?: string }>;
      if (
        !Array.isArray(buttons) ||
        buttons.some(
          (b) =>
            !['URL', 'PHONE_NUMBER', 'QUICK_REPLY'].includes(b.type) ||
            (b.url?.includes('{{') &&
              (!b.url.endsWith('{{1}}') || (b.url.match(/\{\{/g)?.length ?? 0) !== 1)),
        )
      )
        throw AppError.badRequest(
          'Botón no compatible: las URL dinámicas admiten un parámetro {{1}} al final',
        );
      buttons.forEach((button, index) => {
        if (button.type === 'URL' && button.url?.includes('{{1}}'))
          variables.push({
            key: `button.${index}.1`,
            component: 'button',
            parameter: '1',
            index: String(index),
          });
      });
    }
    if (c.type !== 'HEADER' && c.type !== 'BODY') continue;
    const keys = [
      ...new Set(
        [...(typeof c.text === 'string' ? c.text : '').matchAll(/\{\{([^{}]+)\}\}/g)].map(
          (m) => m[1],
        ),
      ),
    ];
    if (template.parameter_format !== 'NAMED') {
      keys.sort((a, b) => Number(a) - Number(b));
      if (keys.some((k, i) => k !== String(i + 1)))
        throw AppError.badRequest('Variables posicionales inválidas');
    }
    for (const parameter of keys) {
      const component = c.type.toLowerCase() as 'header' | 'body';
      variables.push({ key: `${component}.${parameter}`, component, parameter });
    }
  }
  return variables;
}
export function normalizePhone(input: string): string {
  const phone = input
    .trim()
    .replace(/[\s().-]/g, '')
    .replace(/^\+/, '');
  if (!/^[1-9]\d{7,14}$/.test(phone))
    throw AppError.badRequest('Teléfono inválido: incluye código de país (8–15 dígitos)');
  const metaPhone = formatPhoneForMeta(phone);
  if (!/^[1-9]\d{7,14}$/.test(metaPhone))
    throw AppError.badRequest('Teléfono inválido: incluye código de país (8–15 dígitos)');
  return metaPhone;
}
export function resolveVariables(
  variables: Variable[],
  mappings: CampaignInput['mappings'],
  row: Record<string, string>,
): Record<string, string> {
  if (
    Object.keys(mappings).length !== variables.length ||
    variables.some((v) => !Object.prototype.hasOwnProperty.call(mappings, v.key))
  )
    throw AppError.badRequest('Mapea exactamente todas las variables de la plantilla');
  return Object.fromEntries(
    variables.map((v) => {
      const rule = mappings[v.key];
      const value =
        rule.mode === 'static'
          ? rule.value
          : Object.prototype.hasOwnProperty.call(row, rule.field)
            ? row[rule.field]
            : '';
      if (!value?.trim() || value.length > 1024 || /[\r\n\t]/.test(value) || /\{\{/.test(value))
        throw AppError.badRequest(`Valor vacío o inválido para ${v.key}`);
      return [v.key, value.trim()];
    }),
  );
}
export interface CampaignPayload {
  messaging_product: 'whatsapp';
  to: string;
  type: 'template';
  biz_opaque_callback_data: string;
  template: {
    name: string;
    language: { code: string };
    components: Array<{
      type: 'header' | 'body' | 'button';
      sub_type?: 'url';
      index?: string;
      parameters: Array<
        | { type: 'text'; text: string; parameter_name?: string }
        | { type: 'image'; image: { link?: string; id?: string } }
        | { type: 'video'; video: { link?: string; id?: string } }
        | { type: 'document'; document: { link?: string; id?: string } }
      >;
    }>;
  };
}
export function buildCampaignPayload(
  template: MetaTemplate,
  values: Record<string, string>,
  phone: string,
  recipientId: string,
): CampaignPayload {
  const variables = templateVariables(template);
  const components: CampaignPayload['template']['components'] = (
    ['header', 'body'] as const
  ).flatMap((component) => {
    const members = variables.filter((v) => v.component === component);
    return members.length
      ? [
          {
            type: component,
            parameters: members.map((v) => ({
              type: 'text' as const,
              text: values[v.key],
              ...(template.parameter_format === 'NAMED' ? { parameter_name: v.parameter } : {}),
            })),
          },
        ]
      : [];
  });
  for (const variable of variables.filter((v) => v.component === 'button'))
    components.push({
      type: 'button',
      sub_type: 'url',
      index: variable.index,
      parameters: [{ type: 'text', text: values[variable.key] }],
    });
  const mediaType = campaignMediaType(template);
  if (mediaType) {
    const link = values['header.media'];
    if (
      !link ||
      (!/^\d+$/.test(link) && (!URL.canParse(link) || new URL(link).protocol !== 'https:'))
    )
      throw AppError.badRequest('Falta un adjunto público válido');
    const reference = /^\d+$/.test(link) ? { id: link } : { link };
    const parameter =
      mediaType === 'IMAGE'
        ? { type: 'image' as const, image: reference }
        : mediaType === 'VIDEO'
          ? { type: 'video' as const, video: reference }
          : { type: 'document' as const, document: reference };
    components.unshift({ type: 'header', parameters: [parameter] });
  }
  return {
    messaging_product: 'whatsapp',
    to: phone,
    type: 'template',
    biz_opaque_callback_data: recipientId,
    template: { name: template.name, language: { code: template.language }, components },
  };
}
