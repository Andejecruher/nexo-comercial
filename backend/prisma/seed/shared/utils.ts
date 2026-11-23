import bcrypt from 'bcryptjs';

export const toNameLower = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}
