import { describe, expect, it } from '@jest/globals';
import { flattenIneFields, parseIneDocument, splitName } from '../../services/ine/ine-parser';
import type { OcrTextLayout } from '../../services/ine/ocr.provider';
import { frontFixture } from './ine-fixtures';

function layoutFromLines(
  rows: Array<{
    text: string;
    tokenConfidences?: number[];
    lineConfidence?: number;
    boxes?: boolean;
  }>,
): OcrTextLayout {
  const text = `${rows.map((row) => row.text).join('\n')}\n`;
  let lineStart = 0;
  const lines = rows.map((row, lineIndex) => {
    let tokenOffset = 0;
    const tokenTexts = row.text.split(/\s+/).filter(Boolean);
    const tokens = tokenTexts.map((tokenText, tokenIndex) => {
      const start = lineStart + row.text.indexOf(tokenText, tokenOffset);
      tokenOffset = start - lineStart + tokenText.length;
      const x = 0.4 + tokenIndex * 0.07;
      return {
        text: tokenText,
        segment: { start, end: start + tokenText.length },
        ...(row.boxes === false
          ? {}
          : {
              box: {
                min: { x, y: 0.1 + lineIndex * 0.02 },
                max: { x: x + 0.06, y: 0.11 + lineIndex * 0.02 },
              },
            }),
        ...(row.tokenConfidences?.[tokenIndex] === undefined
          ? {}
          : { confidence: row.tokenConfidences[tokenIndex] }),
      };
    });
    const currentStart = lineStart;
    lineStart += row.text.length + 1;
    return {
      text: row.text,
      segment: { start: currentStart, end: currentStart + row.text.length },
      ...(row.boxes === false
        ? {}
        : {
            box: {
              min: { x: 0.4, y: 0.1 + lineIndex * 0.02 },
              max: { x: 0.8, y: 0.11 + lineIndex * 0.02 },
            },
          }),
      ...(row.lineConfidence === undefined ? {} : { confidence: row.lineConfidence }),
      tokens,
    };
  });
  return {
    text,
    pages: [
      {
        pageNumber: 1,
        text,
        lines,
        tokens: lines.flatMap((line) => line.tokens),
        width: 1,
        height: 1,
      },
    ],
  };
}

import type { OcrLine, OcrToken } from '../../services/ine/ocr.provider';

/**
 * Build a two-column INE layout with realistic Document AI coordinates.
 * Each spec has an explicit (y, x1, x2) so left/right columns are spatially
 * separated — exercising the column-aware anchor-block logic.
 */
function twoColumnLayout(
  specs: Array<{ text: string; y: number; x1: number; x2: number }>,
): OcrTextLayout {
  const docText = `${specs.map((s) => s.text).join('\n')}\n`;
  let cursor = 0;
  const lines: OcrLine[] = [];
  for (const spec of specs) {
    const lineStart = cursor;
    const lineEnd = lineStart + spec.text.length;
    const tokenTexts = spec.text.split(/\s+/).filter(Boolean);
    const tw = (spec.x2 - spec.x1) / Math.max(tokenTexts.length, 1);
    const tokens: OcrToken[] = [];
    let tc = 0;
    for (let i = 0; i < tokenTexts.length; i++) {
      const t = tokenTexts[i];
      const start = lineStart + spec.text.indexOf(t, tc);
      tc = start - lineStart + t.length;
      const tx1 = spec.x1 + i * tw;
      tokens.push({
        text: t,
        segment: { start, end: start + t.length },
        box: { min: { x: tx1, y: spec.y }, max: { x: tx1 + tw * 0.9, y: spec.y + 0.012 } },
      });
    }
    lines.push({
      text: spec.text,
      segment: { start: lineStart, end: lineEnd },
      box: { min: { x: spec.x1, y: spec.y }, max: { x: spec.x2, y: spec.y + 0.012 } },
      tokens,
    });
    cursor = lineEnd + 1;
  }
  return {
    text: docText,
    pages: [
      {
        pageNumber: 1,
        text: docText,
        lines,
        tokens: lines.flatMap((l) => l.tokens),
        width: 1,
        height: 1,
      },
    ],
  };
}

