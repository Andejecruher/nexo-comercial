import { z } from 'zod';

const ids = z
  .array(z.string().uuid())
  .min(1)
  .max(500)
  .transform((value) => [...new Set(value)].sort());
export const BulkActionSchema = z.discriminatedUnion('action', [
  z
    .object({
      conversation_ids: ids,
      action: z.literal('send_message'),
      message: z.string().trim().min(1).max(1000),
    })
    .strict(),
  z.object({ conversation_ids: ids, action: z.literal('activate_bot') }).strict(),
  z
    .object({
      conversation_ids: ids,
      action: z.literal('deactivate_bot'),
      target: z.discriminatedUnion('type', [
        z
          .object({
            type: z.literal('department'),
            departmentSlug: z.string().trim().min(1).max(100),
          })
          .strict(),
        z.object({ type: z.literal('agent'), toUserId: z.string().uuid() }).strict(),
      ]),
    })
    .strict(),
  z.object({ conversation_ids: ids, action: z.literal('close_tickets') }).strict(),
]);
export type BulkAction = z.infer<typeof BulkActionSchema>;
export const BULK_PERMISSIONS = [
  'mensajes_masivos.view',
  'mensajes_masivos.create',
  'conversaciones.update',
];
