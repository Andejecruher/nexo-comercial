import {
  CitizenTag,
  ConversationChannel,
  ConversationStatus,
  LeadStatus,
  Prisma,
  SourceChannel,
} from '@prisma/client';
import { z } from 'zod';
import type { CitizenRecord, CitizenRepository, CitizenTagWithTag } from '../repositories';
import { AppError } from '../utils/app-error';
import { normalizePhoneForStorage } from '../utils/phone-normalizer';

const sourceChannelValues = ['whatsapp', 'web', 'event', 'referral', 'other'] as const;
const interestsSchema = z.array(z.string().trim().min(1).max(100)).max(20);
const queryBooleanSchema = z.enum(['true', 'false']).transform((value) => value === 'true');

export const CreateCitizenSchema = z.object({
  phone: z.string().trim().min(6).max(30),
  name: z.string().trim().min(1).max(255).optional(),
  lastName: z.string().trim().min(1).max(255).optional(),
  email: z.string().email().optional(),
  neighborhoodId: z.string().uuid().optional(),
  interests: interestsSchema.optional(),
  consentGiven: z.boolean().optional(),
  sourceChannel: z.enum(sourceChannelValues).optional(),
});

export const UpdateCitizenSchema = z
  .object({
    phone: z.string().trim().min(6).max(30).optional(),
    name: z.string().trim().min(1).max(255).nullable().optional(),
    lastName: z.string().trim().min(1).max(255).nullable().optional(),
    email: z.string().email().nullable().optional(),
    neighborhoodId: z.string().uuid().optional(),
    interests: interestsSchema.optional(),
    consentGiven: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Al menos un campo debe ser enviado',
  });

export const CitizenIdParamSchema = z.object({ id: z.string().uuid() });

export const CitizenListFiltersSchema = z.object({
  search: z.string().trim().min(1).max(255).optional(),
  phone: z.string().trim().min(3).max(30).optional(),
  consentGiven: queryBooleanSchema.optional(),
  hasPhone: queryBooleanSchema.optional(),
  leadStatus: z.string().trim().min(1).max(50).optional(),
  sourceChannel: z.string().trim().min(1).max(50).optional(),
  neighborhoodId: z.string().uuid().optional(),
  tagIds: z
    .union([z.string().uuid(), z.array(z.string().uuid())])
    .transform((v) => (Array.isArray(v) ? v : [v]))
    .pipe(z.array(z.string().uuid()).max(20))
    .optional(),
});

type CreateCitizenInput = z.infer<typeof CreateCitizenSchema>;
type UpdateCitizenInput = z.infer<typeof UpdateCitizenSchema>;
type CitizenListFilters = z.infer<typeof CitizenListFiltersSchema>;

export const CitizenBulkTagSchema = z.object({
  citizenIds: z.array(z.string().uuid()).min(1).max(500),
  tagIds: z.array(z.string().uuid()).min(1).max(100),
  operation: z.enum(['assign', 'remove']).default('assign'),
});

type CitizenBulkTagInput = z.infer<typeof CitizenBulkTagSchema>;

export type CitizenResponse = {
  id: string;
  phone: string | undefined;
  name: string | undefined;
  lastName: string | undefined;
  email: string | undefined;
  sourceChannel: string;
  leadStatus: string;
  consentGiven: boolean;
  consentAt: Date | null | undefined;
  neighborhood: string | undefined;
  neighborhoodId: string | undefined;
  interests: string[];
  createdAt: Date;
  updatedAt: Date;
};

export type CitizenListResult = {
  items: CitizenResponse[];
  meta: {
    nextCursor: string | undefined;
    hasNextPage: boolean;
    count: number;
  };
};

type CitizenProfileResult = {
  citizen: CitizenResponse;
  tags: Array<{
    id: string;
    name: string;
    description: string | undefined;
    color: string | undefined;
    createdAt: Date;
  }>;
  conversationSummary: {
    totalConversations: number;
    openConversations: number;
    lastConversation: {
      id: string;
      status: ConversationStatus;
      channel: ConversationChannel;
      updatedAt: Date;
      lastMessage: string | undefined;
    } | null;
  };
  participationHistory: Array<{
    registrationId: string;
    eventId: string;
    eventTitle: string;
    eventStartsAt: Date;
    registrationStatus: string;
    attendanceStatus: string;
    sourceChannel: string;
    checkedInAt: Date | undefined;
  }>;
};

export type CitizenBulkTagResult = {
  operation: 'assign' | 'remove';
  processed: number;
  updated: number;
  skipped: number;
  errors: Array<{
    citizenId: string;
    tagId: string;
    code: string;
    message: string;
  }>;
};

export class CitizensService {
  constructor(private readonly citizens: CitizenRepository) {}

