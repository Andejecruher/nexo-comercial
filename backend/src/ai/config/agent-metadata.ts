export interface AgentMetadataGuideEntry {
  key: string;
  alias?: string;
  type: 'number' | 'boolean' | 'object';
  description: string;
  range?: string;
}

export const AI_AGENT_METADATA_GUIDE: AgentMetadataGuideEntry[] = [
  {
    key: 'topP',
    alias: 'top_p',
    type: 'number',
    range: '0 <= value <= 1',
    description: 'Nucleus sampling. Entre menor valor, menor diversidad.',
  },
  {
    key: 'topK',
    alias: 'top_k',
    type: 'number',
    range: 'integer >= 1',
    description: 'Cantidad maxima de tokens candidatos por paso.',
  },
  {
    key: 'frequencyPenalty',
    alias: 'frequency_penalty',
    type: 'number',
    range: '-2 <= value <= 2',
    description: 'Penaliza repeticiones segun frecuencia de tokens.',
  },
  {
    key: 'presencePenalty',
    alias: 'presence_penalty',
    type: 'number',
    range: '-2 <= value <= 2',
    description: 'Penaliza tokens ya presentes para favorecer exploracion.',
  },
  {
    key: 'stream',
    type: 'boolean',
    description: 'Activa respuestas incrementales de stream.',
  },
  {
    key: 'chatTemplateKwargs',
    alias: 'chat_template_kwargs',
    type: 'object',
    description: 'Parametros avanzados del template de chat (compat OpenAI/NVIDIA).',
  },
];

function hasOwn(metadata: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(metadata, key);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function toFiniteNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function toBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }

  return undefined;
}

function validateNumericAliasPair(
  metadata: Record<string, unknown>,
  params: {
    key: string;
    alias?: string;
    min?: number;
    max?: number;
    integer?: boolean;
  },
): string[] {
  const errors: string[] = [];
  const values = [params.key, params.alias].filter((item): item is string => !!item);

  let normalizedPrimary: number | undefined;
  let normalizedAlias: number | undefined;

  for (const keyName of values) {
    if (!hasOwn(metadata, keyName)) {
      continue;
    }

    const rawValue = metadata[keyName];
    const normalized = toFiniteNumber(rawValue);
    if (normalized === undefined) {
      errors.push(`metadata.${keyName} debe ser numerico`);
      continue;
    }

    if (params.integer && !Number.isInteger(normalized)) {
      errors.push(`metadata.${keyName} debe ser entero`);
    }
    if (params.min !== undefined && normalized < params.min) {
      errors.push(`metadata.${keyName} debe ser >= ${params.min}`);
    }
    if (params.max !== undefined && normalized > params.max) {
      errors.push(`metadata.${keyName} debe ser <= ${params.max}`);
    }

    if (keyName === params.key) {
      normalizedPrimary = normalized;
    }
    if (params.alias && keyName === params.alias) {
      normalizedAlias = normalized;
    }
  }

  if (
    params.alias &&
    normalizedPrimary !== undefined &&
    normalizedAlias !== undefined &&
    normalizedPrimary !== normalizedAlias
  ) {
    errors.push(`metadata.${params.key} y metadata.${params.alias} deben tener el mismo valor`);
  }

  return errors;
}

function validateBooleanKey(metadata: Record<string, unknown>, key: string): string[] {
  if (!hasOwn(metadata, key)) {
    return [];
  }

  const normalized = toBoolean(metadata[key]);
  return normalized === undefined ? [`metadata.${key} debe ser booleano`] : [];
}

function validateObjectAliasPair(
  metadata: Record<string, unknown>,
  key: string,
  alias?: string,
): string[] {
  const errors: string[] = [];

  if (hasOwn(metadata, key) && !isPlainObject(metadata[key])) {
    errors.push(`metadata.${key} debe ser un objeto`);
  }

  if (alias && hasOwn(metadata, alias) && !isPlainObject(metadata[alias])) {
    errors.push(`metadata.${alias} debe ser un objeto`);
  }

  return errors;
}

export function validateAiAgentMetadata(metadata: Record<string, unknown>): string[] {
  const errors: string[] = [];

  errors.push(
    ...validateNumericAliasPair(metadata, {
      key: 'topP',
      alias: 'top_p',
      min: 0,
      max: 1,
    }),
  );

  errors.push(
    ...validateNumericAliasPair(metadata, {
      key: 'topK',
      alias: 'top_k',
      min: 1,
      integer: true,
    }),
  );

  errors.push(
    ...validateNumericAliasPair(metadata, {
      key: 'frequencyPenalty',
      alias: 'frequency_penalty',
      min: -2,
      max: 2,
    }),
  );

  errors.push(
    ...validateNumericAliasPair(metadata, {
      key: 'presencePenalty',
      alias: 'presence_penalty',
      min: -2,
      max: 2,
    }),
  );

  errors.push(...validateBooleanKey(metadata, 'stream'));
  errors.push(...validateObjectAliasPair(metadata, 'chatTemplateKwargs', 'chat_template_kwargs'));

  return errors;
}
