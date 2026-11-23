import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  createLogRateLimiter,
  createStructuredLogger,
  isLogLevelEnabled,
} from '../../utils/structured-logger';
import { withEnv } from '../helpers/with-env';

describe('structured logger', () => {
  let restore: (() => void) | undefined;
  let logSpy: jest.SpiedFunction<typeof console.log>;
  let debugSpy: jest.SpiedFunction<typeof console.debug>;

  beforeEach(() => {
    restore = withEnv({ LOG_LEVEL: 'info' });
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    debugSpy = jest.spyOn(console, 'debug').mockImplementation(() => undefined);
  });

  afterEach(() => {
    restore?.();
    logSpy.mockRestore();
    debugSpy.mockRestore();
  });

  it('filters entries below the configured level', () => {
    const log = createStructuredLogger('TestService');

    log('debug', 'test.debug');
    log('info', 'test.info');

    expect(debugSpy).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledTimes(1);
  });

  it('emits structured JSON without requiring a correlation id', () => {
    const log = createStructuredLogger('Worker');

    log('info', 'worker.started', undefined, { workersEnabled: true });

    const entry = JSON.parse(String(logSpy.mock.calls[0]?.[0])) as Record<string, unknown>;
    expect(entry).toMatchObject({
      level: 'info',
      service: 'Worker',
      event: 'worker.started',
      workersEnabled: true,
    });
    expect(entry).not.toHaveProperty('correlationId');
  });

  it('enables debug output explicitly', () => {
    restore?.();
    restore = withEnv({ LOG_LEVEL: 'debug' });
    const log = createStructuredLogger('TestService');

    log('debug', 'test.debug');

    expect(debugSpy).toHaveBeenCalledTimes(1);
    expect(isLogLevelEnabled('debug')).toBe(true);
  });

  it('rate-limits repeated keys independently', () => {
    let nowMs = 1_000;
    const shouldLog = createLogRateLimiter(60_000, () => nowMs);

    expect(shouldLog('redis-dequeue')).toBe(true);
    expect(shouldLog('redis-dequeue')).toBe(false);
    expect(shouldLog('redis-promote')).toBe(true);
    nowMs += 60_000;
    expect(shouldLog('redis-dequeue')).toBe(true);
  });
});
