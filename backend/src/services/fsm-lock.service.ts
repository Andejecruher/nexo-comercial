/**
 * Lease lock de conversación para el FSM sobre columnas de `conversation_meta`.
 *
 * Reemplaza `SET fsm:lock:{convId} <token> EX <ttl> NX` de Redis por un claim
 * atómico en la propia fila de metadatos: si `fsm_locked_at` está vacío o vencido,
 * el UPDATE toma el lock con un nuevo token. No usa advisory locks de Postgres
 * (estos retienen una conexión del pool durante el roundtrip de IA).
 */
import { randomUUID } from 'crypto';
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';

export const FSM_LOCK_DEFAULT_LEASE_SECONDS = 120;
export const FSM_LOCK_MAX_LEASE_SECONDS = 300;

/**
 * `conversation_meta.conversation_id` es UUID. Este guard evita que un caller
 * que pase un teléfono (u otro valor no parseable) reviente la conexión con un
 * 22P02 crudo del driver, y localiza el error en el caller correcto.
 */
const ConversationIdSchema = z.string().uuid('conversationId debe ser un UUID válido');

function assertConversationId(conversationId: string): string {
  const parsed = ConversationIdSchema.safeParse(conversationId);
  if (!parsed.success) {
    throw new Error(`Invalid conversationId for conversation_meta: ${parsed.error.issues[0]?.message}`);
  }
  return parsed.data;
}

export class ConversationLeaseLock {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Intenta tomar el lock de la conversación con un lease de `leaseSeconds`.
   * @returns el token si se adquirió el lock, o `null` si está tomado.
   */
  async acquire(
    conversationId: string,
    leaseSeconds = FSM_LOCK_DEFAULT_LEASE_SECONDS,
  ): Promise<string | null> {
    const conversationUuid = assertConversationId(conversationId);
    const token = randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + leaseSeconds * 1000);

    const updated = await this.prisma.$executeRaw`
      INSERT INTO conversation_meta (conversation_id, fsm_lock_token, fsm_locked_at, updated_at)
      VALUES (${conversationUuid}::uuid, ${token}, ${expiresAt}, ${now})
      ON CONFLICT (conversation_id)
      DO UPDATE
        SET fsm_lock_token = EXCLUDED.fsm_lock_token,
            fsm_locked_at = EXCLUDED.fsm_locked_at,
            updated_at = ${now}
      WHERE conversation_meta.fsm_locked_at IS NULL
         OR conversation_meta.fsm_locked_at < ${now}
    `;

    return updated === 1 ? token : null;
  }

  /**
   * Libera el lock solo si el token aún es el propietario.
   * @returns true si el lock fue liberado (o nunca existió); false si el token no era dueño.
   */
  async release(conversationId: string, token: string): Promise<boolean> {
    const conversationUuid = assertConversationId(conversationId);
    const updated = await this.prisma.$executeRaw`
      UPDATE conversation_meta
      SET fsm_lock_token = NULL,
          fsm_locked_at = NULL,
          updated_at = now()
      WHERE conversation_id = ${conversationUuid}::uuid
        AND fsm_lock_token = ${token}
    `;
    return updated === 1;
  }
}