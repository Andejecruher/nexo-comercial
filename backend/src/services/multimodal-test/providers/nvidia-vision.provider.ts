import { NvidiaService } from '../../../ai/services/nvidia.service';
import type { ImageAnalysisOutput, ImageAnalysisProvider } from '../contracts';

/** Reuses the production service's validation, request construction and cancellation. */
export class NvidiaVisionProvider implements ImageAnalysisProvider {
  readonly id = 'nvidia-vision';
  readonly supportedMimeTypes = ['image/jpeg', 'image/png'] as const;

  constructor(private readonly service: Pick<NvidiaService, 'analyzeImage'> = new NvidiaService()) {}

  async analyze(input: Parameters<ImageAnalysisProvider['analyze']>[0]): Promise<ImageAnalysisOutput> {
    const startedAt = Date.now();
    const description = await this.service.analyzeImage({
      bytes: input.buffer,
      mimeType: input.mimeType,
      correlationId: input.correlationId,
      abortSignal: input.abortSignal,
    });
    return {
      description,
      labels: this.parseLabels(description),
      providerId: this.id,
      durationMs: Date.now() - startedAt,
    };
  }

  private parseLabels(description: string): string[] {
    // The service returns prose, not structured labels. Accept an explicit label
    // line or a standalone comma-separated list without sentence punctuation.
    // Otherwise leave labels empty; never infer them from descriptive prose.
    // TODO: replace this assumption with a structured-labels provider when available.
    const section = /(?:^|\n)\s*(?:ETIQUETAS|LABELS)\s*:\s*([^\r\n]*)/i.exec(description);
    const text = description.trim();
    const list = section?.[1] ?? (/^[^\r\n.!?:,]+(?:,[^\r\n.!?:,]+)+$/.test(text) ? text : '');
    return list.split(',').map((label) => label.trim()).filter(Boolean);
  }
}
