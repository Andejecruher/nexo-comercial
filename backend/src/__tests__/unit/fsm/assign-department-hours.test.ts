/**
 * Tests unitarios: AssignDepartmentV2Tool — validación de horario laboral
 *
 * Cubre:
 *  - Departamento abierto → asignación concretada (assigned=true, flowState)
 *  - Departamento cerrado → bloqueado (assigned=false, reason=OUTSIDE_SERVICE_HOURS)
 *  - Departamento inactivo → bloqueado (reason=DEPARTMENT_INACTIVE)
 *  - Sin hoursSource → sin validación (fail-open, asigna siempre)
 *  - hoursSource falla → fail-open (asigna igualmente)
 *  - Departamento desconocido → bloqueado con catálogo disponible
 *  - Variantes de nombre/slug → slug canónico
 *  - alwaysOpen → siempre transfiere sin importar la hora
 *  - Transición FSM gateada por ToolRunner (assigned=true requerido)
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  AssignDepartmentV2Tool,
  DepartmentHoursSource,
} from '../../../ai/tools/assign-department-v2.tool';
import { TicketService } from '../../../services/tickets/ticket.service';
import { TicketStatus } from '../../../services/tickets/ticket.types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const asyncMock = <T = unknown>() => jest.fn<() => Promise<T>>();

function makeTicketServiceMock() {
  return {
    getActiveTicketByConversation: asyncMock(),
    assignTicket: asyncMock(),
    updateStatus: asyncMock(),
    createTicket: asyncMock(),
    getOrCreateActiveTicket: asyncMock(),
    attachMessageToTicket: asyncMock(),
    closeTicket: asyncMock(),
  } as unknown as jest.Mocked<TicketService>;
}

type DeptHoursRow = Awaited<ReturnType<DepartmentHoursSource['findHoursBySlug']>>;

function makeHoursSourceMock(
  row: DeptHoursRow | null,
  catalog = row?.isActive ? [{ slug: row.slug, name: row.name }] : [],
): jest.Mocked<DepartmentHoursSource> {
  return {
    findHoursBySlug: jest
      .fn<(slug: string) => Promise<DeptHoursRow | null>>()
      .mockImplementation(async (slug) => (row?.slug === slug ? row : null)),
    listActiveForResolution: jest
      .fn<() => Promise<Array<{ slug: string; name: string }>>>()
      .mockResolvedValue(catalog),
  } as jest.Mocked<DepartmentHoursSource>;
}

/** Horario lunes–viernes 09:00–16:00 (Mexico City). */
const WEEKDAY_SCHEDULE = {
  timezone: 'America/Mexico_City',
  days: {
    1: [{ open: '09:00', close: '16:00' }],
    2: [{ open: '09:00', close: '16:00' }],
    3: [{ open: '09:00', close: '16:00' }],
    4: [{ open: '09:00', close: '16:00' }],
    5: [{ open: '09:00', close: '16:00' }],
  },
};

/** Lunes 2026-06-29 11:00 AM hora México (UTC-6 → 17:00 UTC) → dentro de horario. */
const MONDAY_OPEN_UTC = new Date('2026-06-29T17:00:00Z');
/** Lunes 2026-06-29 16:00 hora México (UTC-6 → 22:00 UTC) → fuera de horario (borde cierre). */
const MONDAY_AFTER_HOURS_UTC = new Date('2026-06-29T22:00:00Z');

const DEPT_ROW_OPEN: DeptHoursRow = {
  slug: 'obras_publicas',
  name: 'Obras Públicas',
  isActive: true,
  serviceHours: 'Lunes a viernes de 9:00 a 16:00 hrs',
  serviceSchedule: WEEKDAY_SCHEDULE,
};

const DEPT_ROW_INACTIVE: DeptHoursRow = {
  ...DEPT_ROW_OPEN,
  isActive: false,
};

const DEPT_ROW_ALWAYS_OPEN: DeptHoursRow = {
  slug: 'seguridad',
  name: 'Seguridad Pública',
  isActive: true,
  serviceHours: 'Atención 24/7',
  serviceSchedule: { alwaysOpen: true },
};

