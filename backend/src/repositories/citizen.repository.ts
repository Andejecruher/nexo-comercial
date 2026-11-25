/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
/**
 * Repository para Citizen.
 * Reutiliza el modelo existente sin duplicar acceso.
 */
import {
  Citizen,
  CitizenTag,
  ConversationStatus,
  LeadStatus,
  Prisma,
  SourceChannel,
} from '@prisma/client';
import { PrismaService } from '../services/prisma.service';
import { normalizePhoneForStorage } from '../utils/phone-normalizer';

const citizenSelect = {
  id: true,
  phone: true,
  name: true,
  lastName: true,
  email: true,
  sourceChannel: true,
  leadStatus: true,
  consentGiven: true,
  consentAt: true,
  neighborhood: true,
  neighborhoodId: true,
  interests: true,
  createdAt: true,
  updatedAt: true,
} as const;

const tagSelect = {
  id: true,
  name: true,
  description: true,
  color: true,
  createdAt: true,
} as const;

export type CitizenRecord = Prisma.CitizenGetPayload<{ select: typeof citizenSelect }>;

export type CitizenTagWithTag = Prisma.CitizenTagGetPayload<{
  include: {
    tag: { select: typeof tagSelect };
  };
}>;

export type CitizenProfileRecord = Prisma.CitizenGetPayload<{
  include: {
    citizenTags: {
      include: {
        tag: { select: typeof tagSelect };
      };
    };
  };
}>;

export type LastConversationRecord = Prisma.ConversationGetPayload<{
  select: {
    id: true;
    status: true;
    channel: true;
    updatedAt: true;
    messages: {
      select: { body: true; createdAt: true };
    };
  };
}>;

export type ParticipationRecord = Prisma.EventRegistrationGetPayload<{
  select: {
    id: true;
    eventId: true;
    registrationStatus: true;
    attendanceStatus: true;
    sourceChannel: true;
    checkedInAt: true;
    event: {
      select: {
        title: true;
        startsAt: true;
      };
    };
  };
}>;

