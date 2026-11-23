import { describe, expect, it } from '@jest/globals';
import { rankNeighborhoodMatches } from '../../services/neighborhood-match.service';
import { cleanOcrTerritory, neighborhoodMatchKey } from '../../utils/neighborhood-match-key';

describe('neighborhoodMatchKey', () => {
  it('normalizes accents, punctuation, whitespace, casing, and only leading territory prefixes', () => {
    expect(neighborhoodMatchKey('  COL.  Niño Héroes, 2a. Sección ')).toBe(
      'nino heroes 2a seccion',
    );
    expect(neighborhoodMatchKey('EJ San José')).toBe('san jose');
    expect(neighborhoodMatchKey('Nueva Colonia Centro')).toBe('nueva colonia centro');
  });

  it('exports the OCR cleaner without changing the catalog normalization semantics', () => {
    expect(cleanOcrTerritory(' COL.  Niño Héroes ')).toBe(
      neighborhoodMatchKey(' COL.  Niño Héroes '),
    );
  });
});

describe('rankNeighborhoodMatches', () => {
  it('preselects only a clear high-confidence match', () => {
    const result = rankNeighborhoodMatches([
      {
        id: 'a',
        name: 'Centro',
        matchKey: 'centro',
        sectionId: 'section-1',
        municipality: 'Tuxtla Gutiérrez',
        score: 0.94,
      },
      {
        id: 'b',
        name: 'Centro Norte',
        matchKey: 'centro norte',
        sectionId: null,
        municipality: 'Tuxtla Gutiérrez',
        score: 0.71,
      },
    ]);
    expect(result.matchPrincipal?.id).toBe('a');
    expect(result.bestMatch).toMatchObject({ id: 'a', sectionId: 'section-1' });
    expect(result.requiresManualDecision).toBe(false);
  });

  it('requires a decision for ambiguous or weak candidates', () => {
    const result = rankNeighborhoodMatches([
      {
        id: 'a',
        name: 'San Jose',
        matchKey: 'san jose',
        sectionId: 'section-1',
        municipality: 'Tuxtla Gutiérrez',
        score: 0.82,
      },
      {
        id: 'b',
        name: 'San Jose Norte',
        matchKey: 'san jose norte',
        sectionId: 'section-1',
        municipality: 'Tuxtla Gutiérrez',
        score: 0.78,
      },
    ]);
    expect(result.matchPrincipal).toBeUndefined();
    expect(result.bestMatch).toBeUndefined();
    expect(result.requiresManualDecision).toBe(true);
  });
});

