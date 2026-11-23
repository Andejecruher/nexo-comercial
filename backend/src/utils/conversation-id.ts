import { z } from 'zod';
import { ValidationError } from './app-error';

const conversationIdSchema = z.string().uuid('conversationId debe ser un UUID válido');

/** Reject external identifiers before Prisma attempts to encode a PostgreSQL UUID. */
export function assertConversationId(conversationId: unknown): asserts conversationId is string {
  const parsed = conversationIdSchema.safeParse(conversationId);
  if (!parsed.success) {
    throw new ValidationError('Invalid conversationId: debe ser un UUID válido', [
      { path: 'conversationId', message: 'conversationId debe ser un UUID válido' },
    ]);
  }
}