  async list(params: {
    cursor: string | undefined;
    limit: number;
    filters: CitizenListFilters;
  }): Promise<CitizenListResult> {
    const where: Prisma.CitizenWhereInput = {};

    if (params.filters.leadStatus !== undefined) {
      where.leadStatus = params.filters.leadStatus as LeadStatus;
    }

    if (params.filters.sourceChannel !== undefined) {
      where.sourceChannel = params.filters.sourceChannel as SourceChannel;
    }

    if (params.filters.neighborhoodId !== undefined) {
      where.neighborhoodId = params.filters.neighborhoodId;
    }

    if (params.filters.tagIds !== undefined && params.filters.tagIds.length > 0) {
      where.citizenTags = {
        some: {
          tagId: { in: params.filters.tagIds },
        },
      };
    }

    if (params.filters.consentGiven !== undefined) {
      where.consentGiven = params.filters.consentGiven;
    }

    if (params.filters.hasPhone !== undefined) {
      where.phone = params.filters.hasPhone ? { not: null } : null;
    }

    if (params.filters.phone !== undefined) {
      const normalizedPhone = normalizePhoneForStorage(params.filters.phone);
      where.phone = { contains: normalizedPhone };
    }

    if (params.filters.search !== undefined) {
      const s = params.filters.search.trim();
      const phoneSearch = normalizePhoneForStorage(s);
      const searchFilters: Prisma.CitizenWhereInput[] = [
        { name: { contains: s, mode: 'insensitive' } },
        { lastName: { contains: s, mode: 'insensitive' } },
        { email: { contains: s, mode: 'insensitive' } },
      ];
      if (phoneSearch) searchFilters.unshift({ phone: { contains: phoneSearch } });
      where.OR = searchFilters;
    }

    const rows = await this.citizens.list({
      where,
      cursor: params.cursor,
      limit: params.limit,
    });

    const hasNextPage = rows.length > params.limit;
    const items = hasNextPage ? rows.slice(0, params.limit) : rows;

    return {
      items: items.map((r) => this.toResponse(r)),
      meta: {
        nextCursor: hasNextPage ? items[items.length - 1]?.id : undefined,
        hasNextPage,
        count: items.length,
      },
    };
  }

  async create(input: CreateCitizenInput): Promise<CitizenResponse> {
    const phone = normalizePhoneForStorage(input.phone);

    const existing = await this.citizens.findByNormalizedPhone(phone);
    if (existing) throw AppError.conflict('Ya existe un ciudadano con ese teléfono');

    let neighborhoodLabel: string | undefined;
    if (input.neighborhoodId !== undefined) {
      const neighborhoodName = await this.citizens.findNeighborhoodNameById(input.neighborhoodId);
      if (!neighborhoodName) {
        throw AppError.badRequest('El barrio seleccionado no es válido');
      }
      neighborhoodLabel = neighborhoodName;
    }

    const sourceChannel: SourceChannel | undefined = input.sourceChannel;

    const created = await this.citizens.createCitizen({
      phone,
      name: input.name,
      lastName: input.lastName,
      email: input.email,
      neighborhoodId: input.neighborhoodId,
      neighborhood: neighborhoodLabel,
      interests: input.interests ?? [],
      consentGiven: input.consentGiven ?? false,
      sourceChannel,
    });

    return this.toResponse(created);
  }

  async getById(id: string): Promise<CitizenResponse> {
    const existing = await this.citizens.findById(id);
    if (!existing) throw AppError.notFound('Ciudadano no encontrado');
    return this.toResponse(existing);
  }

  async update(id: string, input: UpdateCitizenInput): Promise<CitizenResponse> {
    const existing = await this.citizens.findByIdMinimal(id);
    if (!existing) throw AppError.notFound('Ciudadano no encontrado');

    if (input.phone !== undefined) {
      const phone = normalizePhoneForStorage(input.phone);
      const dup = await this.citizens.findFirstByPhoneExcludingId(phone, id);
      if (dup) throw AppError.conflict('El teléfono ya está en uso por otro ciudadano');
      input.phone = phone;
    }

    const updated = await this.citizens.updateCitizen(id, {
      phone: input.phone,
      name: input.name,
      lastName: input.lastName,
      email: input.email,
      neighborhoodId: input.neighborhoodId,
      interests: input.interests,
      consentGiven: input.consentGiven,
    });

    return this.toResponse(updated);
  }

  async deleteCitizen(id: string): Promise<CitizenResponse> {
    const existing = await this.citizens.findById(id);
    if (!existing) throw AppError.notFound('Ciudadano no encontrado');

    await this.citizens.deleteCitizen(id);
    return this.toResponse(existing);
  }

  async assignTag(
    citizenId: string,
    tagId: string,
    assignedById?: string,
  ): Promise<CitizenTagWithTag> {
    const citizen = await this.citizens.findByIdMinimal(citizenId);
    if (!citizen) throw AppError.notFound('Ciudadano no encontrado');

    const tag = await this.citizens.findTagById(tagId);
    if (!tag) throw AppError.notFound('Etiqueta no encontrada');

    const existing = await this.citizens.findCitizenTag(citizenId, tagId);
    if (existing) throw AppError.conflict('Etiqueta ya asignada al ciudadano');

    const created = await this.citizens.createCitizenTag(citizenId, tagId, assignedById);

    return created;
  }

