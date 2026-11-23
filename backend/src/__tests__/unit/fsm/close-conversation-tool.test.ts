/**
 * Tests unitarios: CloseConversationTool
 */
import { describe, expect, it } from '@jest/globals';
import { CloseConversationTool } from '../../../ai/tools/close-conversation.tool';

describe('CloseConversationTool', () => {
  const tool = new CloseConversationTool();

  it('debe tener key = closeConversation', () => {
    expect(tool.key).toBe('closeConversation');
  });

  it('debe retornar closed=true con conversationId y reason', async () => {
    const result = await tool.execute({
      conversationId: 'conv-1',
      reason: 'resolved',
    });

    expect(result).toEqual({
      conversationId: 'conv-1',
      closed: true,
      reason: 'resolved',
    });
  });

  it('debe retornar closed=true sin reason (optional)', async () => {
    const result = await tool.execute({
      conversationId: 'conv-2',
    });

    expect(result).toMatchObject({
      conversationId: 'conv-2',
      closed: true,
    });
  });

  it('debe retornar error INVALID_INPUT si conversationId está vacío', async () => {
    const result = await tool.execute({ conversationId: '' });
    expect(result).toMatchObject({ error: 'INVALID_INPUT' });
  });

  it('debe retornar error INVALID_INPUT si input es null', async () => {
    const result = await tool.execute(null);
    expect(result).toMatchObject({ error: 'INVALID_INPUT' });
  });

  it('debe retornar error INVALID_INPUT si reason no es válido', async () => {
    const result = await tool.execute({
      conversationId: 'conv-3',
      reason: 'invalid_reason',
    });
    expect(result).toMatchObject({ error: 'INVALID_INPUT' });
  });

  it('debe aceptar summary opcional', async () => {
    const result = (await tool.execute({
      conversationId: 'conv-4',
      reason: 'resolved',
      summary: 'El ciudadano fue atendido correctamente.',
    })) as Record<string, unknown>;

    expect(result.closed).toBe(true);
  });
});
