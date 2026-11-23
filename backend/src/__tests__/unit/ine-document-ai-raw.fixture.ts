/**
 * Synthetic, anonymized Document AI response used to exercise provider ->
 * layout -> parser without Google access. Segments index `document.text` and
 * every line/token has a Document AI-style text anchor, box, and confidence.
 * Lines and tokens are siblings on the page, as returned by Document AI.
 */
type RawToken = [text: string, x1: number, x2: number, confidence: number];

type RawLine = {
  text: string;
  y: number;
  confidence: number;
  tokens: RawToken[];
};

const lines: RawLine[] = [
  { text: 'NOMBRE', y: 0.12, confidence: 0.99, tokens: [['NOMBRE', 0.42, 0.5, 0.99]] },
  { text: 'EDUARDO', y: 0.14, confidence: 0.98, tokens: [['EDUARDO', 0.42, 0.5, 0.98]] },
  {
    text: 'GOMEZ DEL RIO',
    y: 0.16,
    confidence: 0.97,
    tokens: [
      ['GOMEZ', 0.42, 0.48, 0.97],
      ['DEL', 0.49, 0.52, 0.96],
      ['RIO', 0.53, 0.57, 0.95],
    ],
  },
  {
    text: 'FECHA DE NACIMIENTO 31/12/1956',
    y: 0.18,
    confidence: 0.95,
    tokens: [
      ['FECHA', 0.42, 0.46, 0.96],
      ['DE', 0.47, 0.49, 0.96],
      ['NACIMIENTO', 0.5, 0.59, 0.95],
      ['31/12/1956', 0.6, 0.68, 0.93],
    ],
  },
  {
    text: 'SEXO HOMBRE',
    y: 0.2,
    confidence: 0.94,
    tokens: [
      ['SEXO', 0.42, 0.46, 0.95],
      ['HOMBRE', 0.47, 0.53, 0.93],
    ],
  },
  { text: 'DOMICILIO', y: 0.24, confidence: 0.99, tokens: [['DOMICILIO', 0.42, 0.5, 0.99]] },
  {
    text: 'AVENIDA PRUEBA NO. 101 CP 12345',
    y: 0.26,
    confidence: 0.9,
    tokens: [
      ['AVENIDA', 0.42, 0.49, 0.92],
      ['PRUEBA', 0.5, 0.56, 0.9],
      ['NO.', 0.57, 0.6, 0.88],
      ['101', 0.61, 0.64, 0.86],
      ['CP', 0.65, 0.67, 0.87],
      ['12345', 0.68, 0.73, 0.91],
    ],
  },
  {
    text: 'COLONIA LABORATORIO',
    y: 0.28,
    confidence: 0.92,
    tokens: [
      ['COLONIA', 0.42, 0.49, 0.93],
      ['LABORATORIO', 0.5, 0.61, 0.91],
    ],
  },
  {
    text: 'ESTADO EJEMPLO',
    y: 0.3,
    confidence: 0.94,
    tokens: [
      ['ESTADO', 0.42, 0.48, 0.95],
      ['EJEMPLO', 0.49, 0.56, 0.93],
    ],
  },
  {
    text: 'MUNICIPIO DEMO SECCION 0042',
    y: 0.32,
    confidence: 0.94,
    tokens: [
      ['MUNICIPIO', 0.35, 0.43, 0.95],
      ['DEMO', 0.44, 0.49, 0.93],
      ['SECCION', 0.54, 0.61, 0.93],
      ['0042', 0.62, 0.66, 0.94],
    ],
  },
  {
    text: 'LOCALIDAD DEMO',
    y: 0.34,
    confidence: 0.95,
    tokens: [
      ['LOCALIDAD', 0.35, 0.43, 0.96],
      ['DEMO', 0.44, 0.49, 0.94],
    ],
  },
  {
    text: 'CLAVE DE ELECTOR SAMPLE12345678A123',
    y: 0.36,
    confidence: 0.95,
    tokens: [
      ['CLAVE', 0.42, 0.47, 0.96],
      ['DE', 0.48, 0.5, 0.96],
      ['ELECTOR', 0.51, 0.58, 0.95],
      ['SAMPLE12345678A123', 0.59, 0.76, 0.92],
    ],
  },
  {
    text: 'NCURP GODE561231HDFRRN09',
    y: 0.38,
    confidence: 0.96,
    tokens: [
      ['NCURP', 0.42, 0.47, 0.96],
      ['GODE561231HDFRRN09', 0.48, 0.66, 0.96],
    ],
  },
  {
    text: 'REGISTRO 2018',
    y: 0.4,
    confidence: 0.96,
    tokens: [
      ['REGISTRO', 0.42, 0.5, 0.96],
      ['2018', 0.51, 0.55, 0.96],
    ],
  },
  {
    text: 'EMISION 2024',
    y: 0.42,
    confidence: 0.96,
    tokens: [
      ['EMISION', 0.42, 0.49, 0.96],
      ['2024', 0.5, 0.54, 0.96],
    ],
  },
  {
    text: 'VIGENCIA 2030',
    y: 0.44,
    confidence: 0.96,
    tokens: [
      ['VIGENCIA', 0.42, 0.5, 0.96],
      ['2030', 0.51, 0.55, 0.96],
    ],
  },
  {
    text: 'CODIGO MUNICIPAL 999',
    y: 0.46,
    confidence: 0.95,
    tokens: [
      ['CODIGO', 0.42, 0.49, 0.95],
      ['MUNICIPAL', 0.5, 0.59, 0.95],
      ['999', 0.6, 0.63, 0.95],
    ],
  },
  {
    text: 'ENTIDAD 09',
    y: 0.48,
    confidence: 0.95,
    tokens: [
      ['ENTIDAD', 0.42, 0.49, 0.95],
      ['09', 0.5, 0.52, 0.95],
    ],
  },
];

