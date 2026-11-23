import type {
  BoundingBox,
  OcrLine,
  OcrPage,
  OcrTextLayout,
  OcrToken,
} from '../../services/ine/ocr.provider';

/**
 * Anonymized spatial INE fixtures that replicate the REAL topology found in
 * the persisted Document AI raw response (extraction 9239fe11), but with
 * invented values. No real PII. These exercise the same geometry the parser
 * must handle:
 *
 *  - NOMBRE label alone on its line; value on the lines BELOW (Y-below regime).
 *  - DOMICILIO label alone; value on the lines below.
 *  - MUNICIPIO + SECCIÓN on the SAME visual line (X-split regime).
 *  - LOCALIDAD on the next line below municipio/seccion.
 *  - ESTADO on its own line.
 *  - CLAVE DE ELECTOR inline.
 *
 * Boxes use normalized vertices (0..1). Offsets are indices into `documentText`.
 */

function box(x1: number, y1: number, x2: number, y2: number): BoundingBox {
  return { min: { x: x1, y: y1 }, max: { x: x2, y: y2 } };
}

/**
 * Build a page from a list of lines, where each line is defined by its tokens.
 * `documentText` is constructed by joining line texts with '\n'; token segments
 * are computed from cumulative offsets so they stay consistent.
 */
function buildLayout(
  lineSpecs: Array<{
    text: string;
    y: number;
    /** Token specs: [text, x1, x2, confidence?] relative to the line text. */
    tokens: Array<[string, number, number, number?]>;
  }>,
): OcrTextLayout {
  const documentText = lineSpecs.map((l) => l.text).join('\n') + '\n';
  let cursor = 0;
  const lines: OcrLine[] = [];
  for (const spec of lineSpecs) {
    const lineStart = cursor;
    const lineEnd = lineStart + spec.text.length;
    const tokens: OcrTok[] = [];
    let tokCursor = 0;
    for (const [tokText, x1, x2, conf] of spec.tokens) {
      const tokStart = lineStart + tokCursor;
      const tokEnd = tokStart + tokText.length;
      tokCursor += tokText.length + 1; // +1 for the space separator (heuristic)
      tokens.push({
        text: tokText,
        segment: { start: tokStart, end: tokEnd },
        box: box(x1, spec.y, x2, spec.y + 0.01),
        ...(conf !== undefined ? { confidence: conf } : {}),
      });
    }
    lines.push({
      text: spec.text,
      segment: { start: lineStart, end: lineEnd },
      box: box(0.4, spec.y, 0.75, spec.y + 0.01),
      tokens,
    });
    cursor = lineEnd + 1; // +1 for '\n'
  }
  const allTokens: OcrToken[] = [];
  for (const l of lines) for (const tok of l.tokens) allTokens.push(tok as OcrToken);
  const pages: OcrPage[] = [
    { pageNumber: 1, text: documentText, lines, tokens: allTokens, width: 1, height: 1 },
  ];
  return { text: documentText, pages };
}

type OcrTok = OcrToken;

/**
 * Fixture: front of an INE modeled on the REAL document topology. The NOMBRE
 * block follows the canonical INE vertical order: apellido paterno / apellido
 * materno / nombres — each on its own line. Values invented (no PII).
 */
export function frontFixture(): OcrTextLayout {
  return buildLayout([
    {
      text: 'INSTITUTO FEDERAL ELECTORAL',
      y: 0.15,
      tokens: [
        ['INSTITUTO', 0.35, 0.37],
        ['FEDERAL', 0.37, 0.4],
        ['ELECTORAL', 0.4, 0.46],
      ],
    },
    { text: 'NOMBRE', y: 0.18, tokens: [['NOMBRE', 0.46, 0.56]] },
    { text: 'LOPEZ', y: 0.2, tokens: [['LOPEZ', 0.47, 0.55]] },
    { text: 'GARCIA', y: 0.22, tokens: [['GARCIA', 0.47, 0.55]] },
    {
      text: 'ANA MARIA',
      y: 0.24,
      tokens: [
        ['ANA', 0.47, 0.52],
        ['MARIA', 0.53, 0.6],
      ],
    },
    { text: 'DOMICILIO', y: 0.26, tokens: [['DOMICILIO', 0.47, 0.51]] },
    {
      text: 'CALLE 5 DE MAYO 12',
      y: 0.28,
      tokens: [
        ['CALLE', 0.47, 0.55],
        ['5', 0.56, 0.58],
        ['DE', 0.59, 0.61],
        ['MAYO', 0.62, 0.68],
        ['12', 0.69, 0.72],
      ],
    },
    {
      text: 'COLONIA CENTRO',
      y: 0.3,
      tokens: [
        ['COLONIA', 0.47, 0.52],
        ['CENTRO', 0.53, 0.6],
      ],
    },
    {
      text: 'CLAVE DE ELECTOR ABCDEF123456EFG789',
      y: 0.32,
      tokens: [
        ['CLAVE', 0.47, 0.52],
        ['DE', 0.53, 0.55],
        ['ELECTOR', 0.56, 0.62],
        ['ABCDEF123456EFG789', 0.63, 0.72],
      ],
    },
    {
      text: 'ESTADO CHIAPAS',
      y: 0.34,
      tokens: [
        ['ESTADO', 0.47, 0.52],
        ['CHIAPAS', 0.53, 0.6],
      ],
    },
    // THE critical line: MUNICIPIO + SECCION on the same visual line.
    {
      text: 'MUNICIPIO CINTALAPA SECCION 0042',
      y: 0.36,
      tokens: [
        ['MUNICIPIO', 0.4, 0.46],
        ['CINTALAPA', 0.47, 0.55],
        ['SECCION', 0.6, 0.66],
        ['0042', 0.67, 0.71],
      ],
    },
    {
      text: 'LOCALIDAD CINTALAPA',
      y: 0.38,
      tokens: [
        ['LOCALIDAD', 0.4, 0.46],
        ['CINTALAPA', 0.47, 0.55],
      ],
    },
    {
      text: 'CURP LGAA900101MCSPRN09',
      y: 0.4,
      tokens: [
        ['CURP', 0.47, 0.51],
        ['LGAA900101MCSPRN09', 0.52, 0.62],
      ],
    },
    {
      text: 'VIGENCIA 2030',
      y: 0.42,
      tokens: [
        ['VIGENCIA', 0.47, 0.51],
        ['2030', 0.52, 0.55],
      ],
    },
  ]);
}
