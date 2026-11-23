import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { canSubscribeToConversation } from '../../../services/realtime/socket-subscribe-auth';

jest.mock('../../../services/authorization.service', () => ({
  AuthorizationService: jest.fn().mockImplementation(() => ({
    getUserPermissionSlugs: jest.fn(),
  })),
}));

import { AuthorizationService } from '../../../services/authorization.service';

describe('canSubscribeToConversation', () => {
  const conversationFindUnique = jest.fn<() => Promise<{ id: string } | null>>();
  const prisma = {
    conversation: { findUnique: conversationFindUnique },
  } as never;

  beforeEach(() => {
    jest.clearAllMocks();
    conversationFindUnique.mockResolvedValue({ id: '550e8400-e29b-41d4-a716-446655440001' });
    (AuthorizationService as unknown as jest.Mock).mockImplementation(() => ({
      getUserPermissionSlugs: jest.fn<() => Promise<string[]>>().mockResolvedValue(['conversaciones.view']),
    }));
  });

  it('rejects a non-uuid conversation id', async () => {
    await expect(canSubscribeToConversation(prisma, 'user-1', 'not-a-uuid')).resolves.toBe(false);
    expect(conversationFindUnique).not.toHaveBeenCalled();
  });

  it('rejects when the conversation does not exist', async () => {
    conversationFindUnique.mockResolvedValueOnce(null);
    await expect(
      canSubscribeToConversation(prisma, 'user-1', '550e8400-e29b-41d4-a716-446655440001'),
    ).resolves.toBe(false);
  });

  it('allows an admin with conversaciones.view', async () => {
    await expect(
      canSubscribeToConversation(prisma, 'user-1', '550e8400-e29b-41d4-a716-446655440001'),
    ).resolves.toBe(true);
  });

  it('rejects when the user lacks view permissions', async () => {
    (AuthorizationService as unknown as jest.Mock).mockImplementation(() => ({
      getUserPermissionSlugs: jest.fn<() => Promise<string[]>>().mockResolvedValue(['citizens.view']),
    }));
    await expect(
      canSubscribeToConversation(prisma, 'user-1', '550e8400-e29b-41d4-a716-446655440001'),
    ).resolves.toBe(false);
  });
});
