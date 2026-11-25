# Auditoría de migraciones y uso de base de datos

Auditoría inicial: 2026-11-24 (Ciudad de México). Estado inicial Git: rama `work`, HEAD `603c480ca437d44ee02dca9392e2ee4d7bd20b57`, sin cambios rastreados; los tres documentos de auditoría eran archivos nuevos sin seguimiento. La fase 2 se implementó en `refactor/database-baseline`; ningún esquema existente se modificó.

## Arquitectura comprobada

- Monorepositorio `pnpm`; `backend` Express 4.19.2, TypeScript 5.9.3, Prisma Client/Migrate 5.22.0, PostgreSQL (`schema.prisma`), frontend Next.js. Scripts en `backend/package.json`: `migrate:deploy`, `prisma:migrate`, `prisma:seed:{core,dev,all}`, `typecheck`, `test`, `test:postgres`, `build`.
- PostgreSQL 16 Alpine en `docker-compose.dev.yml`; configuración `DATABASE_URL` en `.env.example`. Docker Compose, Makefile y scripts de despliegue gestionan migraciones y seeding.
- Modelo de acceso: servicios y rutas Express usan `PrismaClient` directamente; `backend/src/routes/index.ts` monta endpoints. Workers en `backend/src/worker.ts` y `backend/src/worker-app.ts`. No se encontró otro ORM activo.
- Al momento de la auditoría, la documentación en `backend/prisma/docs/` describía una línea base anterior y estaba desactualizada (por ejemplo, referencia `00000000000023_seed_panel_roles`, ausente). No se halló `AGENTS.md` en el árbol.

## Verificación ejecutada

Se levantó un contenedor PostgreSQL 16 desechable `nexo_audit`, se aplicaron **78/78** migraciones con Prisma y se extrajo el catálogo. Resultado: **58 tablas de aplicación** (sin `_prisma_migrations`), **38 enums**, **255 índices de aplicación**, **1 secuencia de aplicación**, **1 trigger propio**, cero vistas y cero políticas RLS. `prisma validate` pasó. Se comparó con `prisma migrate diff` de base real a datamodel: se detectan diferencias descritas en `DATABASE_SCHEMA.md`. Durante la auditoría no se ejecutaron seeders ni pruebas de aplicación; la validación de fase 2 se registra en `DATABASE_VALIDATION.md`.

## Inventario cronológico de migraciones

Ubicación única verificada: `backend/prisma/migrations/*/migration.sql`. Orden lexicográfico de carpeta = orden aplicado por Prisma. Los scripts en `backend/scripts/migrations` son operaciones manuales, no migraciones Prisma. No hay método `down` por archivo en Prisma Migrate; la reversión histórica requiere restauración/recreación o migración compensatoria.

