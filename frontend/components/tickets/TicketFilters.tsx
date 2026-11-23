'use client';

/**
 * TicketFilters — Barra de filtros para el listado de tickets.
 *
 * Filtros: status, prioridad, búsqueda libre (nombre/teléfono/id).
 */

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type {
  TicketFilters as TicketFiltersState,
  TicketPriorityFilter,
  TicketStatusFilter,
} from '@/lib/tickets-api';
import { Search, X } from 'lucide-react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';

const SEARCH_DEBOUNCE_MS = 350;

interface TicketFiltersProps {
  filters: TicketFiltersState;
  onStatusChange: (status: TicketStatusFilter) => void;
  onPriorityChange: (priority: TicketPriorityFilter) => void;
  onSearchChange: (search: string) => void;
  onClear: () => void;
}

const hasActiveFilters = (f: TicketFiltersState): boolean =>
  f.status !== 'all' || f.priority !== 'all' || !!f.search.trim();

export const TicketFilters = memo(function TicketFilters({
  filters,
  onStatusChange,
  onPriorityChange,
  onSearchChange,
  onClear,
}: TicketFiltersProps) {
  const searchRef = useRef<HTMLInputElement>(null);

  /**
   * Borrador local de la búsqueda.
   *
   * Los filtros son server-side y viven en la URL: emitir `onSearchChange` en
   * cada tecla dispararía una request y un `router.replace` por pulsación.
   * El borrador mantiene el input responsive y el valor se propaga debounced.
   */
  const [searchDraft, setSearchDraft] = useState(filters.search);

  // Cambios externos (limpiar filtros, navegación, atrás/adelante).
  useEffect(() => {
    setSearchDraft(filters.search);
  }, [filters.search]);

  useEffect(() => {
    if (searchDraft === filters.search) return;
    const timer = window.setTimeout(() => onSearchChange(searchDraft), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [searchDraft, filters.search, onSearchChange]);

  const handleSearchClear = useCallback(() => {
    setSearchDraft('');
    onSearchChange('');
    searchRef.current?.focus();
  }, [onSearchChange]);

  return (
    <div className="grid min-w-0 grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-center">
      {/* Búsqueda */}
      <div className="relative min-w-0 sm:flex-1 sm:basis-64">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <Input
          ref={searchRef}
          value={searchDraft}
          onChange={(e) => setSearchDraft(e.target.value)}
          placeholder="Buscar ciudadano, teléfono, ID…"
          className="h-11 pl-8 pr-12 text-base sm:text-sm"
          aria-label="Buscar tickets"
        />
        {searchDraft && (
          <button
            onClick={handleSearchClear}
            type="button"
            className="absolute right-0 top-0 flex size-11 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
            aria-label="Limpiar búsqueda"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Status */}
      <Select value={filters.status} onValueChange={(v) => onStatusChange(v as TicketStatusFilter)}>
        <SelectTrigger
          size="sm"
          className="min-h-11 w-full min-w-0 cursor-pointer sm:w-44"
          aria-label="Filtrar por estado"
        >
          <SelectValue placeholder="Estado" />
        </SelectTrigger>
        <SelectContent className="[&_[role=option]]:min-h-11 [&_[role=option]]:cursor-pointer">
          <SelectItem value="all">Todos los estados</SelectItem>
          <SelectItem value="OPEN">Nuevo Reporte</SelectItem>
          <SelectItem value="IN_PROGRESS">En Gestión</SelectItem>
          <SelectItem value="RESOLVED">Canalizado</SelectItem>
          <SelectItem value="CLOSED">Caso Resuelto</SelectItem>
        </SelectContent>
      </Select>

      {/* Priority */}
      <Select
        value={filters.priority}
        onValueChange={(v) => onPriorityChange(v as TicketPriorityFilter)}
      >
        <SelectTrigger
          size="sm"
          className="min-h-11 w-full min-w-0 cursor-pointer sm:w-44"
          aria-label="Filtrar por prioridad"
        >
          <SelectValue placeholder="Prioridad" />
        </SelectTrigger>
        <SelectContent className="[&_[role=option]]:min-h-11 [&_[role=option]]:cursor-pointer">
          <SelectItem value="all">Toda prioridad</SelectItem>
          <SelectItem value="URGENT">Urgente</SelectItem>
          <SelectItem value="HIGH">Alta</SelectItem>
          <SelectItem value="MEDIUM">Media</SelectItem>
          <SelectItem value="LOW">Baja</SelectItem>
        </SelectContent>
      </Select>

      {/* Clear filters */}
      {hasActiveFilters(filters) && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onClear}
          className="min-h-11 cursor-pointer gap-1.5 text-muted-foreground"
        >
          <X className="w-3.5 h-3.5" />
          Limpiar
        </Button>
      )}
    </div>
  );
});
