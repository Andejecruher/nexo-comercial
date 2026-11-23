import type { TemplateStatusUpdate } from './templates-api';
/** Incremental SSE parser: handles fragmented UTF-8, CRLF, comments and multiline data. */
export function createTemplateSseParser(onEvent: (event: TemplateStatusUpdate) => void) {
  let buffer = '';
  return (chunk: string) => {
    buffer += chunk;
    let match: RegExpExecArray | null;
    while ((match = /\r?\n\r?\n/.exec(buffer))) {
      const frame = buffer.slice(0, match.index);
      buffer = buffer.slice(match.index + match[0].length);
      const lines = frame.split(/\r?\n/);
      const event = lines
        .find((l) => l.startsWith('event:'))
        ?.slice(6)
        .trim();
      if (event !== 'template_status_changed') continue;
      try {
        const data = JSON.parse(
          lines
            .filter((l) => l.startsWith('data:'))
            .map((l) => l.slice(5).trimStart())
            .join('\n'),
        ) as TemplateStatusUpdate;
        if (
          /^\d+$/.test(data.id) &&
          typeof data.waba_id === 'string' &&
          typeof data.message_template_id === 'string' &&
          typeof data.event === 'string' &&
          Number.isFinite(Date.parse(data.occurred_at))
        )
          onEvent(data);
      } catch {
        /* An invalid frame must not break the subscription. */
      }
    }
    if (buffer.length > 1_000_000) throw new Error('Evento SSE demasiado grande');
  };
}
