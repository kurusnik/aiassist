-- Sprint 9.5 — Production Storage Completion
-- Adds: durable queue, idempotency keys, approval request_by field

-- Durable workflow queue
CREATE TABLE IF NOT EXISTS workflow_queue (
  id SERIAL PRIMARY KEY,
  workflow_id UUID NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  worker_id VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  dequeued_at TIMESTAMPTZ,
  CONSTRAINT uq_workflow_queue_workflow UNIQUE (workflow_id)
);

CREATE INDEX IF NOT EXISTS idx_workflow_queue_status
  ON workflow_queue(status, created_at);

-- Idempotency keys for API-level deduplication
CREATE TABLE IF NOT EXISTS workflow_idempotency_keys (
  key VARCHAR(255) PRIMARY KEY,
  workflow_id UUID REFERENCES workflow_instances(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_idempotency_keys_expires
  ON workflow_idempotency_keys(expires_at);

-- Add requested_by to workflow_approvals (nullable, was missing)
ALTER TABLE workflow_approvals ADD COLUMN IF NOT EXISTS requested_by VARCHAR(255);