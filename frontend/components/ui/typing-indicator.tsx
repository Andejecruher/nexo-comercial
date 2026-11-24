import { cn } from '@/lib/shared/utils';

/** Staggered start delay per dot — creates the left-to-right wave. */
const DOT_DELAYS_MS = [0, 160, 320] as const;

export interface TypingDotsProps {
  /** Extra classes for the dots row (spacing, alignment). */
  className?: string;
  /** Classes for the dots, e.g. 'bg-white/80' inside dark bubbles. */
  dotClassName?: string;
}

/**
 * TypingDots — decorative three-dot wave (aria-hidden).
 *
 * Wrap it in a labelled status region (see TypingIndicator / LoadingMessages)
 * when used outside strictly decorative contexts.
 */
export function TypingDots({
  className,
  dotClassName = 'bg-muted-foreground/70',
}: TypingDotsProps) {
  return (
    <span
      data-slot="typing-dots"
      aria-hidden="true"
      className={cn('inline-flex items-center gap-1', className)}
    >
      {DOT_DELAYS_MS.map((delay) => (
        <span
          key={delay}
          className={cn(
            'size-1.5 rounded-full animate-typing-wave motion-reduce:animate-none',
            dotClassName,
          )}
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </span>
  );
}

export interface TypingIndicatorProps {
  /**
   * Text announced to screen readers. The dots are decorative (aria-hidden),
   * so this label is the accessible name of the status region.
   */
  label?: string;
  /** Extra classes for the root container (spacing, alignment). */
  className?: string;
  /** Classes for the dots, e.g. 'bg-white/80' inside dark bubbles. */
  dotClassName?: string;
}

/**
 * TypingIndicator — animated three-dot wave with an accessible label.
 *
 * Replaces the old plain-text "Escribiendo…" / "IA escribiendo…" markers.
 * The label is screen-reader-only; the dots inherit no color by default
 * beyond muted-foreground, so pass `dotClassName` to match the surface.
 */
export function TypingIndicator({
  label = 'Escribiendo…',
  className,
  dotClassName,
}: TypingIndicatorProps) {
  return (
    <div
      role="status"
      data-slot="typing-indicator"
      className={cn('inline-flex items-center gap-1', className)}
    >
      <TypingDots dotClassName={dotClassName} />
      <span className="sr-only">{label}</span>
    </div>
  );
}
