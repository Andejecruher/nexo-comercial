import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MessageHistory } from '@/components/shared/messaging/MessageHistory';
import type { MessageRenderable } from '@/components/shared/messaging/MessageBubble';
const message = (id: string): MessageRenderable => ({
  id,
  body: id,
  direction: 'inbound',
  messageType: 'text',
  createdAt: '2026-10-01T12:00:00Z',
  meta: {},
});
describe('inverse history scroll', () => {
  it('keeps the first visible message anchored on prepend and does not repeat same-day separators', () => {
    const load = vi.fn(async () => {});
    const view = render(
      <MessageHistory
        identity="a"
        messages={[message('20'), message('21')]}
        hasOlder
        loadOlder={load}
      />,
    );
    const viewport = screen.getByRole('region', { name: 'Historial de mensajes' });
    Object.defineProperty(viewport, 'scrollHeight', { value: 1000 });
    Object.defineProperty(viewport, 'clientHeight', { value: 300 });
    viewport.scrollTop = 50;
    const anchor = view.container.querySelector<HTMLElement>('[data-message-id="20"]')!;
    const rect = vi.spyOn(anchor, 'getBoundingClientRect');
    rect.mockReturnValue({ top: 10, bottom: 100 } as DOMRect);
    fireEvent.scroll(viewport);
    expect(load).toHaveBeenCalledTimes(1);
    rect.mockReturnValue({ top: 210, bottom: 300 } as DOMRect);
    view.rerender(
      <MessageHistory
        identity="a"
        messages={[message('18'), message('19'), message('20'), message('21')]}
        hasOlder
        loadOlder={load}
      />,
    );
    expect(viewport.scrollTop).toBe(250);
    expect(screen.getAllByRole('separator')).toHaveLength(1);
    view.rerender(<MessageHistory identity="b" messages={[message('25')]} />);
    expect(viewport.scrollTop).toBe(1000);
  });
});
