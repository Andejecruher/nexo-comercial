/**
 * Fase 0: garantiza que Department.slug no puede modificarse tras el alta.
 *
 * El campo slug es referenciado como String? sin FK por ConversationMeta,
 * Ticket y RealtimeOutboxEvent. Renombrarlo dejaría registros huérfanos.
 * La protección se aplica en el schema (Zod elimina la clave del input) y
 * en el servicio (nunca pasa slug al repositorio en update).
 */
import { describe, expect, it, jest } from '@jest/globals';
import { DepartmentsService, UpdateDepartmentSchema } from '../../services/departments.service';

describe('Fase 0 — Department.slug es inmutable', () => {
  it('UpdateDepartmentSchema descarta silenciosamente cualquier slug enviado', () => {
    const parsed = UpdateDepartmentSchema.parse({
      slug: 'otro-slug',
      name: 'Nuevo nombre',
    } as Record<string, unknown>);

    expect(parsed).not.toHaveProperty('slug');
    expect(parsed.name).toBe('Nuevo nombre');
  });

  it('UpdateDepartmentSchema exige al menos un campo real', () => {
    const result = UpdateDepartmentSchema.safeParse({} as Record<string, unknown>);
    expect(result.success).toBe(false);
  });

  it('DepartmentsService.update nunca propaga slug al repositorio', async () => {
    const repo = {
      findByIdWithSlug: jest
        .fn<(id: string) => Promise<{ id: string; slug: string } | null>>()
        .mockResolvedValue({ id: 'dep-1', slug: 'obras-publicas' }),
      update: jest
        .fn<(id: string, patch: Record<string, unknown>) => Promise<Record<string, unknown>>>()
        .mockResolvedValue({
          id: 'dep-1',
          slug: 'obras-publicas',
          name: 'Obras Públicas',
          description: null,
          isActive: true,
          keywords: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
    };

    const service = new DepartmentsService(repo as never);

    await service.update('dep-1', {
      name: 'Obras Públicas',
    });

    expect(repo.update).toHaveBeenCalledTimes(1);
    const patch = repo.update.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(patch).not.toHaveProperty('slug');
    expect(patch).toMatchObject({ name: 'Obras Públicas' });
  });
});
