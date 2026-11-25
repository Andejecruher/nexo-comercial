import { notificationPreferencesApi } from '@/lib/shared/notification-preferences-api';
import {
  useNotificationPreferencesStore,
  type UserNotificationPreferences,
} from '@/store/shared/use-notification-preferences-store';
import { useSoundPreferencesStore } from '@/store/shared/use-sound-preferences-store';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useNotificationSettings } from '@/hooks/shared/useNotificationSettings';

const STORAGE_KEY = 'vc-notification-preferences-v2';
const USER_ID = 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0';

function stubNotificationApi(
  permission: NotificationPermission,
  requestPermission = vi.fn(async () => permission),
) {
  const NotificationMock = vi.fn();
  Object.defineProperties(NotificationMock, {
    permission: { configurable: true, value: permission },
    requestPermission: { configurable: true, value: requestPermission },
  });
  vi.stubGlobal('Notification', NotificationMock);
  return { NotificationMock, requestPermission };
}

vi.mock('@/lib/shared/notification-preferences-api', () => ({
  notificationPreferencesApi: {
    get: vi.fn(),
    put: vi.fn(),
  },
}));

describe('useNotificationSettings', () => {
  beforeEach(() => {
    localStorage.removeItem(STORAGE_KEY);
    useNotificationPreferencesStore.setState({
      byUserId: {
        [USER_ID]: {
          local: { ...useNotificationPreferencesStore.getState().preferences() },
          server: { ...useNotificationPreferencesStore.getState().preferences() },
        },
      },
      currentUserId: USER_ID,
      status: 'idle',
      error: null,
      isHydrated: true,
    });
    useSoundPreferencesStore.getState().resetPreferences();
    vi.mocked(notificationPreferencesApi.get).mockReset();
    vi.mocked(notificationPreferencesApi.put).mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('reflects default preferences', () => {
    const { result } = renderHook(() => useNotificationSettings());
    expect(result.current.enabled).toBe(true);
    expect(result.current.soundEnabled).toBe(true);
    expect(result.current.toastEnabled).toBe(true);
    expect(result.current.events.newMessage).toEqual({ sound: true, toast: true });
  });

  it('toggles master, sound and toast channels', () => {
    const { result } = renderHook(() => useNotificationSettings());

    act(() => result.current.setEnabled(false));
    expect(result.current.enabled).toBe(false);

    act(() => result.current.setSoundEnabled(false));
    expect(result.current.soundEnabled).toBe(false);

    act(() => result.current.setToastEnabled(false));
    expect(result.current.toastEnabled).toBe(false);
  });

  it('toggles per-event channels', () => {
    const { result } = renderHook(() => useNotificationSettings());

    act(() => result.current.setEventChannel('ticketClosed', 'sound', true));
    expect(result.current.events.ticketClosed.sound).toBe(true);

    act(() => result.current.setEventChannel('newMessage', 'toast', false));
    expect(result.current.events.newMessage.toast).toBe(false);
  });

  it('saves preferences to the backend', async () => {
    stubNotificationApi('granted');
    vi.mocked(notificationPreferencesApi.put).mockResolvedValue({
      ok: true,
      data: { preferences: useNotificationPreferencesStore.getState().preferences() },
    });

    const { result } = renderHook(() => useNotificationSettings());

    act(() => result.current.setEnabled(false));

    await act(async () => {
      await result.current.save();
    });

    expect(notificationPreferencesApi.put).toHaveBeenCalledTimes(1);
    expect(notificationPreferencesApi.put).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false }),
    );
  });

  it('reverts local changes when reset is called', () => {
    act(() => {
      useNotificationPreferencesStore.setState((state) => ({
        byUserId: {
          ...state.byUserId,
          [USER_ID]: {
            ...state.byUserId[USER_ID],
            server: {
              ...state.byUserId[USER_ID].server,
              enabled: false,
            } as UserNotificationPreferences,
          },
        },
      }));
    });

    const { result } = renderHook(() => useNotificationSettings());
    expect(result.current.enabled).toBe(false);

    act(() => result.current.setEnabled(true));
    expect(result.current.enabled).toBe(true);

    act(() => result.current.reset());
    expect(result.current.enabled).toBe(false);
  });
});