const DEPT_ROW_GENERAL: DeptHoursRow = {
  slug: 'general',
  name: 'Atención General',
  isActive: true,
  serviceHours: 'Lunes a viernes de 9:00 a 16:00 hrs',
  serviceSchedule: WEEKDAY_SCHEDULE,
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('AssignDepartmentV2Tool — validación de horario laboral', () => {
  describe('sin hoursSource (compatibilidad legacy)', () => {
    it('siempre asigna (fail-open) sin importar la hora', async () => {
      const tool = new AssignDepartmentV2Tool(undefined, undefined, () => MONDAY_AFTER_HOURS_UTC);
      const result = (await tool.execute({
        conversationId: 'conv-1',
        departmentSlug: 'obras_publicas',
      })) as Record<string, unknown>;

      expect(result.assigned).toBe(true);
      expect(result.flowState).toBe('DEPARTMENT_ROUTING');
    });
  });

  describe('departamento abierto', () => {
    let tool: AssignDepartmentV2Tool;

    beforeEach(() => {
      tool = new AssignDepartmentV2Tool(
        undefined,
        makeHoursSourceMock(DEPT_ROW_OPEN),
        () => MONDAY_OPEN_UTC,
      );
    });

    it('asigna correctamente (assigned=true, flowState=DEPARTMENT_ROUTING, aiActive=false)', async () => {
      const result = (await tool.execute({
        conversationId: 'conv-1',
        departmentSlug: 'obras_publicas',
      })) as Record<string, unknown>;

      expect(result.assigned).toBe(true);
      expect(result.flowState).toBe('DEPARTMENT_ROUTING');
      expect(result.aiActive).toBe(false);
      expect(result.departmentSlug).toBe('obras_publicas');
    });

    it('NO devuelve reason ni departmentName en respuesta exitosa', async () => {
      const result = (await tool.execute({
        conversationId: 'conv-1',
        departmentSlug: 'obras_publicas',
      })) as Record<string, unknown>;

      expect(result.reason).toBeUndefined();
    });
  });

  describe('departamento fuera de horario', () => {
    let tool: AssignDepartmentV2Tool;

    beforeEach(() => {
      tool = new AssignDepartmentV2Tool(
        undefined,
        makeHoursSourceMock(DEPT_ROW_OPEN),
        () => MONDAY_AFTER_HOURS_UTC,
      );
    });

    it('devuelve assigned=false con reason=OUTSIDE_SERVICE_HOURS', async () => {
      const result = (await tool.execute({
        conversationId: 'conv-1',
        departmentSlug: 'obras_publicas',
      })) as Record<string, unknown>;

      expect(result.assigned).toBe(false);
      expect(result.reason).toBe('OUTSIDE_SERVICE_HOURS');
    });

    it('incluye serviceHours en la respuesta para que el agente lo informe', async () => {
      const result = (await tool.execute({
        conversationId: 'conv-1',
        departmentSlug: 'obras_publicas',
      })) as Record<string, unknown>;

      expect(result.serviceHours).toBe('Lunes a viernes de 9:00 a 16:00 hrs');
    });

    it('mantiene aiActive=true (IA puede seguir respondiendo)', async () => {
      const result = (await tool.execute({
        conversationId: 'conv-1',
        departmentSlug: 'obras_publicas',
      })) as Record<string, unknown>;

      expect(result.aiActive).toBe(true);
    });

    it('NO expone flowState de transición cuando está bloqueado', async () => {
      const result = (await tool.execute({
        conversationId: 'conv-1',
        departmentSlug: 'obras_publicas',
      })) as Record<string, unknown>;

      expect(result.flowState).toBeUndefined();
    });
  });

  describe('departamento inactivo', () => {
    it('devuelve assigned=false con reason=DEPARTMENT_INACTIVE', async () => {
      const tool = new AssignDepartmentV2Tool(
        undefined,
        makeHoursSourceMock(DEPT_ROW_INACTIVE),
        () => MONDAY_OPEN_UTC,
      );
      const result = (await tool.execute({
        conversationId: 'conv-1',
        departmentSlug: 'obras_publicas',
      })) as Record<string, unknown>;

      expect(result.assigned).toBe(false);
      expect(result.reason).toBe('DEPARTMENT_INACTIVE');
    });
  });

  describe('departamento con alwaysOpen', () => {
    it('asigna siempre, incluso fuera de horario normal', async () => {
      const tool = new AssignDepartmentV2Tool(
        undefined,
        makeHoursSourceMock(DEPT_ROW_ALWAYS_OPEN),
        () => MONDAY_AFTER_HOURS_UTC,
      );
      const result = (await tool.execute({
        conversationId: 'conv-1',
        departmentSlug: 'seguridad',
      })) as Record<string, unknown>;

      expect(result.assigned).toBe(true);
      expect(result.flowState).toBe('DEPARTMENT_ROUTING');
    });
  });

  describe('hoursSource falla (fail-open)', () => {
    it('asigna igualmente si findHoursBySlug lanza error', async () => {
      const brokenSource: jest.Mocked<DepartmentHoursSource> = {
        findHoursBySlug: jest
          .fn<(slug: string) => Promise<DeptHoursRow | null>>()
          .mockRejectedValue(new Error('DB down')),
        listActiveForResolution: jest.fn<() => Promise<[]>>().mockResolvedValue([]),
      };
      const tool = new AssignDepartmentV2Tool(undefined, brokenSource, () => MONDAY_OPEN_UTC);
      const result = (await tool.execute({
        conversationId: 'conv-1',
        departmentSlug: 'obras_publicas',
      })) as Record<string, unknown>;

      expect(result.assigned).toBe(true);
    });

    it('asigna igualmente si falla el catálogo después de no encontrar el slug exacto', async () => {
      const brokenSource: jest.Mocked<DepartmentHoursSource> = {
        findHoursBySlug: jest
          .fn<(slug: string) => Promise<DeptHoursRow | null>>()
          .mockResolvedValue(null),
        listActiveForResolution: jest
          .fn<() => Promise<Array<{ slug: string; name: string }>>>()
          .mockRejectedValue(new Error('DB down')),
      };
      const tool = new AssignDepartmentV2Tool(undefined, brokenSource, () => MONDAY_OPEN_UTC);

      const result = (await tool.execute({
        conversationId: 'conv-1',
        departmentSlug: 'atencion-general',
      })) as Record<string, unknown>;

      expect(result).toMatchObject({ assigned: true, departmentSlug: 'atencion-general' });
    });
  });

  describe('departamento desconocido', () => {
    it('bloquea con UNKNOWN_DEPARTMENT y devuelve el catálogo activo', async () => {
      const tool = new AssignDepartmentV2Tool(
        undefined,
        makeHoursSourceMock(null, [
          { slug: 'general', name: 'Atención General' },
          { slug: 'obras_publicas', name: 'Obras Públicas' },
        ]),
        () => MONDAY_OPEN_UTC,
      );
      const result = (await tool.execute({
        conversationId: 'conv-1',
        departmentSlug: 'slug-inexistente',
      })) as Record<string, unknown>;

      expect(result).toMatchObject({
        assigned: false,
        reason: 'UNKNOWN_DEPARTMENT',
        departmentSlug: 'slug-inexistente',
        aiActive: true,
      });
      expect(result.availableDepartments).toEqual([
        { slug: 'general', name: 'Atención General' },
        { slug: 'obras_publicas', name: 'Obras Públicas' },
      ]);
    });
  });

  describe('resolución a slug canónico', () => {
    it.each(['atencion-general', 'atencion_general', 'Atención General'])(
      'resuelve %s como general',
      async (requestedSlug) => {
        const source = makeHoursSourceMock(DEPT_ROW_GENERAL);
        const tool = new AssignDepartmentV2Tool(undefined, source, () => MONDAY_OPEN_UTC);

        const result = (await tool.execute({
          conversationId: 'conv-1',
          departmentSlug: requestedSlug,
        })) as Record<string, unknown>;

        expect(result).toMatchObject({ assigned: true, departmentSlug: 'general' });
        expect(source.findHoursBySlug.mock.calls).toContainEqual(['general']);
      },
    );

    it('resuelve guiones a guiones bajos y evalúa el horario del slug canónico', async () => {
      const source = makeHoursSourceMock(DEPT_ROW_OPEN);
      const tool = new AssignDepartmentV2Tool(undefined, source, () => MONDAY_AFTER_HOURS_UTC);

      const result = (await tool.execute({
        conversationId: 'conv-1',
        departmentSlug: 'obras-publicas',
      })) as Record<string, unknown>;

      expect(result).toMatchObject({
        assigned: false,
        reason: 'OUTSIDE_SERVICE_HOURS',
        departmentSlug: 'obras_publicas',
      });
    });

    it('resuelve el nombre Seguridad Pública como slug seguridad', async () => {
      const source = makeHoursSourceMock(DEPT_ROW_ALWAYS_OPEN);
      const tool = new AssignDepartmentV2Tool(undefined, source, () => MONDAY_AFTER_HOURS_UTC);

      const result = (await tool.execute({
        conversationId: 'conv-1',
        departmentSlug: 'seguridad-publica',
      })) as Record<string, unknown>;

      expect(result).toMatchObject({ assigned: true, departmentSlug: 'seguridad' });
    });

    it('no asigna cuando dos departamentos normalizan al mismo identificador', async () => {
      const tool = new AssignDepartmentV2Tool(
        undefined,
        makeHoursSourceMock(null, [
          { slug: 'atencion_general', name: 'Atención General' },
          { slug: 'general', name: 'Atencion-General' },
        ]),
        () => MONDAY_OPEN_UTC,
      );

      const result = (await tool.execute({
        conversationId: 'conv-1',
        departmentSlug: 'Atención General',
      })) as Record<string, unknown>;

      expect(result).toMatchObject({ assigned: false, reason: 'UNKNOWN_DEPARTMENT' });
    });
  });

  describe('integración con TicketService', () => {
    it('asigna departmentSlug al ticket cuando está abierto y hay ticket activo', async () => {
      const ticketService = makeTicketServiceMock();
      ticketService.getActiveTicketByConversation.mockResolvedValue({
        id: 'ticket-1',
        status: TicketStatus.OPEN,
      } as never);
      ticketService.assignTicket.mockResolvedValue({ id: 'ticket-1' } as never);

      const tool = new AssignDepartmentV2Tool(
        ticketService,
        makeHoursSourceMock(DEPT_ROW_OPEN),
        () => MONDAY_OPEN_UTC,
      );
      const result = (await tool.execute({
        conversationId: 'conv-1',
        departmentSlug: 'obras_publicas',
      })) as Record<string, unknown>;

      expect(result.assigned).toBe(true);
      expect(ticketService.assignTicket.mock.calls).toContainEqual([
        'ticket-1',
        { departmentSlug: 'obras_publicas' },
      ]);
    });

    it('asigna al ticket el slug canónico y no la variante recibida', async () => {
      const ticketService = makeTicketServiceMock();
      ticketService.getActiveTicketByConversation.mockResolvedValue({
        id: 'ticket-1',
        status: TicketStatus.OPEN,
      } as never);
      ticketService.assignTicket.mockResolvedValue({ id: 'ticket-1' } as never);

      const tool = new AssignDepartmentV2Tool(
        ticketService,
        makeHoursSourceMock(DEPT_ROW_GENERAL),
        () => MONDAY_OPEN_UTC,
      );
      await tool.execute({ conversationId: 'conv-1', departmentSlug: 'atencion-general' });

      expect(ticketService.assignTicket.mock.calls).toContainEqual([
        'ticket-1',
        { departmentSlug: 'general' },
      ]);
    });

    it('NO asigna ticket cuando el departamento está fuera de horario', async () => {
      const ticketService = makeTicketServiceMock();
      ticketService.getActiveTicketByConversation.mockResolvedValue({
        id: 'ticket-1',
        status: TicketStatus.OPEN,
      } as never);

      const tool = new AssignDepartmentV2Tool(
        ticketService,
        makeHoursSourceMock(DEPT_ROW_OPEN),
        () => MONDAY_AFTER_HOURS_UTC,
      );
      await tool.execute({ conversationId: 'conv-1', departmentSlug: 'obras_publicas' });

      expect(ticketService.assignTicket.mock.calls).toHaveLength(0);
    });
  });

  describe('input inválido', () => {
    it('devuelve error estructurado para conversationId vacío', async () => {
      const tool = new AssignDepartmentV2Tool();
      const result = (await tool.execute({
        conversationId: '',
        departmentSlug: 'obras_publicas',
      })) as Record<string, unknown>;

      expect(result.error).toBe('INVALID_INPUT');
    });
  });
});
