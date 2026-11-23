import { apiClient } from '@/lib/api-client';

export type NewsletterSubscribePayload = {
  email: string;
  name?: string;
  /** Origen del formulario: footer, modal, etc. */
  source?: string;
};

export type NewsletterSubscribeSuccessActive = {
  status: 'active';
  alreadySubscribed: boolean;
  subscribedAt: string | null;
};

export type NewsletterSubscribeSuccessPending = {
  status: 'pending';
  message: string;
  confirmExpiresAt: string;
  devConfirmToken?: string;
};

export type NewsletterSubscribeResponse =
  | NewsletterSubscribeSuccessActive
  | NewsletterSubscribeSuccessPending;

export type NewsletterVerifyResponse = { valid: boolean; email?: string; expiresAt?: string };

export type NewsletterConfirmResponse = { status: 'active'; subscribedAt: string };

/** Comprueba el token de doble opt-in antes de consumirlo. */
export function verifyNewsletterToken(token: string) {
  return apiClient.get<NewsletterVerifyResponse>(
    `/public/newsletter/verify/${encodeURIComponent(token)}`,
    { skipAuth: true, cache: 'no-store', referrerPolicy: 'no-referrer' },
  );
}

export function confirmNewsletter(token: string) {
  return apiClient.post<NewsletterConfirmResponse>(
    `/public/newsletter/confirm/${encodeURIComponent(token)}`,
    {},
    { skipAuth: true, referrerPolicy: 'no-referrer' },
  );
}

export function unsubscribeNewsletter(token: string) {
  return apiClient.post<{ status: 'unsubscribed' }>(
    '/public/newsletter/unsubscribe',
    { token },
    { skipAuth: true, referrerPolicy: 'no-referrer' },
  );
}

export async function subscribeNewsletter(
  payload: NewsletterSubscribePayload,
): Promise<
  { ok: true; data: NewsletterSubscribeResponse } | { ok: false; status: number; message: string }
> {
  return apiClient.post<NewsletterSubscribeResponse>(
    '/public/newsletter/subscribe',
    {
      email: payload.email.trim(),
      ...(payload.name?.trim() ? { name: payload.name.trim() } : {}),
      source: payload.source ?? 'footer',
    },
    { skipAuth: true },
  );
}
