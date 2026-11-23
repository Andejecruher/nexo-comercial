/**
 * AssignDepartmentV2Tool — internal AI tool (FSM V2).
 *
 * Responsabilidad:
 *  - Efecto de dominio: asocia el departmentSlug al ticket activo.
 *  - Devuelve el departmentSlug objetivo para que FsmRouterV2.executeToolTransition()
 *    aplique la transición de estado (→ DEPARTMENT_ROUTING) como única autoridad.
 *
 * Semántica activa: assignDepartment → DEPARTMENT_ROUTING + atención HUMANA
 * (el handoff silencia a la IA: attendanceMode=human, botEnabled=false).
 *
 * Contrato: execute(input: unknown): Promise<unknown>
 * No lanza AppError — devuelve error estructurado { error } para que el orchestrador lo maneje.
 */
import { z } from 'zod';
import { TicketService } from '../../services/tickets/ticket.service';
import { isOpenAt, parseServiceSchedule } from '../../utils/department-hours';
import {
  DepartmentSlugCandidate,
  resolveCanonicalDepartmentSlug,
} from '../../utils/department-slug';

export const assignDepartmentV2Schema = z.object({
  conversationId: z.string().min(1, 'conversationId is required'),
  departmentSlug: z.string().min(1, 'departmentSlug is required'),
});

export type AssignDepartmentV2Input = z.infer<typeof assignDepartmentV2Schema>;

export type AssignDepartmentV2Output = {
  conversationId: string;
  assigned: boolean;
  departmentSlug: string;
  /** El handoff a departamento silencia a la IA (atención humana). */
  aiActive: false;
  flowState: 'DEPARTMENT_ROUTING';
};

type DepartmentHoursRow = {
  slug: string;
  name: string;
  isActive: boolean;
  serviceHours: string | null;
  serviceSchedule: unknown;
};

/** Fuente de horario de departamento (subset usado por la tool). */
export interface DepartmentHoursSource {
  findHoursBySlug(slug: string): Promise<DepartmentHoursRow | null>;
  listActiveForResolution(): Promise<DepartmentSlugCandidate[]>;
}

/** Resultado cuando el departamento está fuera de horario (no se transfiere). */
export type AssignDepartmentClosedOutput = {
  conversationId: string;
  assigned: false;
  departmentSlug: string;
  departmentName?: string;
  reason: 'OUTSIDE_SERVICE_HOURS' | 'DEPARTMENT_INACTIVE';
  serviceHours?: string;
  aiActive: true;
};

/** Resultado cuando el slug solicitado no corresponde de forma única al catálogo activo. */
export type AssignDepartmentUnknownOutput = {
  conversationId: string;
  assigned: false;
  departmentSlug: string;
  reason: 'UNKNOWN_DEPARTMENT';
  availableDepartments: DepartmentSlugCandidate[];
  aiActive: true;
};

type ResolvedDepartment = {
  departmentSlug: string;
  department: DepartmentHoursRow | null;
};

function log(
  level: 'info' | 'warn' | 'error',
  event: string,
  data?: Record<string, unknown>,
): void {
  const entry = {
    ts: new Date().toISOString(),
    level,
    service: 'AssignDepartmentV2Tool',
    event,
    fsmVersion: 'v2',
    ...data,
  };
  // eslint-disable-next-line no-console
  console[level](JSON.stringify(entry));
}

export class AssignDepartmentV2Tool {
  readonly key = 'assignDepartment';

  /**
   * @param ticketService Servicio de tickets (opcional).
   * @param hoursSource   Fuente de horario del departamento. Si se provee, se
   *                      valida la disponibilidad antes de transferir.
   * @param now           Proveedor de "ahora" (inyectable para tests).
   * @param fallbackTz    Zona horaria por defecto para evaluar el horario.
   */
  constructor(
    private readonly ticketService?: TicketService,
    private readonly hoursSource?: DepartmentHoursSource,
    private readonly now: () => Date = () => new Date(),
    private readonly fallbackTz: string = 'America/Mexico_City',
  ) {}

