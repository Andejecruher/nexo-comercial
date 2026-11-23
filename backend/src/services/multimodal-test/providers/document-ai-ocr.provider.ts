import { GoogleDocumentAiOcrProvider } from '../../ine/google-document-ai-ocr.provider';
import { GoogleConfigurationError } from '../../ine/google-auth';
import type { OcrProvider as SharedOcrProvider } from '../../ine/ocr.provider';
import type { OcrProvider, OcrProviderOutput } from '../contracts';
import { StageError } from '../pipeline-runner';

export const DOCUMENT_AI_OCR_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'application/pdf',
] as const;

/** Adapts the shared Document AI implementation without duplicating Google API logic. */
export class DocumentAiOcrProvider implements OcrProvider {
  readonly id = 'document-ai';
  readonly supportedMimeTypes = DOCUMENT_AI_OCR_MIME_TYPES;
  private provider?: SharedOcrProvider;

  constructor(
    private readonly createProvider: () => SharedOcrProvider = () => new GoogleDocumentAiOcrProvider(),
  ) {}

  async extractText(input: Parameters<OcrProvider['extractText']>[0]): Promise<OcrProviderOutput> {
    const startedAt = Date.now();
    try {
      // Credentials and processor configuration are checked only when OCR is requested.
      this.provider ??= this.createProvider();
      const output = await this.provider.process({ mimeType: input.mimeType, contents: input.buffer });
      return {
        text: output.document.text,
        providerId: this.id,
        durationMs: Date.now() - startedAt,
        pages: output.evidence.pageCount,
        confidence: output.evidence.confidence,
        raw: output.rawResult,
      };
    } catch (error) {
      if (error instanceof GoogleConfigurationError) {
        throw new StageError(
          'El proveedor OCR no está configurado o habilitado',
          'ocr',
          'OCR_PROVIDER_UNAVAILABLE',
          { statusCode: 503, provider: this.id },
        );
      }
      throw error;
    }
  }
}
