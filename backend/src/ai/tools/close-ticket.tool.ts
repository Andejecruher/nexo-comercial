/**
 * CloseTicketTool — internal AI tool.
 *
 * Responsabilidad:
 *  - Cerrar el ticket activo de una conversación (o un ticket por id).
 *  - Devolver el folio del ticket cerrado para confirmación al ciudadano.
 *  - No reabre tickets: un ticket CLOSED siempre responde conflicto.
 *
 * Contrato: execute(input: unknown): Promise<unknown>
 * No lanza — devuelve error estructurado { error } para que el orquestador lo maneje.
 */
import { z } from 'zod';
import { TicketService } from '../../services/tickets/ticket.service';

export const closeTicketSchema = z
  .object({
    ticketId: z.string().uuid().optional(),
    conversationId: z.string().uuid().optional(),
    reason: z
      .enum(['resolved', 'spam', 'duplicate', 'timeout', 'user_request', 'other'])
      .optional(),
    summary: z.string().max(500).optional(),
  })
  .refine((data) => Boolean(data.ticketId || data.conversationId), {
    message: 'Se requiere ticketId o conversationId',
  });

export type CloseTicketInput = z.infer<typeof closeTicketSchema>;

export type CloseTicketOutput = {
  ticketId: string;
  conversationId: string;
  folio: string;
  closedAt: string;
};

export class CloseTicketTool {
  readonly key = 'closeTicket';

  constructor(private readonly ticketService?: TicketService) {}

  async execute(input: unknown): Promise<unknown> {
    const parsed = closeTicketSchema.safeParse(input);
    if (!parsed.success) {
      return { error: 'INVALID_INPUT', details: parsed.error.issues };
    }

    if (!this.ticketService) {
      return { error: 'TICKETS_UNAVAILABLE' };
    }

    const data = parsed.data;

    try {
      const result = await this.ticketService.closeActiveTicketByRef(
        {
          ...(data.ticketId !== undefined && { ticketId: data.ticketId }),
          ...(data.conversationId !== undefined && { conversationId: data.conversationId }),
        },
        {
          ...(data.reason !== undefined && { reason: data.reason }),
          ...(data.summary !== undefined && { summary: data.summary }),
        },
      );

      const output: CloseTicketOutput = {
        ticketId: result.ticketId,
        conversationId: result.conversationId,
        folio: result.folio,
        closedAt: result.closedAt.toISOString(),
      };

      return output;
    } catch (err: unknown) {
      return {
        error: 'CLOSE_TICKET_FAILED',
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