describe('parseIneDocument — spatial parsing', () => {
  describe('front fixture (real topology, anonymized)', () => {
    const result = parseIneDocument(frontFixture());

    it('captures full name even when NOMBRE label is alone and value is on lines below', () => {
      expect(result.fields.fullName?.normalized).toBe('LOPEZ GARCIA ANA MARIA');
    });

    it('splits name by vertical line structure (paternal / maternal / names)', () => {
      expect(result.fields.firstName?.normalized).toBe('ANA MARIA');
      expect(result.fields.paternalLastName?.normalized).toBe('LOPEZ');
      expect(result.fields.maternalLastName?.normalized).toBe('GARCIA');
    });

    it('separates MUNICIPIO and SECCION on the same visual line (X-split)', () => {
      expect(result.fields.municipality?.normalized).toBe('CINTALAPA');
      expect(result.fields.electoralSection?.normalized).toBe('0042');
      // Critical: section must NOT leak into municipality
      expect(result.fields.municipality?.normalized).not.toContain('SECCION');
      expect(result.fields.municipality?.normalized).not.toContain('0042');
    });

    it('captures LOCALIDAD on the line below municipio/seccion', () => {
      expect(result.fields.locality?.normalized).toBe('CINTALAPA');
    });

    it('captures address from lines below DOMICILIO label', () => {
      expect(result.fields.address?.normalized).toContain('CALLE 5 DE MAYO 12');
    });

    it('captures inline COLONIA value', () => {
      expect(result.fields.neighborhood?.normalized).toBe('CENTRO');
    });

    it('captures CLAVE DE ELECTOR (multi-token label) value inline', () => {
      expect(result.fields.voterKey?.normalized).toBe('ABCDEF123456EFG789');
    });

    it('captures ESTADO inline', () => {
      expect(result.fields.state?.normalized).toBe('CHIAPAS');
    });

    it('captures CURP inline and validates format', () => {
      expect(result.fields.curp?.normalized).toBe('LGAA900101MCSPRN09');
      expect(result.validationSummary.warnings).not.toContain('CURP format is unexpected');
    });

    it('preserves raw value alongside normalized for each field', () => {
      expect(result.fields.municipality?.raw).toBeTruthy();
      // raw is the untouched OCR text; normalized is derived. For a clean token
      // they may coincide, but both must be present.
      expect(typeof result.fields.municipality?.raw).toBe('string');
      expect(typeof result.fields.municipality?.normalized).toBe('string');
    });

    it('no cross-field issues on a clean fixture', () => {
      expect(result.validationSummary.crossFieldIssues).toEqual([]);
    });

    it('flattenIneFields produces the flat string-only shape for compatibility', () => {
      const flat = flattenIneFields(result.fields);
      expect(flat.municipality).toBe('CINTALAPA');
      expect(flat.electoralSection).toBe('0042');
      expect(typeof flat.firstName).toBe('string');
    });
  });

  describe('OCR variants for SECCION label', () => {
    it('matches SECCIÓN (with accent) as the electoral section label', () => {
      const layout: OcrTextLayout = {
        text: 'MUNICIPIO CINTALAPA SECCIÓN 0042',
        pages: [
          {
            pageNumber: 1,
            text: 'MUNICIPIO CINTALAPA SECCIÓN 0042',
            lines: [
              {
                text: 'MUNICIPIO CINTALAPA SECCIÓN 0042',
                segment: { start: 0, end: 31 },
                box: { min: { x: 0.4, y: 0.3 }, max: { x: 0.7, y: 0.31 } },
                tokens: [
                  {
                    text: 'MUNICIPIO',
                    segment: { start: 0, end: 9 },
                    box: { min: { x: 0.4, y: 0.3 }, max: { x: 0.45, y: 0.31 } },
                  },
                  {
                    text: 'CINTALAPA',
                    segment: { start: 10, end: 19 },
                    box: { min: { x: 0.46, y: 0.3 }, max: { x: 0.55, y: 0.31 } },
                  },
                  {
                    text: 'SECCIÓN',
                    segment: { start: 20, end: 27 },
                    box: { min: { x: 0.6, y: 0.3 }, max: { x: 0.65, y: 0.31 } },
                  },
                  {
                    text: '0042',
                    segment: { start: 28, end: 32 },
                    box: { min: { x: 0.66, y: 0.3 }, max: { x: 0.7, y: 0.31 } },
                  },
                ],
              },
            ],
            tokens: [],
            width: 1,
            height: 1,
          },
        ],
      };
      const parsed = parseIneDocument(layout);
      expect(parsed.fields.electoralSection?.normalized).toBe('0042');
      expect(parsed.fields.municipality?.normalized).toBe('CINTALAPA');
    });
  });

  describe('regex fallback for pure-pattern fields', () => {
    it('falls back to regex for electoralSection when no spatial label is present', () => {
      const layout: OcrTextLayout = {
        text: 'ALGUN TEXTO SECCION 1234 MAS TEXTO',
        pages: [
          {
            pageNumber: 1,
            text: 'ALGUN TEXTO SECCION 1234 MAS TEXTO',
            lines: [
              {
                text: 'ALGUN TEXTO SECCION 1234 MAS TEXTO',
                segment: { start: 0, end: 35 },
                box: { min: { x: 0, y: 0 }, max: { x: 1, y: 0.1 } },
                tokens: [
                  {
                    text: 'ALGUN',
                    segment: { start: 0, end: 5 },
                    box: { min: { x: 0, y: 0 }, max: { x: 0.1, y: 0.1 } },
                  },
                  {
                    text: 'TEXTO',
                    segment: { start: 6, end: 11 },
                    box: { min: { x: 0.1, y: 0 }, max: { x: 0.2, y: 0.1 } },
                  },
                  {
                    text: 'SECCION',
                    segment: { start: 12, end: 19 },
                    box: { min: { x: 0.2, y: 0 }, max: { x: 0.3, y: 0.1 } },
                  },
                  {
                    text: '1234',
                    segment: { start: 20, end: 24 },
                    box: { min: { x: 0.3, y: 0 }, max: { x: 0.4, y: 0.1 } },
                  },
                  {
                    text: 'MAS',
                    segment: { start: 25, end: 28 },
                    box: { min: { x: 0.4, y: 0 }, max: { x: 0.5, y: 0.1 } },
                  },
                  {
                    text: 'TEXTO',
                    segment: { start: 29, end: 34 },
                    box: { min: { x: 0.5, y: 0 }, max: { x: 0.6, y: 0.1 } },
                  },
                ],
              },
            ],
            tokens: [],
            width: 1,
            height: 1,
          },
        ],
      };
      // The line has a label + value inline; spatial should handle it.
      const parsed = parseIneDocument(layout);
      expect(parsed.fields.electoralSection?.normalized).toBe('1234');
    });
  });
});

