import { isIP } from 'node:net';

const PRIVATE_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1', '169.254.169.254']);

function isPrivateIPv4(host: string): boolean {
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    return false;
  }

  const [a, b] = host.split('.').map(Number);
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 169 && b === 254) return true;
  return false;
}

function isPrivateIPv6(host: string): boolean {
  const normalized = host.toLowerCase();
  return normalized === '::1' || normalized.startsWith('fc') || normalized.startsWith('fd');
}

export function assertSafeExternalUrl(rawUrl: string): URL {
  const url = new URL(rawUrl);

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('Only http/https URLs are allowed');
  }

  const host = url.hostname.toLowerCase();
  if (PRIVATE_HOSTS.has(host)) {
    throw new Error('Blocked hostname by SSRF policy');
  }

  const version = isIP(host);
  if (version === 4 && isPrivateIPv4(host)) {
    throw new Error('Blocked private IPv4 by SSRF policy');
  }
  if (version === 6 && isPrivateIPv6(host)) {
    throw new Error('Blocked private IPv6 by SSRF policy');
  }

  return url;
}
