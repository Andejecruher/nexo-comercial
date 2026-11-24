'use client';
import { CitizenTable } from '@/components/shared/citizens/CitizenTable';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MAX_CAMPAIGN_RECIPIENTS } from '@/lib/shared/campaign-csv';
import { citizensApi, type Citizen } from '@/lib/shared/citizens-api';
import { useEffect, useRef, useState } from 'react';

const SEARCH_DEBOUNCE_MS = 300;
const PAGE_SIZE = 50;

export function CampaignAudiencePicker({
  selected,
  onChange,
}: {
  selected: Record<string, Citizen>;
  onChange: (citizens: Record<string, Citizen>) => void;
}) {
  const [search, setSearch] = useState('');
  const [cursor, setCursor] = useState<string>();
  const [cursorHistory, setCursorHistory] = useState<Array<string | undefined>>([]);
  const [rows, setRows] = useState<Citizen[]>([]);
  const [nextCursor, setNextCursor] = useState<string>();
  const [hasNextPage, setHasNextPage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);

  // Estado de búsqueda debounced: no se dispara una petición por cada tecla.
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setCursor(undefined);
      setCursorHistory([]);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(debounceTimer.current);
  }, [search]);

  useEffect(() => {
    const abort = new AbortController();
    setLoading(true);
    setError('');
    void citizensApi
      .list(
        {
          cursor,
          limit: PAGE_SIZE,
          search: debouncedSearch || undefined,
          consentGiven: true,
          hasPhone: true,
        },
        abort.signal,
      )
      .then((result) => {
        if (abort.signal.aborted) return;
        if (!result.ok) {
          setError(result.message);
          setRows([]);
          setNextCursor(undefined);
          setHasNextPage(false);
          return;
        }
        setRows(result.data.citizens);
        setNextCursor(result.data.meta.nextCursor);
        setHasNextPage(result.data.meta.hasNextPage);
      })
      .catch((err: unknown) => {
        if (abort.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'No se pudo cargar la audiencia');
        setRows([]);
        setNextCursor(undefined);
        setHasNextPage(false);
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => {
      abort.abort();
    };
  }, [cursor, debouncedSearch, retry]);

  const nextPage = () => {
    if (!hasNextPage || !nextCursor) return;
    setCursorHistory((history) => [...history, cursor]);
    setCursor(nextCursor);
  };

  const previousPage = () => {
    if (cursorHistory.length === 0) return;
    const history = [...cursorHistory];
    const previousCursor = history.pop();
    setCursorHistory(history);
    setCursor(previousCursor);
  };

  const toggle = (citizens: Citizen[]) => {
    const next = { ...selected };
    const remove = citizens.every((c) => next[c.id]);
    for (const c of citizens) {
      if (remove) delete next[c.id];
      else next[c.id] = c;
    }
    if (Object.keys(next).length > MAX_CAMPAIGN_RECIPIENTS) {
      setError('Máximo 2000 destinatarios');
      return;
    }
    setError('');
    onChange(next);
  };
  return (
    <div className="space-y-4">
      <label className="block space-y-1">
        <span>Buscar por nombre o teléfono</span>
        <Input
          type="search"
          maxLength={100}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>
      <p>
        {Object.keys(selected).length} seleccionados · Solo ciudadanos con consentimiento y
        teléfono.
      </p>
      {error && (
        <p role="alert" className="text-destructive">
          {error}{' '}
          <Button variant="ghost" onClick={() => setRetry((n) => n + 1)}>
            Reintentar
          </Button>
        </p>
      )}
      <CitizenTable
        citizens={rows}
        loading={loading && rows.length === 0}
        selectedCitizenIds={Object.keys(selected)}
        onToggleCitizen={(id) => toggle(rows.filter((c) => c.id === id))}
        onToggleSelectAll={() => toggle(rows)}
      />
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          disabled={loading || cursorHistory.length === 0}
          onClick={previousPage}
        >
          Anterior
        </Button>
        <span>
          Página {cursorHistory.length + 1} · {rows.length} ciudadanos en esta página
        </span>
        <Button
          variant="outline"
          disabled={loading || !hasNextPage || !nextCursor}
          onClick={nextPage}
        >
          Siguiente
        </Button>
      </div>
    </div>
  );
}
