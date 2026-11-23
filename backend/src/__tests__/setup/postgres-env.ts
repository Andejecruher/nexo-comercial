/**
 * Real-PostgreSQL suites connect from the host. CI exports DATABASE_URL.
 * A local `pnpm test:postgres` often has none, and backend/.env uses the
 * Docker hostname `postgres`, which does not resolve outside the compose network.
 * Fall back to the compose-mapped credentials (docker-compose*.yml / backend-ci).
 */
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgresql://voz:secret@localhost:5432/vozcuidadana';
}
