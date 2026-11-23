import { z } from 'zod';
import type { CitizenRepository, NeighborhoodRepository } from '../../repositories';
import { normalizePhoneForStorage } from '../../utils/phone-normalizer';

const updateCitizenProfileSchema = z
  .object({
    citizenId: z.string().uuid().optional(),
    phone: z.string().trim().min(7).max(20).optional(),
    name: z.string().trim().min(2).max(80).optional(),
    neighborhood: z.string().trim().min(2).max(120).optional(),
    email: z.string().trim().email().max(255).optional(),
    interests: z.array(z.string().trim().min(1).max(80)).min(1).max(10).optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.citizenId && !value.phone) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'citizenId o phone es requerido',
      });
    }

    if (
      value.name === undefined &&
      value.neighborhood === undefined &&
      value.email === undefined &&
      value.interests === undefined
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Debes enviar al menos un campo a actualizar',
      });
    }
  });

function normalizeNeighborhood(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizeInterests(interests: string[]): string[] {
  return [
    ...new Set(interests.map((value) => value.trim().toLowerCase().replace(/\s+/g, '_'))),
  ].filter(Boolean);
}

export class UpdateCitizenProfileTool {
  readonly key = 'updateCitizenProfile';

  constructor(
    private readonly citizens: CitizenRepository,
    private readonly neighborhoods: NeighborhoodRepository,
  ) {}

  async execute(input: unknown): Promise<unknown> {
    const parsed = updateCitizenProfileSchema.safeParse(input);
    if (!parsed.success) {
      return { error: 'INVALID_INPUT', details: parsed.error.issues };
    }

    const data = parsed.data;
    const phone = data.phone ? normalizePhoneForStorage(data.phone) : undefined;

    const citizen = await this.citizens.findByIdOrPhone({
      citizenId: data.citizenId,
      normalizedPhone: phone,
    });

    if (!citizen) {
      return { error: 'CITIZEN_NOT_FOUND' };
    }

    let neighborhoodId: string | undefined;
    let neighborhoodName: string | null | undefined;

    if (data.neighborhood !== undefined) {
      const normalizedNeighborhood = normalizeNeighborhood(data.neighborhood);
      const neighborhood = await this.neighborhoods.findByNameInsensitiveOrNameLower({
        name: data.neighborhood,
        nameLower: normalizedNeighborhood,
      });

      if (!neighborhood) {
        return { error: 'INVALID_NEIGHBORHOOD', query: data.neighborhood };
      }

      neighborhoodId = neighborhood.id;
      neighborhoodName = neighborhood.name;
    }

    const updated = await this.citizens.updateCitizen(citizen.id, {
      name: data.name,
      email: data.email,
      neighborhoodId,
      neighborhood: neighborhoodName,
      interests: data.interests ? normalizeInterests(data.interests) : undefined,
    });

    return {
      updated: true,
      citizen: updated,
    };
  }
}
