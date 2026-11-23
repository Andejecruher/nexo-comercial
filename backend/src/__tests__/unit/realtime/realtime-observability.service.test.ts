import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  createRealtimeMetrics,
  REALTIME_GAUGE_HEARTBEAT_MS,
} from '../../../services/realtime/realtime-observability.service';
import { withEnv } from '../../helpers/with-env';

describe('createRealtimeMetrics', () => {
  let restore: (() => void) | undefined;
  let logSpy: jest.SpiedFunction<typeof console.log>;
  let nowMs = 1_000;

  beforeEach(() => {
    restore = withEnv({ LOG_LEVEL: 'info' });
    nowMs = 1_000;
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    restore?.();
    logSpy.mockRestore();
  });

  function createMetrics() {
    return createRealtimeMetrics('worker', { now: () => nowMs });
  }

  function loggedGaugeNames(): string[] {
    return logSpy.mock.calls
      .map(([raw]) => JSON.parse(String(raw)) as { boundary?: string; name?: string; level?: string })
      .filter((entry) => entry.boundary === 'metrics.gauge')
      .map((entry) => entry.name ?? '');
  }

  it('logs a gauge the first time it is observed', () => {
    const metrics = createMetrics();
    metrics.setGauge('outbox_pending_count', 0, { status: 'pending_or_failed' });

    expect(loggedGaugeNames()).toEqual(['outbox_pending_count']);
  });

  it('does not log an unchanged gauge before the heartbeat interval', () => {
    const metrics = createMetrics();
    metrics.setGauge('outbox_pending_count', 0, { status: 'pending_or_failed' });
    nowMs += REALTIME_GAUGE_HEARTBEAT_MS - 1;
    metrics.setGauge('outbox_pending_count', 0, { status: 'pending_or_failed' });

    expect(loggedGaugeNames()).toEqual(['outbox_pending_count']);
  });

  it('logs again when the gauge value changes', () => {
    const metrics = createMetrics();
    metrics.setGauge('outbox_pending_count', 0, { status: 'pending_or_failed' });
    metrics.setGauge('outbox_pending_count', 3, { status: 'pending_or_failed' });

    const values = logSpy.mock.calls.map(([raw]) => {
      const entry = JSON.parse(String(raw)) as { value?: number };
      return entry.value;
    });
    expect(values).toEqual([0, 3]);
  });

  it('logs unchanged gauges again after the heartbeat interval', () => {
    const metrics = createMetrics();
    metrics.setGauge('outbox_oldest_pending_age_seconds', 0, { status: 'pending_or_failed' });
    nowMs += REALTIME_GAUGE_HEARTBEAT_MS;
    metrics.setGauge('outbox_oldest_pending_age_seconds', 0, { status: 'pending_or_failed' });

    expect(loggedGaugeNames()).toEqual([
      'outbox_oldest_pending_age_seconds',
      'outbox_oldest_pending_age_seconds',
    ]);
  });

  it('treats distinct label sets as independent gauges', () => {
    const metrics = createMetrics();
    metrics.setGauge('outbox_pending_count', 0, { status: 'pending_or_failed' });
    metrics.setGauge('outbox_pending_count', 0, { status: 'publishing' });

    expect(loggedGaugeNames()).toEqual(['outbox_pending_count', 'outbox_pending_count']);
  });

  it('still logs every counter increment', () => {
    const metrics = createMetrics();
    metrics.incrementCounter('relay_published', { status: 'published' });
    metrics.incrementCounter('relay_published', { status: 'published' });

    const counters = logSpy.mock.calls
      .map(([raw]) => JSON.parse(String(raw)) as { boundary?: string })
      .filter((entry) => entry.boundary === 'metrics.counter');
    expect(counters).toHaveLength(2);
  });

  it('emits metric logs at info level by default (log-based metrics)', () => {
    const metrics = createMetrics();

    metrics.setGauge('outbox_pending_count', 0);
    metrics.incrementCounter('relay_published');
    metrics.observeHistogram('relay_latency_ms', 12);

    const entries = logSpy.mock.calls.map(([raw]) => JSON.parse(String(raw)) as { boundary?: string; level?: string });
    expect(entries.map((entry) => entry.boundary)).toEqual([
      'metrics.gauge',
      'metrics.counter',
      'metrics.histogram',
    ]);
    expect(entries.every((entry) => entry.level === 'info')).toBe(true);
  });

  it('keeps metrics silent when LOG_LEVEL is warn or above', () => {
    restore?.();
    restore = withEnv({ LOG_LEVEL: 'warn' });
    const metrics = createMetrics();

    metrics.setGauge('outbox_pending_count', 0);
    metrics.incrementCounter('relay_published');
    metrics.observeHistogram('relay_latency_ms', 12);

    expect(logSpy).not.toHaveBeenCalled();
  });
});