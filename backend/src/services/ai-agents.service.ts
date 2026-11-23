/**
 * Servicio de consulta de agentes IA para la bandeja de conversaciones (inbox).
 * Expone los agentes ACTIVOS con sus líneas para poblar el filtro "Atendido por bot".
 * La atención por bot se deriva línea → agente (relación 1:1), sin conversaciones.bot_id.
 */
import type { PrismaService } from './prisma.service';

export type AiAgentLineDto = { id: string; name: string };
export type AiAgentListItem = { id: string; name: string; lines: AiAgentLineDto[] };

export class AiAgentsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Lista agentes activos con sus líneas asignadas.
   * `lineId` (opcional) restringe el resultado a los agentes de esa línea.
   */
  async listActiveAgents(lineId?: string): Promise<AiAgentListItem[]> {
    const agents = await this.prisma.aiAgent.findMany({
      where: {
        isActive: true,
        ...(lineId ? { communicationLines: { some: { id: lineId } } } : {}),
      },
      select: {
        id: true,
        name: true,
        communicationLines: {
          ...(lineId ? { where: { id: lineId } } : {}),
          select: { id: true, displayName: true },
          orderBy: { displayName: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    });

    return agents.map((agent) => ({
      id: agent.id,
      name: agent.name,
      lines: agent.communicationLines.map((line) => ({ id: line.id, name: line.displayName })),
    }));
  }
}
