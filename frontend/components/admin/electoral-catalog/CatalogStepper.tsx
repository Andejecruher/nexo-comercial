'use client';

import { cn } from '@/lib/utils';
import { Check } from 'lucide-react';

export interface CatalogStepperStep {
  id: number;
  label: string;
}

interface CatalogStepperProps {
  steps: CatalogStepperStep[];
  current: number;
  completed: number[];
  onStepClick?: (step: number) => void;
  disabled?: boolean;
}

export function CatalogStepper({
  steps,
  current,
  completed,
  onStepClick,
  disabled = false,
}: CatalogStepperProps) {
  return (
    <ol className="flex flex-wrap items-center gap-1.5" aria-label="Niveles del catálogo">
      {steps.map((step) => {
        const isCompleted = completed.includes(step.id);
        const isCurrent = step.id === current;
        const canNavigate = Boolean(onStepClick) && !disabled && !isCurrent;

        return (
          <li key={step.id}>
            <button
              type="button"
              aria-current={isCurrent ? 'step' : undefined}
              disabled={!canNavigate}
              onClick={() => canNavigate && onStepClick?.(step.id)}
              className={cn(
                'flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
                isCurrent
                  ? 'border-primary bg-primary text-primary-foreground'
                  : isCompleted
                    ? 'border-primary/30 bg-primary/10 text-primary'
                    : 'border-border bg-muted text-muted-foreground',
                canNavigate ? 'cursor-pointer hover:border-primary/60' : 'cursor-default',
              )}
            >
              <span
                className={cn(
                  'flex size-5 items-center justify-center rounded-full text-[11px] font-black',
                  isCurrent
                    ? 'bg-primary-foreground/20 text-primary-foreground'
                    : isCompleted
                      ? 'bg-primary/15 text-primary'
                      : 'bg-background text-muted-foreground',
                )}
              >
                {isCompleted ? <Check aria-hidden="true" className="size-3" /> : step.id}
              </span>
              <span className="whitespace-nowrap">{step.label}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
