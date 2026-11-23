const LEADING_TERRITORY_PREFIX =
  /^(?:barrio|barr\.?|colonia|col\.?|fraccionamiento|fracc\.?|fr\.?|ejido|ej\.?)(?:\s+|$)/i;

export function cleanOcrTerritory(rawText: string): string {
  return rawText
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(LEADING_TERRITORY_PREFIX, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// Keep the original catalog-facing name stable for existing callers.
export const neighborhoodMatchKey = cleanOcrTerritory;

export function normalizeNeighborhoodName(value: string): string {
  return value.normalize('NFC').trim().replace(/\s+/g, ' ');
}
