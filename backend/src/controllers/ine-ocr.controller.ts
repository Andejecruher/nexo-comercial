import type { NextFunction, Request, Response } from 'express';
import { z, ZodError } from 'zod';
import type { AuditService } from '../services/audit.service';
import { IneOcrService, type IneUploadAsset } from '../services/ine/ine-ocr.service';
import { validatePhone } from '../services/ine/promovido-validations';
import type { PromovidoService } from '../services/promovido.service';
import { AppError } from '../utils/app-error';

const uploadIdSchema = z.object({ id: z.string().uuid() });
const reviewSchema = z.object({
  sectionId: z.string().uuid(),
  leaderId: z.string().uuid(),
  manualPhone: z.string().trim().min(6).max(30).optional(),
  neighborhoodId: z.string().uuid().optional(),
  fields: z.record(z.string(), z.string().trim().max(500)).default({}),
});
const neighborhoodMatchSchema = z.object({
  rawValue: z.string().trim().min(1).max(255),
  sectionId: z.preprocess(
    (val) => (val === '' || val === null ? undefined : val),
    z.string().uuid().optional(),
  ),
  municipality: z.string().trim().min(1).max(100).optional(),
  postalCode: z.string().trim().min(1).max(10).optional(),
});
const sectionCandidateSchema = z.object({
  fields: z.record(z.string(), z.string().trim().max(500)).default({}),
});
const confirmSchema = z.object({ citizenId: z.string().uuid().optional() });
const stateSchema = z.object({
  code: z.string().trim().min(1).max(10),
  name: z.string().trim().min(1).max(120),
});
const districtSchema = z.object({
  stateId: z.string().uuid(),
  code: z.string().trim().min(1).max(20),
  name: z.string().trim().max(120).optional(),
});
const nonNegInt = z.number().int().min(0).nullable().optional();
const sectionSchema = z.object({
  stateId: z.string().uuid(),
  districtId: z.string().uuid(),
  sectionCode: z.string().trim().min(1).max(20),
  pollingStationCount: nonNegInt,
  votesPerStation: nonNegInt,
  nominalList: nonNegInt,
  votesRequired: nonNegInt,
});
const leaderSchema = z.object({
  sectionId: z.string().uuid(),
  coordinatorId: z.string().uuid(),
  neighborhoodId: z.string().uuid().nullable().optional(),
  fullName: z.string().trim().min(2).max(255),
  phone: z
    .string()
    .trim()
    .max(30)
    .nullable()
    .optional()
    .refine(
      (value) =>
        value === undefined || value === null || value === '' || validatePhone(value).valid,
      'El teléfono no es válido.',
    ),
  email: z.string().trim().email().max(255),
  promovidoQuota: z.coerce.number().int().min(1).max(100000).nullable().optional(),
  role: z.enum(['PROMOTOR_BARRIO', 'ENLACE_TERRITORIAL']).optional(),
});
const catalogIdSchema = z.object({ id: z.string().uuid() });
const promovidoListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(100).optional(),
  leaderId: z.string().uuid().optional(),
  sex: z.enum(['H', 'M']).optional(),
  sectionId: z.string().uuid().optional(),
  isActive: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
});
const promovidoCreateSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  paternalLastName: z.string().trim().min(1).max(100),
  maternalLastName: z.string().trim().max(100).optional(),
  birthDate: z.string().trim().max(20).optional(),
  sex: z.enum(['H', 'M']).optional(),
  curp: z.string().trim().min(18).max(18),
  voterKey: z.string().trim().min(12).max(24),
  address: z.string().trim().max(500).optional(),
  neighborhood: z.string().trim().max(255).optional(),
  neighborhoodId: z.string().uuid().optional(),
  locality: z.string().trim().max(255).optional(),
  municipality: z.string().trim().max(255).optional(),
  state: z.string().trim().max(120).optional(),
  sectionId: z.string().uuid(),
  leaderId: z.string().uuid(),
  phone: z.string().trim().max(20).optional(),
  isActive: z.boolean().optional(),
  observations: z.string().trim().max(2000).optional(),
  citizenId: z.string().uuid().optional(),
});
const promovidoUpdateSchema = promovidoCreateSchema.partial().extend({
  citizenId: z.union([z.string().uuid(), z.literal('null'), z.null()]).optional(),
});
const voterKeyCheckSchema = z.object({
  voterKey: z.string().trim().min(1),
  excludeId: z.string().uuid().optional(),
});
const includeInactiveSchema = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true')
  .optional();
