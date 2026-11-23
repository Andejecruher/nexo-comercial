/** Persist object names, never bucket URIs or temporary access URLs. */
export function assertObjectPath(path: string): string {
  if (
    !path ||
    Buffer.byteLength(path, 'utf8') > 1024 ||
    /[\\?#:]/.test(path) ||
    Array.from(path).some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) ||
    path.split('/').some((part) => !part || part === '.' || part === '..')
  )
    throw new Error('GCS_OBJECT_NAME_INVALID');
  return path;
}

export function isGcsMediaKey(key: string): boolean {
  return key.startsWith('conversations/') || key.startsWith('gs://');
}
