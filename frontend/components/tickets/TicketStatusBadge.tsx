'use client';

import { Badge } from '@/components/ui/badge';
import type { TicketStatus } from '@/lib/tickets-api';
import { cn } from '@/lib/utils';

interface TicketStatusBadgeProps {
  status: TicketStatus;
  className?: string;
}

export const TICKET_STATUS_CONFIG: Record<TicketStatus, { label: string; className: string }> = {
  OPEN: {
    label: 'Nuevo Reporte',
    className: 'border-blue-200 bg-blue-50 text-blue-700',
  },
  IN_PROGRESS: {
    label: 'En Gestión',
    className: 'border-amber-200 bg-amber-50 text-amber-700',
  },
  RESOLVED: {
    label: 'Canalizado',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  },
  CLOSED: {
    label: 'Caso Resuelto',
    className: 'border-slate-200 bg-slate-100 text-slate-600',
  },
};

export function TicketStatusBadge({ status, className }: TicketStatusBadgeProps) {
  const config = TICKET_STATUS_CONFIG[status];
  return (
    <Badge variant="outline" className={cn(config.className, className)}>
      {config.label}
    </Badge>
  );
}
