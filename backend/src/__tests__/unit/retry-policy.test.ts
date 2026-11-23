import { describe, expect, it } from '@jest/globals';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { ConflictError } from '../../utils/app-error';
import { isNonRetryableError, persistenceErrorReason } from '../../utils/retry-policy';

function rawError(sqlState?: string): PrismaClientKnownRequestError {
  return new PrismaClientKnownRequestError('Raw query failed', {
    code: 'P2010',
    clientVersion: 'test',
    ...(sqlState ? { meta: { code: sqlState, message: 'db detail' } } : {}),
  });
}

describe('retry-policy', () => {
  it('classifies a raw CHECK violation (23514) as terminal', () => {
    expect(isNonRetryableError(rawError('23514'))).toBe(true);
    expect(persistenceErrorReason(rawError('23514'))).toContain('[P2010/23514]');
  });

  it('classifies other deterministic SQLSTATE classes as terminal', () => {
    expect(isNonRetryableError(rawError('23505'))).toBe(true); // unique
    expect(isNonRetryableError(rawError('22001'))).toBe(true); // string too long
    expect(isNonRetryableError(rawError('42P01'))).toBe(true); // undefined table
  });

  it('keeps transient SQLSTATE classes retryable', () => {
    expect(isNonRetryableError(rawError('40001'))).toBe(false); // serialization
    expect(isNonRetryableError(rawError('40P01'))).toBe(false); // deadlock
    expect(isNonRetryableError(rawError('57014'))).toBe(false); // query canceled
    expect(isNonRetryableError(rawError('08006'))).toBe(false); // connection failure
  });

  it('treats P2010 without SQLSTATE as terminal to avoid an infinite loop', () => {
    expect(isNonRetryableError(rawError())).toBe(true);
  });

  it('classifies deterministic query-builder codes as terminal', () => {
    const unique = new PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: 'test',
    });
    const foreignKey = new PrismaClientKnownRequestError('Foreign key failed', {
      code: 'P2003',
      clientVersion: 'test',
    });
    expect(isNonRetryableError(unique)).toBe(true);
    expect(isNonRetryableError(foreignKey)).toBe(true);
  });

  it('keeps pool/transaction timeouts retryable', () => {
    const pool = new PrismaClientKnownRequestError('Pool timeout', {
      code: 'P2024',
      clientVersion: 'test',
    });
    const transaction = new PrismaClientKnownRequestError('Transaction expired', {
      code: 'P2028',
      clientVersion: 'test',
    });
    expect(isNonRetryableError(pool)).toBe(false);
    expect(isNonRetryableError(transaction)).toBe(false);
  });

  it('classifies business AppErrors by HTTP status', () => {
    expect(isNonRetryableError(new ConflictError('otra línea'))).toBe(true);
    expect(isNonRetryableError(new Error('transient network'))).toBe(false);
  });
});
