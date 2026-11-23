import type { DocumentTextExtractor } from '../contracts';

export const NATIVE_DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'text/plain',
] as const;

export class NativeDocumentTextStub implements DocumentTextExtractor {
  readonly id = 'native-stub';
  readonly supportedMimeTypes = NATIVE_DOCUMENT_MIME_TYPES;

  extractNativeText(
    _input: Parameters<DocumentTextExtractor['extractNativeText']>[0],
  ): Promise<null> {
    // TODO: Wire real native extraction with an approved library such as
    // pdf-parse/mammoth. No dependency is added here; this is a manual integration point.
    return Promise.resolve(null);
  }
}
