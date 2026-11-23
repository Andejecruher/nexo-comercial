/**
 * CloseConversationTool — internal AI tool.
 *
 * Responsabilidad:
 *  - Marcar la conversación como cerrada en el FSM (transición → CLOSED).
 *  - Opcionalmente enviar un mensaje de despedida antes del cierre.
 *  - No accede directamente a DB: la transición de estado la ejecuta FsmRouterV2.executeToolTransition().
 *
 * Contrato: execute(input: unknown): Promise<unknown>
 * No lanza AppError — devuelve error estructurado { error } para que el orchestrador lo maneje.
 */
import { z } from 'zod';
import { TicketService } from '../../services/tickets/ticket.service';

export const closeConversationSchema = z.object({
  conversationId: z.string().min(1, 'conversationId is required'),
  reason: z.enum(['resolved', 'spam', 'duplicate', 'timeout', 'user_request', 'other']).optional(),
  summary: z.string().max(500).optional(),
});

export type CloseConversationInput = z.infer<typeof closeConversationSchema>;

export type CloseConversationOutput = {
  conversationId: string;
  closed: boolean;
  reason: string | undefined;
};

export class CloseConversationTool {
  readonly key = 'closeConversation';

  constructor(private readonly ticketService?: TicketService) {}

  async execute(input: unknown): Promise<unknown> {
    const parsed = closeConversationSchema.safeParse(input);
    if (!parsed.success) {
      return Promise.resolve({ error: 'INVALID_INPUT', details: parsed.error.issues });
    }

    const data = parsed.data;

    // La transición CLOSED la ejecuta FsmRouterV2.executeToolTransition()
    // que es invocado por ToolRunner post-ejecución de esta tool.
    // Aquí solo validamos y devolvemos metadata para que el orchestrador
    // pueda loguear el cierre con razón y resumen.

    // Ticket integration: cerrar ticket activo
    if (this.ticketService) {
      const activeTicket = await this.ticketService.getActiveTicketByConversation(
        data.conversationId,
      );
      if (activeTicket) {
        await this.ticketService.closeTicket(activeTicket.id, {
          ...(data.reason !== undefined && { reason: data.reason }),
          ...(data.summary !== undefined && { summary: data.summary }),
        });
      }
    }

    const result: CloseConversationOutput = {
      conversationId: data.conversationId,
      closed: true,
      reason: data.reason,
    };

    return result;
  }
}
