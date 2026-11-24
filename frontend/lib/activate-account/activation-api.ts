import { apiClient } from '@/lib/shared/api-client';

export type ActivationFailureReason = 'invalid' | 'expired' | 'used';

export type ActivationValidation =
  | {
      valid: true;
      email: string;
      name: string | null;
      teamName: string;
      invitedBy: string | null;
      expiresAt: string;
    }
  | { valid: false; reason: ActivationFailureReason };

export const activationApi = {
  validate(token: string) {
    return apiClient.get<ActivationValidation>(
      `/auth/activate-account/validate?token=${encodeURIComponent(token)}`,
      { skipAuth: true, cache: 'no-store', referrerPolicy: 'no-referrer' },
    );
  },
  activate(token: string, password: string, passwordConfirmation: string) {
    return apiClient.post<{ user: { email: string } }>(
      '/auth/activate-account',
      { token, password, passwordConfirmation },
      { skipAuth: true, referrerPolicy: 'no-referrer' },
    );
  },
};
