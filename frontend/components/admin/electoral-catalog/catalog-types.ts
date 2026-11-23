import type {
  ElectoralDistrict,
  ElectoralSection,
  ElectoralState,
  SectionOperationalFields,
} from '@/lib/ine-ocr-api';

export type { SectionOperationalFields };

export type CatalogTarget =
  | { type: 'state'; item: ElectoralState }
  | { type: 'district'; item: ElectoralDistrict }
  | { type: 'section'; item: ElectoralSection };

export type CatalogEditPayload = {
  code?: string;
  name?: string | null;
  stateId?: string;
  districtId?: string;
  sectionCode?: string;
  isActive?: boolean;
} & SectionOperationalFields;

export function parseOptionalNonNegInt(raw: string): number | null | 'invalid' {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const value = Number(trimmed);
  if (!Number.isInteger(value) || value < 0) return 'invalid';
  return value;
}

export function formatSectionMetric(value: number | null | undefined): string {
  return value == null ? '—' : String(value);
}

export function parseSectionOperationalFields(fields: {
  pollingStationCount: string;
  votesPerStation: string;
  nominalList: string;
  votesRequired: string;
}): SectionOperationalFields | 'invalid' {
  const pollingStationCount = parseOptionalNonNegInt(fields.pollingStationCount);
  const votesPerStation = parseOptionalNonNegInt(fields.votesPerStation);
  const nominalList = parseOptionalNonNegInt(fields.nominalList);
  const votesRequired = parseOptionalNonNegInt(fields.votesRequired);
  if (
    pollingStationCount === 'invalid' ||
    votesPerStation === 'invalid' ||
    nominalList === 'invalid' ||
    votesRequired === 'invalid'
  ) {
    return 'invalid';
  }
  return { pollingStationCount, votesPerStation, nominalList, votesRequired };
}

export const catalogTargetLabel = (target: CatalogTarget): string => {
  switch (target.type) {
    case 'state':
      return `${target.item.code} · ${target.item.name}`;
    case 'district':
      return `Distrito ${target.item.code}${target.item.name ? ` · ${target.item.name}` : ''}`;
    case 'section':
      return `Sección ${target.item.sectionCode}`;
  }
};
