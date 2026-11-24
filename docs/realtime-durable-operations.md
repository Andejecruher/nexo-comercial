# Realtime Durable Operations Guide

This document describes operational behavior for the durable realtime pipeline introduced by `realtime-durable-integration`.

## Architecture (text diagram)

```text
Domain service transaction
  -> RealtimeNotifier.notifyCritical(tx, event)
  -> realtime_outbox_events (status=pending)
  -> RealtimeOutboxRelay (claim/publish/retry/dead-letter)
  -> Pub/Sub topic: realtime-events (ordering per conversationId)
  -> Push subscription HTTP (POST /pubsub/realtime)
  -> RealtimeApiSubscriber (validate/dedupe)
  -> WebsocketGatewayService.emitRealtimeEvent(...)
  -> Frontend RealtimeManager/EventRouter/hooks
```

## Event classification

| Class                   | Delivery path                                     | Examples                                                                                              |
| ----------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Critical (durable)      | Outbox -> relay -> Pub/Sub topic `realtime-events` -> push subscription -> subscriber -> gateway | `message.created`, `conversation.updated`, `conversation.handover`, admin-notification-worthy updates |
| Ephemeral (non-durable) | Direct Pub/Sub publish (topic `ai-stream`) -> gateway                                        | `conversation.typing`, `conversation.ai.chunk`, `conversation.ai.done`, transient lifecycle events    |

## Runtime modes

| Mode      | API process          | Worker process        | Critical behavior                                                   |
| --------- | -------------------- | --------------------- | ------------------------------------------------------------------- |
| Separated | Subscriber + gateway | Relay polling cycle   | Worker writes outbox, API emits websocket                           |
| Embedded  | Subscriber + gateway | Relay in same process | Same durable contract/path, no process-local correctness dependency |

## Observability reference

### Structured boundaries

- `outbox.write` (notifier)
- `relay.claim`, `relay.publish` (relay)
- `publish` (Pub/Sub transport); push delivery arrives via `POST /pubsub/realtime`
- `subscriber.receive`, `subscriber.emit`, `subscriber.dedupe`
- `gateway.emit`
- Frontend logs: `RealtimeManager` receive/dispatched/deduped/invalid and hook fallback refetch warnings.

### Metrics hooks

- Counters: `outbox_written`, `relay_published`, `relay_failed`, `relay_dead_lettered`, `subscriber_received`, `subscriber_emitted`, `subscriber_deduped`
- Gauges: `outbox_pending_count`, `outbox_oldest_pending_age_seconds`
- Histogram: `relay_latency_ms`

Current implementation uses lightweight metric hooks (structured logs), keeping infra dependencies optional.

Metrics, relay claims, and successful Pub/Sub transport publishes use the `debug` level. With the default `LOG_LEVEL=info`, the worker keeps only durable writes, final publish outcomes, lifecycle events, degradations, and failures. Set `LOG_LEVEL=debug` temporarily for pipeline diagnostics.

Gauges are also deduplicated in the log adapter: an unchanged `name + labels + value` is silent until it changes or `REALTIME_GAUGE_HEARTBEAT_MS` (30s) elapses. At `debug`, counters and histograms emit on every observation. The outbox relay poll interval is unchanged.

### Worker log policy

- Idle polling is silent at `info`.
- A business operation should produce one final outcome log rather than one log per internal hop.
- Fallback warnings from Postgres queue polling (`inbox_events`/`outbox_events`) are rate-limited to one per minute per failure boundary.
- Logs may contain internal IDs and correlation IDs, but never OCR documents, parsed INE fields, phone numbers, WhatsApp message bodies, citizen records, or complete environment dumps.
- `LOG_LEVEL` accepts `debug`, `info`, `warn`, or `error` and defaults to `info`.

## Rollback procedure (`REALTIME_DURABLE_ENABLED=false`)

1. Confirm outbox backlog:
   ```sql
   SELECT status, COUNT(*)
   FROM realtime_outbox_events
   GROUP BY status
   ORDER BY status;
   ```
2. Drain relay backlog before disabling durable mode:
   - Keep worker relay running until `pending` and `failed` are `0`, or
   - Explicitly dead-letter blocked records after incident review.
3. Toggle runtime flag:
   - Set `REALTIME_DURABLE_ENABLED=false` in API and worker environments.
   - Restart API + worker.
4. Validate fallback behavior:
   - Critical producers route through legacy EventBus bridge (enabled automatically when durable mode is off).
   - Typing/AI stream ephemeral events continue working.
5. **Do not drop `realtime_outbox_events` table** until confirmed empty and no recovery need remains.

## Troubleshooting

### Pending backlog grows

- Verify worker process is running and `WORKERS_ENABLED=true`.
- Check relay logs (`relay.claim`, `relay.publish`) for repeated failures.
- Inspect Pub/Sub publish errors (topic availability/ordering, credentials, push subscription delivery).

