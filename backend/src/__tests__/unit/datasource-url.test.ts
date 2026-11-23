import { describe, expect, it } from '@jest/globals';
import { env } from '../../config/env.config';
import {
  DEFAULT_API_PRISMA_CONNECTION_LIMIT,
  DEFAULT_WORKER_PRISMA_CONNECTION_LIMIT,
  prismaConnectionLimit,
  resolveDatasourceUrl,
} from '../../database/datasource-url';
import { withEnv, withEnvConfig } from '../helpers/with-env';

const cloudSql = {
  CLOUDSQL_INSTANCE_CONNECTION_NAME: 'proj:us-central1:voz-db',
  CLOUDSQL_DB_USER: 'voz',
  CLOUDSQL_DB_PASS: 'secret',
  CLOUDSQL_DB_NAME: 'vozcuidadana',
  CLOUDSQL_USE_PGBOUNCER: undefined,
};

describe('prisma datasource URL', () => {
  it('uses DATABASE_URL when Cloud SQL env is absent', () => {
    const restore = withEnv({
      CLOUDSQL_INSTANCE_CONNECTION_NAME: undefined,
      CLOUDSQL_DB_USER: undefined,
      CLOUDSQL_DB_PASS: undefined,
      CLOUDSQL_DB_NAME: undefined,
    });
    try {
      expect(resolveDatasourceUrl()).toBe(env.DATABASE_URL);
    } finally {
      restore();
    }
  });

  it('defaults the worker pool when workers are enabled', () => {
    const restore = withEnvConfig(env, {
      WORKERS_ENABLED: true,
      PRISMA_CONNECTION_LIMIT: undefined,
    });
    try {
      expect(prismaConnectionLimit()).toBe(DEFAULT_WORKER_PRISMA_CONNECTION_LIMIT);
    } finally {
      restore();
    }
  });

  it('defaults the API pool when workers are disabled', () => {
    const restoreEnv = withEnv(cloudSql);
    const restore = withEnvConfig(env, {
      WORKERS_ENABLED: false,
      PRISMA_CONNECTION_LIMIT: undefined,
    });
    try {
      expect(DEFAULT_API_PRISMA_CONNECTION_LIMIT).toBe(10);
      expect(prismaConnectionLimit()).toBe(10);
      expect(resolveDatasourceUrl()).toContain('connection_limit=10');
    } finally {
      restore();
      restoreEnv();
    }
  });

  it('lets PRISMA_CONNECTION_LIMIT override the worker/API heuristic', () => {
    const restore = withEnvConfig(env, {
      WORKERS_ENABLED: false,
      PRISMA_CONNECTION_LIMIT: 6,
    });
    try {
      expect(prismaConnectionLimit()).toBe(6);
    } finally {
      restore();
    }
  });

  it('builds a Cloud SQL socket URL with the resolved connection_limit', () => {
    const restoreEnv = withEnv(cloudSql);
    const restoreConfig = withEnvConfig(env, {
      WORKERS_ENABLED: true,
      PRISMA_CONNECTION_LIMIT: undefined,
    });
    try {
      expect(resolveDatasourceUrl()).toBe(
        'postgresql://voz:secret@localhost/vozcuidadana?host=/cloudsql/proj:us-central1:voz-db&connection_limit=8',
      );
    } finally {
      restoreConfig();
      restoreEnv();
    }
  });

  it('appends pgbouncer=true when requested', () => {
    const restoreEnv = withEnv({ ...cloudSql, CLOUDSQL_USE_PGBOUNCER: 'true' });
    const restoreConfig = withEnvConfig(env, { PRISMA_CONNECTION_LIMIT: 1 });
    try {
      expect(resolveDatasourceUrl()).toContain('connection_limit=1&pgbouncer=true');
    } finally {
      restoreConfig();
      restoreEnv();
    }
  });
});
