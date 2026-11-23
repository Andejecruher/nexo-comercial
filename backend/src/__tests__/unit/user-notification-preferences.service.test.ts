import { describe, expect, it, jest } from '@jest/globals';
import { AiAgentRepository } from '../../repositories/ai-agent.repository';
import { DepartmentRepository } from '../../repositories/department.repository';
import { UserNotificationPreferencesRepository } from '../../repositories/user-notification-preferences.repository';
import {
  DEFAULT_PREFERENCES,
  UserNotificationPreferencesService,
} from '../../services/user-notification-preferences.service';

const USER_ID = 'a0a0a0a0-a0a0-4a0a-a0a0-a0a0a0a0a0a0';
const DEPT_A = 'b1b1b1b1-b1b1-4b1b-b1b1-b1b1b1b1b1b1';
const DEPT_B = 'c2c2c2c2-c2c2-4c2c-a2c2-c2c2c2c2c2c2';
const AGENT_A = 'd3d3d3d3-d3d3-4d3d-a3d3-d3d3d3d3d3d3';
const AGENT_B = 'e4e4e4e4-e4e4-4e4e-a4e4-e4e4e4e4e4e4';

describe('UserNotificationPreferencesService', () => {
  const aiAgentRepo = {
    findActiveByIds: jest.fn(async () => []),
  } as unknown as AiAgentRepository;

  it('returns defaults when the user has no stored preferences', async () => {
    const repo = {
      findByUserId: jest.fn(async () => null),
      upsert: jest.fn(),
    } as unknown as UserNotificationPreferencesRepository;
    const deptRepo = {} as DepartmentRepository;
    const service = new UserNotificationPreferencesService(repo, deptRepo, aiAgentRepo);

    const prefs = await service.getForUser(USER_ID);

    expect(prefs).toEqual(DEFAULT_PREFERENCES);
  });

  it('merges stored partial preferences with defaults', async () => {
    const repo = {
      findByUserId: jest.fn(async () => ({
        preferences: {
          enabled: false,
          events: { newMessage: { sound: false, toast: true } },
        },
      })),
      upsert: jest.fn(),
    } as unknown as UserNotificationPreferencesRepository;
    const deptRepo = {} as DepartmentRepository;
    const service = new UserNotificationPreferencesService(repo, deptRepo, aiAgentRepo);

    const prefs = await service.getForUser(USER_ID);

    expect(prefs.enabled).toBe(false);
    expect(prefs.soundEnabled).toBe(DEFAULT_PREFERENCES.soundEnabled);
    expect(prefs.events.newMessage).toEqual({ sound: false, toast: true });
    expect(prefs.events.departmentTransfer).toEqual(DEFAULT_PREFERENCES.events.departmentTransfer);
    expect(prefs.scope.agentIds).toEqual([]);
  });

  it('validates that selected departments exist and are active', async () => {
    const repo = {
      findByUserId: jest.fn(async () => null),
      upsert: jest.fn(),
    } as unknown as UserNotificationPreferencesRepository;
    const deptRepo = {
      findByIds: jest.fn(async () => [{ id: DEPT_A, slug: 'dept-a', isActive: true }]),
    } as unknown as DepartmentRepository;
    const service = new UserNotificationPreferencesService(repo, deptRepo, aiAgentRepo);

    await expect(
      service.update(USER_ID, {
        ...DEFAULT_PREFERENCES,
        scope: { mode: 'SELECTED', departmentIds: [DEPT_A, DEPT_B], agentIds: [] },
      }),
    ).rejects.toThrow('no existen o están inactivos');
  });

  it('rejects on invalid addressee when selected agentIds are provided', async () => {
    const repo = {
      findByUserId: jest.fn(async () => null),
      upsert: jest.fn(),
    } as unknown as UserNotificationPreferencesRepository;
    const deptRepo = {} as DepartmentRepository;
    const aiRepo = {
      findActiveByIds: jest.fn(async () => [{ id: AGENT_A, isActive: true }]),
    } as unknown as AiAgentRepository;
    const service = new UserNotificationPreferencesService(repo, deptRepo, aiRepo);

    await expect(
      service.update(USER_ID, {
        ...DEFAULT_PREFERENCES,
        scope: { mode: 'SELECTED', departmentIds: [], agentIds: [AGENT_A, AGENT_B] },
      }),
    ).rejects.toThrow('no existen o están inactivos');
  });

  it('upserts valid preferences', async () => {
    const upsert = jest.fn(async (_userId: string, prefs: unknown) => ({ preferences: prefs }));
    const repo = {
      findByUserId: jest.fn(async () => null),
      upsert,
    } as unknown as UserNotificationPreferencesRepository;
    const deptRepo = {
      findByIds: jest.fn(async () => [
        { id: DEPT_A, slug: 'dept-a', isActive: true },
        { id: DEPT_B, slug: 'dept-b', isActive: true },
      ]),
    } as unknown as DepartmentRepository;
    const aiRepo = {
      findActiveByIds: jest.fn(async () => [{ id: AGENT_A, isActive: true }]),
    } as unknown as AiAgentRepository;
    const service = new UserNotificationPreferencesService(repo, deptRepo, aiRepo);

    const payload = {
      ...DEFAULT_PREFERENCES,
      scope: { mode: 'SELECTED', departmentIds: [DEPT_A, DEPT_B], agentIds: [AGENT_A] },
    };
    const prefs = await service.update(USER_ID, payload);

    expect(prefs.scope.departmentIds).toEqual([DEPT_A, DEPT_B]);
    expect(prefs.scope.agentIds).toEqual([AGENT_A]);
    expect(upsert).toHaveBeenCalledWith(USER_ID, payload);
  });
});
