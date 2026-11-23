/**
 * PaginationControls — Controles de navegación de paginación
 *
 * Botones Previous/Next, indicador de página actual y total de items.
 * Page size y totalPages son opcionales para no romper listados cursor-based.
 */

'use client';

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export interface PaginationControlsProps {
  currentPage: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  totalCount: number;
  loading: boolean;
  onNext: () => void;
  onPrevious: () => void;
  onFirst: () => void;
  totalPages?: number;
  pageSize?: number;
  pageSizeOptions?: number[];
  onPageSizeChange?: (size: number) => void;
}

export function PaginationControls({
  currentPage,
  hasNextPage,
  hasPreviousPage,
  totalCount,
  loading,
  onNext,
  onPrevious,
  onFirst,
  totalPages,
  pageSize,
  pageSizeOptions,
  onPageSizeChange,
}: PaginationControlsProps) {
  const showPageSize =
    Boolean(onPageSizeChange) && Array.isArray(pageSizeOptions) && pageSizeOptions.length > 0;
  const isSinglePage = totalPages != null ? totalPages <= 1 : currentPage === 1 && !hasNextPage;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="text-sm text-muted-foreground">
          Total: <span className="font-medium text-foreground">{totalCount}</span> registros
        </div>
        {showPageSize && onPageSizeChange && pageSizeOptions && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Filas</span>
            <Select
              value={String(pageSize ?? pageSizeOptions[0])}
              onValueChange={(value) => onPageSizeChange(Number(value))}
              disabled={loading}
            >
              <SelectTrigger size="sm" className="min-w-16" aria-label="Filas por página">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {pageSizeOptions.map((option) => (
                  <SelectItem key={option} value={String(option)}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">Página</span>
        <span className="font-medium">{currentPage}</span>
        {totalPages != null && totalPages > 0 && (
          <>
            <span className="text-muted-foreground">de</span>
            <span className="font-medium">{totalPages}</span>
          </>
        )}
        {isSinglePage && totalPages == null && (
          <span className="text-muted-foreground">(única)</span>
        )}
      </div>

      <div className="flex items-center gap-2">
        {currentPage > 1 && (
          <Button
            variant="outline"
            size="sm"
            onClick={onFirst}
            disabled={loading || !hasPreviousPage}
            className="gap-1"
          >
            Primera
          </Button>
        )}

        <Button
          variant="outline"
          size="sm"
          onClick={onPrevious}
          disabled={loading || !hasPreviousPage}
          className="gap-1"
        >
          <ChevronLeft className="size-4" />
          Anterior
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={onNext}
          disabled={loading || !hasNextPage}
          className="gap-1"
        >
          Siguiente
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}
