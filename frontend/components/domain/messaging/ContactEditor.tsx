'use client';
import type { Citizen } from '@/lib/citizens-api';
import { citizensApi } from '@/lib/citizens-api';
import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

function displayName(citizen: Citizen): string {
  return [citizen.name, citizen.lastName].filter(Boolean).join(' ').trim() || 'Sin nombre';
}

export function ContactEditor({
  open,
  onOpenChange,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (contact: { citizenId: string; name: string }) => void;
}) {
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<Citizen[]>([]);
  const [selected, setSelected] = useState<Citizen>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2 || selected) {
      setMatches([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError(undefined);
      void citizensApi
        .list({ search: term, hasPhone: true, limit: 10 }, controller.signal)
        .then((result) => {
          if (controller.signal.aborted) return;
          if (result.ok) setMatches(result.data.citizens);
          else setError(result.message);
          setLoading(false);
        });
    }, 250);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query, selected]);

  const reset = () => {
    setQuery('');
    setMatches([]);
    setSelected(undefined);
    setError(undefined);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Compartir contacto</DialogTitle>
          <DialogDescription>Busca y selecciona un ciudadano registrado.</DialogDescription>
        </DialogHeader>
        {selected ? (
          <div className="space-y-2 rounded-lg border bg-muted/30 p-3 text-sm">
            <p className="font-medium">{displayName(selected)}</p>
            <p className="text-muted-foreground">{selected.phone}</p>
            {selected.email ? <p className="text-muted-foreground">{selected.email}</p> : null}
            {selected.neighborhood ? (
              <p className="text-muted-foreground">{selected.neighborhood}</p>
            ) : null}
            <Button type="button" variant="outline" size="sm" onClick={reset}>
              Cambiar ciudadano
            </Button>
          </div>
        ) : (
          <label className="space-y-1.5 text-sm font-medium">
            Buscar ciudadano
            <Input
              autoFocus
              value={query}
              placeholder="Nombre, teléfono o correo"
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
        )}
        {!selected && query.trim().length >= 2 ? (
          <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border p-1" role="listbox">
            {loading ? <p className="px-2 py-1 text-sm text-muted-foreground">Buscando…</p> : null}
            {error ? <p className="px-2 py-1 text-sm text-destructive">{error}</p> : null}
            {!loading && !error && matches.length === 0 ? (
              <p className="px-2 py-1 text-sm text-muted-foreground">Sin resultados</p>
            ) : null}
            {matches.map((citizen) => (
              <button
                key={citizen.id}
                type="button"
                role="option"
                aria-selected={false}
                className="w-full rounded-md px-2 py-2 text-left text-sm hover:bg-muted"
                onClick={() => setSelected(citizen)}
              >
                <span className="block font-medium">{displayName(citizen)}</span>
                <span className="block text-muted-foreground">
                  {[citizen.phone, citizen.email].filter(Boolean).join(' · ')}
                </span>
              </button>
            ))}
          </div>
        ) : null}
        <Button
          disabled={!selected}
          onClick={() => {
            if (!selected) return;
            onAdd({ citizenId: selected.id, name: displayName(selected) });
            reset();
            onOpenChange(false);
          }}
        >
          Añadir al mensaje
        </Button>
      </DialogContent>
    </Dialog>
  );
}
