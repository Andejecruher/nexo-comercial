import { z } from 'zod';

export const createCitizenToolSchema = z.object({
  phone: z.string().trim().min(7),
  profileName: z.string().trim().min(1).optional(),
  consentGiven: z.boolean().optional(),
  openConversation: z.boolean().optional(),
});

export const sendMessageToolSchema = z.object({
  phone: z.string().trim().min(7).max(20),
  body: z.string().trim().min(1).max(4096),
  messageType: z.enum(['text', 'template', 'interactive', 'image']).default('text'),
  conversationId: z.string().uuid().optional(),
  idempotencyKey: z.string().trim().min(1).max(128).optional(),
  templateName: z.string().trim().min(1).max(120).optional(),
  components: z.array(z.unknown()).optional(),
  attachments: z.array(z.unknown()).optional(),
});

export const externalToolInputSchema = z.record(z.string(), z.unknown());
