export function splitFullName(fullName: string): { name: string; lastName: string | undefined } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const name = parts[0] ?? '';
  const lastName = parts.length > 1 ? parts.slice(1).join(' ') : undefined;
  return { name, lastName };
}
