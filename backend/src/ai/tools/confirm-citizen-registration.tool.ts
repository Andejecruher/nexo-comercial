import { LeadStatus } from '@prisma/client';
import { z } from 'zod';
import type { CitizenRepository } from '../../repositories';
import { TicketService } from '../../services/tickets/ticket.service';
import { citizenHasCompleteRegistrationProfile } from '../../utils/citizen-profile';
import { normalizePhoneForStorage } from '../../utils/phone-normalizer';

const confirmCitizenRegistrationSchema = z.object({
  citizenId: z.string().uuid().optional(),
  phone: z.string().trim().min(7).max(20).optional(),
  /**
   * ID de la conversación activa. Si se provee y hay TicketService inyectado,
   * el ticket de registro activo se cierra con trazabilidad al confirmar.
   */
  conversationId: z.string().min(1).optional(),
});

/** Motivo de cierre del ticket cuando el registro se completa correctamente. */
const REGISTRATION_CLOSE_REASON = 'REGISTRATION_COMPLETED';

function log(level: 'info' | 'warn', event: string, data?: Record<string, unknown>): void {
  const entry = {
    ts: new Date().toISOString(),
    level,
    service: 'ConfirmCitizenRegistrationTool',
    event,
    ...data,
  };
  // eslint-disable-next-line no-console
  console[level](JSON.stringify(entry));
}

export class ConfirmCitizenRegistrationTool {
  readonly key = 'confirmCitizenRegistration';

  constructor(
    private readonly citizens: CitizenRepository,
    private readonly ticketService?: TicketService,
  ) {}

  async execute(input: unknown): Promise<unknown> {
    const parsed = confirmCitizenRegistrationSchema.safeParse(input);
    if (!parsed.success) {
      return { error: 'INVALID_INPUT', details: parsed.error.issues };
    }

    const { citizenId, phone, conversationId } = parsed.data;
    const normalizedPhone = phone ? normalizePhoneForStorage(phone) : undefined;

    const citizen = await this.citizens.findByIdOrPhone({
      citizenId,
      normalizedPhone,
    });

    if (!citizen) {
      return { error: 'CITIZEN_NOT_FOUND' };
    }

    const profileComplete = citizenHasCompleteRegistrationProfile({
      name: citizen.name,
      phone: citizen.phone,
      neighborhoodId: citizen.neighborhoodId,
      neighborhood: citizen.neighborhood,
    });
    if (!profileComplete) {
      return {
        confirmed: false,
        error: 'INCOMPLETE_PROFILE',
        citizen,
      };
    }

    const updated = await this.citizens.updateLeadStatus(citizen.id, LeadStatus.converted);

    // Cierre del ticket de registro: el registro completo cierra el caso actual
    // dejando trazabilidad. El FSM transiciona REGISTERING → BOT_FLOW por separado
    // (ToolRunner), de modo que la IA sigue disponible para una nueva solicitud,
    // y el próximo mensaje del ciudadano abrirá un ticket nuevo automáticamente.
    let ticketClosed = false;
    if (this.ticketService && conversationId) {
      try {
        const activeTicket = await this.ticketService.getActiveTicketByConversation(conversationId);
        if (activeTicket) {
          await this.ticketService.closeTicket(activeTicket.id, {
            reason: REGISTRATION_CLOSE_REASON,
            summary: 'Registro ciudadano completado y confirmado.',
          });
          ticketClosed = true;
          log('info', 'registration.ticket_closed', {
            conversationId,
            ticketId: activeTicket.id,
            citizenId: citizen.id,
            reason: REGISTRATION_CLOSE_REASON,
          });
        }
      } catch (err: unknown) {
        // El cierre de ticket no debe invalidar la confirmación del registro.
        log('warn', 'registration.ticket_close_failed', {
          conversationId,
          citizenId: citizen.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return {
      confirmed: true,
      ticketClosed,
      closeReason: ticketClosed ? REGISTRATION_CLOSE_REASON : undefined,
      citizen: {
        id: updated.id,
        phone: updated.phone,
        leadStatus: updated.leadStatus,
      },
    };
  }
}