| # | Migración | CREATE TABLE | ALTER TABLE | DROP TABLE | Otros efectos |
|---:|---|---|---|---|
| 1 | `00000000000000_init_enums` | — | — | — | tipo+: source_channel, lead_status, conversation_status, conversation_channel, message_direction, message_type, conversation_flow_state, message_status_value, inbox_event_status, outbox_event_status, realtime_outbox_status, ai_provider, ai_tool_kind, ai_prompt_type, ai_tool_execution_type, ai_tool_http_method, ai_run_status, ai_tool_call_status, event_status, event_type, registration_status, attendance_status, ticket_status, ticket_priority, ticket_source, ticket_actor_type, newsletter_subscriber_status |
| 2 | `00000000000001_create_users_roles` | `users`, `roles`, `user_roles` | `user_roles` | — | 7 índices |
| 3 | `00000000000002_create_neighborhoods` | `neighborhoods` | — | — | 4 índices |
| 4 | `00000000000003_create_citizens` | `citizens` | `citizens` | — | 3 índices |
| 5 | `00000000000004_create_departments` | `departments` | — | — | 3 índices |
| 6 | `00000000000005_create_conversations` | `conversations` | `conversations` | — | 2 índices |
| 7 | `00000000000006_create_tags_and_citizen_tags` | `tags`, `citizen_tags` | `citizen_tags` | — | 5 índices |
| 8 | `00000000000007_create_messages_and_attachments` | `messages`, `attachments` | `messages`, `attachments` | — | 3 índices |
| 9 | `00000000000008_create_messaging_queues` | `audit_logs`, `message_statuses`, `inbox_events`, `outbox_events`, `webhook_event_logs`, `assignments` | `audit_logs`, `message_statuses`, `assignments` | — | 19 índices |
| 10 | `00000000000009_create_events_module` | `events`, `event_registrations`, `event_checkins` | `events`, `event_registrations`, `event_checkins` | — | 10 índices |
| 11 | `00000000000010_create_ai_agents` | `ai_agents` | — | — | 2 índices |
| 12 | `00000000000011_create_ai_topics` | `ai_topics` | — | — | 3 índices |
| 13 | `00000000000012_create_ai_prompts` | `ai_prompts` | `ai_prompts`, `ai_topics` | — | 2 índices |
| 14 | `00000000000013_create_ai_tools` | `ai_tools` | — | — | 2 índices |
| 15 | `00000000000014_create_ai_topic_tools` | `ai_topic_tools` | `ai_topic_tools` | — | 3 índices |
| 16 | `00000000000015_create_ai_agent_topics` | `ai_agent_topics` | `ai_agent_topics` | — | 4 índices |
| 17 | `00000000000016_create_communication_lines` | `communication_lines` | `communication_lines` | — | 5 índices |
| 18 | `00000000000017_create_conversation_meta` | `conversation_meta` | `conversation_meta` | — | 4 índices |
| 19 | `00000000000018_create_ai_runs_and_calls` | `ai_runs`, `ai_tool_calls` | `ai_runs`, `ai_tool_calls` | — | 6 índices |
| 20 | `00000000000019_create_tickets_and_messages` | `tickets`, `ticket_messages` | `tickets`, `ticket_messages` | — | 7 índices |
| 21 | `00000000000020_create_newsletter_subscribers` | `newsletter_subscribers` | — | — | 4 índices |
| 22 | `00000000000021_create_realtime_outbox_events` | `realtime_outbox_events` | — | — | 3 índices |
| 23 | `00000000000022_add_raw_sql_invariants` | — | — | — | 3 índices |
| 24 | `00000000000024_add_role_permissions` | `permissions`, `role_permissions` | `roles`, `role_permissions` | — | columna: slug, updated_at; DML/backfill; 7 índices |
| 25 | `00000000000030_add_department_schedules` | `department_schedules`, `department_schedule_intervals`, `department_schedule_exceptions`, `department_exception_intervals` | `department_schedules`, `department_schedule_intervals`, `department_schedule_exceptions`, `department_exception_intervals` | — | tipo+: department_day_of_week, department_schedule_exception_type; 9 índices |
| 26 | `00000000000031_department_exception_recurrence` | — | `department_schedule_exceptions` | — | tipo+: department_exception_recurrence_type; columna: recurrence_type, recurrence_starts_on, recurrence_ends_on, yearly_start_month, yearly_start_day, yearly_end_month, yearly_end_day, weekly_anchor_date, weekdays, start_date, end_date; 3 índices |
| 27 | `00000000000032_create_ine_ocr_module` | `electoral_states`, `electoral_districts`, `sections`, `leaders`, `upload_records`, `stored_files`, `ine_ocr_jobs`, `ocr_extractions`, `promovidos` | `electoral_districts`, `sections`, `leaders`, `upload_records`, `stored_files`, `ine_ocr_jobs`, `ocr_extractions`, `promovidos` | — | tipo+: ine_asset_side, ine_upload_status, ine_ocr_job_status; 21 índices |
| 28 | `00000000000033_add_stored_file_location_metadata` | — | `stored_files` | — | columna: storage_drive_id, storage_folder_id |
| 29 | `00000000000034_make_stored_file_location_optional` | — | `stored_files` | — | columna: storage_path, storage_drive_id |
| 30 | `00000000000035_promovidos_admin_indexes` | — | `promovidos` | — | columna: is_active, voter_key_fingerprint, curp_fingerprint, phone_fingerprint, name_search_tokens, upload_record_id; 5 índices |
| 31 | `20260714120000_add_user_invitations` | `user_invitations` | `user_invitations` | — | tipo+: user_invitation_status; 3 índices |
| 32 | `20260716120000_add_uuid_database_defaults` | — | `users`, `roles`, `user_roles`, `permissions`, `departments`, `neighborhoods`, `citizens`, `conversations`, `messages`, `attachments`, `tags`, `citizen_tags`, `audit_logs`, `inbox_events`, `outbox_events`, `webhook_event_logs`, `events`, `event_registrations`, `event_checkins`, `assignments`, `communication_lines`, `ai_agents`, `ai_topics`, `ai_prompts`, `ai_tools`, `ai_topic_tools`, `ai_agent_topics`, `conversation_meta`, `message_statuses`, `ai_runs`, `ai_tool_calls`, `tickets`, `ticket_messages`, `newsletter_subscribers`, `realtime_outbox_events`, `user_invitations`, `department_schedules`, `department_schedule_intervals`, `department_schedule_exceptions`, `department_exception_intervals` | — | columna: id; extensión: pgcrypto |
| 33 | `20260722120000_add_permission_management` | — | `permissions` | — | columna: is_active, is_system; DML/backfill; 2 índices |
| 34 | `20260817140000_promovidos_crm_neighborhood_matching` | — | `citizens`, `neighborhoods` | — | columna: phone, voter_key_fingerprint, curp_fingerprint, section_id, match_key, name_lower; extensión: unaccent, pg_trgm; DML/backfill; 7 índices |
| 35 | `20260818164723_add_precampaign_goals` | `precampaign_goals` | — | — | tipo+: goal_type; 1 índices |
| 36 | `20260818200000_add_leader_profile_fields` | — | `leaders` | — | tipo+: leader_role; columna: neighborhood_id, phone, email, promovido_quota, role; 1 índices |
| 37 | `20260818213000_scope_precampaign_goals` | — | `precampaign_goals` | — | tipo+: goal_scope, goal_cadence; tipo−: goal_type; columna: scope, cadence, section_id, leader_id, type; DML/backfill; 3 índices |
| 38 | `20260819120000_add_messaging_queue_leases` | — | `inbox_events`, `outbox_events` | — | columna: locked_at, locked_by |
| 39 | `20260822120000_add_geo_fields_to_neighborhoods` | — | `neighborhoods` | — | columna: postal_code, municipality, state, state_code, description; DML/backfill; 3 índices |
| 40 | `20260822130000_neighborhood_match_key_municipality_unique` | — | — | — | 2 índices |
| 41 | `20260822200000_promovidos_sex_blind_index` | — | `promovidos` | — | columna: sex_blind_index; 1 índices |
| 42 | `20260822210000_add_password_resets` | `password_resets` | `password_resets` | — | 3 índices |
| 43 | `20260901090000_add_coordinators_hierarchy` | `coordinators`, `coordinator_backfill_map`, `coordinator_backfill_issues` | `coordinators`, `leaders`, `coordinator_backfill_map` | — | columna: coordinator_id, user_id; 8 índices |
| 44 | `20260901093000_coordinators_hierarchy_closeout` | — | `leaders` | `coordinator_backfill_issues`, `coordinator_backfill_map` | tipo+: leader_role; tipo−: leader_role_old; columna: role, coordinator_id |
| 45 | `20260906000000_add_export_jobs` | `export_jobs` | — | — | tipo+: export_module, export_job_status; 3 índices |
| 46 | `20260906000001_add_export_download_token` | — | `export_jobs` | — | columna: download_token_hash, download_token_expires_at, download_token_consumed_at |
| 47 | `20260906060000_add_event_neighborhood` | — | `events` | — | columna: neighborhood |
| 48 | `20260911200000_add_section_ops_and_structures` | `organizational_structures` | `sections`, `coordinators` | — | columna: numero_casillas, votos_por_casilla, lista_nominal, votos_necesarios, structure_id; 3 índices |
| 49 | `20260912180000_alter_organizational_structures_add_color_and_manager` | — | `organizational_structures` | — | columna: color, nombre_encargado, apellidos_encargado, telefono_encargado |
| 50 | `20260916120000_redis_free_models` | `rate_limit_counters`, `identity_lockouts` | `conversation_meta` | — | columna: fsm_lock_token, fsm_locked_at; 3 índices |
| 51 | `20260916130000_refresh_sessions_idempotency` | `refresh_sessions` | `refresh_sessions`, `messages` | — | columna: idempotency_key; 4 índices |
| 52 | `20260918232300_add_queue_fsm_indexes` | — | — | — | 2 índices |
| 53 | `20260921050907_add_message_send_by` | — | `messages` | — | columna: send_by_user_id; DML/backfill; 1 índices |
| 54 | `20260921120000_add_handoff_kind` | — | `conversation_meta` | — | columna: handoff_kind |
| 55 | `20260922090000_add_message_batch_windows` | `batch_windows`, `batch_window_claims` | — | — | 3 índices |
| 56 | `20260924000000_add_conversation_reads` | `conversation_reads` | `conversation_reads` | — | 1 índices |
| 57 | `20261007000000_add_conversation_is_canonical` | — | `conversations` | — | columna: is_canonical; DML/backfill; 1 índices |
| 58 | `20261009000000_add_notifications` | `notifications` | — | — | 2 índices |
| 59 | `20261010000000_add_attendance_mode` | — | `conversations` | — | tipo+: attendance_mode; columna: attendance_mode, bot_enabled; DML/backfill; 1 índices |
| 60 | `20261010120000_add_ticket_folio_and_message_ticket` | — | `tickets`, `messages`, `conversations` | — | columna: folio, ticket_id, active_ticket_id; DML/backfill; 3 índices |
| 61 | `20261010130000_add_user_notification_preferences` | `user_notification_preferences` | `user_notification_preferences` | — | 2 índices |
| 62 | `20261011000000_add_conversation_transfer_audit` | — | `conversations` | — | columna: transferred_at, transferred_by, transfer_reason; 1 índices |
| 63 | `20261013170000_realtime_ingress` | — | `inbox_events`, `conversations`, `notifications` | — | columna: ingested_at, message_id, correlation_id, realtime_version, ticket_id, batch_generation; 3 índices |
| 64 | `20261014000000_template_management` | `template_status_events`, `managed_templates` | — | — | 2 índices |
| 65 | `20261014060000_whatsapp_campaigns` | `campaigns`, `campaign_recipients` | `campaigns`, `campaign_recipients` | — | tipo+: CampaignStatus, CampaignMessageStatus, CampaignDispatchState; 7 índices |
| 66 | `20261014080000_campaign_attachments` | `campaign_attachments` | — | — | 3 índices |
| 67 | `20261014170000_conversation_bulk_jobs` | `conversation_bulk_jobs`, `conversation_bulk_items` | — | — | 3 índices |
| 68 | `20261018000000_message_history_media` | — | — | — | 3 índices |
| 69 | `20261018000000_message_media_history` | — | `attachments`, `notifications` | — | columna: communication_line_id, checksum_md5, provider_media_id, provider_phone_number_id, processing_state, drive_file_id, drive_folder_id, checksum_sha256, attempts, next_attempt_at, locked_at, last_error_code, stored_at; 3 índices |
| 70 | `20261019000000_add_user_phone` | — | `users` | — | columna: phone |
| 71 | `20261023180000_gcs_object_paths` | — | `export_jobs`, `campaign_attachments` | — | columna: file_path, file_id, folder_id |
| 72 | `20261102000000_conversation_line_scope` | — | `conversations` | — | columna: communication_line_id; trigger: conversation_meta_line_scope; función: sync_conversation_line_scope; DML/backfill; 2 índices |
| 73 | `20261104000000_attachment_provider_media_index` | — | — | — | 1 índices |
| 74 | `20261105000000_conversation_meta_insert_scope` | — | — | — | DML/backfill |
| 75 | `20261109000000_event_visibility` | `event_internal_details` | `events` | — | tipo+: event_visibility; columna: visibility; trigger: trg_event_internal_details_visibility; 2 índices |
| 76 | `20261109010000_event_visibility_private` | — | — | `event_internal_details` | restricciones/ajustes |
| 77 | `20261109120000_tickets_pagination_indexes` | — | — | — | 4 índices |
| 78 | `20261123000000_remove_campaign_modules` | — | `export_jobs`, `neighborhoods` | `precampaign_goals`, `promovidos`, `ocr_extractions`, `ine_ocr_jobs`, `stored_files`, `upload_records`, `leaders`, `coordinators`, `organizational_structures`, `sections`, `electoral_districts`, `electoral_states` | tipo+: export_module_new; tipo−: export_module, goal_scope, goal_cadence, ine_asset_side, ine_upload_status, ine_ocr_job_status, leader_role; columna: module, section_id; DML/backfill; 1 índices |

