import { createHash } from 'crypto';
import { GoogleAuth } from 'google-auth-library';
import { assertObjectPath } from './object-path';

const MAX_V4_EXPIRATION_SECONDS = 7 * 24 * 60 * 60;
const IAM_CREDENTIALS_SCOPE = 'https://www.googleapis.com/auth/iam';
const SIGNING_HOST = 'storage.googleapis.com';

export type GcsUrlSignerErrorCode =
  | 'GCS_SIGNER_CONFIGURATION_INVALID'
  | 'GCS_SIGNER_EXPIRATION_INVALID'
  | 'GCS_SIGNER_CREDENTIALS_UNAVAILABLE'
  | 'GCS_SIGNER_IAM_DENIED'
  | 'GCS_SIGNER_IAM_FAILED'
  | 'GCS_SIGNER_IAM_RESPONSE_INVALID';

export class GcsUrlSignerError extends Error {
  constructor(
    readonly code: GcsUrlSignerErrorCode,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'GcsUrlSignerError';
  }
}

export interface GcsBlobSigner {
  sign(payload: Buffer): Promise<Buffer>;
}

interface IamCredentialsClient {
  request<T>(options: {
    url: string;
    method: 'POST';
    data: { payload: string };
  }): Promise<{ data: T }>;
}

interface IamCredentialsAuth {
  getClient(): Promise<IamCredentialsClient>;
}

interface IamSignBlobResponse {
  signedBlob?: string;
}

function errorStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const value = error as { code?: unknown; response?: { status?: unknown } };
  const status = value.response?.status ?? value.code;
  return typeof status === 'number' ? status : undefined;
}

function validateSignerIdentity(value: string): string {
  const identity = value.trim();
  if (!/^[^@\s]+@[a-z0-9-]+\.iam\.gserviceaccount\.com$/i.test(identity)) {
    throw new GcsUrlSignerError(
      'GCS_SIGNER_CONFIGURATION_INVALID',
      'GCS_SIGNER_SERVICE_ACCOUNT must be a service-account email address',
    );
  }
  return identity;
}

/** Calls IAM Credentials with ADC; it never reads or retains a private key. */
export class GcsIamCredentialsSigner implements GcsBlobSigner {
  private readonly signerIdentity: string;

  constructor(
    signerIdentity: string,
    private readonly auth: IamCredentialsAuth = new GoogleAuth({
      scopes: [IAM_CREDENTIALS_SCOPE],
    }) as unknown as IamCredentialsAuth,
  ) {
    this.signerIdentity = validateSignerIdentity(signerIdentity);
  }

