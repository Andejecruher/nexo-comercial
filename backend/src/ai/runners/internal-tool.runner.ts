import { RealtimeNotifier } from '../../services/realtime/realtime-notifier.service';
/**
 * InternalToolRunner — dispatcher de tools internas del AI.
 *
 * Delega en tools individuales registradas en el mapa `toolMap`.
 * Cada tool implementa el contrato: execute(input: unknown): Promise<unknown>.
 *
 * FSM V2 única versión activa:
 *  - assignDepartment → DEPARTMENT_ROUTING
 *  - escalateToHuman  → ESCALATED
 *
 * Para agregar una nueva tool:
 *  1. Crear el archivo en `ai/tools/`.
 *  2. Instanciarla e inyectarla en el constructor.
 *  3. Registrarla en `toolMap` con su `key`.
 */
import { DepartmentRepository, EventRepository, NeighborhoodRepository } from '../../repositories';
import { CitizenRepository } from '../../repositories/citizen.repository';
import { ConversationRepository } from '../../repositories/conversation.repository';
import { MessageRepository } from '../../repositories/message.repository';
import { AuditService } from '../../services/audit.service';
import { OutboxProcessorService } from '../../services/events/outbox-processor.service';
import { PrismaService } from '../../services/prisma.service';
import { TicketService } from '../../services/tickets/ticket.service';
import { AssignDepartmentV2Tool } from '../tools/assign-department-v2.tool';
import { CloseConversationTool } from '../tools/close-conversation.tool';
import { CloseTicketTool } from '../tools/close-ticket.tool';
import { ConfirmCitizenRegistrationTool } from '../tools/confirm-citizen-registration.tool';
import { CreateCitizenTool } from '../tools/create-citizen.tool';
import { EscalateToHumanTool } from '../tools/escalate-to-human.tool';
import { GetMunicipalInfoTool } from '../tools/get-municipal-info.tool';
import { GetWeeklyEventsTool } from '../tools/get-weekly-events.tool';
import { SendMessageTool } from '../tools/send-message.tool';
import { TagCitizenTool } from '../tools/tag-citizen.tool';
import { UpdateCitizenProfileTool } from '../tools/update-citizen-profile.tool';
import { ValidateNeighborhoodTool } from '../tools/validate-neighborhood.tool';

interface InternalToolDeps {
  citizenRepo: CitizenRepository;
  conversationRepo: ConversationRepository;
  messageRepo: MessageRepository;
  outboxProcessor: OutboxProcessorService;
  prisma: PrismaService;
  auditService: AuditService;
  /** TicketService — opcional para compatibilidad con tests legacy sin tickets */
  ticketService?: TicketService;
  realtimeNotifier?: RealtimeNotifier;
}

interface InternalTool {
  execute(input: unknown): Promise<unknown>;
}

export class InternalToolRunner {
  private readonly toolMap: Map<string, InternalTool>;

  constructor(deps: InternalToolDeps) {
    const createCitizenTool = new CreateCitizenTool(deps.citizenRepo, deps.conversationRepo);

    const sendMessageTool = new SendMessageTool(
      deps.citizenRepo,
      deps.conversationRepo,
      deps.outboxProcessor,
      deps.prisma,
      deps.ticketService,
      deps.realtimeNotifier,
    );

    const tagCitizenTool = new TagCitizenTool(deps.prisma, deps.auditService);

    const closeConversationTool = new CloseConversationTool(deps.ticketService);
    const closeTicketTool = new CloseTicketTool(deps.ticketService);
    const eventRepo = new EventRepository(deps.prisma);
    const departmentRepo = new DepartmentRepository(deps.prisma);
    const getMunicipalInfoTool = new GetMunicipalInfoTool(eventRepo, departmentRepo);
    const getWeeklyEventsTool = new GetWeeklyEventsTool(eventRepo, eventRepo);
    const neighborhoodRepo = new NeighborhoodRepository(deps.prisma);
    const validateNeighborhoodTool = new ValidateNeighborhoodTool(neighborhoodRepo);
    const updateCitizenProfileTool = new UpdateCitizenProfileTool(
      deps.citizenRepo,
      neighborhoodRepo,
    );
    const confirmCitizenRegistrationTool = new ConfirmCitizenRegistrationTool(
      deps.citizenRepo,
      deps.ticketService,
    );

    const assignDepartmentV2Tool = new AssignDepartmentV2Tool(deps.ticketService, departmentRepo);

    const escalateToHumanTool = new EscalateToHumanTool(deps.prisma, deps.ticketService);

    const baseTools: [string, InternalTool][] = [
      [createCitizenTool.key, createCitizenTool],
      [validateNeighborhoodTool.key, validateNeighborhoodTool],
      [updateCitizenProfileTool.key, updateCitizenProfileTool],
      [confirmCitizenRegistrationTool.key, confirmCitizenRegistrationTool],
      [sendMessageTool.key, sendMessageTool],
      [tagCitizenTool.key, tagCitizenTool],
      [closeConversationTool.key, closeConversationTool],
      [closeTicketTool.key, closeTicketTool],
      [getMunicipalInfoTool.key, getMunicipalInfoTool],
      [getWeeklyEventsTool.key, getWeeklyEventsTool],
    ];

    const v2Tools: [string, InternalTool][] = [
      [assignDepartmentV2Tool.key, assignDepartmentV2Tool],
      [escalateToHumanTool.key, escalateToHumanTool],
    ];

    this.toolMap = new Map<string, InternalTool>([...baseTools, ...v2Tools]);
  }

  async execute(toolKey: string, input: Record<string, unknown>): Promise<Record<string, unknown>> {
    // Delegación a tools registradas
    const tool = this.toolMap.get(toolKey);
    if (tool) {
      const result = await tool.execute(input);
      return result as Record<string, unknown>;
    }

    throw new Error(`Unknown internal tool key: ${toolKey}`);
  }
}
