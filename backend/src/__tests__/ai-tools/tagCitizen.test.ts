/**
 * Unit tests: TagCitizenTool
 *
 * Casos:
 *  - assign new tags (ciudadano existe, tags nuevas → assigned lleno, skipped vacío)
 *  - assign existing tags (ya asignadas → assigned vacío, skipped lleno)
 *  - mixed: algunas nuevas, algunas ya asignadas
 *  - non-existing citizen → error CITIZEN_NOT_FOUND
 *  - invalid input: tags vacío, citizenId inválido, etc.
 *  - input contract: tag con solo espacios (rechazado en schema), tag vacía
 *  - metrics: emitMetric (console.log/warn/error) se llama con campos estructurados
 */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { TagCitizenTool } from '../../ai/tools/tag-citizen.tool';

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeAuditServiceMock() {
  return {
    log: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    logFromRequest: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  };
}

/**
 * Minimal Prisma mock that covers the operations performed inside the tool.
 * `$transaction` captures the callback and passes `__tx` as the Prisma client.
 */
function makePrismaMock() {
  const tx = {
    tag: {
      findMany: jest.fn<() => Promise<{ id: string; name: string }[]>>(),
      upsert: jest.fn<() => Promise<{ id: string; name: string }>>(),
    },
    citizenTag: {
      findMany: jest.fn<() => Promise<{ tagId: string }[]>>(),
      createMany: jest.fn<() => Promise<{ count: number }>>(),
    },
  };

  return {
    citizen: {
      findUnique: jest.fn<() => Promise<{ id: string } | null>>(),
    },
    $transaction: jest.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
    __tx: tx,
  };
}

// ── Fixtures ───────────────────────────────────────────────────────────────────

const CITIZEN_ID = 'a1b2c3d4-e5f6-4a1b-8c2d-e3f4a5b6c7d8';

