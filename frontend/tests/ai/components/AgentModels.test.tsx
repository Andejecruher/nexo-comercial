import { AgentForm } from '@/components/ai/AgentForm';
import { ModelConfigForm } from '@/components/ai/ModelConfigForm';
import type { AiAgent } from '@/lib/shared/ai-api';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const agent: AiAgent = {
  id: 'agent-1',
  slug: 'atencion',
  name: 'Atención',
  provider: 'openai',
  model: 'gpt-4o',
  isActive: true,
  metadata: {},
  createdAt: '',
  updatedAt: '',
};

describe('AI model configuration', () => {
  it('suggests NVIDIA identifiers when creating an agent and saves the selected model', async () => {
    const onSubmit = vi.fn().mockResolvedValue({ success: true });
    const { container } = render(<AgentForm open onClose={vi.fn()} onSubmit={onSubmit} />);
    expect(screen.getByText('NVIDIA NIM (compatible OpenAI)')).toBeInTheDocument();
    const suggestions = [...container.ownerDocument.querySelectorAll('datalist option')].map(
      (option) => option.getAttribute('value'),
    );
    expect(suggestions).toContain('nvidia/nemotron-3.5-lightning-30b-a3b');
    expect(suggestions).not.toContain('gpt-4o');
    fireEvent.change(screen.getByLabelText(/Nombre/), { target: { value: 'Atención' } });
    fireEvent.change(screen.getByLabelText(/Slug/), { target: { value: 'atencion' } });
    fireEvent.change(screen.getByLabelText(/Modelo/), {
      target: { value: 'nvidia/nemotron-3.5-lightning-30b-a3b' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Crear agente' }));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: 'openai',
          model: 'nvidia/nemotron-3.5-lightning-30b-a3b',
        }),
      ),
    );
  });

  it('keeps an existing custom model unchanged while explaining the NVIDIA provider', () => {
    const onSave = vi.fn();
    render(<ModelConfigForm agent={agent} onSave={onSave} />);
    expect(screen.getByDisplayValue('gpt-4o')).toBeInTheDocument();
    expect(screen.getByText(/El chat de esta plataforma usa NVIDIA NIM/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeDisabled();
    expect(onSave).not.toHaveBeenCalled();
  });
});
