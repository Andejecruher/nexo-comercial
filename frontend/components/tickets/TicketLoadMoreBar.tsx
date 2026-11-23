'use client';

/**
 * TicketLoadMoreBar — paginación mobile.
 *
 * Reemplaza al scroll infinito: el usuario decide cuándo pedir el siguiente
 * bloque, así que no hay fetch especulativo, ni jank por re-render masivo, ni
 * nodos nuevos fuera del viewport (problema de accesibilidad del infinite
 * scroll).
 *
 * La carga está acotada por `MAX_MOBILE_PAGES`: al llegar al techo se sugiere
 * refinar filtros en lugar de acumular DOM sin límite.
 */

import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

export interface TicketLoadMoreBarProps {
  loaded: number;
  totalItems: number;
  hasNextPage: boolean;
  loading: boolean;
  maxReached?: boolean;
  onLoadMore: () => void;
}

export function TicketLoadMoreBar({
  loaded,
  totalItems,
  hasNextPage,
  loading,
  maxReached = false,
  onLoadMore,
}: TicketLoadMoreBarProps) {
  const progress = totalItems > 0 ? Math.min(100, Math.round((loaded / totalItems) * 100)) : 0;

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-card p-4">
      <div className="space-y-1.5">
        <p className="text-center text-xs text-muted-foreground">
          Mostrando <span className="font-medium text-foreground">{loaded}</span> de{' '}
          <span className="font-medium text-foreground">{totalItems}</span> tickets
        </p>
        <div
          className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Progreso de carga de tickets"
        >
          <div
            className="h-full rounded-full bg-primary transition-[width]"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {hasNextPage && !maxReached && (
        <Button
          variant="outline"
          onClick={onLoadMore}
          disabled={loading}
          className="min-h-12 w-full gap-2"
        >
          {loading ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Cargando…
            </>
          ) : (
            'Cargar más tickets'
          )}
        </Button>
      )}

      {maxReached && hasNextPage && (
        <p className="text-center text-xs text-muted-foreground">
          Llegaste al límite de carga continua. Refiná los filtros para ver más resultados.
        </p>
      )}

      <p className="sr-only" aria-live="polite">
        {loading ? 'Cargando más tickets' : `${loaded} de ${totalItems} tickets cargados`}
      </p>
    </div>
  );
}
