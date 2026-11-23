import { createStructuredLogger } from '../../utils/structured-logger';

const log = createStructuredLogger('LlmSdkReadiness');

/**
 * Comprueba en arranque que los SDKs LLM opcionales se pueden importar (sin llamadas de red).
 * Ayuda a detectar node_modules incompletos o paquetes mal resueltos antes del primer request.
 */
export async function logLlmSdkReadiness(): Promise<void> {
  let openaiStatus = 'unavailable';
  let anthropicStatus = 'unavailable';

  const openaiSpecifier = 'openai';
  try {
    const mod = (await import(openaiSpecifier)) as { default?: unknown };
    openaiStatus = typeof mod.default === 'function' ? 'ready' : 'invalid_export';
  } catch {
    openaiStatus = 'unavailable';
  }

  const anthropicSpecifier = '@anthropic-ai/sdk';
  try {
    const mod = (await import(anthropicSpecifier)) as { default?: unknown };
    anthropicStatus = typeof mod.default === 'function' ? 'ready' : 'invalid_export';
  } catch {
    anthropicStatus = 'unavailable';
  }

  log('info', 'llm_sdk.readiness', undefined, {
    openai: openaiStatus,
    anthropic: anthropicStatus,
  });

  if (!process.env.NVIDIA_API_KEY) {
    log('warn', 'llm_sdk.nvidia_key_missing');
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    log('debug', 'llm_sdk.anthropic_key_missing');
  }
}
