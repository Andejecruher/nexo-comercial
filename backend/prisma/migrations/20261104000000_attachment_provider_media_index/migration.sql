-- Lookup by Meta media ID backs the GCS read-through fallback of the local
-- media cache. Without this index every cache miss scans `attachments`.
CREATE INDEX "attachments_provider_media_id_idx" ON "attachments"("provider_media_id");
