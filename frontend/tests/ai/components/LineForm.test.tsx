import { LineForm } from '@/components/ai/LineForm';
import type {
  AiAgent,
  CommunicationLine,
  CreateLinePayload,
  UpdateLinePayload,
} from '@/lib/shared/ai-api';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/hooks/shared/useDepartments', () => ({
  useDepartments: () => ({ departments: [] }),
}));

const agent: AiAgent = {
  id: 'agent-1',
  slug: 'agente-centro',
  name: 'Agente Centro',
  provider: 'openai',
  model: 'gpt-4o-mini',
  isActive: true,
  metadata: {},
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const line: CommunicationLine = {
  id: 'line-1',
  channel: 'whatsapp',
  externalIdentifier: '1234567890',
  phoneNumber: '+54 9 11 0000 0000',
  provider: 'meta',
  displayName: 'Línea Centro',
  isActive: true,
  isDefault: false,
  aiEnabled: true,
  agentId: agent.id,
  whatsappBusinessAccountId: 'waba-1',
  whatsappAppId: 'app-1',
  metadata: { departmentIds: ['dept-1'] },
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const CREDENTIAL_LABELS = [
  /Phone Number ID/,
  /Business Account ID/,
  /APP ID/,
  /APP SECRET/,
  /ACCESS TOKEN/,
];

describe('LineForm', () => {
  it('usa los mismos campos en creación y edición', () => {
    const { unmount } = render(
      <LineForm
        open
        availableAgents={[agent]}
        onClose={vi.fn()}
        onCreate={vi.fn()}
        onUpdate={vi.fn()}
      />,
    );

    for (const label of CREDENTIAL_LABELS) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: 'Crear línea' })).toBeInTheDocument();

    unmount();

    render(
      <LineForm
        open
        line={line}
        availableAgents={[agent]}
        onClose={vi.fn()}
        onCreate={vi.fn()}
        onUpdate={vi.fn()}
      />,
    );

    for (const label of CREDENTIAL_LABELS) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeInTheDocument();
  });

  it('precarga la línea y conserva credenciales vacías al editar', async () => {
    const onUpdate = vi.fn(async (_id: string, _payload: UpdateLinePayload) => ({ success: true }));
    const onCreate = vi.fn(async (_payload: CreateLinePayload) => ({ success: true }));

    render(
      <LineForm
        open
        line={line}
        availableAgents={[agent]}
        onClose={vi.fn()}
        onCreate={onCreate}
        onUpdate={onUpdate}
      />,
    );

    expect(screen.getByLabelText(/^Nombre/)).toHaveValue('Línea Centro');
    expect(screen.getByLabelText(/Phone Number ID/)).toHaveValue('1234567890');
    expect(screen.getByLabelText(/Business Account ID/)).toHaveValue('waba-1');
    expect(screen.getByLabelText(/APP ID/)).toHaveValue('app-1');
    expect(screen.getByLabelText(/APP SECRET/)).toHaveValue('');
    expect(screen.getByLabelText(/ACCESS TOKEN/)).toHaveValue('');

    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));
    expect(onCreate).not.toHaveBeenCalled();
    expect(onUpdate).toHaveBeenCalledWith(
      'line-1',
      expect.objectContaining({
        displayName: 'Línea Centro',
        externalIdentifier: '1234567890',
        whatsappPhoneNumberId: '1234567890',
        whatsappBusinessAccountId: 'waba-1',
        whatsappAppId: 'app-1',
        departmentIds: ['dept-1'],
      }),
    );
    const payload = onUpdate.mock.calls[0][1];
    expect(payload).not.toHaveProperty('whatsappAppSecret');
    expect(payload).not.toHaveProperty('whatsappAccessToken');
  });
});
