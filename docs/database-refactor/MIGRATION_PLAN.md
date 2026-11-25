# Plan de consolidación de migraciones

Estado: **implementado en `refactor/database-baseline` y pendiente de revisión**. Las decisiones aprobadas se ejecutaron solo en archivos locales y bases PostgreSQL desechables.

## Objetivo y correspondencia

Se reemplazaron 78 migraciones históricas por 60 migraciones de línea base para instalaciones nuevas: 1 inicial de los 38 enums y extensiones necesarias, 58 de tablas (una por cada tabla final) y 1 complementaria de FK entre tablas con dependencias circulares. Cada nueva migración de tabla incorpora la definición efectiva catalogada en `DATABASE_SCHEMA.md`; las 78 carpetas históricas se retiraron de la ruta activa y siguen recuperables en Git. Las migraciones que solo agregaban índices, columnas o defaults se fusionaron con la tabla propietaria. Las migraciones que creaban objetos transitorios no se trasladaron.

| Migraciones históricas | Migración implementada |
|---|---|
| `00000000000000_init_enums`, migraciones posteriores con `CREATE TYPE`/`ALTER TYPE`, `20260716120000_add_uuid_database_defaults` (extensión) | `00000000000000_init_shared_objects` (solo enums vigentes y extensiones necesarias; defaults en tablas) |
| `00000000000010_create_ai_agents`, `20260716120000_add_uuid_database_defaults` | `00000000000001_create_ai_agents` |
| `00000000000012_create_ai_prompts`, `20260716120000_add_uuid_database_defaults` | `00000000000002_create_ai_prompts` |
| `00000000000011_create_ai_topics`, `00000000000012_create_ai_prompts`, `20260716120000_add_uuid_database_defaults` | `00000000000003_create_ai_topics` |
| `00000000000013_create_ai_tools`, `20260716120000_add_uuid_database_defaults` | `00000000000004_create_ai_tools` |
| `20260922090000_add_message_batch_windows` | `00000000000005_create_batch_window_claims` |
| `20260922090000_add_message_batch_windows` | `00000000000006_create_batch_windows` |
| `20261014170000_conversation_bulk_jobs` | `00000000000007_create_conversation_bulk_jobs` |
| `00000000000004_create_departments`, `20260716120000_add_uuid_database_defaults` | `00000000000008_create_departments` |
| `20260906000000_add_export_jobs`, `20260906000001_add_export_download_token`, `20261023180000_gcs_object_paths`, `20261123000000_remove_campaign_modules` | `00000000000009_create_export_jobs` |
| `20260916120000_redis_free_models` | `00000000000010_create_identity_lockouts` |
| `00000000000008_create_messaging_queues`, `20260716120000_add_uuid_database_defaults`, `20260819120000_add_messaging_queue_leases`, `20260918232300_add_queue_fsm_indexes`, `20261013170000_realtime_ingress` | `00000000000011_create_inbox_events` |
| `20261014000000_template_management` | `00000000000012_create_managed_templates` |
| `00000000000002_create_neighborhoods`, `20260716120000_add_uuid_database_defaults`, `20260817140000_promovidos_crm_neighborhood_matching`, `20260822120000_add_geo_fields_to_neighborhoods`, `20260822130000_neighborhood_match_key_municipality_unique`, `20261123000000_remove_campaign_modules` | `00000000000013_create_neighborhoods` |
| `00000000000020_create_newsletter_subscribers`, `20260716120000_add_uuid_database_defaults` | `00000000000014_create_newsletter_subscribers` |
| `20261009000000_add_notifications`, `20261013170000_realtime_ingress`, `20261018000000_message_media_history` | `00000000000015_create_notifications` |
| `00000000000008_create_messaging_queues`, `20260716120000_add_uuid_database_defaults`, `20260819120000_add_messaging_queue_leases` | `00000000000016_create_outbox_events` |
| `00000000000024_add_role_permissions`, `20260716120000_add_uuid_database_defaults`, `20260722120000_add_permission_management` | `00000000000017_create_permissions` |
| `20260916120000_redis_free_models` | `00000000000018_create_rate_limit_counters` |
| `00000000000021_create_realtime_outbox_events`, `20260716120000_add_uuid_database_defaults` | `00000000000019_create_realtime_outbox_events` |
| `00000000000001_create_users_roles`, `00000000000024_add_role_permissions`, `20260716120000_add_uuid_database_defaults` | `00000000000020_create_roles` |
| `00000000000006_create_tags_and_citizen_tags`, `00000000000022_add_raw_sql_invariants`, `20260716120000_add_uuid_database_defaults` | `00000000000021_create_tags` |
| `20261014000000_template_management` | `00000000000022_create_template_status_events` |
| `00000000000001_create_users_roles`, `20260716120000_add_uuid_database_defaults`, `20261019000000_add_user_phone` | `00000000000023_create_users` |
| `00000000000008_create_messaging_queues`, `20260716120000_add_uuid_database_defaults`, `20261018000000_message_media_history` | `00000000000024_create_webhook_event_logs` |
| `00000000000015_create_ai_agent_topics`, `20260716120000_add_uuid_database_defaults` | `00000000000025_create_ai_agent_topics` |
| `00000000000014_create_ai_topic_tools`, `20260716120000_add_uuid_database_defaults` | `00000000000026_create_ai_topic_tools` |
| `00000000000008_create_messaging_queues`, `20260716120000_add_uuid_database_defaults` | `00000000000027_create_audit_logs` |
| `00000000000003_create_citizens`, `20260716120000_add_uuid_database_defaults`, `20260817140000_promovidos_crm_neighborhood_matching` | `00000000000028_create_citizens` |
| `00000000000016_create_communication_lines`, `20260716120000_add_uuid_database_defaults` | `00000000000029_create_communication_lines` |
| `20261014170000_conversation_bulk_jobs` | `00000000000030_create_conversation_bulk_items` |
| `00000000000030_add_department_schedules`, `00000000000031_department_exception_recurrence`, `20260716120000_add_uuid_database_defaults` | `00000000000031_create_department_schedule_exceptions` |
| `00000000000030_add_department_schedules`, `20260716120000_add_uuid_database_defaults` | `00000000000032_create_department_schedules` |
| `00000000000009_create_events_module`, `20260716120000_add_uuid_database_defaults`, `20260906060000_add_event_neighborhood`, `20261109000000_event_visibility` | `00000000000033_create_events` |
| `20260822210000_add_password_resets` | `00000000000034_create_password_resets` |
| `20260916130000_refresh_sessions_idempotency` | `00000000000035_create_refresh_sessions` |
| `00000000000024_add_role_permissions` | `00000000000036_create_role_permissions` |
| `20260714120000_add_user_invitations`, `20260716120000_add_uuid_database_defaults` | `00000000000037_create_user_invitations` |
| `20261010130000_add_user_notification_preferences` | `00000000000038_create_user_notification_preferences` |
| `00000000000001_create_users_roles`, `20260716120000_add_uuid_database_defaults` | `00000000000039_create_user_roles` |
| `20261014060000_whatsapp_campaigns` | `00000000000040_create_campaigns` |
| `00000000000006_create_tags_and_citizen_tags`, `20260716120000_add_uuid_database_defaults` | `00000000000041_create_citizen_tags` |
| `00000000000005_create_conversations`, `00000000000022_add_raw_sql_invariants`, `20260716120000_add_uuid_database_defaults`, `20261007000000_add_conversation_is_canonical`, `20261010000000_add_attendance_mode`, `20261010120000_add_ticket_folio_and_message_ticket`, `20261011000000_add_conversation_transfer_audit`, `20261013170000_realtime_ingress`, `20261102000000_conversation_line_scope` | `00000000000042_create_conversations` |
| `00000000000019_create_tickets_and_messages`, `00000000000022_add_raw_sql_invariants`, `20260716120000_add_uuid_database_defaults`, `20261010120000_add_ticket_folio_and_message_ticket`, `20261109120000_tickets_pagination_indexes` | `00000000000043_create_tickets` |
| `00000000000030_add_department_schedules`, `20260716120000_add_uuid_database_defaults` | `00000000000044_create_department_exception_intervals` |
| `00000000000030_add_department_schedules`, `20260716120000_add_uuid_database_defaults` | `00000000000045_create_department_schedule_intervals` |
| `00000000000009_create_events_module`, `20260716120000_add_uuid_database_defaults` | `00000000000046_create_event_registrations` |
| `00000000000018_create_ai_runs_and_calls`, `20260716120000_add_uuid_database_defaults` | `00000000000047_create_ai_runs` |
| `00000000000008_create_messaging_queues`, `20260716120000_add_uuid_database_defaults` | `00000000000048_create_assignments` |
| `00000000000007_create_messages_and_attachments`, `20260716120000_add_uuid_database_defaults`, `20261018000000_message_media_history`, `20261104000000_attachment_provider_media_index` | `00000000000049_create_attachments` |
| `00000000000007_create_messages_and_attachments`, `20260716120000_add_uuid_database_defaults`, `20260916130000_refresh_sessions_idempotency`, `20260921050907_add_message_send_by`, `20261010120000_add_ticket_folio_and_message_ticket`, `20261018000000_message_history_media` | `00000000000050_create_messages` |
| `20261014080000_campaign_attachments`, `20261023180000_gcs_object_paths` | `00000000000051_create_campaign_attachments` |
| `20261014060000_whatsapp_campaigns` | `00000000000052_create_campaign_recipients` |
| `00000000000017_create_conversation_meta`, `20260716120000_add_uuid_database_defaults`, `20260916120000_redis_free_models`, `20260918232300_add_queue_fsm_indexes`, `20260921120000_add_handoff_kind` | `00000000000053_create_conversation_meta` |
| `20260924000000_add_conversation_reads` | `00000000000054_create_conversation_reads` |
| `00000000000009_create_events_module`, `20260716120000_add_uuid_database_defaults` | `00000000000055_create_event_checkins` |
| `00000000000018_create_ai_runs_and_calls`, `20260716120000_add_uuid_database_defaults` | `00000000000056_create_ai_tool_calls` |
| `00000000000008_create_messaging_queues`, `20260716120000_add_uuid_database_defaults` | `00000000000057_create_message_statuses` |
| `00000000000019_create_tickets_and_messages`, `20260716120000_add_uuid_database_defaults` | `00000000000058_create_ticket_messages` |
| Claves entre tablas cíclicas, función y trigger de aislamiento por línea procedentes de `20261102000000_conversation_line_scope` y `20261105000000_conversation_meta_insert_scope` | `00000000000059_add_shared_constraints` (tres claves foráneas, función y trigger definitivos) |
| Migraciones que solo crean y luego borran tablas electorales y `event_internal_details`; DML de `20261123000000_remove_campaign_modules` | Ninguna; omitir de la nueva base vacía |