**Lectura del inventario:** `ALTER TABLE` incluye claves foráneas, cambios de columna, defaults y restricciones; la lista de columnas se resume en “Otros efectos” cuando la instrucción es explícita. Las definiciones finales de tipos, defaults, claves, índices y FK se enumeran por tabla en `DATABASE_SCHEMA.md`. La tabla no infiere que todo `ALTER` cambie datos.

## Clasificación de objetos

- **CONSOLIDAR:** 43 tablas actuales con cambios directos en más de una migración.
- **CONSERVAR:** 15 tablas actuales sin modificaciones directas posteriores a su creación.
- **ELIMINAR de la línea base nueva:** 15 tablas transitorias ya ausentes del esquema final: `coordinator_backfill_issues`, `coordinator_backfill_map`, `coordinators`, `electoral_districts`, `electoral_states`, `event_internal_details`, `ine_ocr_jobs`, `leaders`, `ocr_extractions`, `organizational_structures`, `precampaign_goals`, `promovidos`, `sections`, `stored_files`, `upload_records`. No equivale a ejecutar `DROP` sobre una base existente.
- **REVISAR en migraciones futuras:** ninguna tabla actual propuesta para eliminación; las extensiones e índices efectivos se conservaron y se alineó el metadato Prisma de los índices representables. Los 48 defaults SQL que Prisma propone retirar permanecen en PostgreSQL y requieren revisar el SQL generado antes de aplicarlo.

