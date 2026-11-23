import type { BoundingBox, OcrLine, OcrPage, OcrToken, OcrTextLayout } from './ocr.provider';

export const INE_REQUIRED_FIELDS = [
  'firstName',
  'paternalLastName',
  'maternalLastName',
  'address',
  'neighborhood',
  'postalCode',
  'municipality',
  'state',
  'locality',
  'voterKey',
  'curp',
  'birthDate',
  'electoralSection',
  'validUntil',
  'registrationYear',
  'sex',
] as const;

export type IneFieldName = (typeof INE_REQUIRED_FIELDS)[number];

/**
 * Flat string-only projection, identical to the shape consumed today by
 * `IneOcrService`, the review UI and `sectionCandidates`. Produced by
 * `flattenIneFields` from the richer {@link IneParsedFields}.
 */
export type IneNormalizedFields = Partial<Record<IneFieldName, string>>;

/** A field's OCR lifecycle: raw (untouched), normalized, and provenance. */
export type IneRawValue = {
  /** Exact OCR text for this field, before any normalization. Never mutated. */
  raw: string;
  /** Normalized value (whitespace, case, kind-specific cleanup). Derived from `raw`. */
  normalized: string;
  /** Length-weighted token confidence, or a line-confidence fallback when available. */
  confidence?: number;
  /** Page index where the field was located (0-based), when available. */
  pageIndex?: number;
  /** Spatial bounding box of the value tokens, when available. */
  box?: BoundingBox;
  /** Internal extraction strategy. Persisted only in the encrypted parsed result. */
  source: 'anchor-inline' | 'anchor-below' | 'pattern-fallback' | 'derived';
  /** Semantic region used to make the extraction. */
  section: 'identity' | 'address' | 'electoral';
  /** Validation outcome for this observation; it never suppresses another field. */
  validation: { state: 'valid' | 'warning' | 'invalid' | 'unverified'; codes: string[] };
  /** Confidence provenance and any applied limitations. */
  confidenceReasons: string[];
};

export type IneParsedFields = Partial<Record<IneFieldName, IneRawValue>> & {
  /** The full name as a single string, kept even when the split is uncertain. */
  fullName?: IneRawValue;
  /** Details without a public flat-field counterpart, retained only encrypted. */
  details?: Partial<
    Record<
      'street' | 'exteriorNumber' | 'municipalityCode' | 'stateCode' | 'emissionYear',
      IneRawValue
    >
  >;
  /** MRZ is corroborative evidence only and never replaces visual extraction. */
  mrz?: { detected: boolean; nameTruncated: boolean; curpMatches?: boolean; codes: string[] };
};

export type IneValidationSummary = {
  missing: string[];
  warnings: string[];
  crossFieldIssues: string[];
};

export type ParsedIneDocument = {
  fields: IneParsedFields;
  source: OcrTextLayout;
  validationSummary: IneValidationSummary;
};

/** Project the rich parsed fields into the flat string-only shape used today. */
export function flattenIneFields(fields: IneParsedFields): IneNormalizedFields {
  const out: IneNormalizedFields = {};
  for (const key of INE_REQUIRED_FIELDS) {
    const v = fields[key];
    if (v?.normalized) out[key] = v.normalized;
  }
  return out;
}

// ── Normalization helpers ───────────────────────────────────────────────────

export type FieldKind = 'text' | 'name' | 'code' | 'number' | 'date';