const TAG_VECINO = { id: 'tag-001', name: 'vecino' };
const TAG_ACTIVO = { id: 'tag-002', name: 'activo' };
const TAG_NUEVO = { id: 'tag-003', name: 'nuevo' };

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('TagCitizenTool', () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let auditService: ReturnType<typeof makeAuditServiceMock>;
  let tool: TagCitizenTool;

  // Spy on structured emitMetric calls
  let consoleLogSpy: ReturnType<typeof jest.spyOn>;
  let consoleWarnSpy: ReturnType<typeof jest.spyOn>;
  let consoleErrorSpy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    prisma = makePrismaMock();
    auditService = makeAuditServiceMock();
    // @ts-ignore — mock parcial
    tool = new TagCitizenTool(prisma, auditService);

    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ── Input validation ─────────────────────────────────────────────────────────

  it('devuelve INVALID_INPUT cuando citizenId no es UUID', async () => {
    const result = await tool.execute({ citizenId: 'not-a-uuid', tags: ['vecino'] });
    expect(result).toMatchObject({ error: 'INVALID_INPUT' });
  });

  it('devuelve INVALID_INPUT cuando tags es array vacío', async () => {
    const result = await tool.execute({ citizenId: CITIZEN_ID, tags: [] });
    expect(result).toMatchObject({ error: 'INVALID_INPUT' });
  });

  it('devuelve INVALID_INPUT cuando tags está ausente', async () => {
    const result = await tool.execute({ citizenId: CITIZEN_ID });
    expect(result).toMatchObject({ error: 'INVALID_INPUT' });
  });

  it('devuelve INVALID_INPUT cuando input es null', async () => {
    const result = await tool.execute(null);
    expect(result).toMatchObject({ error: 'INVALID_INPUT' });
  });

  it('devuelve INVALID_INPUT cuando un tag es string vacío (contrato de schema)', async () => {
    // Empty string fails z.string().min(1) at schema level — before citizen lookup
    const result = await tool.execute({ citizenId: CITIZEN_ID, tags: [''] });
    expect(result).toMatchObject({ error: 'INVALID_INPUT' });
    // Citizen lookup must NOT be called — validation is pre-DB
    expect(prisma.citizen.findUnique).not.toHaveBeenCalled();
  });

  it('emite warn estructurado al fallar validación', async () => {
    await tool.execute({ citizenId: 'bad', tags: ['ok'] });
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      '[TagCitizenTool]',
      expect.stringContaining('"event":"validation_failed"'),
    );
  });

  it('devuelve INVALID_INPUT cuando todos los tags quedan vacíos tras normalización', async () => {
    // '   ' passes z.string().min(1) (length = 3) but normalizes to '' → ALL_TAGS_EMPTY
    // @ts-ignore
    prisma.citizen.findUnique.mockResolvedValue({ id: CITIZEN_ID });

    const result = await tool.execute({ citizenId: CITIZEN_ID, tags: ['   ', '  '] });
    expect(result).toMatchObject({ error: 'INVALID_INPUT' });
  });

  // ── Citizen not found ────────────────────────────────────────────────────────

  it('devuelve CITIZEN_NOT_FOUND cuando el ciudadano no existe', async () => {
    prisma.citizen.findUnique.mockResolvedValue(null);

    const result = await tool.execute({ citizenId: CITIZEN_ID, tags: ['vecino'] });

    expect(result).toMatchObject({ error: 'CITIZEN_NOT_FOUND', citizenId: CITIZEN_ID });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('emite warn estructurado cuando el ciudadano no existe', async () => {
    prisma.citizen.findUnique.mockResolvedValue(null);
    await tool.execute({ citizenId: CITIZEN_ID, tags: ['vecino'] });

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      '[TagCitizenTool]',
      expect.stringContaining('"event":"citizen_not_found"'),
    );
  });

  // ── Assign new tags ──────────────────────────────────────────────────────────

  it('asigna tags nuevas correctamente (assigned lleno, skipped vacío)', async () => {
    // @ts-ignore
    prisma.citizen.findUnique.mockResolvedValue({ id: CITIZEN_ID });
    // Tags already in DB
    prisma.__tx.tag.findMany.mockResolvedValue([TAG_VECINO]);
    // New tag created
    prisma.__tx.tag.upsert.mockResolvedValue(TAG_ACTIVO);
    // None previously assigned
    prisma.__tx.citizenTag.findMany.mockResolvedValue([]);
    // @ts-ignore
    prisma.__tx.citizenTag.createMany.mockResolvedValue({ count: 2 });

    const result = await tool.execute({
      citizenId: CITIZEN_ID,
      tags: ['vecino', 'activo'],
    });

    expect(result).toMatchObject({
      success: true,
      assigned: expect.arrayContaining(['vecino', 'activo']),
      skipped: [],
    });

    expect(prisma.__tx.citizenTag.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([expect.objectContaining({ citizenId: CITIZEN_ID })]),
        skipDuplicates: true,
      }),
    );

    // assignedById must NOT be set (undefined — AI assignment)
    const createManyCall = (prisma.__tx.citizenTag.createMany.mock.calls[0] as any)?.[0] as
      | { data: object[] }
      | undefined;
    for (const entry of createManyCall?.data ?? []) {
      expect(entry).not.toHaveProperty('assignedById');
    }

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'citizen.tag.assign',
        targetType: 'Citizen',
        targetId: CITIZEN_ID,
        metadata: expect.objectContaining({ source: 'ai' }),
      }),
    );
  });

  it('emite info con campos de métricas tras éxito', async () => {
    // @ts-ignore
    prisma.citizen.findUnique.mockResolvedValue({ id: CITIZEN_ID });
    prisma.__tx.tag.findMany.mockResolvedValue([TAG_VECINO]);
    prisma.__tx.citizenTag.findMany.mockResolvedValue([]);
    // @ts-ignore
    prisma.__tx.citizenTag.createMany.mockResolvedValue({ count: 1 });

    await tool.execute({ citizenId: CITIZEN_ID, tags: ['vecino'] });

    const infoCall = consoleLogSpy.mock.calls.find(
      (args: any[]) =>
        typeof args[1] === 'string' && (args[1] as string).includes('"event":"completed"'),
    );
    expect(infoCall).toBeDefined();
    const payload = JSON.parse(infoCall![1] as string);
    expect(payload).toMatchObject({
      tool: 'tagCitizen',
      event: 'completed',
      requested_tag_count: 1,
      assigned_count: 1,
      skipped_count: 0,
    });
    expect(typeof payload.duration_ms).toBe('number');
  });

  // ── All tags already assigned (skipped) ──────────────────────────────────────

  it('marca todos como skipped cuando todas las tags ya están asignadas', async () => {
    // @ts-ignore
    prisma.citizen.findUnique.mockResolvedValue({ id: CITIZEN_ID });
    prisma.__tx.tag.findMany.mockResolvedValue([TAG_VECINO, TAG_ACTIVO]);
    // Both already assigned
    prisma.__tx.citizenTag.findMany.mockResolvedValue([
      { tagId: TAG_VECINO.id },
      { tagId: TAG_ACTIVO.id },
    ]);

    const result = await tool.execute({
      citizenId: CITIZEN_ID,
      tags: ['vecino', 'activo'],
    });

    expect(result).toMatchObject({
      success: true,
      assigned: [],
      skipped: expect.arrayContaining(['vecino', 'activo']),
    });

    expect(prisma.__tx.citizenTag.createMany).not.toHaveBeenCalled();
  });

  // ── Mixed: some new, some existing ───────────────────────────────────────────

  it('resultado mixto: algunas nuevas y algunas ya asignadas', async () => {
    // @ts-ignore
    prisma.citizen.findUnique.mockResolvedValue({ id: CITIZEN_ID });
    // 'vecino' exists in DB; 'nuevo' does not
    prisma.__tx.tag.findMany.mockResolvedValue([TAG_VECINO]);
    prisma.__tx.tag.upsert.mockResolvedValue(TAG_NUEVO);
    // 'vecino' already assigned; 'nuevo' is not
    prisma.__tx.citizenTag.findMany.mockResolvedValue([{ tagId: TAG_VECINO.id }]);
    // @ts-ignore
    prisma.__tx.citizenTag.createMany.mockResolvedValue({ count: 1 });

    const result = await tool.execute({
      citizenId: CITIZEN_ID,
      tags: ['vecino', 'nuevo'],
    });

    expect(result).toMatchObject({
      success: true,
      assigned: ['nuevo'],
      skipped: ['vecino'],
    });
  });

  // ── Normalization: trim, lowercase, dedupe ────────────────────────────────────

  it('normaliza tags antes de procesarlas (trim, lowercase, dedupe)', async () => {
    // @ts-ignore
    prisma.citizen.findUnique.mockResolvedValue({ id: CITIZEN_ID });
    prisma.__tx.tag.findMany.mockResolvedValue([TAG_VECINO]);
    prisma.__tx.citizenTag.findMany.mockResolvedValue([]);
    // @ts-ignore
    prisma.__tx.citizenTag.createMany.mockResolvedValue({ count: 1 });

    // 'VECINO', ' Vecino ', 'vecino' → deduplicated to ['vecino']
    const result = await tool.execute({
      citizenId: CITIZEN_ID,
      tags: ['VECINO', ' Vecino ', 'vecino'],
    });

    expect(result).toMatchObject({
      success: true,
      assigned: ['vecino'],
      skipped: [],
    });

    // tag.findMany should be called with deduped lowercase
    expect(prisma.__tx.tag.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          name: expect.objectContaining({ in: ['vecino'] }),
        }),
      }),
    );
  });

  // ── Source override ───────────────────────────────────────────────────────────

  it('registra source custom en audit log cuando se provee', async () => {
    // @ts-ignore
    prisma.citizen.findUnique.mockResolvedValue({ id: CITIZEN_ID });
    prisma.__tx.tag.findMany.mockResolvedValue([TAG_VECINO]);
    prisma.__tx.citizenTag.findMany.mockResolvedValue([]);
    // @ts-ignore
    prisma.__tx.citizenTag.createMany.mockResolvedValue({ count: 1 });

    await tool.execute({
      citizenId: CITIZEN_ID,
      tags: ['vecino'],
      source: 'admin-import',
    });

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ source: 'admin-import' }),
      }),
    );
  });

  it('incluye source custom en métricas de éxito', async () => {
    // @ts-ignore
    prisma.citizen.findUnique.mockResolvedValue({ id: CITIZEN_ID });
    prisma.__tx.tag.findMany.mockResolvedValue([TAG_VECINO]);
    prisma.__tx.citizenTag.findMany.mockResolvedValue([]);
    // @ts-ignore
    prisma.__tx.citizenTag.createMany.mockResolvedValue({ count: 1 });

    await tool.execute({ citizenId: CITIZEN_ID, tags: ['vecino'], source: 'webhook' });

    const infoCall = consoleLogSpy.mock.calls.find(
      (args: any[]) =>
        typeof args[1] === 'string' && (args[1] as string).includes('"event":"completed"'),
    );
    const payload = JSON.parse(infoCall![1] as string);
    expect(payload.source).toBe('webhook');
  });

  // ── Error handling ────────────────────────────────────────────────────────────

  it('devuelve EXECUTION_ERROR si prisma falla', async () => {
    prisma.citizen.findUnique.mockRejectedValue(new Error('DB timeout'));

    const result = await tool.execute({ citizenId: CITIZEN_ID, tags: ['vecino'] });

    expect(result).toMatchObject({ error: 'EXECUTION_ERROR', message: 'DB timeout' });
  });

  it('emite error estructurado con duration_ms cuando prisma falla', async () => {
    prisma.citizen.findUnique.mockRejectedValue(new Error('DB timeout'));
    await tool.execute({ citizenId: CITIZEN_ID, tags: ['vecino'] });

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[TagCitizenTool]',
      expect.stringContaining('"event":"execution_error"'),
    );
    const errorCall = consoleErrorSpy.mock.calls.find(
      (args: any[]) =>
        typeof args[1] === 'string' && (args[1] as string).includes('"event":"execution_error"'),
    );
    const payload = JSON.parse(errorCall![1] as string);
    expect(typeof payload.duration_ms).toBe('number');
    expect(payload.error_code).toBe('EXECUTION_ERROR');
    expect(payload.error_message).toBe('DB timeout');
  });
});
