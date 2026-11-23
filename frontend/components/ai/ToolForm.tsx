'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import type { AiTool, AIToolKind, AIToolHttpMethod, CreateToolPayload } from '@/lib/ai-api';
import { useEffect, useState } from 'react';

interface ToolFormProps {
  open: boolean;
  tool?: AiTool;
  onClose: () => void;
  onSubmit: (payload: CreateToolPayload) => Promise<{ success: boolean; error?: string }>;
}

type FormState = {
  name: string;
  description: string;
  kind: AIToolKind;
  internalKey: string;
  externalUrl: string;
  externalMethod: AIToolHttpMethod | '';
  externalHeadersRaw: string;
  externalAuthEnvKey: string;
  timeoutMs: string;
  allowlistDomainsRaw: string;
  inputSchemaRaw: string;
  outputSchemaRaw: string;
  isActive: boolean;
};

const EMPTY: FormState = {
  name: '',
  description: '',
  kind: 'internal',
  internalKey: '',
  externalUrl: '',
  externalMethod: '',
  externalHeadersRaw: '',
  externalAuthEnvKey: '',
  timeoutMs: '8000',
  allowlistDomainsRaw: '',
  inputSchemaRaw: '',
  outputSchemaRaw: '',
  isActive: true,
};

function toFormState(tool: AiTool): FormState {
  return {
    name: tool.name,
    description: tool.description,
    kind: tool.kind,
    internalKey: tool.internalKey ?? '',
    externalUrl: tool.externalUrl ?? '',
    externalMethod: tool.externalMethod ?? '',
    externalHeadersRaw: tool.externalHeaders ? JSON.stringify(tool.externalHeaders, null, 2) : '',
    externalAuthEnvKey: tool.externalAuthEnvKey ?? '',
    timeoutMs: String(tool.timeoutMs),
    allowlistDomainsRaw: tool.allowlistDomains.join(', '),
    inputSchemaRaw: tool.inputSchema ? JSON.stringify(tool.inputSchema, null, 2) : '',
    outputSchemaRaw: tool.outputSchema ? JSON.stringify(tool.outputSchema, null, 2) : '',
    isActive: tool.isActive,
  };
}

function parseJsonField(
  raw: string,
  fieldName: string,
): { value: Record<string, unknown> | undefined; error?: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { value: undefined };
  try {
    return { value: JSON.parse(trimmed) as Record<string, unknown> };
  } catch {
    return { value: undefined, error: `${fieldName}: JSON inválido` };
  }
}

