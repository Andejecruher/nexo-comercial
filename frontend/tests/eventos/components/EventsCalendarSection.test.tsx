import { EventsCalendarSection } from '@/components/eventos/EventsCalendarSection';
import type { EventRecord } from '@/lib/eventos/events-api';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const event: EventRecord = {
  id: 'evt-1',
  title: 'Asamblea centro',
  slug: 'asamblea-centro',
  eventType: 'townhall',
  status: 'published',
  startsAt: new Date(2026, 4, 10, 18, 0).toISOString(),
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe('EventsCalendarSection', () => {
  it('abre creación al hacer clic en el área libre del día', () => {
    const onCreateDay = vi.fn();
    render(
      <EventsCalendarSection
        events={[]}
        loading={false}
        mode="calendar"
        currentMonth={new Date(2026, 4, 1)}
        selectedEvent={null}
        onSelectEvent={vi.fn()}
        onCreateDay={onCreateDay}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Programar jornada el 10 de mayo' }));
    expect(onCreateDay).toHaveBeenCalledTimes(1);
    const day = onCreateDay.mock.calls[0]?.[0] as Date;
    expect(day.getDate()).toBe(10);
    expect(day.getMonth()).toBe(4);
  });

  it('no dispara onCreateDay al seleccionar un evento existente', () => {
    const onCreateDay = vi.fn();
    const onSelectEvent = vi.fn();
    render(
      <EventsCalendarSection
        events={[event]}
        loading={false}
        mode="calendar"
        currentMonth={new Date(2026, 4, 1)}
        selectedEvent={null}
        onSelectEvent={onSelectEvent}
        onCreateDay={onCreateDay}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Asamblea centro' }));
    expect(onSelectEvent).toHaveBeenCalledWith(event);
    expect(onCreateDay).not.toHaveBeenCalled();
  });

  it('llama onEditEvent al hacer clic en el lápiz del panel', () => {
    const onEditEvent = vi.fn();
    render(
      <EventsCalendarSection
        events={[event]}
        loading={false}
        mode="calendar"
        currentMonth={new Date(2026, 4, 1)}
        selectedEvent={event}
        onSelectEvent={vi.fn()}
        onEditEvent={onEditEvent}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Editar evento' }));
    expect(onEditEvent).toHaveBeenCalledTimes(1);
    expect(onEditEvent).toHaveBeenCalledWith(event);
  });

  it('no muestra el lápiz si no hay onEditEvent', () => {
    render(
      <EventsCalendarSection
        events={[event]}
        loading={false}
        mode="calendar"
        currentMonth={new Date(2026, 4, 1)}
        selectedEvent={event}
        onSelectEvent={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Editar evento' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cerrar panel' })).toBeInTheDocument();
  });
});
