import { EventRegistrationsTable } from '@/components/domain/events/EventRegistrationsTable';
import type { EventRegistrationRecord } from '@/lib/events-api';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

function makeRegistration(index: number): EventRegistrationRecord {
  return {
    id: `reg-${index}`,
    eventId: 'evt-1',
    citizenId: `cit-${index}`,
    registrationStatus: 'registered',
    attendanceStatus: 'pending',
    sourceChannel: 'admin',
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
    citizen: {
      id: `cit-${index}`,
      name: `Persona ${index}`,
      phone: `555-${index}`,
    },
  };
}

function table() {
  return within(screen.getByRole('table'));
}

describe('EventRegistrationsTable', () => {
  it('renders only the current page of registrations', () => {
    const rows = Array.from({ length: 12 }, (_, index) => makeRegistration(index));
    render(<EventRegistrationsTable registrations={rows} loading={false} />);

    expect(table().getByText('Persona 0')).toBeInTheDocument();
    expect(table().getByText('Persona 9')).toBeInTheDocument();
    expect(table().queryByText('Persona 10')).not.toBeInTheDocument();
    expect(screen.getByText(/Total:/)).toBeInTheDocument();
    expect(screen.getByText('Página')).toBeInTheDocument();
    expect(screen.getByText('de')).toBeInTheDocument();
  });

  it('navigates with next, previous and first', () => {
    const rows = Array.from({ length: 25 }, (_, index) => makeRegistration(index));
    render(<EventRegistrationsTable registrations={rows} loading={false} />);

    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(table().getByText('Persona 10')).toBeInTheDocument();
    expect(table().queryByText('Persona 0')).not.toBeInTheDocument();
    expect(table().queryByText('Persona 20')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(table().getByText('Persona 20')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Primera' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Anterior' }));
    expect(table().getByText('Persona 10')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Primera' }));
    expect(table().getByText('Persona 0')).toBeInTheDocument();
    expect(table().queryByText('Persona 10')).not.toBeInTheDocument();
  });

  it('resets to page 1 when page size changes', async () => {
    const rows = Array.from({ length: 30 }, (_, index) => makeRegistration(index));
    render(<EventRegistrationsTable registrations={rows} loading={false} />);

    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(table().getByText('Persona 10')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('combobox', { name: 'Filas por página' }));
    await waitFor(() => {
      expect(screen.getByRole('option', { name: '25' })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('option', { name: '25' }));

    expect(table().getByText('Persona 0')).toBeInTheDocument();
    expect(table().getByText('Persona 24')).toBeInTheDocument();
    expect(table().queryByText('Persona 25')).not.toBeInTheDocument();
  });

  it('shows loading and empty states', () => {
    const { rerender } = render(<EventRegistrationsTable registrations={[]} loading />);
    expect(screen.getAllByText('Cargando registros...').length).toBeGreaterThan(0);

    rerender(<EventRegistrationsTable registrations={[]} loading={false} />);
    expect(screen.getAllByText('No hay registros.').length).toBeGreaterThan(0);
  });

  it('clamps to the last available page when the list shrinks', () => {
    const many = Array.from({ length: 25 }, (_, index) => makeRegistration(index));
    const { rerender } = render(<EventRegistrationsTable registrations={many} loading={false} />);

    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(table().getByText('Persona 20')).toBeInTheDocument();

    rerender(<EventRegistrationsTable registrations={many.slice(0, 5)} loading={false} />);

    expect(table().getByText('Persona 0')).toBeInTheDocument();
    expect(table().getByText('Persona 4')).toBeInTheDocument();
    expect(table().queryByText('Persona 20')).not.toBeInTheDocument();
  });
});
