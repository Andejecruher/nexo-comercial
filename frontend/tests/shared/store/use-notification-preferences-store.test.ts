import { notificationPreferencesApi } from '@/lib/shared/notification-preferences-api';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useNotificationPreferencesStore,
  type UserNotificationPreferences,
} from '@/store/shared/use-notification-preferences-store';

const USER_ID = 'a0a0a0a0-a0a0-4a0a-a0a0-a0a0a0a0a0a0';
const DEPT_A = 'b1b1b1b1-b1b1-4b1b-b1b1-b1b1b1b1b1b1';
const DEPT_B = 'c2c2c2c2-c2c2-4c2c-a2c2-c2c2c2c2c2c2';

const DEFAULTS: UserNotificationPreferences = {
  version: 1,
  enabled: true,
  soundEnabled: true,
  toastEnabled: true,
  events: {
    newMessage: { sound: true, toast: true },
    departmentTransfer: { sound: true, toast: true },
    ticketClosed: { sound: false, toast: true },
  },
  scope: { mode: 'ALL', departmentIds: [], agentIds: [] },
};

vi.mock('@/lib/shared/notification-preferences-api', () => ({
  notificationPreferencesApi: {
    get: vi.fn(),
    put: vi.fn(),
  },
}));

describe('useNotificationPreferencesStore', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    useNotificationPreferencesStore.setState({
      byUserId: {
        [USER_ID]: { local: { ...DEFAULTS }, server: { ...DEFAULTS } },
      },
      currentUserId: USER_ID,
      status: 'idle',
      error: null,
      isHydrated: true,
    });
    vi.mocked(notificationPreferencesApi.get).mockReset();
    vi.mocked(notificationPreferencesApi.put).mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('derives ALL mode from empty departmentIds', () => {
    const { result } = renderHook(() => useNotificationPreferencesStore());

    act(() => result.current.setDepartmentIds([]));

    expect(result.current.preferences().scope.mode).toBe('ALL');
    expect(result.current.preferences().scope.departmentIds).toEqual([]);
  });

  it('derives SELECTED mode when departmentIds are provided', () => {
    const { result } = renderHook(() => useNotificationPreferencesStore());

    act(() => result.current.setDepartmentIds([DEPT_A, DEPT_B]));

    expect(result.current.preferences().scope.mode).toBe('SELECTED');
    expect(result.current.preferences().scope.departmentIds).toEqual([DEPT_A, DEPT_B]);
  });

  it('debounces saving departmentIds changes', async () => {
    vi.mocked(notificationPreferencesApi.put).mockResolvedValue({
      ok: true,
      data: {
        preferences: {
          ...DEFAULTS,
          scope: { mode: 'SELECTED', departmentIds: [DEPT_A], agentIds: [] },
        },
      },
    });

    const { result } = renderHook(() => useNotificationPreferencesStore());

    act(() => result.current.setDepartmentIds([DEPT_A]));
    expect(notificationPreferencesApi.put).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(400);
    });

    expect(notificationPreferencesApi.put).toHaveBeenCalledTimes(1);
    expect(notificationPreferencesApi.put).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: { mode: 'SELECTED', departmentIds: [DEPT_A], agentIds: [] },
      }),
    );
  });

  it('derives SELECTED mode when only agentIds are provided', () => {
    const { result } = renderHook(() => useNotificationPreferencesStore());

    act(() => result.current.setAgentIds(['agent-1']));

    expect(result.current.preferences().scope.mode).toBe('SELECTED');
    expect(result.current.preferences().scope.agentIds).toEqual(['agent-1']);
    expect(result.current.preferences().scope.departmentIds).toEqual([]);
  });

  it('keeps SELECTED mode when clearing departments while agents remain', () => {
    const { result } = renderHook(() => useNotificationPreferencesStore());

    act(() => result.current.setDepartmentIds([DEPT_A]));
    act(() => result.current.setAgentIds(['agent-1']));
    act(() => result.current.setDepartmentIds([]));

    expect(result.current.preferences().scope.mode).toBe('SELECTED');
    expect(result.current.preferences().scope.departmentIds).toEqual([]);
    expect(result.current.preferences().scope.agentIds).toEqual(['agent-1']);
  });
});
