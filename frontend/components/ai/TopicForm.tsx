'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import type { AiTool, AiTopic, AiPrompt, CreateTopicPayload } from '@/lib/ai-api';
import { X } from 'lucide-react';
import { useEffect, useState } from 'react';

interface TopicFormProps {
  open: boolean;
  topic?: AiTopic;
  availableTools: AiTool[];
  availablePrompts: AiPrompt[];
  onClose: () => void;
  onSubmit: (payload: CreateTopicPayload) => Promise<{ success: boolean; error?: string }>;
}

type FormState = {
  slug: string;
  name: string;
  description: string;
  systemPromptId: string;
  keywordInput: string;
  keywords: string[];
  selectedToolIds: string[];
  isActive: boolean;
};

const EMPTY: FormState = {
  slug: '',
  name: '',
  description: '',
  systemPromptId: '',
  keywordInput: '',
  keywords: [],
  selectedToolIds: [],
  isActive: true,
};

function toFormState(topic: AiTopic): FormState {
  return {
    slug: topic.slug,
    name: topic.name,
    description: topic.description ?? '',
    systemPromptId: topic.systemPromptId ?? '',
    keywordInput: '',
    keywords: [...topic.matcherKeywords],
    selectedToolIds: topic.tools?.map((t) => t.id) ?? [],
    isActive: topic.isActive,
  };
}

export function TopicForm({
  open,
  topic,
  availableTools,
  availablePrompts,
  onClose,
  onSubmit,
}: TopicFormProps) {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(topic ? toFormState(topic) : EMPTY);
      setErrors({});
    }
  }, [open, topic]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const addKeyword = () => {
    const kw = form.keywordInput.trim().toLowerCase();
    if (!kw || form.keywords.includes(kw)) {
      set('keywordInput', '');
      return;
    }
    setForm((prev) => ({
      ...prev,
      keywords: [...prev.keywords, kw],
      keywordInput: '',
    }));
  };

  const removeKeyword = (kw: string) =>
    setForm((prev) => ({ ...prev, keywords: prev.keywords.filter((k) => k !== kw) }));

  const toggleTool = (toolId: string) =>
    setForm((prev) => ({
      ...prev,
      selectedToolIds: prev.selectedToolIds.includes(toolId)
        ? prev.selectedToolIds.filter((id) => id !== toolId)
        : [...prev.selectedToolIds, toolId],
    }));

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (!form.slug.trim()) next.slug = 'El slug es requerido';
    if (!/^[a-z0-9-_]+$/.test(form.slug.trim())) next.slug = 'Solo minúsculas, números, guiones';
    if (!form.name.trim()) next.name = 'El nombre es requerido';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSubmitting(true);
    const payload: CreateTopicPayload = {
      slug: form.slug.trim(),
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      systemPromptId: form.systemPromptId || undefined,
      matcherKeywords: form.keywords,
      isActive: form.isActive,
      toolIds: form.selectedToolIds,
    };
    const result = await onSubmit(payload);
    setSubmitting(false);
    if (result.success) onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{topic ? 'Editar tópico' : 'Nuevo tópico'}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          {/* Name */}
          <div className="grid gap-1.5">
            <Label htmlFor="topic-name">
              Nombre <span className="text-destructive">*</span>
            </Label>
            <Input
              id="topic-name"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="Atención de quejas"
            />
            {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
          </div>

          {/* Slug */}
          <div className="grid gap-1.5">
            <Label htmlFor="topic-slug">
              Slug <span className="text-destructive">*</span>
            </Label>
            <Input
              id="topic-slug"
              value={form.slug}
              onChange={(e) => set('slug', e.target.value.toLowerCase())}
              placeholder="atencion-quejas"
              className="font-mono text-sm"
            />
            {errors.slug && <p className="text-xs text-destructive">{errors.slug}</p>}
          </div>

          {/* Description */}
          <div className="grid gap-1.5">
            <Label htmlFor="topic-desc">Descripción</Label>
            <Textarea
              id="topic-desc"
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              rows={2}
              className="resize-none"
            />
          </div>

          {/* System Prompt */}
          {availablePrompts.length > 0 && (
            <div className="grid gap-1.5">
              <Label htmlFor="topic-prompt">Prompt del sistema</Label>
              <select
                id="topic-prompt"
                value={form.systemPromptId}
                onChange={(e) => set('systemPromptId', e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">Sin prompt del sistema</option>
                {availablePrompts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} (v{p.version})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Keywords */}
          <div className="grid gap-1.5">
            <Label>Palabras clave de activación</Label>
            <div className="flex gap-2">
              <Input
                value={form.keywordInput}
                onChange={(e) => set('keywordInput', e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addKeyword();
                  }
                }}
                placeholder="Ingresá una keyword y presioná Enter"
                className="text-sm"
              />
              <Button type="button" variant="outline" size="sm" onClick={addKeyword}>
                Agregar
              </Button>
            </div>
            {form.keywords.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-1">
                {form.keywords.map((kw) => (
                  <Badge key={kw} variant="secondary" className="gap-1 pr-1">
                    {kw}
                    <button
                      type="button"
                      onClick={() => removeKeyword(kw)}
                      className="hover:text-destructive transition-colors"
                      aria-label={`Eliminar keyword ${kw}`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Tools multi-select */}
          {availableTools.length > 0 && (
            <div className="grid gap-2">
              <Label>Herramientas asignadas</Label>
              <div className="border rounded-md p-3 max-h-48 overflow-y-auto space-y-2">
                {availableTools.map((tool) => (
                  <div key={tool.id} className="flex items-center gap-2.5">
                    <Checkbox
                      id={`tool-${tool.id}`}
                      checked={form.selectedToolIds.includes(tool.id)}
                      onCheckedChange={() => toggleTool(tool.id)}
                    />
                    <Label
                      htmlFor={`tool-${tool.id}`}
                      className="cursor-pointer text-sm font-normal"
                    >
                      <span className="font-medium">{tool.name}</span>
                      <Badge variant="outline" className="ml-2 text-xs">
                        {tool.kind}
                      </Badge>
                      {tool.description && (
                        <span className="ml-1 text-muted-foreground text-xs">
                          — {tool.description}
                        </span>
                      )}
                    </Label>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {form.selectedToolIds.length} herramienta(s) seleccionada(s)
              </p>
            </div>
          )}

          {/* Active */}
          <div className="flex items-center gap-3">
            <Switch
              id="topic-active"
              checked={form.isActive}
              onCheckedChange={(v) => set('isActive', v)}
            />
            <Label htmlFor="topic-active" className="cursor-pointer">
              Tópico activo
            </Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Guardando…' : topic ? 'Guardar cambios' : 'Crear tópico'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
