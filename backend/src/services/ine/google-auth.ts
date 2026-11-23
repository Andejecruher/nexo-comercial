import { GoogleAuth } from 'google-auth-library';
import { env } from '../../config/env.config';

const DOCUMENT_AI_SCOPE = 'https://www.googleapis.com/auth/cloud-platform';

export type GoogleDriveOAuthCredentials = {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
};

/**
 * Minimal auth surface required by the Document AI provider.
 *
 * `getAccessToken()` is the stable acquisition point across every ADC shape
 * (service-account JSON, authorized_user from `gcloud auth application-default
 * login`, and the metadata server / Workload Identity in production). It returns
 * either the access token as a string (UserRefreshClient) or as an object with a
 * `token` field (JWT/Compute clients); both shapes are normalized in
 * {@link documentAiAuthorization}.
 *
 * The previous implementation relied on `getRequestHeaders(url)`, which in
 * `google-auth-library` v10 returns an empty object `{}` (no `Authorization`
 * header) for `authorized_user` ADC, causing Document AI to reject the request
 * with `401 CREDENTIALS_MISSING`. Tokens — never headers — are the robust unit.
 */
export interface DocumentAiAuth {
  getAccessToken(): Promise<string | { token?: string | null }>;
}

export class GoogleConfigurationError extends Error {
  constructor(public readonly code: string) {
    super('Google provider configuration is unavailable');
    this.name = 'GoogleConfigurationError';
  }
}

export class GoogleProviderError extends Error {
  constructor(
    public readonly code: string,
    public readonly retryable: boolean,
    detail?: string,
  ) {
    super(detail ? `Google provider request failed: ${detail}` : 'Google provider request failed');
    this.name = 'GoogleProviderError';
  }
}

export function createDocumentAiAuth(): DocumentAiAuth {
  return new GoogleAuth({ scopes: DOCUMENT_AI_SCOPE }) as unknown as DocumentAiAuth;
}

/**
 * Acquires a fresh access token through Application Default Credentials and
 * returns just the `Authorization: Bearer <token>` header. The token is never
 * persisted, logged, or returned to callers; only the constructed header is
 * used to sign the outgoing Document AI request.
 */
export async function documentAiAuthorization(
  auth: DocumentAiAuth,
): Promise<Record<string, string>> {
  try {
    const credential = await auth.getAccessToken();
    const token = typeof credential === 'string' ? credential : credential?.token;
    if (!token || !token.trim()) {
      throw new Error('Access token unavailable');
    }
    return { Authorization: `Bearer ${token}` };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify({ level: 'error', event: 'documentai_adc_unavailable', reason }));
    throw new GoogleConfigurationError('DOCUMENT_AI_ADC_UNAVAILABLE');
  }
}

export function googleDriveOAuthCredentials(): GoogleDriveOAuthCredentials {
  if (
    !env.GOOGLE_OAUTH_CLIENT_ID ||
    !env.GOOGLE_OAUTH_CLIENT_SECRET ||
    !env.GOOGLE_DRIVE_REFRESH_TOKEN
  ) {
    throw new GoogleConfigurationError('GOOGLE_DRIVE_OAUTH_CONFIGURATION_MISSING');
  }

  return {
    clientId: env.GOOGLE_OAUTH_CLIENT_ID,
    clientSecret: env.GOOGLE_OAUTH_CLIENT_SECRET,
    refreshToken: env.GOOGLE_DRIVE_REFRESH_TOKEN,
  };
}
