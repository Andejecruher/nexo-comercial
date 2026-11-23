'use client';

import { CheckCircle2, CircleAlert, Info, Loader2, TriangleAlert, X } from 'lucide-react';
import { Toaster } from 'sonner';

const iconClassName = 'size-4';

export function CustomToaster() {
  return (
    <Toaster
      className="toaster-brand font-sans"
      position="top-right"
      closeButton
      gap={10}
      visibleToasts={3}
      duration={4500}
      offset={16}
      mobileOffset={16}
      style={
        {
          fontFamily: 'var(--font-sans)',
          '--border-radius': 'var(--radius)',
          '--width': '22.5rem',
        } as React.CSSProperties
      }
      icons={{
        success: <CheckCircle2 aria-hidden className={iconClassName} />,
        error: <CircleAlert aria-hidden className={iconClassName} />,
        warning: <TriangleAlert aria-hidden className={iconClassName} />,
        info: <Info aria-hidden className={iconClassName} />,
        loading: <Loader2 aria-hidden className={`${iconClassName} animate-spin`} />,
        close: <X aria-hidden className="size-3.5" />,
      }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            'relative flex w-[min(100%,22.5rem)] items-start gap-3 rounded-[var(--radius)] border border-border border-l-[3px] bg-card px-3.5 py-3 pr-10 text-card-foreground shadow-[0_8px_28px_-10px_color-mix(in_srgb,var(--secondary)_26%,transparent)]',
          default: 'border-l-secondary [&_[data-icon]]:text-secondary',
          success: 'border-l-primary [&_[data-icon]]:text-primary',
          error: 'border-l-destructive [&_[data-icon]]:text-destructive',
          warning: 'border-l-accent [&_[data-icon]]:text-accent',
          info: 'border-l-primary-light [&_[data-icon]]:text-primary-light',
          loading: 'border-l-muted-foreground/40 [&_[data-icon]]:text-muted-foreground',
          icon: 'mt-0.5 shrink-0',
          content: 'min-w-0 flex-1',
          title: 'text-sm font-semibold leading-snug tracking-tight text-foreground',
          description: 'mt-0.5 text-xs leading-relaxed text-muted-foreground',
          actionButton:
            'mt-2 inline-flex h-7 shrink-0 items-center rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary-hover',
          cancelButton:
            'mt-2 inline-flex h-7 shrink-0 items-center rounded-md bg-muted px-2.5 text-xs font-medium text-secondary transition-colors hover:bg-muted/80',
          closeButton:
            'text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 focus-visible:ring-2',
        },
      }}
    />
  );
}
