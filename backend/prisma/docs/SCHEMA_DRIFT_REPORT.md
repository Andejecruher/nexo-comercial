# Prisma and PostgreSQL schema differences

The applied historical schema and the consolidated baseline have matching PostgreSQL catalogs. Prisma 5.22.0 still proposes dropping database-side `gen_random_uuid()` and several `updated_at` defaults, because client-side `@default(uuid())` and `@updatedAt` do not encode PostgreSQL defaults. Neighborhood indexes are now represented with Prisma `map` and raw GIN opclass metadata; the partial and expression indexes remain migration SQL objects. Prisma's client-side `@default(uuid())` is retained to avoid an unapproved application contract change.

The former index-name and `conversation_bulk_items` FK discrepancies were resolved with Prisma `map` and `onUpdate: NoAction` metadata, without changing PostgreSQL. Details and validation evidence are in [`DATABASE_SCHEMA_COMPARISON.md`](../../../docs/database-refactor/DATABASE_SCHEMA_COMPARISON.md).
