import { describe, expect, it } from '@jest/globals';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { prismaLogFields } from '../../utils/prisma-errors';

describe('prismaLogFields', () => {
  it('includes Prisma known-request codes for worker logs', () => {
    const err = new PrismaClientKnownRequestError(
      'Transaction API error: Unable to start a transaction in the given time.',
      { code: 'P2028', clientVersion: 'test' },
    );
    expect(prismaLogFields(err)).toEqual({
      errorType: 'PrismaClientKnownRequestError',
      errorCode: 'P2028',
    });
  });

  it('falls back to the error name without a code', () => {
    expect(prismaLogFields(new Error('nope'))).toEqual({ errorType: 'Error' });
    expect(prismaLogFields('x')).toEqual({ errorType: 'UnknownError' });
  });
});
