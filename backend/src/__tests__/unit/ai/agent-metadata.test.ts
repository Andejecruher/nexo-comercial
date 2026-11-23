import { describe, expect, it } from '@jest/globals';
import { validateAiAgentMetadata } from '../../../ai/config/agent-metadata';

describe('validateAiAgentMetadata', () => {
  it('acepta metadata valida con claves camelCase y snake_case', () => {
    const errors = validateAiAgentMetadata({
      topP: 0.9,
      top_p: '0.9',
      topK: 40,
      top_k: '40',
      frequencyPenalty: -0.5,
      frequency_penalty: '-0.5',
      presencePenalty: 0.2,
      presence_penalty: '0.2',
      stream: 'true',
      chatTemplateKwargs: { thinking: false },
      chat_template_kwargs: { thinking: false },
      customSetting: 'allowed',
    });

    expect(errors).toEqual([]);
  });

  it('rechaza valores fuera de rango o tipos invalidos', () => {
    const errors = validateAiAgentMetadata({
      topP: 1.5,
      topK: 0,
      frequencyPenalty: 3,
      stream: 'yes',
      chatTemplateKwargs: 'no-es-objeto',
    });

    expect(errors).toContain('metadata.topP debe ser <= 1');
    expect(errors).toContain('metadata.topK debe ser >= 1');
    expect(errors).toContain('metadata.frequencyPenalty debe ser <= 2');
    expect(errors).toContain('metadata.stream debe ser booleano');
    expect(errors).toContain('metadata.chatTemplateKwargs debe ser un objeto');
  });

  it('rechaza alias numericos con valores inconsistentes', () => {
    const errors = validateAiAgentMetadata({
      topP: 0.7,
      top_p: 0.8,
      topK: 20,
      top_k: 21,
    });

    expect(errors).toContain('metadata.topP y metadata.top_p deben tener el mismo valor');
    expect(errors).toContain('metadata.topK y metadata.top_k deben tener el mismo valor');
  });
});
