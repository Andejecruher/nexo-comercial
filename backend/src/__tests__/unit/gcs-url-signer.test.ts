import { createVerify, generateKeyPairSync, sign } from 'crypto';
import {
  GcsIamCredentialsSigner,
  GcsUrlSignerError,
  GcsV4UrlSigner,
  type GcsBlobSigner,
} from '../../services/storage/gcs-url-signer';

const serviceAccount = 'signer@example-project.iam.gserviceaccount.com';
const now = new Date('2026-10-23T12:34:56.000Z');

function signerFixture(): { signer: GcsBlobSigner; signedPayloads: string[]; publicKey: string } {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const signedPayloads: string[] = [];
  return {
    signer: {
      sign: async (payload) => {
        signedPayloads.push(payload.toString('utf8'));
        return sign('RSA-SHA256', payload, privateKey);
      },
    },
    signedPayloads,
    publicKey: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  };
}

describe('GcsV4UrlSigner', () => {
  it('builds a verifiable V4 URL with canonical Unicode object paths and response parameters', async () => {
    const { signer, signedPayloads, publicKey } = signerFixture();
    const subject = new GcsV4UrlSigner(serviceAccount, signer, () => now);

    const url = await subject.getSignedUrl({
      bucket: 'private-bucket',
      objectName: 'nested folder/niño +%/report final.pdf',
      expires: new Date(now.getTime() + 15 * 60 * 1000),
      responseType: 'application/pdf',
      responseDisposition: "attachment; filename*=UTF-8''ni%C3%B1o%20final.pdf",
      queryParameters: [
        ['alt', 'media'],
        ['x-test', 'z'],
        ['x-test', 'a'],
      ],
    });

    const parsed = new URL(url);
    expect(parsed.pathname).toBe(
      '/private-bucket/nested%20folder/ni%C3%B1o%20%2B%25/report%20final.pdf',
    );
    expect(parsed.searchParams.get('X-Goog-Algorithm')).toBe('GOOG4-RSA-SHA256');
    expect(parsed.searchParams.get('X-Goog-Credential')).toBe(
      `${serviceAccount}/20261023/auto/storage/goog4_request`,
    );
    expect(parsed.searchParams.get('X-Goog-Expires')).toBe('900');
    expect(parsed.searchParams.get('response-content-type')).toBe('application/pdf');
    expect(parsed.searchParams.get('response-content-disposition')).toBe(
      "attachment; filename*=UTF-8''ni%C3%B1o%20final.pdf",
    );
    expect(parsed.searchParams.getAll('x-test')).toEqual(['a', 'z']);
    expect(url).toContain('x-test=a&x-test=z');

    const verifier = createVerify('RSA-SHA256');
    verifier.update(signedPayloads[0]);
    verifier.end();
    expect(
      verifier.verify(publicKey, Buffer.from(parsed.searchParams.get('X-Goog-Signature')!, 'hex')),
    ).toBe(true);
    expect(signedPayloads[0]).toBe(
      'GOOG4-RSA-SHA256\n20261023T123456Z\n20261023/auto/storage/goog4_request\n8d902181f9bfe82010411fab8a9cbcba63c789126f06e60394221f73dfb3c8b6',
    );
  });

  it.each([
    ['expired', new Date(now.getTime() - 1)],
    ['negative epoch', -1],
    ['over seven days', new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000 + 1_000)],
    ['invalid date', new Date('invalid')],
  ])('rejects %s expiration', async (_label, expires) => {
    const { signer } = signerFixture();
    const subject = new GcsV4UrlSigner(serviceAccount, signer, () => now);
    await expect(
      subject.getSignedUrl({ bucket: 'private-bucket', objectName: 'nested/object.txt', expires }),
    ).rejects.toMatchObject({ code: 'GCS_SIGNER_EXPIRATION_INVALID' });
  });

  it('rejects an absent or invalid signer identity before IAM can be called', () => {
    const { signer } = signerFixture();
    for (const identity of ['', 'not-an-email']) {
      expect(() => new GcsV4UrlSigner(identity, signer, () => now)).toThrow(
        'GCS_SIGNER_SERVICE_ACCOUNT',
      );
    }
  });

  it('classifies IAM 403 and unavailable ADC credentials without exposing request credentials', async () => {
    const denied = new GcsIamCredentialsSigner(serviceAccount, {
      getClient: jest
        .fn()
        .mockResolvedValue({ request: jest.fn().mockRejectedValue({ code: 403 }) }),
    } as never);
    await expect(denied.sign(Buffer.from('payload'))).rejects.toMatchObject({
      code: 'GCS_SIGNER_IAM_DENIED',
    });

    const unavailable = new GcsIamCredentialsSigner(serviceAccount, {
      getClient: jest.fn().mockRejectedValue(new Error('Could not load the default credentials')),
    } as never);
    await expect(unavailable.sign(Buffer.from('payload'))).rejects.toMatchObject({
      code: 'GCS_SIGNER_CREDENTIALS_UNAVAILABLE',
    });
  });

  it('keeps typed signer errors intact', () => {
    expect(new GcsUrlSignerError('GCS_SIGNER_IAM_DENIED', 'safe error')).toMatchObject({
      code: 'GCS_SIGNER_IAM_DENIED',
    });
  });
});
