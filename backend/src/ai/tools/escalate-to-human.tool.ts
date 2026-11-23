/**
 * EscalateToHumanTool — internal AI tool (FSM V2).
 *
 * Responsabilidad:
 *  - Validar que la transición a ESCALATED es legal desde el estado actual.
 *  - Efecto de dominio: transicionar el ticket activo a IN_PROGRESS.
 *  - La escritura de estado (→ ESCALATED) la aplica FsmRouterV2.executeToolTransition()
 *    como única autoridad de estado.
 *
 * Contrato: execute(input: unknown): Promise<unknown>
 * No lanza AppError — devuelve error estructurado { error } para que el orchestrador lo maneje.
 */
import { z } from 'zod';
import { VALID_TRANSITIONS } from '../../config/conversation-states';
import { PrismaService } from '../../services/prisma.service';
import { TicketService } from '../../services/tickets/ticket.service';
import { TicketStatus } from '../../services/tickets/ticket.types';
import { ConversationFlowState } from '../../types/whatsapp.types';
import { InvalidFsmTransitionError } from '../fsm/fsm-transitions';

export const escalateToHumanSchema = z.object({
  conversationId: z.string().min(1, 'conversationId is required'),
  reason: z.string().max(500).optional(),
});

export type EscalateToHumanInput = z.infer<typeof escalateToHumanSchema>;

export type EscalateToHumanOutput = {
  conversationId: string;
  escalated: boolean;
  flowState: 'ESCALATED';
  reason: string | undefined;
};

function log(
  level: 'info' | 'warn' | 'error',
  event: string,
  data?: Record<string, unknown>,
): void {
  const entry = {
    ts: new Date().toISOString(),
    level,
    service: 'EscalateToHumanTool',
    event,
    fsmVersion: 'v2',
    ...data,
  };
  // eslint-disable-next-line no-console
  console[level](JSON.stringify(entry));
}

export class EscalateToHumanTool {
  readonly key = 'escalateToHuman';

  constructor(
    private readonly prisma: PrismaService,
    private readonly ticketService?: TicketService,
  ) {}

  async execute(input: unknown): Promise<unknown> {
    const parsed = escalateToHumanSchema.safeParse(input);
    if (!parsed.success) {
      log('warn', 'fsm_v2.escalate.invalid_input', { errors: parsed.error.issues });
      return { error: 'INVALID_INPUT', details: parsed.error.issues };
    }

    const { conversationId, reason } = parsed.data;

    try {
      // Read current state to validate transition before any side effect
      const meta = await this.prisma.conversationMeta.findUnique({
        where: { conversationId },
        select: { flowState: true },
      });

      if (!meta) {
        log('error', 'fsm_v2.escalate.no_meta', { conversationId });
        return { error: 'NOT_FOUND', message: `ConversationMeta not found: ${conversationId}` };
      }

      const fromState = meta.flowState as ConversationFlowState;
      const toState: ConversationFlowState = 'ESCALATED';

      const allowedTargets = VALID_TRANSITIONS[fromState];
      if (!allowedTargets?.includes(toState)) {
        const err = new InvalidFsmTransitionError(fromState, toState, 'escalateToHuman');
        log('warn', 'fsm_v2.escalate.invalid_transition', {
          conversationId,
          fromState,
          toState,
          error: err.message,
        });
        return { error: 'INVALID_TRANSITION', message: err.message };
      }

      // Ticket integration: transicionar ticket activo a IN_PROGRESS
      if (this.ticketService) {
        const activeTicket = await this.ticketService.getActiveTicketByConversation(conversationId);
        if (activeTicket) {
          await this.ticketService.updateStatus(activeTicket.id, TicketStatus.IN_PROGRESS, {
            ...(reason !== undefined && { escalationReason: reason }),
          });
        }
      }

      log('info', 'fsm_v2.escalate.success', {
        conversationId,
        fromState,
        toState,
        reason,
      });

      const result: EscalateToHumanOutput = {
        conversationId,
        escalated: true,
        flowState: 'ESCALATED',
        reason,
      };

      return result;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log('error', 'fsm_v2.escalate.error', { conversationId, message });
      return { error: 'EXECUTION_ERROR', message };
    }
  }
}