const leaderListSchema = z
  .object({
    sectionId: z.string().uuid().optional(),
    coordinatorId: z.string().uuid().optional(),
    q: z.preprocess(
      (val) => (typeof val === 'string' && val.trim() === '' ? undefined : val),
      z.string().trim().max(100).optional(),
    ),
    includeInactive: includeInactiveSchema,
    page: z.coerce.number().int().min(1).optional(),
    pageSize: z.coerce.number().int().min(1).max(100).optional(),
  })
  .transform((value) => {
    if (value.page === undefined) {
      return {
        sectionId: value.sectionId,
        coordinatorId: value.coordinatorId,
        q: value.q,
        includeInactive: value.includeInactive,
      };
    }
    return { ...value, pageSize: value.pageSize ?? 20 };
  });
const stateUpdateSchema = stateSchema
  .extend({ isActive: z.boolean() })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required');
const districtUpdateSchema = districtSchema
  .extend({ name: z.string().trim().max(120).nullable(), isActive: z.boolean() })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required');
const sectionUpdateSchema = sectionSchema
  .extend({ isActive: z.boolean() })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required');
const leaderUpdateSchema = leaderSchema
  .extend({ isActive: z.boolean() })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required');

function multipartAssets(req: Request): IneUploadAsset[] {
  const contentType = req.headers['content-type'] ?? '';
  const boundary =
    contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i)?.[1] ??
    contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i)?.[2];
  if (!boundary || !Buffer.isBuffer(req.body))
    throw AppError.badRequest('Expected multipart form data');
  const assets: IneUploadAsset[] = [];
  for (const part of req.body.toString('latin1').split(`--${boundary}`)) {
    const marker = '\r\n\r\n';
    const separator = part.indexOf(marker);
    if (separator < 0) continue;
    const headers = part.slice(0, separator);
    const content = part.slice(separator + marker.length).replace(/\r\n$/, '');
    const disposition = headers.match(/name="([^"]+)"(?:;\s*filename="([^"]*)")?/i);
    const mimeType = headers.match(/content-type:\s*([^\r\n;]+)/i)?.[1]?.trim();
    if (!disposition?.[2] || !mimeType || !['front', 'back'].includes(disposition[1])) continue;
    assets.push({
      side: disposition[1] as 'front' | 'back',
      filename: disposition[2],
      mimeType,
      contents: Buffer.from(content, 'latin1'),
    });
  }
  return assets;
}

export class IneOcrController {
  constructor(
    private readonly service: IneOcrService,
    private readonly promovidoService: PromovidoService,
    private readonly audit: AuditService,
  ) {}

