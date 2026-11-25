# Table evolution

The 78-migration historical evolution and the 58 effective table definitions are recorded in [`DATABASE_AUDIT.md`](../../../docs/database-refactor/DATABASE_AUDIT.md) and [`DATABASE_SCHEMA.md`](../../../docs/database-refactor/DATABASE_SCHEMA.md). The active baseline creates each retained table directly in its final form. The 15 historical tables already absent from the effective schema are not recreated.
