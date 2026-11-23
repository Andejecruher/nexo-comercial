'use client';
import { useEffect, useState } from 'react';
import { templatesApi, variableKeys, type MessageTemplate } from '@/lib/templates-api';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import type { PreparedAttachmentPayload } from '@/hooks/useConversationMessages';

export function TemplatePicker({
  lineId,
  disabled,
  onAdd,
}: {
  lineId?: string;
  disabled?: boolean;
  onAdd: (value: PreparedAttachmentPayload) => void;
}) {
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [selected, setSelected] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  useEffect(() => {
    if (!open || !lineId) return;
    const abort = new AbortController();
    void (async () => {
      try {
        const all: MessageTemplate[] = [];
        let after: string | undefined;
        do {
          const page = await templatesApi.list(lineId, after, abort.signal);
          all.push(...page.data);
          after = page.nextCursor;
        } while (after && !abort.signal.aborted);
        if (!abort.signal.aborted)
          setTemplates(
            all.filter(
              (t) =>
                t.status === 'APPROVED' &&
                t.components.every(
                  (c) =>
                    ['HEADER', 'BODY', 'FOOTER', 'BUTTONS'].includes(c.type) &&
                    (c.type !== 'HEADER' || c.format === 'TEXT') &&
                    (!c.buttons ||
                      c.buttons.every(
                        (b) =>
                          ['QUICK_REPLY', 'URL', 'PHONE_NUMBER'].includes(b.type) &&
                          !b.url?.includes('{{'),
                      )),
                ),
            ),
          );
      } catch {
        if (!abort.signal.aborted) setError('No se pudieron cargar las plantillas de la línea');
      }
    })();
    return () => abort.abort();
  }, [lineId, open]);
  const template = templates.find((t) => t.id === selected);
  const keys =
    template?.components.flatMap((c) =>
      ['HEADER', 'BODY'].includes(c.type)
        ? variableKeys(c.text ?? '').map((key) => `${c.type.toLowerCase()}.${key}`)
        : [],
    ) ?? [];
  if (!lineId) return null;
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        Plantilla
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enviar plantilla aprobada</DialogTitle>
          </DialogHeader>
          <label>
            Plantilla
            <select
              className="block w-full rounded border p-2"
              value={selected}
              onChange={(e) => {
                setSelected(e.target.value);
                setValues({});
              }}
            >
              <option value="">Seleccionar…</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} · {t.language}
                </option>
              ))}
            </select>
          </label>
          {template?.components.map((c, i) =>
            c.text ? (
              <p key={i} className="whitespace-pre-wrap text-sm">
                {c.text}
              </p>
            ) : null,
          )}
          {keys.map((key) => (
            <label key={key}>
              {key}
              <Input
                value={values[key] ?? ''}
                maxLength={1024}
                onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
              />
            </label>
          ))}
          {error && <p role="alert">{error}</p>}
          <Button
            disabled={!template || keys.some((key) => !values[key]?.trim())}
            onClick={() => {
              if (!template) return;
              onAdd({
                storageKey: '',
                mimeType: 'application/json',
                fileSizeBytes: '1',
                originalFilename: template.name,
                template: { id: template.id, variables: values },
              });
              setOpen(false);
            }}
          >
            Añadir al mensaje
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
