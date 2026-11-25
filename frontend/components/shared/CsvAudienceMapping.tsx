'use client';
import { useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { MAX_CSV_BYTES, parseCampaignCsv } from '@/lib/shared/campaign-csv';
import type { Mapping, Row } from '@/lib/shared/campaigns-api';
export const selectClass = 'w-full rounded-md border bg-background px-3 py-2 text-sm';
export function CsvAudience({
  headers,
  rows,
  phoneColumn,
  onChange,
  onPhoneColumn,
}: {
  headers: string[];
  rows: Row[];
  phoneColumn: string;
  onChange: (headers: string[], rows: Row[]) => void;
  onPhoneColumn: (column: string) => void;
}) {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [delimiter, setDelimiter] = useState(',');
  const version = useRef(0);
  const input = useRef<HTMLInputElement>(null);
  const parse = async (file?: File) => {
    const current = ++version.current;
    onChange([], []);
    onPhoneColumn('');
    setError('');
    if (!file) return;
    if (file.size > MAX_CSV_BYTES) {
      setError('El archivo supera 2 MB');
      return;
    }
    setLoading(true);
    try {
      const parsed = parseCampaignCsv(await file.text(), delimiter);
      if (current === version.current) onChange(parsed.headers, parsed.rows);
    } catch (err) {
      if (current === version.current)
        setError(err instanceof Error ? err.message : 'CSV inválido');
    } finally {
      if (current === version.current) setLoading(false);
    }
  };
  return (
    <div className="space-y-4">
      <label className="block space-y-1">
        <span>Separador CSV</span>
        <select
          className={selectClass}
          value={delimiter}
          disabled={loading}
          onChange={(e) => {
            version.current++;
            setDelimiter(e.target.value);
            onChange([], []);
            onPhoneColumn('');
            if (input.current) input.current.value = '';
          }}
        >
          <option value=",">Coma (,)</option>
          <option value=";">Punto y coma (;)</option>
        </select>
      </label>
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void parse(e.dataTransfer.files?.[0]);
        }}
        className={`flex min-h-[160px] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
          dragging
            ? 'border-primary bg-primary/5'
            : 'border-muted-foreground/30 hover:border-primary/60'
        }`}
      >
        <Upload className="size-8 text-muted-foreground" aria-hidden />
        <span className="text-sm font-medium">Arrastra tu CSV o toca para seleccionar</span>
        <span className="text-xs text-muted-foreground">
          UTF-8, máximo 2 MB y 2000 destinatarios
        </span>
        <input
          ref={input}
          type="file"
          accept=".csv,text/csv"
          disabled={loading}
          className="sr-only"
          onChange={(e) => void parse(e.target.files?.[0])}
        />
      </label>
      {loading && <p role="status">Leyendo archivo…</p>}
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      {headers.length > 0 && (
        <>
          <p>{rows.length} destinatarios encontrados.</p>
          <label className="block space-y-1">
            <span>Columna del teléfono</span>
            <select
              className={selectClass}
              value={phoneColumn}
              onChange={(e) => onPhoneColumn(e.target.value)}
            >
              <option value="">Seleccionar columna</option>
              {headers.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </label>
          <p className="text-sm text-muted-foreground">
            Incluye código de país, por ejemplo +525512345678. No se modifica el archivo original.
          </p>
        </>
      )}
    </div>
  );
}
export function VariableMapping({
  variables,
  fields,
  mappings,
  onChange,
  staticOnly = false,
}: {
  staticOnly?: boolean;
  variables: Array<{ key: string; parameter: string; component: string }>;
  fields: string[];
  mappings: Record<string, Mapping>;
  onChange: (mappings: Record<string, Mapping>) => void;
}) {
  if (!variables.length) return <p>Esta plantilla no necesita variables.</p>;
  return (
    <div className="space-y-4">
      {variables.map((variable) => {
        const rule = mappings[variable.key] ?? { mode: 'static', value: '' };
        return (
          <fieldset key={variable.key} className="space-y-3 rounded-lg border p-4">
            <legend className="px-2">
              {variable.component === 'HEADER'
                ? 'Encabezado'
                : variable.component.startsWith('BUTTON')
                  ? 'URL del botón'
                  : 'Cuerpo'}{' '}
              · {`{{${variable.parameter}}}`}
            </legend>
            <div className="flex flex-col gap-3 md:flex-row md:items-end">
              {!staticOnly && (
                <label className="flex flex-1 flex-col gap-1">
                  <span>Origen del valor</span>
                  <select
                    className={selectClass}
                    value={rule.mode}
                    onChange={(e) =>
                      onChange({
                        ...mappings,
                        [variable.key]:
                          e.target.value === 'static'
                            ? { mode: 'static', value: '' }
                            : { mode: 'dynamic', field: '' },
                      })
                    }
                  >
                    <option value="static">Estático — mismo texto para todos</option>
                    <option value="dynamic">Dinámico — campo de cada destinatario</option>
                  </select>
                </label>
              )}
              {rule.mode === 'static' ? (
                <label className="flex flex-1 flex-col gap-1">
                  <span>Texto para {`{{${variable.parameter}}}`}</span>
                  <Input
                    maxLength={1024}
                    value={rule.value}
                    onChange={(e) =>
                      onChange({
                        ...mappings,
                        [variable.key]: { mode: 'static', value: e.target.value },
                      })
                    }
                  />
                </label>
              ) : (
                <label className="flex flex-1 flex-col gap-1">
                  <span>Campo para {`{{${variable.parameter}}}`}</span>
                  <select
                    className={selectClass}
                    value={rule.field}
                    onChange={(e) =>
                      onChange({
                        ...mappings,
                        [variable.key]: { mode: 'dynamic', field: e.target.value },
                      })
                    }
                  >
                    <option value="">Seleccionar campo</option>
                    {fields.map((field) => (
                      <option key={field} value={field}>
                        {field}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}
