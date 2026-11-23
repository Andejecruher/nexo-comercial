import { beforeEach, describe, expect, it, jest } from '@jest/globals';

// Evita que `dotenv.config()` recargue `.env` local en cada `import('../../config/env.config')`,
// lo que filtraría valores como BATCHING_WINDOW_MS y rompería las aserciones de defaults.
jest.mock('dotenv', () => ({ config: () => ({ parsed: {} }) }));

describe('env.config — NVIDIA multimedia', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.NVIDIA_RIVA_FUNCTION_ID;
    delete process.env.NVIDIA_RIVA_LANGUAGE_CODE;
    delete process.env.NVIDIA_MULTIMODAL_TIMEOUT_MS;
    delete process.env.NVIDIA_RIVA_TIMEOUT_MS;
    delete process.env.NVIDIA_RIVA_MAX_RETRIES;
    delete process.env.NVIDIA_RIVA_RETRY_DELAY_MS;
    jest.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('configura Riva alojado en español sin requerir una URL adicional', async () => {
    const { env } = await import('../../config/env.config');
    expect(env.NVIDIA_RIVA_FUNCTION_ID).toBe('71203149-d3b7-4460-8231-1be2543a1fca');
    expect(env.NVIDIA_RIVA_LANGUAGE_CODE).toBe('es-US');
    expect(env.NVIDIA_MULTIMODAL_TIMEOUT_MS).toBe(30_000);
    expect(env.NVIDIA_RIVA_TIMEOUT_MS).toBe(20_000);
    expect(env.NVIDIA_RIVA_MAX_RETRIES).toBe(1);
    expect(env.NVIDIA_RIVA_RETRY_DELAY_MS).toBe(100);
  });

  it('normaliza valores vacíos y acepta la selección explícita de función/idioma', async () => {
    process.env.NVIDIA_RIVA_FUNCTION_ID = '   ';
    const defaults = await import('../../config/env.config');
    expect(defaults.env.NVIDIA_RIVA_LANGUAGE_CODE).toBe('es-US');
    jest.resetModules();
    process.env.NVIDIA_RIVA_FUNCTION_ID = ' a3c9d1e2-4b5f-4a6c-9d7e-0f1a2b3c4d5e ';
    process.env.NVIDIA_RIVA_LANGUAGE_CODE = ' es-US ';
    process.env.NVIDIA_MULTIMODAL_TIMEOUT_MS = '8000';
    process.env.NVIDIA_RIVA_TIMEOUT_MS = '12000';
    process.env.NVIDIA_RIVA_MAX_RETRIES = '2';
    process.env.NVIDIA_RIVA_RETRY_DELAY_MS = '0';
    const configured = await import('../../config/env.config');
    expect(configured.env.NVIDIA_RIVA_FUNCTION_ID).toBe('a3c9d1e2-4b5f-4a6c-9d7e-0f1a2b3c4d5e');
    expect(configured.env.NVIDIA_RIVA_LANGUAGE_CODE).toBe('es-US');
    expect(configured.env.NVIDIA_MULTIMODAL_TIMEOUT_MS).toBe(8000);
    expect(configured.env.NVIDIA_RIVA_TIMEOUT_MS).toBe(12000);
    expect(configured.env.NVIDIA_RIVA_MAX_RETRIES).toBe(2);
    expect(configured.env.NVIDIA_RIVA_RETRY_DELAY_MS).toBe(0);
  });

  it('rechaza identificadores de función inválidos', async () => {
    process.env.NVIDIA_RIVA_FUNCTION_ID = 'not-a-uuid';
    await expect(import('../../config/env.config')).rejects.toThrow(/NVIDIA_RIVA_FUNCTION_ID/);
  });

  it('rechaza idiomas con un formato inválido', async () => {
    process.env.NVIDIA_RIVA_LANGUAGE_CODE = 'español';
    await expect(import('../../config/env.config')).rejects.toThrow(/NVIDIA_RIVA_LANGUAGE_CODE/);
  });

  it.each(['0', '60001', '100.5', 'invalid'])(
    'rechaza un presupuesto multimedia inválido: %s',
    async (value) => {
      process.env.NVIDIA_MULTIMODAL_TIMEOUT_MS = value;
      await expect(import('../../config/env.config')).rejects.toThrow(
        /NVIDIA_MULTIMODAL_TIMEOUT_MS/,
      );
    },
  );

  it.each(['0', '60001', '100.5', 'invalid'])(
    'rechaza un timeout Riva inválido: %s',
    async (value) => {
      process.env.NVIDIA_RIVA_TIMEOUT_MS = value;
      await expect(import('../../config/env.config')).rejects.toThrow(/NVIDIA_RIVA_TIMEOUT_MS/);
    },
  );
});

