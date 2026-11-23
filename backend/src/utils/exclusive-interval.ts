/**
 * setInterval that skips a tick while the previous async run is still in flight.
 * Prevents stacked Prisma work from exhausting a small Cloud SQL pool.
 */
export function startExclusiveInterval(
  run: () => Promise<void>,
  intervalMs: number,
  onError: (err: unknown) => void,
): ReturnType<typeof setInterval> {
  let inFlight = false;

  return setInterval(() => {
    if (inFlight) {
      return;
    }

    inFlight = true;
    void run()
      .catch(onError)
      .finally(() => {
        inFlight = false;
      });
  }, intervalMs);
}
