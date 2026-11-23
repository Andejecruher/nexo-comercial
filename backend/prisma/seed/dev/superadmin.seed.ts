import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../shared/utils';

export async function seedSuperadmin(prisma: PrismaClient): Promise<void> {
  const email = process.env.SUPERADMIN_EMAIL ?? 'admin@vozcuidadana.mx';
  const password = process.env.SUPERADMIN_PASSWORD;
  const fullName = process.env.SUPERADMIN_FULL_NAME ?? 'Super Administrador';

  if (!password) {
    throw new Error('SUPERADMIN_PASSWORD env var is required to seed the superadmin user.');
  }

  const superadminRole = await prisma.role.findUnique({ where: { slug: 'super-admin' } });
  if (!superadminRole) {
    throw new Error('Role super-admin not found — run seedRoles first');
  }

  const normalizedEmail = email.toLowerCase().trim();
  const hashedPassword = await hashPassword(password);

  const user = await prisma.$transaction(async (tx) => {
    const upsertedUser = await tx.user.upsert({
      where: { email: normalizedEmail },
      update: {
        fullName,
        isActive: true,
      },
      create: {
        email: normalizedEmail,
        hashedPassword,
        fullName,
        isActive: true,
      },
      select: { id: true, email: true },
    });

    await tx.userRole.createMany({
      data: [{ userId: upsertedUser.id, roleId: superadminRole.id }],
      skipDuplicates: true,
    });

    return upsertedUser;
  });

  console.log(`✅ Superadmin ready: ${user.email}`);
  console.log(`   ⚠️  Change the password in production via SUPERADMIN_PASSWORD env var`);
}
