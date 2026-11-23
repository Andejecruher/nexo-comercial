# Corrección realtime — implementación y operación

Los mensajes entrantes, el ticket activo, la notificación y el outbox realtime se guardan en una transacción corta antes del batching y de la IA. El publicador intenta entregar después del commit. Un fallo de Pub/Sub deja el evento durable para recovery; no invalida el webhook ya persistido. El Scheduler de cinco minutos permanece como reparación secundaria.

## Cambios

- Ingreso idempotente por `wamid`, con advisory lock por teléfono y reintento de la transacción completa en conflictos. Ticket creado y mensaje vinculado son consultables antes de avisar.
- Publicación postcommit para mensajes, lifecycle y respuestas IA; mensaje, vínculo al ticket y outbox de WhatsApp se guardan en la misma transacción. La respuesta conserva el ticket del mensaje que originó la ejecución aunque se abra otro caso durante la generación. Publicadores Pub/Sub reutilizados, batching de 5 ms y timeout RPC de 1 s sin fallback que pierda ordering.
- Relay independiente con ciclo de 250 ms, hasta cuatro publicaciones concurrentes, claims con token de propietario y lease de 30 s. Tras un fallo confirmado el primer reintento espera 1 s; tras muerte de un propietario puede esperar hasta 30 s. Los reintentos pueden duplicar entregas, por lo que el navegador conserva dedupe por `eventId`.
- Batching conserva `5000/30000`: `readyAt = min(última llegada + ventana, apertura + máximo)`, reloj DB, generaciones estables y membresía congelada. Una llegada posterior abre sucesor aunque el worker anterior todavía no haya empezado. Las generaciones esperan a sus predecesoras pendientes; la historia IA excluye fragmentos cuyo inbox todavía no se procesó. Las Tasks tempranas/claims activos producen retry, no éxito silencioso.
- Streaming IA acumula el último draft y publica como máximo una solicitud simultánea, sin una cadena creciente de promesas por token.
- Frontend: campana y toast comparten política; navegación con ticket real; listas reaccionan a eventos; ACK de room, referencias compartidas y refetch tras join; dedupe persiste al reconectar y se limpia al cambiar usuario. Los mensajes incluyen el ticket real y el detalle histórico ignora mensajes de otros casos; payloads antiguos se reparan por REST. Versiones por conversación evitan aplicar patches anteriores; snapshots REST conservan mensajes live ausentes. Los patches de tickets actualizan todas las páginas cargadas y un snapshot anterior no descarta ni revierte esos cambios.
- Replay paginado con keyset `createdAt,id`, upper bound fijo y overlap de 60 s. El checkpoint es por usuario y solo avanza al completar todas las páginas; los avisos live no lo adelantan.
- Tasks separadas para IA, entrega WhatsApp y documentos; los avisos realtime no dependen de ellas. El push devuelve error reintentable cuando no tiene subscriber/gateway.

## Infraestructura preparada

El workflow aplica migraciones y despliega worker y relay antes de habilitar ingreso nuevo en API. El relay usa la imagen worker con `node dist/realtime-relay.js`, min 1/max 2 y CPU siempre asignada. API pasa a min 1 y timeout 3600 s para conexiones WebSocket; worker IA conserva min 0. API conserva concurrency 80, pool 5 y max 5; worker pool 2/max 5 y relay pool 2/max 2. Ambas palancas se mueven **juntas** y contra el techo real de la instancia: el máximo teórico de estos roles es 39 conexiones (más la conexión del job migrator = 40), y durante el rollout conviven revisión vieja y nueva, así que el pico transitorio es ~2×. Números, fórmula y techo de `db-g1-small` en [docs/CLOUD_SQL_CONNECTION.md](../CLOUD_SQL_CONNECTION.md) §3.

Hay coste recurrente adicional por API min 1 y por el relay con CPU permanente. El timeout de una conexión WebSocket continúa siendo finito; al reconectar, REST y replay reparan lo perdido. Las colas `<base>-ai`, `<base>-delivery`, `<base>-documents` se provisionan con `deploy-infrastructure.sh` o en el job de activación del workflow, que bloquea el despliegue API si no se crean/reanudan. El CI necesita permisos de administración de Cloud Tasks para crearlas. La creación de Tasks tiene timeout RPC de 1 s sin retries SDK; los registros durables y reconciliación recuperan fallos. Las colas separadas comparten el servicio worker: aíslan dispatch y backoff, pero la capacidad de CPU del worker sigue compartida.

## Rollout

