'use client';
import { useEffect, useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { templatesApi, type MessageTemplate } from '@/lib/shared/templates-api';
import { supportsCampaign } from '@/lib/shared/campaigns-api';

export function CampaignTemplatePicker({
  lineId,
  value,
  onChange,
}: {
  lineId: string;
  value?: MessageTemplate;
  onChange: (template: MessageTemplate) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [cursors, setCursors] = useState<Array<string | undefined>>([undefined]);
  const [next, setNext] = useState<string>();
  const [rows, setRows] = useState<MessageTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const cursor = cursors[cursors.length - 1];
  useEffect(() => {
    if (!lineId || !open) return;
    const abort = new AbortController();
    setLoading(true);
    setError('');
    setRows([]);
    setNext(undefined);
    const timer = setTimeout(() => {
      void templatesApi
        .list(lineId, cursor, abort.signal, search.trim(), 25)
        .then((page) => {
          if (abort.signal.aborted) return;
          setRows(page.data.filter(supportsCampaign));
          setNext(page.nextCursor);
        })
        .catch((err: Error) => {
          if (!abort.signal.aborted) setError(err.message);
        })
        .finally(() => {
          if (!abort.signal.aborted) setLoading(false);
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [lineId, open, search, cursor, retry]);
  return (
    <div className="space-y-2">
      <p id="campaign-template-label">Plantilla aprobada</p>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-labelledby="campaign-template-label"
            aria-expanded={open}
            disabled={!lineId}
            className="w-full justify-between"
          >
            {value ? `${value.name} · ${value.language}` : 'Buscar plantilla'}
            <ChevronsUpDown className="size-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[min(90vw,32rem)] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Buscar por nombre…"
              aria-label="Buscar plantilla por nombre"
              value={search}
              onValueChange={(text) => {
                setSearch(text);
                setCursors([undefined]);
              }}
            />
            <CommandList aria-label="Plantillas aprobadas" aria-busy={loading}>
              {loading && (
                <p role="status" className="p-4 text-sm">
                  Buscando plantillas…
                </p>
              )}
              {error && (
                <p role="alert" className="p-4 text-sm text-destructive">
                  {error}{' '}
                  <Button variant="ghost" onClick={() => setRetry((n) => n + 1)}>
                    Reintentar
                  </Button>
                </p>
              )}
              {!loading && !error && !rows.length && (
                <p className="p-4 text-sm">
                  No hay plantillas compatibles en esta página.
                  {next ? ' Continúa a la siguiente página.' : ''}
                </p>
              )}
              {rows.map((template) => (
                <CommandItem
                  key={template.id}
                  value={template.id}
                  onSelect={() => {
                    onChange(template);
                    setOpen(false);
                  }}
                >
                  <Check className={`size-4 ${template.id === value?.id ? '' : 'opacity-0'}`} />
                  {template.name} · {template.language}
                </CommandItem>
              ))}
            </CommandList>
          </Command>
          <div className="flex items-center justify-between border-t p-2">
            <Button
              variant="ghost"
              size="sm"
              disabled={loading || cursors.length === 1}
              onClick={() => setCursors((c) => c.slice(0, -1))}
            >
              Anterior
            </Button>
            <span className="text-xs">Página {cursors.length}</span>
            <Button
              variant="ghost"
              size="sm"
              disabled={loading || !next}
              onClick={() => setCursors((c) => [...c, next])}
            >
              Siguiente
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
