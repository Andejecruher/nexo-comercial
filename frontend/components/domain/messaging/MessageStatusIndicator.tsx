'use client';

import type { MessageStatusValueApi } from '@/lib/messaging-api';
import { cn } from '@/lib/utils';
import { AlertCircle, Check, CheckCheck, Clock } from 'lucide-react';

export interface MessageStatusIndicatorProps {
  /** Estados ordenados por tiempo ascendente (API) */
  statuses: Array<{ status: MessageStatusValueApi; timestamp: string }>;
  className?: string;
  accepted?: boolean;
}

function latestStatus(
  statuses: MessageStatusIndicatorProps['statuses'],
): MessageStatusValueApi | undefined {
  if (statuses.length === 0) return undefined;
  const sorted = [...statuses].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );
  return sorted[sorted.length - 1]?.status;
}

export function MessageStatusIndicator({
  statuses,
  className,
  accepted,
}: MessageStatusIndicatorProps) {
  const st = latestStatus(statuses);

  if (st === 'failed') {
    return (
      <span className={cn('inline-flex items-center gap-0.5', className)} title="Error al enviar">
        <AlertCircle className="w-3 h-3 text-destructive" aria-hidden />
        <span className="sr-only">Error al enviar</span>
      </span>
    );
  }

  if (st === 'read') {
    return (
      <span className={cn('inline-flex items-center', className)} title="Leído">
        <CheckCheck className="w-3 h-3 text-sky-400" aria-hidden />
        <span className="sr-only">Leído</span>
      </span>
    );
  }

  if (st === 'delivered') {
    return (
      <span className={cn('inline-flex items-center', className)} title="Entregado">
        <CheckCheck className="w-3 h-3" aria-hidden />
        <span className="sr-only">Entregado</span>
      </span>
    );
  }

  if (st === 'sent') {
    return (
      <span className={cn('inline-flex items-center', className)} title="Enviado">
        <Check className="w-3 h-3" aria-hidden />
        <span className="sr-only">Enviado</span>
      </span>
    );
  }

  if (accepted)
    return (
      <span title="Aceptado por Meta" className={className}>
        <Clock className="w-3 h-3" />
        <span className="sr-only">Aceptado por Meta</span>
      </span>
    );
  return (
    <span className={cn('inline-flex items-center', className)} title="Pendiente de entrega">
      <Clock className="w-3 h-3" aria-hidden />
      <span className="sr-only">Pendiente de entrega</span>
    </span>
  );
}
