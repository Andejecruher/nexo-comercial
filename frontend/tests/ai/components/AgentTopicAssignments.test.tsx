import { AgentTopicAssignments } from '@/components/ai/AgentTopicAssignments';
import type { AiAgentTopic, AiPrompt, AiTopic } from '@/lib/shared/ai-api';
import { agentsApi } from '@/lib/shared/ai-api';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/shared/ai-api', () => ({ agentsApi: { assignTopics: vi.fn() } }));

const dates = { createdAt: '', updatedAt: '' };
const topic: AiTopic = {
  id: 'topic-1',
  slug: 'general',
  name: 'General',
  matcherKeywords: [],
  isActive: true,
  ...dates,
};
const prompt: AiPrompt = {
  id: 'prompt-1',
  topicId: topic.id,
  name: 'Atención',
  type: 'topic',
  content: 'Hola',
  version: 1,
  isActive: true,
  metadata: {},
  ...dates,
};
const link: AiAgentTopic = {
  id: 'link-1',
  topicId: topic.id,
  promptId: prompt.id,
  priority: 100,
  isDefault: true,
  isActive: true,
  topic,
  prompt,
};

describe('AgentTopicAssignments', () => {
  beforeEach(() => vi.clearAllMocks());

  it('saves an explicit topic/prompt pair and default to the runtime API', async () => {
    vi.mocked(agentsApi.assignTopics).mockResolvedValue({
      ok: true,
      data: { topicAssignments: [link] },
    });
    const onSaved = vi.fn().mockResolvedValue(undefined);
    render(
      <AgentTopicAssignments
        agentId="agent-1"
        assignments={[]}
        topics={[topic]}
        prompts={[prompt]}
        onSaved={onSaved}
      />,
    );
    expect(screen.getByText(/no tiene tópicos conectados/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: 'General' }));
    expect(screen.getByLabelText('Prompt para General')).toHaveValue(prompt.id);
    fireEvent.click(screen.getByRole('button', { name: 'Guardar asignaciones' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(agentsApi.assignTopics).toHaveBeenCalledWith('agent-1', [
      { topicId: topic.id, promptId: prompt.id, priority: 100, isDefault: true },
    ]);
  });

  it('requires a prompt and excludes prompts from other topics', async () => {
    render(
      <AgentTopicAssignments
        agentId="agent-1"
        assignments={[]}
        topics={[topic]}
        prompts={[{ ...prompt, topicId: 'other-topic' }]}
        onSaved={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('checkbox', { name: 'General' }));
    expect(screen.queryByRole('option', { name: /Atención/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar asignaciones' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Selecciona un prompt');
    expect(agentsApi.assignTopics).not.toHaveBeenCalled();
  });

  it('shows server errors and retains unsaved changes', async () => {
    vi.mocked(agentsApi.assignTopics).mockResolvedValue({
      ok: false,
      status: 400,
      message: 'El prompt está inactivo',
    });
    render(
      <AgentTopicAssignments
        agentId="agent-1"
        assignments={[]}
        topics={[topic]}
        prompts={[prompt]}
        onSaved={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('checkbox', { name: 'General' }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar asignaciones' }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('El prompt está inactivo'),
    );
    expect(screen.getByRole('checkbox', { name: 'General' })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Guardar asignaciones' })).toBeEnabled();
  });

  it('loads actual assignments, switches the default, and removes a link', async () => {
    const otherTopic = { ...topic, id: 'topic-2', name: 'Eventos' };
    const otherPrompt = { ...prompt, id: 'prompt-2', topicId: otherTopic.id };
    vi.mocked(agentsApi.assignTopics).mockResolvedValue({
      ok: true,
      data: { topicAssignments: [] },
    });
    render(
      <AgentTopicAssignments
        agentId="agent-1"
        assignments={[link]}
        topics={[topic, otherTopic]}
        prompts={[prompt, otherPrompt]}
        onSaved={vi.fn()}
      />,
    );
    expect(screen.getByRole('checkbox', { name: 'General' })).toBeChecked();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Eventos' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Usar Eventos como predeterminado' }));
    expect(
      screen.getByRole('radio', { name: 'Usar General como predeterminado' }),
    ).not.toBeChecked();
    fireEvent.click(screen.getByRole('checkbox', { name: 'General' }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar asignaciones' }));
    await waitFor(() =>
      expect(agentsApi.assignTopics).toHaveBeenCalledWith('agent-1', [
        { topicId: otherTopic.id, promptId: otherPrompt.id, priority: 100, isDefault: true },
      ]),
    );
  });
});
