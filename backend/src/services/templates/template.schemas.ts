import { z } from 'zod';

const metaAssetHandlePattern = /^(?=.{8,4096}$)\d+:[A-Za-z0-9:_=-]+$/;

export function isMetaAssetHandle(value: string): boolean {
  return (
    metaAssetHandlePattern.test(value) &&
    !value.startsWith('upload:') &&
    !/[?#\s]/.test(value) &&
    !/^https?:\/\//i.test(value)
  );
}

const button = z.discriminatedUnion('type', [
  z.object({ type: z.literal('QUICK_REPLY'), text: z.string().trim().min(1).max(25) }),
  z.object({
    type: z.literal('URL'),
    text: z.string().trim().min(1).max(25),
    url: z
      .string()
      .url()
      .max(2000)
      .regex(/^https:\/\//)
      .refine((v) => !v.includes('{{'), 'Solo enlaces estáticos'),
  }),
  z.object({
    type: z.literal('PHONE_NUMBER'),
    text: z.string().trim().min(1).max(25),
    phone_number: z.string().regex(/^\+[1-9]\d{6,14}$/),
  }),
]);
export const templateInputSchema = z
  .object({
    name: z
      .string()
      .min(1)
      .max(512)
      .regex(/^[a-z0-9_]+$/),
    language: z.enum(['es', 'es_MX', 'en_US', 'pt_BR']),
    category: z.enum(['MARKETING', 'UTILITY', 'AUTHENTICATION']),
    parameterFormat: z.enum(['POSITIONAL', 'NAMED']),
    headerType: z.enum(['NONE', 'TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT']),
    header: z.string().max(60).default(''),
    mediaHandle: z.string().max(4096).default(''),
    body: z.string().max(1024),
    footer: z.string().max(60).default(''),
    examples: z.record(z.string(), z.string().trim().max(200)),
    buttons: z.array(button).max(3),
    addSecurityRecommendation: z.boolean().default(true),
    codeExpirationMinutes: z.number().int().min(1).max(90).default(10),
  })
  .superRefine((v, ctx) => {
    const issue = (path: string, message: string) =>
      ctx.addIssue({ code: 'custom', path: [path], message });
    if (v.category === 'AUTHENTICATION') return;
    if (!v.body.trim()) issue('body', 'El cuerpo es obligatorio');
    if (/<\/?[a-z][^>]*>/i.test(v.body)) issue('body', 'WhatsApp no admite etiquetas HTML');
    if (v.headerType === 'TEXT' && !v.header.trim()) issue('header', 'Escribe el encabezado');
    if (!['NONE', 'TEXT'].includes(v.headerType)) {
      if (!v.mediaHandle.trim()) issue('mediaHandle', 'Se requiere un handle de muestra de Meta');
      else if (!isMetaAssetHandle(v.mediaHandle))
        issue('mediaHandle', 'El handle de muestra de Meta es inválido');
    }
    if ((v.headerType === 'TEXT' && v.header.includes('{{')) || v.footer.includes('{{'))
      issue('header', 'En esta versión las variables se agregan al cuerpo');
    const variables = [...new Set([...v.body.matchAll(/\{\{([^{}]+)\}\}/g)].map((m) => m[1]))];
    const remainder = v.body.replace(/\{\{([^{}]+)\}\}/g, '');
    if (/[{}]/.test(remainder)) issue('body', 'Variable incompleta');
    if (v.parameterFormat === 'POSITIONAL') {
      if (variables.some((key, i) => key !== String(i + 1)))
        issue('body', 'Usa variables consecutivas: {{1}}, {{2}}…');
    } else if (variables.some((key) => !/^[a-z][a-z0-9_]*$/.test(key)))
      issue('body', 'Usa nombres como {{nombre}}');
    for (const key of variables)
      if (typeof v.examples[key] !== 'string' || !v.examples[key].trim())
        issue('examples', `Agrega una muestra para {{${key}}}`);
    if (
      v.buttons.filter((b) => b.type === 'URL').length > 2 ||
      v.buttons.filter((b) => b.type === 'PHONE_NUMBER').length > 1
    )
      issue('buttons', 'Máximo dos enlaces y un teléfono');
  });
export type TemplateInput = z.infer<typeof templateInputSchema>;

export function buildTemplatePayload(v: TemplateInput): {
  name: string;
  language: string;
  category: string;
  parameter_format?: string;
  components: Record<string, unknown>[];
} {
  if (v.category === 'AUTHENTICATION')
    return {
      name: v.name,
      language: v.language,
      category: v.category,
      components: [
        { type: 'BODY', add_security_recommendation: v.addSecurityRecommendation },
        { type: 'FOOTER', code_expiration_minutes: v.codeExpirationMinutes },
        {
          type: 'BUTTONS',
          buttons: [{ type: 'OTP', otp_type: 'COPY_CODE', text: 'Copiar código' }],
        },
      ],
    };
  const components: Record<string, unknown>[] = [];
  if (v.headerType === 'TEXT') components.push({ type: 'HEADER', format: 'TEXT', text: v.header });
  else if (v.headerType !== 'NONE')
    components.push({
      type: 'HEADER',
      format: v.headerType,
      example: { header_handle: [v.mediaHandle] },
    });
  const keys = [...new Set([...v.body.matchAll(/\{\{([^{}]+)\}\}/g)].map((m) => m[1]))];
  components.push({
    type: 'BODY',
    text: v.body,
    ...(keys.length
      ? {
          example:
            v.parameterFormat === 'NAMED'
              ? {
                  body_text_named_params: keys.map((key) => ({
                    param_name: key,
                    example: v.examples[key],
                  })),
                }
              : { body_text: [keys.map((key) => v.examples[key])] },
        }
      : {}),
  });
  if (v.footer.trim()) components.push({ type: 'FOOTER', text: v.footer });
  if (v.buttons.length) components.push({ type: 'BUTTONS', buttons: v.buttons });
  return {
    name: v.name,
    language: v.language,
    category: v.category,
    parameter_format: v.parameterFormat,
    components,
  };
}