describe('rankNeighborhoodMatches multi-municipio disambiguation', () => {
  // Same neighborhood name across different municipalities (e.g. "Centro" in
  // Cintalapa de Figueroa vs Ocozocoautla de Espinosa). The trigram WHERE
  // narrowing by municipality produces these row shapes; the ranking must still
  // pick a clear winner or flag ambiguity per its existing confidence rules.

  it('selects the higher-scoring match when two same-name neighborhoods exist in different municipalities', () => {
    const result = rankNeighborhoodMatches([
      {
        id: 'cintalapa',
        name: 'Centro',
        matchKey: 'centro',
        sectionId: null,
        municipality: 'Cintalapa de Figueroa',
        score: 0.95,
      },
      {
        id: 'ocozocoautla',
        name: 'Centro',
        matchKey: 'centro',
        sectionId: null,
        municipality: 'Ocozocoautla de Espinosa',
        score: 0.72,
      },
    ]);
    expect(result.bestMatch?.id).toBe('cintalapa');
    expect(result.bestMatch?.municipality).toBe('Cintalapa de Figueroa');
    expect(result.requiresManualDecision).toBe(false);
  });

  it('requires manual decision when two same-name neighborhoods score nearly identically across municipalities', () => {
    const result = rankNeighborhoodMatches([
      {
        id: 'cintalapa',
        name: 'Centro',
        matchKey: 'centro',
        sectionId: null,
        municipality: 'Cintalapa de Figueroa',
        score: 0.9,
      },
      {
        id: 'ocozocoautla',
        name: 'Centro',
        matchKey: 'centro',
        sectionId: null,
        municipality: 'Ocozocoautla de Espinosa',
        score: 0.88,
      },
    ]);
    expect(result.bestMatch).toBeUndefined();
    expect(result.requiresManualDecision).toBe(true);
    // El municipio viaja en las alternativas: es lo que permite al usuario elegir.
    expect(result.alternatives.map((row) => row.municipality)).toEqual([
      'Cintalapa de Figueroa',
      'Ocozocoautla de Espinosa',
    ]);
  });

  it('disambiguates San Marcos across Cintalapa and Jiquipilas after geo narrowing', () => {
    // Simulates the rows the DB would return after progressive relaxation
    // narrows by municipality='CINTALAPA'. The Jiquipilas entry is filtered
    // out by the ILIKE, leaving only Cintalapa candidates.
    const result = rankNeighborhoodMatches([
      {
        id: 'san-marcos-cintalapa-30400',
        name: 'Colonia San Marcos',
        matchKey: 'san marcos',
        sectionId: null,
        municipality: 'Cintalapa de Figueroa',
        score: 1.0,
      },
    ]);
    expect(result.bestMatch?.id).toBe('san-marcos-cintalapa-30400');
    expect(result.bestMatch?.municipality).toBe('Cintalapa de Figueroa');
    expect(result.requiresManualDecision).toBe(false);
  });

  it('requires manual decision when San Marcos appears in multiple municipalities without geo narrowing', () => {
    // Simulates no geo data: trigram returns all San Marcos entries with
    // identical name similarity. The 0.08 margin rule → manual decision.
    const result = rankNeighborhoodMatches([
      {
        id: 'san-marcos-cintalapa',
        name: 'Colonia San Marcos',
        matchKey: 'san marcos',
        sectionId: null,
        municipality: 'Cintalapa de Figueroa',
        score: 1.0,
      },
      {
        id: 'san-marcos-jiquipilas',
        name: 'Barrio San Marcos',
        matchKey: 'san marcos',
        sectionId: null,
        municipality: 'Jiquipilas',
        score: 1.0,
      },
    ]);
    expect(result.bestMatch).toBeUndefined();
    expect(result.requiresManualDecision).toBe(true);
    expect(result.alternatives).toHaveLength(2);
  });

  it('disambiguates San Marcos by geo bonus when name scores are identical', () => {
    // Simulates geo-boosted scoring: both entries have name_similarity = 1.0,
    // but the Cintalapa entry gets +0.08 (municipality ILIKE match) + 0.05
    // (postal_code exact match) = 1.13, while Jiquipilas gets ~0.005
    // (low trigram similarity on municipality) + 0 (CP mismatch) = 1.005.
    // Margin 0.125 > 0.08 → high-confidence auto-select.
    const result = rankNeighborhoodMatches([
      {
        id: 'san-marcos-cintalapa-30400',
        name: 'Colonia San Marcos',
        matchKey: 'san marcos',
        sectionId: null,
        municipality: 'Cintalapa de Figueroa',
        score: 1.13,
      },
      {
        id: 'san-marcos-jiquipilas',
        name: 'Barrio San Marcos',
        matchKey: 'san marcos',
        sectionId: null,
        municipality: 'Jiquipilas',
        score: 1.005,
      },
    ]);
    expect(result.bestMatch?.id).toBe('san-marcos-cintalapa-30400');
    expect(result.bestMatch?.municipality).toBe('Cintalapa de Figueroa');
    expect(result.requiresManualDecision).toBe(false);
  });

  it('does not penalize name match when geo fields are absent', () => {
    // No geo data → score is pure name similarity. A perfect match (1.0)
    // is still high-confidence. Geo bonus is additive, never subtractive.
    const result = rankNeighborhoodMatches([
      {
        id: 'solo-entry',
        name: 'San Marcos',
        matchKey: 'san marcos',
        sectionId: null,
        municipality: null,
        score: 1.0,
      },
    ]);
    expect(result.bestMatch?.id).toBe('solo-entry');
    expect(result.requiresManualDecision).toBe(false);
  });
});
