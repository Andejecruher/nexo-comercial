import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';
import { RealtimeOutboxStatus } from '@prisma/client';

describe('RealtimeOutboxEvent schema', () => {
  const schemaPath = join(__dirname, '../../../../prisma/schema.prisma');
  const schema = readFileSync(schemaPath, 'utf-8');

  it('defines RealtimeOutboxStatus enum with expected values', () => {
    expect(schema).toContain('enum RealtimeOutboxStatus');
    expect(RealtimeOutboxStatus.pending).toBe('pending');
    expect(RealtimeOutboxStatus.publishing).toBe('publishing');
    expect(RealtimeOutboxStatus.published).toBe('published');
    expect(RealtimeOutboxStatus.failed).toBe('failed');
    expect(RealtimeOutboxStatus.dead_lettered).toBe('dead_lettered');
  });

  it('defines RealtimeOutboxEvent model mapped to realtime_outbox_events', () => {
    expect(schema).toContain('model RealtimeOutboxEvent');
    expect(schema).toContain('@@map("realtime_outbox_events")');
  });

  it('includes required outbox fields in the model', () => {
    expect(schema).toContain('eventType');
    expect(schema).toContain('socketEventName');
    expect(schema).toContain('payload');
    expect(schema).toContain('status');
    expect(schema).toContain('attempts');
    expect(schema).toContain('nextRetryAt');
    expect(schema).toContain('lockedAt');
    expect(schema).toContain('lockedBy');
    expect(schema).toContain('publishedAt');
    expect(schema).toContain('lastError');
  });

  it('includes required indexes for the outbox relay', () => {
    expect(schema).toContain('@@index([status, nextRetryAt])');
    expect(schema).toContain('@@index([eventType])');
    expect(schema).toContain('@@index([createdAt])');
  });
});
