import { env } from '../../config/env.config';
import {
  createDocumentAiAuth,
  documentAiAuthorization,
  GoogleConfigurationError,
  GoogleProviderError,
  type DocumentAiAuth,
} from './google-auth';
import type {
  BoundingBox,
  OcrEvidence,
  OcrLine,
  OcrPage,
  OcrProvider,
  OcrProviderResult,
  OcrSegment,
  OcrToken,
} from './ocr.provider';

export class GoogleDocumentAiOcrProvider implements OcrProvider {
  constructor(private readonly auth: DocumentAiAuth = createDocumentAiAuth()) {}

  assertReady(): void {
    this.configuration();
  }

  private configuration(): { projectId: string; location: string; processorId: string } {
    const projectId = env.GOOGLE_CLOUD_PROJECT_ID;
    const location = env.DOCUMENT_AI_LOCATION;
    const processorId = env.DOCUMENT_AI_PROCESSOR_ID;
    if (!projectId || !location || !processorId) {
      throw new GoogleConfigurationError('DOCUMENT_AI_CONFIGURATION_MISSING');
    }
    return { projectId, location, processorId };
  }

  async process(input: { mimeType: string; contents: Buffer }): Promise<OcrProviderResult> {
    const { projectId, location, processorId } = this.configuration();
    const endpoint = `https://${location}-documentai.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/locations/${encodeURIComponent(location)}/processors/${encodeURIComponent(processorId)}:process`;
    const authorization = await documentAiAuthorization(this.auth);
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { ...authorization, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rawDocument: { mimeType: input.mimeType, content: input.contents.toString('base64') },
      }),
    });
    if (!response.ok) {
      // Surface Google's error reason without ever logging the access token,
      // the Authorization header, or any credential material. The captured
      // detail is attached to the thrown error for diagnostics; it is the gapi
      // error message / status, never the bearer credential.
      throw new GoogleProviderError(
        `DOCUMENT_AI_${response.status}`,
        response.status >= 500 || response.status === 429,
        await documentAiErrorDetail(response),
      );
    }
    const rawResult: unknown = await response.json();
    const document = getRecord(getRecord(rawResult)?.document);
    const documentText = getString(document, 'text') ?? '';
    const pageRows = getArray(document?.pages);
    const pages: OcrPage[] = pageRows.map((page, index) => mapPage(page, index + 1, documentText));
    return {
      document: { text: documentText, pages },
      rawResult,
      evidence: confidenceSummary(document, pages.length),
    };
  }
}

function mapPage(page: unknown, pageNumber: number, documentText: string): OcrPage {
  const pageRecord = getRecord(page);
  const layout = getRecord(pageRecord?.layout);
  const textAnchor = getRecord(layout?.textAnchor);
  const pageText = getString(textAnchor, 'content') ?? '';
  const dim = getRecord(pageRecord?.dimension);
  const width = getNumber(dim, 'width');
  const height = getNumber(dim, 'height');
  const lineRows = getArray(pageRecord?.lines);
  const legacyLines = lineRows.map((line) => mapLine(line, documentText));
  const pageTokens = getArray(pageRecord?.tokens).map((token) => mapToken(token, documentText));
  // Document AI exposes lines and tokens as sibling arrays. Keep the page token
  // objects canonical so lines and page.tokens do not contain duplicate mappings.
  const tokens = pageTokens.length ? pageTokens : legacyLines.flatMap((line) => line.tokens);
  const lines = pageTokens.length
    ? legacyLines.map((line) => ({
        ...line,
        tokens: pageTokens.filter((token) => anchorsOverlap(line, token)),
      }))
    : legacyLines;
  return { pageNumber, text: pageText, lines, tokens, width, height };
}

function mapLine(line: unknown, documentText: string): OcrLine {
  const lineRecord = getRecord(line);
  const layout = getRecord(lineRecord?.layout);
  const anchor = anchorOf(layout);
  const box = boxOf(layout);
  const confidence = getNumber(layout, 'confidence');
  const text = textFromSegments(documentText, anchor.segments);
  const tokenRows = getArray(lineRecord?.tokens);
  const tokens: OcrToken[] = tokenRows.map((token) => mapToken(token, documentText));
  return { text, ...anchor, box, confidence, tokens };
}