La evidencia principal para conservar las 58 tablas es su presencia tanto en el catálogo PostgreSQL aplicado como en `schema.prisma` (58 modelos `@@map`). La evidencia de uso adicional está en rutas, servicios y workers activos. Las tablas de campaña WhatsApp (`campaigns`, `campaign_recipients`, `campaign_attachments`) se usan en `backend/src/routes/campaigns.routes.ts`, `backend/src/services/campaigns/` y `backend/src/worker.ts`; no pertenecen a los módulos electorales retirados.

## Módulos y dependencias verificadas

| Área | Estado | Evidencia de uso o retiro |
|---|---|---|
| Identidad, usuarios y RBAC | Activa | `backend/src/routes/index.ts` monta `auth`, `users` y `roles-permissions`; `backend/prisma/seed/core/{roles,permissions,role-permissions}.seed.ts` prepara el catálogo. |
| Ciudadanos, barrios y etiquetas | Activa | `backend/src/routes/index.ts` monta `citizens`, `neighborhoods` y `tags`; `backend/src/repositories/{citizen,neighborhood,tag}.repository.ts` consulta modelos persistentes. |
| Conversaciones, tickets, mensajería y realtime | Activa | `backend/src/routes/index.ts` monta `conversations`, `messages`, `tickets`, `webhook`; `backend/src/services/events/{inbox-processor,outbox-processor}.service.ts` usa SQL directo; `backend/src/worker.ts` procesa colas. |
| Campañas WhatsApp, plantillas y operaciones masivas | Activa | `backend/src/routes/campaigns.routes.ts`, `backend/src/services/campaigns/`, `backend/src/services/bulk/`, `frontend/app/(admin)/admin/campanas/` y el worker usan tablas propias. |
| Eventos y departamentos | Activa | `backend/src/routes/index.ts` monta `events` y `departments`; repositorios y seed core respaldan estas tablas. |
| IA y líneas de comunicación | Activa | `backend/src/routes/index.ts` monta `admin-ai` y `ai-agents`; `backend/prisma/seed/dev/ai-module.seed.ts` aporta datos de demostración. |
| Módulos electorales de precampaña, estructuras, coordinadores, líderes, promovidos y OCR INE | Retirados | `odd/tasks/remove-campaign-modules.md` documenta la eliminación vertical; `20261123000000_remove_campaign_modules/migration.sql` elimina sus tablas y permisos; ninguna de esas tablas figura en el catálogo final ni en `schema.prisma`. Los nombres de rol `COORDINADOR` y `LIDER` permanecen por funciones actuales de WhatsApp/eventos. |

