'use client';

import { Button } from '@/components/ui/button';
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { neighborhoodsApi } from '@/lib/catalog-api';
import { cn } from '@/lib/utils';
import { Check, ChevronsUpDown } from 'lucide-react';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';

export type BarrioOption = { id: string; name: string; municipality?: string };

/**
 * El catálogo abarca varios municipios, así que los nombres de colonia pueden
 * repetirse: la etiqueta los acompaña del municipio para que sean distinguibles.
 */
export function formatBarrioLabel(name: string, municipality?: string | null): string {
  return municipality ? `${name}, ${municipality}` : name;
}

export interface BarrioSelectComboboxProps {
  /** Id del barrio seleccionado. `null`/`undefined` = sin barrio asignado. */
  value?: string | null;
  /** Nombre del barrio ya asignado, para edición cuando no viene en la primera página. */
  selectedLabel?: string | null;
  onChange: (option: BarrioOption | null) => void;
  /** En false el barrio es obligatorio: desaparece el item para desasignarlo. */
  allowNone?: boolean;
  placeholder?: string;
  noneLabel?: string;
  emptyLabel?: string;
  isDisabled?: boolean;
  error?: string;
  className?: string;
  triggerClassName?: string;
  id?: string;
  /** Etiqueta accesible del trigger cuando el `Label` externo no basta. */
  ariaLabel?: string;
}

const PAGE_SIZE = 20;
const DEBOUNCE_MS = 300;

/** cmdk necesita un valor no vacío para el item de "sin barrio". */
const NO_BARRIO_ITEM = '__sin_barrio__';