**Nomenclatura ejecutada:** los nombres `baseline_*` de la tabla eran identificadores de planificación. Las carpetas reales usan prefijos secuenciales `00000000000000` a `00000000000059`; la correspondencia exacta figura en [`DATABASE_CHANGELOG.md`](DATABASE_CHANGELOG.md).

## Cambios previstos en archivos

| Archivo o grupo | Dependencia/problema | Cambio propuesto | Riesgo | Verificación |
|---|---|---|---|---|
| `backend/prisma/migrations/*/migration.sql` (78 carpetas) | historial acumulativo | sustituir en Git por 60 carpetas nuevas tras aprobación | alto: instalaciones con `_prisma_migrations` previo | migrar base limpia y comparar catálogo |
| `backend/prisma/schema.prisma` | 58 modelos; diff de defaults e índices | ajustar solo divergencias elegidas; no regenerar destructivamente índices SQL | alto: drift de defaults y FK | `prisma validate`, `migrate diff`, Prisma Client |
| `backend/prisma/docs/{MIGRATIONS_OVERVIEW,MIGRATION_HISTORY,TABLE_EVOLUTION,SCHEMA_DRIFT_REPORT,SEEDING_GUIDE}.md` | estado anterior | actualizar inventarios y operación de línea base | medio | revisión manual contra 60 carpetas |
| `backend/prisma/seed/index.ts` y `core/*.seed.ts` | orden core y datos de referencia | conservar; ajustar si la nueva línea base altera nombres o constraints | medio | core seed dos veces en base vacía |
| `backend/prisma/seed/dev/*.seed.ts`, `test/fixtures.seed.ts` | UUID demo y guardas; el seeder de pruebas no crea registros | conservar dev; se retiró el placeholder test sin consumidores | bajo/medio | dev seed y revisión del alcance test en entorno aislado |
| `backend/scripts/migrations/*` | backfills y reparaciones manuales fuera de Prisma | revisar uno por uno; conservar los que sirven a módulos vigentes, sin ejecutarlos en base vacía | medio | inspección estática y ejecución solo si surge una necesidad concreta |
| `backend/src/services/neighborhoods.service.ts`, `backend/src/repositories/neighborhood.repository.ts` | `match_key`, municipio, búsqueda | validar índices trigram y unicidad; ajustar solo si decisión de esquema cambia | medio | búsqueda y duplicados por municipio |
| `backend/src/services/bulk/{bulk-action-queue,bulk-action-worker}.service.ts` | `conversation_bulk_items.jobId`/FK | comprobar mapeo y nombre FK; ajustar solo si contrato cambia | medio | lote idempotente y cascada |
| `backend/src/services/campaigns/*.ts`, `backend/src/worker.ts`, `backend/src/routes/campaigns.routes.ts` | tablas de campañas WhatsApp | preservar; validar relaciones y SQL directo | alto | campaña, reintentos, estados |
| `backend/src/services/events/{inbox-processor,outbox-processor}.service.ts` | SQL directo de colas y scope | conservar consultas; validar índices, leases, trigger | alto | ingreso/egreso y concurrencia |
| `backend/src/services/tickets/ticket.service.ts`, `backend/src/services/whatsapp/*.ts` | FK y unicidad parcial | validar contra línea base | alto | tickets activos, medios, entrega |
| `backend/src/__tests__/`, `frontend/tests/`, `frontend/app/(admin)/admin/campanas/` | contratos de modelos y UI activa | cambiar solo tests/contratos si hay diferencia justificada | medio | suites backend/frontend pertinentes |
| `Makefile`, `docker-compose.*.yml`, `backend/scripts/{prod-migrate.sh,docker-dev-entrypoint.sh}`, `docs/DEPLOYMENT_GCP.md` | flujos de despliegue sobre historial aplicado | documentar operación exclusiva de base nueva; ajustar scripts solo si exponen reset histórico | alto | smoke de migración con contenedor desechable |

