import { LeadersView } from '@/components/admin/leaders/LeadersView';
import type { ElectoralLeader } from '@/lib/ine-ocr-api';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const leader: ElectoralLeader = {
  id: 'leader-1',
  sectionId: 'section-1',
  coordinatorId: 'coord-1',
  fullName: 'María López',
  email: 'maria@ejemplo.mx',
  role: 'PROMOTOR_BARRIO',
  isActive: true,
  createdAt: '2026-08-01T00:00:00.000Z',
  section: {
    id: 'section-1',
    sectionCode: '0042',
    state: { id: 'state-1', name: 'Chiapas' },
    district: { id: 'district-1', code: '01' },
  },
  coordinator: { id: 'coord-1', fullName: 'Ana Coordinadora' },
  user: { id: 'user-1', email: 'maria@ejemplo.mx', isActive: false },
};

const createLeader = vi.fn();
const reinviteLeader = vi.fn();

vi.mock('@/hooks/useLeaders', () => ({
  useLeaders: () => ({
    leaders: [leader],
    loading: false,
    error: undefined,
    totalCount: 1,
    hasNextPage: false,
    refresh: vi.fn(),
    createLeader,
    updateLeader: vi.fn(),
    removeLeader: vi.fn(),
    reinviteLeader,
  }),
}));

vi.mock('@/hooks/useCoordinators', () => ({
  useCoordinators: () => ({
    coordinators: [{ id: 'coord-1', fullName: 'Ana Coordinadora' }],
  }),
}));

vi.mock('@/hooks/useSections', () => ({
  useSections: () => ({
    activeSections: [
      {
        id: 'section-1',
        stateId: 'state-1',
        districtId: 'district-1',
        sectionCode: '0042',
        isActive: true,
        state: { id: 'state-1', name: 'Chiapas' },
        district: { id: 'district-1', code: '01' },
        leaders: [],
      },
    ],
    sectionsLoading: false,
  }),
}));

vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({
    guards: {
      canViewLeaders: () => true,
      canCreateLeaders: () => true,
      canUpdateLeaders: () => true,
      canDeleteLeaders: () => true,
    },
  }),
}));

describe('LeadersView', () => {
  beforeEach(() => {
    createLeader.mockReset();
    reinviteLeader.mockReset();
    if (leader.user) leader.user.isActive = false;
  });

  it('renders the leaders table with account status', () => {
    render(<LeadersView />);
    expect(screen.getByRole('heading', { name: 'Líderes' })).toBeInTheDocument();
    expect(screen.getByText('María López')).toBeInTheDocument();
    expect(screen.getByText('Sin activar')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Crear líder' })).toBeInTheDocument();
  });

  it('disables resend when the account is already active', () => {
    if (leader.user) leader.user.isActive = true;
    render(<LeadersView />);
    const resend = screen.getByRole('button', { name: /Reenviar invitación a María López/i });
    expect(resend).toBeDisabled();
  });
});