No se infiere obsolescencia de la ausencia de una búsqueda textual: para las tablas retiradas se comprobó la migración final, el catálogo aplicado, el modelo Prisma y el registro de rutas. No se pudieron verificar consumidores externos fuera del repositorio.

## Seeders y mecanismos de inicialización

| Archivo | Datos/orden | Decisión propuesta | Riesgo o condición |
|---|---|---|---|
| `backend/prisma/seed/core/neighborhoods.seed.ts` | barrios; primero | **conservar y revisar** | datos de referencia, consistencia de match_key/municipality |
| `backend/prisma/seed/core/roles.seed.ts` | roles; segundo | **conservar** | COORDINADOR y LIDER siguen siendo roles vigentes aunque sus antiguos módulos se retiraron |
| `backend/prisma/seed/core/permissions.seed.ts` | catálogo permisos; tercero | **conservar y revisar** | verificar permisos de módulos activos contra rutas |
| `backend/prisma/seed/core/role-permissions.seed.ts` | asignaciones RBAC; cuarto | **conservar y revisar** | depende de roles y permisos |
| `backend/prisma/seed/core/departments.seed.ts` | departamentos/horarios; quinto | **conservar, corregido** | la versión histórica recreaba intervalos; la fase 2 preserva IDs estables y se verificó en dos ejecuciones |
| `backend/prisma/seed/dev/superadmin.seed.ts` | usuario de desarrollo | **conservar** | requiere SUPERADMIN_PASSWORD externo |
| `backend/prisma/seed/dev/ai-module.seed.ts` | agente, prompts, herramientas, línea | **conservar y revisar** | UUID fijos solo para demo; no core |
| `backend/prisma/seed/test/fixtures.seed.ts` | fixtures de test | **eliminado** | no creaba datos ni tenía consumidores de pruebas; se retiraron el archivo y su comando |
| `backend/prisma/seed/index.ts` | orquestación core → dev → test | **conservar** | production guard; `dev` solo no ejecuta core |

