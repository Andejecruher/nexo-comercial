import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BulkConversationsView } from '../bulk-conversations-view';

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api-client', () => ({ apiClient: mocks }));
vi.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ can: () => true }) }));
vi.mock('@/lib/catalog-api', () => ({
  departmentsApi: { list: async () => ({ ok: true, data: { departments: [], meta: {} } }) },
}));
const active = {
  id: 'a',
  citizen: { name: 'Ana', phone: '555111' },
  inboxStatus: 'active',
  botEnabled: false,
  attendanceMode: 'human',
  activeTicketId: 'ticket',
  lastMessagePreview: 'Hola',
};
const inactive = {
  ...active,
  id: 'b',
  citizen: { name: 'Beatriz', phone: '555222' },
  inboxStatus: 'inactive',
  activeTicketId: null,
};

beforeEach(() => {
  mocks.get.mockImplementation(async (path: string) =>
    path.includes('bulk-action')
      ? { ok: true, data: { job_id: 'job', done: false, items: [] } }
      : { ok: true, data: { items: [active, inactive], meta: { hasNextPage: false } } },
  );
  mocks.post.mockResolvedValue({ ok: true, data: { job_id: 'job' } });
});

describe('bulk conversations', () => {
  it('blocks inactive recipients and prevents duplicate submissions', async () => {
    render(<BulkConversationsView />);
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Seleccionar Ana' }));
    const text = screen.getByLabelText('Mensaje para las conversaciones seleccionadas');
    expect(text).toHaveAttribute('maxlength', '1000');
    fireEvent.change(text, { target: { value: 'Hola a todos' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Seleccionar Beatriz' }));
    expect(
      screen.getByRole('button', { name: 'Enviar mensaje a 2 conversaciones' }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Seleccionar Beatriz' }));
    const send = screen.getByRole('button', { name: 'Enviar mensaje a 1 conversaciones' });
    fireEvent.click(send);
    fireEvent.click(send);
    await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(1));
    expect(mocks.post).toHaveBeenCalledWith(
      '/conversations/bulk-action',
      { action: 'send_message', conversation_ids: ['a'], message: 'Hola a todos' },
      expect.objectContaining({ headers: { 'Idempotency-Key': expect.any(String) } }),
    );
    expect(await screen.findByText(/Solicitud aceptada/)).toBeInTheDocument();
  });

  it('preserves selection across pages and sends both selected ids', async () => {
    mocks.get.mockImplementation(async (path: string) =>
      path.includes('bulk-action')
        ? { ok: true, data: { job_id: 'job', done: false, items: [] } }
        : {
            ok: true,
            data: path.includes('cursor=next')
              ? { items: [inactive], meta: { hasNextPage: false } }
              : { items: [active], meta: { hasNextPage: true, nextCursor: 'next' } },
          },
    );
    render(<BulkConversationsView />);
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Seleccionar Ana' }));
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Seleccionar Beatriz' }));
    expect(screen.getByText('2 / 500 seleccionadas')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Activar bots' }));
    await waitFor(() =>
      expect(mocks.post).toHaveBeenCalledWith(
        '/conversations/bulk-action',
        { action: 'activate_bot', conversation_ids: ['a', 'b'] },
        expect.anything(),
      ),
    );
  });
});
