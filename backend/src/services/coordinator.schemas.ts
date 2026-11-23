import { z } from 'zod';

const optionalPhone = z.string().trim().max(30).nullable().optional();
const optionalStructureId = z.string().uuid().nullable().optional();

export const CreateCoordinatorSchema = z
  .object({
    sectionId: z.string().uuid(),
    fullName: z.string().trim().min(2).max(255),
    phone: optionalPhone,
    email: z.string().trim().email().max(255),
    structureId: optionalStructureId,
  })
  .strict();

export const UpdateCoordinatorSchema = z
  .object({
    fullName: z.string().trim().min(2).max(255).optional(),
    phone: optionalPhone,
    email: z.string().trim().email().max(255).optional(),
    structureId: optionalStructureId,
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Al menos un campo debe ser enviado',
  });

export const CoordinatorIdParamSchema = z.object({ id: z.string().uuid() });

export const CoordinatorListQuerySchema = z.object({
  sectionId: z.string().uuid().optional(),
  structureId: z.string().uuid().optional(),
});

export type CreateCoordinatorInput = z.infer<typeof CreateCoordinatorSchema>;
export type UpdateCoordinatorInput = z.infer<typeof UpdateCoordinatorSchema>;
