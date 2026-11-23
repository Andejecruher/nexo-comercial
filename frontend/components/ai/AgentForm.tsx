'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import type { AiAgent, AIProvider, CreateAgentPayload } from '@/lib/ai-api';
import { AI_PROVIDER_LABELS, AI_PROVIDER_MODELS, NVIDIA_MODEL_HELP } from '@/lib/ai-model-config';
import { useEffect, useState } from 'react';

interface AgentFormProps {
  open: boolean;
  agent?: AiAgent;
  onClose: () => void;
  onSubmit: (payload: CreateAgentPayload) => Promise<{ success: boolean; error?: string }>;
}

type FormState = {
  slug: string;
  name: string;
  description: string;
  provider: AIProvider;
  model: string;
  temperature: string;
  maxTokens: string;
  isActive: boolean;
};

const EMPTY: FormState = {
  slug: '',
  name: '',
  description: '',
  provider: 'openai',
  model: '',
  temperature: '',
  maxTokens: '',
  isActive: true,
};

function toFormState(agent: AiAgent): FormState {
  return {
    slug: agent.slug,
    name: agent.name,
    description: agent.description ?? '',
    provider: agent.provider,
    model: agent.model,
    temperature: agent.temperature !== undefined ? String(agent.temperature) : '',
    maxTokens: agent.maxTokens !== undefined ? String(agent.maxTokens) : '',
    isActive: agent.isActive,
  };
}

export function AgentForm({ open, agent, onClose, onSubmit }: AgentFormProps) {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(agent ? toFormState(agent) : EMPTY);
      setErrors({});
    }
  }, [open, agent]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const validate = (): boolean => {
    const next: Partial<Record<keyof FormState, string>> = {};
    if (!form.slug.trim()) next.slug = 'El slug es requerido';
    if (!/^[a-z0-9-_]+$/.test(form.slug.trim())) next.slug = 'Solo minúsculas, números, guiones';
    if (!form.name.trim()) next.name = 'El nombre es requerido';
    if (!form.model.trim()) next.model = 'El modelo es requerido';
    if (form.temperature !== '') {
      const t = parseFloat(form.temperature);
      if (isNaN(t) || t < 0 || t > 2) next.temperature = 'Entre 0 y 2';
    }
    if (form.maxTokens !== '') {
      const m = parseInt(form.maxTokens);
      if (isNaN(m) || m < 1) next.maxTokens = 'Debe ser un número positivo';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSubmitting(true);
    const payload: CreateAgentPayload = {
      slug: form.slug.trim(),
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      provider: form.provider,
      model: form.model.trim(),
      temperature: form.temperature !== '' ? parseFloat(form.temperature) : undefined,
      maxTokens: form.maxTokens !== '' ? parseInt(form.maxTokens) : undefined,
      isActive: form.isActive,
    };
    const result = await onSubmit(payload);
    setSubmitting(false);
    if (result.success) onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{agent ? 'Editar agente' : 'Nuevo agente'}</DialogTitle>
          <DialogDescription>
            Después de crear el agente, conecta sus tópicos y prompts desde su detalle y asígnalo a
            una línea con IA habilitada.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          {/* Name */}
          <div className="grid gap-1.5">
            <Label htmlFor="agent-name">
              Nombre <span className="text-destructive">*</span>
            </Label>
            <Input
              id="agent-name"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="Agente de atención ciudadana"
            />
            {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
          </div>

          {/* Slug */}
          <div className="grid gap-1.5">
            <Label htmlFor="agent-slug">
              Slug <span className="text-destructive">*</span>
            </Label>
            <Input
              id="agent-slug"
              value={form.slug}
              onChange={(e) => set('slug', e.target.value.toLowerCase())}
              placeholder="agente-ciudadano"
              className="font-mono text-sm"
            />
            {errors.slug && <p className="text-xs text-destructive">{errors.slug}</p>}
          </div>

          {/* Description */}
          <div className="grid gap-1.5">
            <Label htmlFor="agent-desc">Descripción</Label>
            <Textarea
              id="agent-desc"
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              placeholder="Descripción del agente…"
              rows={2}
              className="resize-none"
            />
          </div>

          {/* Provider + Model */}
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>
                Proveedor <span className="text-destructive">*</span>
              </Label>
              <Select
                value={form.provider}
                onValueChange={(v) => {
                  set('provider', v as AIProvider);
                  set('model', '');
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="openai">{AI_PROVIDER_LABELS.openai}</SelectItem>
                  <SelectItem value="anthropic">{AI_PROVIDER_LABELS.anthropic}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="agent-model">
                Modelo <span className="text-destructive">*</span>
              </Label>
              <Input
                id="agent-model"
                value={form.model}
                list="model-suggestions"
                onChange={(e) => set('model', e.target.value)}
                placeholder={AI_PROVIDER_MODELS[form.provider][0]}
                className="font-mono text-sm"
              />
              <datalist id="model-suggestions">
                {AI_PROVIDER_MODELS[form.provider].map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
              {errors.model && <p className="text-xs text-destructive">{errors.model}</p>}
            </div>
          </div>
          {form.provider === 'openai' && (
            <p className="text-xs text-muted-foreground">{NVIDIA_MODEL_HELP}</p>
          )}

          {/* Temperature + MaxTokens */}
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="agent-temp">Temperatura (0–2)</Label>
              <Input
                id="agent-temp"
                type="number"
                min="0"
                max="2"
                step="0.1"
                value={form.temperature}
                onChange={(e) => set('temperature', e.target.value)}
                placeholder="0.7"
              />
              {errors.temperature && (
                <p className="text-xs text-destructive">{errors.temperature}</p>
              )}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="agent-tokens">Max tokens</Label>
              <Input
                id="agent-tokens"
                type="number"
                min="1"
                value={form.maxTokens}
                onChange={(e) => set('maxTokens', e.target.value)}
                placeholder="2048"
              />
              {errors.maxTokens && <p className="text-xs text-destructive">{errors.maxTokens}</p>}
            </div>
          </div>

          {/* Active */}
          <div className="flex items-center gap-3">
            <Switch
              id="agent-active"
              checked={form.isActive}
              onCheckedChange={(v) => set('isActive', v)}
            />
            <Label htmlFor="agent-active" className="cursor-pointer">
              Agente activo
            </Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Guardando…' : agent ? 'Guardar cambios' : 'Crear agente'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