export class CitizenRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByPhone(rawPhone: string): Promise<Citizen | null> {
    const phone = normalizePhoneForStorage(rawPhone);
    return this.prisma.citizen.findUnique({
      where: { phone },
    });
  }

  async findByNormalizedPhone(phone: string): Promise<Citizen | null> {
    return this.prisma.citizen.findUnique({ where: { phone } });
  }

  async findByEmailInsensitive(email: string): Promise<Citizen | null> {
    return this.prisma.citizen.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
    });
  }

  async findById(id: string): Promise<CitizenRecord | null> {
    return this.prisma.citizen.findUnique({
      where: { id },
      select: citizenSelect,
    });
  }

  async findByIdOrPhone(params: {
    citizenId?: string;
    normalizedPhone?: string;
  }): Promise<CitizenRecord | null> {
    if (params.citizenId) {
      return this.findById(params.citizenId);
    }

    if (params.normalizedPhone) {
      const citizen = await this.findByNormalizedPhone(params.normalizedPhone);
      if (!citizen) return null;
      return this.findById(citizen.id);
    }

    return null;
  }

  async findByIdMinimal(id: string): Promise<{ id: string } | null> {
    return this.prisma.citizen.findUnique({ where: { id }, select: { id: true } });
  }

  async list(params: {
    where: Prisma.CitizenWhereInput;
    cursor?: string;
    limit: number;
  }): Promise<CitizenRecord[]> {
    return this.prisma.citizen.findMany({
      where: params.where,
      orderBy: { id: 'asc' },
      take: params.limit + 1,
      ...(params.cursor !== undefined ? { cursor: { id: params.cursor }, skip: 1 } : {}),
      select: citizenSelect,
    });
  }

  async createCitizen(data: {
    phone: string;
    name?: string;
    lastName?: string;
    email?: string;
    neighborhoodId?: string;
    neighborhood?: string;
    interests: string[];
    consentGiven: boolean;
    sourceChannel?: SourceChannel;
  }): Promise<CitizenRecord> {
    return this.prisma.citizen.create({
      data: {
        phone: data.phone,
        name: data.name,
        lastName: data.lastName,
        email: data.email,
        neighborhoodId: data.neighborhoodId,
        neighborhood: data.neighborhood,
        interests: data.interests,
        consentGiven: data.consentGiven,
        ...(data.sourceChannel !== undefined ? { sourceChannel: data.sourceChannel } : {}),
      },
      select: citizenSelect,
    });
  }

  async findFirstByPhoneExcludingId(
    phone: string,
    excludedId: string,
  ): Promise<{ id: string } | null> {
    return this.prisma.citizen.findFirst({
      where: { phone, NOT: { id: excludedId } },
      select: { id: true },
    });
  }

  async updateCitizen(
    id: string,
    data: {
      phone?: string;
      name?: string | null;
      lastName?: string | null;
      email?: string | null;
      neighborhoodId?: string;
      neighborhood?: string | null;
      interests?: string[];
      consentGiven?: boolean;
    },
  ): Promise<CitizenRecord> {
    return this.prisma.citizen.update({
      where: { id },
      data: {
        ...(data.phone !== undefined ? { phone: data.phone } : {}),
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.lastName !== undefined ? { lastName: data.lastName } : {}),
        ...(data.email !== undefined ? { email: data.email } : {}),
        ...(data.neighborhoodId !== undefined ? { neighborhoodId: data.neighborhoodId } : {}),
        ...(data.neighborhood !== undefined ? { neighborhood: data.neighborhood } : {}),
        ...(data.interests !== undefined ? { interests: data.interests } : {}),
        ...(data.consentGiven !== undefined ? { consentGiven: data.consentGiven } : {}),
      },
      select: citizenSelect,
    });
  }

  async deleteCitizen(id: string): Promise<void> {
    await this.prisma.citizen.delete({ where: { id } });
  }

  async findNeighborhoodNameById(id: string): Promise<string | null> {
    const row = await this.prisma.neighborhood.findUnique({
      where: { id },
      select: { name: true },
    });
    return row?.name ?? null;
  }

  async findTagById(tagId: string) {
    return this.prisma.tag.findUnique({
      where: { id: tagId },
      select: tagSelect,
    });
  }

  async findCitizenTag(citizenId: string, tagId: string): Promise<CitizenTag | null> {
    return this.prisma.citizenTag.findFirst({ where: { citizenId, tagId } });
  }

  async createCitizenTag(
    citizenId: string,
    tagId: string,
    assignedById?: string,
  ): Promise<CitizenTagWithTag> {
    return this.prisma.citizenTag.create({
      data: { citizenId, tagId, assignedById },
      include: { tag: { select: tagSelect } },
    });
  }

  async deleteCitizenTag(id: string): Promise<void> {
    await this.prisma.citizenTag.delete({ where: { id } });
  }

  async listExistingCitizenIds(ids: string[]): Promise<Set<string>> {
    const rows = await this.prisma.citizen.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });
    return new Set(rows.map((c) => c.id));
  }

  async listExistingTagIds(ids: string[]): Promise<Set<string>> {
    const rows = await this.prisma.tag.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });
    return new Set(rows.map((t) => t.id));
  }

  async getProfileBase(id: string): Promise<CitizenProfileRecord | null> {
    return this.prisma.citizen.findUnique({
      where: { id },
      include: {
        citizenTags: {
          include: {
            tag: {
              select: tagSelect,
            },
          },
        },
      },
    });
  }

  async countConversations(citizenId: string, status?: ConversationStatus): Promise<number> {
    return this.prisma.conversation.count({
      where: {
        citizenId,
        ...(status !== undefined ? { status } : {}),
      },
    });
  }

  async findLastConversation(citizenId: string): Promise<LastConversationRecord | null> {
    return this.prisma.conversation.findFirst({
      where: { citizenId },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        status: true,
        channel: true,
        updatedAt: true,
        messages: {
          take: 1,
          orderBy: { createdAt: 'desc' },
          select: { body: true, createdAt: true },
        },
      },
    });
  }

  async findParticipationHistory(citizenId: string, take = 20): Promise<ParticipationRecord[]> {
    return this.prisma.eventRegistration.findMany({
      where: { citizenId },
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        id: true,
        eventId: true,
        registrationStatus: true,
        attendanceStatus: true,
        sourceChannel: true,
        checkedInAt: true,
        event: {
          select: {
            title: true,
            startsAt: true,
          },
        },
      },
    });
  }

  async findOrCreate(rawPhone: string, profileName?: string): Promise<Citizen> {
    const phone = normalizePhoneForStorage(rawPhone);
    const existing = await this.findByPhone(phone);
    if (existing) return existing;

    const nameParts = profileName?.split(' ') ?? [];

    try {
      return await this.prisma.citizen.create({
        data: {
          phone,
          name: nameParts[0],
          lastName: nameParts.slice(1).join(' ') || undefined,
          sourceChannel: SourceChannel.whatsapp,
          leadStatus: LeadStatus.new,
        },
      });
    } catch (error) {
      if (this.isUniqueConstraintViolation(error)) {
        const concurrent = await this.findByPhone(phone);
        if (concurrent) {
          return concurrent;
        }
      }
      throw error;
    }
  }

  private isUniqueConstraintViolation(error: unknown): boolean {
    const code = (error as { code?: string } | null)?.code;
    return code === 'P2002';
  }

  async updateLeadStatus(citizenId: string, status: LeadStatus): Promise<Citizen> {
    return this.prisma.citizen.update({
      where: { id: citizenId },
      data: { leadStatus: status },
    });
  }

  async giveConsent(citizenId: string): Promise<Citizen> {
    return this.prisma.citizen.update({
      where: { id: citizenId },
      data: { consentGiven: true, consentAt: new Date() },
    });
  }
}
