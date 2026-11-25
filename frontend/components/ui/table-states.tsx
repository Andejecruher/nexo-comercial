import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/shared/utils';

export function TableSkeleton({
  headers,
  rows = 5,
  embedded = false,
}: {
  headers: string[];
  rows?: number;
  embedded?: boolean;
}) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-xl border border-slate-200 bg-card shadow-sm',
        embedded && 'rounded-none border-0 shadow-none',
      )}
      role="status"
      aria-label="Cargando datos"
    >
      <Table>
        <TableHeader>
          <TableRow>
            {headers.map((header, index) => (
              <TableHead
                key={`${header}-${index}`}
                className={header === 'Acciones' ? 'text-right' : undefined}
              >
                {header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: rows }, (_, row) => (
            <TableRow key={row}>
              {headers.map((header, column) => (
                <TableCell key={`${header}-${column}`}>
                  <Skeleton className="h-4 w-full max-w-32 bg-muted" />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function TableEmptyState({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <Empty className="min-h-75">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        {description && <EmptyDescription>{description}</EmptyDescription>}
      </EmptyHeader>
      {children && <EmptyContent>{children}</EmptyContent>}
    </Empty>
  );
}
