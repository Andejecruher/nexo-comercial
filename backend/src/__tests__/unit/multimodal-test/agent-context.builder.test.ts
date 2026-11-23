import { describe, expect, it } from '@jest/globals';
import {
  MultimodalFileKind,
  MultimodalTestResult,
} from '../../../services/multimodal-test/contracts';
import { buildAgentContext } from '../../../services/multimodal-test/agent-context.builder';

function result(
  kind: MultimodalFileKind,
  payload: MultimodalTestResult['payload'],
  status: MultimodalTestResult['status'] = 'completed',
): MultimodalTestResult {
  return {
    correlationId: `corr-${kind}`,
    kind,
    filename: 'sample',
    mimeType: 'application/octet-stream',
    status,
    startedAt: '2026-10-24T00:00:00.000Z',
    endedAt: '2026-10-24T00:00:01.000Z',
    durationMs: 1000,
    steps: [],
    errors: [],
    payload,
    metadata: {},
    providersUsed: [],
  };
}

describe('buildAgentContext', () => {
  it('maps each kind to its attachment type', () => {
    const context = buildAgentContext([
      result('audio', { transcript: 'transcripción del audio' }),
      result('document', { normalizedText: 'texto del documento', extractedText: 'raw doc' }),
      result('image', { ocrText: 'texto en imagen', description: 'una calle concurrida' }),
      result('video', { transcript: 'transcripción del video', summaryText: 'resumen visual' }),
    ]);
    expect(context.attachments).toEqual([
      { type: 'AUDIO_TRANSCRITO', text: 'transcripción del audio' },
      { type: 'DOCUMENTO_EXTRAIDO', text: 'texto del documento' },
      { type: 'IMAGEN_ANALIZADA', text: 'texto en imagen\nuna calle concurrida' },
      { type: 'VIDEO_TRANSCRITO', text: 'transcripción del video\nresumen visual' },
    ]);
  });

  it('skips failed results and entries with empty payloads', () => {
    const context = buildAgentContext([
      result('audio', { transcript: '' }),
      result('document', { ocrText: 'texto vía OCR' }, 'failed'),
      result('image', { description: 'descripción válida' }, 'partial'),
    ]);
    expect(context.attachments).toEqual([
      { type: 'IMAGEN_ANALIZADA', text: 'descripción válida' },
    ]);
  });

  it('falls back through document payload fields in order', () => {
    const context = buildAgentContext([
      result('document', { summaryText: 'resumen del doc' }),
    ]);
    expect(context.attachments[0]).toEqual({
      type: 'DOCUMENTO_EXTRAIDO',
      text: 'resumen del doc',
    });
  });

  it('builds a combinedContextText containing every attachment text', () => {
    const context = buildAgentContext([
      result('audio', { transcript: 'hola mundo' }),
      result('image', { description: 'una imagen' }),
    ]);
    expect(context.combinedContextText).toContain('hola mundo');
    expect(context.combinedContextText).toContain('una imagen');
    expect(context.combinedContextText).toContain('AUDIO_TRANSCRITO');
    expect(context.combinedContextText).toContain('IMAGEN_ANALIZADA');
  });

  it('returns empty context for no results', () => {
    const context = buildAgentContext([]);
    expect(context.attachments).toEqual([]);
    expect(context.combinedContextText).toBe('');
  });
});
