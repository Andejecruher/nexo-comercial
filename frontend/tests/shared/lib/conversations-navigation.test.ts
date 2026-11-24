import { buildConversationsHref, CONVERSATIONS_PATH } from '@/lib/shared/conversations-navigation';
import { describe, expect, it } from 'vitest';

describe('buildConversationsHref', () => {
  it('sin opciones solo fija status=active', () => {
    expect(buildConversationsHref()).toBe(`${CONVERSATIONS_PATH}?status=active`);
  });

  it('incluye conversation y line cuando el evento porta la línea', () => {
    const href = buildConversationsHref({
      conversationId: '550e8400-e29b-41d4-a716-446655440001',
      communicationLineId: '550e8400-e29b-41d4-a716-4466554400aa',
    });

    const params = new URLSearchParams(href.split('?')[1]);
    expect(params.get('status')).toBe('active');
    expect(params.get('conversation')).toBe('550e8400-e29b-41d4-a716-446655440001');
    expect(params.get('line')).toBe('550e8400-e29b-41d4-a716-4466554400aa');
  });

  it('omite line cuando el evento no la porta (retrocompatible)', () => {
    const href = buildConversationsHref({
      conversationId: '550e8400-e29b-41d4-a716-446655440001',
    });

    expect(href).not.toContain('line=');
  });
});