  createUpload = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const upload = await this.service.createUpload(req.user!.id, multipartAssets(req));
      await this.audit.logFromRequest(req, {
        actorId: req.user!.id,
        action: 'ine.upload.create',
        targetType: 'UploadRecord',
        targetId: upload.id,
        metadata: { fileCount: upload.files.length },
      });
      res.status(201).json({ upload });
    } catch (error) {
      this.handle(error, res, next);
    }
  };

  getUpload = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.json({ upload: await this.service.getUpload(uploadIdSchema.parse(req.params).id) });
    } catch (error) {
      this.handle(error, res, next);
    }
  };

  review = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = uploadIdSchema.parse(req.params).id;
      const upload = await this.service.reviewUpload(
        id,
        req.user!.id,
        reviewSchema.parse(req.body),
      );
      await this.audit.logFromRequest(req, {
        actorId: req.user!.id,
        action: 'ine.upload.review',
        targetType: 'UploadRecord',
        targetId: id,
        metadata: { sectionId: upload.reviewedSection?.id, leaderId: upload.leader?.id },
      });
      res.json({ upload });
    } catch (error) {
      this.handle(error, res, next);
    }
  };

  confirm = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = uploadIdSchema.parse(req.params).id;
      const promovido = await this.service.confirm(
        id,
        req.user!.id,
        confirmSchema.parse(req.body).citizenId,
      );
      await this.audit.logFromRequest(req, {
        actorId: req.user!.id,
        action: 'ine.promovido.confirm',
        targetType: 'Promovido',
        targetId: promovido.id,
        metadata: { uploadId: id },
      });
      res.status(201).json({ promovido });
    } catch (error) {
      this.handle(error, res, next);
    }
  };

  retry = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = uploadIdSchema.parse(req.params).id;
      const upload = await this.service.retry(id);
      await this.audit.logFromRequest(req, {
        actorId: req.user!.id,
        action: 'ine.upload.retry',
        targetType: 'UploadRecord',
        targetId: id,
        metadata: { status: upload.status },
      });
      res.json({ upload });
    } catch (error) {
      this.handle(error, res, next);
    }
  };
  candidates = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.json({
        citizens: await this.service.searchCandidates(uploadIdSchema.parse(req.params).id),
      });
    } catch (error) {
      this.handle(error, res, next);
    }
  };
  sectionCandidates = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = uploadIdSchema.parse(req.params).id;
      const { fields } = sectionCandidateSchema.parse(req.body);
      res.json({ sectionCandidates: await this.service.resolveSectionCandidates(id, fields) });
    } catch (error) {
      this.handle(error, res, next);
    }
  };
  neighborhoodMatch = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.json({
        match: await this.service.matchNeighborhood(neighborhoodMatchSchema.parse(req.body)),
      });
    } catch (error) {
      this.handle(error, res, next);
    }
  };
  promovido = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.json({ promovido: await this.service.getPromovido(uploadIdSchema.parse(req.params).id) });
    } catch (error) {
      this.handle(error, res, next);
    }
  };
  states = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { includeInactive } = z
        .object({ includeInactive: includeInactiveSchema })
        .parse(req.query);
      res.json({ states: await this.service.listStates(includeInactive) });
    } catch (error) {
      this.handle(error, res, next);
    }
  };
  createState = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.status(201).json({ state: await this.service.createState(stateSchema.parse(req.body)) });
    } catch (error) {
      this.handle(error, res, next);
    }
  };
  updateState = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = catalogIdSchema.parse(req.params);
      const state = await this.service.updateState(id, stateUpdateSchema.parse(req.body));
      await this.audit.logFromRequest(req, {
        actorId: req.user!.id,
        action: 'ine.catalog.state.update',
        targetType: 'ElectoralState',
        targetId: id,
        metadata: { isActive: state.isActive },
      });
      res.json({ state });
    } catch (error) {
      this.handle(error, res, next);
    }
  };
  deactivateState = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = catalogIdSchema.parse(req.params);
      const state = await this.service.deactivateState(id);
      await this.audit.logFromRequest(req, {
        actorId: req.user!.id,
        action: 'ine.catalog.state.deactivate',
        targetType: 'ElectoralState',
        targetId: id,
        metadata: { isActive: state.isActive },
      });
      res.json({ message: 'Estado electoral desactivado correctamente', state });
    } catch (error) {
      this.handle(error, res, next);
    }
  };
  districts = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { stateId, includeInactive } = z
        .object({
          stateId: z.string().uuid().optional(),
          includeInactive: includeInactiveSchema,
        })
        .parse(req.query);
      res.json({
        districts: await this.service.listDistricts(stateId, includeInactive),
      });
    } catch (error) {
      this.handle(error, res, next);
    }
  };
  createDistrict = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res
        .status(201)
        .json({ district: await this.service.createDistrict(districtSchema.parse(req.body)) });
    } catch (error) {
      this.handle(error, res, next);
    }
  };
  updateDistrict = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = catalogIdSchema.parse(req.params);
      const district = await this.service.updateDistrict(id, districtUpdateSchema.parse(req.body));
      await this.audit.logFromRequest(req, {
        actorId: req.user!.id,
        action: 'ine.catalog.district.update',
        targetType: 'ElectoralDistrict',
        targetId: id,
        metadata: { stateId: district.stateId, isActive: district.isActive },
      });
      res.json({ district });
    } catch (error) {
      this.handle(error, res, next);
    }
  };
  deactivateDistrict = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = catalogIdSchema.parse(req.params);
      const district = await this.service.deactivateDistrict(id);
      await this.audit.logFromRequest(req, {
        actorId: req.user!.id,
        action: 'ine.catalog.district.deactivate',
        targetType: 'ElectoralDistrict',
        targetId: id,
        metadata: { stateId: district.stateId, isActive: district.isActive },
      });
      res.json({ message: 'Distrito electoral desactivado correctamente', district });
    } catch (error) {
      this.handle(error, res, next);
    }
  };
  sections = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = z
        .object({
          stateId: z.string().uuid().optional(),
          districtId: z.string().uuid().optional(),
          includeInactive: includeInactiveSchema,
          limit: z.coerce.number().int().min(1).max(500).optional(),
        })
        .parse(req.query);
      res.json({
        sections: await this.service.listSections(query),
      });
    } catch (error) {
      this.handle(error, res, next);
    }
  };
  createSection = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res
        .status(201)
        .json({ section: await this.service.createSection(sectionSchema.parse(req.body)) });
    } catch (error) {
      this.handle(error, res, next);
    }
  };
  updateSection = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = catalogIdSchema.parse(req.params);
      const section = await this.service.updateSection(id, sectionUpdateSchema.parse(req.body));
      await this.audit.logFromRequest(req, {
        actorId: req.user!.id,
        action: 'ine.catalog.section.update',
        targetType: 'Section',
        targetId: id,
        metadata: {
          stateId: section.stateId,
          districtId: section.districtId,
          isActive: section.isActive,
        },
      });
      res.json({ section });
    } catch (error) {
      this.handle(error, res, next);
    }
  };
  deactivateSection = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = catalogIdSchema.parse(req.params);
      const section = await this.service.deactivateSection(id);
      await this.audit.logFromRequest(req, {
        actorId: req.user!.id,
        action: 'ine.catalog.section.deactivate',
        targetType: 'Section',
        targetId: id,
        metadata: {
          stateId: section.stateId,
          districtId: section.districtId,
          isActive: section.isActive,
        },
      });
      res.json({ message: 'Sección electoral desactivada correctamente', section });
    } catch (error) {
      this.handle(error, res, next);
    }
  };
  leaders = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.json(await this.service.listLeaders(leaderListSchema.parse(req.query), req.scope));
    } catch (error) {
      this.handle(error, res, next);
    }
  };
  createLeader = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.status(201).json(
        await this.service.createLeader(leaderSchema.parse(req.body), {
          actorId: req.user!.id,
          actorName: req.user!.fullName ?? undefined,
        }),
      );
    } catch (error) {
      this.handle(error, res, next);
    }
  };
  updateLeader = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = catalogIdSchema.parse(req.params);
      const leader = await this.service.updateLeader(id, leaderUpdateSchema.parse(req.body));
      await this.audit.logFromRequest(req, {
        actorId: req.user!.id,
        action: 'ine.catalog.leader.update',
        targetType: 'Leader',
        targetId: id,
        metadata: { sectionId: leader.sectionId, isActive: leader.isActive },
      });
      res.json({ leader });
    } catch (error) {
      this.handle(error, res, next);
    }
  };
  deactivateLeader = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = catalogIdSchema.parse(req.params);
      const leader = await this.service.deactivateLeader(id);
      await this.audit.logFromRequest(req, {
        actorId: req.user!.id,
        action: 'ine.catalog.leader.deactivate',
        targetType: 'Leader',
        targetId: id,
        metadata: { sectionId: leader.sectionId, isActive: leader.isActive },
      });
      res.json({ message: 'Líder electoral desactivado correctamente', leader });
    } catch (error) {
      this.handle(error, res, next);
    }
  };
  reinviteLeader = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = catalogIdSchema.parse(req.params);
      const result = await this.service.reinviteLeader(id, {
        actorId: req.user!.id,
        actorName: req.user!.fullName ?? undefined,
      });
      await this.audit.logFromRequest(req, {
        actorId: req.user!.id,
        action: 'ine.catalog.leader.reinvite',
        targetType: 'Leader',
        targetId: id,
      });
      res.json(result);
    } catch (error) {
      this.handle(error, res, next);
    }
  };

  listPromovidos = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = promovidoListSchema.parse(req.query);
      const result = await this.promovidoService.list(query, req.scope);
      res.json(result);
    } catch (error) {
      this.handle(error, res, next);
    }
  };

  getPromovido = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = catalogIdSchema.parse(req.params);
      res.json({ promovido: await this.promovidoService.getDetailById(id, req.scope) });
    } catch (error) {
      this.handle(error, res, next);
    }
  };

  checkVoterKey = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { voterKey, excludeId } = voterKeyCheckSchema.parse(req.query);
      const conflict = await this.promovidoService.checkVoterKeyConflict(voterKey, excludeId);
      res.json({ conflict });
    } catch (error) {
      this.handle(error, res, next);
    }
  };

  createPromovido = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const payload = promovidoCreateSchema.parse(req.body);
      const promovido = await this.promovidoService.create(payload, req.user!.id, req.scope);
      await this.audit.logFromRequest(req, {
        actorId: req.user!.id,
        action: 'promovido.create',
        targetType: 'Promovido',
        targetId: promovido.id,
        metadata: { leaderId: promovido.data.leaderId, sectionId: promovido.data.sectionId },
      });
      res.status(201).json({ promovido });
    } catch (error) {
      this.handle(error, res, next);
    }
  };

  updatePromovido = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = catalogIdSchema.parse(req.params);
      const payload = promovidoUpdateSchema.parse(req.body);
      const previous = await this.promovidoService.getById(id, req.scope);
      const promovido = await this.promovidoService.update(id, payload, req.scope);
      await this.audit.logFromRequest(req, {
        actorId: req.user!.id,
        action: 'promovido.update',
        targetType: 'Promovido',
        targetId: id,
        metadata: {
          leaderIdChanged: payload.leaderId && payload.leaderId !== previous.data.leaderId,
          sectionIdChanged: payload.sectionId && payload.sectionId !== previous.data.sectionId,
          vigenciaChanged: payload.isActive !== undefined && payload.isActive !== previous.isActive,
        },
      });
      res.json({ promovido });
    } catch (error) {
      this.handle(error, res, next);
    }
  };

  private handle(error: unknown, res: Response, next: NextFunction): void {
    if (error instanceof ZodError) {
      res.status(400).json({ error: 'Invalid data', details: error.issues });
      return;
    }
    next(error);
  }
}
