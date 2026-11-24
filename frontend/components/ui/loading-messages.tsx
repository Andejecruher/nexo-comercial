import { TypingDots } from '@/components/ui/typing-indicator';
import { cn } from '@/lib/shared/utils';

export interface LoadingMessagesProps {
  /** Visible status text — also announced to screen readers via role="status". */
  label?: string;
  /** Extra classes for the root container (spacing, alignment). */
  className?: string;
  /** Classes for the dots, e.g. 'bg-primary/70' for brand accents. */
  dotClassName?: string;
}

/**
 * LoadingMessages — centered status row: three-dot wave + visible label.
 *
 * Shared surface for "Cargando mensajes…" states so every chat view shows
 * the same motion instead of ad-hoc spinners or plain text.
 */
export function LoadingMessages({
  label = 'Cargando mensajes…',
  className,
  dotClassName = 'bg-primary/70',
}: LoadingMessagesProps) {
  return (
    <div
      role="status"
      data-slot="loading-messages"
      className={cn(
        'flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground',
        className,
      )}
    >
      <TypingDots dotClassName={dotClassName} />
      <span>{label}</span>
    </div>
  );
}
