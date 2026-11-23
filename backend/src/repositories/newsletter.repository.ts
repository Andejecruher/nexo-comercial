/* eslint-disable @typescript-eslint/no-explicit-any */
import { PrismaService } from '../services/prisma.service';

export type NewsletterSubscriberRecord = {
  id: string;
  email: string;
  name?: string | null;
  status: string;
  subscribedAt: Date | null;
  unsubscribedAt?: Date | null;
  confirmTokenHash?: string | null;
  confirmTokenExpiresAt?: Date | null;
  unsubscribeTokenHash?: string | null;
};

export interface NewsletterPrismaLike {
  newsletterSubscriber: {
    findUnique: (args: unknown) => Promise<NewsletterSubscriberRecord | null>;
    findFirst: (args: unknown) => Promise<NewsletterSubscriberRecord | null>;
    create: (args: unknown) => Promise<NewsletterSubscriberRecord>;
    update: (args: unknown) => Promise<NewsletterSubscriberRecord>;
  };
}

export class NewsletterRepository {
  constructor(private readonly prisma: PrismaService | NewsletterPrismaLike) {}

  findByEmail(email: string): Promise<NewsletterSubscriberRecord | null> {
    return this.prisma.newsletterSubscriber.findUnique({
      where: { email },
    }) as Promise<NewsletterSubscriberRecord | null>;
  }

  findByConfirmTokenHash(confirmTokenHash: string): Promise<NewsletterSubscriberRecord | null> {
    return this.prisma.newsletterSubscriber.findFirst({
      where: { confirmTokenHash },
    }) as Promise<NewsletterSubscriberRecord | null>;
  }

  findByUnsubscribeTokenHash(
    unsubscribeTokenHash: string,
  ): Promise<NewsletterSubscriberRecord | null> {
    return this.prisma.newsletterSubscriber.findFirst({
      where: { unsubscribeTokenHash },
    }) as Promise<NewsletterSubscriberRecord | null>;
  }

  create(data: Record<string, unknown>): Promise<NewsletterSubscriberRecord> {
    return (this.prisma.newsletterSubscriber as any).create({
      data,
    }) as Promise<NewsletterSubscriberRecord>;
  }

  updateById(id: string, data: Record<string, unknown>): Promise<NewsletterSubscriberRecord> {
    return (this.prisma.newsletterSubscriber as any).update({
      where: { id },
      data,
    }) as Promise<NewsletterSubscriberRecord>;
  }

  findStatusByEmail(email: string): Promise<{ status: string } | null> {
    return this.prisma.newsletterSubscriber.findUnique({
      where: { email },
      select: { status: true },
    }) as Promise<{ status: string } | null>;
  }
}
