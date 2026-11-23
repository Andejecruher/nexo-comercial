import { ConversationChannel } from '@prisma/client';
import {
  buildMetaMediaUrl,
  buildMetaMessagesUrl,
  DEFAULT_META_HTTP_TIMEOUT_MS,
} from '../../config/meta.config';
import { getCommunicationLineCached } from '../communication-line-cache.service';
import { PrismaService } from '../prisma.service';

export interface WhatsAppLineContext {
  lineId?: string;
  lineExternalIdentifier?: string;
  allowDefault?: boolean;
}

export interface WhatsAppLineRuntimeConfig {
  lineId: string;
  externalIdentifier: string;
  accessToken: string;
  appSecret: string;
  phoneNumberId: string;
  businessAccountId?: string;
  appId?: string;
  httpTimeoutMs: number;
  messagesUrl: string;
  mediaUrl: string;
}

type RawLine = {
  id?: string;
  isActive?: boolean;
  externalIdentifier?: string | null;
  whatsappAccessToken?: string | null;
  whatsappAppSecret?: string | null;
  whatsappPhoneNumberId?: string | null;
  whatsappBusinessAccountId?: string | null;
  whatsappAppId?: string | null;
};

export class WhatsAppLineConfigResolver {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(input: WhatsAppLineContext): Promise<WhatsAppLineRuntimeConfig> {
    const allowDefault = input.allowDefault !== false;

    const line = await this.resolveLine(input, allowDefault);
    return this.toRuntimeConfig(line);
  }

  private async resolveLine(input: WhatsAppLineContext, allowDefault: boolean): Promise<RawLine> {
    if (input.lineId) {
      const byLineId = await getCommunicationLineCached(this.prisma, { lineId: input.lineId });
      if (byLineId) {
        return byLineId;
      }
    }

    if (input.lineExternalIdentifier) {
      const byExternalIdentifier = await getCommunicationLineCached(this.prisma, {
        externalIdentifier: input.lineExternalIdentifier,
      });
      if (byExternalIdentifier) {
        return byExternalIdentifier;
      }
    }

    if (!allowDefault) {
      throw new Error('No communication line resolved');
    }

    const defaultLine = await this.prisma.communicationLine.findFirst({
      where: {
        channel: ConversationChannel.whatsapp,
        isActive: true,
        isDefault: true,
      },
      select: {
        id: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    if (!defaultLine?.id) {
      throw new Error('No default active WhatsApp communication line configured');
    }

    const cachedDefaultLine = await getCommunicationLineCached(this.prisma, {
      lineId: defaultLine.id,
    });
    if (!cachedDefaultLine) {
      throw new Error('Default WhatsApp communication line could not be loaded');
    }

    return cachedDefaultLine;
  }

  private toRuntimeConfig(line: RawLine): WhatsAppLineRuntimeConfig {
    if (!line.id) {
      throw new Error('Communication line id is required');
    }

    if (line.isActive === false) {
      throw new Error(`Communication line ${line.id} is inactive`);
    }

    const accessToken = this.readRequired(line.whatsappAccessToken, 'whatsappAccessToken', line.id);
    const appSecret = this.readRequired(line.whatsappAppSecret, 'whatsappAppSecret', line.id);
    const phoneNumberId = this.readRequired(
      line.whatsappPhoneNumberId,
      'whatsappPhoneNumberId',
      line.id,
    );

    return {
      lineId: line.id,
      externalIdentifier: line.externalIdentifier ?? phoneNumberId,
      accessToken,
      appSecret,
      phoneNumberId,
      businessAccountId: this.readOptional(line.whatsappBusinessAccountId),
      appId: this.readOptional(line.whatsappAppId),
      httpTimeoutMs: DEFAULT_META_HTTP_TIMEOUT_MS,
      messagesUrl: buildMetaMessagesUrl(phoneNumberId),
      mediaUrl: buildMetaMediaUrl(phoneNumberId),
    };
  }

  private readRequired(value: unknown, fieldName: string, lineId: string): string {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }
    throw new Error(`Communication line ${lineId} missing required field ${fieldName}`);
  }

  private readOptional(value: unknown): string | undefined {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }
    return undefined;
  }
}