  async execute(input: unknown): Promise<unknown> {
    const parsed = assignDepartmentV2Schema.safeParse(input);
    if (!parsed.success) {
      log('warn', 'fsm_v2.assign_department.invalid_input', {
        errors: parsed.error.issues,
      });
      return { error: 'INVALID_INPUT', details: parsed.error.issues };
    }

    const { conversationId, departmentSlug: requestedDepartmentSlug } = parsed.data;

    const resolution = await this.resolveDepartment(conversationId, requestedDepartmentSlug);
    if ('assigned' in resolution) {
      log('info', 'fsm_v2.assign_department.blocked', {
        conversationId,
        departmentSlug: requestedDepartmentSlug,
        reason: resolution.reason,
      });
      return resolution;
    }
    const { departmentSlug, department } = resolution;

    // Validación de horario laboral antes de transferir (best-effort).
    const availability = this.checkAvailability(conversationId, departmentSlug, department);
    if (availability) {
      log('info', 'fsm_v2.assign_department.blocked', {
        conversationId,
        departmentSlug,
        reason: availability.reason,
      });
      return availability;
    }

    try {
      // Ticket integration: asignar departmentSlug al ticket activo
      if (this.ticketService) {
        const activeTicket = await this.ticketService.getActiveTicketByConversation(conversationId);
        if (activeTicket) {
          await this.ticketService.assignTicket(activeTicket.id, { departmentSlug });
        }
      }

      log('info', 'fsm_v2.assign_department.success', {
        conversationId,
        departmentSlug,
        toState: 'DEPARTMENT_ROUTING',
      });

      const result: AssignDepartmentV2Output = {
        conversationId,
        assigned: true,
        departmentSlug,
        aiActive: false,
        flowState: 'DEPARTMENT_ROUTING',
      };

      return result;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log('error', 'fsm_v2.assign_department.error', { conversationId, departmentSlug, message });
      return { error: 'EXECUTION_ERROR', message };
    }
  }

  /**
   * Resuelve nombres y variantes de slug contra el catálogo activo. El lookup
   * exacto incluye departamentos inactivos para conservar ese motivo de bloqueo.
   * Ante un error de base mantiene la semántica fail-open existente.
   */
  private async resolveDepartment(
    conversationId: string,
    requestedDepartmentSlug: string,
  ): Promise<ResolvedDepartment | AssignDepartmentUnknownOutput> {
    if (!this.hoursSource) {
      return { departmentSlug: requestedDepartmentSlug, department: null };
    }

    try {
      const exactDepartment = await this.hoursSource.findHoursBySlug(requestedDepartmentSlug);
      if (exactDepartment) {
        return { departmentSlug: exactDepartment.slug, department: exactDepartment };
      }
    } catch (err: unknown) {
      log('warn', 'fsm_v2.assign_department.hours_lookup_failed', {
        conversationId,
        departmentSlug: requestedDepartmentSlug,
        error: err instanceof Error ? err.message : String(err),
      });
      return { departmentSlug: requestedDepartmentSlug, department: null };
    }

    let availableDepartments: DepartmentSlugCandidate[];
    try {
      availableDepartments = await this.hoursSource.listActiveForResolution();
    } catch (err: unknown) {
      log('warn', 'fsm_v2.assign_department.catalog_lookup_failed', {
        conversationId,
        departmentSlug: requestedDepartmentSlug,
        error: err instanceof Error ? err.message : String(err),
      });
      return { departmentSlug: requestedDepartmentSlug, department: null };
    }

    const resolution = resolveCanonicalDepartmentSlug(
      requestedDepartmentSlug,
      availableDepartments,
    );
    if (resolution.status !== 'matched') {
      return {
        conversationId,
        assigned: false,
        departmentSlug: requestedDepartmentSlug,
        reason: 'UNKNOWN_DEPARTMENT',
        availableDepartments,
        aiActive: true,
      };
    }

    try {
      const department = await this.hoursSource.findHoursBySlug(resolution.slug);
      return { departmentSlug: resolution.slug, department };
    } catch (err: unknown) {
      log('warn', 'fsm_v2.assign_department.canonical_hours_lookup_failed', {
        conversationId,
        requestedDepartmentSlug,
        departmentSlug: resolution.slug,
        error: err instanceof Error ? err.message : String(err),
      });
      return { departmentSlug: resolution.slug, department: null };
    }
  }

  /**
   * Verifica la disponibilidad del departamento canónico ya resuelto.
   */
  private checkAvailability(
    conversationId: string,
    departmentSlug: string,
    department: DepartmentHoursRow | null,
  ): AssignDepartmentClosedOutput | undefined {
    if (!department) return undefined;

    if (!department.isActive) {
      return {
        conversationId,
        assigned: false,
        departmentSlug,
        departmentName: department.name,
        reason: 'DEPARTMENT_INACTIVE',
        ...(department.serviceHours ? { serviceHours: department.serviceHours } : {}),
        aiActive: true,
      };
    }

    const schedule = parseServiceSchedule(department.serviceSchedule);
    if (isOpenAt(schedule, this.now(), this.fallbackTz)) {
      return undefined;
    }

    return {
      conversationId,
      assigned: false,
      departmentSlug,
      departmentName: department.name,
      reason: 'OUTSIDE_SERVICE_HOURS',
      ...(department.serviceHours ? { serviceHours: department.serviceHours } : {}),
      aiActive: true,
    };
  }
}
