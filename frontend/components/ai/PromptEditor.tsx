'use client';

import { Badge } from '@/components/ui/badge';
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
import type { AiPrompt, AiTopic, AIPromptType, CreatePromptPayload } from '@/lib/ai-api';
import { Clock } from 'lucide-react';
import { useEffect, useState } from 'react';

interface PromptEditorProps {
  open: boolean;
  prompt?: AiPrompt;
  availableTopics: AiTopic[];
  onClose: () => void;
  onSubmit: (payload: CreatePromptPayload) => Promise<{ success: boolean; error?: string }>;
}

type FormState = {
  topicId: string;
  name: string;
  type: AIPromptType;
  content: string;
  isActive: boolean;
};

const EMPTY: FormState = {
  topicId: '',
  name: '',
  type: 'topic',
  content: '',
  isActive: true,
};

function toFormState(prompt: AiPrompt): FormState {
  return {
    topicId: prompt.topicId ?? '',
    name: prompt.name,
    type: prompt.type,
    content: prompt.content,
    isActive: prompt.isActive,
  };
}

const PROMPT_TYPE_LABELS: Record<AIPromptType, string> = {
  topic: 'Tópico',
  system: 'Sistema',
  fallback: 'Fallback',
  tool: 'Herramienta',
};

export function PromptEditor({
  open,
  prompt,
  availableTopics,
  onClose,
  onSubmit,
}: PromptEditorProps) {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(prompt ? toFormState(prompt) : EMPTY);
      setErrors({});
    }
  }, [open, prompt]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const validate = (): boolean => {
    const next: Partial<Record<keyof FormState, string>> = {};
    if (!form.name.trim()) next.name = 'El nombre es requerido';
    if (!form.content.trim()) next.content = 'El contenido es requerido';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSubmitting(true);
    const payload: CreatePromptPayload = {
      topicId: form.topicId || undefined,
      name: form.name.trim(),
      type: form.type,
      content: form.content,
      isActive: form.isActive,
    };
    const result = await onSubmit(payload);
    setSubmitting(false);
    if (result.success) onClose();
  };

  const charCount = form.content.length;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {prompt ? 'Editar prompt' : 'Nuevo prompt'}
            {prompt && (
              <Badge variant="outline" className="font-normal text-xs">
                <Clock className="w-3 h-3 mr-1" />v{prompt.version}
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          {/* Name */}
          <div className="grid gap-1.5">
            <Label htmlFor="prompt-name">
              Nombre <span className="text-destructive">*</span>
            </Label>
            <Input
              id="prompt-name"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="Prompt de bienvenida"
            />
            {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
          </div>

          {/* Type + Topic */}
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Tipo</Label>
              <Select value={form.type} onValueChange={(v) => set('type', v as AIPromptType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(PROMPT_TYPE_LABELS) as AIPromptType[]).map((t) => (
                    <SelectItem key={t} value={t}>
                      {PROMPT_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="prompt-topic">Tópico asociado</Label>
              <select
                id="prompt-topic"
                value={form.topicId}
                onChange={(e) => set('topicId', e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">Sin tópico</option>
                {availableTopics.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Content editor */}
          <div className="grid gap-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="prompt-content">
                Contenido del prompt <span className="text-destructive">*</span>
              </Label>
              <span className="text-xs text-muted-foreground">{charCount} caracteres</span>
            </div>
            <Textarea
              id="prompt-content"
              value={form.content}
              onChange={(e) => set('content', e.target.value)}
              placeholder={`Sos un asistente de atención ciudadana para Cintalapa de Figueroa, Chiapas.

Tu objetivo es registrar quejas, sugerencias y solicitudes de los ciudadanos de manera empática y eficiente.

Podés usar las siguientes variables dinámicas:
- {{ciudadano_nombre}}: nombre del ciudadano
- {{fecha_actual}}: fecha y hora actual
- {{departamento}}: departamento asignado`}
              rows={14}
              className="font-mono text-sm resize-y"
            />
            {errors.content && <p className="text-xs text-destructive">{errors.content}</p>}
            <p className="text-xs text-muted-foreground">
              Tip: Usá {'{{variable}}'} para variables dinámicas que el sistema reemplazará en
              tiempo de ejecución.
            </p>
          </div>

          {/* Active + versioning note */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Switch
                id="prompt-active"
                checked={form.isActive}
                onCheckedChange={(v) => set('isActive', v)}
              />
              <Label htmlFor="prompt-active" className="cursor-pointer">
                Prompt activo
              </Label>
            </div>
            {prompt && (
              <p className="text-xs text-muted-foreground">
                Guardar creará la versión v{prompt.version + 1}
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Guardando…' : prompt ? `Guardar v${prompt.version + 1}` : 'Crear prompt'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
