import { PrismaService } from '../../services/prisma.service';
import { AIToolDefinition } from '../core/types';

const toMethod = (value: string | undefined): 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' => {
  if (
    value === 'GET' ||
    value === 'POST' ||
    value === 'PUT' ||
    value === 'PATCH' ||
    value === 'DELETE'
  ) {
    return value;
  }
  return 'POST';
};

const asObject = (value: unknown): Record<string, unknown> | undefined => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
};

const asStringRecord = (value: unknown): Record<string, string> | undefined => {
  const obj = asObject(value);
  if (!obj) {
    return undefined;
  }
  const entries = Object.entries(obj).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string',
  );
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
};

const asStringArray = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.every((item) => typeof item === 'string') ? value : undefined;
};

const asNumber = (value: unknown): number | undefined =>
  typeof value === 'number' ? value : undefined;

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

export class ToolRegistry {
  constructor(private readonly prisma: PrismaService) {}

  async getToolsForTopic(topicId: string): Promise<AIToolDefinition[]> {
    const links = await this.prisma.aiTopicTool.findMany({
      where: {
        topicId,
        isActive: true,
        tool: { isActive: true },
      },
      include: { tool: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });

    return links.map((link) => {
      const config = asObject(link.tool.config) ?? {};

      const resolvedKind =
        (asString(config.type) ?? asString(config.kind) ?? link.tool.type ?? link.tool.kind) ===
        'external'
          ? 'external'
          : 'internal';

      const externalMethod = toMethod(
        asString(config.externalMethod) ??
          asString(config.method) ??
          link.tool.externalMethod ??
          undefined,
      );

      return {
        id: link.tool.id,
        name: link.tool.name,
        description: link.tool.description,
        kind: resolvedKind,
        internalKey: asString(config.internalKey) ?? link.tool.internalKey ?? undefined,
        externalUrl:
          asString(config.externalUrl) ??
          asString(config.url) ??
          link.tool.externalUrl ??
          undefined,
        externalMethod,
        externalHeaders:
          asStringRecord(config.externalHeaders) ??
          asStringRecord(config.headers) ??
          asStringRecord(link.tool.externalHeaders) ??
          undefined,
        externalAuthEnvKey:
          asString(config.externalAuthEnvKey) ??
          asString(config.authEnvKey) ??
          link.tool.externalAuthEnvKey ??
          undefined,
        timeoutMs: asNumber(config.timeoutMs) ?? link.tool.timeoutMs,
        allowlistDomains:
          asStringArray(config.allowlistDomains) ??
          asStringArray(config.allowlist) ??
          link.tool.allowlistDomains,
        inputSchema:
          asObject(config.inputSchema) ??
          asObject(config.input) ??
          asObject(link.tool.inputSchema) ??
          undefined,
        outputSchema:
          asObject(config.outputSchema) ??
          asObject(config.output) ??
          asObject(link.tool.outputSchema) ??
          undefined,
      };
    });
  }
}
