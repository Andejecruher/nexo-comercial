import { describe, expect, it } from 'vitest';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  type UserNotificationPreferences,
} from '@/store/shared/use-notification-preferences-store';
import { shouldNotify } from '@/lib/shared/notifications/should-notify';

const DEPT_A = 'a0a0a0a0-a0a0-4a0a-a0a0-a0a0a0a0a0a0';
const DEPT_B = 'b1b1b1b1-b1b1-4b1b-b1b1-b1b1b1b1b1b1';
const DEPT_C = 'c2c2c2c2-c2c2-4c2c-a2c2-c2c2c2c2c2c2';

function prefs(overrides: Partial<UserNotificationPreferences> = {}): UserNotificationPreferences {
  return { ...DEFAULT_NOTIFICATION_PREFERENCES, ...overrides };
}

describe('shouldNotify', () => {
  it('blocks everything when the master switch is off', () => {
    const decision = shouldNotify(
      { eventType: 'newMessage', departmentId: DEPT_A },
      prefs({ enabled: false }),
    );
    expect(decision).toEqual({ sound: false, toast: false });
  });

  it('blocks an event with both channels disabled', () => {
    const decision = shouldNotify(
      { eventType: 'newMessage', departmentId: DEPT_A },
      prefs({
        events: {
          newMessage: { sound: false, toast: false },
          departmentTransfer: { sound: true, toast: true },
          ticketClosed: { sound: true, toast: true },
        },
      }),
    );
    expect(decision).toEqual({ sound: false, toast: false });
  });

  it('honours global channel switches', () => {
    expect(
      shouldNotify(
        { eventType: 'newMessage', departmentId: DEPT_A },
        prefs({ soundEnabled: false }),
      ),
    ).toEqual({ sound: false, toast: true });

    expect(
      shouldNotify(
        { eventType: 'newMessage', departmentId: DEPT_A },
        prefs({ toastEnabled: false }),
      ),
    ).toEqual({ sound: true, toast: false });
  });

  it('allows everything when scope departmentIds is empty', () => {
    const decision = shouldNotify({ eventType: 'newMessage', departmentId: DEPT_A }, prefs());
    expect(decision).toEqual({ sound: true, toast: true });
  });

  it('restricts to selected departments', () => {
    const decision = shouldNotify(
      { eventType: 'newMessage', departmentId: DEPT_B },
      prefs({
        scope: { mode: 'SELECTED', departmentIds: [DEPT_A, DEPT_C], agentIds: [] },
      }),
    );
    expect(decision).toEqual({ sound: false, toast: false });
  });

  it('allows a selected department', () => {
    const decision = shouldNotify(
      { eventType: 'newMessage', departmentId: DEPT_A },
      prefs({
        scope: { mode: 'SELECTED', departmentIds: [DEPT_A, DEPT_C], agentIds: [] },
      }),
    );
    expect(decision).toEqual({ sound: true, toast: true });
  });

  it('blocks events without department when scope is restricted', () => {
    expect(
      shouldNotify(
        { eventType: 'newMessage' },
        prefs({ scope: { mode: 'SELECTED', departmentIds: [DEPT_A], agentIds: [] } }),
      ),
    ).toEqual({ sound: false, toast: false });
  });

  it('allows events without department when scope is unrestricted', () => {
    const decision = shouldNotify({ eventType: 'ticketClosed' }, prefs());
    expect(decision).toEqual({ sound: false, toast: true });
  });
});
