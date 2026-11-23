import { afterAll, afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { withEnv } from '../../helpers/with-env';

// Sin este mock, `dotenv.config()` recarga el `.env` local (gitignored) cada vez
// que se importa env.config, y repuebla REALTIME_DURABLE_ENABLED después del
// `delete` del test. Las aserciones de "default cuando no está seteado" pasaban
// en CI (sin .env) y fallaban en cualquier máquina de dev que lo tenga.
jest.mock('dotenv', () => ({ config: () => ({ parsed: {} }) }));

const requiredEnv = {
  NODE_ENV: 'test',
  BASE_URL: 'http://localhost:8000',
  DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
  ENCRYPTION_KEY: 'test-encryption-key',
  JWT_SECRET: 'test-jwt-secret',
  JWT_REFRESH_SECRET: 'test-jwt-refresh-secret',
  WHATSAPP_VERIFY_TOKEN: 'test',
  WHATSAPP_APP_ID: 'test',
  WHATSAPP_APP_SECRET: 'test',
  WHATSAPP_ACCESS_TOKEN: 'test',
  WHATSAPP_PHONE_NUMBER_ID: 'test',
  WHATSAPP_BUSINESS_ACCOUNT_ID: 'test',
};

describe('REALTIME_DURABLE_ENABLED config', () => {
  let restore: (() => void) | undefined;

  beforeEach(() => {
    jest.resetModules();
    restore = withEnv(requiredEnv);
  });

  afterEach(() => {
    restore?.();
  });

  afterAll(() => {
    restore?.();
  });

  it('defaults to true when the variable is unset', () => {
    // withEnv sets all required vars; delete the one under test to simulate unset.
    delete process.env.REALTIME_DURABLE_ENABLED;
    const { env } = require('../../../config/env.config');
    expect(env.REALTIME_DURABLE_ENABLED).toBe(true);
  });

  it.each(['false', '0', 'no', 'off'])('parses %s as false', (value) => {
    restore?.();
    restore = withEnv({ ...requiredEnv, REALTIME_DURABLE_ENABLED: value });
    const { env } = require('../../../config/env.config');
    expect(env.REALTIME_DURABLE_ENABLED).toBe(false);
  });

  it.each(['true', '1', 'yes', 'on'])('parses %s as true', (value) => {
    restore?.();
    restore = withEnv({ ...requiredEnv, REALTIME_DURABLE_ENABLED: value });
    const { env } = require('../../../config/env.config');
    expect(env.REALTIME_DURABLE_ENABLED).toBe(true);
  });

  it('defaults LOG_LEVEL to info', () => {
    delete process.env.LOG_LEVEL;
    const { env } = require('../../../config/env.config');
    expect(env.LOG_LEVEL).toBe('info');
  });

  it.each(['debug', 'info', 'warn', 'error'])('accepts LOG_LEVEL=%s', (value) => {
    restore?.();
    restore = withEnv({ ...requiredEnv, LOG_LEVEL: value });
    const { env } = require('../../../config/env.config');
    expect(env.LOG_LEVEL).toBe(value);
  });
});
