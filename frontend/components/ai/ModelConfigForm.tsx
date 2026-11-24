'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import type { AiAgent, AIProvider, UpdateAgentPayload } from '@/lib/shared/ai-api';
import {
  AI_PROVIDER_LABELS,
  AI_PROVIDER_MODELS,
  NVIDIA_MODEL_HELP,
} from '@/lib/ai/ai-model-config';
import { Loader2, Save } from 'lucide-react';
import { useEffect, useState } from 'react';

interface ModelConfigFormProps {
  agent: AiAgent;
  onSave: (payload: UpdateAgentPayload) => Promise<{ success: boolean; error?: string }>;
}

export function ModelConfigForm({ agent, onSave }: ModelConfigFormProps) {
  const [provider, setProvider] = useState<'openai' | 'anthropic'>(agent.provider);
  const [model, setModel] = useState(agent.model);
  const [customModel, setCustomModel] = useState('');
  const [temperature, setTemperature] = useState(
    agent.temperature !== undefined && agent.temperature !== null ? String(agent.temperature) : '',
  );
  const [maxTokens, setMaxTokens] = useState(
    agent.maxTokens !== undefined && agent.maxTokens !== null ? String(agent.maxTokens) : '',
  );
  const [isActive, setIsActive] = useState(agent.isActive);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Reset on agent change
  useEffect(() => {
    setProvider(agent.provider);
    setModel(agent.model);
    setTemperature(
      agent.temperature !== undefined && agent.temperature !== null
        ? String(agent.temperature)
        : '',
    );
    setMaxTokens(
      agent.maxTokens !== undefined && agent.maxTokens !== null ? String(agent.maxTokens) : '',
    );
    setIsActive(agent.isActive);
    setDirty(false);
  }, [agent]);

  const knownModels = AI_PROVIDER_MODELS[provider];
  const isKnownModel = knownModels.includes(model);

  const handleProviderChange = (v: string) => {
    setProvider(v as 'openai' | 'anthropic');
    const first = AI_PROVIDER_MODELS[v as AIProvider][0];
    setModel(first);
    setDirty(true);
  };

  const handleModelChange = (v: string) => {
    if (v === '__custom__') {
      setModel(customModel || '');
    } else {
      setModel(v);
    }
    setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    const payload: UpdateAgentPayload = {
      provider,
      model: model || customModel,
      isActive,
    };
    const tempNum = parseFloat(temperature);
    if (!isNaN(tempNum)) payload.temperature = tempNum;
    const tokNum = parseInt(maxTokens, 10);
    if (!isNaN(tokNum)) payload.maxTokens = tokNum;

    await onSave(payload);
    setSaving(false);
    setDirty(false);
  };

  return (
    <div className="flex flex-col gap-6 max-w-lg">
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-semibold">Configuración del modelo IA</h3>
        <p className="text-xs text-muted-foreground">
          Ajustá el proveedor, modelo y parámetros de generación del agente.
        </p>
      </div>

      {/* Provider */}
      <div className="flex flex-col gap-2">
        <Label className="text-xs font-medium">Proveedor</Label>
        <Select value={provider} onValueChange={handleProviderChange}>
          <SelectTrigger className="h-9 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(AI_PROVIDER_LABELS) as AIProvider[]).map((value) => (
              <SelectItem key={value} value={value}>
                {AI_PROVIDER_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Model */}
      <div className="flex flex-col gap-2">
        <Label className="text-xs font-medium">Modelo</Label>
        <Select value={isKnownModel ? model : '__custom__'} onValueChange={handleModelChange}>
          <SelectTrigger className="h-9 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {knownModels.map((m) => (
              <SelectItem key={m} value={m}>
                <code className="text-xs">{m}</code>
              </SelectItem>
            ))}
            <SelectItem value="__custom__">Personalizado…</SelectItem>
          </SelectContent>
        </Select>
        {(!isKnownModel || model === '__custom__') && (
          <Input
            value={model || customModel}
            onChange={(e) => {
              setModel(e.target.value);
              setCustomModel(e.target.value);
              setDirty(true);
            }}
            placeholder={AI_PROVIDER_MODELS[provider][0]}
            className="h-9 text-sm font-mono"
          />
        )}
        <div className="flex items-center gap-1.5 flex-wrap">
          <Badge variant="secondary" className="text-xs font-mono">
            {model || '—'}
          </Badge>
          {!isKnownModel && model && (
            <Badge variant="outline" className="text-xs text-yellow-600 border-yellow-400">
              Modelo personalizado
            </Badge>
          )}
        </div>
        {provider === 'openai' && (
          <p className="text-xs text-muted-foreground">{NVIDIA_MODEL_HELP}</p>
        )}
      </div>

      {/* Temperature */}
      <div className="flex flex-col gap-2">
        <Label className="text-xs font-medium">
          Temperatura{' '}
          <span className="text-muted-foreground font-normal">(0.0 – 2.0, opcional)</span>
        </Label>
        <Input
          type="number"
          step="0.1"
          min="0"
          max="2"
          value={temperature}
          onChange={(e) => {
            setTemperature(e.target.value);
            setDirty(true);
          }}
          placeholder="0.7"
          className="h-9 text-sm"
        />
      </div>

      {/* Max tokens */}
      <div className="flex flex-col gap-2">
        <Label className="text-xs font-medium">
          Max tokens <span className="text-muted-foreground font-normal">(opcional)</span>
        </Label>
        <Input
          type="number"
          step="100"
          min="1"
          value={maxTokens}
          onChange={(e) => {
            setMaxTokens(e.target.value);
            setDirty(true);
          }}
          placeholder="4096"
          className="h-9 text-sm"
        />
      </div>

      {/* Active */}
      <div className="flex items-center justify-between rounded-lg border p-3">
        <div>
          <p className="text-sm font-medium">Agente activo</p>
          <p className="text-xs text-muted-foreground">Habilita o deshabilita el agente</p>
        </div>
        <Switch
          checked={isActive}
          onCheckedChange={(v) => {
            setIsActive(v);
            setDirty(true);
          }}
        />
      </div>

      {/* Save */}
      <Button onClick={handleSave} disabled={saving || !dirty} className="self-start gap-2">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        {saving ? 'Guardando…' : 'Guardar cambios'}
      </Button>
    </div>
  );
}
