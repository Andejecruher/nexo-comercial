import { AIToolDefinition } from '../core/types';
import { assertSafeExternalUrl } from './http-safety';

/** Policy de ejecución para tools externas. */
export class ToolPolicy {
  validateExternalTool(tool: AIToolDefinition): { url: URL; timeoutMs: number } {
    if (!tool.externalUrl) {
      throw new Error(`Tool ${tool.name} has no external URL`);
    }

    const url = assertSafeExternalUrl(tool.externalUrl);
    const timeoutMs = Math.max(250, Math.min(tool.timeoutMs, 15_000));
    const allowlist = tool.allowlistDomains;

    if (allowlist.length > 0) {
      const allowed = allowlist.some((entry) => {
        const normalized = entry.trim().toLowerCase();
        return (
          normalized.length > 0 &&
          (url.hostname === normalized || url.hostname.endsWith(`.${normalized}`))
        );
      });
      if (!allowed) {
        throw new Error(`Tool ${tool.name} host is not allowlisted`);
      }
    }

    return { url, timeoutMs };
  }
}
