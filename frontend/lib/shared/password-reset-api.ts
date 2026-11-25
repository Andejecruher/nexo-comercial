import { apiClient } from '@/lib/shared/api-client';

export type PasswordResetFailureReason = 'invalid' | 'expired' | 'used';

export type PasswordResetValidation =
  | { valid: true; email: string; expiresAt: string }
  | { valid: false; reason: PasswordResetFailureReason };

export const passwordResetApi = {
  /** Respuesta siempre genérica: el backend no revela si el correo existe. */
  request(email: string) {
    return apiClient.post<{ message: string }>(
      '/auth/forgot-password',
      { email },
      { skipAuth: true, referrerPolicy: 'no-referrer' },
    );
  },
  validate(token: string) {
    return apiClient.get<PasswordResetValidation>(
      `/auth/reset-password/validate?token=${encodeURIComponent(token)}`,
      { skipAuth: true, cache: 'no-store', referrerPolicy: 'no-referrer' },
    );
  },
  reset(token: string, password: string, passwordConfirmation: string) {
    return apiClient.post<{ message: string }>(
      '/auth/reset-password',
      { token, password, passwordConfirmation },
      { skipAuth: true, referrerPolicy: 'no-referrer' },
    );
  },
};
