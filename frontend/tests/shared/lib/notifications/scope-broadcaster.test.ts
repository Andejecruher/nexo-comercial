import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  broadcastScopeChange,
  listenToScopeChanges,
} from '@/lib/shared/notifications/scope-broadcaster';

const USER_ID = 'user-1';
const DEPT_A = 'dept-a';
const DEPT_B = 'dept-b';

const channelsByName = new Map<string, MockBroadcastChannel[]>();

class MockBroadcastChannel {
  onmessage: ((event: MessageEvent) => void) | null = null;
  posted: unknown[] = [];

  constructor(public readonly name: string) {
    const list = channelsByName.get(name) ?? [];
    list.push(this);
    channelsByName.set(name, list);
  }

  postMessage(message: unknown) {
    this.posted.push(message);
    for (const channel of channelsByName.get(this.name) ?? []) {
      if (channel !== this && channel.onmessage) {
        channel.onmessage(new MessageEvent('message', { data: message }));
      }
    }
  }

  close() {
    const list = channelsByName.get(this.name) ?? [];
    const idx = list.indexOf(this);
    if (idx >= 0) list.splice(idx, 1);
  }
}

describe('scope-broadcaster', () => {
  let channels: MockBroadcastChannel[] = [];

  beforeEach(() => {
    channels = [];
    channelsByName.clear();
    vi.stubGlobal(
      'BroadcastChannel',
      vi.fn((name: string) => {
        const channel = new MockBroadcastChannel(name);
        channels.push(channel);
        return channel;
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('broadcasts scope changes through BroadcastChannel', () => {
    broadcastScopeChange(USER_ID, [DEPT_A, DEPT_B], ['agent-1', null]);

    expect(channels[0]?.posted).toHaveLength(1);
    expect(channels[0]?.posted[0]).toMatchObject({
      userId: USER_ID,
      departmentIds: [DEPT_A, DEPT_B],
      agentIds: ['agent-1', null],
    });
  });

  it('notifies listeners when another tab changes scope', () => {
    const listener = vi.fn();
    const unsubscribe = listenToScopeChanges(listener);

    broadcastScopeChange(USER_ID, [DEPT_A], ['agent-1']);

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER_ID,
        departmentIds: [DEPT_A],
        agentIds: ['agent-1'],
      }),
    );

    unsubscribe();
  });

  it('defaults agentIds to an empty array', () => {
    broadcastScopeChange(USER_ID, [DEPT_A]);

    expect(channels[0]?.posted[0]).toMatchObject({
      userId: USER_ID,
      departmentIds: [DEPT_A],
      agentIds: [],
    });
  });
});
