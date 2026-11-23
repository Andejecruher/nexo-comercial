export interface MultimediaContext {
  // DOCUMENTO_EXTRAIDO / VIDEO_TRANSCRITO are added by the multimodal test layer
  // (agent-context builder); widening the union is backward compatible.
  type: 'IMAGEN_ANALIZADA' | 'AUDIO_TRANSCRITO' | 'DOCUMENTO_EXTRAIDO' | 'VIDEO_TRANSCRITO';
  text: string;
}

/** Codifica valores para que etiquetas aportadas por el ciudadano no creen nuevos bloques. */
export function buildMultimodalPayload(
  userText: string,
  context?: MultimediaContext | readonly MultimediaContext[],
): string {
  const contexts = context ? (Array.isArray(context) ? context : [context]) : [];
  const systemContext = contexts.length
    ? contexts.map((item) => `[TIPO: ${item.type}]\n${JSON.stringify(item.text)}`).join('\n\n')
    : '[TIPO: TEXTO]';

  return `[CONTEXTO DEL SISTEMA]\n${systemContext}\n\n[MENSAJE DEL USUARIO]\n${JSON.stringify(userText)}`;
}