describe('splitName', () => {
  it('splits a simple 3-token name', () => {
    const r = splitName('ANA LOPEZ GARCIA');
    expect(r.firstName?.normalized).toBe('ANA');
    expect(r.paternalLastName?.normalized).toBe('LOPEZ');
    expect(r.maternalLastName?.normalized).toBe('GARCIA');
  });

  it('keeps a compound first name', () => {
    const r = splitName('ANA MARIA LOPEZ GARCIA');
    expect(r.firstName?.normalized).toBe('ANA MARIA');
    expect(r.paternalLastName?.normalized).toBe('LOPEZ');
    expect(r.maternalLastName?.normalized).toBe('GARCIA');
  });

  it('preserves a compound paternal surname with DE LA', () => {
    const r = splitName('JUAN DE LA CRUZ RAMIREZ');
    expect(r.firstName?.normalized).toBe('JUAN');
    expect(r.paternalLastName?.normalized).toBe('DE LA CRUZ');
    expect(r.maternalLastName?.normalized).toBe('RAMIREZ');
  });

  it('preserves a compound maternal surname with DE LOS', () => {
    const r = splitName('JUAN PEREZ DE LOS RIOS');
    expect(r.firstName?.normalized).toBe('JUAN');
    expect(r.paternalLastName?.normalized).toBe('PEREZ');
    expect(r.maternalLastName?.normalized).toBe('DE LOS RIOS');
  });

  it('handles 2-token name without inventing maternal', () => {
    const r = splitName('JUAN PEREZ');
    expect(r.firstName?.normalized).toBe('JUAN');
    expect(r.paternalLastName?.normalized).toBe('PEREZ');
    expect(r.maternalLastName).toBeUndefined();
  });

  it('returns just first name for 1 token', () => {
    const r = splitName('JUAN');
    expect(r.firstName?.normalized).toBe('JUAN');
    expect(r.paternalLastName).toBeUndefined();
  });

  it('handles accents in names', () => {
    const r = splitName('JOSÉ RAMÍREZ GONZÁLEZ');
    expect(r.firstName?.normalized).toBe('JOSÉ');
    expect(r.paternalLastName?.normalized).toBe('RAMÍREZ');
    expect(r.maternalLastName?.normalized).toBe('GONZÁLEZ');
  });
});

describe('surgical INE parser fixes — real-document topology', () => {
  const realDocLayout: OcrTextLayout = layoutFromLines([
    { text: 'NOMBRE' },
    { text: 'LAM' },
    { text: 'ROQUE' },
    { text: 'ARLY' },
    { text: 'DAYANARA' },
    { text: 'DOMICILIO' },
    { text: 'AV 1A NORTE ORIENTE S/N' },
    { text: 'BARR SAN FRANCISCO 30400' },
    { text: 'CINTALAPA, CHIS.' },
    { text: 'CLAVE DE ELECTOR LMRQAR96112007M700' },
    { text: 'CURP LARA961120MCSMQR01' },
    { text: 'ESTADO 07' },
    { text: 'FECHA DE NACIMIENTO' },
    { text: '20/11/1996' },
    { text: 'SEXO M' },
    { text: 'MUNICIPIO 017' },
    { text: 'AÑO DE REGISTRO 2015 00' },
    { text: 'SECCION 0001' },
    { text: 'LOCALIDAD 0001 EMISION 2015 VIGENCIA 2025' },
  ]);
  const parsed = parseIneDocument(realDocLayout);

  it('splits the NOMBRE block by vertical line: paterno / materno / nombres', () => {
    expect(parsed.fields.paternalLastName?.normalized).toBe('LAM');
    expect(parsed.fields.maternalLastName?.normalized).toBe('ROQUE');
    expect(parsed.fields.firstName?.normalized).toBe('ARLY DAYANARA');
    expect(parsed.fields.fullName?.normalized).toBe('LAM ROQUE ARLY DAYANARA');
  });

  it('extracts birth date from the line BELOW the FECHA DE NACIMIENTO anchor', () => {
    expect(parsed.fields.birthDate?.normalized).toBe('20/11/1996');
    expect(parsed.fields.birthDate?.source).toBe('anchor-below');
  });

  it('keeps the first address line as domicilio and splits street / exterior / neighborhood', () => {
    expect(parsed.fields.address?.normalized).toBe('AV 1A NORTE ORIENTE S/N');
    expect(parsed.fields.details?.street?.normalized).toBe('AV 1A NORTE ORIENTE');
    expect(parsed.fields.details?.exteriorNumber?.normalized).toBe('S/N');
    expect(parsed.fields.neighborhood?.normalized).toBe('BARR SAN FRANCISCO');
    expect(parsed.fields.postalCode?.normalized).toBe('30400');
  });

  it('derives municipality/state from the DOMICILIO comma line, demoting numeric electoral codes', () => {
    expect(parsed.fields.municipality?.normalized).toBe('CINTALAPA');
    expect(parsed.fields.state?.normalized).toBe('CHIS.');
    expect(parsed.fields.details?.municipalityCode?.normalized).toBe('017');
    expect(parsed.fields.details?.stateCode?.normalized).toBe('07');
  });

  it('delimits inline electoral fields: locality / emissionYear / validUntil do not absorb each other', () => {
    expect(parsed.fields.locality?.normalized).toBe('0001');
    expect(parsed.fields.details?.emissionYear?.normalized).toBe('2015');
    expect(parsed.fields.validUntil?.normalized).toBe('2025');
  });

  it('keeps registrationYear as the first 4-digit year, never concatenating "2015 00"', () => {
    expect(parsed.fields.registrationYear?.normalized).toBe('2015');
    expect(parsed.fields.registrationYear?.raw).toBe('2015 00');
  });

  it('preserves CURP, voter key, sex and electoral state without regression', () => {
    expect(parsed.fields.curp?.normalized).toBe('LARA961120MCSMQR01');
    expect(parsed.fields.voterKey?.normalized).toBe('LMRQAR96112007M700');
    expect(parsed.fields.sex?.normalized).toBe('M');
    expect(parsed.fields.electoralSection?.normalized).toBe('0001');
  });
});

