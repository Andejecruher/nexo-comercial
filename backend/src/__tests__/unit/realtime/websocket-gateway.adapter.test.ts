import { createServer } from 'http';
import { describe, expect, it, jest } from '@jest/globals';

const createAdapter = jest.fn(() => jest.fn());
const topicExists = jest.fn<() => Promise<[boolean]>>();
const topicCreate = jest.fn<() => Promise<unknown>>();
const topicFn = jest.fn(() => ({ exists: topicExists, create: topicCreate }));

jest.mock('@socket.io/gcp-pubsub-adapter', () => ({
  createAdapter: (...args: Parameters<typeof createAdapter>) => createAdapter(...args),
}));

jest.mock('@google-cloud/pubsub', () => ({
  PubSub: jest.fn().mockImplementation(() => ({ topic: topicFn })),
}));

import { WebsocketGatewayService } from '../../../services/realtime/websocket-gateway.service';

describe('WebsocketGatewayService GCP adapter wiring', () => {
  it('does not create a Pub/Sub adapter when the flag is off', async () => {
    createAdapter.mockClear();
    const httpServer = createServer();
    const gateway = await WebsocketGatewayService.create(httpServer, {
      corsOrigin: '*',
      path: '/socket.io',
      pubsubAdapter: {
        enabled: false,
        topicName: 'socketio-adapter',
        subscriptionPrefix: 'socket.io',
      },
    });

    expect(createAdapter).not.toHaveBeenCalled();
    gateway.dispose();
    httpServer.close();
  });

  it('creates the adapter topic and waits for init when enabled', async () => {
    createAdapter.mockClear();
    topicExists.mockResolvedValue([true]);
    const init = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
    class MockAdapter {
      constructor(_nsp: unknown) {}
      init() {
        return init();
      }
      close() {
        return undefined;
      }
    }
    createAdapter.mockReturnValue(MockAdapter as never);

    const httpServer = createServer();
    const gateway = await WebsocketGatewayService.create(httpServer, {
      corsOrigin: '*',
      path: '/socket.io',
      pubsubAdapter: {
        enabled: true,
        projectId: 'demo-project',
        topicName: 'socketio-adapter',
        subscriptionPrefix: 'socket.io',
      },
    });

    expect(topicFn).toHaveBeenCalledWith('socketio-adapter');
    expect(createAdapter).toHaveBeenCalled();
    expect(init).toHaveBeenCalled();
    gateway.dispose();
    httpServer.close();
  });
});
