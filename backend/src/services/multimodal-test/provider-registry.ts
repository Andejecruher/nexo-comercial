/**
 * provider-registry.ts — Capability registry with ordered providers, fallback,
 * and per-type timeout/retry policies.
 *
 * Adding a new provider = implementing one of the ports in contracts.ts and
 * registering it here. The first registered provider of a capability is the
 * primary; the rest are fallbacks in registration order.
 */
import { env } from '../../config/env.config';
import {
  AnyProvider,
  MultimodalFileKind,
  MultimodalStage,
  MultimodalTestOptions,
  ProviderCapability,
  ProviderPolicy,
} from './contracts';
import { StageError, PipelineRunner } from './pipeline-runner';

/** Per-kind overall timeout from env (validated in env.config.ts). */
export function kindTimeoutMs(kind: MultimodalFileKind): number {
  switch (kind) {
    case 'audio':
      return env.MULTIMODAL_TEST_AUDIO_TIMEOUT_MS;
    case 'document':
      return env.MULTIMODAL_TEST_DOCUMENT_TIMEOUT_MS;
    case 'image':
      return env.MULTIMODAL_TEST_IMAGE_TIMEOUT_MS;
    case 'video':
      return env.MULTIMODAL_TEST_VIDEO_TIMEOUT_MS;
  }
}

/** Execution policy for a pipeline run, honoring options.timeoutMs overrides. */
export function pipelinePolicy(
  kind: MultimodalFileKind,
  options: Pick<MultimodalTestOptions, 'timeoutMs'> = {},
): ProviderPolicy {
  return {
    timeoutMs: options.timeoutMs ?? kindTimeoutMs(kind),
    maxRetries: env.MULTIMODAL_TEST_MAX_RETRIES,
    retryDelayMs: env.MULTIMODAL_TEST_RETRY_DELAY_MS,
  };
}

/** Provider execution policy (per attempt), bounded only by the remaining pipeline budget. */
function attemptPolicy(policy: ProviderPolicy, runner: PipelineRunner): ProviderPolicy {
  const budget = Math.max(1, Math.min(policy.timeoutMs, runner.remainingMs()));
  return { ...policy, timeoutMs: budget };
}

/** True when a provider declares support for the given mimetype. */
function supportsMimeType(provider: AnyProvider, mimeType: string): boolean {
  const normalizedMimeType = mimeType.toLowerCase().split(';')[0]!.trim();
  if (provider.supportsMimeType) return provider.supportsMimeType(normalizedMimeType);
  if (provider.supportedMimeTypes.length === 0) return true; // empty list = accepts anything
  return provider.supportedMimeTypes.includes(normalizedMimeType);
}

export class ProviderRegistry {
  private readonly byCapability = new Map<ProviderCapability, AnyProvider[]>();

  /** Registers a provider for a capability. First registration is the primary. */
  register(capability: ProviderCapability, provider: AnyProvider): this {
    const list = this.byCapability.get(capability) ?? [];
    if (list.some((existing) => existing.id === provider.id)) return this;
    list.push(provider);
    this.byCapability.set(capability, list);
    return this;
  }

  /**
   * Ordered providers for a capability: the explicitly preferred id first
   * (when it exists and supports the mimetype), then registration order.
   */
  providersFor(
    capability: ProviderCapability,
    options: { preferredId?: string; mimeType?: string } = {},
  ): AnyProvider[] {
    const list = this.byCapability.get(capability) ?? [];
    const eligible = options.mimeType
      ? list.filter((provider) => supportsMimeType(provider, options.mimeType!))
      : list;
    if (!options.preferredId) return eligible;
    const preferred = eligible.filter((provider) => provider.id === options.preferredId);
    return [...preferred, ...eligible.filter((provider) => provider.id !== options.preferredId)];
  }
}

export interface RunWithFallbackOptions {
  /** Caller-selected provider id (options.provider) placed first. */
  preferredId?: string;
  /** Mimetype used to filter providers that cannot handle the input. */
  mimeType?: string;
  /** Static metadata merged into each attempt step. */
  metadata?: Record<string, unknown>;
}

/**
 * Executes providers in order with bounded retries per provider and fallback
 * between providers. Every attempt is recorded as its own pipeline step, so
 * timeouts, retries, and fallbacks are individually traceable.
 */
export async function runWithFallback<T>(
  runner: PipelineRunner,
  stage: MultimodalStage,
  capability: ProviderCapability,
  registry: ProviderRegistry,
  policy: ProviderPolicy,
  run: (provider: AnyProvider, ctx: { timeoutMs: number; signal: AbortSignal }) => Promise<T>,
  options: RunWithFallbackOptions = {},
): Promise<T> {
  const providers = registry.providersFor(capability, {
    preferredId: options.preferredId,
    mimeType: options.mimeType,
  });
  if (providers.length === 0) {
    const error = new StageError(
      `No hay proveedores registrados para ${capability}`,
      stage,
      `${capability.toUpperCase()}_NO_PROVIDER`,
      { statusCode: 503 },
    );
    // Record the failure as a skipped-then-failed trace without an attempt.
    runner.collectError(error);
    throw error;
  }

  const exhausted: Array<{
    provider: string;
    code: string;
    message: string;
    details?: unknown;
  }> = [];
  for (const provider of providers) {
    const attemptPolicyFor = attemptPolicy(policy, runner);
    let attempts = provider.managesOwnRetries ? 1 : attemptPolicyFor.maxRetries + 1;
    while (attempts > 0) {
      attempts -= 1;
      try {
        runner.throwIfExpired();
        const result = await runner.runStep(stage, (ctx) => run(provider, ctx), {
          timeoutMs: attemptPolicyFor.timeoutMs,
          timeoutCode: 'PROVIDER_TIMEOUT',
          metadata: {
            ...(options.metadata ?? {}),
            provider: provider.id,
            capability,
            attempt: provider.managesOwnRetries ? 1 : attemptPolicyFor.maxRetries + 1 - attempts,
          },
        });
        runner.markProviderUsed(provider.id);
        return result;
      } catch (error) {
        if (!(error instanceof StageError)) throw error;
        runner.throwIfExpired();
        const retryable = error.retriable && attempts > 0 && runner.remainingMs() > 0;
        if (retryable) {
          await runner.waitRetryDelay();
          continue;
        }
        exhausted.push({
          provider: provider.id,
          code: error.code,
          message: error.message,
          ...(error.details === undefined ? {} : { details: error.details }),
        });
        break; // move to the next provider (fallback)
      }
    }
  }

  throw new StageError(
    `Todos los proveedores fallaron para ${capability}`,
    stage,
    `${capability.toUpperCase()}_FALLBACK_EXHAUSTED`,
    { statusCode: 502, retriable: true, details: { attempts: exhausted } },
  );
}
