import crypto from 'crypto';

export function generateInvitationToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export function hashInvitationToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function buildActivationUrl(frontendUrl: string, token: string): string {
  const base = frontendUrl.replace(/\/$/, '');
  const url = new URL('/activate-account', base);
  url.searchParams.set('token', token);
  return url.toString();
}
