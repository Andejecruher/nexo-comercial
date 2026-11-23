const LAST_MESSAGE_PREVIEW_MAX = 120;

export function buildInboxMessagePreview(
  body: string | null | undefined,
  messageType?: string,
  maxLength = LAST_MESSAGE_PREVIEW_MAX,
): string | null {
  switch (messageType) {
    case 'audio':
      return 'Nota de voz';
    case 'image':
      return 'Imagen';
    case 'video':
      return 'Video';
    case 'document':
      return 'Documento';
    case 'location':
      return 'Ubicación';
    default: {
      const text = (body ?? '').trim();
      if (!text) return null;
      return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
    }
  }
}