  async sign(payload: Buffer): Promise<Buffer> {
    let client: IamCredentialsClient;
    try {
      client = await this.auth.getClient();
    } catch (error) {
      throw new GcsUrlSignerError(
        'GCS_SIGNER_CREDENTIALS_UNAVAILABLE',
        'Application Default Credentials are unavailable for GCS URL signing',
        error,
      );
    }

    let response: { data: IamSignBlobResponse };
    try {
      response = await client.request<IamSignBlobResponse>({
        url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(this.signerIdentity)}:signBlob`,
        method: 'POST',
        data: { payload: payload.toString('base64') },
      });
    } catch (error) {
      const code = errorStatus(error) === 403 ? 'GCS_SIGNER_IAM_DENIED' : 'GCS_SIGNER_IAM_FAILED';
      throw new GcsUrlSignerError(
        code,
        'IAM Credentials signBlob failed for GCS URL signing',
        error,
      );
    }

    if (!response.data.signedBlob) {
      throw new GcsUrlSignerError(
        'GCS_SIGNER_IAM_RESPONSE_INVALID',
        'IAM Credentials returned no signature for GCS URL signing',
      );
    }
    return Buffer.from(response.data.signedBlob, 'base64');
  }
}

export interface GcsV4SignedUrlOptions {
  bucket: string;
  objectName: string;
  expires: Date | number;
  method?: string;
  responseType?: string;
  responseDisposition?: string;
  queryParameters?: readonly (readonly [string, string])[];
}

export interface GcsUrlSigner {
  getSignedUrl(options: GcsV4SignedUrlOptions): Promise<string>;
}

function encodeRfc3986(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function comparePairs(left: readonly [string, string], right: readonly [string, string]): number {
  if (left[0] < right[0]) return -1;
  if (left[0] > right[0]) return 1;
  if (left[1] < right[1]) return -1;
  if (left[1] > right[1]) return 1;
  return 0;
}

function encodeQuery(parameters: readonly (readonly [string, string])[]): string {
  return parameters
    .map(([key, value]) => [encodeRfc3986(key), encodeRfc3986(value)] as const)
    .sort(comparePairs)
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
}

function canonicalObjectPath(objectName: string): string {
  return `/${objectName.split('/').map(encodeRfc3986).join('/')}`;
}

function formatTimestamp(date: Date): string {
  const pad = (value: number) => value.toString().padStart(2, '0');
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
}

function expirationSeconds(expires: Date | number, now: Date): number {
  const timestamp = expires instanceof Date ? expires.getTime() : expires;
  if (!Number.isFinite(timestamp)) {
    throw new GcsUrlSignerError('GCS_SIGNER_EXPIRATION_INVALID', 'GCS URL expiration is invalid');
  }
  const seconds = Math.floor((timestamp - now.getTime()) / 1000);
  if (seconds < 1 || seconds > MAX_V4_EXPIRATION_SECONDS) {
    throw new GcsUrlSignerError(
      'GCS_SIGNER_EXPIRATION_INVALID',
      'GCS V4 URL expiration must be between one second and seven days',
    );
  }
  return seconds;
}

function validateBucket(bucket: string): string {
  const value = bucket.trim();
  if (!value || /[\s/?#:]/.test(value)) {
    throw new GcsUrlSignerError(
      'GCS_SIGNER_CONFIGURATION_INVALID',
      'GCS signing bucket is invalid',
    );
  }
  return value;
}

/**
 * Signs GCS V4 URLs with an explicitly configured IAM service account.
 * Canonicalization follows the public @google-cloud/storage V4 signer while
 * keeping the signer identity separate from the Storage ADC client.
 */
export class GcsV4UrlSigner implements GcsUrlSigner {
  private readonly signerIdentity: string;

  constructor(
    signerIdentity: string,
    private readonly signer: GcsBlobSigner,
    private readonly clock: () => Date = () => new Date(),
  ) {
    this.signerIdentity = validateSignerIdentity(signerIdentity);
  }

  async getSignedUrl(options: GcsV4SignedUrlOptions): Promise<string> {
    const bucket = validateBucket(options.bucket);
    let objectName: string;
    try {
      objectName = assertObjectPath(options.objectName);
    } catch (error) {
      throw new GcsUrlSignerError(
        'GCS_SIGNER_CONFIGURATION_INVALID',
        'GCS object name is invalid',
        error,
      );
    }
    const method = (options.method ?? 'GET').toUpperCase();
    if (!/^[A-Z]+$/.test(method)) {
      throw new GcsUrlSignerError(
        'GCS_SIGNER_CONFIGURATION_INVALID',
        'GCS signing method is invalid',
      );
    }

    const now = this.clock();
    const expires = expirationSeconds(options.expires, now);
    const timestamp = formatTimestamp(now);
    const datestamp = timestamp.slice(0, 8);
    const credentialScope = `${datestamp}/auto/storage/goog4_request`;
    const parameters: Array<readonly [string, string]> = [
      ['X-Goog-Algorithm', 'GOOG4-RSA-SHA256'],
      ['X-Goog-Credential', `${this.signerIdentity}/${credentialScope}`],
      ['X-Goog-Date', timestamp],
      ['X-Goog-Expires', String(expires)],
      ['X-Goog-SignedHeaders', 'host'],
      ...(options.queryParameters ?? []),
    ];
    if (options.responseType) parameters.push(['response-content-type', options.responseType]);
    if (options.responseDisposition)
      parameters.push(['response-content-disposition', options.responseDisposition]);

    const path = canonicalObjectPath(objectName);
    const canonicalRequest = [
      method,
      `/${bucket}${path}`,
      encodeQuery(parameters),
      `host:${SIGNING_HOST}\n`,
      'host',
      'UNSIGNED-PAYLOAD',
    ].join('\n');
    const stringToSign = [
      'GOOG4-RSA-SHA256',
      timestamp,
      credentialScope,
      createHash('sha256').update(canonicalRequest).digest('hex'),
    ].join('\n');
    const signature = (await this.signer.sign(Buffer.from(stringToSign, 'utf8'))).toString('hex');
    return `https://${SIGNING_HOST}/${bucket}${path}?${encodeQuery([
      ...parameters,
      ['X-Goog-Signature', signature],
    ])}`;
  }
}

export function createGcsUrlSigner(): GcsUrlSigner {
  const signerIdentity = process.env.GCS_SIGNER_SERVICE_ACCOUNT ?? '';
  return new GcsV4UrlSigner(signerIdentity, new GcsIamCredentialsSigner(signerIdentity));
}

/** Defers configuration validation until a signed URL is actually requested. */
export const gcsUrlSigner: GcsUrlSigner = {
  getSignedUrl: (options) => createGcsUrlSigner().getSignedUrl(options),
};
