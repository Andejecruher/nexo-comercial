/**
 * SharedFilters — Componente reutilizable para barra de búsqueda y filtros de catálogos
 *
 * Extrae patrón común de search input + badges de filtros activos.
 * Preparado para reuso en vistas de catálogos y en citizens filters.
 */

'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, X } from 'lucide-react';

export interface FilterBadge {
  key: string;
  label: string;
  value: string;
  onRemove: () => void;
}

interface SharedFiltersProps {
  /** Search input value */
  search: string;
  /** Search input onChange handler */
  onSearchChange: (value: string) => void;
  /** Search input placeholder */
  searchPlaceholder?: string;
  /** Array of active filters to display as badges */
  activeFilters?: FilterBadge[];
  /** Clear all filters handler */
  onClearAll?: () => void;
  /** Additional filter controls (selects, switches, etc) */
  children?: React.ReactNode;
}

export function SharedFilters({
  search,
  onSearchChange,
  searchPlaceholder = 'Buscar...',
  activeFilters = [],
  onClearAll,
  children,
}: SharedFiltersProps) {
  const hasActiveFilters = search.trim() !== '' || activeFilters.length > 0;

  return (
    <div className="space-y-3">
      {/* Search + Additional Controls */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Additional Controls */}
        {children}

        {/* Clear All Button */}
        {hasActiveFilters && onClearAll && (
          <Button variant="ghost" size="sm" onClick={onClearAll}>
            <X className="w-4 h-4 mr-1" />
            Limpiar
          </Button>
        )}
      </div>

      {/* Active Filters Badges */}
      {hasActiveFilters && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground">Filtros activos:</span>

          {/* Search Badge */}
          {search.trim() !== '' && (
            <Badge variant="secondary" className="gap-1">
              Búsqueda: {search}
              <button onClick={() => onSearchChange('')} className="hover:text-foreground">
                <X className="w-3 h-3" />
              </button>
            </Badge>
          )}

          {/* Filter Badges */}
          {activeFilters.map((filter) => (
            <Badge key={filter.key} variant="secondary" className="gap-1">
              {filter.label}: {filter.value}
              <button onClick={filter.onRemove} className="hover:text-foreground">
                <X className="w-3 h-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
