import type { Prisma } from '@prisma/client';
import { PrismaService } from '../services/prisma.service';

export type UserNotificationPreferencesRow = {
  id: string;
  userId: string;
  preferences: Prisma.JsonValue;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Repository de preferencias de notificación por usuario.
 * El documento JSON completo se almacena opaco; la validación vive en el servicio.
 */
export class UserNotificationPreferencesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByUserId(userId: string): Promise<UserNotificationPreferencesRow | null> {
    const row = await this.prisma.userNotificationPreference.findUnique({
      where: { userId },
    });
    return row as UserNotificationPreferencesRow | null;
  }

  async upsert(
    userId: string,
    preferences: Prisma.InputJsonValue,
  ): Promise<UserNotificationPreferencesRow> {
    const row = await this.prisma.userNotificationPreference.upsert({
      where: { userId },
      create: { userId, preferences },
      update: { preferences },
    });
    return row as UserNotificationPreferencesRow;
  }
}
