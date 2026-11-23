import { z } from 'zod';
import type { MetaTemplate } from '../templates/template-management.service';

export const templateSnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  source: z.enum(['catalog-at-send', 'request-only']),
  name: z.string(),
  language: z.string(),
  templateId: z.string().optional(),
  category: z.string().optional(),
  definition: z.array(z.record(z.string(), z.unknown())).optional(),
  parameters: z.array(z.record(z.string(), z.unknown())),
  resolved: z.array(
    z.object({
      type: z.string(),
      text: z.string().optional(),
      buttons: z.array(z.record(z.string(), z.unknown())).optional(),
    }),
  ),
  incomplete: z.boolean(),
});
export function templateSnapshot(
  instance: { name: string; language: { code: string }; components?: unknown[] },
  definition?: MetaTemplate,
): z.infer<typeof templateSnapshotSchema> {
  const parameters = (instance.components ?? []) as Array<Record<string, unknown>>;
  let incomplete = !definition;
  const resolved = (definition?.components ?? []).map((component) => {
    const type = String(component.type).toLowerCase();
    const supplied = parameters.find((p) => p.type === type);
    const values = (supplied?.parameters ?? []) as Array<Record<string, unknown>>;
    const text =
      typeof component.text === 'string'
        ? component.text.replace(/\{\{([^}]+)\}\}/g, (placeholder: string, key: string) => {
            const parameter =
              values.find((v) => v.parameter_name === key) ?? values[Number(key) - 1];
            const value =
              parameter?.text ??
              (parameter?.currency as { fallback_value?: string } | undefined)?.fallback_value ??
              (parameter?.date_time as { fallback_value?: string } | undefined)?.fallback_value;
            if (typeof value !== 'string') {
              incomplete = true;
              return placeholder;
            }
            return value;
          })
        : undefined;
    if (!['header', 'body', 'footer', 'buttons'].includes(type)) incomplete = true;
    return {
      type,
      ...(text !== undefined ? { text } : {}),
      ...(Array.isArray(component.buttons) ? { buttons: component.buttons } : {}),
    };
  });
  // JSON clone freezes the instance against subsequent caller/catalog mutations.
  return templateSnapshotSchema.parse(
    JSON.parse(
      JSON.stringify({
        schemaVersion: 1,
        source: definition ? 'catalog-at-send' : 'request-only',
        name: instance.name,
        language: instance.language.code,
        ...(definition
          ? {
              templateId: definition.id,
              category: definition.category,
              definition: definition.components,
            }
          : {}),
        parameters,
        resolved,
        incomplete,
      }),
    ),
  );
}
