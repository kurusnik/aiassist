-- Sprint 8.5 — Production Reliability Audit
-- Transaction boundaries, heartbeat, lease, event sequence, cleanup

-- Add sequence column to workflow_events for deterministic ordering
ALTER TABLE workflow_events ADD COLUMN IF NOT EXISTS sequence BIGINT NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_workflow_events_workflow_sequence
  ON workflow_events(workflow_id, sequence);

-- Add retention column for workflow cleanup
ALTER TABLE workflow_instances ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_workflow_instances_expires_at
  ON workflow_instances(expires_at);

-- Workflow heartbeat — worker keeps alive while executing
CREATE TABLE IF NOT EXISTS workflow_heartbeats (
  workflow_id UUID PRIMARY KEY REFERENCES workflow_instances(id) ON DELETE CASCADE,
  worker_id VARCHAR(255) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'running',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_heartbeat TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_workflow_heartbeats_worker
  ON workflow_heartbeats(worker_id);

CREATE INDEX IF NOT EXISTS idx_workflow_heartbeats_expires
  ON workflow_heartbeats(expires_at);

-- Workflow leases — distributed worker lease for exclusive execution
CREATE TABLE IF NOT EXISTS workflow_leases (
  workflow_id UUID PRIMARY KEY REFERENCES workflow_instances(id) ON DELETE CASCADE,
  worker_id VARCHAR(255) NOT NULL,
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  lease_version INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_workflow_leases_expires
  ON workflow_leases(expires_at);

CREATE INDEX IF NOT EXISTS idx_workflow_leases_worker
  ON workflow_leases(worker_id);

-- Add version-based optimistic lock to workflow_nodes
ALTER TABLE workflow_nodes ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

-- Composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_workflow_nodes_status
  ON workflow_nodes(workflow_id, status);

CREATE INDEX IF NOT EXISTS idx_audit_events_composite
  ON audit_events(workflow_id, action, timestamp);

CREATE INDEX IF NOT EXISTS idx_workflow_approvals_composite
  ON workflow_approvals(workflow_id, status);

-- Retention cleanup: remove expired workflow data
CREATE OR REPLACE FUNCTION cleanup_expired_workflows()
RETURNS INTEGER AS $$
DECLARE
  deleted INTEGER;
BEGIN
  DELETE FROM workflow_instances
  WHERE expires_at IS NOT NULL AND expires_at < NOW();
  GET DIAGNOSTICS deleted = ROW_COUNT;
  RETURN deleted;
END;
$$ LANGUAGE plpgsql;