describe('two-column INE layout — birthDate & neighborhood with spatial scoring', () => {
  it('fixture 2: extracts birthDate and neighborhood despite non-adjacent lines (other labels between FECHA and date)', () => {
    const layout = twoColumnLayout([
      { text: 'NOMBRE', y: 0.14, x1: 0.36, x2: 0.5 },
      { text: 'LAM', y: 0.16, x1: 0.37, x2: 0.46 },
      { text: 'ROQUE', y: 0.18, x1: 0.37, x2: 0.47 },
      { text: 'ARLY DAYANARA', y: 0.2, x1: 0.37, x2: 0.6 },
      { text: 'DOMICILIO', y: 0.22, x1: 0.36, x2: 0.5 },
      { text: 'AV 1A NORTE ORIENTE S/N', y: 0.24, x1: 0.37, x2: 0.65 },
      { text: 'BARR SAN FRANCISCO 30400', y: 0.26, x1: 0.37, x2: 0.62 },
      { text: 'CINTALAPA, CHIS.', y: 0.28, x1: 0.37, x2: 0.56 },
      { text: 'CLAVE DE ELECTOR LMRQAR96112007M700', y: 0.24, x1: 0.7, x2: 0.95 },
      { text: 'CURP LARA961120MCSMQR01', y: 0.26, x1: 0.71, x2: 0.88 },
      { text: 'ESTADO 07', y: 0.28, x1: 0.71, x2: 0.8 },
      // FECHA anchor — MUNICIPIO/SECCION appear BEFORE the date in array order
      { text: 'FECHA DE NACIMIENTO', y: 0.299, x1: 0.764, x2: 0.932 },
      { text: 'MUNICIPIO 017', y: 0.35, x1: 0.7, x2: 0.84 },
      { text: 'AÑO DE REGISTRO 2015 00', y: 0.37, x1: 0.7, x2: 0.88 },
      { text: 'SECCION 0001', y: 0.39, x1: 0.7, x2: 0.82 },
      { text: '20/11/1996', y: 0.312, x1: 0.786, x2: 0.908 },
      { text: 'SEXO M', y: 0.33, x1: 0.76, x2: 0.86 },
      { text: 'LOCALIDAD 0001 EMISION 2015 VIGENCIA 2025', y: 0.41, x1: 0.7, x2: 0.95 },
    ]);
    const parsed = parseIneDocument(layout);

    expect(parsed.fields.birthDate?.normalized).toBe('20/11/1996');
    expect(parsed.fields.address?.normalized).toBe('AV 1A NORTE ORIENTE S/N');
    expect(parsed.fields.neighborhood?.normalized).toBe('BARR SAN FRANCISCO');
    expect(parsed.fields.details?.street?.normalized).toBe('AV 1A NORTE ORIENTE');
    expect(parsed.fields.details?.exteriorNumber?.normalized).toBe('S/N');
    expect(parsed.fields.postalCode?.normalized).toBe('30400');
    expect(parsed.fields.municipality?.normalized).toBe('CINTALAPA');
    expect(parsed.fields.state?.normalized).toBe('CHIS.');
  });

  it('fixture 2 (interleaved): columns mixed in y-sorted order, DOMICILIO block not truncated by right-column labels', () => {
    const layout = twoColumnLayout([
      { text: 'NOMBRE', y: 0.14, x1: 0.36, x2: 0.5 },
      { text: 'LAM', y: 0.16, x1: 0.37, x2: 0.46 },
      { text: 'ROQUE', y: 0.18, x1: 0.37, x2: 0.47 },
      { text: 'ARLY DAYANARA', y: 0.2, x1: 0.37, x2: 0.6 },
      { text: 'DOMICILIO', y: 0.22, x1: 0.36, x2: 0.5 },
      { text: 'AV 1A NORTE ORIENTE S/N', y: 0.24, x1: 0.37, x2: 0.65 },
      { text: 'CLAVE DE ELECTOR LMRQAR96112007M700', y: 0.24, x1: 0.7, x2: 0.95 },
      { text: 'BARR SAN FRANCISCO 30400', y: 0.26, x1: 0.37, x2: 0.62 },
      { text: 'CURP LARA961120MCSMQR01', y: 0.26, x1: 0.71, x2: 0.88 },
      { text: 'CINTALAPA, CHIS.', y: 0.28, x1: 0.37, x2: 0.56 },
      { text: 'ESTADO 07', y: 0.28, x1: 0.71, x2: 0.8 },
      { text: 'FECHA DE NACIMIENTO', y: 0.299, x1: 0.764, x2: 0.932 },
      { text: '20/11/1996', y: 0.312, x1: 0.786, x2: 0.908 },
      { text: 'SEXO M', y: 0.33, x1: 0.76, x2: 0.86 },
      { text: 'MUNICIPIO 017', y: 0.35, x1: 0.7, x2: 0.84 },
      { text: 'AÑO DE REGISTRO 2015 00', y: 0.37, x1: 0.7, x2: 0.88 },
      { text: 'SECCION 0001', y: 0.39, x1: 0.7, x2: 0.82 },
      { text: 'LOCALIDAD 0001 EMISION 2015 VIGENCIA 2025', y: 0.41, x1: 0.7, x2: 0.95 },
    ]);
    const parsed = parseIneDocument(layout);

    expect(parsed.fields.neighborhood?.normalized).toBe('BARR SAN FRANCISCO');
    expect(parsed.fields.birthDate?.normalized).toBe('20/11/1996');
    expect(parsed.fields.details?.street?.normalized).toBe('AV 1A NORTE ORIENTE');
  });

  it('fixture 1: C SAN CRISTOBAL 28 / FRACC SAN MARCOS — street, exterior, neighborhood, postal all correct', () => {
    const layout = twoColumnLayout([
      { text: 'NOMBRE', y: 0.14, x1: 0.36, x2: 0.5 },
      { text: 'CRUZ', y: 0.16, x1: 0.37, x2: 0.45 },
      { text: 'HERNANDEZ', y: 0.18, x1: 0.37, x2: 0.52 },
      { text: 'ANTONIO DE JESUS', y: 0.2, x1: 0.37, x2: 0.62 },
      { text: 'DOMICILIO', y: 0.22, x1: 0.36, x2: 0.5 },
      { text: 'C SAN CRISTOBAL 28', y: 0.24, x1: 0.37, x2: 0.6 },
      { text: 'FRACC SAN MARCOS 30400', y: 0.26, x1: 0.37, x2: 0.62 },
      { text: 'CINTALAPA, CHIS.', y: 0.28, x1: 0.37, x2: 0.56 },
      { text: 'CLAVE DE ELECTOR CRHRAN95061307H700', y: 0.24, x1: 0.7, x2: 0.95 },
      { text: 'CURP CUHA950613HCSRRN06', y: 0.26, x1: 0.71, x2: 0.88 },
      { text: 'ESTADO 07', y: 0.28, x1: 0.71, x2: 0.8 },
      { text: 'FECHA DE NACIMIENTO', y: 0.299, x1: 0.764, x2: 0.932 },
      { text: '13/06/1995', y: 0.312, x1: 0.786, x2: 0.908 },
      { text: 'SEXO H', y: 0.33, x1: 0.76, x2: 0.86 },
    ]);
    const parsed = parseIneDocument(layout);

    expect(parsed.fields.birthDate?.normalized).toBe('13/06/1995');
    expect(parsed.fields.address?.normalized).toBe('C SAN CRISTOBAL 28');
    expect(parsed.fields.details?.street?.normalized).toBe('C SAN CRISTOBAL');
    expect(parsed.fields.details?.exteriorNumber?.normalized).toBe('28');
    expect(parsed.fields.neighborhood?.normalized).toBe('FRACC SAN MARCOS');
    expect(parsed.fields.postalCode?.normalized).toBe('30400');
    expect(parsed.fields.municipality?.normalized).toBe('CINTALAPA');
    expect(parsed.fields.state?.normalized).toBe('CHIS.');
  });
});

