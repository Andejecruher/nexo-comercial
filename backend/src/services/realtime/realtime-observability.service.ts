import { isLogLevelEnabled, StructuredLogLevel } from '../../utils/structured-logger';

export type RealtimeMetricLabels = Record<string, string>;

export interface RealtimeMetrics {
  incrementCounter(name: string, labels?: RealtimeMetricLabels): void;
  setGauge(name: string, value: number, labels?: RealtimeMetricLabels): void;
  observeHistogram(name: string, value: number, labels?: RealtimeMetricLabels): void;
}

export type RealtimeMetricsOptions = {
  /** Re-emit an unchanged gauge at most this often. Default 30s. */
  gaugeHeartbeatMs?: number;
  now?: () => number;
};

/** Unchanged gauges are silent until this interval elapses. */
export const REALTIME_GAUGE_HEARTBEAT_MS = 30_000;

export const noopRealtimeMetrics: RealtimeMetrics = {
  incrementCounter: () => undefined,
  setGauge: () => undefined,
  observeHistogram: () => undefined,
};

function gaugeIdentity(name: string, labels?: RealtimeMetricLabels): string {
  if (!labels) {
    return name;
  }

  const serialized = Object.keys(labels)
    .sort()
    .map((key) => `${key}=${labels[key]}`)
    .join(',');
  return `${name}|${serialized}`;
}

/**
 * Métricas realtime como logs estructurados a nivel INFO (log-based metrics).
 *
 * No hay export directo a Cloud Monitoring: cada contador/gauge/histograma se
 * emite como entrada `metrics.*` en Cloud Logging, desde donde se pueden crear
 * log-based metrics en la consola de GCP. Nivel INFO (no debug) para que
 * aterricen con el LOG_LEVEL por defecto y no dependan de debug habilitado.
 */
export function createRealtimeMetrics(
  scope: 'api' | 'worker' | 'shared' = 'shared',
  options: RealtimeMetricsOptions = {},
): RealtimeMetrics {
  const heartbeatMs = options.gaugeHeartbeatMs ?? REALTIME_GAUGE_HEARTBEAT_MS;
  const now = options.now ?? Date.now;
  const lastGauges = new Map<string, { value: number; loggedAt: number }>();

  return {
    incrementCounter(name, labels) {
      logRealtimeBoundary('info', 'RealtimeMetrics', 'metrics.counter', {
        scope,
        name,
        value: 1,
        labels,
      });
    },
    setGauge(name, value, labels) {
      const identity = gaugeIdentity(name, labels);
      const observedAt = now();
      const previous = lastGauges.get(identity);
      if (previous && previous.value === value && observedAt - previous.loggedAt < heartbeatMs) {
        return;
      }

      lastGauges.set(identity, { value, loggedAt: observedAt });
      logRealtimeBoundary('info', 'RealtimeMetrics', 'metrics.gauge', {
        scope,
        name,
        value,
        labels,
      });
    },
    observeHistogram(name, value, labels) {
      logRealtimeBoundary('info', 'RealtimeMetrics', 'metrics.histogram', {
        scope,
        name,
        value,
        labels,
      });
    },
  };
}

export function logRealtimeBoundary(
  level: StructuredLogLevel,
  component: string,
  boundary: string,
  fields: Record<string, unknown>,
): void {
  if (!isLogLevelEnabled(level)) {
    return;
  }

  const entry = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    component,
    boundary,
    ...fields,
  });

  if (level === 'error') {
    console.error(entry);
    return;
  }

  if (level === 'warn') {
    console.warn(entry);
    return;
  }

  if (level === 'debug') {
    console.debug(entry);
    return;
  }

  console.log(entry);
}