describe('env.config — batching flags', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    jest.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  function loadEnv() {
    return import('../../config/env.config');
  }

  it('defaults BATCHING_WINDOW_MS to 0 and BATCHING_MAX_WAIT_MS to 30_000', async () => {
    delete process.env.BATCHING_WINDOW_MS;
    delete process.env.BATCHING_MAX_WAIT_MS;

    const { env } = await loadEnv();

    expect(env.BATCHING_WINDOW_MS).toBe(0);
    expect(env.BATCHING_MAX_WAIT_MS).toBe(30_000);
  });

  it('accepts positive integers for both flags', async () => {
    process.env.BATCHING_WINDOW_MS = '2500';
    process.env.BATCHING_MAX_WAIT_MS = '5000';

    const { env } = await loadEnv();

    expect(env.BATCHING_WINDOW_MS).toBe(2500);
    expect(env.BATCHING_MAX_WAIT_MS).toBe(5000);
  });

  it('allows max-wait cap shorter than the batching window', async () => {
    process.env.BATCHING_WINDOW_MS = '5000';
    process.env.BATCHING_MAX_WAIT_MS = '3000';

    const { env } = await loadEnv();

    expect(env.BATCHING_WINDOW_MS).toBe(5000);
    expect(env.BATCHING_MAX_WAIT_MS).toBe(3000);
  });

  it('rejects a negative batching window', async () => {
    process.env.BATCHING_WINDOW_MS = '-100';

    await expect(loadEnv()).rejects.toThrow(/BATCHING_WINDOW_MS/);
  });

  it('rejects a fractional batching window', async () => {
    process.env.BATCHING_WINDOW_MS = '100.5';

    await expect(loadEnv()).rejects.toThrow(/BATCHING_WINDOW_MS/);
  });

  it('rejects a non-numeric batching window', async () => {
    process.env.BATCHING_WINDOW_MS = 'fast';

    await expect(loadEnv()).rejects.toThrow(/BATCHING_WINDOW_MS/);
  });

  it('rejects a negative max-wait cap', async () => {
    process.env.BATCHING_MAX_WAIT_MS = '-1';

    await expect(loadEnv()).rejects.toThrow(/BATCHING_MAX_WAIT_MS/);
  });

  it('rejects zero max-wait cap', async () => {
    process.env.BATCHING_MAX_WAIT_MS = '0';

    await expect(loadEnv()).rejects.toThrow(/BATCHING_MAX_WAIT_MS/);
  });
});

describe('env.config — polling loop split flags', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    jest.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  function loadEnv() {
    return import('../../config/env.config');
  }

  it('defaults both loops to enabled, preserving the WORKERS_ENABLED behaviour', async () => {
    delete process.env.INBOX_POLLING_ENABLED;
    delete process.env.OUTBOX_POLLING_ENABLED;

    const { env } = await loadEnv();

    expect(env.INBOX_POLLING_ENABLED).toBe(true);
    expect(env.OUTBOX_POLLING_ENABLED).toBe(true);
  });

  it.each(['false', '0', 'no', 'off'])('parses %s as false', async (value) => {
    process.env.INBOX_POLLING_ENABLED = value;
    process.env.OUTBOX_POLLING_ENABLED = value;

    const { env } = await loadEnv();

    expect(env.INBOX_POLLING_ENABLED).toBe(false);
    expect(env.OUTBOX_POLLING_ENABLED).toBe(false);
  });

  it.each(['true', '1', 'yes', 'on'])('parses %s as true', async (value) => {
    process.env.INBOX_POLLING_ENABLED = value;
    process.env.OUTBOX_POLLING_ENABLED = value;

    const { env } = await loadEnv();

    expect(env.INBOX_POLLING_ENABLED).toBe(true);
    expect(env.OUTBOX_POLLING_ENABLED).toBe(true);
  });

  it('allows splitting the two loops independently', async () => {
    // La config de dev: la API corre inbox (orquestador + WS gateway) y el
    // worker corre outbox, para no competir por el claim del inbox event.
    process.env.INBOX_POLLING_ENABLED = 'true';
    process.env.OUTBOX_POLLING_ENABLED = 'false';

    const { env } = await loadEnv();

    expect(env.INBOX_POLLING_ENABLED).toBe(true);
    expect(env.OUTBOX_POLLING_ENABLED).toBe(false);
  });

  it.each(['false', '0', 'no', 'off'])(
    'parses DISABLE_INTERNAL_POLLING=%s as false',
    async (value) => {
      process.env.DISABLE_INTERNAL_POLLING = value;

      const { env } = await loadEnv();

      expect(env.DISABLE_INTERNAL_POLLING).toBe(false);
    },
  );

  it.each(['true', '1', 'yes', 'on'])(
    'parses DISABLE_INTERNAL_POLLING=%s as true',
    async (value) => {
      process.env.DISABLE_INTERNAL_POLLING = value;

      const { env } = await loadEnv();

      expect(env.DISABLE_INTERNAL_POLLING).toBe(true);
    },
  );
});
