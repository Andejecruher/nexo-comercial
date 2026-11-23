import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StartConversationDialog } from '../start-conversation-dialog';
import { apiClient } from '@/lib/api-client';
import type { InboxConversation } from '@/lib/messaging-api';
const template = {
  id: '123',
  name: 'hello',
  language: 'es_MX',
  status: 'APPROVED',
  category: 'UTILITY',
  components: [{ type: 'BODY', text: 'Hola {{1}}' }],
};
vi.mock('@/lib/templates-api', () => ({
  templatesApi: {
    lines: vi.fn(async () => [
      { id: 'line', name: 'Línea', wabaId: '1' },
      { id: 'line-b', name: 'Línea B', wabaId: '2' },
    ]),
  },
}));
vi.mock('@/components/campaigns/CampaignTemplatePicker', () => ({
  CampaignTemplatePicker: ({ onChange }: { onChange: (template: unknown) => void }) => (
    <button onClick={() => onChange(template)}>Elegir plantilla</button>
  ),
}));
const chat: InboxConversation = {
  id: 'conv',
  citizen: {
    id: 'citizen',
    name: 'Ana',
    phone: '525500000000',
    colonia: '',
    registeredAt: '',
    interests: [],
  },
  inboxStatus: 'active',
  conversationStatus: 'open',
  lastMessage: '',
  lastTime: '',
  unread: 0,
  updatedAt: '',
  canClose: true,
  communicationLineId: 'line',
};
describe('template conversation start', () => {
  afterEach(() => vi.restoreAllMocks());
  it('prefills the contact, requires variables, previews actual values and reuses the key after failure', async () => {
    const send = vi
      .spyOn(apiClient, 'post')
      .mockResolvedValueOnce({ ok: false, status: 502, message: 'Meta no disponible' })
      .mockResolvedValueOnce({ ok: true, data: {} });
    const select = vi.fn();
    render(
      <StartConversationDialog open onOpenChange={vi.fn()} onSelect={select} initialChat={chat} />,
    );
    await screen.findByText(/Ana · 525500000000/);
    expect(screen.queryByPlaceholderText('Nombre o teléfono...')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Elegir plantilla' }));
    const confirm = screen.getByRole('button', { name: 'Confirmar y enviar plantilla' });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Texto para {{1}}'), { target: { value: 'Ana' } });
    expect(screen.getByText('Hola Ana')).toBeDefined();
    fireEvent.click(confirm);
    await screen.findByText('Meta no disponible');
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar y enviar plantilla' }));
    await waitFor(() => expect(select).toHaveBeenCalledTimes(1));
    expect(send.mock.calls[0][1]).toMatchObject({ templateId: '123', values: { 'body.1': 'Ana' } });
    expect(send.mock.calls[0][2]).toEqual(send.mock.calls[1][2]);
  });
  it('switches to the selected line conversation before sending a template and opens its ID', async () => {
    const send = vi
      .spyOn(apiClient, 'post')
      .mockResolvedValueOnce({
        ok: true,
        data: {
          conversation: {
            id: 'conv-b',
            status: 'open',
            channel: 'whatsapp',
            citizenId: chat.citizen.id,
            createdAt: '2026-01-01T00:00:00Z',
            updatedAt: '2026-01-01T00:00:00Z',
            citizen: { id: chat.citizen.id, name: 'Ana', phone: chat.citizen.phone },
            meta: { communicationLineId: 'line-b', flowState: 'BOT_FLOW' },
          },
        },
      })
      .mockResolvedValueOnce({ ok: true, data: {} });
    const select = vi.fn();
    render(
      <StartConversationDialog open onOpenChange={vi.fn()} onSelect={select} initialChat={chat} />,
    );
    await screen.findByRole('option', { name: 'Línea B' });
    fireEvent.change(screen.getByLabelText('Línea de WhatsApp'), { target: { value: 'line-b' } });
    fireEvent.click(screen.getByRole('button', { name: 'Elegir plantilla' }));
    fireEvent.change(screen.getByLabelText('Texto para {{1}}'), { target: { value: 'Ana' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar y enviar plantilla' }));
    await waitFor(() =>
      expect(select).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'conv-b', communicationLineId: 'line-b' }),
      ),
    );
    expect(send.mock.calls[0]).toEqual([
      '/conversations',
      { citizenId: chat.citizen.id, communicationLineId: 'line-b' },
    ]);
    expect(send.mock.calls[1][0]).toBe('/conversations/conv-b/template');
  });
});
