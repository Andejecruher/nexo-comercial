/**
 * NVIDIA NIM smoke health-check for OpenAIProvider.
 *
 * Calls chat.completions.create with a minimal ping payload and validates
 * that a response is returned. Safe to call manually or in integration tests;
 * NOT auto-run during unit tests.
 *
 * Usage:
 *   import { smokeCheckNvidiaProvider } from './openai.provider.health';
 *   await smokeCheckNvidiaProvider();
 */
import { OpenAIProvider } from './openai.provider';

export async function smokeCheckNvidiaProvider(): Promise<void> {
  const provider = new OpenAIProvider();

  const response = await provider.generate({
    model: 'openai/gpt-oss-20b',
    messages: [{ role: 'user', content: 'ping' }],
    maxTokens: 1,
    stream: false,
    temperature: 0.1,
    topP: 1,
    frequencyPenalty: 0,
    presencePenalty: 0,
    tools: [],
  });

  if (response.providerUnavailable) {
    throw new Error(
      `[smokeCheckNvidiaProvider] Provider unavailable: ${JSON.stringify(response.raw)}`,
    );
  }

  const raw = response.raw as Record<string, unknown>;
  const choices = Array.isArray(raw.choices) ? raw.choices : [];
  const firstChoice =
    choices[0] && typeof choices[0] === 'object'
      ? (choices[0] as Record<string, unknown>)
      : undefined;
  const message =
    firstChoice?.message && typeof firstChoice.message === 'object'
      ? (firstChoice.message as Record<string, unknown>)
      : undefined;
  const content = message?.content;
  if (typeof content !== 'string' || content.length === 0) {
    throw new Error('[smokeCheckNvidiaProvider] Response missing choices[0].message.content');
  }

  console.log('[smokeCheckNvidiaProvider] OK — NVIDIA NIM responded to ping');
}