/** Strip combining diacritics for comparison only; never mutate stored values. */
function accentFold(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** Collapse whitespace and uppercase; kept light, never deletes letters. */
function cleanText(value: string | undefined): string {
  const normalized = (value ?? '').replace(/\s+/g, ' ').trim().toUpperCase();
  return normalized;
}

/** Per-kind normalization applied AFTER `cleanText`. */
export function normalizeByKind(value: string, kind: FieldKind): string {
  const base = cleanText(value);
  if (!base) return '';
  if (kind === 'number') return base.replace(/[^\d]/g, '');
  if (kind === 'code') return base.replace(/\s+/g, '');
  if (kind === 'name' || kind === 'text') return base;
  return base; // date keeps punctuation; validated separately
}

// ── Label catalog ────────────────────────────────────────────────────────────

/**
 * Known INE labels and how they map to our fields. Multiple aliases handle
 * OCR/variant tolerance. Labels are matched accent-insensitively.
 */
type LabelDef = {
  fields: IneFieldName[];
  aliases: string[];
  kind: FieldKind;
  /** When true, the value is expected on lines BELOW the label (single-label line). */
  valueBelow?: boolean;
};

const LABEL_DEFS: LabelDef[] = [
  {
    fields: ['firstName' as IneFieldName],
    aliases: ['NOMBRE', 'NOMBRES'],
    kind: 'name',
    valueBelow: true,
  },
  {
    fields: ['address'],
    aliases: ['DOMICILIO', 'DIRECCION', 'DIRECCIÓN'],
    kind: 'text',
    valueBelow: true,
  },
  { fields: ['neighborhood'], aliases: ['COLONIA', 'COL'], kind: 'text' },
  { fields: ['municipality'], aliases: ['MUNICIPIO', 'MUN', 'MUNICIPIH'], kind: 'text' },
  { fields: ['state'], aliases: ['ENTIDAD', 'ESTADO'], kind: 'text' },
  { fields: ['locality'], aliases: ['LOCALIDAD', 'LOC'], kind: 'text' },
  {
    fields: ['voterKey'],
    aliases: ['CLAVE DE ELECTOR', 'CLAVE DE ELECTOR.', 'CLAVE ELECTORAL'],
    kind: 'code',
  },
  { fields: ['curp'], aliases: ['CURP', 'NCURP'], kind: 'code' },
  {
    fields: ['birthDate'],
    aliases: ['FECHA DE NACIMIENTO', 'NACIMIENTO', 'FECHA NAC.'],
    kind: 'date',
  },
  { fields: ['electoralSection'], aliases: ['SECCION', 'SECCIÓN', 'SEC', 'SEC.'], kind: 'number' },
  { fields: ['validUntil'], aliases: ['VIGENCIA', 'VIGENCIA HASTA'], kind: 'text' },
  {
    fields: ['registrationYear'],
    aliases: ['REGISTRO', 'AÑO DE REGISTRO', 'ANO DE REGISTRO', 'ANO'],
    kind: 'number',
  },
  { fields: ['sex'], aliases: ['SEXO'], kind: 'text' },
];

/** Labels that can legitimately share a line with another label's value.
 * Kept as documentation; the assigner does not gate on this set because any
 * inline label whose X starts after the current label's value is naturally
 * separated by the X-split rule. */
// (const INLINE_LABELS removed — informational only)

// ── Locator ──────────────────────────────────────────────────────────────────

type LocatedLabel = {
  field: IneFieldName;
  kind: FieldKind;
  valueBelow: boolean;
  line: OcrLine;
  lineIndex: number;
  pageIndex: number;
  /** Token that matched the label (when tokens are available). */
  labelToken?: OcrToken;
  /** Index in line.tokens of the first token of the matched alias. */
  labelTokenStart?: number;
  /** Number of tokens consumed by the matched alias (>=1 for multi-token). */
  labelTokenCount?: number;
};

function tokensMatchLabel(
  tokens: OcrToken[],
  alias: string,
): { score: number; culprit: OcrToken | undefined; start: number; count: number } {
  const aliasNorm = accentFold(alias).toUpperCase().replace(/\s+/g, ' ').trim();
  const aliasCompact = aliasNorm.replace(/[.\s:]/g, '');
  const aliasWordCount = aliasNorm.split(' ').filter(Boolean).length;

  // Whole-line match (for multi-token aliases like "CLAVE DE ELECTOR")
  const lineJoined = tokens
    .map((t) => t.text)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  const lineJoinedNorm = accentFold(lineJoined).toUpperCase();
  if (lineJoinedNorm === aliasNorm)
    return { score: 1, culprit: tokens[0], start: 0, count: tokens.length };
  if (lineJoinedNorm.startsWith(aliasNorm + ' ') || lineJoinedNorm.startsWith(aliasNorm + ':'))
    return { score: 0.9, culprit: tokens[0], start: 0, count: aliasWordCount };

  // Multi-token alias where the alias spans the FIRST N tokens.
  if (aliasWordCount >= 2 && tokens.length >= aliasWordCount) {
    const head = tokens
      .slice(0, aliasWordCount)
      .map((t) => t.text)
      .join(' ');
    const headCompact = accentFold(head)
      .toUpperCase()
      .replace(/[.\s:]/g, '');
    if (headCompact === aliasCompact)
      return { score: 1, culprit: tokens[0], start: 0, count: aliasWordCount };
  }

  // Single-token alias match (handle "SEC." vs "SEC", punctuation tolerance)
  for (let i = 0; i < tokens.length; i += 1) {
    const tokNorm = accentFold(tokens[i].text)
      .toUpperCase()
      .replace(/[.\s:]/g, '')
      .trim();
    if (tokNorm === aliasCompact) return { score: 1, culprit: tokens[i], start: i, count: 1 };
  }
  return { score: 0, culprit: undefined, start: -1, count: 0 };
}

function locateLabels(pages: OcrPage[]): LocatedLabel[] {
  const found: LocatedLabel[] = [];
  for (let pi = 0; pi < pages.length; pi += 1) {
    const page = pages[pi];
    for (let li = 0; li < page.lines.length; li += 1) {
      const line = page.lines[li];
      const tokens = line.tokens;
      for (const def of LABEL_DEFS) {
        for (const alias of def.aliases) {
          if (!tokens.length) continue;
          const { score, culprit, start, count } = tokensMatchLabel(tokens, alias);
          if (score > 0) {
            for (const field of def.fields) {
              found.push({
                field,
                kind: def.kind,
                valueBelow: !!def.valueBelow,
                line,
                lineIndex: li,
                pageIndex: pi,
                labelToken: culprit,
                labelTokenStart: start,
                labelTokenCount: count,
              });
            }
            break; // this def matched via one alias; don't double-match other aliases
          }
        }
      }
    }
  }
  return found;
}

// ── Layout preparation ────────────────────────────────────────────────────────

/**
 * Normalize absolute Document AI boxes only when their page dimensions are
 * available. A page with unscaled absolute boxes is deliberately treated as
 * text-anchored: comparing unrelated coordinate systems is less safe than
 * bounded adjacent-line extraction.
 */
function normalizeSpatialLayout(document: OcrTextLayout): OcrTextLayout {
  const normalizeBox = (
    box: BoundingBox | undefined,
    width?: number,
    height?: number,
  ): BoundingBox | undefined => {
    if (!box) return undefined;
    const absolute = [box.min.x, box.min.y, box.max.x, box.max.y].some(
      (value) => Math.abs(value) > 1,
    );
    if (!absolute) return box;
    if (!width || !height) return undefined;
    return {
      min: { x: box.min.x / width, y: box.min.y / height },
      max: { x: box.max.x / width, y: box.max.y / height },
    };
  };
  return {
    ...document,
    pages: document.pages.map((page) => ({
      ...page,
      lines: page.lines.map((line) => ({
        ...line,
        box: normalizeBox(line.box, page.width, page.height),
        tokens: line.tokens.map((token) => ({
          ...token,
          box: normalizeBox(token.box, page.width, page.height),
        })),
      })),
      tokens: page.tokens.map((token) => ({
        ...token,
        box: normalizeBox(token.box, page.width, page.height),
      })),
    })),
  };
}

// ── Assigner (geometry) ──────────────────────────────────────────────────────

/** Get a token's left X (min), with fallback to its line box. */
function tokenLeftX(token: OcrToken, fallback?: BoundingBox): number {
  return token.box?.min.x ?? fallback?.min.x ?? 0;
}
function tokenRightX(token: OcrToken, fallback?: BoundingBox): number {
  return token.box?.max.x ?? fallback?.max.x ?? 0;
}

/** Build an IneRawValue from a set of tokens, reconstructing spacing from
 * the original document text via token segments so words keep their separators. */
function valueFromTokens(
  kind: FieldKind,
  tokens: OcrToken[],
  pageIndex: number | undefined,
  documentText: string,
  source: IneRawValue['source'],
  section: IneRawValue['section'],
  lineConfidences: Array<number | undefined> = [],
): IneRawValue | undefined {
  if (!tokens.length) return undefined;
  // Reconstruct raw text using token segments (inter-token gaps become spaces).
  const parts: string[] = [];
  let lastEnd: number | undefined;
  for (const tok of tokens) {
    const segments = tok.segments ?? (tok.segment ? [tok.segment] : []);
    if (segments.length) {
      for (const segment of segments) {
        if (lastEnd !== undefined && segment.start > lastEnd) {
          // gap between segments → insert a single space (covers whitespace/newlines)
          parts.push(' ');
        }
        parts.push(documentText.slice(segment.start, segment.end));
        lastEnd = segment.end;
      }
    } else {
      if (parts.length) parts.push(' ');
      parts.push(tok.text);
    }
  }
  let raw = parts.join('').replace(/\s+/g, ' ').trim();
  if (!raw) {
    // Fall back to token text if segments were missing.
    raw = tokens
      .map((t) => t.text)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  const normalized = normalizeByKind(raw, kind);
  const weightedConfs = tokens
    .filter((t): t is OcrToken & { confidence: number } => typeof t.confidence === 'number')
    .map((t) => ({
      confidence: t.confidence,
      weight: Math.max(1, t.text.replace(/\s/g, '').length),
    }));
  const boxes = tokens.map((t) => t.box).filter((b): b is BoundingBox => !!b);
  const lineConfs = lineConfidences.filter((c): c is number => typeof c === 'number');
  const confidence = weightedConfs.length
    ? weightedConfs.reduce((sum, item) => sum + item.confidence * item.weight, 0) /
      weightedConfs.reduce((sum, item) => sum + item.weight, 0)
    : lineConfs.length
      ? lineConfs.reduce((sum, item) => sum + item, 0) / lineConfs.length
      : undefined;
  let boxBounds: BoundingBox | undefined;
  if (boxes.length) {
    boxBounds = {
      min: { x: Math.min(...boxes.map((b) => b.min.x)), y: Math.min(...boxes.map((b) => b.min.y)) },
      max: { x: Math.max(...boxes.map((b) => b.max.x)), y: Math.max(...boxes.map((b) => b.max.y)) },
    };
  }
  return {
    raw,
    normalized,
    confidence,
    pageIndex,
    box: boxBounds,
    source,
    section,
    validation: { state: 'unverified', codes: [] },
    confidenceReasons: weightedConfs.length
      ? ['TOKEN_LENGTH_WEIGHTED']
      : lineConfs.length
        ? ['LINE_CONFIDENCE_FALLBACK']
        : ['CONFIDENCE_UNAVAILABLE'],
  };
}

function sectionFor(field: IneFieldName): IneRawValue['section'] {
  if (
    ['address', 'neighborhood', 'postalCode', 'municipality', 'state', 'locality'].includes(field)
  )
    return 'address';
  if (['voterKey', 'curp', 'birthDate', 'sex'].includes(field)) return 'identity';
  return 'electoral';
}

/**
 * Assign tokens to labels using bounding-box geometry.
 *
 * Two regimes:
 *  - INLINE (same visual line as the label): take tokens with x >= label end,
 *    stopping before the next known label on that line.
 *  - BELOW (label on its own line): take tokens from subsequent lines of the
 *    same page whose X overlaps the label's column, until the next label line
 *    or a large Y gap.
 */
function assignValues(
  pages: OcrPage[],
  located: LocatedLabel[],
  documentText: string,
): IneParsedFields {
  const fields: IneParsedFields = {};
  // Keep only the first label per field (highest-scored one already wins via order).
  const already = new Set<IneFieldName>();
  // Group located labels by page+lineIndex to detect co-located inline labels.
  const inlineGroups = new Map<string, LocatedLabel[]>();
  for (const l of located) {
    if (l.valueBelow) continue; // only inline labels can share a line
    const key = `${l.pageIndex}:${l.lineIndex}`;
    const arr = inlineGroups.get(key) ?? [];
    arr.push(l);
    inlineGroups.set(key, arr);
  }

  for (const label of located) {
    if (already.has(label.field)) continue;
    const page = pages[label.pageIndex];
    if (!page) continue;
    const line = label.line;
    const allTokens = line.tokens;

    if (!label.valueBelow) {
      // INLINE: tokens on the same line with x >= label end x.
      const labelStart = label.labelTokenStart ?? 0;
      const labelCount = Math.max(1, label.labelTokenCount ?? 1);
      const labelEndTokenIdx = labelStart + labelCount - 1;
      const labelEndToken = allTokens[labelEndTokenIdx];
      const labelEndX = labelEndToken
        ? tokenRightX(labelEndToken, line.box)
        : (line.box?.min.x ?? 0);
      const hasGeometry = !!(labelEndToken?.box ?? line.box);
      if (!hasGeometry) {
        const nextLabelStart = (inlineGroups.get(`${label.pageIndex}:${label.lineIndex}`) ?? [])
          .filter(
            (other) =>
              other.field !== label.field && (other.labelTokenStart ?? Infinity) > labelEndTokenIdx,
          )
          .map((other) => other.labelTokenStart ?? Infinity);
        // Hard stop at the first stop/label token to the right of this label,
        // so LOCALIDAD does not absorb EMISION's value when both are inline.
        let stopBefore = allTokens.length;
        for (let ti = labelEndTokenIdx + 1; ti < allTokens.length; ti += 1) {
          if (isLabelToken(allTokens[ti]) || isStopToken(allTokens[ti])) {
            stopBefore = ti;
            break;
          }
        }
        const end = Math.min(
          stopBefore,
          nextLabelStart.length ? Math.min(...nextLabelStart) : allTokens.length,
        );
        const v = valueFromTokens(
          label.kind,
          allTokens
            .slice(labelEndTokenIdx + 1, end)
            .filter((token) => !isLabelToken(token) && !isStopToken(token)),
          label.pageIndex,
          documentText,
          'anchor-inline',
          sectionFor(label.field),
          [line.confidence],
        );
        if (v) {
          fields[label.field] = v;
          already.add(label.field);
        }
        continue;
      }
      // Find the next inline label on this same line that is to the RIGHT of this
      // label, to bound the capture. Labels to the LEFT don't bound this capture.
      const sameLineLabelsRight = (inlineGroups.get(`${label.pageIndex}:${label.lineIndex}`) ?? [])
        .filter((l) => l.field !== label.field)
        .map((l) => {
          const s = l.labelTokenStart ?? 0;
          return l.line.tokens[s] ? tokenLeftX(l.line.tokens[s], l.line.box) : Infinity;
        })
        .filter((x) => x >= labelEndX - 1e-4);
      const nextLabelStartX = sameLineLabelsRight.length
        ? Math.min(...sameLineLabelsRight)
        : Infinity;
      // Also collect the token indices that form the label itself (to skip them).
      const labelTokenIdxs = new Set<number>();
      for (let k = 0; k < labelCount; k += 1) labelTokenIdxs.add(labelStart + k);
      // Stop at the first label/stop token to the RIGHT of this label so an
      // inline label's value never includes another anchor's value.
      let stopBeforeIndex = allTokens.length;
      for (let ti = labelEndTokenIdx + 1; ti < allTokens.length; ti += 1) {
        if (isLabelToken(allTokens[ti]) || isStopToken(allTokens[ti])) {
          stopBeforeIndex = ti;
          break;
        }
      }
      const valueTokens: OcrToken[] = [];
      for (let ti = 0; ti < allTokens.length; ti += 1) {
        if (ti >= stopBeforeIndex) break;
        if (labelTokenIdxs.has(ti)) continue;
        const tok = allTokens[ti];
        if (isLabelToken(tok) || isStopToken(tok)) continue;
        const tokX = tokenLeftX(tok, line.box);
        if (tokX + 1e-4 < labelEndX) continue; // left of the label
        if (tokX >= nextLabelStartX) continue; // belongs to the next inline label
        valueTokens.push(tok);
      }
      const v = valueFromTokens(
        label.kind,
        valueTokens,
        label.pageIndex,
        documentText,
        'anchor-inline',
        sectionFor(label.field),
        [line.confidence],
      );
      if (v) {
        fields[label.field] = v;
        already.add(label.field);
      }
      continue;
    }

    // BELOW: value is on subsequent lines under the label, within the label's X column.
    const labelBox = label.labelToken?.box ?? line.box;
    const labelLeftX = labelBox?.min.x ?? 0;
    const labelBottomY = labelBox?.max.y ?? 0;
    const captureMaxLines = 6; // INE name (paternal/maternal/names) & address rarely exceed 6 lines
    const stopLabels = new Set<IneFieldName>();
    for (const other of located) {
      if (other.pageIndex !== label.pageIndex) continue;
      if (other.lineIndex <= label.lineIndex) continue;
      stopLabels.add(other.field);
    }
    const valueTokens: OcrToken[] = [];
    const capturedLineConfidences: Array<number | undefined> = [];
    let lastY = labelBottomY;
    let capturedLines = 0;
    for (
      let li2 = label.lineIndex + 1;
      li2 < page.lines.length && capturedLines < captureMaxLines;
      li2 += 1
    ) {
      const nextLine = page.lines[li2];
      // If this line introduces a new known label, stop.
      const hasLabel = lineHasLabel(nextLine);
      if (hasLabel) break;
      const nextTopY = nextLine.box?.min.y ?? 0;
      const nextLeftX = nextLine.box?.min.x ?? 0;
      // Must be visually below the label.
      if (nextTopY + 1e-4 < labelBottomY) continue;
      // X-tolerance: only skip (don't break) if the entire line starts far to the
      // LEFT of the label column. Tokens are filtered individually below, so a
      // line that overlaps the column partially still contributes its in-column
      // tokens. Use a generous tolerance: INE value columns can start slightly
      // left of the label.
      const tol = 0.1; // 10% of page width
      if (labelBox && nextLeftX + tol < labelLeftX) continue;
      // Stop on big vertical gaps (more than 5% page height).
      if (lastY && nextTopY - lastY > 0.05) break;
      lastY = nextLine.box?.max.y ?? nextTopY;
      capturedLines += 1;
      capturedLineConfidences.push(nextLine.confidence);
      // Take tokens, skipping label tokens and tokens far left of the label column.
      for (const tok of nextLine.tokens) {
        if (isLabelToken(tok)) continue;
        const tx = tokenLeftX(tok, nextLine.box);
        if (labelBox && tx + tol < labelLeftX) continue;
        valueTokens.push(tok);
      }
      if (valueTokens.length && stopLabels.size && stopLabelReached(nextLine, stopLabels)) break;
    }
    const v = valueFromTokens(
      label.kind,
      valueTokens,
      label.pageIndex,
      documentText,
      'anchor-below',
      sectionFor(label.field),
      capturedLineConfidences,
    );
    if (v) {
      fields[label.field] = v;
      already.add(label.field);
      // NOMBRE (label-alone-below) keeps the full block as `fullName`; the
      // paternal/maternal/firstName split is done later by `extractNameBlock`
      // using the line structure, NOT a token-count heuristic.
      if (label.field === 'firstName') {
        fields.fullName = { ...v, section: 'identity' };
      }
    }
  }
  return fields;
}

function isLabelToken(token: OcrToken): boolean {
  const normTok = accentFold(token.text)
    .toUpperCase()
    .replace(/[.\s:]/g, '')
    .trim();
  return LABEL_DEFS.some((def) =>
    def.aliases.some(
      (alias) =>
        accentFold(alias)
          .toUpperCase()
          .replace(/[.\s:]/g, '')
          .trim() === normTok,
    ),
  );
}

/** Compact (accent/punctuation/space-stripped) upper form of a token or alias. */
function compactForm(value: string): string {
  return accentFold(value)
    .toUpperCase()
    .replace(/[.\s:]/g, '')
    .trim();
}

// Known electoral anchors that bound inline captures but may not own a public
// field (e.g. EMISIÓN sits between LOCALIDAD and VIGENCIA on a single visual
// line). Treat them as hard stops so a left-hand label does not absorb their
// value. Accent-folded, so 'EMISIÓN' and 'EMISION' both match.
const STOP_TOKEN_FORMS = new Set<string>(['EMISION']);

function isStopToken(token: OcrToken): boolean {
  return STOP_TOKEN_FORMS.has(compactForm(token.text));
}

function lineHasLabel(line: OcrLine): boolean {
  if (line.tokens.length) {
    if (line.tokens.some(isLabelToken)) return true;
    // Multi-token aliases (CLAVE DE ELECTOR, FECHA DE NACIMIENTO, AÑO DE
    // REGISTRO, VIGENCIA HASTA) are not detectable token-by-token; match the
    // joined compact line against the long alias compact forms.
    const lineCompact = compactForm(line.tokens.map((t) => t.text).join(' '));
    if (lineCompact) {
      for (const def of LABEL_DEFS) {
        for (const alias of def.aliases) {
          const ac = compactForm(alias);
          if (ac.length >= 8 && (lineCompact === ac || lineCompact.startsWith(ac))) return true;
        }
      }
    }
  }
  return false;
}

function stopLabelReached(line: OcrLine, stopLabels: Set<IneFieldName>): boolean {
  for (const tok of line.tokens) {
    const normTok = accentFold(tok.text)
      .toUpperCase()
      .replace(/[.\s:]/g, '')
      .trim();
    for (const def of LABEL_DEFS) {
      if (
        !def.aliases.some(
          (a) =>
            accentFold(a)
              .toUpperCase()
              .replace(/[.\s:]/g, '')
              .trim() === normTok,
        )
      )
        continue;
      if (def.fields.some((f) => stopLabels.has(f))) return true;
    }
  }
  return false;
}

// ── Name splitting (with CURP cross-check) ───────────────────────────────────

/** Mexican surname particles that must attach to the following token. */
const PARTICLES = new Set(['DE', 'DEL', 'DE LA', 'DE LAS', 'DE LOS', 'LOS', 'LAS', 'LA', 'Y']);

type SplitResult = Partial<
  Record<'firstName' | 'paternalLastName' | 'maternalLastName', { raw: string; normalized: string }>
>;

/**
 * Split a full name into the canonical Mexican order `nombres paterno materno`.
 *
 * NOT a blind "last 2 = surnames" rule: particles attach to the following token
 * so compound surnames (`DE LA CRUZ`, `DE LOS RIOS`) are preserved. When the
 * split is ambiguous (2 tokens, no materno), we return firstName + paternal and
 * leave maternal undefined — we never invent a value. The full name is ALWAYS
 * preserved separately as `fullName`.
 *
 * If `curp` is provided, its first 4 chars (`P M N ...`) are used to sanity-check
 * the split; on mismatch the split is NOT rewritten (the raw stays), but a
 * downstream validator records a crossFieldIssue.
 */
export function splitName(full: string, curp?: string): SplitResult {
  const tokens = full.split(' ').filter(Boolean);
  if (tokens.length === 0) return {};
  if (tokens.length === 1) return { firstName: { raw: tokens[0], normalized: tokens[0] } };
  if (tokens.length === 2) {
    return {
      firstName: { raw: tokens[0], normalized: tokens[0] },
      paternalLastName: { raw: tokens[1], normalized: tokens[1] },
    };
  }
  // 3+ tokens: last token (or compound) = maternal, before it = paternal, rest = names.
  // Greedily attach particles from the end to build compound surnames.
  const maternal = takeCompoundFromEnd(tokens);
  const remaining = tokens.slice(0, tokens.length - maternal.consumed);
  const paternal = takeCompoundFromEnd(remaining);
  const firstTokens = remaining.slice(0, remaining.length - paternal.consumed);
  if (!firstTokens.length) {
    // Degenerate: everything went to surnames; put it all back into firstName.
    return { firstName: { raw: full, normalized: full } };
  }
  const firstName = firstTokens.join(' ');
  const paternalName = paternal.text;
  const maternalName = maternal.text;
  // CURP cross-check (best-effort): first 4 chars = initial paternal, initial maternal, first of firstName...
  // CURP format: P M N N YY MM DD ... ; we only warn, never overwrite.
  void curp; // noted; the validator uses this, not the splitter, to avoid hidden state.
  return {
    firstName: { raw: firstName, normalized: firstName },
    paternalLastName: { raw: paternalName, normalized: paternalName },
    maternalLastName: { raw: maternalName, normalized: maternalName },
  };
}

/** Attach trailing particles to the last token to form a compound surname. */
function takeCompoundFromEnd(tokens: string[]): { text: string; consumed: number } {
  if (!tokens.length) return { text: '', consumed: 0 };
  let end = tokens.length;
  // While the token BEFORE the last consumed one is a particle, include it.
  while (end - 2 >= 0 && PARTICLES.has(tokens[end - 2])) {
    end -= 1;
  }
  return {
    text: tokens.slice(end - 1, tokens.length).join(' '),
    consumed: tokens.length - end + 1,
  };
}

// ── Regex-based fallbacks (for fields with structural patterns) ──────────────

/**
 * Some fields are pure patterns (CURP, voterKey, electoralSection sometimes).
 * We use them as a FALLBACK when the spatial assignment didn't produce a value,
 * and as a CROSS-CHECK when it did. This is NOT the primary extraction path.
 */
function regexFallbacks(text: string, fields: IneParsedFields): void {
  if (!fields.voterKey) {
    const m = text.match(/\b[A-Z]{6}\d{8}[A-Z]\d{3}\b/);
    if (m) {
      const normalized = normalizeByKind(m[0], 'code');
      fields.voterKey = patternValue(m[0], normalized, 'identity');
    }
  }
  if (!fields.curp) {
    const m = text.match(/\b[A-Z]{4}\d{6}[A-Z]{6}[A-Z0-9]\d\b/);
    if (m) {
      const normalized = normalizeByKind(m[0], 'code');
      fields.curp = patternValue(m[0], normalized, 'identity');
    }
  }
  if (!fields.electoralSection) {
    const m = text.match(/\bSECC?[IÍ]ON\s*[:.-]?\s*(\d{1,6})\b/i);
    if (m?.[1]) {
      const normalized = normalizeByKind(m[1], 'number');
      fields.electoralSection = patternValue(m[1], normalized, 'electoral');
    }
  }
  if (!fields.registrationYear) {
    const m = text.match(/\bREGISTRO\s*[:.-]?\s*(\d{4})\b/i);
    if (m?.[1]) {
      const normalized = normalizeByKind(m[1], 'number');
      fields.registrationYear = patternValue(m[1], normalized, 'electoral');
    }
  }
  if (!fields.validUntil) {
    const m = text.match(/\bVIGENCIA\s*[:.-]?\s*(\d{4})\b/i);
    if (m?.[1]) {
      const normalized = normalizeByKind(m[1], 'number');
      fields.validUntil = patternValue(m[1], normalized, 'electoral');
    }
  }
}

function patternValue(
  raw: string,
  normalized: string,
  section: IneRawValue['section'],
): IneRawValue {
  return {
    raw,
    normalized,
    source: 'pattern-fallback',
    section,
    validation: { state: 'unverified', codes: [] },
    confidenceReasons: ['PATTERN_FALLBACK_NO_CONFIDENCE'],
  };
}

function derivedValue(
  raw: string,
  kind: FieldKind,
  source: IneRawValue,
  section: IneRawValue['section'],
): IneRawValue {
  return {
    ...source,
    raw,
    normalized: normalizeByKind(raw, kind),
    source: 'derived',
    section,
    validation: { state: 'unverified', codes: [] },
    confidenceReasons: [...source.confidenceReasons, 'DERIVED_FROM_ANCHORED_VALUE'],
  };
}

// ── Semantic extractors ───────────────────────────────────────────────────────

/**
 * Locate an anchor (label) line and the structural value lines directly below
 * it on the same page, using SPATIAL proximity — NOT blind array order. Lines
 * below the anchor are SORTED BY Y (top to bottom) before returning, so the
 * caller's `lines[0]` is always the visually first line — even when Document AI
 * emits lines in block/paragraph order where a later-in-the-array line is
 * visually above an earlier one.
 *
 * Column membership is decided by X-quadrant, not a strict overlap, because some
 * INE layouts place the DOMICILIO label on the far-left margin while the
 * address lines sit in the body — they don't overlap in X but are clearly the
 * same block. We capture any line below the anchor that doesn't carry a foreign
 * label, ending the block at a label-bearing line or a vertical gap > 10%.
 */
function findAnchorBlock(
  pages: OcrPage[],
  labelAliases: string[],
):
  | { pageIndex: number; labelLine: OcrLine; labelLineIndex: number; linesBelow: OcrLine[] }
  | undefined {
  const aliasCompacts = new Set(labelAliases.map((a) => compactForm(a)));
  for (let pi = 0; pi < pages.length; pi += 1) {
    const page = pages[pi];
    for (let li = 0; li < page.lines.length; li += 1) {
      const line = page.lines[li];
      if (!line.tokens.length) continue;
      const lineCompact = compactForm(line.tokens.map((t) => t.text).join(' '));
      let matched = false;
      for (const ac of aliasCompacts) {
        if (!ac) continue;
        if (lineCompact === ac || lineCompact.startsWith(ac)) {
          matched = true;
          break;
        }
      }
      if (!matched) continue;
      const labelBottomY = line.box?.max.y ?? 0;
      // Gather all lines visually below the anchor, across the whole page,
      // that don't carry a foreign label and aren't too far below. We don't
      // break on array order; we break on (1) a line that introduces a known
      // label below the anchor (end of block), or (2) a large vertical gap.
      // Same-column preference is applied via X overlap scoring at capture
      // time so opposite-column lines are tolerated but don't poison ordering.
      const collected: OcrLine[] = [];
      for (let li2 = li + 1; li2 < page.lines.length; li2 += 1) {
        const nl = page.lines[li2];
        const nlTopY = nl.box?.min.y ?? 0;
        if (nlTopY + 1e-4 < labelBottomY) continue; // above the anchor
        // A line that introduces a known label (in any column) ends the block.
        // But allow one-time fire: when the label is the DOMICILIO block and a
        // right-column field (CLAVE DE ELECTOR) appears between DOMICILIO lines
        // interleaved by y, we DON'T let it break the block — only a LABEL whose
        // top-Y is within the address stack range matters.
        if (lineHasLabel(nl)) {
          // Only break the block on a foreign label that overlaps the anchor's
          // column. An opposite-column label (CLAVE DE ELECTOR on the right,
          // DOMICILIO on the left) does NOT end the DOMICILIO block — we keep
          // collecting interleaved lines so the caller can filter by column.
          if (isInSameColumn(line, nl)) break;
          // else: opposite-column label — skip but don't break.
          continue;
        }
        collected.push(nl);
      }
      // Sort collected lines by Y so the visually-first line is lines[0].
      collected.sort((a, b) => (a.box?.min.y ?? 0) - (b.box?.min.y ?? 0));
      // Truncate the collected list to a reasonable size and stop when
      // there's a vertical gap > 10% between consecutive sorted lines.
      const linesBelow: OcrLine[] = [];
      let lastY = labelBottomY;
      for (const nl of collected) {
        const topY = nl.box?.min.y ?? 0;
        if (lastY && topY - lastY > 0.1) break;
        linesBelow.push(nl);
        lastY = nl.box?.max.y ?? topY;
        if (linesBelow.length >= 8) break; // safety
      }
      return { pageIndex: pi, labelLine: line, labelLineIndex: li, linesBelow };
    }
  }
  return undefined;
}

/** Two lines are in the same column when their X ranges overlap by ≥ 30%. */
function isInSameColumn(a: OcrLine, b: OcrLine): boolean {
  const al = a.box?.min.x ?? 0;
  const ar = a.box?.max.x ?? 1;
  const bl = b.box?.min.x ?? 0;
  const br = b.box?.max.x ?? 1;
  const overlap = Math.min(ar, br) - Math.max(al, bl);
  if (overlap <= 0) return false;
  const minW = Math.min(ar - al, br - bl);
  return minW > 0 && overlap / minW >= 0.3;
}

/**
 * Split the NOMBRE block by VERTICAL line structure, the canonical INE order:
 *   line 1 = apellido paterno
 *   line 2 = apellido materno
 *   line 3+ = nombres (joined, never split by word count)
 *
 * Names keep their per-line confidence/box instead of inheriting the whole
 * block's confidence. For a single-line or two-line block (ambiguous order)
 * the heuristic `splitName` is still used as a fallback. CURP is corroborative
 * only: it warns on initial mismatch but never rewrites a split.
 */
function extractNameBlock(pages: OcrPage[], documentText: string, fields: IneParsedFields): void {
  const block = findAnchorBlock(pages, ['NOMBRE', 'NOMBRES']);
  if (block && block.linesBelow.length >= 3) {
    const lines = block.linesBelow;
    const build = (line: OcrLine): IneRawValue | undefined =>
      valueFromTokens(
        'name',
        line.tokens.filter((t) => !isLabelToken(t)),
        block.pageIndex,
        documentText,
        'anchor-below',
        'identity',
        [line.confidence],
      );
    const paternal = build(lines[0]);
    const maternal = build(lines[1]);
    const firstTokens = lines.slice(2).flatMap((l) => l.tokens.filter((t) => !isLabelToken(t)));
    const firstName = valueFromTokens(
      'name',
      firstTokens,
      block.pageIndex,
      documentText,
      'anchor-below',
      'identity',
      lines.slice(2).map((l) => l.confidence),
    );
    if (paternal) fields.paternalLastName = paternal;
    if (maternal) fields.maternalLastName = maternal;
    if (firstName) fields.firstName = firstName;
    const fullNameText = lines
      .map((l) => cleanText(l.text))
      .filter(Boolean)
      .join(' ');
    const base = fields.fullName ?? firstName;
    fields.fullName = base
      ? derivedValue(fullNameText, 'name', base, 'identity')
      : patternValue(fullNameText, normalizeByKind(fullNameText, 'name'), 'identity');
    return;
  }
  // Fallback (1-2 line block or inline NOMBRE): token heuristic over the
  // captured full/first name. Keeps compound-surname guarantees.
  const fullName = fields.fullName ?? fields.firstName;
  if (!fullName?.normalized) return;
  fields.fullName = { ...fullName, section: 'identity' };
  const split = splitName(fullName.normalized, fields.curp?.normalized);
  if (split.firstName)
    fields.firstName = derivedValue(split.firstName.raw, 'name', fullName, 'identity');
  if (split.paternalLastName)
    fields.paternalLastName = derivedValue(
      split.paternalLastName.raw,
      'name',
      fullName,
      'identity',
    );
  if (split.maternalLastName)
    fields.maternalLastName = derivedValue(
      split.maternalLastName.raw,
      'name',
      fullName,
      'identity',
    );
}

/**
 * Birth-date extraction using SPATIAL SCORING (not just "first date after
 * anchor in array order"). Document AI returns lines in a block/paragraph order
 * that may intermix two-column content, so the date line can be non-adjacent to
 * the anchor in the array. We score every DD/MM/YYYY candidate on the page by:
 *
 *   + directly below the anchor (y gap < 3%)           → strong
 *   + below and within 10% vertical proximity           → moderate
 *   + center-X aligned with anchor (Δ < 15% page width) → strong
 *   + X column overlaps anchor column                   → moderate
 *   + the line has no foreign label                      → bonus
 *
 *   – belongs to EMISIÓN / VIGENCIA / REGISTRO row       → heavy penalty
 *   – very far vertically (> 15%)                        → exclude
 *   – on a line that carries a strong electoral anchor   → exclude
 *
 * The inline topology ("FECHA DE NACIMIENTO 31/12/1956") is still handled
 * by the spatial assigner; this function covers the label-alone topology and
 * validates the date (month/day sane). CURP cross-check is done by the
 * validator and NEVER overwrites the extracted value.
 */
function extractBirthDate(pages: OcrPage[], documentText: string, fields: IneParsedFields): void {
  if (fields.birthDate?.normalized && /\d{1,2}\/\d{1,2}\/\d{4}/.test(fields.birthDate.normalized))
    return; // already captured inline — keep it
  const anchors = ['FECHA DE NACIMIENTO', 'NACIMIENTO', 'FECHA NAC.'];
  const anchorCompacts = new Set(anchors.map((a) => compactForm(a)));
  const dateRe = /\b(\d{1,2}\/\d{1,2}\/\d{4})\b/;
  // Anchors of OTHER date-bearing fields that must be penalized.
  const foreignAnchorCompacts = new Set(
    ['EMISION', 'VIGENCIA', 'REGISTRO', 'ANO', 'ANODEREGISTRO'].map((a) => compactForm(a)),
  );
  for (let pi = 0; pi < pages.length; pi += 1) {
    const page = pages[pi];
    // Find the FECHA DE NACIMIENTO anchor line.
    let anchorLine: OcrLine | undefined;
    let anchorLineIndex = -1;
    for (let li = 0; li < page.lines.length; li += 1) {
      const line = page.lines[li];
      if (!line.tokens.length) continue;
      const lc = compactForm(line.tokens.map((t) => t.text).join(' '));
      if (!lc) continue;
      let matched = false;
      for (const ac of anchorCompacts) {
        if (lc === ac || lc.startsWith(ac)) {
          matched = true;
          break;
        }
      }
      if (!matched) continue;
      anchorLine = line;
      anchorLineIndex = li;
      break;
    }
    if (!anchorLine) continue;
    // First try same-line (inline) extraction.
    const anchorBox = anchorLine.box;
    const anchorCx = anchorBox ? (anchorBox.min.x + anchorBox.max.x) / 2 : 0.5;
    const anchorBottomY = anchorBox?.max.y ?? 0;
    const labelUpper = anchorLine.text.toUpperCase();
    const anchor = anchors.find((a) => labelUpper.includes(a.toUpperCase()));
    if (anchor) {
      const idx = labelUpper.indexOf(anchor.toUpperCase());
      const after = idx >= 0 ? anchorLine.text.slice(idx + anchor.length) : '';
      const same = after.match(dateRe)?.[1];
      if (same) {
        const [d, mth] = same.split('/').map(Number);
        if (mth >= 1 && mth <= 12 && d >= 1 && d <= 31) {
          const val = valueFromTokens(
            'date',
            anchorLine.tokens.filter((t) => !isLabelToken(t) && !isStopToken(t)),
            pi,
            documentText,
            'anchor-inline',
            'identity',
            [anchorLine.confidence],
          );
          if (val) {
            fields.birthDate = val;
            return;
          }
        }
      }
    }
    // Score all date candidates on the page by spatial proximity to the anchor.
    type Candidate = {
      line: OcrLine;
      date: string;
      score: number;
      source: IneRawValue['source'];
    };
    const cands: Candidate[] = [];
    for (let li2 = 0; li2 < page.lines.length; li2 += 1) {
      if (li2 === anchorLineIndex) continue;
      const line = page.lines[li2];
      const m = line.text.match(dateRe);
      if (!m) continue;
      const dateStr = m[1];
      const [d, mth] = dateStr.split('/').map(Number);
      if (mth < 1 || mth > 12 || d < 1 || d > 31) continue;
      const lineBox = line.box;
      const lineTop = lineBox?.min.y ?? 0;
      const lineCx = lineBox ? (lineBox.min.x + lineBox.max.x) / 2 : 0.5;
      const lineLeft = lineBox?.min.x ?? 0;
      const lineRight = lineBox?.max.x ?? 1;
      // Exclude lines that carry a foreign electoral anchor.
      const lineCompact = compactForm(line.tokens.map((t) => t.text).join(' '));
      const hasForeign = [...foreignAnchorCompacts].some((fc) => lineCompact.startsWith(fc));
      // Scoring:
      let score = 0;
      const yGap = lineTop - anchorBottomY;
      if (yGap < 0) {
        // Above the anchor — weak candidate
        score -= 5;
      } else if (yGap <= 0.03) {
        score += 10; // directly below, tight
      } else if (yGap <= 0.1) {
        score += 5; // moderate proximity
      } else if (yGap > 0.15) {
        continue; // too far
      } else {
        score += 1; // distant but not excluded
      }
      const xDelta = Math.abs(lineCx - anchorCx);
      if (xDelta < 0.05)
        score += 8; // well aligned
      else if (xDelta < 0.15)
        score += 4; // roughly aligned
      else if (xDelta < 0.3) score += 1; // same quadrant
      // X column overlap with anchor
      if (lineLeft < (anchorBox?.max.x ?? 1) && lineRight > (anchorBox?.min.x ?? 0)) score += 2;
      // No foreign label → bonus
      if (!hasForeign && !lineHasLabel(line)) score += 3;
      if (hasForeign) score -= 8;
      // Must be below to be a strong candidate
      if (yGap >= 0) score += 2;
      cands.push({ line, date: dateStr, score, source: 'anchor-below' });
    }
    if (!cands.length) continue;
    cands.sort((a, b) => b.score - a.score);
    const best = cands[0];
    const val = valueFromTokens(
      'date',
      best.line.tokens.filter((t) => !isLabelToken(t) && !isStopToken(t)),
      pi,
      documentText,
      best.source,
      'identity',
      [best.line.confidence],
    );
    if (val) {
      fields.birthDate = val;
      return;
    }
  }
}

/** Minimal source for `derivedValue` when the flattened address is absent. */
function addressSource(fields: IneParsedFields): IneRawValue {
  return (
    fields.address ?? {
      raw: '',
      normalized: '',
      source: 'derived',
      section: 'address',
      validation: { state: 'unverified', codes: [] },
      confidenceReasons: ['CONFIDENCE_UNAVAILABLE'],
    }
  );
}

/** Common Mexican neighborhood indicator prefixes (heuristics, not absolutes). */
const NEIGHBORHOOD_INDICATORS = [
  'BARR',
  'BARRIO',
  'COL',
  'COLONIA',
  'FRACC',
  'FRACCIONAMIENTO',
  'UNIDAD',
  'RESIDENCIAL',
  'PRIVADA',
  'CONDOMINIO',
  'AMPLIACION',
  'EJIDO',
  'PUEBLO',
  'RANCHERIA',
];
/** Street-designator words that must never be treated as the exterior number. */
const STREET_DESIGNATORS = new Set([
  'NORTE',
  'SUR',
  'ORIENTE',
  'PONIENTE',
  'AV',
  'AVENIDA',
  'CALLE',
  'CERRADA',
  'PRIVADA',
  'CONTINUACION',
]);

/**
 * Structured address extraction from the DOMICILIO block lines (not a single
 * regex on the flattened address). Per-line, per-field:
 *  - street + exteriorNumber from line 1 (postal code & "NO./NUM./#" stripped).
 *  - neighborhood from a line carrying a colonia indicator (prefix + postal
 *    stripped), never mixing in street/number/designators.
 *  - postalCode: first 5-digit run in the block (Mexican CP).
 *  - municipality + state from the last block line when it has a comma (e.g.
 *    "CINTALAPA, CHIS.").
 *
 * `municipality`/`state` set here OVERRIDE the MUNICIPIO/ESTADO label values
 * only when those are numeric electoral codes (e.g. "017"/"07"); the numeric
 * value is preserved as `municipalityCode`/`stateCode`. Alpha label values
 * (e.g. "CINTALAPA"/"CHIAPAS") are kept, so fixtures stay intact.
 */
function extractAddressBlock(
  pages: OcrPage[],
  documentText: string,
  fields: IneParsedFields,
): void {
  const block = findAnchorBlock(pages, ['DOMICILIO', 'DIRECCION', 'DIRECCIÓN']);
  if (!block || !block.linesBelow.length) return;
  const details = (fields.details ??= {});
  // Filter `linesBelow` to lines that overlap the anchor column (tolerance 10%).
  // `findAnchorBlock` is column-permissive (keeps interleaved opposite-column
  // lines so CLAVE DE ELECTOR doesn't truncate the block), but the DOMICILIO
  // value lines sit in the anchor's column — opposite-column lines must be
  // excluded when decomposing the block into street/neighborhood/CP/etc.
  const labelBox = block.labelLine.box;
  const labelLeftX = labelBox?.min.x ?? 0;
  const labelRightX = labelBox?.max.x ?? 1;
  const tol = 0.1;
  let columnLines = block.linesBelow.filter((l) => {
    const nl = l.box?.min.x ?? 0;
    const nr = l.box?.max.x ?? 1;
    return nl < labelRightX + tol && nr > labelLeftX - tol;
  });
  // Fallback: if the label sits on the far-left margin and has NO X overlap
  // with any line below (columnLines is empty), use ALL lines below the anchor
  // and exclude only the opposite (right) electoral column. The address lines
  // are recognized by vertical position within the block, NOT by X overlap.
  if (!columnLines.length) {
    const rightColumnThreshold = (labelRightX + 1) / 2; // midpoint between label and right edge
    columnLines = block.linesBelow.filter((l) => {
      const nl = l.box?.min.x ?? 0;
      // Exclude right-column (electoral) lines that sit clearly to the right.
      return nl < rightColumnThreshold + tol;
    });
  }
  const lines = columnLines.map((l) => cleanText(l.text)).filter(Boolean);
  if (!lines.length) return;
  const joined = lines.join(' ');

  // Ensure `address` reflects the FIRST line of the DOMICILIO block — the
  // street + exterior number as a unit (e.g. "C SAN CRISTOBAL 28"). The full
  // block is decomposed into neighborhood/postalCode/municipality/state below;
  // joining them into `address` conflates distinct fields. In a two-column
  // layout, `assignValues` may truncate `address` when a right-column label
  // appears between address lines; reconstruct the correct first line here.
  const firstBlockLine = lines[0] ?? '';
  if (!fields.address?.normalized || fields.address.normalized !== firstBlockLine) {
    const source = addressSource(fields);
    fields.address = derivedValue(firstBlockLine, 'text', source, 'address');
  }

  // postal code: first 5-digit run anywhere in the block.
  const postalMatch = joined.match(/\b\d{5}\b/);
  const postalCode = postalMatch?.[0];
  let postalRemoved = joined;
  if (postalCode) postalRemoved = postalRemoved.replace(postalCode, ' ');

  // street + exterior: parse the FIRST address line with postal removed.
  const firstLine = lines[0].replace(/\b\d{5}\b/g, ' ').replace(/\bCP\b/gi, ' ');
  const exteriorRe = /(?:S\/N|SN|N\/A|\d{1,5}(?:-[A-Z0-9]+)?|\d+\s*BIS)(?=\s|$|,)/gi;
  const EXPLICIT_NO_NUMBER = new Set(['S/N', 'SN', 'N/A']);
  let lastMatch: RegExpExecArray | null = null;
  let m: RegExpExecArray | null;
  while ((m = exteriorRe.exec(firstLine))) {
    // Skip matches whose matched token is a known street designator word
    // (NORTE/SUR/ORIENTE/PONIENTE/AV/CALLE…): part of the street name. But
    // explicit "sin número" tokens (S/N, SN, N/A) are ALWAYS valid exterior
    // numbers regardless of preceding context.
    const tok = m[0].toUpperCase();
    if (STREET_DESIGNATORS.has(tok)) continue;
    if (!EXPLICIT_NO_NUMBER.has(tok)) {
      const before = firstLine.slice(0, m.index).trim().split(/\s+/).pop() ?? '';
      if (STREET_DESIGNATORS.has(before)) continue; // number glued to a designator
    }
    lastMatch = m;
  }
  if (lastMatch) {
    const exterior = lastMatch[0].trim();
    const streetPart = firstLine.slice(0, lastMatch.index).replace(/\s+/g, ' ').trim();
    const street = streetPart.replace(/\s*(NO|NUM|NUMERO|N)\.?$/i, '').trim();
    const source = addressSource(fields);
    if (street) details.street = derivedValue(street, 'text', source, 'address');
    if (exterior) details.exteriorNumber = derivedValue(exterior, 'code', source, 'address');
  } else {
    const street = firstLine.replace(/\s*(NO|NUM|NUMERO|N)\.?$/i, '').trim();
    const source = addressSource(fields);
    if (street) details.street = derivedValue(street, 'text', source, 'address');
  }
  void postalRemoved;

  // neighborhood: CP-first approach. Identify the postal code, then analyse
  // the text BEFORE the CP on the same line as the neighborhood candidate.
  // This works even without a FRACC/BARR/COL indicator prefix. Indicator match
  // is used as a secondary signal / confidence booster, never as the sole
  // strategy. Line 1 (the street line) is excluded from the candidate set.
  if (!fields.neighborhood?.normalized) {
    // Strategy 1: the line that contains the postal code (but is NOT line 1
    // or the comma-line). Text before the CP = neighborhood candidate.
    for (let i = 1; i < columnLines.length; i += 1) {
      const lt = cleanText(columnLines[i].text);
      if (!lt) continue;
      const cpMatch = lt.match(/\b\d{5}\b/);
      if (!cpMatch || cpMatch.index === undefined) continue;
      // Exclude the comma-line (municipality/state) — it may also contain digits.
      if (lt.includes(',')) continue;
      const beforeCp = lt.slice(0, cpMatch.index).replace(/\s+/g, ' ').trim();
      if (!beforeCp) continue;
      const words = beforeCp.split(/\s+/).filter(Boolean);
      const head = words[0]?.replace(/[.\s:]/g, '').toUpperCase();
      const hasIndicator = head
        ? NEIGHBORHOOD_INDICATORS.some((ind) => compactForm(ind) === head)
        : false;
      // Skip if the text before CP is just a street designator or a number.
      if (STREET_DESIGNATORS.has(head ?? '')) continue;
      // If the text before CP is purely numeric or very short (1 char), skip.
      if (words.length < 1) continue;
      const val = valueFromTokens(
        'text',
        columnLines[i].tokens.filter((t) => !isLabelToken(t) && !isStopToken(t)),
        block.pageIndex,
        documentText,
        'anchor-below',
        'address',
        [columnLines[i].confidence],
      );
      if (val) {
        val.raw = beforeCp;
        val.normalized = beforeCp;
        if (!hasIndicator) {
          val.validation = { state: 'warning', codes: ['NEIGHBORHOOD_NO_INDICATOR'] };
          val.confidenceReasons = [...val.confidenceReasons, 'CP_LINE_FALLBACK'];
        }
        fields.neighborhood = val;
      }
      break;
    }
    // Strategy 2 (fallback): indicator-first match if no CP-bearing line found.
    if (!fields.neighborhood?.normalized) {
      for (let i = 1; i < columnLines.length; i += 1) {
        const lt = cleanText(columnLines[i].text);
        const words = lt.split(/\s+/).filter(Boolean);
        const head = words[0]?.replace(/[.\s:]/g, '').toUpperCase();
        if (head && NEIGHBORHOOD_INDICATORS.some((ind) => compactForm(ind) === head)) {
          const text = lt
            .replace(/\b\d{5}\b/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
          const val = valueFromTokens(
            'text',
            columnLines[i].tokens.filter((t) => !isLabelToken(t)),
            block.pageIndex,
            documentText,
            'anchor-below',
            'address',
            [columnLines[i].confidence],
          );
          if (val && text) {
            val.normalized = text;
            val.raw = text;
            fields.neighborhood = val;
          }
          break;
        }
      }
    }
  }

  // postalCode: moved to a public top-level field (not details). Mexican CP
  // = first 5-digit run in the block.
  if (postalCode)
    fields.postalCode = derivedValue(postalCode, 'number', addressSource(fields), 'address');

  // municipality + state from the last block line when it has a comma.
  const last = lines[lines.length - 1];
  if (last.includes(',')) {
    const [leftRaw, rightRaw] = last.split(',');
    const municipality = (leftRaw ?? '').trim();
    const stateName = (rightRaw ?? '').trim();
    const isNumeric = (v: string | undefined): boolean => !!v && /^\d+$/.test(v);
    const lastSourceLine = columnLines[columnLines.length - 1];
    if (municipality) {
      const existingMuni = fields.municipality?.normalized;
      if (!existingMuni || isNumeric(existingMuni)) {
        if (isNumeric(existingMuni)) {
          details.municipalityCode = derivedValue(
            existingMuni as string,
            'number',
            fields.municipality as IneRawValue,
            'electoral',
          );
        }
        const lastLine = columnLines[columnLines.length - 1];
        const val = valueFromTokens(
          'text',
          lastLine.tokens.filter((t) => !isLabelToken(t) && !isStopToken(t)),
          block.pageIndex,
          documentText,
          'anchor-below',
          'address',
          [lastLine.confidence],
        );
        if (val) {
          val.raw = municipality;
          val.normalized = municipality;
          fields.municipality = val;
        }
      }
    }
    if (stateName) {
      const existingState = fields.state?.normalized;
      if (!existingState || isNumeric(existingState)) {
        if (isNumeric(existingState)) {
          details.stateCode = derivedValue(
            existingState as string,
            'number',
            fields.state as IneRawValue,
            'electoral',
          );
        }
        const val = valueFromTokens(
          'text',
          lastSourceLine.tokens.filter((t) => !isLabelToken(t) && !isStopToken(t)),
          block.pageIndex,
          documentText,
          'anchor-below',
          'address',
          [lastSourceLine.confidence],
        );
        if (val) {
          val.raw = stateName;
          val.normalized = stateName;
          fields.state = val;
        }
      }
    }
  }
}

/**
 * When a year-bearing electoral field absorbed more than one fragment (e.g.
 * "AÑO DE REGISTRO 2015 00" captured raw "2015 00"), keep the raw but normalize
 * to the first 4-digit year so foreign fragments are not concatenated.
 */
function refineYearField(fields: IneParsedFields, field: 'registrationYear' | 'validUntil'): void {
  const v = fields[field];
  if (!v?.raw) return;
  const m = v.raw.match(/\b(19|20)\d{2}\b/);
  if (m && m[0] !== v.normalized) v.normalized = m[0];
}

function extractLabeledDigits(text: string, label: string, length: string): string | undefined {
  const match = text.match(new RegExp(`\\b${label}\\s*[:.-]?\\s*(\\d{${length}})\\b`, 'i'));
  return match?.[1];
}

function extractElectoralDetails(documentText: string, fields: IneParsedFields): void {
  const details = (fields.details ??= {});
  const municipalCode = extractLabeledDigits(documentText, 'C(?:O|Ó)DIGO\\s+MUNICIPAL', '1,4');
  const stateCode = extractLabeledDigits(documentText, 'ENTIDAD', '1,2');
  const emissionYear = extractLabeledDigits(documentText, 'EMISI(?:O|Ó)N', '4');
  const source = fields.electoralSection ?? fields.registrationYear ?? fields.voterKey;
  if (!source) return;
  if (municipalCode)
    details.municipalityCode = derivedValue(municipalCode, 'number', source, 'electoral');
  if (stateCode) details.stateCode = derivedValue(stateCode, 'number', source, 'electoral');
  if (emissionYear)
    details.emissionYear = derivedValue(emissionYear, 'number', source, 'electoral');
}

function parseMrz(text: string, visualCurp?: string): IneParsedFields['mrz'] {
  const rows = text.match(/[A-Z0-9<]{20,}/g) ?? [];
  if (!rows.length) return { detected: false, nameTruncated: false, codes: [] };
  const compact = rows.join('').replace(/</g, '');
  const curp = compact.match(/[A-Z]{4}\d{6}[A-Z]{6}[A-Z0-9]\d/)?.[0];
  const nameTruncated = rows.some((row) => row.includes('<<') && row.endsWith('<'));
  return {
    detected: true,
    nameTruncated,
    ...(curp && visualCurp ? { curpMatches: curp === visualCurp } : {}),
    codes: [
      'MRZ_CORROBORATION_ONLY',
      ...(nameTruncated ? ['MRZ_NAME_TRUNCATED'] : []),
      ...(curp && visualCurp ? [curp === visualCurp ? 'MRZ_CURP_MATCH' : 'MRZ_CURP_MISMATCH'] : []),
    ],
  };
}

// ── Validator ────────────────────────────────────────────────────────────────

const FORBIDDEN_TOKENS_BY_FIELD: Partial<Record<IneFieldName, string[]>> = {
  municipality: ['SECCION', 'SECCIÓN', 'SEC', 'LOCALIDAD', 'MUNICIPIO', 'COLONIA'],
  neighborhood: ['SECCION', 'SECCIÓN', 'SEC', 'MUNICIPIO', 'LOCALIDAD'],
  electoralSection: ['MUNICIPIO', 'LOCALIDAD', 'COLONIA'],
};

function markValidation(
  value: IneRawValue | undefined,
  state: IneRawValue['validation']['state'],
  code: string,
): void {
  if (!value) return;
  const nextState = value.validation.state === 'invalid' ? 'invalid' : state;
  value.validation = {
    state: nextState,
    codes: [...new Set([...value.validation.codes, code])],
  };
}

function curpCheckDigit(curp: string): boolean | undefined {
  if (!/^[A-Z]{4}\d{6}[A-Z]{6}[A-Z0-9]\d$/.test(curp)) return undefined;
  const alphabet = '0123456789ABCDEFGHIJKLMNÑOPQRSTUVWXYZ';
  const sum = curp
    .slice(0, 17)
    .split('')
    .reduce((total, char, index) => total + alphabet.indexOf(char) * (18 - index), 0);
  return (10 - (sum % 10)) % 10 === Number(curp[17]);
}

function hasValidCurpDate(value: string): boolean {
  const year = Number(value.slice(4, 6));
  const month = Number(value.slice(6, 8));
  const day = Number(value.slice(8, 10));
  return [1900 + year, 2000 + year].some((fullYear) => {
    const date = new Date(Date.UTC(fullYear, month - 1, day));
    return (
      date.getUTCFullYear() === fullYear &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    );
  });
}

function validateCurp(fields: IneParsedFields, warnings: string[]): void {
  const value = fields.curp;
  if (!value) return;
  const curp = value.normalized;
  if (!/^[A-Z][AEIOUX][A-Z]{2}\d{6}[HM][A-Z]{5}[A-Z0-9]\d$/.test(curp)) {
    markValidation(value, 'invalid', 'CURP_STRUCTURE_INVALID');
    warnings.push('CURP structure is invalid');
    return;
  }
  if (!hasValidCurpDate(curp)) {
    markValidation(value, 'invalid', 'CURP_DATE_INVALID');
    warnings.push('CURP date is invalid');
  }
  const checkDigit = curpCheckDigit(curp);
  if (checkDigit === false) {
    markValidation(value, 'invalid', 'CURP_CHECK_DIGIT_INVALID');
    warnings.push('CURP check digit is invalid');
  } else if (checkDigit === true) {
    markValidation(value, 'valid', 'CURP_CHECK_DIGIT_VALID');
  }
  const sex = fields.sex?.normalized;
  const expectedSex =
    sex?.includes('MUJER') || sex?.includes('FEMEN')
      ? 'M'
      : sex?.includes('HOMBRE') || sex?.includes('MASC')
        ? 'H'
        : undefined;
  if (expectedSex && expectedSex !== curp[10]) {
    markValidation(value, 'warning', 'CURP_SEX_MISMATCH');
    warnings.push('CURP sex does not match the visual field');
  }
}

function validate(fields: IneParsedFields): IneValidationSummary {
  const missing = INE_REQUIRED_FIELDS.filter((f) => !fields[f]?.normalized);
  const warnings: string[] = [];
  const crossFieldIssues: string[] = [];

  validateCurp(fields, warnings);
  if (fields.voterKey && !/^[A-Z0-9]{12,24}$/.test(fields.voterKey.normalized)) {
    markValidation(fields.voterKey, 'warning', 'VOTER_KEY_FORMAT_UNEXPECTED');
    warnings.push('Voter key format is unexpected');
  }
  if (fields.electoralSection && !/^\d{1,6}$/.test(fields.electoralSection.normalized)) {
    markValidation(fields.electoralSection, 'invalid', 'ELECTORAL_SECTION_NOT_NUMERIC');
    warnings.push('Electoral section is not numeric');
  }

  // Cross-field: a field swallowed a foreign label token.
  for (const [field, forbidden] of Object.entries(FORBIDDEN_TOKENS_BY_FIELD) as [
    IneFieldName,
    string[],
  ][]) {
    const val = fields[field]?.normalized;
    if (!val) continue;
    const valNorm = accentFold(val).toUpperCase();
    for (const bad of forbidden) {
      const badNorm = accentFold(bad).toUpperCase();
      const re = new RegExp(`(^|\\s)${badNorm.replace(/[.\s:]/g, '')}(\\s|$)`, 'i');
      const compact = valNorm.replace(/[\s.\-:]/g, '');
      const badCompact = badNorm.replace(/[\s.\-:]/g, '');
      if (re.test(valNorm) || compact.includes(badCompact)) {
        markValidation(fields[field], 'warning', 'FOREIGN_LABEL_TOKEN');
        crossFieldIssues.push(`${field} contains a foreign label token: ${bad}`);
      }
    }
  }

  // Cross-field: CURP initials vs split name.
  if (fields.curp && fields.curp.normalized.length >= 4) {
    const curp = fields.curp.normalized;
    const initialPaternal = curp[0];
    const initialMaternal = curp[1];
    if (
      fields.paternalLastName?.normalized &&
      accentFold(fields.paternalLastName.normalized)[0]?.toUpperCase() !== initialPaternal
    ) {
      markValidation(fields.paternalLastName, 'warning', 'CURP_PATERNAL_INITIAL_MISMATCH');
      crossFieldIssues.push('Paternal last name initial does not match CURP');
    }
    if (
      fields.maternalLastName?.normalized &&
      accentFold(fields.maternalLastName.normalized)[0]?.toUpperCase() !== initialMaternal
    ) {
      markValidation(fields.maternalLastName, 'warning', 'CURP_MATERNAL_INITIAL_MISMATCH');
      crossFieldIssues.push('Maternal last name initial does not match CURP');
    }
  }

  // If we have a fullName but the split components are all empty, warn.
  if (
    fields.fullName?.normalized &&
    !fields.firstName?.normalized &&
    !fields.paternalLastName?.normalized
  ) {
    crossFieldIssues.push('Full name was captured but could not be split into components');
  }

  const observations: Array<IneRawValue | undefined> = [
    ...INE_REQUIRED_FIELDS.map((name) => fields[name]),
    fields.fullName,
    ...Object.values(fields.details ?? {}),
  ];
  for (const field of observations) {
    if (!field) continue;
    if (field.validation.state === 'unverified')
      markValidation(field, 'valid', 'FORMAT_NOT_CHECKED');
  }
  return { missing, warnings, crossFieldIssues };
}

// ── Public entry point ────────────────────────────────────────────────────────

export function parseIneDocument(document: OcrTextLayout): ParsedIneDocument {
  // Internal pipeline: normalized layout -> semantic anchors/regions -> capture ->
  // normalization/details -> validation. The original layout remains the source.
  const layout = normalizeSpatialLayout(document);
  const fields = assignValues(layout.pages, locateLabels(layout.pages), layout.text);
  regexFallbacks(layout.text, fields);
  extractNameBlock(layout.pages, layout.text, fields);
  extractBirthDate(layout.pages, layout.text, fields);
  extractAddressBlock(layout.pages, layout.text, fields);
  refineYearField(fields, 'registrationYear');
  refineYearField(fields, 'validUntil');
  extractElectoralDetails(layout.text, fields);
  fields.mrz = parseMrz(layout.text, fields.curp?.normalized);
  const validationSummary = validate(fields);
  return { fields, source: document, validationSummary };
}