describe('DOMICILIO positional parsing — fixture C SAN CRISTOBAL 28', () => {
  it('prioritizes line position over array order: domicilio is "C SAN CRISTOBAL 28" even when FRACC appears first in array', () => {
    // This layout puts FRACC BEFORE "C SAN..." in array order (non-y-sorted).
    // The parser MUST order lines by Y so the visually-first line is domicilio.
    const layout = twoColumnLayout([
      { text: 'DOMICILIO', y: 0.22, x1: 0.36, x2: 0.5 },
      { text: 'FRACC SAN MARCOS 30400', y: 0.26, x1: 0.37, x2: 0.62 },
      { text: 'C SAN CRISTOBAL 28', y: 0.24, x1: 0.37, x2: 0.6 },
      { text: 'CINTALAPA, CHIS.', y: 0.28, x1: 0.37, x2: 0.56 },
    ]);
    const parsed = parseIneDocument(layout);

    expect(parsed.fields.address?.normalized).toBe('C SAN CRISTOBAL 28');
    expect(parsed.fields.neighborhood?.normalized).toBe('FRACC SAN MARCOS');
    expect(parsed.fields.postalCode?.normalized).toBe('30400');
    expect(parsed.fields.municipality?.normalized).toBe('CINTALAPA');
    expect(parsed.fields.state?.normalized).toBe('CHIS.');
  });

  it('fixture DOMICILIO C SAN CRISTOBAL 28 — full block with the user JSON structure', () => {
    const layout = twoColumnLayout([
      { text: 'NOMBRE', y: 0.14, x1: 0.36, x2: 0.5 },
      { text: 'CRUZ', y: 0.16, x1: 0.37, x2: 0.45 },
      { text: 'HERNANDEZ', y: 0.18, x1: 0.37, x2: 0.52 },
      { text: 'ANTONIO DE JESUS', y: 0.2, x1: 0.37, x2: 0.62 },
      { text: 'DOMICILIO', y: 0.22, x1: 0.36, x2: 0.5 },
      { text: 'C SAN CRISTOBAL 28', y: 0.24, x1: 0.37, x2: 0.6 },
      { text: 'FRACC SAN MARCOS 30400', y: 0.26, x1: 0.37, x2: 0.62 },
      { text: 'CINTALAPA, CHIS.', y: 0.28, x1: 0.37, x2: 0.56 },
      { text: 'CLAVE DE ELECTOR CRHRAN95061307H700', y: 0.24, x1: 0.7, x2: 0.95 },
      { text: 'CURP CUHA950613HCSRRN06', y: 0.26, x1: 0.71, x2: 0.88 },
      { text: 'ESTADO 07', y: 0.28, x1: 0.71, x2: 0.8 },
      { text: 'FECHA DE NACIMIENTO', y: 0.299, x1: 0.764, x2: 0.932 },
      { text: '13/06/1995', y: 0.312, x1: 0.786, x2: 0.908 },
      { text: 'SEXO H', y: 0.33, x1: 0.76, x2: 0.86 },
    ]);
    const parsed = parseIneDocument(layout);
    const flat = flattenIneFields(parsed.fields);

    // The user-facing structure:
    //   domicilio  -> address
    //   colonia    -> neighborhood
    //   codigoPostal -> postalCode
    //   ciudad     -> municipality
    //   estado     -> state
    expect(flat.address).toBe('C SAN CRISTOBAL 28');
    expect(flat.neighborhood).toBe('FRACC SAN MARCOS');
    expect(flat.postalCode).toBe('30400');
    expect(flat.municipality).toBe('CINTALAPA');
    expect(flat.state).toBe('CHIS.');
    // No other fields changed behavior:
    expect(flat.firstName).toBe('ANTONIO DE JESUS');
    expect(flat.paternalLastName).toBe('CRUZ');
    expect(flat.maternalLastName).toBe('HERNANDEZ');
    expect(flat.voterKey).toBe('CRHRAN95061307H700');
    expect(flat.curp).toBe('CUHA950613HCSRRN06');
    expect(flat.birthDate).toBe('13/06/1995');
    expect(flat.sex).toBe('H');
  });

  it('handles DOMICILIO label on far-left margin with no X overlap to address lines', () => {
    // The DOMICILIO label is at x=0.06-0.21 (far-left margin), while the
    // address lines are at x=0.37-0.62 (body). No X overlap — but the lines
    // below the anchor are still the DOMICILIO block. The parser must use ALL
    // left-of-midpoint lines below the anchor and decompose by line position.
    const layout = twoColumnLayout([
      { text: 'DOMICILIO', y: 0.22, x1: 0.06, x2: 0.21 },
      { text: 'C SAN CRISTOBAL 28', y: 0.24, x1: 0.37, x2: 0.6 },
      { text: 'FRACC SAN MARCOS 30400', y: 0.26, x1: 0.37, x2: 0.62 },
      { text: 'CINTALAPA, CHIS.', y: 0.28, x1: 0.37, x2: 0.56 },
    ]);
    const parsed = parseIneDocument(layout);
    const flat = flattenIneFields(parsed.fields);

    expect(flat.address).toBe('C SAN CRISTOBAL 28');
    expect(flat.neighborhood).toBe('FRACC SAN MARCOS');
    expect(flat.postalCode).toBe('30400');
    expect(flat.municipality).toBe('CINTALAPA');
    expect(flat.state).toBe('CHIS.');
  });
});