No hay seeder de los módulos electorales retirados en `backend/prisma/seed`. `20261123000000_remove_campaign_modules` ejecuta DML para borrar permisos/RBAC y jobs de exportación heredados: ese DML no debe copiarse a una base nueva vacía; los datos esenciales de roles y permisos los gobiernan los seeders core. `backend/scripts/migrations/` contiene backfills/manuales fuera de Prisma; `backfill-campaign-recipient-phones.ts` corresponde a las campañas WhatsApp activas. Estos scripts no se deben ejecutar durante la reconstrucción vacía sin revisar su propósito individual.

Roles, permisos y su matriz son datos de arranque necesarios para RBAC. Barrios y departamentos son catálogos operativos core, aunque sus registros concretos son configurables. Superadmin y el módulo IA son datos de desarrollo; el último usa UUID y un teléfono de ejemplo fijos, y secretos solo desde variables de entorno. El antiguo seeder de pruebas no contenía fixtures y se retiró. `seedRolePermissions` usa `skipDuplicates` y no retira asignaciones antiguas, lo cual no afecta una base nueva, pero sí limita su uso como reconciliación de una base existente. `seedSuperadmin` usa un correo predeterminado y exige contraseña por entorno; no hay contraseña literal incorporada.

## Problemas y límites

- La documentación de migraciones en `backend/prisma/docs/` quedó atrasada respecto de las 78 carpetas reales.
- El `migrate diff` inicial proponía retirar defaults de UUID y `updated_at`, además de índices trigram/zone. La fase 2 alineó esos índices en Prisma; siguen pendientes 48 sugerencias de retirar defaults, que no se aplicaron.
- `conversation_bulk_items` tenía una FK inline con nombre y acción de actualización distintos de la representación Prisma. La fase 2 alineó el metadato Prisma sin cambiar la FK efectiva.
- El historial contiene estructuras electorales creadas y eliminadas, más backfills/DELETE que no pertenecen a una línea base vacía.
- La verificación ejecutó migraciones, no seeders ni workflows de aplicación; la compatibilidad de datos core y dev se confirma en implementación.
- No se auditó una base compartida o de producción. La clasificación es válida para el HEAD y su cadena de migraciones, no para consumidores externos no visibles.

## Resultado de la fase 2

Las 78 migraciones históricas fueron sustituidas por 60 migraciones de línea base. Se preservaron las 58 tablas actuales, 38 enums y demás objetos verificados. El catálogo de PostgreSQL 16 histórico y el nuevo coinciden; las pruebas de trigger, índices parciales, campañas WhatsApp y seeder core se registran en [`DATABASE_SCHEMA_COMPARISON.md`](DATABASE_SCHEMA_COMPARISON.md) y [`DATABASE_VALIDATION.md`](DATABASE_VALIDATION.md). El inventario cronológico anterior permanece aquí como evidencia del commit de referencia.