  async removeTag(citizenId: string, tagId: string): Promise<CitizenTag> {
    const existing = await this.citizens.findCitizenTag(citizenId, tagId);
    if (!existing) throw AppError.notFound('Etiqueta no asignada a ese ciudadano');

    await this.citizens.deleteCitizenTag(existing.id);
    return existing;
  }

  async bulkTagAssignmentPartial(
    input: CitizenBulkTagInput,
    assignedById?: string,
  ): Promise<CitizenBulkTagResult> {
    const operation = input.operation;
    const citizenIds = Array.from(new Set(input.citizenIds));
    const tagIds = Array.from(new Set(input.tagIds));

    const existingCitizenIds = await this.citizens.listExistingCitizenIds(citizenIds);
    const existingTagIds = await this.citizens.listExistingTagIds(tagIds);

    let updated = 0;
    let skipped = 0;
    const errors: CitizenBulkTagResult['errors'] = [];

    for (const citizenId of citizenIds) {
      for (const tagId of tagIds) {
        if (!existingCitizenIds.has(citizenId)) {
          skipped += 1;
          errors.push({
            citizenId,
            tagId,
            code: 'CITIZEN_NOT_FOUND',
            message: 'Ciudadano no encontrado',
          });
          continue;
        }

        if (!existingTagIds.has(tagId)) {
          skipped += 1;
          errors.push({
            citizenId,
            tagId,
            code: 'TAG_NOT_FOUND',
            message: 'Etiqueta no encontrada',
          });
          continue;
        }

        const existing = await this.citizens.findCitizenTag(citizenId, tagId);

        if (operation === 'assign') {
          if (existing) {
            skipped += 1;
            continue;
          }

          try {
            await this.citizens.createCitizenTag(citizenId, tagId, assignedById);
            updated += 1;
          } catch {
            skipped += 1;
            errors.push({
              citizenId,
              tagId,
              code: 'ASSIGN_FAILED',
              message: 'No se pudo asignar la etiqueta',
            });
          }

          continue;
        }

        if (!existing) {
          skipped += 1;
          continue;
        }

        try {
          await this.citizens.deleteCitizenTag(existing.id);
          updated += 1;
        } catch {
          skipped += 1;
          errors.push({
            citizenId,
            tagId,
            code: 'REMOVE_FAILED',
            message: 'No se pudo remover la etiqueta',
          });
        }
      }
    }

    const processed = citizenIds.length * tagIds.length;

    return {
      operation,
      processed,
      updated,
      skipped,
      errors,
    };
  }

  async getProfile(id: string): Promise<CitizenProfileResult> {
    const citizen = await this.citizens.getProfileBase(id);

    if (!citizen) throw AppError.notFound('Ciudadano no encontrado');

    const totalConversations = await this.citizens.countConversations(id);
    const openConversations = await this.citizens.countConversations(id, ConversationStatus.open);

    const lastConv = await this.citizens.findLastConversation(id);

    const conversationSummary = {
      totalConversations,
      openConversations,
      lastConversation: lastConv
        ? {
            id: lastConv.id,
            status: lastConv.status,
            channel: lastConv.channel,
            updatedAt: lastConv.updatedAt,
            lastMessage: lastConv.messages?.[0]?.body ?? undefined,
          }
        : null,
    };

    const participation = await this.citizens.findParticipationHistory(id, 20);

    return {
      citizen: this.toResponse(citizen as CitizenRecord),
      tags: citizen.citizenTags.map((ct) => ({
        id: ct.tag.id,
        name: ct.tag.name,
        description: ct.tag.description ?? undefined,
        color: ct.tag.color ?? undefined,
        createdAt: ct.tag.createdAt,
      })),
      conversationSummary,
      participationHistory: participation.map((item) => ({
        registrationId: item.id,
        eventId: item.eventId,
        eventTitle: item.event.title,
        eventStartsAt: item.event.startsAt,
        registrationStatus: item.registrationStatus,
        attendanceStatus: item.attendanceStatus,
        sourceChannel: item.sourceChannel,
        checkedInAt: item.checkedInAt ?? undefined,
      })),
    };
  }

  private toResponse(item: CitizenRecord): CitizenResponse {
    return {
      id: item.id,
      phone: item.phone ?? undefined,
      name: item.name ?? undefined,
      lastName: item.lastName ?? undefined,
      email: item.email ?? undefined,
      sourceChannel: item.sourceChannel,
      leadStatus: item.leadStatus,
      consentGiven: item.consentGiven,
      consentAt: item.consentAt ?? undefined,
      neighborhood: item.neighborhood ?? undefined,
      neighborhoodId: item.neighborhoodId ?? undefined,
      interests: item.interests ?? [],
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }
}