function vertices(x1: number, y1: number, x2: number, y2: number) {
  return [
    { x: x1, y: y1 },
    { x: x2, y: y1 },
    { x: x2, y: y2 },
    { x: x1, y: y2 },
  ];
}

function layout(
  startIndex: number,
  endIndex: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  confidence: number,
  segments: Array<[startIndex: number, endIndex: number]> = [[startIndex, endIndex]],
) {
  return {
    textAnchor: {
      textSegments: segments.map(([start, end]) => ({
        startIndex: String(start),
        endIndex: String(end),
      })),
    },
    boundingPoly: { vertices: vertices(x1 * 1000, y1 * 1500, x2 * 1000, y2 * 1500) },
    confidence,
  };
}

function buildRawDocumentAiResponse() {
  const text = `${lines.map((line) => line.text).join('\n')}\n`;
  let cursor = 0;
  const rawTokens: Array<{ layout: ReturnType<typeof layout> }> = [];
  const rawLines = lines.map((line, lineIndex) => {
    const lineStart = cursor;
    const lineEnd = lineStart + line.text.length;
    let tokenOffset = 0;
    const tokens = line.tokens.map(([tokenText, x1, x2, confidence], tokenIndex) => {
      const startIndex = lineStart + tokenOffset;
      tokenOffset += tokenText.length + 1;
      const endIndex = startIndex + tokenText.length;
      return {
        layout: layout(
          startIndex,
          endIndex,
          x1,
          line.y,
          x2,
          line.y + 0.012,
          confidence,
          lineIndex === 1 && tokenIndex === 0
            ? [
                [startIndex, startIndex + 3],
                [startIndex + 3, endIndex],
              ]
            : undefined,
        ),
      };
    });
    rawTokens.push(...tokens);
    cursor = lineEnd + 1;
    return {
      layout: layout(lineStart, lineEnd, 0.35, line.y, 0.76, line.y + 0.012, line.confidence),
    };
  });
  // This token occupies only the newline between lines and must not associate
  // with either adjacent half-open line anchor.
  rawTokens.push({ layout: layout(6, 7, 0.1, 0.1, 0.11, 0.112, 0.5) });

  return {
    document: {
      text,
      pages: [
        {
          layout: {
            textAnchor: {
              content: text,
              textSegments: [{ startIndex: '0', endIndex: String(text.length) }],
            },
          },
          lines: rawLines,
          tokens: rawTokens,
          dimension: { width: 1000, height: 1500 },
        },
      ],
    },
  };
}

export const syntheticDocumentAiRawFixture = buildRawDocumentAiResponse();
