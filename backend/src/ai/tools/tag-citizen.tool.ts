/**
 * TagCitizenTool — internal AI tool.
 *
 * Responsabilidad:
 *  - Validar que el ciudadano exista.
 *  - Normalizar tags (trim + lowercase, dedup, drop empty).
 *  - Resolver tags por nombre (case-insensitive); crear si no existe.
 *  - Asignar tags al ciudadano de forma idempotente.
 *  - Registrar audit log con action `citizen.tag.assign`.
 *  - Emitir métricas estructuradas (latencia, conteos, errores).
 *
 * Contrato: execute(input: unknown): Promise<unknown>
 * No lanza AppError — devuelve error estructurado { error } para que el orchestrador lo maneje.
 *
 * Diseño extensible (sin implementación ahora):
 *  - untagCitizen: remover tags con acción `citizen.tag.remove`
 *  - bulkTag: asignar tags a múltiples ciudadanos
 *  - hierarchicalTags: tag.parentId para jerarquías
 *  - tagScoring: peso/score por tag asignada
 *  - segmentation: derivar segmentos de combinaciones de tags
 */
import { z } from 'zod';
import { CitizenRepository } from '../../repositories/citizen.repository';
import { TaggingRepository } from '../../repositories/tagging.repository';
import { AuditService } from '../../services/audit.service';
import { PrismaService } from '../../services/prisma.service';

// ── Schema de entrada ──────────────────────────────────────────────────────────

export const tagCitizenSchema = z.object({
  /** UUID del ciudadano al que se asignan las tags. */
  citizenId: z.string().uuid({ message: 'citizenId must be a valid UUID' }),
  /**
   * Lista de nombres de tags a asignar.
   * Cada elemento debe ser una cadena no vacía (post-trim). El array debe
   * contener al menos un elemento. La normalización a lowercase / dedup
   * ocurre en tiempo de ejecución tras la validación del schema.
   */
  tags: z
    .array(z.string().min(1, { message: 'Each tag must be a non-empty string' }))
    .min(1, { message: 'tags must contain at least one element' }),
  /** Fuente de la asignación; por defecto "ai". */
  source: z.string().trim().min(1).max(100).optional(),
});

export type TagCitizenInput = z.infer<typeof tagCitizenSchema>;

// ── Tipos de salida ────────────────────────────────────────────────────────────

export type TagCitizenOutput = {
  success: boolean;
  /** Tags efectivamente asignadas en esta llamada. */
  assigned: string[];
  /** Tags que ya estaban asignadas (idempotente). */
  skipped: string[];
};

// ── Structured metrics helper ──────────────────────────────────────────────────

type TagCitizenErrorCode =
  | 'INVALID_INPUT'
  | 'CITIZEN_NOT_FOUND'
  | 'ALL_TAGS_EMPTY'
  | 'EXECUTION_ERROR';

/**
 * Emits a structured JSON log line compatible with the project's existing
 * console-based structured-logging convention (see bot.service.ts, auth.service.ts).
 *
 * All numeric fields use snake_case for compatibility with log aggregation
 * tools (Datadog, Loki, CloudWatch Logs Insights).
 */
function emitMetric(
  level: 'info' | 'warn' | 'error',
  event: string,
  fields: Record<string, unknown>,
): void {
  const payload = { tool: 'tagCitizen', event, ...fields };
  if (level === 'info') {
    console.log('[TagCitizenTool]', JSON.stringify(payload));
  } else if (level === 'warn') {
    console.warn('[TagCitizenTool]', JSON.stringify(payload));
  } else {
    console.error('[TagCitizenTool]', JSON.stringify(payload));
  }
}

// ── Tool ───────────────────────────────────────────────────────────────────────

export class TagCitizenTool {
  readonly key = 'tagCitizen';
  private readonly citizens: CitizenRepository;
  private readonly tagging: TaggingRepository;

  constructor(
    prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {
    this.citizens = new CitizenRepository(prisma);
    this.tagging = new TaggingRepository(prisma);
  }

  async execute(input: unknown): Promise<unknown> {
    const startedAt = Date.now();

    // ── 1. Input contract validation ─────────────────────────────────────────

    const parsed = tagCitizenSchema.safeParse(input);
    if (!parsed.success) {
      const issues = parsed.error.issues;
      emitMetric('warn', 'validation_failed', {
        error_code: 'INVALID_INPUT' satisfies TagCitizenErrorCode,
        issue_count: issues.length,
        issues: issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
      return { error: 'INVALID_INPUT', details: issues };
    }

    const data = parsed.data;

    try {
      // ── 2. Validate citizen exists ─────────────────────────────────────────

      const citizen = await this.citizens.findByIdMinimal(data.citizenId);

      if (!citizen) {
        emitMetric('warn', 'citizen_not_found', {
          error_code: 'CITIZEN_NOT_FOUND' satisfies TagCitizenErrorCode,
          citizen_id: data.citizenId,
        });
        return { error: 'CITIZEN_NOT_FOUND', citizenId: data.citizenId };
      }

      // ── 3. Normalize tags: trim + lowercase, drop empty, dedupe ───────────

      const normalizedRequested = [
        ...new Set(data.tags.map((t) => t.trim().toLowerCase()).filter((t) => t.length > 0)),
      ];

      if (normalizedRequested.length === 0) {
        emitMetric('warn', 'all_tags_empty_after_normalization', {
          error_code: 'ALL_TAGS_EMPTY' satisfies TagCitizenErrorCode,
          citizen_id: data.citizenId,
          raw_tag_count: data.tags.length,
        });
        return {
          error: 'INVALID_INPUT',
          details: [{ message: 'All tags are empty after normalization' }],
        };
      }

      emitMetric('info', 'processing_started', {
        citizen_id: data.citizenId,
        requested_tag_count: normalizedRequested.length,
        source: data.source ?? 'ai',
      });

      // ── 4. Resolve & assign inside a single transaction ───────────────────

      const { assigned, skipped } = await this.tagging.assignTagsToCitizen({
        citizenId: data.citizenId,
        normalizedTagNames: normalizedRequested,
      });

      // ── 5. Write audit log (non-blocking — audit failures must not abort the operation) ──

      await this.auditService.log({
        actorId: undefined,
        action: 'citizen.tag.assign',
        targetType: 'Citizen',
        targetId: data.citizenId,
        metadata: {
          tags: normalizedRequested,
          source: data.source ?? 'ai',
        },
      });

      // ── 6. Emit success metrics ────────────────────────────────────────────

      const durationMs = Date.now() - startedAt;
      emitMetric('info', 'completed', {
        citizen_id: data.citizenId,
        requested_tag_count: normalizedRequested.length,
        assigned_count: assigned.length,
        skipped_count: skipped.length,
        duration_ms: durationMs,
        source: data.source ?? 'ai',
      });

      const result: TagCitizenOutput = { success: true, assigned, skipped };
      return result;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const durationMs = Date.now() - startedAt;
      emitMetric('error', 'execution_error', {
        error_code: 'EXECUTION_ERROR' satisfies TagCitizenErrorCode,
        citizen_id: data.citizenId,
        error_message: message,
        duration_ms: durationMs,
      });
      return { error: 'EXECUTION_ERROR', message };
    }
  }
}