## Ejecución propuesta

1. Confirmar Git limpio y preservar hash de HEAD; excluir cambios locales de cualquier operación.
2. Obtener aprobación explícita de 58 tablas retenidas, 15 tablas históricas omitidas, 38 enums y seeders. Resolver decisiones de índices, extensiones, defaults y nombres.
3. Crear migración de objetos compartidos; crear 58 migraciones de tabla en el orden topológico de `DATABASE_SCHEMA.md`.
4. Agregar FK de ciclos y trigger/función en etapa válida; preservar índices parciales/funcionales, checks, nombres y acciones referenciales.
5. Retirar del árbol activo las 78 carpetas históricas, conservadas en Git; actualizar `schema.prisma` solo si se aprobó una diferencia semántica.
6. Depurar solo seeders realmente incompatibles; separar core de datos dev/demo/test. Validar la reconciliación de horarios del seeder de departamentos, que elimina y recrea intervalos hijos.
7. Revisar código/SQL directo y documentación listados arriba; no refactorizar reglas de negocio.
8. Migrar una segunda base PostgreSQL 16 nueva y desechable; ejecutar core, dev y test seeds según entorno.
9. Comparar catálogos histórico y nuevo: tablas, columnas, defaults, PK, FK, acciones, índices, checks, enums, extensiones, funciones y triggers. Resolver cualquier diferencia no aprobada.
10. Ejecutar `prisma validate`, generación de cliente, `typecheck`, build, tests unitarios y de integración con Postgres; smoke de API/worker/frontend.
11. Revisar diffs de Git; documentar desviaciones y estrategia de recuperación.

