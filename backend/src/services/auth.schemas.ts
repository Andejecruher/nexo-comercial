import { z } from 'zod';

// ── Esquemas de validación ────────────────────────────────────────────────────

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  deviceId: z.string().trim().optional(),
});

export const RegisterAdminSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  fullName: z.string().trim().min(2),
  roles: z.array(z.string()).min(1),
});
