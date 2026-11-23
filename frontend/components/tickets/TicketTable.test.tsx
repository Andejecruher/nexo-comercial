import { TicketTable } from '@/components/tickets/TicketTable';
import type { TicketDto } from '@/lib/tickets-api';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

const closedTicketInReopenedConversation: TicketDto = {
  id: 'ticket-101',
  folio: 'FOL-101',
  conversationId: 'conversation-1',
  citizenId: 'citizen-1',
  citizenName: 'Ana Ciudadana',
  citizenPhone: '+525500000001',
  status: 'CLOSED',
  priority: 'MEDIUM',
  source: 'WHATSAPP',
  departmentSlug: undefined,
  assignedUserId: undefined,
  flowState: 'BOT_FLOW',
  conversationStatus: 'open',
  channel: 'whatsapp',
  createdAt: '2026-10-23T12:00:00.000Z',
  updatedAt: '2026-10-23T12:00:00.000Z',
  closedAt: '2026-10-23T12:00:00.000Z',
};

describe('TicketTable', () => {
  it('shows only the ticket lifecycle as open or closed', () => {
    const activeTicket: TicketDto = {
      ...closedTicketInReopenedConversation,
      id: 'ticket-102',
      folio: 'FOL-102',
      status: 'IN_PROGRESS',
    };

    render(
      <TicketTable
        tickets={[closedTicketInReopenedConversation, activeTicket]}
        loading={false}
        error={undefined}
        onRetry={() => undefined}
      />,
    );

    expect(screen.getAllByText('Cerrado')).not.toHaveLength(0);
    expect(screen.getAllByText('Abierto')).not.toHaveLength(0);
    expect(screen.queryByText('Conversación')).not.toBeInTheDocument();
  });
});