export function ToolForm({ open, tool, onClose, onSubmit }: ToolFormProps) {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(tool ? toFormState(tool) : EMPTY);
      setErrors({});
    }
  }, [open, tool]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (!form.name.trim()) next.name = 'El nombre es requerido';
    if (!form.description.trim()) next.description = 'La descripción es requerida';
    if (form.kind === 'internal' && !form.internalKey.trim()) {
      next.internalKey = 'La clave interna es requerida para herramientas internas';
    }
    if (form.kind === 'external') {
      if (!form.externalUrl.trim()) next.externalUrl = 'La URL es requerida';
      if (!form.externalMethod) next.externalMethod = 'El método HTTP es requerido';
    }
    const timeoutN = parseInt(form.timeoutMs);
    if (isNaN(timeoutN) || timeoutN < 100) next.timeoutMs = 'Mínimo 100ms';

    // JSON fields
    if (form.externalHeadersRaw.trim()) {
      const { error } = parseJsonField(form.externalHeadersRaw, 'Headers');
      if (error) next.externalHeadersRaw = error;
    }
    if (form.inputSchemaRaw.trim()) {
      const { error } = parseJsonField(form.inputSchemaRaw, 'Input schema');
      if (error) next.inputSchemaRaw = error;
    }
    if (form.outputSchemaRaw.trim()) {
      const { error } = parseJsonField(form.outputSchemaRaw, 'Output schema');
      if (error) next.outputSchemaRaw = error;
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSubmitting(true);

    const allowlistDomains = form.allowlistDomainsRaw
      .split(',')
      .map((d) => d.trim())
      .filter(Boolean);

    const { value: externalHeaders } = parseJsonField(form.externalHeadersRaw, 'Headers');
    const { value: inputSchema } = parseJsonField(form.inputSchemaRaw, 'Input schema');
    const { value: outputSchema } = parseJsonField(form.outputSchemaRaw, 'Output schema');

    const payload: CreateToolPayload = {
      name: form.name.trim(),
      description: form.description.trim(),
      kind: form.kind,
      internalKey: form.kind === 'internal' ? form.internalKey.trim() : undefined,
      externalUrl: form.kind === 'external' ? form.externalUrl.trim() : undefined,
      externalMethod:
        form.kind === 'external' && form.externalMethod
          ? (form.externalMethod as AIToolHttpMethod)
          : undefined,
      externalHeaders: externalHeaders as Record<string, string> | undefined,
      externalAuthEnvKey: form.externalAuthEnvKey.trim() || undefined,
      timeoutMs: parseInt(form.timeoutMs),
      allowlistDomains,
      inputSchema,
      outputSchema,
      isActive: form.isActive,
    };

    const result = await onSubmit(payload);
    setSubmitting(false);
    if (result.success) onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{tool ? 'Editar herramienta' : 'Nueva herramienta'}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          {/* Name */}
          <div className="grid gap-1.5">
            <Label htmlFor="tool-name">
              Nombre <span className="text-destructive">*</span>
            </Label>
            <Input
              id="tool-name"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="create_citizen"
              className="font-mono text-sm"
            />
            {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
          </div>

          {/* Description */}
          <div className="grid gap-1.5">
            <Label htmlFor="tool-desc">
              Descripción <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="tool-desc"
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              placeholder="Descripción de qué hace la herramienta…"
              rows={2}
              className="resize-none"
            />
            {errors.description && <p className="text-xs text-destructive">{errors.description}</p>}
          </div>

          {/* Kind */}
          <div className="grid gap-1.5">
            <Label>
              Tipo <span className="text-destructive">*</span>
            </Label>
            <Select value={form.kind} onValueChange={(v) => set('kind', v as AIToolKind)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="internal">Interna (función del sistema)</SelectItem>
                <SelectItem value="external">Externa (HTTP endpoint)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Internal fields */}
          {form.kind === 'internal' && (
            <div className="grid gap-1.5">
              <Label htmlFor="tool-internal-key">
                Clave interna <span className="text-destructive">*</span>
              </Label>
              <Input
                id="tool-internal-key"
                value={form.internalKey}
                onChange={(e) => set('internalKey', e.target.value)}
                placeholder="create_citizen"
                className="font-mono text-sm"
              />
              {errors.internalKey && (
                <p className="text-xs text-destructive">{errors.internalKey}</p>
              )}
            </div>
          )}

          {/* External fields */}
          {form.kind === 'external' && (
            <>
              <div className="grid gap-1.5">
                <Label htmlFor="tool-ext-url">
                  URL endpoint <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="tool-ext-url"
                  value={form.externalUrl}
                  onChange={(e) => set('externalUrl', e.target.value)}
                  placeholder="https://api.ejemplo.com/endpoint"
                />
                {errors.externalUrl && (
                  <p className="text-xs text-destructive">{errors.externalUrl}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label>
                    Método HTTP <span className="text-destructive">*</span>
                  </Label>
                  <Select
                    value={form.externalMethod}
                    onValueChange={(v) => set('externalMethod', v as AIToolHttpMethod)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccioná…" />
                    </SelectTrigger>
                    <SelectContent>
                      {(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const).map((m) => (
                        <SelectItem key={m} value={m}>
                          {m}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.externalMethod && (
                    <p className="text-xs text-destructive">{errors.externalMethod}</p>
                  )}
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="tool-auth-key">Auth ENV key</Label>
                  <Input
                    id="tool-auth-key"
                    value={form.externalAuthEnvKey}
                    onChange={(e) => set('externalAuthEnvKey', e.target.value)}
                    placeholder="MY_API_KEY"
                    className="font-mono text-sm"
                  />
                </div>
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="tool-headers">
                  Headers adicionales <span className="text-muted-foreground text-xs">(JSON)</span>
                </Label>
                <Textarea
                  id="tool-headers"
                  value={form.externalHeadersRaw}
                  onChange={(e) => set('externalHeadersRaw', e.target.value)}
                  placeholder={'{\n  "X-Custom-Header": "valor"\n}'}
                  rows={4}
                  className="font-mono text-xs resize-none"
                />
                {errors.externalHeadersRaw && (
                  <p className="text-xs text-destructive">{errors.externalHeadersRaw}</p>
                )}
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="tool-allowlist">
                  Dominios permitidos{' '}
                  <span className="text-muted-foreground text-xs">(separados por coma)</span>
                </Label>
                <Input
                  id="tool-allowlist"
                  value={form.allowlistDomainsRaw}
                  onChange={(e) => set('allowlistDomainsRaw', e.target.value)}
                  placeholder="api.ejemplo.com, otro.ejemplo.com"
                />
              </div>
            </>
          )}

          {/* Timeout */}
          <div className="grid gap-1.5">
            <Label htmlFor="tool-timeout">Timeout (ms)</Label>
            <Input
              id="tool-timeout"
              type="number"
              min="100"
              value={form.timeoutMs}
              onChange={(e) => set('timeoutMs', e.target.value)}
              placeholder="8000"
            />
            {errors.timeoutMs && <p className="text-xs text-destructive">{errors.timeoutMs}</p>}
          </div>

          {/* Input Schema */}
          <div className="grid gap-1.5">
            <Label htmlFor="tool-input-schema">
              Input Schema <span className="text-muted-foreground text-xs">(JSON Schema)</span>
            </Label>
            <Textarea
              id="tool-input-schema"
              value={form.inputSchemaRaw}
              onChange={(e) => set('inputSchemaRaw', e.target.value)}
              placeholder={'{\n  "type": "object",\n  "properties": {}\n}'}
              rows={5}
              className="font-mono text-xs resize-none"
            />
            {errors.inputSchemaRaw && (
              <p className="text-xs text-destructive">{errors.inputSchemaRaw}</p>
            )}
          </div>

          {/* Output Schema */}
          <div className="grid gap-1.5">
            <Label htmlFor="tool-output-schema">
              Output Schema <span className="text-muted-foreground text-xs">(JSON Schema)</span>
            </Label>
            <Textarea
              id="tool-output-schema"
              value={form.outputSchemaRaw}
              onChange={(e) => set('outputSchemaRaw', e.target.value)}
              placeholder={'{\n  "type": "object",\n  "properties": {}\n}'}
              rows={5}
              className="font-mono text-xs resize-none"
            />
            {errors.outputSchemaRaw && (
              <p className="text-xs text-destructive">{errors.outputSchemaRaw}</p>
            )}
          </div>

          {/* Active */}
          <div className="flex items-center gap-3">
            <Switch
              id="tool-active"
              checked={form.isActive}
              onCheckedChange={(v) => set('isActive', v)}
            />
            <Label htmlFor="tool-active" className="cursor-pointer">
              Herramienta activa
            </Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Guardando…' : tool ? 'Guardar cambios' : 'Crear herramienta'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
