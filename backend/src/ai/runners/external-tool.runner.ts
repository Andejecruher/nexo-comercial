import { ToolPolicy } from '../security/tool-policy';
import { externalToolInputSchema } from '../validators/tool.schemas';
import { AIToolDefinition } from '../core/types';

export class ExternalToolRunner {
  constructor(private readonly policy: ToolPolicy) {}

  async execute(
    tool: AIToolDefinition,
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const safeInput = externalToolInputSchema.parse(input);
    const { url, timeoutMs } = this.policy.validateExternalTool(tool);

    const headers: Record<string, string> = {
      'content-type': 'application/json',
      ...(tool.externalHeaders ?? {}),
    };

    if (tool.externalAuthEnvKey) {
      const token = process.env[tool.externalAuthEnvKey];
      if (!token) {
        throw new Error(`Missing env for external tool auth: ${tool.externalAuthEnvKey}`);
      }
      headers.authorization = `Bearer ${token}`;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: tool.externalMethod ?? 'POST',
        headers,
        body: tool.externalMethod === 'GET' ? undefined : JSON.stringify(safeInput),
        signal: controller.signal,
      });

      const text = await response.text();
      let payload: unknown = text;
      try {
        payload = JSON.parse(text);
      } catch {
        payload = { raw: text };
      }

      if (!response.ok) {
        throw new Error(`External tool HTTP ${response.status}: ${text.slice(0, 280)}`);
      }

      if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
        return payload as Record<string, unknown>;
      }

      return { result: payload };
    } finally {
      clearTimeout(timeout);
    }
  }
}
