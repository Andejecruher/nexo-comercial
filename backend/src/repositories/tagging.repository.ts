import { PrismaService } from '../services/prisma.service';

export class TaggingRepository {
  constructor(private readonly prisma: PrismaService) {}

  async assignTagsToCitizen(params: {
    citizenId: string;
    normalizedTagNames: string[];
  }): Promise<{ assigned: string[]; skipped: string[] }> {
    return this.prisma.$transaction(async (tx) => {
      const existingTags = await tx.tag.findMany({
        where: {
          name: { in: params.normalizedTagNames, mode: 'insensitive' },
        },
        select: { id: true, name: true },
      });

      const tagByName = new Map<string, string>(
        existingTags.map((t) => [t.name.toLowerCase(), t.id]),
      );

      const missingNames = params.normalizedTagNames.filter((n) => !tagByName.has(n));

      for (const name of missingNames) {
        const created = await tx.tag.upsert({
          where: { name },
          create: { name },
          update: {},
          select: { id: true, name: true },
        });
        tagByName.set(created.name.toLowerCase(), created.id);
      }

      const resolvedTagIds = params.normalizedTagNames.map((name) => {
        const id = tagByName.get(name);
        if (!id) throw new Error(`Could not resolve tag id for: ${name}`);
        return { name, id };
      });

      const alreadyAssigned = await tx.citizenTag.findMany({
        where: {
          citizenId: params.citizenId,
          tagId: { in: resolvedTagIds.map((t) => t.id) },
        },
        select: { tagId: true },
      });

      const alreadyAssignedIds = new Set(alreadyAssigned.map((ct) => ct.tagId));

      const toAssign = resolvedTagIds.filter((t) => !alreadyAssignedIds.has(t.id));
      const toSkip = resolvedTagIds.filter((t) => alreadyAssignedIds.has(t.id));

      if (toAssign.length > 0) {
        await tx.citizenTag.createMany({
          data: toAssign.map((t) => ({ citizenId: params.citizenId, tagId: t.id })),
          skipDuplicates: true,
        });
      }

      return {
        assigned: toAssign.map((t) => t.name),
        skipped: toSkip.map((t) => t.name),
      };
    });
  }
}