1. Provisionar topics/subscriptions con ordering e IAM y las tres colas nuevas. Mantener el Scheduler existente. Aplicar migración aditiva `20261013170000_realtime_ingress`; no borrar datos ni reconstruir outboxes.
2. Drenar Tasks/batches en vuelo o pausar temporalmente dispatch mientras cambia el worker. Evitar mezclar workers antiguos (no entienden membresía congelada) con los nuevos. El ingreso persistido y los outboxes sobreviven a la pausa; reanudar colas tras actualizar workers.
3. Desplegar relay y comprobar `/ready`, progreso de pendientes, logs `relay.publish`, ausencia de dead letters y CPU fuera de requests. Desplegar API con `REALTIME_IMMEDIATE_PUBLISH_ENABLED=true`, `INBOUND_EAGER_INGESTION_ENABLED=true`, `REALTIME_DURABLE_ENABLED=true`; conservar `BATCHING_WINDOW_MS=5000`, `BATCHING_MAX_WAIT_MS=30000`.
4. Desplegar frontend. Medir primero una revisión/línea controlada, incluyendo inactividad, reconexión y carga simultánea IA/OCR. El workflow habilita ambas flags al desplegar API; no implementa un canary porcentual automático. Si se necesita gradual, usar revisiones/tráfico de Cloud Run y mantener el worker nuevo en todas ellas.
5. Correlacionar `webhook`, `outbox.write`, `outbox.commit`, `relay.publish`, `subscriber.handle`, `gateway.emit`, `browser.receive` y `browser.visible` con `eventId/correlationId`. Logs de métricas existen; dashboards/alertas de Cloud Monitoring requieren creación/configuración en el proyecto.
6. Evaluar los objetivos del plan (warm ingreso→aviso p95 500 ms/p99 1 s, receive→visible p95 100 ms y recovery transitorio p95 2 s). Son objetivos pendientes de medición en producción, no resultados demostrados por tests. Incluir fallos, backlog, duplicados y esperas DB.

Rollback funcional: deshabilitar publicación inmediata y/o ingreso anticipado mediante flags, conservando relay, worker nuevo, tablas y outbox. No volver al worker antiguo con generaciones activas nuevas. Deshabilitar ingreso anticipado recupera el camino anterior y su latencia ligada al batching/IA; deshabilitar publicación inmediata conserva recovery rápido por relay. Para volver a configuración de costes previa hay que editar además min instances/CPU/timeout y las comprobaciones del workflow.

## Validación local

Las pruebas usan una base PostgreSQL aislada y el emulador oficial de Pub/Sub; no modifican la base de la aplicación ni producción. Se valida rollback sin publicación, webhook concurrente sin duplicados, ticket real antes de IA, recovery durable, límite de 30 s, sucesores y retry de lotes sin mezclar fragmentos, y fencing de claims. Una prueba recorre ingreso → Pub/Sub → handler HTTP push → adapter → navegador conectado a una segunda réplica Socket.IO. CI arranca el emulador tanto en Jest como en el job PostgreSQL.

Resultados locales:

| Comprobación | Resultado |
| --- | --- |
| Suite completa backend | 147 suites, 1444 pruebas pasan; los cambios posteriores se comprobaron con las suites afectadas (41 de batching/IA/productores y 22 de tickets, incluida una prueba nueva de colisión) |
| Suite completa frontend | 83 suites, 550 pruebas pasan; una prueba adicional comprueba páginas de tickets y snapshots anteriores |
| PostgreSQL + Pub/Sub | 5 suites, 33 pruebas pasan, incluida la entrega entre dos réplicas |
| Lint backend y frontend | Pasan; se repitió sobre los archivos de los últimos ajustes |
| Tipos backend, tests y frontend | Pasan |
| Compilaciones backend y frontend | Pasan |
| Infraestructura | YAML, dependencias de jobs, sintaxis de shell, `docker compose config -q` y `git diff --check` pasan |

Las suites completas se ejecutaron secuencialmente en este entorno de 2 CPU/8 GiB: Jest con `--runInBand --testTimeout=30000`, Vitest con dos threads y `--testTimeout=20000`. Lint backend usa `NODE_OPTIONS=--max-old-space-size=6144`, como su script del repositorio. La integración usa `pnpm --dir backend test:postgres`, una base aislada con todas las migraciones aplicadas y `PUBSUB_EMULATOR_HOST`. Un timeout inicial de la integración entre réplicas coincidió con compilaciones concurrentes; la repetición sin ellas pasa. También se corrigió una colisión real de folio al cerrar y abrir un caso dentro del mismo segundo: se omiten candidatos ocupados antes del INSERT, conservando la restricción única y el reintento de la transacción completa para carreras.

No se ha desplegado en GCP ni medido SLO real desde este entorno.
