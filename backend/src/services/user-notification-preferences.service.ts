import { z } from 'zod';
import { AiAgentRepository } from '../repositories/ai-agent.repository';
import { DepartmentRepository } from '../repositories/department.repository';
import { UserNotificationPreferencesRepository } from '../repositories/user-notification-preferences.repository';
import { AppError } from '../utils/app-error';

export const NotificationEventChannelSchema = z.object({
  sound: z.boolean(),
  toast: z.boolean(),
});

export const NotificationScopeSchema = z.object({
  mode: z.enum(['ALL', 'SELECTED']),
  departmentIds: z.array(z.string().uuid()),
  /** `null` = "Todos los bots" (líneas con agente IA activo). */
  agentIds: z.array(z.string().uuid().nullable()),
});

export const UserNotificationPreferencesSchema = z.object({
  version: z.literal(1),
  enabled: z.boolean(),
  soundEnabled: z.boolean(),
  toastEnabled: z.boolean(),
  events: z.object({
    newMessage: NotificationEventChannelSchema,
    departmentTransfer: NotificationEventChannelSchema,
    ticketClosed: NotificationEventChannelSchema,
  }),
  scope: NotificationScopeSchema,
});

export type UserNotificationPreferences = z.infer<typeof UserNotificationPreferencesSchema>;

export const DEFAULT_PREFERENCES: UserNotificationPreferences = {
  version: 1,
  enabled: true,
  soundEnabled: true,
  toastEnabled: true,
  events: {
    newMessage: { sound: true, toast: true },
    departmentTransfer: { sound: true, toast: true },
    ticketClosed: { sound: false, toast: true },
  },
  scope: {
    mode: 'ALL',
    departmentIds: [],
    agentIds: [],
  },
};

function mergeWithDefaults(persisted: unknown): UserNotificationPreferences {
  const partial = typeof persisted === 'object' && persisted !== null ? (persisted as Partial<UserNotificationPreferences>) : {};
  return {
    ...DEFAULT_PREFERENCES,
    ...partial,
    events: {
      ...DEFAULT_PREFERENCES.events,
      ...(partial.events ?? {}),
    },
    scope: {
      ...DEFAULT_PREFERENCES.scope,
      ...(partial.scope ?? {}),
    },
  };
}

export class UserNotificationPreferencesService {
  constructor(
    private readonly preferencesRepo: UserNotificationPreferencesRepository,
    private readonly departmentRepo: DepartmentRepository,
    private readonly aiAgentRepo: AiAgentRepository,
  ) {}

  async getForUser(userId: string): Promise<UserNotificationPreferences> {
    const row = await this.preferencesRepo.findByUserId(userId);
    if (!row) return DEFAULT_PREFERENCES;
    return mergeWithDefaults(row.preferences);
  }

  async update(
    userId: string,
    payload: unknown,
  ): Promise<UserNotificationPreferences> {
    let parsed: UserNotificationPreferences;
    try {
      parsed = UserNotificationPreferencesSchema.parse(payload);
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new AppError(
          'Preferencias inválidas',
          400,
          'BAD_REQUEST',
          error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
        );
      }
      throw error;
    }

    if (parsed.scope.mode === 'SELECTED' && parsed.scope.departmentIds.length > 0) {
      const departments = await this.departmentRepo.findByIds(parsed.scope.departmentIds);
      const missing = parsed.scope.departmentIds.filter(
        (id) => !departments.some((d) => d.id === id && d.isActive),
      );
      if (missing.length > 0) {
        throw AppError.badRequest('Uno o más departamentos seleccionados no existen o están inactivos');
      }
    }

    const agentIds = parsed.scope.agentIds.filter((id): id is string => id !== null);
    if (parsed.scope.mode === 'SELECTED' && agentIds.length > 0) {
      const agents = await this.aiAgentRepo.findActiveByIds(agentIds);
      const found = new Set(agents.map((agent) => agent.id));
      const missing = agentIds.filter((id) => !found.has(id));
      if (missing.length > 0) {
        throw AppError.badRequest('Uno o más agentes de IA seleccionados no existen o están inactivos');
      }
    }

    const row = await this.preferencesRepo.upsert(userId, parsed);
    return mergeWithDefaults(row.preferences);
  }
}
