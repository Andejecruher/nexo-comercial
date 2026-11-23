import { z } from 'zod';
import { AuthorizationService } from '../authorization.service';
import type { PrismaService } from '../prisma.service';
import { hasAnyPermission } from '../../utils/authorization.util';

const ConversationIdSchema = z.string().uuid();

const VIEW_PERMISSIONS = ['conversaciones.view', 'tickets.view'] as const;

export async function canSubscribeToConversation(
  prisma: PrismaService,
  userId: string,
  conversationId: string,
): Promise<boolean> {
  if (!ConversationIdSchema.safeParse(conversationId).success) {
    return false;
  }

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { id: true },
  });
  if (!conversation) {
    return false;
  }

  const authorization = new AuthorizationService(prisma);
  const permissions = await authorization.getUserPermissionSlugs(userId);
  return hasAnyPermission(permissions, VIEW_PERMISSIONS);
}