describe('cross-field validation', () => {
  it('flags municipality that swallowed SECCION', () => {
    // Construct a layout where the assigner would (mistakenly) put the section
    // into the municipality token range — simulate by giving MUNICIPIO's value
    // tokens that include the SECCION label + number.
    const layout: OcrTextLayout = {
      text: 'MUNICIPIO CINTALAPA SECCION 0042',
      pages: [
        {
          pageNumber: 1,
          text: 'MUNICIPIO CINTALAPA SECCION 0042',
          lines: [
            {
              text: 'MUNICIPIO CINTALAPA SECCION 0042',
              segment: { start: 0, end: 32 },
              box: { min: { x: 0.4, y: 0.3 }, max: { x: 0.7, y: 0.31 } },
              tokens: [
                {
                  text: 'MUNICIPIO',
                  segment: { start: 0, end: 9 },
                  box: { min: { x: 0.4, y: 0.3 }, max: { x: 0.45, y: 0.31 } },
                },
                // Force the value tokens to include "SECCION 0042" — if the
                // assigner did NOT split on the SECCION label, this simulates
                // the old bug where municipality swallowed it.
                {
                  text: 'CINTALAPA SECCION 0042',
                  segment: { start: 10, end: 32 },
                  box: { min: { x: 0.46, y: 0.3 }, max: { x: 0.7, y: 0.31 } },
                },
              ],
            },
          ],
          tokens: [],
          width: 1,
          height: 1,
        },
      ],
    };
    const parsed = parseIneDocument(layout);
    // The single value token "CINTALAPA SECCION 0042" becomes the normalized
    // municipality value; the validator must flag it.
    expect(parsed.fields.municipality?.normalized).toContain('SECCION');
    expect(parsed.validationSummary.crossFieldIssues.some((i) => i.includes('municipality'))).toBe(
      true,
    );
  });

  it('flags CURP/paternal initial mismatch', () => {
    const layout: OcrTextLayout = {
      text: 'NOMBRE\nJUAN PEREZ GOMEZ\nCURP XXXX900101MCSPRN09',
      pages: [
        {
          pageNumber: 1,
          text: 'NOMBRE\nJUAN PEREZ GOMEZ\nCURP XXXX900101MCSPRN09',
          lines: [
            {
              text: 'NOMBRE',
              segment: { start: 0, end: 6 },
              box: { min: { x: 0.46, y: 0.2 }, max: { x: 0.56, y: 0.21 } },
              tokens: [
                {
                  text: 'NOMBRE',
                  segment: { start: 0, end: 6 },
                  box: { min: { x: 0.46, y: 0.2 }, max: { x: 0.56, y: 0.21 } },
                },
              ],
            },
            {
              text: 'JUAN PEREZ GOMEZ',
              segment: { start: 7, end: 23 },
              box: { min: { x: 0.47, y: 0.22 }, max: { x: 0.65, y: 0.23 } },
              tokens: [
                {
                  text: 'JUAN',
                  segment: { start: 7, end: 11 },
                  box: { min: { x: 0.47, y: 0.22 }, max: { x: 0.52, y: 0.23 } },
                },
                {
                  text: 'PEREZ',
                  segment: { start: 12, end: 17 },
                  box: { min: { x: 0.53, y: 0.22 }, max: { x: 0.58, y: 0.23 } },
                },
                {
                  text: 'GOMEZ',
                  segment: { start: 18, end: 23 },
                  box: { min: { x: 0.59, y: 0.22 }, max: { x: 0.65, y: 0.23 } },
                },
              ],
            },
            {
              text: 'CURP XXXX900101MCSPRN09',
              segment: { start: 24, end: 48 },
              box: { min: { x: 0.47, y: 0.24 }, max: { x: 0.7, y: 0.25 } },
              tokens: [
                {
                  text: 'CURP',
                  segment: { start: 24, end: 28 },
                  box: { min: { x: 0.47, y: 0.24 }, max: { x: 0.51, y: 0.25 } },
                },
                {
                  text: 'XXXX900101MCSPRN09',
                  segment: { start: 29, end: 48 },
                  box: { min: { x: 0.52, y: 0.24 }, max: { x: 0.7, y: 0.25 } },
                },
              ],
            },
          ],
          tokens: [],
          width: 1,
          height: 1,
        },
      ],
    };
    const parsed = parseIneDocument(layout);
    expect(parsed.validationSummary.crossFieldIssues.some((i) => i.includes('CURP'))).toBe(true);
  });
});

