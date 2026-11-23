import { Prisma } from '@prisma/client';
import { neighborhoodMatchKey } from '../utils/neighborhood-match-key';
import type { PrismaService } from './prisma.service';

type NeighborhoodMatchRow = {
  id: string;
  name: string;
  matchKey: string;
  sectionId: string | null;
  /** Acompaña al nombre en la UI: el catálogo multi-municipio tiene homónimos. */
  municipality: string | null;
  score: number;
};
export type NeighborhoodMatch = NeighborhoodMatchRow;

export type NeighborhoodMatchRanking = {
  bestMatch: NeighborhoodMatchRow | undefined;
  matchPrincipal: NeighborhoodMatchRow | undefined;
  alternatives: NeighborhoodMatchRow[];
  confidence: number;
  requiresManualDecision: boolean;
};

export type NeighborhoodMatchResult = NeighborhoodMatchRanking & {
  rawValue: string;
  normalizedValue: string;
};

export function rankNeighborhoodMatches(rows: NeighborhoodMatchRow[]): NeighborhoodMatchRanking {
  const alternatives = rows.map((row) => ({ ...row, score: Number(row.score) }));
  const best = alternatives[0];
  const second = alternatives[1];
  const highConfidence = Boolean(
    best && best.score >= 0.78 && (!second || best.score - second.score >= 0.08),
  );
  return {
    bestMatch: highConfidence ? best : undefined,
    // Compatibility for existing clients while they migrate to `bestMatch`.
    matchPrincipal: highConfidence ? best : undefined,
    alternatives,
    confidence: best?.score ?? 0,
    requiresManualDecision: !highConfidence,
  };
}

export class NeighborhoodMatchService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Match an OCR-extracted neighborhood value against the catalog.
   *
   * `municipality` and `postalCode` are optional geo signals from the INE
   * OCR. They are used as **score boosters**, NOT as WHERE filters. This
   * means OCR noise in a geo field never eliminates an otherwise perfect name
   * match — it just reduces the boost.
   *
   * Scoring formula:
   *   score = name_similarity + mun_bonus + cp_bonus
   *
   * - name_similarity: pg_trgm `similarity(match_key, normalized_value)` [0..1]
   * - mun_bonus: +0.08 if municipality ILIKE matches (substring), else
   *   `similarity(lower(municipality), input_municipality) * 0.10` for fuzzy
   *   partial matches (handles OCR typos like "CINTLAPA" vs "Cintalapa").
   * - cp_bonus: +0.05 if postal_code matches exactly.
   *
   * The max bonus is ~0.13, enough to break ties between same-name
   * neighborhoods in different municipalities (margin > 0.08) without
   * pushing a weak name match above the 0.78 confidence threshold.
   */
  async match(input: {
    rawValue: string;
    sectionId?: string;
    municipality?: string;
    postalCode?: string;
    limit?: number;
  }): Promise<NeighborhoodMatchResult> {
    const normalizedValue = neighborhoodMatchKey(input.rawValue);
    if (!normalizedValue) {
      return {
        rawValue: input.rawValue,
        normalizedValue,
        bestMatch: undefined,
        matchPrincipal: undefined,
        alternatives: [],
        confidence: 0,
        requiresManualDecision: true,
      };
    }
    const sectionId = input.sectionId ?? null;
    // Normalize municipality: lowercase + strip accents for fuzzy comparison.
    const municipality =
      input.municipality
        ?.trim()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase() || null;
    const postalCode = input.postalCode?.trim() || null;
    const limit = Math.min(input.limit ?? 5, 20);

    const rows = await this.queryMatches(
      normalizedValue,
      sectionId,
      municipality,
      postalCode,
      limit,
    );
    return { rawValue: input.rawValue, normalizedValue, ...rankNeighborhoodMatches(rows) };
  }

  /**
   * Single trigram query with geo score boosting. The WHERE clause only
   * filters by trigram similarity (GIN-indexed `%` operator) and optional
   * sectionId. Geo fields contribute to the ORDER BY score, not to filtering.
   */
  private async queryMatches(
    normalizedValue: string,
    sectionId: string | null,
    municipality: string | null,
    postalCode: string | null,
    limit: number,
  ): Promise<NeighborhoodMatchRow[]> {
    return this.prisma.$queryRaw<NeighborhoodMatchRow[]>(Prisma.sql`
      SELECT "id", "name", "match_key" AS "matchKey", "section_id" AS "sectionId",
             "municipality",
             (similarity("match_key", ${normalizedValue})
              + CASE WHEN ${municipality} IS NOT NULL THEN
                  CASE WHEN "municipality" ILIKE '%' || ${municipality} || '%' THEN 0.08
                       ELSE COALESCE(similarity(lower("municipality"), ${municipality}), 0) * 0.10
                  END
                ELSE 0 END
              + CASE WHEN ${postalCode} IS NOT NULL AND "postal_code" = ${postalCode} THEN 0.05 ELSE 0 END
             )::double precision AS "score"
      FROM "neighborhoods"
      WHERE (${sectionId}::uuid IS NULL OR "section_id" = ${sectionId}::uuid OR "section_id" IS NULL)
        AND "match_key" % ${normalizedValue}
      ORDER BY "score" DESC, "name" ASC
      LIMIT ${limit}
    `);
  }
}
