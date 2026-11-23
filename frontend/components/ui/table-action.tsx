import * as React from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type TableActionProps = Omit<
  React.ComponentProps<typeof Button>,
  'size' | 'variant' | 'aria-label'
> & {
  label: string;
  tone?: 'neutral' | 'primary' | 'danger';
  touch?: boolean;
};

export function TableAction({
  label,
  tone = 'neutral',
  touch = false,
  asChild = false,
  className,
  title,
  children,
  ...props
}: TableActionProps) {
  return (
    <Button
      type={asChild ? undefined : 'button'}
      asChild={asChild}
      variant="ghost"
      size="icon"
      aria-label={label}
      title={title ?? label}
      className={cn(
        'size-8 cursor-pointer rounded-md p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 [&_svg]:size-3.5',
        touch && 'size-11',
        tone === 'primary' && 'hover:bg-blue-50 hover:text-blue-600',
        tone === 'danger' && 'hover:bg-red-50 hover:text-red-600 focus-visible:ring-destructive/30',
        className,
      )}
      {...props}
    >
      {children}
    </Button>
  );
}
