import type { AIProvider } from '@/lib/ai-api';

// The backend's `openai` provider uses the NVIDIA NIM endpoint and NVIDIA_API_KEY.
export const AI_PROVIDER_LABELS: Record<AIProvider, string> = {
  openai: 'NVIDIA NIM (compatible OpenAI)',
  anthropic: 'Anthropic',
};

export const AI_PROVIDER_MODELS: Record<AIProvider, string[]> = {
  openai: ['nvidia/nemotron-3.5-lightning-30b-a3b', 'openai/gpt-oss-20b'],
  anthropic: [
    'claude-opus-4-5',
    'claude-sonnet-4-5',
    'claude-haiku-4-5',
    'claude-3-opus-20240229',
    'claude-3-sonnet-20240229',
    'claude-3-haiku-20240307',
  ],
};

export const NVIDIA_MODEL_HELP =
  'El chat de esta plataforma usa NVIDIA NIM. Usa el identificador completo de un modelo disponible allí.';