describe('Phase 4 INE parser regression matrix', () => {
  it('keeps compound names, visual birth date, and sex while extracting address and electoral details', () => {
    const layout = layoutFromLines([
      { text: 'NOMBRE' },
      { text: 'DE LA CRUZ' },
      { text: 'RIOS' },
      { text: 'MARIA DEL CARMEN' },
      { text: 'FECHA DE NACIMIENTO 31/12/1956' },
      { text: 'SEXO MUJER' },
      { text: 'DOMICILIO' },
      { text: 'AVENIDA PRUEBA NO. 101 CP 12345' },
      { text: 'COLONIA LABORATORIO' },
      { text: 'ESTADO EJEMPLO' },
      { text: 'MUNICIPIO DEMO SECCION 0042' },
      { text: 'LOCALIDAD DEMO' },
      { text: 'CLAVE DE ELECTOR SAMPLE12345678A123' },
      { text: 'NCURP GODE561231HDFRRN00' },
      { text: 'REGISTRO 2018' },
      { text: 'EMISION 2024' },
      { text: 'VIGENCIA 2030' },
      { text: 'CODIGO MUNICIPAL 999' },
      { text: 'ENTIDAD 09' },
    ]);
    const parsed = parseIneDocument(layout);

    expect(parsed.fields.fullName?.normalized).toBe('DE LA CRUZ RIOS MARIA DEL CARMEN');
    expect(parsed.fields.firstName?.normalized).toBe('MARIA DEL CARMEN');
    expect(parsed.fields.paternalLastName?.normalized).toBe('DE LA CRUZ');
    expect(parsed.fields.maternalLastName?.normalized).toBe('RIOS');
    expect(parsed.fields.birthDate?.normalized).toBe('31/12/1956');
    expect(parsed.fields.sex?.normalized).toBe('MUJER');
    expect(parsed.fields.address?.normalized).toBe('AVENIDA PRUEBA NO. 101 CP 12345');
    expect(parsed.fields.postalCode?.normalized).toBe('12345');
    expect(parsed.fields.neighborhood?.normalized).toBe('LABORATORIO');
    expect(parsed.fields.municipality?.normalized).toBe('DEMO');
    expect(parsed.fields.state?.normalized).toBe('EJEMPLO');
    expect(parsed.fields.locality?.normalized).toBe('DEMO');
    expect(parsed.fields.details).toMatchObject({
      street: { normalized: 'AVENIDA PRUEBA' },
      exteriorNumber: { normalized: '101' },
      municipalityCode: { normalized: '999' },
      stateCode: { normalized: '09' },
      emissionYear: { normalized: '2024' },
    });
    expect(flattenIneFields(parsed.fields)).toMatchObject({
      voterKey: 'SAMPLE12345678A123',
      curp: 'GODE561231HDFRRN00',
      electoralSection: '0042',
      registrationYear: '2018',
      validUntil: '2030',
    });
  });

  it('tolerates OCR aliases, split whitespace, and concatenated labels without dropping field extraction', () => {
    const parsed = parseIneDocument(
      layoutFromLines([
        { text: 'NCURP   GODE561231HDFRRN00' },
        { text: 'SECCION\n0042' },
        { text: 'ANO  2018' },
        { text: 'VIGENCIA2030' },
      ]),
    );

    expect(parsed.fields.curp?.normalized).toBe('GODE561231HDFRRN00');
    expect(parsed.fields.electoralSection?.normalized).toBe('0042');
    expect(parsed.fields.registrationYear?.normalized).toBe('2018');
    expect(parsed.fields.validUntil?.normalized).toBe('2030');
  });

  it.each([
    ['GODE561231HDFRRN00', 'HOMBRE', 'valid', 'CURP_CHECK_DIGIT_VALID'],
    ['GODE561332HDFRRN00', 'HOMBRE', 'invalid', 'CURP_DATE_INVALID'],
    ['GODE561231MDFRRN00', 'HOMBRE', 'warning', 'CURP_SEX_MISMATCH'],
    ['GODE561231HDFRRN01', 'HOMBRE', 'invalid', 'CURP_CHECK_DIGIT_INVALID'],
  ])('retains CURP %s when validation is %s', (curp, sex, state, code) => {
    const parsed = parseIneDocument(
      layoutFromLines([{ text: `CURP ${curp}` }, { text: `SEXO ${sex}` }]),
    );

    expect(parsed.fields.curp?.normalized).toBe(curp);
    expect(parsed.fields.curp?.validation).toMatchObject({
      state,
      codes: expect.arrayContaining([code]),
    });
  });

  it.each([
    ['without MRZ', undefined, { detected: false, nameTruncated: false }],
    [
      'with corroborating MRZ',
      'IDMEXGODE561231HDFRRN00ABCDEF',
      { detected: true, nameTruncated: false, curpMatches: true },
    ],
    [
      'with truncated MRZ name',
      'IDMEX<<GODE561231HDFRRN00<',
      { detected: true, nameTruncated: true, curpMatches: true },
    ],
  ])('treats %s as corroborative evidence only', (_scenario, mrz, expected) => {
    const parsed = parseIneDocument(
      layoutFromLines([{ text: 'CURP GODE561231HDFRRN00' }, ...(mrz ? [{ text: mrz }] : [])]),
    );

    expect(parsed.fields.curp?.normalized).toBe('GODE561231HDFRRN00');
    expect(parsed.fields.mrz).toMatchObject(expected);
    if (mrz) expect(parsed.fields.mrz?.codes).toContain('MRZ_CORROBORATION_ONLY');
  });

  it('uses length-weighted token confidence and falls back to line confidence', () => {
    const weighted = parseIneDocument(
      layoutFromLines([{ text: 'COLONIA ALFA BETA', tokenConfidences: [0.99, 0.4, 0.8] }]),
    );
    const lineFallback = parseIneDocument(
      layoutFromLines([{ text: 'COLONIA LABORATORIO', lineConfidence: 0.61 }]),
    );

    expect(weighted.fields.neighborhood?.confidence).toBeCloseTo((0.4 * 4 + 0.8 * 4) / 8);
    expect(weighted.fields.neighborhood?.confidenceReasons).toContain('TOKEN_LENGTH_WEIGHTED');
    expect(lineFallback.fields.neighborhood?.confidence).toBe(0.61);
    expect(lineFallback.fields.neighborhood?.confidenceReasons).toContain(
      'LINE_CONFIDENCE_FALLBACK',
    );
  });

  it('normalizes absolute coordinates with dimensions and falls back safely without dimensions', () => {
    const normalized = layoutFromLines([{ text: 'MUNICIPIO DEMO SECCION 0042' }]);
    const absoluteWithDimensions: OcrTextLayout = {
      ...normalized,
      pages: normalized.pages.map((page) => ({
        ...page,
        width: 1000,
        height: 1500,
        lines: page.lines.map((line) => ({
          ...line,
          box: line.box && {
            min: { x: line.box.min.x * 1000, y: line.box.min.y * 1500 },
            max: { x: line.box.max.x * 1000, y: line.box.max.y * 1500 },
          },
          tokens: line.tokens.map((token) => ({
            ...token,
            box: token.box && {
              min: { x: token.box.min.x * 1000, y: token.box.min.y * 1500 },
              max: { x: token.box.max.x * 1000, y: token.box.max.y * 1500 },
            },
          })),
        })),
      })),
    };
    const absoluteWithoutDimensions: OcrTextLayout = {
      ...absoluteWithDimensions,
      pages: absoluteWithDimensions.pages.map(
        ({ width: _width, height: _height, ...page }) => page,
      ),
    };

    const scaled = parseIneDocument(absoluteWithDimensions);
    const unscaled = parseIneDocument(absoluteWithoutDimensions);

    expect(scaled.fields.electoralSection).toMatchObject({
      normalized: '0042',
      box: { min: { x: expect.any(Number) } },
    });
    expect(scaled.fields.electoralSection?.box?.max.x).toBeLessThanOrEqual(1);
    expect(unscaled.fields.municipality?.normalized).toBe('DEMO');
    expect(unscaled.fields.electoralSection?.normalized).toBe('0042');
    expect(unscaled.fields.electoralSection?.box).toBeUndefined();
  });
});
