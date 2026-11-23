import { PrismaService } from '../../services/prisma.service';

export interface ResolvedTopicPrompt {
  topicId: string;
  topicSlug: string;
  promptId: string;
  promptContent: string;
}

export class TopicRegistry {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(input: {
    agentId: string;
    messageText: string;
    preferredTopicSlug?: string;
    /**
     * Estado FSM actual. Durante REGISTERING se fuerza el topic por defecto
     * (registro) para que una palabra clave informativa no desvíe el flujo.
     */
    flowState?: string;
  }): Promise<ResolvedTopicPrompt | undefined> {
    const getActivePrompt = (link: {
      prompt: { id: string; content: string; isActive: boolean } | null;
      topic: {
        isActive: boolean;
        systemPrompt: { id: string; content: string; isActive: boolean } | null;
      };
    }): { id: string; content: string } | undefined => {
      if (!link.topic.isActive) {
        return undefined;
      }

      if (link.prompt?.isActive) {
        return { id: link.prompt.id, content: link.prompt.content };
      }

      if (link.topic.systemPrompt?.isActive) {
        return {
          id: link.topic.systemPrompt.id,
          content: link.topic.systemPrompt.content,
        };
      }

      return undefined;
    };

    const links = await this.prisma.aiAgentTopic.findMany({
      where: { agentId: input.agentId, isActive: true },
      include: {
        topic: {
          include: {
            systemPrompt: true,
          },
        },
        prompt: true,
      },
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    });

    if (links.length === 0) {
      return undefined;
    }

    // Durante el registro: ignorar matcher por keywords y usar el topic por
    // defecto (registro). Esto impide que una consulta informativa hecha a
    // media captura desvíe el flujo a otro topic.
    if (input.flowState === 'REGISTERING') {
      const registrationLink =
        links.find((link) => link.isDefault && getActivePrompt(link)) ??
        links.find((link) => getActivePrompt(link));

      const registrationPrompt = registrationLink ? getActivePrompt(registrationLink) : undefined;
      if (registrationLink && registrationPrompt) {
        return {
          topicId: registrationLink.topic.id,
          topicSlug: registrationLink.topic.slug,
          promptId: registrationPrompt.id,
          promptContent: registrationPrompt.content,
        };
      }
    }

    const byPreferred = input.preferredTopicSlug
      ? links.find((link) => link.topic.slug === input.preferredTopicSlug && link.topic.isActive)
      : undefined;

    const preferredPrompt = byPreferred ? getActivePrompt(byPreferred) : undefined;

    if (byPreferred && preferredPrompt) {
      return {
        topicId: byPreferred.topic.id,
        topicSlug: byPreferred.topic.slug,
        promptId: preferredPrompt.id,
        promptContent: preferredPrompt.content,
      };
    }

    const normalizedText = input.messageText.toLowerCase();
    const byKeyword = links.find((link) => {
      if (!getActivePrompt(link)) {
        return false;
      }
      return link.topic.matcherKeywords.some((k) => normalizedText.includes(k.toLowerCase()));
    });

    const keywordPrompt = byKeyword ? getActivePrompt(byKeyword) : undefined;

    if (byKeyword && keywordPrompt) {
      return {
        topicId: byKeyword.topic.id,
        topicSlug: byKeyword.topic.slug,
        promptId: keywordPrompt.id,
        promptContent: keywordPrompt.content,
      };
    }

    const fallback =
      links.find((link) => link.isDefault && getActivePrompt(link)) ??
      links.find((link) => getActivePrompt(link));

    if (!fallback) {
      return undefined;
    }

    const fallbackPrompt = getActivePrompt(fallback);
    if (!fallbackPrompt) {
      return undefined;
    }

    return {
      topicId: fallback.topic.id,
      topicSlug: fallback.topic.slug,
      promptId: fallbackPrompt.id,
      promptContent: fallbackPrompt.content,
    };
  }
}
