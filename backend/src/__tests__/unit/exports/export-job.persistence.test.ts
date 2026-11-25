import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const schemaPath = join(process.cwd(), 'prisma/schema.prisma');

describe('ExportJob persistence contract', () => {
  it('declares a FK-free export job with lifecycle and audit indexes', () => {
    const schema = readFileSync(schemaPath, 'utf8');

    expect(schema).toContain('enum ExportModule');
    expect(schema).toContain('enum ExportJobStatus');
    expect(schema).toContain('model ExportJob');
    expect(schema).toMatch(/requestedByUserId\s+String/);
    expect(schema).toContain('@@index([requestedByUserId, createdAt])');
    expect(schema).toContain('@@index([status, expiresAt])');
    expect(schema).toContain('@@index([status, completedAt])');
  });
});