## Criterios de aceptación y bloqueos

- Base limpia construye 58 tablas, 38 enums y todos los objetos de catálogo esperados; 60 migraciones aplican sin error.
- Seed core es repetible y no crea permisos electorales obsoletos; seed dev no introduce credenciales incrustadas ni colisiones de UUID. El seeder test sin consumidores fue retirado.
- `migrate diff` no muestra diferencias semánticas no aprobadas; las diferencias intencionales de Prisma se registran.
- Se mantienen unicidad parcial de conversaciones/tickets, índices funcionales/trigram, trigger de línea, constraints CHECK y ON DELETE/UPDATE.
- TypeScript, build, tests pertinentes y flujos principales pasan; fallos preexistentes se separan con evidencia.
- **Bloquean**: cualquier tabla actual sin clasificación aprobada, cambios involuntarios de defaults/índices/enum/FK, dependencia de consumidor externo no aclarada, uso de base compartida, falta de comparación de catálogos o divergencia de seeds.

## Recuperación

Guardar el commit/árbol anterior y el listado de las 78 carpetas. Si falla la línea base en la base desechable, descartar solo esa base y restaurar el árbol mediante Git; no aplicar esta reescritura a bases con historial en `_prisma_migrations`. La adopción en entornos existentes requiere estrategia separada y aprobación específica. No hacer commit, push ni despliegue en esta fase.

## Evidencia de cierre

La comparación estructural de las dos instancias y las validaciones ejecutadas se registran en [`DATABASE_SCHEMA_COMPARISON.md`](DATABASE_SCHEMA_COMPARISON.md) y [`DATABASE_VALIDATION.md`](DATABASE_VALIDATION.md). La fase 2 no autoriza desplegar esta línea base a bases con `_prisma_migrations` histórico.
