import { EventsTable } from '@/components/eventos/EventsTable';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { EventRecord } from '@/lib/eventos/events-api';

function event(overrides: Partial<EventRecord>): EventRecord {
  return {
    id: 'evt-1',
    title: 'Asamblea centro',
    slug: 'asamblea-centro',
    eventType: 'townhall',
    status: 'published',
    visibility: 'public',
    startsAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  } as EventRecord;
}

describe('EventsTable', () => {
  it('muestra badges de Público y Privado por evento', () => {
    render(
      <EventsTable
        loading={false}
        events={[
          event({ id: 'evt-1', title: 'Asamblea centro', visibility: 'public' }),
          event({ id: 'evt-2', title: 'Reunión de equipo', visibility: 'private' }),
        ]}
      />,
    );

    expect(screen.getByText('Público')).toBeInTheDocument();
    expect(screen.getByText('Privado')).toBeInTheDocument();
  });

  it('trata un evento sin visibilidad como público', () => {
    render(
      <EventsTable
        loading={false}
        events={[event({ id: 'evt-1', visibility: undefined as unknown as 'public' })]}
      />,
    );

    expect(screen.getByText('Público')).toBeInTheDocument();
  });
});
