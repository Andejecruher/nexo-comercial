-- Read-only historical review. Run only on an approved database/snapshot.
-- No message text, phone numbers, tokens or attachment bytes are selected.
BEGIN TRANSACTION READ ONLY;
WITH evidence AS (
  SELECT c.id AS conversation_id, c.is_canonical,
         cm.communication_line_id AS current_line_id, m.id AS message_id,
         NULLIF(m.meta->>'lineId', '') AS message_line_id,
         COALESCE(NULLIF(i.payload->>'phoneNumberId', ''),
                  NULLIF(m.meta->'media'->>'phoneNumberId', '')) AS provider_line_id
  FROM conversations c
  LEFT JOIN conversation_meta cm ON cm.conversation_id = c.id
  JOIN messages m ON m.conversation_id = c.id
  LEFT JOIN inbox_events i ON i.message_id = m.id OR i.wamid = m.external_message_id
)
SELECT conversation_id, is_canonical, current_line_id,
       count(DISTINCT message_id) AS messages,
       array_agg(DISTINCT message_line_id) FILTER (WHERE message_line_id IS NOT NULL) AS recorded_line_ids,
       array_agg(DISTINCT provider_line_id) FILTER (WHERE provider_line_id IS NOT NULL) AS provider_line_ids,
       count(DISTINCT message_id) FILTER (
         WHERE message_line_id IS NULL AND provider_line_id IS NULL
       ) AS messages_without_line_evidence
FROM evidence
GROUP BY conversation_id, is_canonical, current_line_id
HAVING count(DISTINCT message_line_id) > 1
    OR count(DISTINCT provider_line_id) > 1
    OR bool_or(message_line_id IS NOT NULL AND message_line_id IS DISTINCT FROM current_line_id::text)
    OR current_line_id IS NULL
    OR NOT is_canonical
ORDER BY conversation_id;
COMMIT;
