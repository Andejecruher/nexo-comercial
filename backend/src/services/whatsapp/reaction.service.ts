import { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma.service';
import type { ParsedWebhookReaction } from '../../utils/wa-message-parser';
import { withRealtimeTransaction } from '../realtime/realtime-transaction';
import type { RealtimeNotifier } from '../realtime/realtime-notifier.service';
import type { RealtimeDurableEvent } from '../realtime/realtime-event.contracts';
import { buildMessageReactionEvent } from '../realtime/message-event.builder';
import { eventBus } from '../events/event-bus.service';
import { createStructuredLogger } from '../../utils/structured-logger';

const log = createStructuredLogger('ReactionService');

/** Copia un `meta` JsonB de Prisma a un objeto plano, descartando valores no-objeto. */
function metaRecord(meta: Prisma.JsonValue): Prisma.JsonObject {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return {};
  return meta;
}

/** Reacción almacenada en `Message.meta.reaction`. */
export interface MessageReaction {
  /** Emoji aplicado, o `null` cuando el ciudadano retiró su reacción. */
  emoji: string | null;
  /** Teléfono del ciudadano que reaccionó. */
  from: string;
  /** Timestamp del evento en segundos Unix (string, tal como llega de Meta). */
  updated_at: string;
  [key: string]: Prisma.JsonValue;
}

/**
 * ReactionService — aplica reacciones inbound sobre el mensaje reaccionado.
 *
 * Una reacción NO es un mensaje: no crea una burbuja nueva en la conversación.
 * Solo muta `Message.meta.reaction` del mensaje objetivo y emite un evento
 * durable para que el inbox actualice la burbuja existente.
 *
 * Empatía con `DeliveryStatusService`: misma garantía de durabilidad
 * (Outbox dentro de la transacción) y mismo fallback best-effort al event bus
 * legacy cuando el path durable está deshabilitado.
 */
export class ReactionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifier?: RealtimeNotifier,
  ) {}

  /** Aplica un lote de reacciones. Devuelve `false` si alguna quedó pendiente. */
  async apply(reactions: ParsedWebhookReaction[]): Promise<boolean> {
    let complete = true;
    for (const reaction of reactions) {
      try {
        const legacy = await this.applyOne(reaction);
        if (legacy) eventBus.emit('message.updated', legacy);
      } catch (err: unknown) {
        complete = false;
        log('error', 'reaction.apply_failed', reaction.wamid, {
          targetMessageId: reaction.targetMessageId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return complete;
  }

  /**
   * Aplica una reacción dentro de una transacción durable.
   *
   * Caso A (emoji presente): sobrescribe cualquier reacción previa del mensaje.
   * Caso B (emoji ausente): limpia la reacción existente (`emoji: null`).
   *
   * Devuelve el evento legacy cuando el path durable está deshabilitado.
   */
  private async applyOne(reaction: ParsedWebhookReaction): Promise<RealtimeDurableEvent | null> {
    let legacy: RealtimeDurableEvent | null = null;

    await withRealtimeTransaction(this.prisma, this.notifier, async (tx) => {
      // Bloqueo por mensaje objetivo: serializa reacciones concurrentes sobre
      // el mismo mensaje para que el read-modify-write de `meta` no pierda datos.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${
        'reaction:' + reaction.targetMessageId
      }, 0))`;

      const target = await tx.message.findFirst({
        where: { externalMessageId: reaction.targetMessageId },
      });
      if (!target) {
        // Meta puede reaccionar a un mensaje que no persistimos (o que llegó
        // antes de habilitar el canal). No es un error recuperable: se ignora.
        log('warn', 'reaction.target_not_found', reaction.wamid, {
          targetMessageId: reaction.targetMessageId,
        });
        return;
      }

      const updatedAt = reaction.timestamp;
      const nextReaction: MessageReaction = reaction.emoji
        ? { emoji: reaction.emoji, from: reaction.phone, updated_at: updatedAt }
        : { emoji: null, from: reaction.phone, updated_at: updatedAt };

      // Se reemplaza la reacción completa: una sola reacción por mensaje,
      // la última gana (Meta emite una reacción por evento).
      const meta: Prisma.JsonObject = { ...metaRecord(target.meta), reaction: nextReaction };

      const updated = await tx.message.update({
        where: { id: target.id },
        data: { meta },
      });

      const event = buildMessageReactionEvent(
        updated,
        reaction.wamid,
        new Date().toISOString(),
      );

      if (this.notifier?.isEnabled()) await this.notifier.notifyCritical(tx, event);
      else legacy = event;
    });

    return legacy;
  }
}
