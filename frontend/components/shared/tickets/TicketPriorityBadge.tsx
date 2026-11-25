'use client';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/shared/utils';
import type { TicketPriority } from '@/lib/shared/tickets-api';

interface TicketPriorityBadgeProps {
  priority: TicketPriority;
  className?: string;
}

const PRIORITY_CONFIG: Record<TicketPriority, { label: string; className: string }> = {
  LOW: {
    label: 'Baja',
    className: 'bg-slate-500/10 text-slate-600 border-slate-200 dark:text-slate-400',
  },
  MEDIUM: {
    label: 'Media',
    className: 'bg-sky-500/15 text-sky-700 border-sky-200 dark:text-sky-400',
  },
  HIGH: {
    label: 'Alta',
    className: 'bg-orange-500/15 text-orange-700 border-orange-200 dark:text-orange-400',
  },
  URGENT: {
    label: 'Urgente',
    className: 'bg-red-500/15 text-red-700 border-red-200 dark:text-red-400 font-semibold',
  },
};

export function TicketPriorityBadge({ priority, className }: TicketPriorityBadgeProps) {
  const config = PRIORITY_CONFIG[priority];
  return (
    <Badge variant="outline" className={cn(config.className, className)}>
      {config.label}
    </Badge>
  );
}