export function BarrioSelectCombobox({
  value,
  selectedLabel,
  onChange,
  allowNone = true,
  placeholder = 'Buscar barrio o colonia...',
  noneLabel = 'Sin barrio asignado',
  emptyLabel,
  isDisabled,
  error,
  className,
  triggerClassName,
  id,
  ariaLabel,
}: BarrioSelectComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [items, setItems] = useState<BarrioOption[]>([]);
  const [nextCursor, setNextCursor] = useState<string | undefined>(undefined);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [loadingFirstPage, setLoadingFirstPage] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const listId = useId();
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);
  // Las respuestas de páginas y búsquedas viejas se descartan por generación.
  const requestRef = useRef(0);

  const emptyCopy = emptyLabel ?? 'No se encontraron barrios';
  const disabled = Boolean(isDisabled);

  useEffect(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const host = trigger.closest('[data-slot="dialog-content"], [data-slot="drawer-content"]');
    setPortalContainer(host instanceof HTMLElement ? host : null);
  }, [open]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const fetchPage = useCallback(
    async (cursor?: string) => {
      const request = ++requestRef.current;
      if (cursor) setLoadingMore(true);
      else setLoadingFirstPage(true);
      setLoadError(null);

      const result = await neighborhoodsApi.list({
        limit: PAGE_SIZE,
        ...(debouncedQuery ? { search: debouncedQuery } : {}),
        ...(cursor ? { cursor } : {}),
      });

      if (request !== requestRef.current) return;

      if (result.ok) {
        const page = result.data.neighborhoods.map((neighborhood) => ({
          id: neighborhood.id,
          name: neighborhood.name,
          ...(neighborhood.municipality ? { municipality: neighborhood.municipality } : {}),
        }));
        setItems((current) => (cursor ? mergeById(current, page) : page));
        setNextCursor(result.data.meta?.nextCursor);
        setHasNextPage(Boolean(result.data.meta?.hasNextPage));
      } else {
        if (!cursor) setItems([]);
        setHasNextPage(false);
        setLoadError(result.message);
      }

      setLoadingFirstPage(false);
      setLoadingMore(false);
    },
    [debouncedQuery],
  );

  // Carga diferida: solo se consulta el catálogo con el desplegable abierto.
  useEffect(() => {
    if (!open || disabled) return;
    void fetchPage();
  }, [disabled, fetchPage, open]);

  const loadMore = useCallback(() => {
    if (!hasNextPage || !nextCursor || loadingFirstPage || loadingMore) return;
    void fetchPage(nextCursor);
  }, [fetchPage, hasNextPage, loadingFirstPage, loadingMore, nextCursor]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!open || !sentinel || !hasNextPage || loadingFirstPage) return;
    if (typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadMore();
      },
      // El margen inferior anticipa la carga antes de tocar el final del listado.
      { root: listRef.current, rootMargin: '0px 0px 96px 0px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasNextPage, loadMore, loadingFirstPage, open]);

  const selectedFromList = items.find((item) => item.id === value);
  const selectedFullLabel = selectedFromList
    ? formatBarrioLabel(selectedFromList.name, selectedFromList.municipality)
    : selectedLabel;
  const triggerLabel = value ? (selectedFullLabel ?? 'Barrio asignado') : placeholder;

  // Con búsqueda vacía el barrio ya asignado se mantiene visible aunque su página
  // no esté cargada, para que la marca de selección sea consistente en edición.
  const visibleItems = useMemo(() => {
    if (!value || debouncedQuery || selectedFromList) return items;
    const label = selectedLabel ?? undefined;
    return label ? [{ id: value, name: label }, ...items] : items;
  }, [debouncedQuery, items, selectedFromList, selectedLabel, value]);

  const showEmpty = !loadingFirstPage && !loadingMore && !loadError && visibleItems.length === 0;

  const handleSelect = (option: BarrioOption | null) => {
    onChange(option);
    setOpen(false);
  };

  return (
    <div className={cn('space-y-1.5', className)}>
      <Popover
        open={open}
        onOpenChange={(next) => {
          if (disabled) return;
          setOpen(next);
          if (!next) setQuery('');
        }}
      >
        <PopoverTrigger asChild>
          <Button
            ref={triggerRef}
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-haspopup="listbox"
            {...(ariaLabel ? { 'aria-label': ariaLabel } : {})}
            aria-invalid={Boolean(error)}
            disabled={disabled}
            className={cn(
              'h-11 w-full justify-between rounded-lg bg-background font-normal shadow-xs',
              value ? 'text-foreground' : 'text-muted-foreground',
              error
                ? 'border-destructive focus-visible:border-destructive focus-visible:ring-destructive/20'
                : 'focus-visible:border-primary focus-visible:ring-primary/20',
              triggerClassName,
            )}
          >
            <TruncatedBarrioName text={triggerLabel} />
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" aria-hidden="true" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={6}
          {...(portalContainer ? { container: portalContainer } : {})}
          onWheel={(event) => event.stopPropagation()}
          onTouchMove={(event) => event.stopPropagation()}
          className="pointer-events-auto z-60 w-(--radix-popover-trigger-width) max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg p-0"
        >
          <Command shouldFilter={false} className="bg-popover">
            <CommandInput
              value={query}
              onValueChange={setQuery}
              placeholder={placeholder}
              autoComplete="off"
              aria-label="Buscar barrio o colonia"
            />
            <CommandList id={listId} ref={listRef} className="max-h-60 overscroll-contain">
              {loadingFirstPage && (
                <div className="space-y-2 p-2" role="status" aria-label="Cargando barrios">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-4/5" />
                  <Skeleton className="h-8 w-3/5" />
                </div>
              )}

              {loadError && (
                <p role="alert" className="px-3 py-2 text-xs text-destructive">
                  {loadError}
                </p>
              )}

              {/* El item fijo "sin barrio" cuenta como resultado para cmdk, así que
                  el vacío se resuelve acá en lugar de con CommandEmpty. */}
              {showEmpty && (
                <p className="px-3 py-6 text-center text-sm text-muted-foreground">{emptyCopy}</p>
              )}

              {allowNone && !debouncedQuery && (
                <CommandGroup>
                  <CommandItem
                    value={NO_BARRIO_ITEM}
                    onSelect={() => handleSelect(null)}
                    className="cursor-pointer aria-selected:bg-primary/12"
                  >
                    <Check
                      className={cn('mr-2 h-4 w-4 shrink-0 text-primary', value && 'opacity-0')}
                      aria-hidden="true"
                    />
                    <span className="text-muted-foreground">{noneLabel}</span>
                  </CommandItem>
                </CommandGroup>
              )}

              {visibleItems.length > 0 && (
                <CommandGroup>
                  {visibleItems.map((option) => (
                    <CommandItem
                      key={option.id}
                      value={option.id}
                      onSelect={() => handleSelect(option)}
                      className="cursor-pointer aria-selected:bg-primary/12"
                    >
                      <Check
                        className={cn(
                          'mr-2 h-4 w-4 shrink-0 text-primary',
                          value === option.id ? 'opacity-100' : 'opacity-0',
                        )}
                        aria-hidden="true"
                      />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <TruncatedBarrioName text={option.name} />
                        {option.municipality && (
                          <TruncatedBarrioName
                            text={option.municipality}
                            className="text-xs text-muted-foreground"
                          />
                        )}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}

              {hasNextPage && !loadingFirstPage && (
                <div
                  ref={sentinelRef}
                  className="flex items-center justify-center gap-2 px-3 py-2 text-xs text-muted-foreground"
                >
                  {loadingMore ? (
                    <>
                      <Spinner className="size-3" aria-hidden="true" />
                      <span>Cargando más barrios...</span>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={loadMore}
                      className="text-xs text-primary underline-offset-2 hover:underline"
                    >
                      Cargar más barrios
                    </button>
                  )}
                </div>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * El tooltip solo aparece cuando el nombre no cabe en su ancho disponible; se mide
 * al intentar abrir para que siga siendo correcto si cambia el ancho del desplegable.
 */
function TruncatedBarrioName({ text, className }: { text: string; className?: string }) {
  const labelRef = useRef<HTMLSpanElement | null>(null);
  const [open, setOpen] = useState(false);

  return (
    <Tooltip
      open={open}
      onOpenChange={(next) => {
        const label = labelRef.current;
        setOpen(next && Boolean(label && label.scrollWidth > label.clientWidth));
      }}
    >
      <TooltipTrigger asChild>
        <span ref={labelRef} className={cn('min-w-0 truncate', className)}>
          {text}
        </span>
      </TooltipTrigger>
      {/* El PopoverContent usa z-60, así que el tooltip necesita quedar por encima. */}
      <TooltipContent side="top" className="z-70 max-w-xs">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}

function mergeById(current: BarrioOption[], incoming: BarrioOption[]): BarrioOption[] {
  const seen = new Set(current.map((item) => item.id));
  return [...current, ...incoming.filter((item) => !seen.has(item.id))];
}
