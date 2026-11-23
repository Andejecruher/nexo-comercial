'use client';

/**
 * TicketPaginationBar — paginación numerada para desktop.
 *
 * Ventana de páginas con elipsis: `1 … 4 5 [6] 7 8 … 15`.
 * Siempre visibles primera y última; los extremos colapsan con elipsis.
 *
 * Accesibilidad:
 *  - `<nav aria-label>` como landmark de navegación.
 *  - `aria-current="page"` en la página activa.
 *  - Controles de 44px (`size-11`) aptos para touch aunque sea desktop.
 *  - `aria-live` porque cambiar de página no mueve el foco.
 */

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PAGE_SIZE_OPTIONS } from '@/hooks/tickets/useResponsivePagination';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

export interface TicketPaginationBarProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemsPerPage: number;
  disabled?: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
}

export type PageToken = number | 'ellipsis-left' | 'ellipsis-right';

/**
 * Calcula los tokens de página a renderizar.
 *
 * Ventana estable: `1 2 3 … 15` al inicio, `1 … 6 7 8 … 15` en el medio,
 * `1 … 13 14 15` al final. La elipsis solo aparece cuando el salto es real
 * (más de una página oculta), así nunca se renderiza "1 … 3".
 *
 * @param siblings cantidad de vecinos a cada lado de la página actual.
 */
export function buildPageTokens(
  currentPage: number,
  totalPages: number,
  siblings = 1,
): PageToken[] {
  if (totalPages < 1) return [];
  if (currentPage < 1 || currentPage > totalPages) return [];

  const range = (from: number, to: number) =>
    Array.from({ length: to - from + 1 }, (_, index) => from + index);

  const edge = Math.max(2, siblings + 2);

  // Entran todas sin colapsar nada.
  if (totalPages <= edge * 2 + 1) return range(1, totalPages);

  const windowStart = Math.max(1, currentPage - siblings);
  const windowEnd = Math.min(totalPages, currentPage + siblings);

  // Ventana pegada al inicio: solo colapsa la derecha.
  if (windowStart <= edge + 1) {
    if (windowEnd >= totalPages - edge) return range(1, totalPages);
    return [...range(1, Math.max(edge, windowEnd)), 'ellipsis-right', totalPages];
  }

  // Ventana pegada al final: solo colapsa la izquierda.
  if (windowEnd >= totalPages - edge) {
    return [1, 'ellipsis-left', ...range(Math.min(windowStart, totalPages - edge + 1), totalPages)];
  }

  return [1, 'ellipsis-left', ...range(windowStart, windowEnd), 'ellipsis-right', totalPages];
}

export function TicketPaginationBar({
  currentPage,
  totalPages,
  totalItems,
  itemsPerPage,
  disabled = false,
  onPageChange,
  onPageSizeChange,
}: TicketPaginationBarProps) {
  if (totalItems === 0) return null;

  const tokens = buildPageTokens(currentPage, totalPages);
  const isFirstPage = currentPage <= 1;
  const isLastPage = currentPage >= totalPages;
  const firstVisible = (currentPage - 1) * itemsPerPage + 1;
  const lastVisible = Math.min(currentPage * itemsPerPage, totalItems);

  return (
    <nav
      aria-label="Paginación de tickets"
      className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-card px-4 py-3"
    >
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">
            {firstVisible}–{lastVisible}
          </span>{' '}
          de <span className="font-medium text-foreground">{totalItems}</span>
        </p>

        {onPageSizeChange && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Filas</span>
            <Select
              value={String(itemsPerPage)}
              onValueChange={(value) => onPageSizeChange(Number(value))}
              disabled={disabled}
            >
              <SelectTrigger size="sm" className="min-w-16" aria-label="Filas por página">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZE_OPTIONS.map((option) => (
                  <SelectItem key={option} value={String(option)}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          className="size-11"
          onClick={() => onPageChange(1)}
          disabled={disabled || isFirstPage}
          aria-label="Primera página"
        >
          <ChevronsLeft className="size-4" aria-hidden="true" />
        </Button>

        <Button
          variant="outline"
          size="icon"
          className="size-11"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={disabled || isFirstPage}
          aria-label="Página anterior"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
        </Button>

        {tokens.map((token) =>
          typeof token === 'number' ? (
            <Button
              key={token}
              variant={token === currentPage ? 'default' : 'ghost'}
              size="icon"
              className="size-11 text-sm"
              onClick={() => onPageChange(token)}
              disabled={disabled}
              aria-label={`Página ${token}`}
              aria-current={token === currentPage ? 'page' : undefined}
            >
              {token}
            </Button>
          ) : (
            <span
              key={token}
              className="flex size-11 items-center justify-center text-sm text-muted-foreground"
              aria-hidden="true"
            >
              …
            </span>
          ),
        )}

        <Button
          variant="outline"
          size="icon"
          className="size-11"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={disabled || isLastPage}
          aria-label="Página siguiente"
        >
          <ChevronRight className="size-4" aria-hidden="true" />
        </Button>

        <Button
          variant="outline"
          size="icon"
          className="size-11"
          onClick={() => onPageChange(totalPages)}
          disabled={disabled || isLastPage}
          aria-label="Última página"
        >
          <ChevronsRight className="size-4" aria-hidden="true" />
        </Button>
      </div>

      <p className="sr-only" aria-live="polite">
        Página {currentPage} de {totalPages}
      </p>
    </nav>
  );
}
