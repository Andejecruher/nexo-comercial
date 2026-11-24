'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { AgentTopicAssignment, AiAgentTopic, AiPrompt, AiTopic } from '@/lib/shared/ai-api';
import { agentsApi } from '@/lib/shared/ai-api';
import { useState } from 'react';
import { toast } from 'sonner';

interface Props {
  agentId: string;
  assignments: AiAgentTopic[];
  topics: AiTopic[];
  prompts: AiPrompt[];
  onSaved: () => Promise<void>;
  onEditTopic?: (topic: AiTopic) => void;
}

export function AgentTopicAssignments({
  agentId,
  assignments,
  topics,
  prompts,
  onSaved,
  onEditTopic,
}: Props) {
  const [draft, setDraft] = useState<AgentTopicAssignment[]>(() =>
    assignments.map(({ topicId, promptId, priority, isDefault }) => ({
      topicId,
      promptId,
      priority,
      isDefault,
    })),
  );
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');
  const candidates = [...topics, ...assignments.map((item) => item.topic)].filter(
    (topic, index, all) => all.findIndex((item) => item.id === topic.id) === index,
  );
  const allPrompts = [...prompts, ...assignments.map((item) => item.prompt)].filter(
    (prompt, index, all) => all.findIndex((item) => item.id === prompt.id) === index,
  );

  const change = (next: AgentTopicAssignment[]) => {
    setDraft(next);
    setDirty(true);
    setError('');
  };

  const toggle = (topic: AiTopic) => {
    if (draft.some((item) => item.topicId === topic.id)) {
      const next = draft.filter((item) => item.topicId !== topic.id);
      if (next.length && !next.some((item) => item.isDefault))
        next[0] = { ...next[0], isDefault: true };
      change(next);
    } else {
      const prompt =
        allPrompts.find(
          (item) =>
            item.id === topic.systemPromptId &&
            item.isActive &&
            (!item.topicId || item.topicId === topic.id) &&
            item.type !== 'tool',
        ) ??
        allPrompts.find(
          (item) => item.topicId === topic.id && item.isActive && item.type !== 'tool',
        );
      change([
        ...draft,
        {
          topicId: topic.id,
          promptId: prompt?.id ?? '',
          priority: 100,
          isDefault: draft.length === 0,
        },
      ]);
    }
  };

  const save = async () => {
    if (
      draft.some(
        (item) =>
          !item.promptId ||
          !Number.isInteger(item.priority) ||
          item.priority < 0 ||
          item.priority > 2147483647,
      )
    ) {
      setError('Selecciona un prompt y una prioridad válida para cada tópico.');
      return;
    }
    if (draft.length && draft.filter((item) => item.isDefault).length !== 1) {
      setError('Selecciona un único tópico predeterminado.');
      return;
    }
    setSaving(true);
    try {
      const result = await agentsApi.assignTopics(agentId, draft);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setDirty(false);
      toast.success('Tópicos y prompts conectados al agente');
      await onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Selecciona los tópicos que atenderá este agente y el prompt de cada uno. El predeterminado
        responde cuando no hay coincidencias; la prioridad menor se evalúa primero. Guarda las
        asignaciones para aplicarlas a sus líneas.
      </p>
      {assignments.length === 0 && (
        <p role="status" className="text-sm text-destructive">
          Este agente no tiene tópicos conectados al motor de respuestas.
        </p>
      )}
      {candidates.length === 0 && (
        <p className="text-sm">Crea un tópico y un prompt para comenzar.</p>
      )}
      {candidates.map((topic) => {
        const selected = draft.find((item) => item.topicId === topic.id);
        const options = allPrompts.filter(
          (prompt) =>
            (prompt.isActive &&
              prompt.type !== 'tool' &&
              (!prompt.topicId || prompt.topicId === topic.id)) ||
            prompt.id === selected?.promptId,
        );
        return (
          <div key={topic.id} className="rounded-lg border p-3 flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={!!selected}
                  disabled={saving || (!selected && !topic.isActive)}
                  onChange={() => toggle(topic)}
                />
                {topic.name}
                {!topic.isActive && ' (inactivo)'}
              </label>
              {onEditTopic && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={saving}
                  onClick={() => onEditTopic(topic)}
                >
                  Editar tópico y herramientas
                </Button>
              )}
            </div>
            {topic.matcherKeywords.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Palabras clave: {topic.matcherKeywords.join(', ')}
              </p>
            )}
            {selected && (
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="flex flex-col gap-1 text-xs sm:col-span-2">
                  Prompt para {topic.name}
                  <select
                    className="h-9 rounded-md border bg-background px-2 text-sm"
                    value={selected.promptId}
                    disabled={saving}
                    onChange={(event) =>
                      change(
                        draft.map((item) =>
                          item.topicId === topic.id
                            ? { ...item, promptId: event.target.value }
                            : item,
                        ),
                      )
                    }
                  >
                    <option value="">Selecciona un prompt</option>
                    {options.map((prompt) => (
                      <option key={prompt.id} value={prompt.id} disabled={!prompt.isActive}>
                        {prompt.name} · v{prompt.version}
                        {!prompt.isActive && ' (inactivo)'}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  Prioridad de {topic.name}
                  <Input
                    type="number"
                    min={0}
                    max={2147483647}
                    step={1}
                    value={selected.priority}
                    disabled={saving}
                    onChange={(event) =>
                      change(
                        draft.map((item) =>
                          item.topicId === topic.id
                            ? { ...item, priority: Number(event.target.value) }
                            : item,
                        ),
                      )
                    }
                  />
                </label>
                <label className="flex items-center gap-2 text-xs sm:col-span-3">
                  <input
                    type="radio"
                    name={`default-topic-${agentId}`}
                    checked={selected.isDefault}
                    disabled={saving}
                    onChange={() =>
                      change(
                        draft.map((item) => ({ ...item, isDefault: item.topicId === topic.id })),
                      )
                    }
                  />
                  Usar {topic.name} como predeterminado
                </label>
              </div>
            )}
          </div>
        );
      })}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {dirty && (
        <p role="status" className="text-xs text-muted-foreground">
          Hay cambios sin guardar.
        </p>
      )}
      <Button className="self-start" disabled={saving || !dirty} onClick={() => void save()}>
        {saving ? 'Guardando…' : 'Guardar asignaciones'}
      </Button>
    </div>
  );
}
