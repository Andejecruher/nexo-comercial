/** Messages are append-only: a REST snapshot must retain live messages received during its fetch. */
export function mergeMessageSnapshot<T extends { id: string; createdAt: string }>(
  snapshot: T[],
  live: T[],
  preferLive = false,
): T[] {
  const messages = new Map(snapshot.map((message) => [message.id, message]));
  for (const message of live)
    if (preferLive || !messages.has(message.id)) messages.set(message.id, message);
  return [...messages.values()].sort(
    (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  );
}