### Dead-letter growth

- Query dead-letter rows and inspect `last_error`:
  ```sql
  SELECT id, event_type, attempts, last_error, updated_at
  FROM realtime_outbox_events
  WHERE status = 'dead_lettered'
  ORDER BY updated_at DESC
  LIMIT 100;
  ```
- Replay/requeue only after root-cause analysis.

### Stale `publishing` rows

- Relay now reclaims stale `publishing` rows after lock timeout.
- If rows remain stuck, inspect `locked_at`, `locked_by`, and instance health.

## Known warnings

- Verification status prior to Phase 6: `PASS WITH WARNINGS`.
- Historical warning remains about complete RED capture evidence in one previous Phase 5 remediation row.
- DB-backed rollback drill is still recommended as an operational follow-up in staging before production disable/drop procedures.

## End-to-end observability and alerts

Every stage of the delivery chain is covered by a log-based metric (INFO-level
`metrics.*` entries from `RealtimeMetrics` in Cloud Logging). Labels always
include `eventType`, so per-event-type filtering (e.g. only `ticket.closed`)
works for every metric below.

| Chain stage | Metric | Component | Notes |
| --- | --- | --- | --- |
| Emitted | `outbox_written` | `RealtimeNotifier.notifyCritical` | Every durable write to `realtime_outbox_events` |
| Relayed | `relay_published` / `relay_failed` / `relay_dead_lettered` | `RealtimeOutboxRelay` | Plus `relay_latency_ms` histogram |
| Backlog | `outbox_pending_count` / `outbox_oldest_pending_age_seconds` | `RealtimeOutboxRelay` | Gauges, updated each cycle |
| Subscriber received | `subscriber_received` / `subscriber_deduped` / `subscriber_discarded` | `RealtimeApiSubscriber` | API-side Pub/Sub push |
| Subscriber emitted | `subscriber_emitted` | `RealtimeApiSubscriber` | Before gateway emit |
| WS delivered (attempt) | `gateway_emit` / `gateway_discarded` | `WebsocketGatewayService.emitRealtimeEvent` | Plus `gateway_emit_latency_ms`, `socket_subscribe_denied` |
| Frontend received | `fe_realtime_event` (`status=received`) | `POST /api/v1/realtime/telemetry` | Beacon from admin frontend (see below) |
| Frontend applied | `fe_realtime_event` (`status=applied`) | `POST /api/v1/realtime/telemetry` | Fired by `useConversationThread` / `useTicketDetail` on successful patch |

### Frontend telemetry beacon

- Endpoint: `POST /api/v1/realtime/telemetry` (JWT auth, tiny body, returns 204).
- Sent fire-and-forget by `frontend/lib/shared/realtime/telemetry.ts`; deduped per
  `eventId|status` within a browser session.
- Enabled by default; disable with `NEXT_PUBLIC_REALTIME_TELEMETRY=false`.
- Only ticket lifecycle events are reported: `eventType` in
  `ticket.created`, `ticket.closed`, `conversation.handover`, or
  `action` in `close`/`transfer`.
- `received` fires at the `RealtimeManager` socket ingress; `applied` fires at
  the conversation/ticket detail hooks after `tryApplyRealtimePatch` succeeds.

### Suggested log-based metrics and alerts

Create these log-based metrics in the GCP console from Cloud Logging
(`metrics.*` entries, filter by `component`/`boundary`/labels), then attach
alerting policies:

1. `realtime/relay_failure_rate` — from `relay_failed` + `relay_dead_lettered`
   entries. Alert if rate > 0 for 5 min during an incident window, or if any
   `dead_lettered` appears (needs manual replay decision).
2. `realtime/outbox_backlog_age` — from `metrics.gauge`
   (`name=outbox_oldest_pending_age_seconds`). Alert when > 300 s sustained
   for 10 min (relay or Pub/Sub publishing stalled).
3. `realtime/subscriber_gap` — compare `outbox_written` vs `subscriber_emitted`
   per eventType over a sliding window. Alert when gap > `X` events in 10 min
   (event lost between outbox and WS).
4. `realtime/fe_delivery_health` — from `fe_realtime_event`
   (`status=received`). Compare against `gateway_emit` for the same eventType.
   Alert when `received` traffic drops > 50% vs `gateway_emit` over 15 min
   (clients stopped receiving — socket/auth/room regression).
5. `realtime/fe_applied_rate` — from `fe_realtime_event`
   (`status=applied`). Alert when `applied` drops below a floor while
   `received` stays healthy (patch application failing client-side).
6. `realtime/startup_hazard` — from `realtimeStartupHazards` logs; alert on new
   `legacy_eventbus_bridge_mute` hazard so a misconfigured deployment is caught
   before it goes silent.