function mapToken(token: unknown, documentText: string): OcrToken {
  const tokenRecord = getRecord(token);
  const layout = getRecord(tokenRecord?.layout);
  const anchor = anchorOf(layout);
  const box = boxOf(layout);
  const confidence = getNumber(layout, 'confidence');
  const text = textFromSegments(documentText, anchor.segments);
  return { text, ...anchor, box, confidence };
}

function anchorOf(layout: Record<string, unknown> | undefined): {
  segment?: OcrSegment;
  segments?: OcrSegment[];
} {
  const textAnchor = getRecord(layout?.textAnchor);
  const segments = getArray(textAnchor?.textSegments)
    .map((value) => {
      const segment = getRecord(value);
      const start = getNumber(segment, 'startIndex') ?? 0;
      const end = getNumber(segment, 'endIndex') ?? start;
      return end >= start ? { start, end } : undefined;
    })
    .filter((segment): segment is OcrSegment => !!segment);
  return segments.length ? { segment: segments[0], segments } : {};
}

function textFromSegments(documentText: string, segments: OcrSegment[] | undefined): string {
  return segments?.map((segment) => documentText.slice(segment.start, segment.end)).join('') ?? '';
}

function anchorsOverlap(
  line: Pick<OcrLine, 'segment' | 'segments'>,
  token: Pick<OcrToken, 'segment' | 'segments'>,
): boolean {
  const lineSegments = line.segments ?? (line.segment ? [line.segment] : []);
  const tokenSegments = token.segments ?? (token.segment ? [token.segment] : []);
  return lineSegments.some((a) => tokenSegments.some((b) => a.start < b.end && b.start < a.end));
}

function boxOf(layout: Record<string, unknown> | undefined): BoundingBox | undefined {
  const boundingPoly = getRecord(layout?.boundingPoly);
  // Prefer normalized vertices (0..1). Fall back to absolute vertices, which
  // require page width/height to interpret. Normalized vertices are preferred
  // because downstream multimodal pipelines compare relative positions.
  const verts = getArray(boundingPoly?.normalizedVertices).length
    ? getArray(boundingPoly?.normalizedVertices)
    : getArray(boundingPoly?.vertices);
  if (!verts.length) return undefined;
  const points = verts.map((v) => {
    const r = getRecord(v) ?? {};
    return { x: getNumber(r, 'x') ?? 0, y: getNumber(r, 'y') ?? 0 };
  });
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return {
    min: { x: Math.min(...xs), y: Math.min(...ys) },
    max: { x: Math.max(...xs), y: Math.max(...ys) },
  };
}

async function documentAiErrorDetail(response: Response): Promise<string | undefined> {
  try {
    const body = (await response.clone().json()) as {
      error?: { message?: string; status?: string };
    };
    const parts = [
      `status=${response.status}`,
      body?.error?.status ? body.error.status : '',
      body?.error?.message ? body.error.message : '',
    ].filter(Boolean);
    return parts.length ? parts.join(' | ') : undefined;
  } catch {
    return undefined;
  }
}

function getRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function getArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function getString(record: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = record?.[key];
  return typeof value === 'string' ? value : undefined;
}

function getNumber(record: Record<string, unknown> | undefined, key: string): number | undefined {
  const value = record?.[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && /^\d+(\.\d+)?$/.test(value)) return Number(value);
  return undefined;
}

function confidenceSummary(
  document: Record<string, unknown> | undefined,
  pageCount: number,
): OcrEvidence {
  const confidences: number[] = [];
  const collect = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(collect);
      return;
    }
    const record = getRecord(value);
    if (!record) return;
    const confidence = record.confidence;
    if (
      typeof confidence === 'number' &&
      Number.isFinite(confidence) &&
      confidence >= 0 &&
      confidence <= 1
    ) {
      confidences.push(confidence);
    }
    Object.values(record).forEach(collect);
  };
  collect(document);
  return {
    ...(confidences.length
      ? { confidence: confidences.reduce((sum, value) => sum + value, 0) / confidences.length }
      : {}),
    confidenceCount: confidences.length,
    pageCount,
  };
}
