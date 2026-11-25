import { CitizenProfile } from '@/components/conversaciones/citizen-profile';
import type { CitizenProfileResponse, CitizenRecentTicket } from '@/lib/shared/citizens-api';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const mockUseCitizenProfile = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/shared/useCitizenProfile', () => ({
  useCitizenProfile: mockUseCitizenProfile,
}));

const profile: CitizenProfileResponse = {
  citizen: {
    id: 'cit-1',
    phone: '9661234567',
    name: 'María',
    lastName: 'González',
    email: 'maria@ciudad.test',
    sourceChannel: 'whatsapp',
    leadStatus: 'engaged',
    consentGiven: true,
    neighborhood: 'La Candelaria',
    interests: ['Agua Potable'],
    createdAt: '2026-03-12T10:00:00.000Z',
    updatedAt: '2026-09-20T18:00:00.000Z',
  },
  tags: [],
  conversationSummary: {
    totalConversations: 1,
    openConversations: 1,
    lastConversation: null,
  },
  participationHistory: [],
};

const tickets: CitizenRecentTicket[] = [
  {
    id: 'ticket-12345678',
    conversationId: 'conversation-1',
    status: 'IN_PROGRESS',
    title: 'Falta de agua',
    departmentSlug: 'agua',
    createdAt: '2026-09-19T18:00:00.000Z',
    updatedAt: '2026-09-20T18:00:00.000Z',
  },
];

function hookResult(overrides: Record<string, unknown> = {}) {
  return {
    profile,
    tickets,
    loading: false,
    error: undefined,
    ticketsError: undefined,
    updatingInterests: false,
    updateInterests: vi.fn().mockResolvedValue(true),
    refresh: vi.fn(),
    ...overrides,
  };
}

describe('CitizenProfile — panel de bandeja', () => {
  it('pide seleccionar una conversación cuando no hay ciudadano', () => {
    mockUseCitizenProfile.mockReturnValue(
      hookResult({
        profile: undefined,
        tickets: [],
      }),
    );

    render(<CitizenProfile />);
    expect(
      screen.getByText('Selecciona una conversación para ver el perfil ciudadano.'),
    ).toBeInTheDocument();
  });

  it('mapea citizen sin fechas de registro y muestra tickets navegables', () => {
    mockUseCitizenProfile.mockReturnValue(hookResult());

    render(<CitizenProfile citizenId="cit-1" />);

    expect(screen.getByText('María González')).toBeInTheDocument();
    expect(screen.getByText('+52 966 123 4567')).toBeInTheDocument();
    expect(screen.getByText('maria@ciudad.test')).toBeInTheDocument();
    expect(screen.getAllByText('La Candelaria').length).toBeGreaterThan(0);
    expect(screen.getByText('Agua Potable')).toBeInTheDocument();
    expect(screen.queryByText(/Registrado:/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Actualizado:/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Registro$/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Cambiar estado')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Falta de agua/i })).toHaveAttribute(
      'href',
      '/admin/tickets/conversation-1?ticketId=ticket-12345678',
    );
  });

  it('permite agregar, quitar y guardar temas de interés', async () => {
    const updateInterests = vi.fn().mockResolvedValue(true);
    mockUseCitizenProfile.mockReturnValue(hookResult({ updateInterests }));

    render(<CitizenProfile citizenId="cit-1" />);

    fireEvent.change(screen.getByLabelText('Nuevo tema de interés'), {
      target: { value: 'Seguridad Pública' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Agregar tema de interés' }));
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar tema Agua Potable' }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => {
      expect(updateInterests).toHaveBeenCalledWith(['Seguridad Pública']);
    });
  });

  it('permite reintentar cuando falla la carga', () => {
    const refresh = vi.fn();
    mockUseCitizenProfile.mockReturnValue(
      hookResult({
        profile: undefined,
        tickets: [],
        error: 'Fallo de red',
        refresh,
      }),
    );

    render(<CitizenProfile citizenId="cit-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
