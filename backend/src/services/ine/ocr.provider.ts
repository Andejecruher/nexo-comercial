/**
 * Spatial OCR layout types.
 *
 * The original provider returned only `text` and a flat per-page `text`. To
 * correct INE field separation (colonia/municipio/seccion and
 * nombre/apellidos) we preserve the spatial structure that Document AI already
 * returns: every line and token carries a `boundingBox` (normalized vertices)
 * and a `segment` (start/end offsets into `document.text`). This is enough to
 * separate fields geometrically WITHOUT changing the Document AI processor.
 *
 * The shape stays backward compatible: `text` and `pages[].text` are still
 * present for any consumer that only needs the flattened text.
 */

export type BoundingBox = {
  min: { x: number; y: number };
  max: { x: number; y: number };
};

export type OcrSegment = { start: number; end: number };

export type OcrToken = {
  text: string;
  /** First anchor segment, retained for consumers that predate discontinuous anchors. */
  segment?: OcrSegment;
  /** All Document AI text-anchor segments, including discontinuous anchors. */
  segments?: OcrSegment[];
  box?: BoundingBox;
  confidence?: number;
};

export type OcrLine = {
  text: string;
  /** First anchor segment, retained for consumers that predate discontinuous anchors. */
  segment?: OcrSegment;
  /** All Document AI text-anchor segments, including discontinuous anchors. */
  segments?: OcrSegment[];
  box?: BoundingBox;
  confidence?: number;
  tokens: OcrToken[];
};

export type OcrPage = {
  pageNumber: number;
  /** Flat page text (from page.layout.textAnchor.content). Kept for compatibility. */
  text: string;
  /** Spatial lines of this page. Empty for providers that don't expose them. */
  lines: OcrLine[];
  /** Flat token list for this page (same token objects referenced by lines). */
  tokens: OcrToken[];
  width?: number;
  height?: number;
};

export type OcrTextLayout = {
  text: string;
  pages: OcrPage[];
};

export type OcrEvidence = {
  confidence?: number;
  confidenceCount: number;
  pageCount: number;
};

export type OcrProviderResult = {
  document: OcrTextLayout;
  rawResult: unknown;
  evidence: OcrEvidence;
  processorVersion?: string;
};

export interface OcrProvider {
  /** Validate static provider configuration before loading the source file. */
  assertReady?(): void | Promise<void>;
  process(input: { mimeType: string; contents: Buffer }): Promise<OcrProviderResult>;
}
