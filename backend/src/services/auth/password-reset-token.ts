import crypto from 'crypto';

export function generatePasswordResetToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export function hashPasswordResetToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function buildPasswordResetUrl(frontendUrl: string, token: string): string {
  const base = frontendUrl.replace(/\/$/, '');
  const url = new URL('/reset-password', base);
  url.searchParams.set('token', token);
  return url.toString();
}
